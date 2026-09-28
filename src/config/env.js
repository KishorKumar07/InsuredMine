const path = require('path');
require('dotenv').config();

/**
 * Centralised, typed access to environment variables.
 * Fail fast with sane defaults so the app is runnable out of the box in dev.
 */
const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,

  CPU_THRESHOLD_PERCENT: parseFloat(process.env.CPU_THRESHOLD_PERCENT) || 70,
  CPU_SAMPLE_INTERVAL_MS: parseInt(process.env.CPU_SAMPLE_INTERVAL_MS, 10) || 2000,
  CPU_CONSECUTIVE_SAMPLES: parseInt(process.env.CPU_CONSECUTIVE_SAMPLES, 10) || 3,
  CLUSTER_WORKERS: parseInt(process.env.CLUSTER_WORKERS, 10) || 1,

  MAX_UPLOAD_SIZE_MB: parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 25,
  UPLOAD_TMP_DIR: path.isAbsolute(process.env.UPLOAD_TMP_DIR || '')
    ? process.env.UPLOAD_TMP_DIR
    : path.join(process.cwd(), process.env.UPLOAD_TMP_DIR || 'uploads'),

  SCHEDULER_POLL_INTERVAL_MS: parseInt(process.env.SCHEDULER_POLL_INTERVAL_MS, 10) || 5000,
};

// MONGO_URI is read lazily (via a getter) rather than baked in at module
// load time. This matters most for tests: the worker_threads that back
// Task 1.1's upload endpoint spawn AFTER tests/setup.js has already
// pointed process.env.MONGO_URI at an in-memory Mongo instance, but this
// module is commonly require()'d (by app.js, other test files, etc.)
// before that happens, which would otherwise freeze in the wrong default.
Object.defineProperty(env, 'MONGO_URI', {
  enumerable: true,
  get() {
    return process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/insuredmine';
  },
});

module.exports = env;
