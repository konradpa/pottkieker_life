require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Import routes
const mealsRouter = require('./routes/meals');
const votesRouter = require('./routes/votes');
const portionsRouter = require('./routes/portions');
const commentsRouter = require('./routes/comments');
const photosRouter = require('./routes/photos');
const adminRouter = require('./routes/admin');
const streaksRouter = require('./routes/streaks');
const { ownershipTokenMiddleware } = require('./middleware/ownershipToken');
const { authMiddleware } = require('./middleware/authMiddleware');

// Initialize database
require('./database');

// Initialize photo cleanup scheduler
const { initPhotoCleanupScheduler } = require('./utils/photoCleanup');
const { initMealScheduler } = require('./utils/mealScheduler');
initPhotoCleanupScheduler();
initMealScheduler();

const app = express();
app.set('trust proxy', true); // ✅ This line fixes IP detection through Nginx
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for simplicity
  crossOriginEmbedderPolicy: false // Allow image loading
}));

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN
    : '*',
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(ownershipTokenMiddleware);
app.use(authMiddleware);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/meals', mealsRouter);
app.use('/api/votes', votesRouter);
app.use('/api/portions', portionsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/photos', photosRouter);
app.use('/api/admin', adminRouter);
app.use('/api/streaks', streaksRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Config endpoint for frontend
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY
  });
});

// API root - list available endpoints
app.get('/api', (req, res) => {
  res.json({
    message: 'Mensa Rating API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      meals: {
        today: 'GET /api/meals/today?location={location}',
        locations: 'GET /api/meals/locations'
      },
      votes: {
        vote: 'POST /api/votes/:mealId (body: {vote_type: "up"|"down"})',
        get: 'GET /api/votes/:mealId',
        delete: 'DELETE /api/votes/:mealId'
      },
      comments: {
        list: 'GET /api/comments/:mealId',
        add: 'POST /api/comments/:mealId (body: {author_name, comment_text})',
        delete: 'DELETE /api/comments/:commentId'
      },
      photos: {
        list: 'GET /api/photos?mensa={location}&sort={new|top}',
        upload: 'POST /api/photos (multipart: photo, meal_id, author_name, caption)',
        delete: 'DELETE /api/photos/:photoId',
        vote: 'POST /api/photos/:photoId/vote',
        comments: {
          list: 'GET /api/photos/:photoId/comments',
          add: 'POST /api/photos/:photoId/comments (body: {author_name, comment_text})',
          delete: 'DELETE /api/photos/comments/:commentId'
        }
      }
    }
  });
});

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
