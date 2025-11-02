const express = require('express');
const router = express.Router();
const db = require('../database');
const { getTodaysMeals, MENSA_LOCATIONS, simplifyNotes, fetchOpeningTimes } = require('../utils/mensaParser');

/**
 * GET /api/meals/today
 * Get today's meals with vote counts
 * Optional query param: ?location=studierendenhaus
 */
router.get('/today', async (req, res) => {
  const { location } = req.query;
  const locationKeys = Object.keys(MENSA_LOCATIONS);
  const isAllLocations = location === 'all';

  try {
    // Fetch fresh meal data from Mensa source
    let meals;
    if (isAllLocations) {
      meals = [];
      for (const loc of locationKeys) {
        const locationMeals = await getTodaysMeals(loc);
        meals.push(...locationMeals);
      }
    } else if (location && MENSA_LOCATIONS[location]) {
      meals = await getTodaysMeals(location);
    } else {
      // Get meals from a default location (or all locations)
      meals = await getTodaysMeals('studierendenhaus');
    }

    // Get the actual date of the meals (might not be today)
    const mealDate = meals.length > 0 ? meals[0].date : new Date().toISOString().split('T')[0];

    // For Philturm, delete old Gemüsebar meals before inserting new ones
    if (location === 'philturm' || (isAllLocations && meals.some(m => m.mensa_location === 'philturm'))) {
      const philturmDates = [...new Set(meals.filter(m => m.mensa_location === 'philturm').map(m => m.date))];
      for (const date of philturmDates) {
        await new Promise((resolve, reject) => {
          db.run(
            `DELETE FROM meals
             WHERE mensa_location = 'philturm'
             AND date = ?
             AND category LIKE '%Gemüsebar%'
             AND external_id != ?`,
            [date, `philturm_${date}_Gemuesebar`],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
    }

    // Insert meals into database if they don't exist
    for (const meal of meals) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO meals (external_id, name, category, date, mensa_location, price_student, price_employee, price_other, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(external_id) DO UPDATE SET
             name = excluded.name,
             category = excluded.category,
             date = excluded.date,
             mensa_location = excluded.mensa_location,
             price_student = excluded.price_student,
             price_employee = excluded.price_employee,
             price_other = excluded.price_other,
             notes = excluded.notes`,
          [
            meal.external_id,
            meal.name,
            meal.category,
            meal.date,
            meal.mensa_location,
            meal.price_student,
            meal.price_employee,
            meal.price_other,
            meal.notes
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Get meals with vote counts from database (use actual meal date, not today)
    const distinctDates = [...new Set(meals.map(meal => meal.date))];
    const datePlaceholders = (distinctDates.length > 0 ? distinctDates : [mealDate])
      .map(() => '?')
      .join(', ');

    const params = distinctDates.length > 0 ? [...distinctDates] : [mealDate];

    let locationFilter = '';
    if (location && !isAllLocations && MENSA_LOCATIONS[location]) {
      locationFilter = 'AND mensa_location = ?';
      params.push(location);
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
          location: isAllLocations ? 'all' : (location && MENSA_LOCATIONS[location] ? location : 'studierendenhaus')
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

module.exports = router;
