const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/mensa.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Meals table - stores meal information
  db.run(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT,
      date TEXT NOT NULL,
      mensa_location TEXT NOT NULL,
      price_student TEXT,
      price_employee TEXT,
      price_other TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Votes table - stores upvotes/downvotes
  db.run(`
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      vote_type TEXT NOT NULL CHECK(vote_type IN ('up', 'down')),
      ip_address TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
      UNIQUE(meal_id, ip_address)
    )
  `);

  // Portion votes table - tracks portion size feedback
  db.run(`
    CREATE TABLE IF NOT EXISTS portion_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      portion_size TEXT NOT NULL CHECK(portion_size IN ('big', 'small')),
      ip_address TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
      UNIQUE(meal_id, ip_address)
    )
  `);

  // Comments table - stores user comments (text only)
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      comment_text TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      owner_token_hash TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
    )
  `);

  // Food photos table - stores user-uploaded photos of meals
  db.run(`
    CREATE TABLE IF NOT EXISTS food_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      photo_path TEXT NOT NULL,
      author_name TEXT NOT NULL,
      caption TEXT,
      ip_address TEXT NOT NULL,
      owner_token_hash TEXT,
      upload_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
    )
  `);

  // Photo votes table - stores upvotes for photos (one vote per IP per photo)
  db.run(`
    CREATE TABLE IF NOT EXISTS photo_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL,
      ip_address TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (photo_id) REFERENCES food_photos(id) ON DELETE CASCADE,
      UNIQUE(photo_id, ip_address)
    )
  `);

  // Photo comments table - stores comments on photos (text only)
  db.run(`
    CREATE TABLE IF NOT EXISTS photo_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      comment_text TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      owner_token_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (photo_id) REFERENCES food_photos(id) ON DELETE CASCADE
    )
  `);

  console.log('Database tables initialized');

  // Ensure ownership columns exist (for pre-existing databases).
  const migrations = [
    { table: 'comments', column: 'owner_token_hash', definition: 'ALTER TABLE comments ADD COLUMN owner_token_hash TEXT' },
    { table: 'photo_comments', column: 'owner_token_hash', definition: 'ALTER TABLE photo_comments ADD COLUMN owner_token_hash TEXT' },
    { table: 'food_photos', column: 'owner_token_hash', definition: 'ALTER TABLE food_photos ADD COLUMN owner_token_hash TEXT' },
    { table: 'comments', column: 'parent_comment_id', definition: 'ALTER TABLE comments ADD COLUMN parent_comment_id INTEGER DEFAULT NULL REFERENCES comments(id) ON DELETE CASCADE' },
    { table: 'photo_comments', column: 'parent_comment_id', definition: 'ALTER TABLE photo_comments ADD COLUMN parent_comment_id INTEGER DEFAULT NULL REFERENCES photo_comments(id) ON DELETE CASCADE' }
  ];

  migrations.forEach(({ table, column, definition }) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) {
        console.error(`Failed to inspect ${table} table:`, err);
        return;
      }

      const hasColumn = Array.isArray(rows) && rows.some((schemaRow) => schemaRow.name === column);
      if (!hasColumn) {
        db.run(definition, (alterErr) => {
          if (alterErr) {
            console.error(`Failed to add ${column} to ${table}:`, alterErr);
          } else {
            console.log(`Added ${column} column to ${table} table`);
          }
        });
      }
    });
  });
});

module.exports = db;
