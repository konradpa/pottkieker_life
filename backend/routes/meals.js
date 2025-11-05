const express = require('express');
const router = express.Router();
const db = require('../database');
const {
  getTodaysMeals,
  MENSA_LOCATIONS,
  simplifyNotes,
  fetchOpeningTimes,
  getBerlinDate,
  isBerlinWeekend
} = require('../utils/mensaParser');
const { upsertMeals } = require('../utils/mealStorage');

/**
 * GET /api/meals/today
 * Get today's meals with vote counts
 * Optional query param: ?location=studierendenhaus
 */
router.get('/today', async (req, res) => {
  const { location } = req.query;
  const locationKeys = Object.keys(MENSA_LOCATIONS);
  const isAllLocations = location === 'all';
  const today = getBerlinDate();
  const resolvedLocation = isAllLocations
    ? 'all'
    : (location && MENSA_LOCATIONS[location] ? location : 'studierendenhaus');

  if (isBerlinWeekend()) {
    return res.json({
      meals: [],
      location: resolvedLocation,
      date: today,
      message: 'Enjoy your weekend :)'
    });
  }

  try {
    // Fetch fresh meal data from Mensa source
    let meals;
    if (isAllLocations) {
      meals = [];
      for (const loc of locationKeys) {
        const locationMeals = await getTodaysMeals(loc);
        meals.push(...locationMeals);
      }
    } else {
      meals = await getTodaysMeals(resolvedLocation);
    }

    if (meals.length > 0) {
      await upsertMeals(meals);
    }

    // Get meals with vote counts from database (use actual meal date, not today)
    const distinctDates = [...new Set(meals.map(meal => meal.date))].filter(Boolean);
    const fallbackDates = distinctDates.length > 0 ? distinctDates : [today];
    const datePlaceholders = fallbackDates
      .map(() => '?')
      .join(', ');

    const params = [...fallbackDates];

    let locationFilter = '';
    if (!isAllLocations && resolvedLocation !== 'all') {
      locationFilter = 'AND mensa_location = ?';
      params.push(resolvedLocation);
    }

    const query = `
      SELECT
        m.*,
        COALESCE(v.upvotes, 0) as upvotes,
        COALESCE(v.downvotes, 0) as downvotes,
        COALESCE(p.big_portions, 0) as big_portions,
        COALESCE(p.small_portions, 0) as small_portions,
        COALESCE(c.comment_count, 0) as comment_count,
        COALESCE(ph.photo_count, 0) as photo_count,
        ph.photo_thumbnails
      FROM meals m
      LEFT JOIN (
        SELECT
          meal_id,
          SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
          SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
        FROM votes
        GROUP BY meal_id
      ) v ON m.id = v.meal_id
      LEFT JOIN (
        SELECT
          meal_id,
          SUM(CASE WHEN portion_size = 'big' THEN 1 ELSE 0 END) as big_portions,
          SUM(CASE WHEN portion_size = 'small' THEN 1 ELSE 0 END) as small_portions
        FROM portion_votes
        GROUP BY meal_id
      ) p ON m.id = p.meal_id
      LEFT JOIN (
        SELECT
          meal_id,
          COUNT(*) as comment_count
        FROM comments
        GROUP BY meal_id
      ) c ON m.id = c.meal_id
      LEFT JOIN (
        SELECT
          meal_id,
          COUNT(*) as photo_count,
          GROUP_CONCAT(photo_path, '||') as photo_thumbnails
        FROM (
          SELECT
            fp.meal_id,
            fp.photo_path,
            ROW_NUMBER() OVER (PARTITION BY fp.meal_id ORDER BY fp.created_at DESC) as rn
          FROM food_photos fp
          WHERE DATE(fp.upload_date) = DATE('now')
        ) ranked
        WHERE rn <= 3
        GROUP BY meal_id
      ) ph ON m.id = ph.meal_id
      WHERE m.date IN (${datePlaceholders}) ${locationFilter}
      ORDER BY m.mensa_location, m.category, m.name
    `;

    db.all(
      query,
      params,
      (err, rows) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to fetch meals' });
        }

        const normalizedMeals = (rows || []).map(row => {
          const normalizedString = row.notes ? String(row.notes).replace(/[|·]/g, ',') : '';
          const rawNotes = normalizedString
            ? normalizedString.split(/\s*,\s*/).map(part => part.trim()).filter(Boolean)
            : [];
          const filteredNotes = simplifyNotes(rawNotes);

          // Parse photo thumbnails
          const photoCount = Number(row.photo_count || 0);
          const photoThumbnails = row.photo_thumbnails
            ? row.photo_thumbnails.split('||').map(path => `/uploads/${path}`)
            : [];

          return {
            ...row,
            notes: filteredNotes.length > 0 ? filteredNotes.join(', ') : '',
            upvotes: Number(row.upvotes || 0),
            downvotes: Number(row.downvotes || 0),
            big_portions: Number(row.big_portions || 0),
            small_portions: Number(row.small_portions || 0),
            comment_count: Number(row.comment_count || 0),
            photos: {
              count: photoCount,
              thumbnails: photoThumbnails
            }
          };
        });

        res.json({
          meals: normalizedMeals,
          location: resolvedLocation,
          date: fallbackDates[0] || today
        });
      }
    );
  } catch (error) {
    console.error('Error fetching meals:', error);
    res.status(500).json({ error: 'Failed to fetch meals from Mensa' });
  }
});

