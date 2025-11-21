
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { createAuthMiddleware } = require('./middleware/authMiddleware');

console.log('Starting verification...');

try {
    console.log('1. Testing Supabase client initialization...');
    const supabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'public-anon-key';
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('   Supabase client initialized successfully.');

    console.log('2. Testing auth middleware creation...');
    const authMiddleware = createAuthMiddleware(supabase);

    if (typeof authMiddleware === 'function') {
        console.log('   Auth middleware created successfully.');
    } else {
        throw new Error('Auth middleware is not a function');
    }

    console.log('Verification passed!');
} catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
}
