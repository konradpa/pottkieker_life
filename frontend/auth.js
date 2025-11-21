/**
 * Authentication Module
 * Handles Supabase Auth integration and UI state
 */

let supabase;
let currentUser = null;
let authMode = 'signin'; // signin | signup
let authInputsBound = false;
const PENDING_USERNAME_KEY = 'pending_username';
const USERNAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
let userMenuOutsideListenerBound = false;

function getDisplayNameFromUser(user) {
    if (!user) return null;
    const username = user.user_metadata?.username;
    if (username && username.trim()) return username.trim();
    const email = user.email;
    if (email) return email.split('@')[0];
    return null;
}

function getLastUsernameChange(user) {
    const ts = user?.user_metadata?.last_username_change;
    if (!ts) return null;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
}

function getUsernameCooldownMs(user) {
    const last = getLastUsernameChange(user);
    if (!last) return 0;
    const diff = Date.now() - last.getTime();
    return Math.max(USERNAME_COOLDOWN_MS - diff, 0);
}

function formatDuration(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;');
}

// Initialize Auth
async function initAuth() {
    // Always render a baseline guest UI so the login button exists even if config fetch fails
    updateAuthUI(currentUser);

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
        await applyPendingUsername(session?.user);

        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            currentUser = session?.user || null;
            updateAuthUI(currentUser);
            await applyPendingUsername(session?.user);

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

// Ensure we still open the modal even if the button is re-rendered
function setupLoginButtonFallback() {
    document.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('#login-btn');
        if (targetBtn) {
            e.preventDefault();
            showLoginModal();
        }
    });
}

function toggleUserMenu(open) {
    const menu = document.getElementById('user-menu');
    if (!menu) return;
    if (open) {
        menu.classList.add('open');
    } else {
        menu.classList.remove('open');
    }
}

function wireUserMenu(user) {
    const toggle = document.getElementById('user-menu-toggle');
    const logoutBtn = document.getElementById('logout-btn');
    const saveBtn = document.getElementById('username-save-btn');
    const usernameInput = document.getElementById('username-input-menu');
    const errorEl = document.getElementById('username-error');

    if (usernameInput) {
        usernameInput.value = getDisplayNameFromUser(user) || '';
    }
    updateUsernameMetaUI(user);
    if (errorEl) errorEl.textContent = '';

    if (toggle) {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = document.getElementById('user-menu')?.classList.contains('open');
            toggleUserMenu(!isOpen);
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', signOut);
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', handleUsernameUpdate);
    }

    if (!userMenuOutsideListenerBound) {
        document.addEventListener('click', (e) => {
            const profile = document.querySelector('.user-profile');
            if (profile && !profile.contains(e.target)) {
                toggleUserMenu(false);
            }
        });
        userMenuOutsideListenerBound = true;
    }
}

// UI Updates
function updateAuthUI(user) {
    const authContainer = document.getElementById('auth-container');
    if (authContainer) {
        if (user) {
            // User is logged in
            const display = getDisplayNameFromUser(user) || 'User';

            authContainer.innerHTML = `
                <div class="user-profile">
                    <button id="user-menu-toggle" class="user-pill">[ USER: ${escapeAttr(display).toUpperCase()} ]</button>
                    <div id="user-menu" class="user-menu">
                        <div class="user-menu-section">
                            <label class="user-menu-label">[ CHANGE USERNAME ]</label>
                            <input type="text" id="username-input-menu" maxlength="32" value="${escapeAttr(display)}" placeholder="new username">
                            <div id="username-meta" class="user-menu-meta"></div>
                            <div id="username-error" class="user-menu-error"></div>
                            <button id="username-save-btn" class="auth-btn auth-btn-compact">Update Username</button>
                        </div>
                        <button id="logout-btn" class="auth-btn auth-btn-compact logout-btn">[ LOGOUT ]</button>
                    </div>
                </div>
            `;

            wireUserMenu(user);
        } else {
        // User is guest
        authContainer.innerHTML = `
            <button id="login-btn" class="auth-btn">[ LOGIN ]</button>
        `;

            document.getElementById('login-btn').addEventListener('click', showLoginModal);
        }
    }
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: { user } }));
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
                                <div id="auth-mode-label" class="info-text">Sign in to your account</div>
                            </div>
                            <div class="form-group" id="username-group" style="display:none;">
                                <label>[ USERNAME ]</label>
                                <input type="text" id="username-input" maxlength="32" placeholder="choose a username">
                            </div>
                            <div class="form-group">
                                <label>[ EMAIL ]</label>
                                <input type="email" id="email-input" required placeholder="user@example.com">
                            </div>
                            <div class="form-group">
                                <label>[ PASSWORD ]</label>
                                <input type="password" id="password-input" required placeholder="*******">
                            </div>
                            <div class="form-actions">
                                <button type="submit" id="primary-auth-btn" class="action-btn">[ SIGN IN ]</button>
                                <button type="button" id="signup-btn" class="text-btn">[ CREATE ACCOUNT ]</button>
                            </div>
                            <div id="auth-error" class="error-msg"></div>
                        </form>
                    </div>
                    
                    <div id="google-tab" class="tab-content">
                        <p class="info-text">Sign in with your Google account</p>
                        <div class="form-group">
                            <label>[ USERNAME ]</label>
                            <input type="text" id="google-username-input" maxlength="32" placeholder="choose a username">
                        </div>
                        <p class="info-text">We’ll set this as your display name after Google login.</p>
                        <button id="google-login-btn" class="google-btn">
                            [ CONTINUE WITH GOOGLE ]
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('.close-btn').addEventListener('click', closeLoginModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeLoginModal();
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
        document.getElementById('email-login-form').addEventListener('submit', handleAuthSubmit);
        document.getElementById('signup-btn').addEventListener('click', toggleAuthMode);
        document.getElementById('google-login-btn').addEventListener('click', handleGoogleLogin);
        setupAuthInputListeners();
    }

    setAuthMode('signin');
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
}

function closeLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    document.body.classList.remove('modal-open');
}

function setupAuthInputListeners() {
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    const usernameInput = document.getElementById('username-input');
    const googleUsernameInput = document.getElementById('google-username-input');
    const primaryBtn = document.getElementById('primary-auth-btn');

    const updateState = () => {
        const email = emailInput?.value.trim() || '';
        const password = passwordInput?.value.trim() || '';
        const username = usernameInput?.value.trim() || '';
        const needsUsername = authMode === 'signup';
        const hasBasics = email.length > 0 && password.length > 0;
        const enabled = hasBasics && (!needsUsername || username.length > 0);

        if (primaryBtn) {
            primaryBtn.disabled = !enabled;
        }
    };

    if (!authInputsBound) {
        emailInput?.addEventListener('input', updateState);
        passwordInput?.addEventListener('input', updateState);
        usernameInput?.addEventListener('input', updateState);
        googleUsernameInput?.addEventListener('input', () => {
            const val = googleUsernameInput.value.trim();
            document.getElementById('google-login-btn').disabled = val.length === 0;
        });
        authInputsBound = true;
    }
    const googleBtn = document.getElementById('google-login-btn');
    if (googleBtn && googleUsernameInput) {
        googleBtn.disabled = (googleUsernameInput.value.trim().length === 0);
    }
    updateState();
}

function setAuthMode(mode) {
    authMode = mode;
    const usernameGroup = document.getElementById('username-group');
    const primaryBtn = document.getElementById('primary-auth-btn');
    const toggleBtn = document.getElementById('signup-btn');
    const modeLabel = document.getElementById('auth-mode-label');

    const isSignup = mode === 'signup';
    if (usernameGroup) usernameGroup.style.display = isSignup ? 'flex' : 'none';
    if (primaryBtn) primaryBtn.textContent = isSignup ? '[ CREATE ACCOUNT ]' : '[ SIGN IN ]';
    if (toggleBtn) toggleBtn.textContent = isSignup ? '[ BACK TO SIGN IN ]' : '[ CREATE ACCOUNT ]';
    if (modeLabel) modeLabel.textContent = isSignup ? 'Create a new account' : 'Sign in to your account';

    setupAuthInputListeners();
}

function toggleAuthMode() {
    setAuthMode(authMode === 'signup' ? 'signin' : 'signup');
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    if (authMode === 'signup') {
        await handleEmailSignup();
    } else {
        await handleEmailLogin(e);
    }
}

// Auth Actions
async function handleEmailLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById('auth-error');
    if (!supabase) {
        if (errorEl) errorEl.textContent = '[ ERROR: Auth not configured ]';
        return;
    }
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    if (!emailInput || !passwordInput) {
        if (errorEl) errorEl.textContent = '[ ERROR: Auth form not ready ]';
        return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    errorEl.textContent = 'Authenticating...';

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        errorEl.textContent = `[ ERROR: ${error.message} ]`;
    } else {
        closeLoginModal();
    }
}

