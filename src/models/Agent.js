const mongoose = require('mongoose');

/**
 * Agent collection.
 * Sample sheet only gives us an agent name, so that is our natural
 * de-duplication key (uploads upsert on `name`).
 */
const agentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Agent', agentSchema);
