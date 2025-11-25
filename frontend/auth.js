/**
 * Authentication Module
 * Handles Supabase Auth integration and UI state
 */

let supabase;
let currentUser = null;
let authMode = 'signin'; // signin | signup
let authInputsBound = false;
const USERNAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
let userMenuOutsideListenerBound = false;
let streakInfo = null;

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

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

async function authFetch(url, options = {}) {
    const token = await getAuthToken();
    const headers = { ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
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

        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
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
    const changeUsernameBtn = document.getElementById('change-username-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    const saveBtn = document.getElementById('username-save-btn');
    const backBtn = document.getElementById('username-back-btn');
    const usernameInput = document.getElementById('username-input-menu');
    const usernameDisplay = document.getElementById('username-display');
    const errorEl = document.getElementById('username-error');
    const mainView = document.getElementById('menu-main-view');
    const usernameView = document.getElementById('menu-username-view');

    if (usernameInput) {
        usernameInput.value = getDisplayNameFromUser(user) || '';
    }
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

    if (changeUsernameBtn) {
        changeUsernameBtn.addEventListener('click', () => {
            mainView.style.display = 'none';
            usernameView.style.display = 'block';
            usernameInput.focus();
        });
    }

    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', handleDeleteAccount);
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            mainView.style.display = 'block';
            usernameView.style.display = 'none';
            if (errorEl) errorEl.textContent = '';
            usernameInput.value = getDisplayNameFromUser(user) || '';
        });
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

    fetchAndRenderStreak();
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
                        <div id="menu-main-view">
                            <button id="change-username-btn" class="auth-btn auth-btn-compact menu-option-btn">Change Username</button>
                            <button id="delete-account-btn" class="auth-btn auth-btn-compact menu-option-btn danger-btn">Delete Account</button>
                            <button id="logout-btn" class="auth-btn auth-btn-compact logout-btn">[ LOGOUT ]</button>
                        </div>
                        <div id="menu-username-view" style="display:none;">
                            <div class="user-menu-section">
                                <label class="user-menu-label">[ CHANGE USERNAME ]</label>
                                <div id="username-display" class="username-display">${escapeHtml(display)}</div>
                                <input type="text" id="username-input-menu" maxlength="32" value="${escapeAttr(display)}" placeholder="new username">
                                <div id="username-error" class="user-menu-error"></div>
                                <button id="username-save-btn" class="auth-btn auth-btn-compact">Save</button>
                                <button id="username-back-btn" class="auth-btn auth-btn-compact">Back</button>
                            </div>
                        </div>
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

    // Update streak display in header
    updateStreakDisplay();
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
                                <input type="email" id="email-input" required placeholder="user@studium.uni-hamburg.de">
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
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('.close-btn').addEventListener('click', closeLoginModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeLoginModal();
        });

        // Forms
        document.getElementById('email-login-form').addEventListener('submit', handleAuthSubmit);
        document.getElementById('signup-btn').addEventListener('click', toggleAuthMode);
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
        authInputsBound = true;
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

    // Validate email domain (only allow @studium.uni-hamburg.de or @uni-hamburg.de)
    const emailLower = email.toLowerCase();
    if (!emailLower.endsWith('@studium.uni-hamburg.de') && !emailLower.endsWith('@uni-hamburg.de')) {
        errorEl.textContent = '[ ERROR: Only @studium.uni-hamburg.de or @uni-hamburg.de email addresses are allowed ]';
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
            emailRedirectTo: 'https://pottkieker.life',
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


async function signOut() {
    await supabase.auth.signOut();
}

async function handleUsernameUpdate() {
    const errorEl = document.getElementById('username-error');
    const input = document.getElementById('username-input-menu');
    const mainView = document.getElementById('menu-main-view');
    const usernameView = document.getElementById('menu-username-view');

    if (errorEl) errorEl.textContent = '';

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
        if (errorEl) errorEl.textContent = '[ ERROR: You can only change username once per 24h ]';
        return;
    }

    if (newUsername.toLowerCase() === currentDisplay.toLowerCase()) {
        if (errorEl) errorEl.textContent = '[ Username unchanged ]';
        return;
    }

    if (errorEl) errorEl.textContent = 'Updating...';

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase.auth.updateUser({
        data: {
            username: newUsername,
            last_username_change: nowIso
        }
    });

    if (error) {
        if (errorEl) errorEl.textContent = `[ ERROR: ${error.message} ]`;
        return;
    }

    currentUser = data?.user || currentUser;

    // Return to main menu view
    if (mainView) mainView.style.display = 'block';
    if (usernameView) usernameView.style.display = 'none';
    if (errorEl) errorEl.textContent = '';

    toggleUserMenu(false);
    updateAuthUI(currentUser);
}

async function handleDeleteAccount() {
    const confirmed = confirm(
        'Are you sure you want to delete your account?\n\n' +
        'This will permanently delete:\n' +
        '- Your account and profile\n' +
        '- All your uploaded photos\n' +
        '- All your comments\n' +
        '- Your streak data\n\n' +
        'This action CANNOT be undone!'
    );

    if (!confirmed) return;

    const doubleConfirm = prompt(
        'Type "DELETE" (in capital letters) to confirm account deletion:'
    );

    if (doubleConfirm !== 'DELETE') {
        alert('Account deletion cancelled.');
        return;
    }

    if (!supabase || !currentUser) {
        alert('Error: Authentication not ready');
        return;
    }

    try {
        // Call backend to delete user data
        const token = await getAuthToken();
        const response = await fetch('/api/user/delete', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete user data');
        }

        // Delete Supabase auth account
        const { error } = await supabase.auth.admin.deleteUser(currentUser.id);

        if (error) {
            // If admin delete fails, try regular sign out
            console.error('Admin delete failed, signing out instead:', error);
            await supabase.auth.signOut();
            alert('Your data has been deleted. Please contact support to fully remove your account.');
        } else {
            alert('Your account has been successfully deleted.');
        }

        // Reload page
        window.location.reload();
    } catch (err) {
        console.error('Delete account error:', err);
        alert('Failed to delete account. Please try again or contact support.');
    }
}

