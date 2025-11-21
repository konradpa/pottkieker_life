const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const router = express.Router();
const db = require('../database');
const { hashIP } = require('../utils/hashIP');
const { getBerlinDate } = require('../utils/mensaParser');

// Setup upload directory
const UPLOAD_ROOT = path.join(__dirname, '../uploads');
const PHOTO_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'photos');
fs.mkdirSync(PHOTO_UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp'
]);

// Multer configuration for photo uploads
const storage = multer.diskStorage({
  destination: PHOTO_UPLOAD_DIR,
  filename: (req, file, cb) => {
    const extFromName = path.extname(file.originalname || '').toLowerCase();
    const extFromMime = (() => {
      switch (file.mimetype) {
        case 'image/jpeg':
        case 'image/jpg':
          return '.jpg';
        case 'image/png':
          return '.png';
        case 'image/gif':
          return '.gif';
        case 'image/webp':
          return '.webp';
        default:
          return '';
      }
    })();
    const extension = extFromName || extFromMime || '.jpg';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
    cb(null, uniqueName);
  }
});

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported image type. Please upload JPG, PNG, GIF, or WebP.'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const uploadSingle = upload.single('photo');

// Helper functions
function relativePhotoPath(file) {
  if (!file) return null;
  return path.posix.join('photos', file.filename);
}

function photoPathToUrl(photoPath) {
  if (!photoPath) return null;
  return `/uploads/${photoPath}`;
}

function cleanupUploadedFile(file) {
  if (!file) return;
  fs.unlink(file.path, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Failed to clean up uploaded file:', err);
    }
  });
}

function removePhotoByRelativePath(photoPath) {
  if (!photoPath) return;
  const absolutePath = path.join(UPLOAD_ROOT, photoPath);
  fs.unlink(absolutePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Failed to remove photo:', err);
    }
  });
}

function getTodayDate() {
  return getBerlinDate();
}

function getAuthorFromRequest(req) {
  const user = req.user;
  const username = user?.user_metadata?.username;
  if (username && username.trim()) return username.trim();
  const email = user?.email;
  if (email) return email.split('@')[0];
  return null;
}

/**
 * Strip EXIF metadata from uploaded photo for privacy
 * @param {string} filePath - Path to the uploaded file
 */
async function stripExifMetadata(filePath) {
  try {
    // Read the image, strip metadata, and overwrite
    await sharp(filePath)
      .rotate() // Auto-rotate based on EXIF (before stripping)
      .withMetadata({ orientation: undefined }) // Remove EXIF but keep basic info
      .toBuffer()
      .then(buffer => {
        // Completely strip all metadata
        return sharp(buffer)
          .toFile(filePath + '.tmp');
      })
      .then(() => {
        // Replace original with stripped version
        fs.renameSync(filePath + '.tmp', filePath);
      });
  } catch (err) {
    console.error('Failed to strip EXIF metadata:', err);
    // Don't fail the upload, just log the error
  }
}

/**
 * GET /api/photos
 * Get today's photos with optional filtering and sorting
 * Query params:
 *   mensa: location filter (studierendenhaus, blattwerk, philturm, or all)
 *   sort: sorting option (new or top)
 */
router.get('/', (req, res) => {
  const { mensa = 'all', sort = 'new' } = req.query;
  const today = getTodayDate();

  // Build query based on filters
  let query = `
    SELECT
      fp.id,
      fp.meal_id,
      fp.photo_path,
      fp.author_name,
      fp.caption,
      fp.created_at,
      fp.owner_token_hash,
      m.name as meal_name,
      m.mensa_location,
      COUNT(DISTINCT pv.id) as vote_count,
      COUNT(DISTINCT pc.id) as comment_count
    FROM food_photos fp
    INNER JOIN meals m ON fp.meal_id = m.id
    LEFT JOIN photo_votes pv ON fp.id = pv.photo_id
    LEFT JOIN photo_comments pc ON fp.id = pc.photo_id
    WHERE fp.upload_date = ?
  `;

  const params = [today];

  // Add mensa filter if not 'all'
  if (mensa !== 'all') {
    query += ` AND m.mensa_location = ?`;
    params.push(mensa);
  }

  query += ` GROUP BY fp.id`;

  // Add sorting
  if (sort === 'top') {
    query += ` ORDER BY vote_count DESC, fp.created_at DESC`;
  } else {
    query += ` ORDER BY fp.created_at DESC`;
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Get photos error:', err);
      return res.status(500).json({ error: 'Failed to fetch photos' });
    }

    const photos = (rows || []).map((row) => ({
      id: row.id,
      meal_id: row.meal_id,
      meal_name: row.meal_name,
      mensa_location: row.mensa_location,
      photo_url: photoPathToUrl(row.photo_path),
      author_name: row.author_name,
      caption: row.caption,
      vote_count: row.vote_count,
      comment_count: row.comment_count,
      created_at: row.created_at,
      is_owner: !!(row.owner_token_hash && row.owner_token_hash === req.ownerTokenHash)
    }));

    res.json({ photos });
  });
});

