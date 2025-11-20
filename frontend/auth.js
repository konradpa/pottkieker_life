/**
 * Authentication Module
 * Handles Supabase Auth integration and UI state
 */

let supabase;
let currentUser = null;

// Initialize Auth
async function initAuth() {
    try {
        // Fetch config from backend
        const response = await fetch('/api/config');
        const config = await response.json();

        if (!config.supabaseUrl || !config.supabaseKey) {
            console.warn('Supabase config missing');
            updateAuthUI(null);
            return;
        }

        // Initialize Supabase
        supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);

        // Check current session
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;
        updateAuthUI(currentUser);

        // Listen for auth changes
        supabase.auth.onAuthStateChange((event, session) => {
            currentUser = session?.user || null;
            updateAuthUI(currentUser);

            // Reload page on sign in/out to refresh data state if needed
            // or just let the app handle it. For now, we update UI.
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                // Optional: window.location.reload();
            }
        });

    } catch (err) {
        console.error('Auth initialization failed:', err);
        updateAuthUI(null);
    }
}

// UI Updates
function updateAuthUI(user) {
    const authContainer = document.getElementById('auth-container');
    if (!authContainer) return;

    if (user) {
        // User is logged in
        const email = user.email || 'User';
        const shortEmail = email.split('@')[0];

        authContainer.innerHTML = `
            <div class="user-profile">
                <span class="user-label">[ USER: ${shortEmail.toUpperCase()} ]</span>
                <button id="logout-btn" class="auth-btn">[ LOGOUT ]</button>
            </div>
        `;

        document.getElementById('logout-btn').addEventListener('click', signOut);
    } else {
        // User is guest
        authContainer.innerHTML = `
            <button id="login-btn" class="auth-btn">[ LOGIN ]</button>
        `;

        document.getElementById('login-btn').addEventListener('click', showLoginModal);
    }
}

// Login Modal
function showLoginModal() {
    // Create modal if not exists
    let modal = document.getElementById('login-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'login-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content reactor-panel">
                <div class="modal-header">
                    <h2>[ AUTHENTICATION ]</h2>
                    <button class="close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div class="auth-tabs">
                        <button class="tab-btn active" data-tab="email">[ EMAIL ]</button>
                        <button class="tab-btn" data-tab="google">[ GOOGLE ]</button>
                    </div>
                    
                    <div id="email-tab" class="tab-content active">
                        <form id="email-login-form">
                            <div class="form-group">
                                <label>[ EMAIL ]</label>
                                <input type="email" id="email-input" required placeholder="user@example.com">
                            </div>
                            <div class="form-group">
                                <label>[ PASSWORD ]</label>
                                <input type="password" id="password-input" required placeholder="*******">
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="action-btn">[ SIGN IN ]</button>
                                <button type="button" id="signup-btn" class="text-btn">[ CREATE ACCOUNT ]</button>
                            </div>
                            <div id="auth-error" class="error-msg"></div>
                        </form>
                    </div>
                    
                    <div id="google-tab" class="tab-content">
                        <p class="info-text">Sign in with your Google account</p>
                        <button id="google-login-btn" class="google-btn">
                            [ CONTINUE WITH GOOGLE ]
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('.close-btn').addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        // Tabs
        const tabs = modal.querySelectorAll('.tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const tabId = tab.dataset.tab;
                modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(`${tabId}-tab`).classList.add('active');
            });
        });

        // Forms
        document.getElementById('email-login-form').addEventListener('submit', handleEmailLogin);
        document.getElementById('signup-btn').addEventListener('click', handleEmailSignup);
        document.getElementById('google-login-btn').addEventListener('click', handleGoogleLogin);
    }

    modal.style.display = 'flex';
}

// Auth Actions
async function handleEmailLogin(e) {
    e.preventDefault();
    if (!supabase) return;
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    const errorEl = document.getElementById('auth-error');

    errorEl.textContent = 'Authenticating...';

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        errorEl.textContent = `[ ERROR: ${error.message} ]`;
    } else {
        document.getElementById('login-modal').style.display = 'none';
    }
}

async function handleEmailSignup() {
    if (!supabase) return;
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    const errorEl = document.getElementById('auth-error');

    if (!email || !password) {
        errorEl.textContent = '[ ERROR: Email and password required ]';
        return;
    }

    errorEl.textContent = 'Creating account...';

    const { error } = await supabase.auth.signUp({
        email,
        password
    });

    if (error) {
        errorEl.textContent = `[ ERROR: ${error.message} ]`;
    } else {
        errorEl.textContent = '[ SUCCESS: Check email for confirmation ]';
    }
}

async function handleGoogleLogin() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });

    if (error) {
        alert(`Login failed: ${error.message}`);
    }
}

async function signOut() {
    await supabase.auth.signOut();
}

// Helper to get token for API calls
async function getAuthToken() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

// Export for app.js
window.auth = {
    init: initAuth,
    getToken: getAuthToken,
    getUser: () => currentUser
};

// Initialize on load
document.addEventListener('DOMContentLoaded', initAuth);
