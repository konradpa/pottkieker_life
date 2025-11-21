const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
// We use the anon key here because we are verifying the user's token which was issued by Supabase.
// The getUser() method validates the token against Supabase's auth service.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('Supabase credentials not found in .env. Auth middleware will be disabled.');
}

/**
 * Middleware to verify Supabase Auth token
 * Attaches req.user if valid, otherwise leaves it null.
 * Allows for optional authentication (guest access).
 */
async function authMiddleware(req, res, next) {
    // Default to null (guest)
    req.user = null;

    if (!supabase) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            // Token invalid or expired
            // We don't error out, just treat as guest
            return next();
        }

        // Attach user info to request
        req.user = {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata || {}
        };

        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        next();
    }
}

module.exports = { authMiddleware };