/**
 * POST /api/photos
 * Upload a new photo
 * Body: multipart/form-data with fields:
 *   photo: image file (required)
 *   meal_id: number (required)
 *   author_name: string (required)
 *   caption: string (optional)
 */
router.post('/', (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      const message = err.message || 'File upload failed';
      if (req.file) {
        cleanupUploadedFile(req.file);
      }

      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image too large (max 5 MB)' });
      }

      return res.status(400).json({ error: message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Photo is required' });
    }

    next();
  });
}, async (req, res) => {
  const { meal_id, author_name, caption = '' } = req.body;
  const ip_address = hashIP(req.ip || req.connection.remoteAddress);
  const uploadedPhoto = req.file;
  const photoPath = relativePhotoPath(uploadedPhoto);
  const today = getTodayDate();
  const owner_token_hash = req.ownerTokenHash;

  // Strip EXIF metadata for privacy
  await stripExifMetadata(uploadedPhoto.path);

  // Validate input
  if (!meal_id || !author_name) {
    cleanupUploadedFile(uploadedPhoto);
    return res.status(400).json({ error: 'Meal ID and author name are required' });
  }

  if (author_name.length > 50) {
    cleanupUploadedFile(uploadedPhoto);
    return res.status(400).json({ error: 'Author name too long (max 50 characters)' });
  }

  if (caption.length > 200) {
    cleanupUploadedFile(uploadedPhoto);
    return res.status(400).json({ error: 'Caption too long (max 200 characters)' });
  }

  // Basic XSS prevention
  const sanitizedName = author_name.replace(/<[^>]*>/g, '');
  const sanitizedCaption = caption.replace(/<[^>]*>/g, '');

  // Check if meal exists and is from today
  db.get('SELECT id, name, mensa_location FROM meals WHERE id = ?', [meal_id], (err, meal) => {
    if (err) {
      console.error('Database error:', err);
      cleanupUploadedFile(uploadedPhoto);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!meal) {
      cleanupUploadedFile(uploadedPhoto);
      return res.status(404).json({ error: 'Meal not found' });
    }

    // Rate limiting: check if IP has uploaded more than 5 photos in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    db.get(
      `SELECT COUNT(*) as count
       FROM food_photos
       WHERE ip_address = ? AND created_at > ?`,
      [ip_address, fiveMinutesAgo],
      (err, result) => {
        if (err) {
          console.error('Rate limit check error:', err);
          cleanupUploadedFile(uploadedPhoto);
          return res.status(500).json({ error: 'Database error' });
        }

        if (result.count >= 5) {
          cleanupUploadedFile(uploadedPhoto);
          return res.status(429).json({ error: 'Too many uploads. Please wait a few minutes.' });
        }

        // Insert photo
        db.run(
          `INSERT INTO food_photos (meal_id, photo_path, author_name, caption, ip_address, owner_token_hash, upload_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [meal_id, photoPath, sanitizedName, sanitizedCaption, ip_address, owner_token_hash, today],
          function(err) {
            if (err) {
              console.error('Insert photo error:', err);
              cleanupUploadedFile(uploadedPhoto);
              return res.status(500).json({ error: 'Failed to upload photo' });
            }

            res.status(201).json({
              success: true,
              photo: {
                id: this.lastID,
                meal_id: meal_id,
                meal_name: meal.name,
                mensa_location: meal.mensa_location,
                photo_url: photoPathToUrl(photoPath),
                author_name: sanitizedName,
                caption: sanitizedCaption,
                vote_count: 0,
                comment_count: 0,
                created_at: new Date().toISOString(),
                is_owner: true
              }
            });
          }
        );
      }
    );
  });
});

/**
 * DELETE /api/photos/:photoId
 * Delete a photo (IP-based authorization)
 */
router.delete('/:photoId', (req, res) => {
  const { photoId } = req.params;
  const ip_address = hashIP(req.ip || req.connection.remoteAddress);

  db.get(
    'SELECT photo_path, owner_token_hash, ip_address FROM food_photos WHERE id = ?',
    [photoId],
    (err, photo) => {
      if (err) {
        console.error('Delete photo lookup error:', err);
        return res.status(500).json({ error: 'Failed to delete photo' });
      }

      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      const ownerMatches = photo.owner_token_hash && photo.owner_token_hash === req.ownerTokenHash;
      const legacyMatch = !photo.owner_token_hash && photo.ip_address === ip_address;

      if (!ownerMatches && !legacyMatch) {
        return res.status(403).json({ error: 'Cannot delete this photo' });
      }

      db.run(
        'DELETE FROM food_photos WHERE id = ?',
        [photoId],
        function(deleteErr) {
          if (deleteErr) {
            console.error('Delete photo error:', deleteErr);
            return res.status(500).json({ error: 'Failed to delete photo' });
          }

          if (this.changes === 0) {
            return res.status(403).json({ error: 'Cannot delete this photo' });
          }

          removePhotoByRelativePath(photo.photo_path);
          res.json({ success: true });
        }
      );
    }
  );
});

/**
 * POST /api/photos/:photoId/vote
 * Toggle like for a photo (per IP per photo)
 * - If a like exists from this IP, remove it
 * - Otherwise insert a like
 */
router.post('/:photoId/vote', (req, res) => {
  const { photoId } = req.params;
  const ip_address = hashIP(req.ip || req.connection.remoteAddress);

  // Check if photo exists and if user has already voted
  db.get('SELECT id FROM food_photos WHERE id = ?', [photoId], (err, photo) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Check if user has already voted
    db.get(
      'SELECT id FROM photo_votes WHERE photo_id = ? AND ip_address = ?',
      [photoId, ip_address],
      (err, existingVote) => {
        if (err) {
          console.error('Check vote error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        const finalizeWithCount = () => {
          db.get(
            'SELECT COUNT(*) as count FROM photo_votes WHERE photo_id = ?',
            [photoId],
            (countErr, result) => {
              if (countErr) {
                console.error('Get vote count error:', countErr);
                return res.status(500).json({ error: 'Failed to get vote count' });
              }

              // Also return whether current user has a vote after the operation
              db.get(
                'SELECT id FROM photo_votes WHERE photo_id = ? AND ip_address = ?',
                [photoId, ip_address],
                (stateErr, stateRow) => {
                  if (stateErr) {
                    console.error('State check error:', stateErr);
                    return res.status(500).json({ error: 'Failed to get vote state' });
                  }
                  return res.json({ success: true, vote_count: result.count, user_voted: !!stateRow });
                }
              );
            }
          );
        };

        if (existingVote) {
          // Toggle off: remove existing like
          db.run(
            'DELETE FROM photo_votes WHERE id = ?',
            [existingVote.id],
            function(delErr) {
              if (delErr) {
                console.error('Delete vote error:', delErr);
                return res.status(500).json({ error: 'Failed to remove like' });
              }
              return finalizeWithCount();
            }
          );
        } else {
          // Toggle on: insert new like
          db.run(
            `INSERT INTO photo_votes (photo_id, ip_address) VALUES (?, ?)`,
            [photoId, ip_address],
            function(insErr) {
              if (insErr) {
                console.error('Insert vote error:', insErr);
                return res.status(500).json({ error: 'Failed to like photo' });
              }
              return finalizeWithCount();
            }
          );
        }
      }
    );
  });
});

/**
 * GET /api/photos/:photoId/comments
 * Get all comments for a photo
 */
router.get('/:photoId/comments', (req, res) => {
  const { photoId } = req.params;

  db.all(
    `SELECT id, author_name, comment_text, created_at, owner_token_hash, parent_comment_id
     FROM photo_comments
     WHERE photo_id = ?
     ORDER BY created_at ASC`,
    [photoId],
    (err, rows) => {
      if (err) {
        console.error('Get photo comments error:', err);
        return res.status(500).json({ error: 'Failed to fetch comments' });
      }

      const comments = (rows || []).map((row) => ({
        id: row.id,
        author_name: row.author_name,
        comment_text: row.comment_text,
        created_at: row.created_at,
        parent_comment_id: row.parent_comment_id,
        is_owner: !!(row.owner_token_hash && row.owner_token_hash === req.ownerTokenHash)
      }));

      res.json({ comments });
    }
  );
});

/**
 * POST /api/photos/:photoId/comments
 * Add a comment to a photo
 * Body: JSON with fields:
 *   author_name: string
 *   comment_text: string
 *   parent_comment_id: number (optional, for replies)
 */
router.post('/:photoId/comments', express.json(), (req, res) => {
  const { photoId} = req.params;
  const { comment_text, parent_comment_id = null } = req.body;
  const ip_address = hashIP(req.ip || req.connection.remoteAddress);
  const author_name = getAuthorFromRequest(req);

  if (!author_name) {
    return res.status(401).json({ error: 'Login required to comment' });
  }

  // Validate input
  if (!comment_text) {
    return res.status(400).json({ error: 'Comment text is required' });
  }

  if (comment_text.length > 500) {
    return res.status(400).json({ error: 'Comment too long (max 500 characters)' });
  }

  // Basic XSS prevention
  const sanitizedName = author_name.replace(/<[^>]*>/g, '');
  const sanitizedComment = comment_text.replace(/<[^>]*>/g, '');

  // Check if photo exists
  db.get('SELECT id FROM food_photos WHERE id = ?', [photoId], (err, photo) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // If parent_comment_id is provided, validate it exists and belongs to same photo
    if (parent_comment_id) {
      db.get(
        'SELECT id FROM photo_comments WHERE id = ? AND photo_id = ?',
        [parent_comment_id, photoId],
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
      // Rate limiting: check if IP has posted more than 10 comments in last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      db.get(
        `SELECT COUNT(*) as count
         FROM photo_comments
         WHERE ip_address = ? AND created_at > ?`,
        [ip_address, fiveMinutesAgo],
        (err, result) => {
          if (err) {
            console.error('Rate limit check error:', err);
            return res.status(500).json({ error: 'Database error' });
          }

          if (result.count >= 10) {
            return res.status(429).json({ error: 'Too many comments. Please wait a few minutes.' });
          }

          // Insert comment
          db.run(
            `INSERT INTO photo_comments (photo_id, author_name, comment_text, ip_address, owner_token_hash, parent_comment_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [photoId, sanitizedName, sanitizedComment, ip_address, req.ownerTokenHash, parent_comment_id],
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
                  created_at: new Date().toISOString(),
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
 * DELETE /api/photos/comments/:commentId
 * Delete a photo comment (IP-based authorization)
 */
router.delete('/comments/:commentId', (req, res) => {
  const { commentId } = req.params;
  const ip_address = hashIP(req.ip || req.connection.remoteAddress);

  db.get('SELECT owner_token_hash, ip_address FROM photo_comments WHERE id = ?', [commentId], (err, comment) => {
    if (err) {
      console.error('Delete comment lookup error:', err);
      return res.status(500).json({ error: 'Failed to delete comment' });
    }

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const ownerMatches = comment.owner_token_hash && comment.owner_token_hash === req.ownerTokenHash;
    const legacyMatch = !comment.owner_token_hash && comment.ip_address === ip_address;

    if (!ownerMatches && !legacyMatch) {
      return res.status(403).json({ error: 'Cannot delete this comment' });
    }

    db.run(
      'DELETE FROM photo_comments WHERE id = ?',
      [commentId],
      function(deleteErr) {
        if (deleteErr) {
          console.error('Delete comment error:', deleteErr);
          return res.status(500).json({ error: 'Failed to delete comment' });
        }

        if (this.changes === 0) {
          return res.status(403).json({ error: 'Cannot delete this comment' });
        }

        res.json({ success: true });
      }
    );
  });
});

/**
 * GET /api/photos/by-meal/:mealId
 * Get all photos for a specific meal (today only)
 */
router.get('/by-meal/:mealId', (req, res) => {
  const { mealId } = req.params;
  const ip_address = hashIP(req.ip || req.connection.remoteAddress);

  const query = `
    SELECT
      fp.id,
      fp.meal_id,
      fp.photo_path,
      fp.author_name,
      fp.caption,
      fp.created_at,
      fp.owner_token_hash,
      m.name as meal_name,
      m.mensa_location,
      COALESCE(pv.vote_count, 0) as vote_count,
      COALESCE(pc.comment_count, 0) as comment_count,
      CASE WHEN pv_ip.id IS NULL THEN 0 ELSE 1 END as user_voted
    FROM food_photos fp
    INNER JOIN meals m ON fp.meal_id = m.id
    LEFT JOIN (
      SELECT photo_id, COUNT(*) as vote_count
      FROM photo_votes
      GROUP BY photo_id
    ) pv ON fp.id = pv.photo_id
    LEFT JOIN (
      SELECT photo_id, COUNT(*) as comment_count
      FROM photo_comments
      GROUP BY photo_id
    ) pc ON fp.id = pc.photo_id
    LEFT JOIN photo_votes pv_ip ON pv_ip.photo_id = fp.id AND pv_ip.ip_address = ?
    WHERE fp.meal_id = ?
      AND DATE(fp.upload_date) = DATE('now')
    ORDER BY fp.created_at DESC
  `;

  db.all(query, [ip_address, mealId], (err, rows) => {
    if (err) {
      console.error('Get photos by meal error:', err);
      return res.status(500).json({ error: 'Failed to fetch photos' });
    }

    const photos = (rows || []).map(row => ({
      id: row.id,
      meal_id: row.meal_id,
      meal_name: row.meal_name,
      mensa_location: row.mensa_location,
      photo_url: `/uploads/${row.photo_path}`,
      author_name: row.author_name,
      caption: row.caption,
      vote_count: row.vote_count || 0,
      comment_count: row.comment_count || 0,
      created_at: row.created_at,
      user_voted: !!row.user_voted,
      is_owner: !!(row.owner_token_hash && row.owner_token_hash === req.ownerTokenHash)
    }));

    res.json({ photos });
  });
});

module.exports = router;
