# Pottkieker.life

Source code for [pottkieker.life](https://pottkieker.life) 

## Tech Stack

### Backend
- **Runtime**: Node.js with Express.js web framework
- **Database**: SQLite3 with custom migration system
- **Authentication**: JWT (JSON Web Tokens) with bcrypt password hashing
- **Image Processing**: Sharp for photo optimization and resizing
- **File Uploads**: Multer for multipart/form-data handling
- **Security**:
  - Helmet.js for secure HTTP headers
  - CORS configuration for cross-origin requests
  - IP hashing for privacy-preserving rate limiting
  - Ownership token-based middleware for photo/comment authorization
- **Task Scheduling**: node-cron for automated meal data fetching and cleanup
- **XML Parsing**: xml2js for processing OpenMensa XML feeds

### Frontend
- **Architecture**: Vanilla JavaScript (no frameworks)
- **Pages**:
  - Main meal rating interface ([index.html](frontend/index.html))
  - User feed for photo sharing ([feed.html](frontend/feed.html))
  - Admin dashboard ([admin.html](frontend/admin.html))
- **Image Viewer**: Custom lightbox implementation with zoom and navigation
- **Styling**: Custom CSS with responsive design

### Data Source
- Meal data from [cvzi/mensahd](https://github.com/cvzi/mensahd) OpenMensa parser
- Automated daily fetching and parsing of Mensa menus

## Available Mensa Locations

- Studierendenhaus
- Blattwerk (Vegetarisch)
- Philturm

## Project Structure

```
mensa_project/
├── backend/
│   ├── server.js               # Express server setup and configuration
│   ├── database.js             # SQLite database setup with migrations
│   ├── middleware/
│   │   └── ownershipToken.js   # Cookie-based ownership verification
│   ├── routes/
│   │   ├── admin.js            # Admin panel endpoints
│   │   ├── comments.js         # Comment posting and management
│   │   ├── meals.js            # Meal data API endpoints
│   │   ├── photos.js           # Photo upload, retrieval, and deletion
│   │   ├── portions.js         # Portion size tracking
│   │   └── votes.js            # Meal rating/voting system
│   ├── utils/
│   │   ├── mensaParser.js      # XML parser for OpenMensa data
│   │   ├── mealStorage.js      # Meal data fetching and storage
│   │   ├── mealScheduler.js    # Cron jobs for automated data updates
│   │   ├── photoCleanup.js     # Automated cleanup of old photos
│   │   └── hashIP.js           # IP address hashing for privacy
│   └── uploads/                # Photo storage directory
├── frontend/
│   ├── index.html              # Main meal rating interface
│   ├── feed.html               # Photo feed and social features
│   ├── admin.html              # Admin dashboard
│   ├── app.js                  # Main application JavaScript
│   ├── feed.js                 # Feed page JavaScript
│   ├── styles.css              # Main application styles
│   ├── feed.css                # Feed page styles
│   ├── imageViewer.js          # Lightbox image viewer
│   ├── imageViewer.css         # Image viewer styles
│   ├── DESIGN_SYSTEM.md        # Design guidelines and constants
│   ├── robots.txt              # Search engine directives
│   └── sitemap.xml             # Site structure for SEO
├── database/
│   └── mensa.db                # SQLite database (auto-generated)
├── .env.example                # Environment variables template
├── .gitignore
├── package.json
├── LICENSE
└── README.md
```

## License

GPL-3.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 

## Credits

- Meal data provided by [Studierendenwerk Hamburg](https://www.stwhh.de/)
- Data parsing via [cvzi/mensahd](https://github.com/cvzi/mensahd)


**Note**: This is a community project and is not officially affiliated with Universität Hamburg or Studierendenwerk Hamburg.
