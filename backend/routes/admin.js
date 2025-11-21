const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Middleware to verify admin JWT token
function verifyAdmin(req, res, next) {
  // Supabase/whitelist admin bypass
  if (req.isAdmin) {
    req.admin = { role: 'admin', source: 'supabase' };
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * POST /api/admin/login
 * Admin login
 * Body: { password: string }
 */
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  // Simple password check (in production, use bcrypt hash comparison)
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

/**
 * GET /api/admin/stats
 * Get basic statistics
 */
router.get('/stats', verifyAdmin, (req, res) => {
  const stats = {};

  // Get all stats in parallel
  const queries = [
    new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM food_photos', (err, row) => {
        stats.total_photos = row?.count || 0;
        resolve();
      });
    }),
    new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM food_photos WHERE upload_date = DATE("now")', (err, row) => {
        stats.photos_today = row?.count || 0;
        resolve();
      });
    }),
    new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM comments', (err, row) => {
        stats.total_meal_comments = row?.count || 0;
        resolve();
      });
    }),
    new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM photo_comments', (err, row) => {
        stats.total_photo_comments = row?.count || 0;
        resolve();
      });
    }),
    new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM votes', (err, row) => {
        stats.total_votes = row?.count || 0;
        resolve();
      });
    }),
    new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM photo_votes', (err, row) => {
        stats.total_photo_votes = row?.count || 0;
        resolve();
      });
    }),
    new Promise((resolve) => {
      // Calculate upload folder size
      const uploadPath = path.join(__dirname, '../uploads/photos');
      try {
        const files = fs.readdirSync(uploadPath);
        let totalSize = 0;
        files.forEach(file => {
          const filePath = path.join(uploadPath, file);
          const stat = fs.statSync(filePath);
          totalSize += stat.size;
        });
        stats.storage_mb = (totalSize / (1024 * 1024)).toFixed(2);
      } catch (err) {
        stats.storage_mb = '0';
      }
      resolve();
    })
  ];

  Promise.all(queries).then(() => {
    res.json(stats);
  });
});

/**
 * GET /api/admin/photos
 * Get all photos (for moderation)
 */
router.get('/photos', verifyAdmin, (req, res) => {
  const query = `
    SELECT
      fp.id,
      fp.meal_id,
      fp.photo_path,
      fp.author_name,
      fp.caption,
      fp.upload_date,
      fp.created_at,
      m.name as meal_name,
      m.mensa_location,
      COUNT(DISTINCT pv.id) as vote_count,
      COUNT(DISTINCT pc.id) as comment_count
    FROM food_photos fp
    LEFT JOIN meals m ON fp.meal_id = m.id
    LEFT JOIN photo_votes pv ON fp.id = pv.photo_id
    LEFT JOIN photo_comments pc ON fp.id = pc.photo_id
    GROUP BY fp.id
    ORDER BY fp.created_at DESC
    LIMIT 100
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Get admin photos error:', err);
      return res.status(500).json({ error: 'Failed to fetch photos' });
    }

    const photos = (rows || []).map((row) => ({
      id: row.id,
      meal_id: row.meal_id,
      meal_name: row.meal_name,
      mensa_location: row.mensa_location,
      photo_url: `/uploads/${row.photo_path}`,
      author_name: row.author_name,
      caption: row.caption,
      vote_count: row.vote_count,
      comment_count: row.comment_count,
      upload_date: row.upload_date,
      created_at: row.created_at
    }));

    res.json({ photos });
  });
});

/**
 * DELETE /api/admin/photos/:photoId
 * Delete any photo (admin privilege)
 */
router.delete('/photos/:photoId', verifyAdmin, (req, res) => {
  const { photoId } = req.params;

  db.get('SELECT photo_path FROM food_photos WHERE id = ?', [photoId], (err, photo) => {
    if (err) {
      console.error('Delete photo lookup error:', err);
      return res.status(500).json({ error: 'Failed to delete photo' });
    }

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    db.run('DELETE FROM food_photos WHERE id = ?', [photoId], function(deleteErr) {
      if (deleteErr) {
        console.error('Delete photo error:', deleteErr);
        return res.status(500).json({ error: 'Failed to delete photo' });
      }

      // Delete physical file
      const photoPath = path.join(__dirname, '../uploads', photo.photo_path);
      fs.unlink(photoPath, (fsErr) => {
        if (fsErr && fsErr.code !== 'ENOENT') {
          console.error('Failed to remove photo file:', fsErr);
        }
      });

      res.json({ success: true });
    });
  });
});

/**
 * GET /api/admin/comments
 * Get all comments (meal + photo comments)
 */
router.get('/comments', verifyAdmin, (req, res) => {
  const queries = [
    new Promise((resolve) => {
      db.all(
        `SELECT
          c.id,
          c.meal_id as ref_id,
          'meal' as type,
          c.author_name,
          c.comment_text,
          c.timestamp as created_at,
          m.name as ref_name
         FROM comments c
         LEFT JOIN meals m ON c.meal_id = m.id
         ORDER BY c.timestamp DESC
         LIMIT 50`,
        [],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    }),
    new Promise((resolve) => {
      db.all(
        `SELECT
          pc.id,
          pc.photo_id as ref_id,
          'photo' as type,
          pc.author_name,
          pc.comment_text,
          pc.created_at,
          m.name as ref_name
         FROM photo_comments pc
         LEFT JOIN food_photos fp ON pc.photo_id = fp.id
         LEFT JOIN meals m ON fp.meal_id = m.id
         ORDER BY pc.created_at DESC
         LIMIT 50`,
        [],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    })
  ];

  Promise.all(queries).then(([mealComments, photoComments]) => {
    const allComments = [...mealComments, ...photoComments]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 100);

    res.json({ comments: allComments });
  });
});

/**
 * DELETE /api/admin/comments/meal/:commentId
 * Delete any meal comment (admin privilege)
 */
router.delete('/comments/meal/:commentId', verifyAdmin, (req, res) => {
  const { commentId } = req.params;

  db.run('DELETE FROM comments WHERE id = ?', [commentId], function(err) {
    if (err) {
      console.error('Delete comment error:', err);
      return res.status(500).json({ error: 'Failed to delete comment' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({ success: true });
  });
});

/**
 * DELETE /api/admin/comments/photo/:commentId
 * Delete any photo comment (admin privilege)
 */
router.delete('/comments/photo/:commentId', verifyAdmin, (req, res) => {
  const { commentId } = req.params;

  db.run('DELETE FROM photo_comments WHERE id = ?', [commentId], function(err) {
    if (err) {
      console.error('Delete photo comment error:', err);
      return res.status(500).json({ error: 'Failed to delete comment' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({ success: true });
  });
});

module.exports = router;
