
try {
    console.log('Attempting to require @supabase/supabase-js...');
    const supabase = require('@supabase/supabase-js');
    console.log('Success!');
} catch (err) {
    console.error('Failed to require @supabase/supabase-js:', err);
}

try {
    console.log('Attempting to require authMiddleware...');
    const auth = require('./middleware/authMiddleware');
    console.log('Success requiring authMiddleware!');
} catch (err) {
    console.error('Failed to require authMiddleware:', err);
}
