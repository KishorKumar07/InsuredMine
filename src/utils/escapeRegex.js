/**
 * Escapes user input before it is dropped into a MongoDB $regex query,
 * preventing regex-injection / ReDoS via crafted search strings
 * (e.g. a "username" of "(a+)+$").
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
