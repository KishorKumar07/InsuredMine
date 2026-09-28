const mongoose = require('mongoose');

/**
 * The final resting place of a message once its scheduled time arrives.
 * Kept separate from ScheduledMessage so "pending schedule" and
 * "delivered message" are distinct, queryable concepts.
 */
const messageSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    scheduledMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledMessage' },
    deliveredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
