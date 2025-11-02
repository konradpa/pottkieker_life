const express = require('express');
const router = express.Router();
const db = require('../database');

function sendPortionCounts(res, mealId) {
  db.get(
    `SELECT
      SUM(CASE WHEN portion_size = 'big' THEN 1 ELSE 0 END) as big_portions,
      SUM(CASE WHEN portion_size = 'small' THEN 1 ELSE 0 END) as small_portions
     FROM portion_votes
     WHERE meal_id = ?`,
    [mealId],
    (err, counts) => {
      if (err) {
        console.error('Portion count error:', err);
        return res.status(500).json({ error: 'Failed to get portion counts' });
      }

      res.json({
        success: true,
        big_portions: counts?.big_portions || 0,
        small_portions: counts?.small_portions || 0
      });
    }
  );
}

router.post('/:mealId', (req, res) => {
  const { mealId } = req.params;
  const { portion_size } = req.body;
  const ip_address = req.ip || req.connection.remoteAddress;

  if (!portion_size || (portion_size !== 'big' && portion_size !== 'small')) {
    return res.status(400).json({ error: 'Invalid portion size. Must be "big" or "small"' });
  }

  db.get('SELECT id FROM meals WHERE id = ?', [mealId], (err, meal) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!meal) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    db.run(
      `INSERT INTO portion_votes (meal_id, portion_size, ip_address)
       VALUES (?, ?, ?)
       ON CONFLICT(meal_id, ip_address)
       DO UPDATE SET portion_size = excluded.portion_size, timestamp = CURRENT_TIMESTAMP`,
      [mealId, portion_size, ip_address],
      (insertErr) => {
        if (insertErr) {
          console.error('Portion vote error:', insertErr);
          return res.status(500).json({ error: 'Failed to record portion vote' });
        }

        sendPortionCounts(res, mealId);
      }
    );
  });
});

router.delete('/:mealId', (req, res) => {
  const { mealId } = req.params;
  const ip_address = req.ip || req.connection.remoteAddress;

  db.run(
    'DELETE FROM portion_votes WHERE meal_id = ? AND ip_address = ?',
    [mealId, ip_address],
    (err) => {
      if (err) {
        console.error('Delete portion vote error:', err);
        return res.status(500).json({ error: 'Failed to delete portion vote' });
      }

      sendPortionCounts(res, mealId);
    }
  );
});

router.get('/:mealId', (req, res) => {
  const { mealId } = req.params;
  sendPortionCounts(res, mealId);
});

module.exports = router;
