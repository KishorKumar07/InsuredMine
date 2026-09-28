const mongoose = require('mongoose');

/**
 * Tracks the status/progress of an async (worker-thread) file ingestion job
 * so the client can poll GET /api/upload/:jobId instead of holding a
 * long-lived HTTP connection open for a 1000+ row file.
 */
const uploadJobSchema = new mongoose.Schema(
  {
    originalFileName: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    totalRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    insertedCounts: {
      agents: { type: Number, default: 0 },
      users: { type: Number, default: 0 },
      accounts: { type: Number, default: 0 },
      categories: { type: Number, default: 0 },
      carriers: { type: Number, default: 0 },
      policies: { type: Number, default: 0 },
    },
    errors: [
      {
        row: Number,
        message: String,
      },
    ],
    startedAt: { type: Date },
    finishedAt: { type: Date },
    failureReason: { type: String },
  },
  // `errors` collides with a reserved Mongoose internal name; we intentionally
  // keep the field name (it reads clearly in the API response) and silence
  // the cosmetic warning - it doesn't affect a plain array-of-subdocuments field.
  { timestamps: true, suppressReservedKeysWarning: true }
);

module.exports = mongoose.model('UploadJob', uploadJobSchema);
