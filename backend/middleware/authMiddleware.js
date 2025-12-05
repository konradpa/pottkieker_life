const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

function isAdminEmail(email) {
    if (!email) return false;
    return adminEmails.includes(String(email).toLowerCase());
}

function createAuthMiddleware(supabase) {
    if (!supabase) {
        console.warn('Supabase client not provided to auth middleware. Auth will be disabled.');
    }

    return async function authMiddleware(req, res, next) {
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
                return next();
            }

            req.user = {
                id: user.id,
                email: user.email,
                user_metadata: user.user_metadata || {}
            };
            req.isAdmin = user.user_metadata?.role === 'admin' || isAdminEmail(user.email);

            next();
        } catch (err) {
            console.error('Auth middleware error:', err);
            next();
        }
    };
}

module.exports = { createAuthMiddleware, isAdminEmail };
