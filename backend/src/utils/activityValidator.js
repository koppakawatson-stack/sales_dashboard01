/**
 * HARVIK TECHNOLOGIES — Sales Activity Validation Controls
 * Pure functions for validating activity type, participants, outcomes, and next actions.
 */

const ALLOWED_ACTIVITY_TYPES = ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up', 'Proposal', 'Other'];
const ALLOWED_OUTCOMES = ['Positive', 'Neutral', 'Negative', 'No Answer', 'Pending'];
const ALLOWED_STATUSES = ['Planned', 'Completed', 'Cancelled'];

/**
 * Normalizes activity type.
 */
function normalizeActivityType(type) {
  if (!type || typeof type !== 'string' || !type.trim()) return null;
  const match = ALLOWED_ACTIVITY_TYPES.find(
    t => t.toLowerCase() === String(type).trim().toLowerCase()
  );
  return match || null;
}

/**
 * Validates activity type.
 */
function validateActivityType(type) {
  if (!type || typeof type !== 'string' || !type.trim()) return false;
  return normalizeActivityType(type) !== null;
}

/**
 * Validates that at least one of customer or lead is provided.
 */
function validateCustomerOrLead(customer, lead) {
  return Boolean((customer && String(customer).trim()) || (lead && String(lead).trim()));
}

/**
 * Validates salesperson assignment.
 */
function validateSalesperson(salesperson) {
  return Boolean(salesperson && String(salesperson).trim());
}

/**
 * Validates date.
 */
function validateDate(date) {
  if (!date) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

/**
 * Normalizes outcome.
 */
function normalizeOutcome(outcome) {
  if (!outcome) return 'Pending';
  const match = ALLOWED_OUTCOMES.find(
    o => o.toLowerCase() === String(outcome).trim().toLowerCase()
  );
  return match || 'Pending';
}

/**
 * Normalizes status.
 */
function normalizeStatus(status) {
  if (!status) return 'Planned';
  const match = ALLOWED_STATUSES.find(
    s => s.toLowerCase() === String(status).trim().toLowerCase()
  );
  return match || 'Planned';
}

/**
 * Comprehensive activity payload validator.
 */
function validateActivity(payload = {}) {
  const errors = [];
  const sanitized = { ...payload };

  // 1. Activity Type
  const normalizedType = normalizeActivityType(sanitized.activityType);
  if (!normalizedType) {
    errors.push(`Invalid activity type. Allowed types: ${ALLOWED_ACTIVITY_TYPES.join(', ')}`);
  } else {
    sanitized.activityType = normalizedType;
  }

  // 2. Customer or Lead
  if (!validateCustomerOrLead(sanitized.customer, sanitized.lead)) {
    errors.push('Each activity must be associated with either a customer account or a lead.');
  }

  // 3. Salesperson
  if (!validateSalesperson(sanitized.salesperson)) {
    errors.push('Assigned salesperson is required.');
  }

  // 4. Date
  if (sanitized.date) {
    if (!validateDate(sanitized.date)) {
      errors.push('Activity date must be a valid date.');
    } else {
      sanitized.date = new Date(sanitized.date);
    }
  } else {
    sanitized.date = new Date();
  }

  // 5. Notes
  if (sanitized.notes && typeof sanitized.notes === 'string') {
    sanitized.notes = sanitized.notes.trim().slice(0, 5000);
  }

  // 6. Next Action
  if (sanitized.nextAction && typeof sanitized.nextAction === 'string') {
    sanitized.nextAction = sanitized.nextAction.trim().slice(0, 1000);
  }

  // 7. Next Action Date
  if (sanitized.nextActionDate) {
    if (!validateDate(sanitized.nextActionDate)) {
      errors.push('Next action date must be a valid date.');
    } else {
      sanitized.nextActionDate = new Date(sanitized.nextActionDate);
    }
  }

  // 8. Outcome & Status
  sanitized.outcome = normalizeOutcome(sanitized.outcome);
  sanitized.status = normalizeStatus(sanitized.status);

  // 9. Duration
  if (sanitized.duration !== undefined && sanitized.duration !== null && sanitized.duration !== '') {
    const dur = Number(sanitized.duration);
    if (isNaN(dur) || dur < 0) {
      errors.push('Activity duration must be a non-negative number of minutes.');
    } else {
      sanitized.duration = dur;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: sanitized,
  };
}

module.exports = {
  ALLOWED_ACTIVITY_TYPES,
  ALLOWED_OUTCOMES,
  ALLOWED_STATUSES,
  normalizeActivityType,
  validateActivityType,
  validateCustomerOrLead,
  validateSalesperson,
  validateDate,
  normalizeOutcome,
  normalizeStatus,
  validateActivity,
};
