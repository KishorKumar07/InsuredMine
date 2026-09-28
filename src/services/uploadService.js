const path = require('path');
const { Worker } = require('worker_threads');
const UploadJob = require('../models/UploadJob');
const logger = require('../config/logger');
const env = require('../config/env');

const WORKER_PATH = path.join(__dirname, '..', 'workers', 'upload.worker.js');

/**
 * Creates an UploadJob record and spawns a worker_thread to do the actual
 * parsing + DB writes off the main event loop (Task 1.1).
 *
 * Returns immediately with the job id; the caller polls
 * GET /api/upload/:jobId for progress/completion.
 */
async function startUploadJob(filePath, originalFileName) {
  const job = await UploadJob.create({ originalFileName, status: 'queued' });

  const worker = new Worker(WORKER_PATH, {
    workerData: { filePath, jobId: job._id.toString(), mongoUri: env.MONGO_URI },
  });

  worker.on('message', (msg) => {
    logger.info({ jobId: job._id.toString(), msg }, 'upload worker progress');
  });
  worker.on('error', (err) => {
    logger.error({ jobId: job._id.toString(), err }, 'upload worker crashed');
  });
  worker.on('exit', (code) => {
    if (code !== 0) {
      logger.error({ jobId: job._id.toString(), code }, 'upload worker exited with non-zero code');
    } else {
      logger.info({ jobId: job._id.toString() }, 'upload worker finished');
    }
  });

  return job._id.toString();
}

async function getUploadJob(jobId) {
  return UploadJob.findById(jobId).lean();
}

module.exports = { startUploadJob, getUploadJob };
