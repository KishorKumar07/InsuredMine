const mongoose = require('mongoose');

/**
 * Policy Carrier collection.
 */
const carrierSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true, unique: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Carrier', carrierSchema);
