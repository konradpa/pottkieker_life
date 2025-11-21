const express = require('express');
const router = express.Router();
const db = require('../database');

function requireAuth(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Get current user's streak
router.get('/me', requireAuth, (req, res) => {
  const userId = req.user.id;
  db.get(
    `SELECT user_id, current_streak, longest_streak, last_post_date
     FROM user_streaks WHERE user_id = ?`,
    [userId],
    (err, row) => {
      if (err) {
        console.error('Streak fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch streak' });
      }
      if (!row) {
        return res.json({ current_streak: 0, longest_streak: 0, last_post_date: null });
      }
      return res.json(row);
    }
  );
});

// Leaderboard - top streaks (current desc, then longest desc)
router.get('/leaderboard', (req, res) => {
  const limit = 10;
  db.all(
    `
      SELECT
        us.user_id,
        us.current_streak,
        us.longest_streak,
        us.last_post_date,
        COALESCE(
          (SELECT author_name FROM food_photos fp WHERE fp.user_id = us.user_id ORDER BY fp.created_at DESC LIMIT 1),
          'User'
        ) as display_name
      FROM user_streaks us
      ORDER BY us.current_streak DESC, us.longest_streak DESC, us.updated_at DESC
      LIMIT ?
    `,
    [limit],
    (err, rows) => {
      if (err) {
        console.error('Leaderboard fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
      return res.json({ leaderboard: rows || [] });
    }
  );
});

module.exports = router;
