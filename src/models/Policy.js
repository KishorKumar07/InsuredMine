const mongoose = require('mongoose');

/**
 * Policy Info collection - the central fact table linking a user to a
 * category (LOB), a carrier (company), and (optionally) an agent/account.
 *
 * `policyNumber` is unique across the whole sample sheet, so it is used
 * as the natural idempotency key for upserts during ingestion.
 */
const policySchema = new mongoose.Schema(
  {
    policyNumber: { type: String, required: true, trim: true, unique: true, index: true },
    policyStartDate: { type: Date },
    policyEndDate: { type: Date },

    policyCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'PolicyCategory', required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Carrier', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Extra columns from the sheet that don't map to the 6 required
    // collections but are useful context for search/aggregation and are
    // cheap to keep on the Policy document rather than dropped.
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', index: true },
    producer: { type: String, trim: true },
    csr: { type: String, trim: true },
    policyMode: { type: String, trim: true },
    policyType: { type: String, trim: true },
    premiumAmount: { type: Number },
    premiumAmountWritten: { type: Number },
  },
  { timestamps: true }
);

policySchema.index({ userId: 1, policyStartDate: -1 });

module.exports = mongoose.model('Policy', policySchema);
