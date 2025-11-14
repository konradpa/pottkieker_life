# Pottkieker.life

Source code for [pottkieker.life](https://pottkieker.life) 

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

## License

GPL-3.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 

## Credits

- Meal data provided by [Studierendenwerk Hamburg](https://www.stwhh.de/)
- Data parsing via [cvzi/mensahd](https://github.com/cvzi/mensahd)


**Note**: This is a community project and is not officially affiliated with Universität Hamburg or Studierendenwerk Hamburg.
