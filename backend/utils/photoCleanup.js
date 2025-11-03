const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { getBerlinDate } = require('./mensaParser');

const UPLOAD_ROOT = path.join(__dirname, '../uploads');

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
  return getBerlinDate();
}

/**
 * Delete old photos and their related data from the database and disk
 */
function cleanupOldPhotos() {
  const today = getTodayDate();

  console.log(`[Photo Cleanup] Starting cleanup for photos before ${today}`);

  // Get all old photos that need to be deleted
  db.all(
    'SELECT id, photo_path FROM food_photos WHERE upload_date < ?',
    [today],
    (err, photos) => {
      if (err) {
        console.error('[Photo Cleanup] Error fetching old photos:', err);
        return;
      }

      if (!photos || photos.length === 0) {
        console.log('[Photo Cleanup] No old photos to delete');
        return;
      }

      console.log(`[Photo Cleanup] Found ${photos.length} old photos to delete`);

      // Delete physical files from disk
      photos.forEach(photo => {
        if (photo.photo_path) {
          const absolutePath = path.join(UPLOAD_ROOT, photo.photo_path);
          fs.unlink(absolutePath, (err) => {
            if (err && err.code !== 'ENOENT') {
              console.error(`[Photo Cleanup] Failed to delete file ${photo.photo_path}:`, err);
            }
          });
        }
      });

      // Delete from database (cascading will delete related votes and comments)
      db.run(
        'DELETE FROM food_photos WHERE upload_date < ?',
        [today],
        function(err) {
          if (err) {
            console.error('[Photo Cleanup] Error deleting old photos from database:', err);
            return;
          }

          console.log(`[Photo Cleanup] Successfully deleted ${this.changes} photos and their related data`);
        }
      );
    }
  );
}

/**
 * Initialize the cleanup scheduler
 * Runs every day at midnight (Europe/Berlin timezone for Hamburg)
 */
function initPhotoCleanupScheduler() {
  // Run at midnight every day (0 0 * * *)
  // Using Europe/Berlin timezone for Hamburg
  cron.schedule('0 0 * * *', () => {
    console.log('[Photo Cleanup] Running scheduled cleanup at midnight');
    cleanupOldPhotos();
  }, {
    scheduled: true,
    timezone: 'Europe/Berlin'
  });

  console.log('[Photo Cleanup] Scheduler initialized - will run daily at midnight (Europe/Berlin)');
}

module.exports = {
  initPhotoCleanupScheduler,
  cleanupOldPhotos // Export for manual testing if needed
};