/**
 * GET /api/meals/locations
 * Get available Mensa locations
 */
router.get('/locations', (req, res) => {
  res.json({ locations: MENSA_LOCATIONS });
});

/**
 * GET /api/meals/opening-times/:location
 * Get opening times for a specific location
 */
router.get('/opening-times/:location', async (req, res) => {
  const { location } = req.params;

  if (!MENSA_LOCATIONS[location]) {
    return res.status(404).json({ error: 'Location not found' });
  }

  try {
    const openingTimes = await fetchOpeningTimes(location);
    res.json({ location, openingTimes });
  } catch (error) {
    console.error(`Error fetching opening times for ${location}:`, error);
    res.json({ location, openingTimes: '' });
  }
});

/**
 * GET /api/meals/random
 * Get a random meal from today's menu, weighted by positive ratings
 * Optional query param: ?location=studierendenhaus
 */
router.get('/random', async (req, res) => {
  const { location } = req.query;
  const today = getBerlinDate();

  if (isBerlinWeekend()) {
    return res.json({
      meal: null,
      message: 'No meals available on weekends'
    });
  }

  try {
    // Build query to get meals with positive ratings or no votes
    const params = [today];
    let locationFilter = '';

    if (location && location !== 'all' && MENSA_LOCATIONS[location]) {
      locationFilter = 'AND m.mensa_location = ?';
      params.push(location);
    }

    const query = `
      SELECT
        m.*,
        COALESCE(v.upvotes, 0) as upvotes,
        COALESCE(v.downvotes, 0) as downvotes,
        COALESCE(p.big_portions, 0) as big_portions,
        COALESCE(p.small_portions, 0) as small_portions
      FROM meals m
      LEFT JOIN (
        SELECT
          meal_id,
          SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
          SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
        FROM votes
        GROUP BY meal_id
      ) v ON m.id = v.meal_id
      LEFT JOIN (
        SELECT
          meal_id,
          SUM(CASE WHEN portion_size = 'big' THEN 1 ELSE 0 END) as big_portions,
          SUM(CASE WHEN portion_size = 'small' THEN 1 ELSE 0 END) as small_portions
        FROM portion_votes
        GROUP BY meal_id
      ) p ON m.id = p.meal_id
      WHERE m.date = ? ${locationFilter}
      AND (COALESCE(v.upvotes, 0) - COALESCE(v.downvotes, 0)) >= 0
      ORDER BY RANDOM()
      LIMIT 1
    `;

    db.get(query, params, (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch random meal' });
      }

      if (!row) {
        return res.json({
          meal: null,
          message: 'No meals available'
        });
      }

      // Normalize the meal data
      const normalizedString = row.notes ? String(row.notes).replace(/[|·]/g, ',') : '';
      const rawNotes = normalizedString
        ? normalizedString.split(/\s*,\s*/).map(part => part.trim()).filter(Boolean)
        : [];
      const filteredNotes = simplifyNotes(rawNotes);

      const meal = {
        ...row,
        notes: filteredNotes.length > 0 ? filteredNotes.join(', ') : '',
        upvotes: Number(row.upvotes || 0),
        downvotes: Number(row.downvotes || 0),
        big_portions: Number(row.big_portions || 0),
        small_portions: Number(row.small_portions || 0)
      };

      res.json({ meal });
    });
  } catch (error) {
    console.error('Error fetching random meal:', error);
    res.status(500).json({ error: 'Failed to fetch random meal' });
  }
});

module.exports = router;
