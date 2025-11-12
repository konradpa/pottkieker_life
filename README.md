# Pottkieker.life

Source code for [pottkieker.life](https://pottkieker.life) - a web application for rating and sharing photos of daily meals from Universität Hamburg Mensa locations.

"Pottkieker" is a Low German word meaning someone who peeks into pots - perfect for curious mensa enthusiasts!

## Features

- 📅 Display daily meal plans from multiple Mensa locations
- 👍👎 Upvote/downvote meals and portions
- 📸 Upload and share photos of meals
- 💬 Comment on meals and photos (with optional 1-level deep replies)
- 🔍 Filter meals by location, category, and dietary tags
- 📱 Clean, mobile-responsive design
- 🔐 Optional user authentication for personalized features
- 🎨 Photo gallery with lightbox view
- 📊 Vote counts and community engagement
- 🔒 Admin features for content moderation

## Tech Stack

- **Backend**: Node.js with Express
- **Database**: SQLite3
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Authentication**: JWT with bcrypt password hashing
- **Image Processing**: Sharp for photo optimization
- **Security**: Helmet for HTTP headers, CORS configuration
- **Data Source**: [cvzi/mensahd](https://github.com/cvzi/mensahd) OpenMensa parser

## Available Mensa Locations

- Studierendenhaus
- Blattwerk (Vegetarisch)
- Philturm
- Harburg
- Geomatikum

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/konradpa/pottkieker.git
   cd pottkieker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   - Copy `.env.example` to `.env`
   - Update the values (especially `JWT_SECRET` and `ADMIN_PASSWORD`)
   ```bash
   cp .env.example .env
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

5. **Open your browser**:
   Navigate to `http://localhost:3000`

## Project Structure

```
pottkieker/
├── backend/
│   ├── server.js           # Express server
│   ├── database.js         # SQLite database setup
│   ├── middleware/
│   │   └── auth.js         # JWT authentication middleware
│   ├── migrations/         # Database migration scripts
│   ├── routes/
│   │   ├── auth.js         # Authentication endpoints
│   │   ├── user.js         # User profile endpoints
│   │   ├── meals.js        # Meals API endpoints
│   │   ├── votes.js        # Voting API endpoints
│   │   ├── portions.js     # Portions tracking endpoints
│   │   ├── comments.js     # Comments API endpoints
│   │   └── photos.js       # Photo upload/management endpoints
│   └── utils/
│       ├── mensaParser.js  # XML parser for Mensa data
│       └── mealStorage.js  # Meal data storage and cleanup
├── frontend/
│   ├── index.html          # Main HTML page
│   ├── admin.html          # Admin dashboard
│   ├── styles.css          # Styling
│   └── app.js              # Frontend JavaScript
├── database/
│   └── mensa.db            # SQLite database (created on first run)
├── .env.example            # Example environment configuration
├── package.json
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Admin login (body: `{ password: string }`)
- `GET /api/auth/check` - Check authentication status

### Meals
- `GET /api/meals/today?location={location}` - Get today's meals for a location
- `GET /api/meals/locations` - Get available Mensa locations

### Votes
- `POST /api/votes/:mealId` - Vote on a meal (body: `{ vote_type: 'up' | 'down' }`)
- `GET /api/votes/:mealId` - Get vote counts for a meal
- `DELETE /api/votes/:mealId` - Remove your vote

### Portions
- `POST /api/portions/:mealId` - Track a meal portion (body: `{ action: 'add' | 'remove' }`)
- `GET /api/portions/:mealId` - Get portion count for a meal

### Comments
- `GET /api/comments/:mealId` - Get comments for a meal
- `POST /api/comments/:mealId` - Add a comment (body: `{ author_name: string, comment_text: string, parent_comment_id?: number }`)
- `DELETE /api/comments/:commentId` - Delete your comment (or admin delete)

### Photos
- `GET /api/photos/:mealId` - Get photos for a meal
- `POST /api/photos/:mealId` - Upload a photo (multipart/form-data with `photo` field)
- `DELETE /api/photos/:photoId` - Delete a photo (owner or admin only)
- `POST /api/photos/:photoId/comments` - Add a comment to a photo
- `GET /api/photos/:photoId/comments` - Get comments for a photo
- `POST /api/photos/:photoId/vote` - Vote on a photo
- `DELETE /api/photos/:photoId/vote` - Remove vote from a photo

## Database Schema

### meals
- `id`: Primary key
- `external_id`: Unique identifier from source
- `name`: Meal name
- `category`: Meal category (e.g., "Hauptgericht", "CampusVital")
- `date`: Date (YYYY-MM-DD)
- `mensa_location`: Location identifier
- `price_student`, `price_employee`, `price_other`: Prices
- `notes`: Dietary information and allergens

### votes
- `id`: Primary key
- `meal_id`: Foreign key to meals
- `vote_type`: 'up' or 'down'
- `ip_address`: Voter's IP (for spam prevention)
- `timestamp`: Vote timestamp
- Unique constraint on `(meal_id, ip_address)`

### portions
- `id`: Primary key
- `meal_id`: Foreign key to meals
- `ip_address`: User's IP
- `timestamp`: Timestamp

### comments
- `id`: Primary key
- `meal_id`: Foreign key to meals
- `parent_comment_id`: Optional foreign key for replies (1-level deep)
- `author_name`: Commenter's name
- `comment_text`: Comment content
- `ip_address`: Commenter's IP (for rate limiting)
- `timestamp`: Comment timestamp

### photos
- `id`: Primary key
- `meal_id`: Foreign key to meals
- `filename`: Stored filename
- `original_filename`: Original uploaded filename
- `owner_id`: Cookie-based owner identifier
- `timestamp`: Upload timestamp

### photo_comments
- Similar structure to comments, but for photos
- Includes `parent_comment_id` for nested replies

### photo_votes
- Similar structure to votes, but for photos

## Features & Security

### Authentication
- JWT-based admin authentication
- Bcrypt password hashing
- Cookie-based owner identification for photos

### Rate Limiting
- Comments: Max 5 comments per IP address per 5 minutes
- Votes: One vote per IP address per meal/photo
- Photos: Upload restrictions to prevent spam

### Input Validation
- Author names: Max 50 characters
- Comments: Max 500 characters
- HTML tags stripped to prevent XSS
- Image file type validation (JPEG, PNG, WebP)
- Image size optimization with Sharp

### Access Controls
- IP-based voting and commenting restrictions
- Owner-based photo deletion (with admin override)
- Admin-only content moderation features
- Secure authentication middleware

### Security Headers
- Helmet.js for HTTP security headers
- CORS configuration
- SQL injection prevention via parameterized queries

## Data Source

This application uses the [cvzi/mensahd](https://github.com/cvzi/mensahd) parser, which provides daily updated meal plans in OpenMensa XML Feed v2 format from:

- Base URL: `https://cvzi.github.io/mensahd/feed/hamburg_{location}.xml`
- Updated daily via GitHub Actions
- Includes meal names, categories, prices, and dietary information

## Development

### Run in development mode:
```bash
npm run dev
```

### Port Configuration:
By default, the server runs on port 3000. You can change this by setting the `PORT` environment variable:
```bash
PORT=8080 npm start
```

## Environment Variables

Configure the following in your `.env` file:

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development/production)
- `CORS_ORIGIN`: Allowed CORS origin for production
- `JWT_SECRET`: Secret key for JWT token generation (change this!)
- `ADMIN_PASSWORD`: Admin login password (change this!)
- `DATABASE_PATH`: Path to SQLite database (optional)
- `UPLOAD_PATH`: Path for photo uploads (optional)

## Deployment

### Production Checklist
1. ✅ Set strong `JWT_SECRET` and `ADMIN_PASSWORD` in `.env`
2. ✅ Configure `CORS_ORIGIN` to your domain
3. ✅ Set `NODE_ENV=production`
4. ✅ Ensure database directory has write permissions
5. ✅ Set up regular database backups
6. ✅ Configure reverse proxy (nginx/Apache) if needed
7. ✅ Set up SSL/TLS certificates
8. ✅ Review and test all security settings

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## Credits

- Meal data provided by [Studierendenwerk Hamburg](https://www.stwhh.de/)
- Data parsing via [cvzi/mensahd](https://github.com/cvzi/mensahd)
- Built with ❤️ for Universität Hamburg students

## Support

If you encounter any issues or have questions:
- Open an issue on GitHub
- Visit [pottkieker.life](https://pottkieker.life)

---

**Note**: This is a community project and is not officially affiliated with Universität Hamburg or Studierendenwerk Hamburg.
