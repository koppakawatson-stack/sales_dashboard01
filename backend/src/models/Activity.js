const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  activityId: { type: String },
  activityType: {
    type: String,
    enum: ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up', 'Proposal', 'Other'],
    required: true,
  },
  salesperson: { type: mongoose.Schema.Types.ObjectId, ref: 'Salesperson', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  date: { type: Date, required: true, default: Date.now },
  duration: { type: Number, default: 0 }, // in minutes
  notes: { type: String, trim: true },
  nextAction: { type: String, trim: true },
  nextActionDate: { type: Date },
  outcome: {
    type: String,
    enum: ['Positive', 'Neutral', 'Negative', 'No Answer', 'Pending'],
    default: 'Pending',
  },
  status: {
    type: String,
    enum: ['Planned', 'Completed', 'Cancelled'],
    default: 'Planned',
  },
  version: { type: Number, default: 1 },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// Pre-save hook: auto-generate ACT-00001 safely
activitySchema.pre('save', async function () {
  if (!this.activityId) {
    let nextNum = 1;
    const lastActivity = await mongoose.model('Activity')
      .findOne({ activityId: /^ACT-\d+$/ })
      .sort({ activityId: -1 })
      .select('activityId');
    if (lastActivity && lastActivity.activityId) {
      const match = lastActivity.activityId.match(/\d+$/);
      if (match) nextNum = parseInt(match[0], 10) + 1;
    }
    this.activityId = `ACT-${String(nextNum).padStart(5, '0')}`;
  }
});

// Production Indexes
activitySchema.index({ activityId: 1 }, { unique: true });
activitySchema.index({ isDeleted: 1, date: -1 });
activitySchema.index({ isDeleted: 1, salesperson: 1, date: -1 });
activitySchema.index({ isDeleted: 1, customer: 1, date: -1 });
activitySchema.index({ isDeleted: 1, lead: 1, date: -1 });
activitySchema.index({ isDeleted: 1, activityType: 1 });
activitySchema.index({ isDeleted: 1, status: 1 });

module.exports = mongoose.model('Activity', activitySchema);
