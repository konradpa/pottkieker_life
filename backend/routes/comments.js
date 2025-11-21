const express = require('express');
const router = express.Router();
const db = require('../database');
const { hashIP } = require('../utils/hashIP');

function getAuthorFromRequest(req) {
  const user = req.user;
  const username = user?.user_metadata?.username;
  if (username && username.trim()) return username.trim();
  const email = user?.email;
  if (email) return email.split('@')[0];
  return null;
}

/**
 * GET /api/comments/:mealId
 * Get all comments for a specific meal
 */
router.get('/:mealId', (req, res) => {
  const { mealId } = req.params;

  db.all(
    `SELECT id, author_name, comment_text, timestamp, owner_token_hash, parent_comment_id
     FROM comments
     WHERE meal_id = ?
     ORDER BY timestamp ASC`,
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
        timestamp: row.timestamp,
        parent_comment_id: row.parent_comment_id,
        is_owner: !!(row.owner_token_hash && row.owner_token_hash === req.ownerTokenHash)
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
 *   parent_comment_id: number (optional, for replies)
 */
router.post('/:mealId', express.json(), (req, res) => {
  const { mealId } = req.params;
  const { comment_text, parent_comment_id = null } = req.body;
  const ip_address = hashIP(req.ip || req.connection.remoteAddress);
  const owner_token_hash = req.ownerTokenHash;
  const author_name = getAuthorFromRequest(req);

  if (!author_name) {
    return res.status(401).json({ error: 'Login required to comment' });
  }

  // Validate input
  if (!comment_text) {
    return res.status(400).json({ error: 'Comment text is required' });
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

    // If parent_comment_id is provided, validate it exists and belongs to same meal
    if (parent_comment_id) {
      db.get(
        'SELECT id FROM comments WHERE id = ? AND meal_id = ?',
        [parent_comment_id, mealId],
        (err, parentComment) => {
          if (err) {
            console.error('Parent comment check error:', err);
            return res.status(500).json({ error: 'Database error' });
          }

          if (!parentComment) {
            return res.status(404).json({ error: 'Parent comment not found' });
          }

          proceedWithCommentCreation();
        }
      );
    } else {
      proceedWithCommentCreation();
    }

    function proceedWithCommentCreation() {
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
            `INSERT INTO comments (meal_id, author_name, comment_text, ip_address, owner_token_hash, parent_comment_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [mealId, sanitizedName, sanitizedComment, ip_address, owner_token_hash, parent_comment_id],
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
                  timestamp: new Date().toISOString(),
                  parent_comment_id: parent_comment_id,
                  is_owner: true
                }
              });
            }
          );
        }
      );
    }
  });
});

/**
 * DELETE /api/comments/:commentId
 * Delete a comment (token/IP-based authorization)
 */
router.delete('/:commentId', (req, res) => {
  const { commentId } = req.params;
  const ip_address = hashIP(req.ip || req.connection.remoteAddress);
  const owner_token_hash = req.ownerTokenHash;

  db.run(
    `DELETE FROM comments
     WHERE id = ?
       AND (
         owner_token_hash = ?
         OR (owner_token_hash IS NULL AND ip_address = ?)
       )`,
    [commentId, owner_token_hash, ip_address],
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
