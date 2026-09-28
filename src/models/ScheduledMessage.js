const mongoose = require('mongoose');

/**
 * Task 2.2 - a message the caller wants inserted into the DB at a future
 * day+time. Stored persistently (not an in-memory setTimeout) so that it
 * survives the server restarts triggered by Task 2.1's CPU monitor, and so
 * a missed run is recovered on the next boot.
 */
const scheduledMessageSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    day: { type: String, required: true, trim: true }, // raw input, e.g. "2026-09-30" or "Monday"
    time: { type: String, required: true, trim: true }, // raw input, e.g. "14:30"
    timezoneOffsetMinutes: { type: Number, default: 0 }, // minutes to ADD to local time to get UTC

    scheduledAt: { type: Date, required: true, index: true }, // resolved absolute UTC instant
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    processedAt: { type: Date },
    resultingMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  },
  { timestamps: true }
);

scheduledMessageSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('ScheduledMessage', scheduledMessageSchema);
