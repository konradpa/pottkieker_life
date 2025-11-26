const express = require('express');
const router = express.Router();
const db = require('../database');

function getBerlinToday() {
  // Normalize to Europe/Berlin date (midnight)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  now.setHours(0, 0, 0, 0);
  return now;
}

function formatDate(dateObj) {
  return dateObj.toISOString().split('T')[0];
}

function isWeekend(dateObj) {
  const day = dateObj.getDay();
  return day === 0 || day === 6;
}

function previousValidPostDate(dateObj) {
  // Returns the most recent date (before dateObj) that counts toward streak, skipping weekends.
  const d = new Date(dateObj);
  do {
    d.setDate(d.getDate() - 1);
  } while (isWeekend(d));
  return formatDate(d);
}

function normalizeStreakRow(row, todayStr, prevValidStr) {
  if (!row) return { streakExpired: false, current_streak: 0, longest_streak: 0, last_post_date: null };

  const last = row.last_post_date;
  const stale = !last || (last !== todayStr && last !== prevValidStr);
  const expired = stale && row.current_streak !== 0;

  return {
    ...row,
    current_streak: stale ? 0 : row.current_streak || 0,
    streakExpired: expired
  };
}

function expireStreak(db, userId) {
  return new Promise((resolve) => {
    db.run(
      'UPDATE user_streaks SET current_streak = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [userId],
      (err) => {
        if (err) {
          console.error('Failed to expire streak for user:', userId, err);
        }
        resolve();
      }
    );
  });
}

function requireAuth(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Get current user's streak
router.get('/me', requireAuth, (req, res) => {
  const today = getBerlinToday();
  const todayStr = formatDate(today);
  const prevValidStr = previousValidPostDate(today);
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

      const normalized = normalizeStreakRow(row, todayStr, prevValidStr);
      const respond = () => res.json({
        current_streak: normalized.current_streak,
        longest_streak: normalized.longest_streak,
        last_post_date: normalized.last_post_date
      });

      if (normalized.streakExpired) {
        expireStreak(db, userId).finally(respond);
        return;
      }

      return respond();
    }
  );
});

// Leaderboard - top streaks (current desc, then longest desc)
router.get('/leaderboard', (req, res) => {
  const limit = 10;
  const today = getBerlinToday();
  const todayStr = formatDate(today);
  const prevValidStr = previousValidPostDate(today);
  db.all(
    `
      SELECT
        us.user_id,
        us.current_streak,
        us.longest_streak,
        us.last_post_date,
        us.updated_at,
        COALESCE(
          us.display_name,
          (SELECT author_name FROM food_photos fp WHERE fp.user_id = us.user_id ORDER BY fp.created_at DESC LIMIT 1)
        ) as raw_display_name
      FROM user_streaks us
    `,
    [],
    (err, rows) => {
      if (err) {
        console.error('Leaderboard fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }

      const normalizedRows = (rows || []).map((row) => normalizeStreakRow(row, todayStr, prevValidStr));
      const expirePromises = normalizedRows
        .filter((row) => row.streakExpired && row.user_id)
        .map((row) => expireStreak(db, row.user_id));

      Promise.all(expirePromises).finally(() => {
        const cleaned = (normalizedRows || [])
          .filter((row) => row.current_streak > 0)
          .map((row) => {
            const name = (row.raw_display_name || '').trim();
            const placeholder = !name || /^user(\s*\d+)?$/i.test(name);
            if (placeholder) return null; // Drop obviously broken rows so leaderboard clears when data is bad
            const { raw_display_name, streakExpired, ...rest } = row;
            return { ...rest, display_name: name };
          })
          .filter(Boolean)
          .sort((a, b) => {
            if (b.current_streak !== a.current_streak) return b.current_streak - a.current_streak;
            if (b.longest_streak !== a.longest_streak) return b.longest_streak - a.longest_streak;
            const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return bUpdated - aUpdated;
          })
          .slice(0, limit);

        return res.json({ leaderboard: cleaned });
      });
    }
  );
});

module.exports = router;