async function fetchAndRenderStreak() {
    if (!currentUser) {
        streakInfo = null;
        updateStreakDisplay();
        return;
    }
    try {
        const res = await authFetch('/api/streaks/me');
        if (!res.ok) throw new Error('Failed');
        streakInfo = await res.json();
    } catch (e) {
        console.error('Failed to fetch streak:', e);
        streakInfo = null;
    }
    updateStreakDisplay();
}

async function updateStreakDisplay() {
    let streakContainer = document.getElementById('streak-display-container');

    // Get or create streak container in header
    if (!streakContainer) {
        const header = document.querySelector('header');
        if (!header) return;

        streakContainer = document.createElement('div');
        streakContainer.id = 'streak-display-container';
        streakContainer.className = 'streak-display-container';

        // Insert before auth-container
        const authContainer = document.getElementById('auth-container');
        if (authContainer) {
            header.insertBefore(streakContainer, authContainer);
        } else {
            header.appendChild(streakContainer);
        }
    }

    streakContainer.style.display = 'block';

    try {
        // Fetch leaderboard (public endpoint, works without auth)
        const lbRes = await fetch('/api/streaks/leaderboard');

        if (!lbRes.ok) {
            streakContainer.innerHTML = '<div class="streak-info">[ Streaks unavailable ]</div>';
            return;
        }

        const lbData = await lbRes.json();
        const topThree = (lbData.leaderboard || []).slice(0, 3);

        let sections = [];

        // Show personal streak only when logged in
        if (currentUser) {
            let myStreak = streakInfo;
            if (!myStreak) {
                const meRes = await authFetch('/api/streaks/me');
                if (meRes.ok) {
                    myStreak = await meRes.json();
                }
            }

            if (myStreak) {
                sections.push(`<div class="streak-item streak-own">
                    <span class="streak-label">Photos in a row:</span>
                    <span class="streak-value">${myStreak.current_streak || 0}🔥</span>
                </div>`);
            }
        }

        // Show top 3 (always visible)
        if (topThree.length > 0) {
            const topHtml = ['<div class="streak-item streak-top3">', '<span class="streak-label">Top 3:</span>'];
            topThree.forEach((row, idx) => {
                const name = row.display_name || 'User';
                const medal = ['🥇', '🥈', '🥉'][idx];
                topHtml.push(`<span class="streak-top-entry">${medal} ${escapeHtml(name)}: ${row.current_streak}🔥</span>`);
            });
            topHtml.push('</div>');
            sections.push(topHtml.join(''));
        } else {
            // No streaks exist yet
            sections.push('<div class="streak-item"><span class="streak-label">No streaks yet - be the first!</span></div>');
        }

        const html = `<div class="streak-info streak-clickable">${sections.join('<div class="streak-divider">|</div>')}</div>`;
        streakContainer.innerHTML = html;

        // Make streak bar clickable
        const streakInfoEl = streakContainer.querySelector('.streak-info');
        if (streakInfoEl) {
            streakInfoEl.style.cursor = 'pointer';
            streakInfoEl.onclick = () => {
                if (currentUser) {
                    // Logged in: show leaderboard
                    showLeaderboardModal(10);
                } else {
                    // Not logged in: show login modal
                    showLoginModal();
                }
            };
        }

    } catch (e) {
        console.error('Failed to update streak display:', e);
        streakContainer.innerHTML = '<div class="streak-info">[ Streaks unavailable ]</div>';
    }
}

async function showLeaderboardModal(limit = 10) {
    let modal = document.getElementById('streak-leaderboard-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'streak-leaderboard-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content reactor-panel">
                <div class="modal-header">
                    <h2>[ STREAK LEADERBOARD ]</h2>
                    <button class="close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div id="leaderboard-list" class="leaderboard-list">Loading...</div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        });
    }

    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    const listEl = modal.querySelector('#leaderboard-list');
    listEl.textContent = 'Loading...';
    try {
        const res = await authFetch('/api/streaks/leaderboard');
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const rows = data.leaderboard || [];
        if (!rows.length) {
            listEl.textContent = 'No streaks yet.';
        } else {
            const limitedRows = rows.slice(0, limit);
            listEl.innerHTML = limitedRows.map((row, idx) => {
                const name = row.display_name || 'User';
                const isCurrentUser = currentUser && row.user_id === currentUser.id;
                const rowClass = isCurrentUser ? 'leaderboard-row current-user' : 'leaderboard-row';
                return `<div class="${rowClass}">
                    <span class="lb-rank">#${idx + 1}</span>
                    <span class="lb-name">${escapeHtml(name)}${isCurrentUser ? ' (You)' : ''}</span>
                    <span class="lb-streak">${row.current_streak}🔥 (Best ${row.longest_streak})</span>
                </div>`;
            }).join('');
        }
    } catch (err) {
        listEl.textContent = 'Failed to load leaderboard.';
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
