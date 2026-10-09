const mongoose = require('mongoose');

const contactPersonSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  isPrimary: { type: Boolean, default: false },
});

const customerSchema = new mongoose.Schema({
  customerId: { type: String },
  companyName: { type: String, required: true, trim: true },
  contactPersons: [contactPersonSchema],
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  industry: {
    type: String,
    enum: ['Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Education', 'Real Estate', 'Media', 'Transportation', 'Energy', 'Other'],
    default: 'Other',
  },
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, default: 'India', trim: true },
    pincode: { type: String, trim: true },
  },
  assignedSalesperson: { type: mongoose.Schema.Types.ObjectId, ref: 'Salesperson' },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Prospect', 'Churned'],
    default: 'Active',
  },
  productsPurchased: [{ type: String, trim: true }],
  totalRevenue: { type: Number, default: 0 },
  contractInfo: {
    contractNumber: { type: String, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    value: { type: Number, default: 0, min: 0 },
    renewalDate: { type: Date },
    status: {
      type: String,
      enum: ['Active', 'Pending Renewal', 'Expired', 'Terminated'],
      default: 'Active',
    },
    terms: { type: String, trim: true },
  },
  notes: { type: String, trim: true },
  website: { type: String, trim: true },
  version: { type: Number, default: 1 },
  isArchived: { type: Boolean, default: false },
  createdBy: { type: String },
  updatedBy: { type: String },
}, { timestamps: true });

// Pre-save hook: auto-generate unique customerId if not supplied
customerSchema.pre('save', async function () {
  if (!this.customerId) {
    let nextNum = 1;
    const lastCustomer = await mongoose.model('Customer')
      .findOne({ customerId: /^CUST-\d+$/ })
      .sort({ customerId: -1 })
      .select('customerId');
    if (lastCustomer && lastCustomer.customerId) {
      const match = lastCustomer.customerId.match(/\d+$/);
      if (match) nextNum = parseInt(match[0], 10) + 1;
    }
    this.customerId = `CUST-${String(nextNum).padStart(5, '0')}`;
  }
});

// Indexes for production querying and unique constraints
customerSchema.index({ customerId: 1 }, { unique: true });
customerSchema.index({ companyName: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ status: 1, assignedSalesperson: 1 });
customerSchema.index({ 'contractInfo.renewalDate': 1 });
customerSchema.index({ totalRevenue: -1 });
customerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Customer', customerSchema);
