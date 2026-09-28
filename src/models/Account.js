const mongoose = require('mongoose');

/**
 * User's Account collection.
 * `account_name` repeats across different users in the sample sheet
 * (e.g. shared households), so the de-dup key is (accountName + userId),
 * not accountName alone.
 */
const accountSchema = new mongoose.Schema(
  {
    accountName: { type: String, required: true, trim: true, index: true },
    accountType: { type: String, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

accountSchema.index({ accountName: 1, userId: 1 }, { unique: true, name: 'uniq_account_per_user' });

module.exports = mongoose.model('Account', accountSchema);
