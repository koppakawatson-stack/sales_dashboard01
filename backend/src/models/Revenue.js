const mongoose = require('mongoose');

const revenueSchema = new mongoose.Schema({
  revenueId: { type: String, unique: true },
  deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  salesperson: { type: mongoose.Schema.Types.ObjectId, ref: 'Salesperson', required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  productService: { type: String, required: true },
  date: { type: Date, required: true, default: Date.now },
  recognizedAt: { type: Date, default: Date.now },
  invoiceNumber: { type: String },
  source: { type: String, default: 'OPPORTUNITY_WON' },
  status: {
    type: String,
    enum: ['Valid', 'Pending', 'Paid', 'Cancelled'],
    default: 'Paid',
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Partial', 'Overdue'],
    default: 'Paid',
  },
  notes: { type: String },
}, { timestamps: true });

revenueSchema.pre('save', async function () {
  if (!this.revenueId) {
    let nextNum = 1;
    const lastRev = await mongoose.model('Revenue')
      .findOne({ revenueId: /^REV-\d+$/ })
      .sort({ revenueId: -1 })
      .select('revenueId');
    if (lastRev && lastRev.revenueId) {
      const match = lastRev.revenueId.match(/\d+$/);
      if (match) nextNum = parseInt(match[0], 10) + 1;
    }
    this.revenueId = `REV-${String(nextNum).padStart(5, '0')}`;
  }
  if (!this.recognizedAt && this.date) {
    this.recognizedAt = this.date;
  } else if (!this.date && this.recognizedAt) {
    this.date = this.recognizedAt;
  }
});

// Production Indexes
revenueSchema.index({ recognizedAt: 1 });
revenueSchema.index({ date: 1 });
revenueSchema.index({ salesperson: 1 });
revenueSchema.index({ customer: 1 });
revenueSchema.index({ deal: 1 });
revenueSchema.index({ status: 1, recognizedAt: 1 });
revenueSchema.index({ paymentStatus: 1, date: 1 });
revenueSchema.index({ status: 1, salesperson: 1, recognizedAt: 1 });

module.exports = mongoose.model('Revenue', revenueSchema);
