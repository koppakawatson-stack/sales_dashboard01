const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: { type: String, required: true },
  action: {
    type: String,
    required: true,
    enum: [
      'LEAD_CREATED', 'LEAD_UPDATED', 'LEAD_STATUS_CHANGED', 'LEAD_QUALIFIED',
      'LEAD_WON', 'LEAD_LOST', 'LEAD_REASSIGNED', 'LEAD_ARCHIVED', 'LEAD_DELETED',
      'CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'CUSTOMER_STATUS_CHANGED', 'CUSTOMER_REASSIGNED', 'CUSTOMER_ARCHIVED', 'CUSTOMER_DELETED',
      'OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY_WON', 'OPPORTUNITY_LOST', 'OPPORTUNITY_REASSIGNED', 'OPPORTUNITY_DELETED',
      'REVENUE_RECORDED', 'REVENUE_UPDATED', 'REVENUE_CANCELLED',
      'TARGET_UPDATED', 'TARGET_CREATED',
      'ACTIVITY_CREATED', 'ACTIVITY_UPDATED', 'ACTIVITY_DELETED',
      'USER_ASSIGNED',
      'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT',
    ],
  },
  entityType: {
    type: String,
    required: true,
    enum: ['OPPORTUNITY', 'LEAD', 'REVENUE', 'TARGET', 'CUSTOMER', 'USER', 'ACTIVITY', 'AUTH'],
  },

  entityId: { type: String, required: true },
  before: { type: mongoose.Schema.Types.Mixed, default: {} },
  after: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now },
  requestId: { type: String },
  ip: { type: String },
}, { timestamps: true });

auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
