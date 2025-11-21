const express = require('express');
const router = express.Router();
const db = require('../database');
const fs = require('fs').promises;
const path = require('path');

/**
 * DELETE /api/user/delete
 * Delete all user data (photos, comments, streaks, votes, etc.)
 * Requires authentication
 */
router.delete('/delete', async (req, res) => {
    try {
        const user = req.user;

        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userId = user.id;

        // Start a transaction to delete all user data
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // Get all photo IDs and file paths for this user
                db.all(
                    'SELECT id, photo_path FROM food_photos WHERE user_id = ?',
                    [userId],
                    async (err, photos) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                        }

                        // Delete physical photo files
                        for (const photo of photos) {
                            try {
                                const filePath = path.join(__dirname, '..', photo.photo_path);
                                await fs.unlink(filePath);
                            } catch (fileErr) {
                                console.error('Failed to delete photo file:', fileErr);
                                // Continue even if file deletion fails
                            }
                        }

                        // Delete all user's photo comments (on any photo)
                        db.run('DELETE FROM photo_comments WHERE user_id = ?', [userId], (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return reject(err);
                            }

                            // Delete all comments on user's photos
                            db.run('DELETE FROM photo_comments WHERE photo_id IN (SELECT id FROM food_photos WHERE user_id = ?)', [userId], (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                }

                                // Delete all user's photos
                                db.run('DELETE FROM food_photos WHERE user_id = ?', [userId], (err) => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        return reject(err);
                                    }

                                    // Delete all user's meal comments
                                    db.run('DELETE FROM comments WHERE user_id = ?', [userId], (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            return reject(err);
                                        }

                                        // Delete all user's votes
                                        db.run('DELETE FROM votes WHERE user_id = ?', [userId], (err) => {
                                            if (err) {
                                                db.run('ROLLBACK');
                                                return reject(err);
                                            }

                                            // Delete all user's photo votes
                                            db.run('DELETE FROM photo_votes WHERE user_id = ?', [userId], (err) => {
                                                if (err) {
                                                    db.run('ROLLBACK');
                                                    return reject(err);
                                                }

                                                // Delete user's streak data
                                                db.run('DELETE FROM user_streaks WHERE user_id = ?', [userId], (err) => {
                                                    if (err) {
                                                        db.run('ROLLBACK');
                                                        return reject(err);
                                                    }

                                                    // Commit the transaction
                                                    db.run('COMMIT', (err) => {
                                                        if (err) {
                                                            db.run('ROLLBACK');
                                                            return reject(err);
                                                        }
                                                        resolve();
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    }
                );
            });
        });

        res.json({
            success: true,
            message: 'User data deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting user data:', error);
        res.status(500).json({ error: 'Failed to delete user data' });
    }
});

module.exports = router;
