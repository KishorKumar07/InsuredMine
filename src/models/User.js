const mongoose = require('mongoose');

/**
 * User collection.
 *
 * NOTE on identity: the sheet's `email` column is NOT unique per person
 * (two different people can share the same producer/csr email in this
 * dataset), so we cannot upsert users on email alone. We upsert on the
 * composite (firstname + dob + email), which is unique across the sample
 * sheet and is a reasonable proxy for "same person" without a real
 * username/SSN field.
 */
const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, index: true },
    dob: { type: Date },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    gender: { type: String, trim: true },
    userType: { type: String, trim: true },
  },
  { timestamps: true }
);

// Composite key used for idempotent upserts during ingestion.
userSchema.index({ firstName: 1, dob: 1, email: 1 }, { unique: true, name: 'uniq_user_identity' });
// Case-insensitive search support for the "search by username" API.
userSchema.index({ firstName: 'text' });

module.exports = mongoose.model('User', userSchema);
