// Initialize Supabase client
// We use the anon key here because we are verifying the user's token which was issued by Supabase.
// The getUser() method validates the token against Supabase's auth service.
const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

function isAdminEmail(email) {
    if (!email) return false;
    return adminEmails.includes(String(email).toLowerCase());
}

/**
 * Factory function to create the auth middleware with a Supabase client
 * @param {Object} supabase - Initialized Supabase client
 */
function createAuthMiddleware(supabase) {
    if (!supabase) {
        console.warn('Supabase client not provided to auth middleware. Auth will be disabled.');
    }

    /**
     * Middleware to verify Supabase Auth token
     * Attaches req.user if valid, otherwise leaves it null.
     * Allows for optional authentication (guest access).
     */
    return async function authMiddleware(req, res, next) {
        // Default to null (guest)
        req.user = null;
        req.isAdmin = false;

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
            req.isAdmin = user.user_metadata?.role === 'admin' || isAdminEmail(user.email);

            // Debug logging for admin check
            if (req.path?.includes('/admin')) {
                console.log('[Auth] Admin check for:', user.email);
                console.log('[Auth] Admin emails configured:', adminEmails);
                console.log('[Auth] Is admin email match:', isAdminEmail(user.email));
                console.log('[Auth] Final isAdmin:', req.isAdmin);
            }

            next();
        } catch (err) {
            console.error('Auth middleware error:', err);
            next();
        }
    };
}

module.exports = { createAuthMiddleware, isAdminEmail };
