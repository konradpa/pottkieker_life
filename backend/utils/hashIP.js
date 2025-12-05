const crypto = require('crypto');

function hashIP(ip) {
  if (!ip) return null;

  const secret = process.env.JWT_SECRET || 'default-secret-change-me';
  return crypto
    .createHash('sha256')
    .update(ip + secret)
    .digest('hex');
}

module.exports = { hashIP };
