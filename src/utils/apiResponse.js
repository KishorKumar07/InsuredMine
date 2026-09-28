/**
 * Consistent API envelope: { success, data } on the happy path,
 * { success: false, error: { message, details } } on failure.
 */
function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, status, message, details) {
  return res.status(status).json({
    success: false,
    error: { message, ...(details !== undefined ? { details } : {}) },
  });
}

module.exports = { ok, fail };
