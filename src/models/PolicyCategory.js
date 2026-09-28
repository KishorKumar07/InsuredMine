const mongoose = require('mongoose');

/**
 * Policy Category (Line of Business / LOB) collection.
 */
const policyCategorySchema = new mongoose.Schema(
  {
    categoryName: { type: String, required: true, trim: true, unique: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PolicyCategory', policyCategorySchema);
