# Universität Hamburg Mensa Rating Website

A simple web application for rating and commenting on daily meals from Universität Hamburg Mensa locations.

## Features

- Display daily meal plans from multiple Mensa locations
- Upvote/downvote meals (no login required)
- Comment on meals (no login required)
- Simple, clean, mobile-responsive design
- Data fetched from cvzi/mensahd (OpenMensa parser for Hamburg)

## Tech Stack

- **Backend**: Node.js with Express
- **Database**: SQLite3
- **Frontend**: Vanilla HTML/CSS/JavaScript
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

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Open your browser**:
   Navigate to `http://localhost:3000`

## Project Structure

```
mensa_project/
├── backend/
│   ├── server.js           # Express server
│   ├── database.js         # SQLite database setup
│   ├── routes/
│   │   ├── meals.js        # Meals API endpoints
│   │   ├── votes.js        # Voting API endpoints
│   │   └── comments.js     # Comments API endpoints
│   └── utils/
│       └── mensaParser.js  # XML parser for Mensa data
├── frontend/
│   ├── index.html          # Main HTML page
│   ├── styles.css          # Styling
│   └── app.js              # Frontend JavaScript
├── database/
│   └── mensa.db            # SQLite database (created on first run)
├── package.json
└── README.md
```

## API Endpoints

### Meals
- `GET /api/meals/today?location={location}` - Get today's meals for a location
- `GET /api/meals/locations` - Get available Mensa locations

### Votes
- `POST /api/votes/:mealId` - Vote on a meal (body: `{ vote_type: 'up' | 'down' }`)
- `GET /api/votes/:mealId` - Get vote counts for a meal
- `DELETE /api/votes/:mealId` - Remove your vote

### Comments
- `GET /api/comments/:mealId` - Get comments for a meal
- `POST /api/comments/:mealId` - Add a comment (body: `{ author_name: string, comment_text: string }`)
- `DELETE /api/comments/:commentId` - Delete your comment

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

### comments
- `id`: Primary key
- `meal_id`: Foreign key to meals
- `author_name`: Commenter's name
- `comment_text`: Comment content
- `ip_address`: Commenter's IP (for rate limiting)
- `timestamp`: Comment timestamp

## Features & Security

### Rate Limiting
- Comments: Max 5 comments per IP address per 5 minutes
- Votes: One vote per IP address per meal (can be changed)

### Input Validation
- Author names: Max 50 characters
- Comments: Max 500 characters
- HTML tags stripped to prevent XSS

### IP-Based Controls
- Prevents vote manipulation
- Rate limits comment spam
- Users can only delete their own comments

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

## Future Enhancements

Potential improvements for future versions:
- User authentication system
- Weekly meal views
- Rating statistics and charts
- Favorite meals tracking
- Push notifications for favorite meals
- Admin panel for moderation
- Image uploads for meals
- Search and filter functionality

## License

MIT

## Credits

- Meal data provided by [Studierendenwerk Hamburg](https://www.stwhh.de/)
- Data parsing via [cvzi/mensahd](https://github.com/cvzi/mensahd)
- Built for Universität Hamburg students
