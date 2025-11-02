const crypto = require('crypto');

/**
 * Hash IP address for privacy-preserving storage
 * Uses SHA-256 with app secret as salt
 * @param {string} ip - IP address to hash
 * @returns {string} - Hashed IP address
 */
function hashIP(ip) {
  if (!ip) return null;

  const secret = process.env.JWT_SECRET || 'default-secret-change-me';
  const hash = crypto
    .createHash('sha256')
    .update(ip + secret)
    .digest('hex');

  return hash;
}

module.exports = { hashIP };
