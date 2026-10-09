/**
 * HARVIK TECHNOLOGIES — Lead Status State Machine & Transition Service
 * Enforces server-side business rules and lifecycle progression.
 */

const {
  normalizeLeadStatus,
  ALLOWED_LOSS_REASONS,
} = require('../utils/leadValidator');

// Allowed status lifecycle matrix
// Canonical flow: NEW -> CONTACTED -> QUALIFIED -> PROPOSAL -> NEGOTIATION -> WON / LOST
const TRANSITION_MATRIX = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['PROPOSAL', 'LOST'],
  PROPOSAL: ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['WON', 'LOST'],
  WON: [],   // Terminal state
  LOST: [],  // Terminal state
};

/**
 * Checks if a status transition is permitted by the state machine.
 */
function canTransitionLead(currentStatus, targetStatus) {
  const current = normalizeLeadStatus(currentStatus);
  const target = normalizeLeadStatus(targetStatus);

  if (!current || !target) return false;
  if (current === target) return false; // Redundant or identical transition

  const allowedNext = TRANSITION_MATRIX[current] || [];
  return allowedNext.includes(target);
}

/**
 * Validates requirements for NEW -> CONTACTED transition.
 * Requires: contactPerson, email OR phone, assignedSalesperson.
 */
function validateContacted(lead, transitionData = {}) {
  const merged = { ...lead, ...transitionData };
  const errors = [];

  if (!merged.contactPerson || !String(merged.contactPerson).trim()) {
    errors.push('Contact person is required to move to CONTACTED.');
  }

  const hasEmail = merged.email && String(merged.email).trim().length > 0;
  const hasPhone = merged.phone && String(merged.phone).trim().length > 0;
  if (!hasEmail && !hasPhone) {
    errors.push('At least one contact method (email or phone) is required to move to CONTACTED.');
  }

  const salesperson = merged.assignedSalesperson || merged.assignedSalespersonId;
  if (!salesperson) {
    errors.push('Assigned salesperson is required to move to CONTACTED.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates requirements for CONTACTED -> QUALIFIED transition.
 * Requires: business requirement, expectedValue > 0, next follow-up, assigned salesperson.
 */
function validateQualification(lead, transitionData = {}) {
  const merged = { ...lead, ...transitionData };
  const errors = [];

  const requirement = merged.requirement || merged.notes;
  if (!requirement || !String(requirement).trim()) {
    errors.push('Business requirement is required for qualification.');
  }

  const expectedVal = Number(merged.expectedValue);
  if (isNaN(expectedVal) || expectedVal <= 0) {
    errors.push('Expected value must be greater than zero for qualification.');
  }

  const followUp = merged.nextFollowUpAt || merged.nextFollowUpDate;
  if (!followUp) {
    errors.push('Next follow-up date is required for qualification.');
  }

  const salesperson = merged.assignedSalesperson || merged.assignedSalespersonId;
  if (!salesperson) {
    errors.push('Assigned salesperson is required for qualification.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates requirements for QUALIFIED -> PROPOSAL transition.
 * Requires: expectedValue > 0, product/service, customer requirement, expected closing date.
 */
function validateProposal(lead, transitionData = {}) {
  const merged = { ...lead, ...transitionData };
  const errors = [];

  const expectedVal = Number(merged.expectedValue || merged.proposalValue);
  if (isNaN(expectedVal) || expectedVal <= 0) {
    errors.push('Expected value must be greater than zero for proposal.');
  }

  if (!merged.productService || !String(merged.productService).trim()) {
    errors.push('Product/service information is required for proposal.');
  }

  const requirement = merged.requirement || merged.notes;
  if (!requirement || !String(requirement).trim()) {
    errors.push('Customer requirement details are required for proposal.');
  }

  const closingDate = merged.expectedClosingDate;
  if (!closingDate) {
    errors.push('Expected closing date is required for proposal.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates requirements for PROPOSAL -> NEGOTIATION transition.
 * Requires: proposal value (> 0), expected closing date, decision-maker/contact info.
 */
function validateNegotiation(lead, transitionData = {}) {
  const merged = { ...lead, ...transitionData };
  const errors = [];

  const value = Number(merged.proposalValue || merged.expectedValue);
  if (isNaN(value) || value <= 0) {
    errors.push('Proposal value must be greater than zero for negotiation.');
  }

  if (!merged.expectedClosingDate) {
    errors.push('Expected closing date is required for negotiation.');
  }

  const decisionMaker = merged.decisionMaker || merged.contactPerson;
  if (!decisionMaker || !String(decisionMaker).trim()) {
    errors.push('Decision maker / contact person information is required for negotiation.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates requirements for NEGOTIATION -> WON transition.
 * Requires: final deal value (> 0), customer info, product/service, closing date, assigned salesperson.
 */
function validateWon(lead, transitionData = {}) {
  const merged = { ...lead, ...transitionData };
  const errors = [];

  const finalVal = Number(merged.finalDealValue || merged.expectedValue || merged.proposalValue);
  if (isNaN(finalVal) || finalVal <= 0) {
    errors.push('Final deal value must be greater than zero to mark as WON.');
  }

  if (!merged.companyName || !String(merged.companyName).trim()) {
    errors.push('Customer / company information is required to mark as WON.');
  }

  if (!merged.productService || !String(merged.productService).trim()) {
    errors.push('Product or service information is required to mark as WON.');
  }

  const closingDate = merged.actualClosingDate || merged.expectedClosingDate;
  if (!closingDate) {
    errors.push('Closing date is required to mark as WON.');
  }

  const salesperson = merged.assignedSalesperson || merged.assignedSalespersonId;
  if (!salesperson) {
    errors.push('Assigned salesperson is required to mark as WON.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates requirements for transition to LOST.
 * Requires: lossReason from controlled enum.
 */
function validateLost(lead, transitionData = {}) {
  const merged = { ...lead, ...transitionData };
  const errors = [];

  const reason = merged.lossReason ? String(merged.lossReason).trim().toUpperCase() : null;
  if (!reason || !ALLOWED_LOSS_REASONS.includes(reason)) {
    errors.push(`A valid lossReason is required. Allowed: ${ALLOWED_LOSS_REASONS.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Comprehensive status transition validator.
 * Validates both transition state flow and transition-specific business data.
 */
function validateStatusTransition(currentStatus, targetStatus, leadDoc, transitionData = {}) {
  const current = normalizeLeadStatus(currentStatus);
  const target = normalizeLeadStatus(targetStatus);

  // Check if lead is already in a terminal state
  if (current === 'WON' || current === 'LOST') {
    return {
      isValid: false,
      code: 'LEAD_ALREADY_CLOSED',
      message: `Lead is already closed (${current}) and cannot transition to ${target}.`,
      errors: [`Lead is in terminal state: ${current}`],
    };
  }

  // Check state machine matrix
  if (!canTransitionLead(current, target)) {
    return {
      isValid: false,
      code: 'INVALID_STATUS_TRANSITION',
      message: `Invalid state transition from ${current} to ${target}. Controlled lifecycle does not allow this path.`,
      errors: [`Cannot move lead directly from ${current} to ${target}`],
    };
  }

  // Evaluate stage-specific domain requirements
  let validationResult = { isValid: true, errors: [] };

  if (target === 'CONTACTED') {
    validationResult = validateContacted(leadDoc, transitionData);
  } else if (target === 'QUALIFIED') {
    validationResult = validateQualification(leadDoc, transitionData);
  } else if (target === 'PROPOSAL') {
    validationResult = validateProposal(leadDoc, transitionData);
  } else if (target === 'NEGOTIATION') {
    validationResult = validateNegotiation(leadDoc, transitionData);
  } else if (target === 'WON') {
    validationResult = validateWon(leadDoc, transitionData);
  } else if (target === 'LOST') {
    validationResult = validateLost(leadDoc, transitionData);
  }

  if (!validationResult.isValid) {
    return {
      isValid: false,
      code: 'VALIDATION_ERROR',
      message: validationResult.errors.join(' '),
      errors: validationResult.errors,
    };
  }

  return {
    isValid: true,
    currentStatus: current,
    targetStatus: target,
  };
}

module.exports = {
  TRANSITION_MATRIX,
  canTransitionLead,
  validateContacted,
  validateQualification,
  validateProposal,
  validateNegotiation,
  validateWon,
  validateLost,
  validateStatusTransition,
};
