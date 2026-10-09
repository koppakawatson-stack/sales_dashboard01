const AuditLog = require('../models/AuditLog');
const { invalidateDashboardCache } = require('../config/redis');

/**
 * Record an audit log entry and invalidate relevant dashboard cache
 */
const recordAudit = async ({
  actorId,
  action,
  entityType = 'LEAD',
  entityId,
  before = {},
  after = {},
  requestId = null,
  ip = null,
}) => {
  try {
    const entry = await AuditLog.create({
      actorId: actorId || 'SYSTEM',
      action,
      entityType,
      entityId: String(entityId),
      before,
      after,
      timestamp: new Date(),
      requestId,
      ip,
    });

    // Invalidate dashboard caches on any state change
    await invalidateDashboardCache();

    return entry;
  } catch (err) {
    console.warn('⚠️  Audit recording non-fatal error:', err.message);
    return null;
  }
};

module.exports = {
  recordAudit,
};
