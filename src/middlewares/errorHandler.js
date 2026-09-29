const multer = require('multer');
const logger = require('../config/logger');
const { fail } = require('../utils/apiResponse');

function notFoundHandler(req, res) {
  return fail(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  } else {
    logger.warn({ message: err.message, path: req.originalUrl }, 'Request error');
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return fail(res, 409, 'Duplicate key conflict', err.keyValue);
  }
  // Mongoose CastError - a malformed id in the URL (e.g. /api/upload/zzz) is a
  // CLIENT mistake, not a server failure. Without this branch it falls through
  // to the generic 500 below and echoes Mongoose's raw message, which also
  // leaks the internal model name back to the caller.
  if (err.name === 'CastError') {
    return fail(res, 400, `Invalid ${err.path || 'id'}`);
  }
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return fail(res, 400, 'Validation failed', err.errors);
  }
  // Multer errors (file too large, unexpected field, etc.) and our own
  // fileFilter rejection (a plain Error, not a MulterError) are both
  // client mistakes, not server failures.
  if (err instanceof multer.MulterError) {
    return fail(res, 400, err.message);
  }
  if (err.message && /Unsupported file type/.test(err.message)) {
    return fail(res, 400, err.message);
  }

  return fail(res, status, err.message || 'Internal server error');
}

module.exports = { notFoundHandler, errorHandler };