async function handleEmailSignup() {
    const errorEl = document.getElementById('auth-error');
    if (!supabase) {
        if (errorEl) errorEl.textContent = '[ ERROR: Auth not configured ]';
        return;
    }
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    const usernameInput = document.getElementById('username-input');

    if (!emailInput || !passwordInput) {
        if (errorEl) errorEl.textContent = '[ ERROR: Auth form not ready ]';
        return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const username = usernameInput?.value.trim() || '';

    if (!email || !password) {
        errorEl.textContent = '[ ERROR: Email and password required ]';
        return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errorEl.textContent = '[ ERROR: Please enter a valid email address ]';
        return;
    }

    if (password.length < 6) {
        errorEl.textContent = '[ ERROR: Password must be at least 6 characters ]';
        return;
    }

    if (!username) {
        errorEl.textContent = '[ ERROR: Username required ]';
        return;
    }

    errorEl.textContent = 'Creating account...';

    console.debug('[auth] signup attempt', { email, passwordLength: password.length, usernameLength: username.length });

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: window.location.origin,
            data: { username, last_username_change: new Date().toISOString() }
        }
    });

    console.debug('[auth] signup response', { data, error });

    if (error) {
        errorEl.textContent = `[ ERROR: ${error.message} ]`;
    } else {
        errorEl.textContent = '[ SUCCESS: Check email for confirmation ]';
    }
}

async function handleGoogleLogin() {
    const errorEl = document.getElementById('auth-error');
    if (!supabase) {
        if (errorEl) errorEl.textContent = '[ ERROR: Auth not configured ]';
        return;
    }
    const googleUsernameInput = document.getElementById('google-username-input');
    const desiredUsername = googleUsernameInput?.value.trim() || '';

    if (!desiredUsername) {
        if (errorEl) errorEl.textContent = '[ ERROR: Username required for Google login ]';
        return;
    }

    localStorage.setItem(PENDING_USERNAME_KEY, desiredUsername);

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

async function handleUsernameUpdate() {
    const errorEl = document.getElementById('username-error');
    const input = document.getElementById('username-input-menu');
    const metaEl = document.getElementById('username-meta');

    if (errorEl) errorEl.textContent = '';
    if (metaEl) metaEl.textContent = '';

    if (!supabase || !currentUser) {
        if (errorEl) errorEl.textContent = '[ ERROR: Auth not ready ]';
        return;
    }

    if (!input) {
        if (errorEl) errorEl.textContent = '[ ERROR: Username input missing ]';
        return;
    }

    const newUsername = input.value.trim();
    const currentDisplay = getDisplayNameFromUser(currentUser) || '';

    if (!newUsername) {
        if (errorEl) errorEl.textContent = '[ ERROR: Username required ]';
        return;
    }

    if (!USERNAME_REGEX.test(newUsername)) {
        if (errorEl) errorEl.textContent = '[ ERROR: 3-32 chars using letters, numbers, . _ - ]';
        return;
    }

    const remaining = getUsernameCooldownMs(currentUser);
    if (remaining > 0) {
        if (errorEl) errorEl.textContent = `[ ERROR: Next change in ${formatDuration(remaining)} ]`;
        return;
    }

    if (newUsername.toLowerCase() === currentDisplay.toLowerCase()) {
        if (metaEl) metaEl.textContent = '[ Username unchanged ]';
        return;
    }

    if (metaEl) metaEl.textContent = 'Updating...';

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase.auth.updateUser({
        data: {
            username: newUsername,
            last_username_change: nowIso
        }
    });

    if (error) {
        if (errorEl) errorEl.textContent = `[ ERROR: ${error.message} ]`;
        if (metaEl) metaEl.textContent = '';
        return;
    }

    currentUser = data?.user || currentUser;
    updateAuthUI(currentUser);
    toggleUserMenu(false);
    const meta = document.getElementById('username-meta');
    if (meta) meta.textContent = '[ Username updated ]';
}

function updateUsernameMetaUI(user) {
    const metaEl = document.getElementById('username-meta');
    if (!metaEl) return;
    const remaining = getUsernameCooldownMs(user);
    if (remaining > 0) {
        metaEl.textContent = `[ Next change in ${formatDuration(remaining)} ]`;
    } else {
        metaEl.textContent = '[ You can update once every 24h ]';
    }
}

// Pending username handling for OAuth (Google)
function getPendingUsername() {
    return localStorage.getItem(PENDING_USERNAME_KEY);
}

function clearPendingUsername() {
    localStorage.removeItem(PENDING_USERNAME_KEY);
}

async function applyPendingUsername(user) {
    if (!supabase || !user) return;
    const pending = getPendingUsername();
    if (!pending) return;

    if (user.user_metadata && user.user_metadata.username) {
        clearPendingUsername();
        return;
    }

    try {
        const { error, data } = await supabase.auth.updateUser({
            data: { username: pending, last_username_change: new Date().toISOString() }
        });
        if (error) {
            console.warn('Failed to set username after OAuth:', error.message);
        } else {
            clearPendingUsername();
            currentUser = data?.user || { ...user, user_metadata: { ...(user.user_metadata || {}), username: pending, last_username_change: new Date().toISOString() } };
            updateAuthUI(currentUser);
        }
    } catch (err) {
        console.error('Error applying pending username:', err);
    }
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
    getUser: () => currentUser,
    getDisplayName: () => getDisplayNameFromUser(currentUser)
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    setupLoginButtonFallback();
    initAuth();
});
