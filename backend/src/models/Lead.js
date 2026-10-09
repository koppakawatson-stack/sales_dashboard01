const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  leadId: {
    type: String,
    unique: true,
    index: true,
  },
  companyName: {
    type: String,
    required: true,
    trim: true,
  },
  contactPerson: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    index: true,
  },
  phone: {
    type: String,
    trim: true,
    index: true,
  },
  source: {
    type: String,
    default: 'WEBSITE',
    index: true,
  },
  industry: {
    type: String,
    default: 'Other',
    index: true,
  },
  location: {
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: 'India' },
  },
  assignedSalesperson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salesperson',
    index: true,
  },
  status: {
    type: String,
    enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'],
    default: 'NEW',
    index: true,
  },
  expectedValue: {
    type: Number,
    default: 0,
    min: 0,
    index: true,
  },
  // Timestamps
  lastContactAt: { type: Date },
  lastContactDate: { type: Date }, // Backward compatibility alias
  nextFollowUpAt: { type: Date, index: true },
  nextFollowUpDate: { type: Date }, // Backward compatibility alias

  notes: { type: String, maxlength: 2000 },

  // Commercial & Stage Transition Requirements
  requirement: { type: String, trim: true },
  productService: { type: String, trim: true },
  expectedClosingDate: { type: Date },
  proposalValue: { type: Number, min: 0 },
  finalDealValue: { type: Number, min: 0 },
  decisionMaker: { type: String, trim: true },

  // Production Lifecycle Tracking Timestamps
  qualifiedAt: { type: Date },
  proposalAt: { type: Date },
  negotiationAt: { type: Date },
  wonAt: { type: Date },
  lostAt: { type: Date },
  lossReason: {
    type: String,
    enum: ['PRICE', 'COMPETITOR', 'NO_RESPONSE', 'BUDGET', 'TIMING', 'NOT_A_FIT', 'CUSTOMER_CANCELLED', 'OTHER', null],
  },
  archivedAt: { type: Date },
  isArchived: { type: Boolean, default: false, index: true },
  isDeleted: { type: Boolean, default: false, index: true },

  // Downstream Conversions
  convertedToCustomer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  convertedToDeal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },

  // Quality Scoring
  leadQualityScore: { type: Number, default: 0 },
  scoreVersion: { type: String, default: '1.0.0' },
  scoreGeneratedAt: { type: Date },
  scoreFactors: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Audit & Concurrency Control
  createdBy: { type: String, default: 'SYSTEM' },
  updatedBy: { type: String, default: 'SYSTEM' },
  version: { type: Number, default: 1 },
}, { timestamps: true });

// Virtual for assignedSalespersonId
leadSchema.virtual('assignedSalespersonId').get(function () {
  return this.assignedSalesperson ? String(this.assignedSalesperson) : null;
});

// Helper for atomic lead ID generation
leadSchema.statics.generateNextLeadId = async function () {
  const highest = await this.findOne({ leadId: /^LEAD-\d+/ })
    .sort({ leadId: -1 })
    .select('leadId')
    .lean();

  let nextNum = 1;
  if (highest && highest.leadId) {
    const match = highest.leadId.match(/LEAD-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  return `LEAD-${String(nextNum).padStart(6, '0')}`;
};

leadSchema.pre('validate', function () {
  // Normalize status to uppercase
  if (this.status) {
    this.status = this.status.toUpperCase();
  }
});

leadSchema.pre('save', async function () {
  // Auto-generate leadId if not present
  if (!this.leadId) {
    this.leadId = await this.constructor.generateNextLeadId();
  }

  // Synchronize alias date fields for backward compatibility
  if (this.lastContactAt && !this.lastContactDate) this.lastContactDate = this.lastContactAt;
  if (this.lastContactDate && !this.lastContactAt) this.lastContactAt = this.lastContactDate;
  if (this.nextFollowUpAt && !this.nextFollowUpDate) this.nextFollowUpDate = this.nextFollowUpAt;
  if (this.nextFollowUpDate && !this.nextFollowUpAt) this.nextFollowUpAt = this.nextFollowUpDate;

  // Track status transition timestamps
  if (this.isModified('status')) {
    const now = new Date();
    if (this.status === 'QUALIFIED' && !this.qualifiedAt) {
      this.qualifiedAt = now;
    } else if (this.status === 'PROPOSAL' && !this.proposalAt) {
      this.proposalAt = now;
    } else if (this.status === 'NEGOTIATION' && !this.negotiationAt) {
      this.negotiationAt = now;
    } else if (this.status === 'WON' && !this.wonAt) {
      this.wonAt = now;
    } else if (this.status === 'LOST' && !this.lostAt) {
      this.lostAt = now;
    }
  }
});

// Production Compound Indexes (Section 30)
leadSchema.index({ isDeleted: 1, isArchived: 1, createdAt: -1 });
leadSchema.index({ isDeleted: 1, isArchived: 1, status: 1 });
leadSchema.index({ isDeleted: 1, isArchived: 1, assignedSalesperson: 1 });
leadSchema.index({ isDeleted: 1, isArchived: 1, nextFollowUpAt: 1 });
leadSchema.index({ isDeleted: 1, isArchived: 1, source: 1 });
leadSchema.index({ isDeleted: 1, isArchived: 1, industry: 1 });
leadSchema.index({ isDeleted: 1, isArchived: 1, expectedValue: -1 });
leadSchema.index({ isDeleted: 1, isArchived: 1, companyName: 1, contactPerson: 1 });
leadSchema.index({ isDeleted: 1, isArchived: 1, email: 1 });
leadSchema.index({ isDeleted: 1, isArchived: 1, phone: 1 });
leadSchema.index({ isDeleted: 1, status: 1, assignedSalesperson: 1, createdAt: -1 });

module.exports = mongoose.model('Lead', leadSchema);
