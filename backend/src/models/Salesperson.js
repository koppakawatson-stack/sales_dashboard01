const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const salespersonSchema = new mongoose.Schema({
  userId: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  avatar: { type: String },
  department: { type: String, default: 'Sales' },
  role: { type: String, enum: ['Sales Rep', 'Senior Sales Rep', 'Sales Manager', 'Account Executive', 'Administrator'], default: 'Sales Rep' },
  systemRole: { type: String, enum: ['ADMIN', 'SALES_MANAGER', 'SALESPERSON'], default: 'SALESPERSON' },
  status: { type: String, enum: ['ACTIVE', 'DISABLED', 'INACTIVE'], default: 'ACTIVE' },
  password: { type: String },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date },
  hireDate: { type: Date, default: Date.now },
  targets: {
    monthly: { type: Number, default: 0 },
    quarterly: { type: Number, default: 0 },
    annual: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      delete ret.password;
      delete ret.__v;
      return ret;
    },
  },
  toObject: {
    transform: (doc, ret) => {
      delete ret.password;
      delete ret.__v;
      return ret;
    },
  },
});

salespersonSchema.pre('save', async function () {
  if (!this.userId) {
    const count = await mongoose.model('Salesperson').countDocuments();
    this.userId = `USR-${String(count + 1).padStart(4, '0')}`;
  }
  if (this.status === 'DISABLED' || this.status === 'INACTIVE') {
    this.isActive = false;
  } else if (this.isActive === false) {
    this.status = 'DISABLED';
  }
  if (!this.isModified('password') || !this.password) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});


salespersonSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Production Indexes
salespersonSchema.index({ systemRole: 1, isActive: 1 });
salespersonSchema.index({ isActive: 1 });

module.exports = mongoose.model('Salesperson', salespersonSchema);
