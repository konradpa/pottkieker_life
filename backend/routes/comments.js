const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * GET /api/comments/:mealId
 * Get all comments for a specific meal
 */
router.get('/:mealId', (req, res) => {
  const { mealId } = req.params;

  db.all(
    `SELECT id, author_name, comment_text, timestamp
     FROM comments
     WHERE meal_id = ?
     ORDER BY timestamp DESC`,
    [mealId],
    (err, rows) => {
      if (err) {
        console.error('Get comments error:', err);
        return res.status(500).json({ error: 'Failed to fetch comments' });
      }

      const comments = (rows || []).map((row) => ({
        id: row.id,
        author_name: row.author_name,
        comment_text: row.comment_text,
        timestamp: row.timestamp
      }));

      res.json({ comments });
    }
  );
});

/**
 * POST /api/comments/:mealId
 * Add a comment to a meal
 * Body: JSON with fields:
 *   author_name: string
 *   comment_text: string
 */
router.post('/:mealId', express.json(), (req, res) => {
  const { mealId } = req.params;
  const { author_name, comment_text } = req.body;
  const ip_address = req.ip || req.connection.remoteAddress;

  // Validate input
  if (!author_name || !comment_text) {
    return res.status(400).json({ error: 'Author name and comment text are required' });
  }

  if (author_name.length > 50) {
    return res.status(400).json({ error: 'Author name too long (max 50 characters)' });
  }

  if (comment_text.length > 500) {
    return res.status(400).json({ error: 'Comment too long (max 500 characters)' });
  }

  // Basic XSS prevention: strip HTML tags
  const sanitizedName = author_name.replace(/<[^>]*>/g, '');
  const sanitizedComment = comment_text.replace(/<[^>]*>/g, '');

  // Check if meal exists
  db.get('SELECT id FROM meals WHERE id = ?', [mealId], (err, meal) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!meal) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    // Rate limiting: check if IP has posted more than 5 comments in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    db.get(
      `SELECT COUNT(*) as count
       FROM comments
       WHERE ip_address = ? AND timestamp > ?`,
      [ip_address, fiveMinutesAgo],
      (err, result) => {
        if (err) {
          console.error('Rate limit check error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (result.count >= 5) {
          return res.status(429).json({ error: 'Too many comments. Please wait a few minutes.' });
        }

        // Insert comment
        db.run(
          `INSERT INTO comments (meal_id, author_name, comment_text, ip_address)
           VALUES (?, ?, ?, ?)`,
          [mealId, sanitizedName, sanitizedComment, ip_address],
          function(err) {
            if (err) {
              console.error('Insert comment error:', err);
              return res.status(500).json({ error: 'Failed to add comment' });
            }

            res.status(201).json({
              success: true,
              comment: {
                id: this.lastID,
                author_name: sanitizedName,
                comment_text: sanitizedComment,
                timestamp: new Date().toISOString()
              }
            });
          }
        );
      }
    );
  });
});

/**
 * DELETE /api/comments/:commentId
 * Delete a comment (IP-based authorization)
 */
router.delete('/:commentId', (req, res) => {
  const { commentId } = req.params;
  const ip_address = req.ip || req.connection.remoteAddress;

  db.run(
    'DELETE FROM comments WHERE id = ? AND ip_address = ?',
    [commentId, ip_address],
    function(err) {
      if (err) {
        console.error('Delete comment error:', err);
        return res.status(500).json({ error: 'Failed to delete comment' });
      }

      if (this.changes === 0) {
        return res.status(403).json({ error: 'Cannot delete this comment' });
      }

      res.json({ success: true });
    }
  );
});

module.exports = router;
