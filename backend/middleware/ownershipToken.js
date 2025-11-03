const crypto = require('crypto');

// Name of the ownership cookie used to associate uploads with a device/browser.
const OWNER_COOKIE_NAME = 'mensa_owner_id';

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [rawKey, ...rawValParts] = pair.split('=');
    if (!rawKey) return acc;
    const key = rawKey.trim();
    const value = rawValParts.join('=').trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildCookie(token) {
  const oneYearSeconds = 60 * 60 * 24 * 365;
  const parts = [
    `${OWNER_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${oneYearSeconds}`,
    'HttpOnly',
    'SameSite=Lax'
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function appendCookie(res, cookieString) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieString);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieString]);
    return;
  }

  res.setHeader('Set-Cookie', [existing, cookieString]);
}

/**
 * Middleware that ensures each client request carries an ownership token.
 * - Generates a random token if none exists or the format is invalid.
 * - Stores the raw token and its hash on the request object.
 * - Persists the token in a long-lived, minimal cookie.
 */
function ownershipTokenMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const candidate = cookies[OWNER_COOKIE_NAME];
  const tokenIsValid = typeof candidate === 'string' && /^[a-f0-9]{64}$/.test(candidate);

  const token = tokenIsValid ? candidate : generateToken();
  if (!tokenIsValid) {
    appendCookie(res, buildCookie(token));
  }

  req.ownerToken = token;
  req.ownerTokenHash = hashToken(token);

  next();
}

module.exports = {
  OWNER_COOKIE_NAME,
  ownershipTokenMiddleware,
  hashToken
};
