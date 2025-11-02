const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * POST /api/votes/:mealId
 * Cast a vote for a meal (upvote or downvote)
 * Body: { vote_type: 'up' | 'down' }
 */
router.post('/:mealId', (req, res) => {
  const { mealId } = req.params;
  const { vote_type } = req.body;
  const ip_address = req.ip || req.connection.remoteAddress;

  // Validate vote type
  if (!vote_type || (vote_type !== 'up' && vote_type !== 'down')) {
    return res.status(400).json({ error: 'Invalid vote type. Must be "up" or "down"' });
  }

  // Check if meal exists
  db.get('SELECT id FROM meals WHERE id = ?', [mealId], (err, meal) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!meal) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    // Toggle or change vote:
    // - If an existing vote for this IP is the same type -> delete (toggle off)
    // - If different -> update
    // - If none -> insert
    db.get(
      'SELECT id, vote_type FROM votes WHERE meal_id = ? AND ip_address = ?',
      [mealId, ip_address],
      (lookupErr, existing) => {
        if (lookupErr) {
          console.error('Vote lookup error:', lookupErr);
          return res.status(500).json({ error: 'Database error' });
        }

        const finalize = () => {
          db.get(
            `SELECT
              SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
              SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
             FROM votes
             WHERE meal_id = ?`,
            [mealId],
            (countErr, counts) => {
              if (countErr) {
                console.error('Count error:', countErr);
                return res.status(500).json({ error: 'Failed to get vote counts' });
              }

              // Determine user's current vote after operation
              db.get(
                'SELECT vote_type FROM votes WHERE meal_id = ? AND ip_address = ?',
                [mealId, ip_address],
                (stateErr, stateRow) => {
                  if (stateErr) {
                    console.error('State check error:', stateErr);
                    return res.status(500).json({ error: 'Failed to get vote state' });
                  }

                  res.json({
                    success: true,
                    upvotes: counts?.upvotes || 0,
                    downvotes: counts?.downvotes || 0,
                    user_vote: stateRow ? stateRow.vote_type : null
                  });
                }
              );
            }
          );
        };

        if (existing) {
          if (existing.vote_type === vote_type) {
            // Toggle off
            db.run('DELETE FROM votes WHERE id = ?', [existing.id], function(delErr) {
              if (delErr) {
                console.error('Vote delete error:', delErr);
                return res.status(500).json({ error: 'Failed to remove vote' });
              }
              finalize();
            });
          } else {
            // Change vote type
            db.run(
              'UPDATE votes SET vote_type = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?',
              [vote_type, existing.id],
              function(updateErr) {
                if (updateErr) {
                  console.error('Vote update error:', updateErr);
                  return res.status(500).json({ error: 'Failed to update vote' });
                }
                finalize();
              }
            );
          }
        } else {
          // Insert new vote
          db.run(
            `INSERT INTO votes (meal_id, vote_type, ip_address) VALUES (?, ?, ?)`,
            [mealId, vote_type, ip_address],
            function(insertErr) {
              if (insertErr) {
                console.error('Vote insert error:', insertErr);
                return res.status(500).json({ error: 'Failed to record vote' });
              }
              finalize();
            }
          );
        }
      }
    );
  });
});

/**
 * DELETE /api/votes/:mealId
 * Remove your vote for a meal
 */
router.delete('/:mealId', (req, res) => {
  const { mealId } = req.params;
  const ip_address = req.ip || req.connection.remoteAddress;

  db.run(
    'DELETE FROM votes WHERE meal_id = ? AND ip_address = ?',
    [mealId, ip_address],
    function(err) {
      if (err) {
        console.error('Delete vote error:', err);
        return res.status(500).json({ error: 'Failed to delete vote' });
      }

      res.json({ success: true, deleted: this.changes > 0 });
    }
  );
});

/**
 * GET /api/votes/:mealId
 * Get vote counts for a specific meal
 */
router.get('/:mealId', (req, res) => {
  const { mealId } = req.params;

  db.get(
    `SELECT
      SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
      SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
     FROM votes
     WHERE meal_id = ?`,
    [mealId],
    (err, counts) => {
      if (err) {
        console.error('Get votes error:', err);
        return res.status(500).json({ error: 'Failed to get votes' });
      }

      res.json({
        upvotes: counts?.upvotes || 0,
        downvotes: counts?.downvotes || 0
      });
    }
  );
});

module.exports = router;
