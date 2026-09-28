const { ok, fail } = require('../utils/apiResponse');
const { startUploadJob, getUploadJob } = require('../services/uploadService');
const { asyncHandler } = require('../middlewares/asyncHandler');

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    return fail(res, 400, 'No file uploaded. Use multipart/form-data with field name "file".');
  }
  const jobId = await startUploadJob(req.file.path, req.file.originalname);
  return ok(res, { jobId, message: 'Upload accepted, processing in a worker thread.' }, 202);
});

const getUploadStatus = asyncHandler(async (req, res) => {
  const job = await getUploadJob(req.params.jobId);
  if (!job) return fail(res, 404, 'Upload job not found');
  return ok(res, job);
});

module.exports = { uploadFile, getUploadStatus };
