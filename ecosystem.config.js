module.exports = {
    apps: [{
        name: 'mensa-app',
        script: './backend/server.js',
        cwd: '/opt/mensa_project',
        env: {
            NODE_ENV: 'production',
        },
        env_production: {
            NODE_ENV: 'production',
        }
    }]
};
