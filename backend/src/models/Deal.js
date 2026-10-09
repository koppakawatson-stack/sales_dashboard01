const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  dealId: { type: String },
  opportunityName: { type: String, required: true, trim: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  salesperson: { type: mongoose.Schema.Types.ObjectId, ref: 'Salesperson', required: true },
  productService: { type: String, required: true, trim: true },
  dealValue: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  expectedClosingDate: { type: Date, required: true },
  probability: { type: Number, min: 0, max: 100, default: 50 },
  stage: {
    type: String,
    enum: ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'],
    default: 'Lead',
  },
  actualClosingDate: { type: Date },
  wonAt: { type: Date },
  lostAt: { type: Date },
  lostReason: { type: String, trim: true },
  notes: { type: String, trim: true },
  weightedValue: { type: Number, default: 0 },
  version: { type: Number, default: 1 },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// Pre-save hook: auto-generate unique dealId safely and compute weightedValue
dealSchema.pre('save', async function () {
  if (!this.dealId) {
    let nextNum = 1;
    const lastDeal = await mongoose.model('Deal')
      .findOne({ dealId: /^DEAL-\d+$/ })
      .sort({ dealId: -1 })
      .select('dealId');
    if (lastDeal && lastDeal.dealId) {
      const match = lastDeal.dealId.match(/\d+$/);
      if (match) nextNum = parseInt(match[0], 10) + 1;
    }
    this.dealId = `DEAL-${String(nextNum).padStart(5, '0')}`;
  }

  // Auto-compute weighted value
  this.weightedValue = Math.round((Number(this.dealValue || 0) * Number(this.probability || 0)) / 100);

  // Synchronize closing timestamps
  if (this.isModified('stage')) {
    if (this.stage === 'Won') {
      if (!this.wonAt) {
        this.wonAt = this.actualClosingDate || new Date();
      }
      this.actualClosingDate = this.wonAt;
      this.probability = 100;
    } else if (this.stage === 'Lost') {
      if (!this.lostAt) {
        this.lostAt = new Date();
      }
      this.probability = 0;
    }
  }
});

// Production Indexes
dealSchema.index({ dealId: 1 }, { unique: true });
dealSchema.index({ opportunityName: 1 });
dealSchema.index({ isDeleted: 1, stage: 1 });
dealSchema.index({ isDeleted: 1, salesperson: 1 });
dealSchema.index({ isDeleted: 1, customer: 1 });
dealSchema.index({ isDeleted: 1, wonAt: 1 });
dealSchema.index({ isDeleted: 1, lostAt: 1 });
dealSchema.index({ isDeleted: 1, expectedClosingDate: 1 });
dealSchema.index({ isDeleted: 1, stage: 1, salesperson: 1, wonAt: 1 });
dealSchema.index({ isDeleted: 1, stage: 1, dealValue: 1 });

module.exports = mongoose.model('Deal', dealSchema);
