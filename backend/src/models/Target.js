const mongoose = require('mongoose');

const targetSchema = new mongoose.Schema({
  salesperson: { type: mongoose.Schema.Types.ObjectId, ref: 'Salesperson' }, // null = company-wide
  period: {
    type: String,
    enum: ['Monthly', 'Quarterly', 'Annual'],
    required: true,
  },
  year: { type: Number, required: true },
  month: { type: Number, min: 1, max: 12 }, // for Monthly
  quarter: { type: Number, min: 1, max: 4 }, // for Quarterly
  targetAmount: { type: Number, required: true, min: 0 },
  achievedAmount: { type: Number, default: 0 },
  notes: { type: String },
}, { timestamps: true });

// Production Indexes
targetSchema.index({ salesperson: 1, period: 1, year: 1, month: 1 });
targetSchema.index({ period: 1, year: 1, month: 1 });
targetSchema.index({ year: 1, month: 1, salesperson: 1 });

module.exports = mongoose.model('Target', targetSchema);
