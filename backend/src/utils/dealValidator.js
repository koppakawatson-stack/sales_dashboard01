/**
 * HARVIK TECHNOLOGIES — Deal / Opportunity Validation & Stage Lifecycle Controls
 * Pure functions for validating opportunity records, probability weighting,
 * and canonical stage state machine transitions:
 * Lead -> Qualified -> Proposal -> Negotiation -> Won / Lost
 */

const ALLOWED_DEAL_STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const STAGE_DEFAULT_PROBABILITIES = {
  Lead: 20,
  Qualified: 40,
  Proposal: 60,
  Negotiation: 80,
  Won: 100,
  Lost: 0,
};

const STAGE_TRANSITION_MAP = {
  Lead: ['Qualified', 'Lost'],
  Qualified: ['Proposal', 'Lost'],
  Proposal: ['Negotiation', 'Lost'],
  Negotiation: ['Won', 'Lost'],
  Won: [], // Terminal stage
  Lost: [], // Terminal stage
};

/**
 * Validates whether an opportunity stage transition is permitted by the state machine.
 */
function canTransitionDealStage(currentStage, targetStage) {
  if (!currentStage || !targetStage) return false;
  if (currentStage === targetStage) return true; // Re-saving or updating attributes in same stage

  // Once Won or Lost, stage transitions are prohibited
  if (currentStage === 'Won' || currentStage === 'Lost') {
    return false;
  }

  const allowed = STAGE_TRANSITION_MAP[currentStage];
  return Array.isArray(allowed) && allowed.includes(targetStage);
}

/**
 * Validates opportunity name.
 */
function validateOpportunityName(name) {
  if (!name || typeof name !== 'string') return false;
  return name.trim().length >= 2;
}

/**
 * Validates deal value (must be non-negative number).
 */
function validateDealValue(value) {
  if (value === undefined || value === null || value === '') return false;
  const num = Number(value);
  return !isNaN(num) && num >= 0 && isFinite(num);
}

/**
 * Validates probability percentage (0 to 100).
 */
function validateProbability(probability) {
  if (probability === undefined || probability === null || probability === '') return false;
  const num = Number(probability);
  return !isNaN(num) && num >= 0 && num <= 100;
}

/**
 * Validates expected closing date.
 */
function validateExpectedClosingDate(date) {
  if (!date) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

/**
 * Calculates weighted pipeline value.
 */
function calculateWeightedValue(dealValue, probability) {
  const val = Number(dealValue) || 0;
  const prob = Number(probability) || 0;
  return Math.round((val * prob) / 100);
}

/**
 * Normalizes stage string to canonical capitalization.
 */
function normalizeStage(stage) {
  if (!stage) return 'Lead';
  const match = ALLOWED_DEAL_STAGES.find(
    s => s.toLowerCase() === String(stage).trim().toLowerCase()
  );
  return match || 'Lead';
}

/**
 * Comprehensive Deal / Opportunity validator.
 */
function validateDeal(payload = {}) {
  const errors = [];
  const sanitized = { ...payload };

  // 1. Opportunity Name
  if (!validateOpportunityName(sanitized.opportunityName)) {
    errors.push('Opportunity name is required and must contain at least 2 characters.');
  } else {
    sanitized.opportunityName = sanitized.opportunityName.trim();
  }

  // 2. Customer or Lead
  if (!sanitized.customer && !sanitized.lead) {
    errors.push('Customer account or lead reference is required for an opportunity.');
  }

  // 3. Salesperson
  if (!sanitized.salesperson) {
    errors.push('Assigned salesperson is required.');
  }

  // 4. Product / Service
  if (!sanitized.productService || typeof sanitized.productService !== 'string' || !sanitized.productService.trim()) {
    errors.push('Product/service requirement is required.');
  } else {
    sanitized.productService = sanitized.productService.trim();
  }

  // 5. Deal Value
  if (!validateDealValue(sanitized.dealValue)) {
    errors.push('Deal value must be a valid non-negative number.');
  } else {
    sanitized.dealValue = Number(sanitized.dealValue);
  }

  // 6. Expected Closing Date
  if (!validateExpectedClosingDate(sanitized.expectedClosingDate)) {
    errors.push('Expected closing date must be a valid date.');
  } else {
    sanitized.expectedClosingDate = new Date(sanitized.expectedClosingDate);
  }

  // 7. Stage
  sanitized.stage = normalizeStage(sanitized.stage);

  // 8. Probability
  if (sanitized.probability !== undefined && sanitized.probability !== null && sanitized.probability !== '') {
    if (!validateProbability(sanitized.probability)) {
      errors.push('Probability must be a percentage between 0 and 100.');
    } else {
      sanitized.probability = Number(sanitized.probability);
    }
  } else {
    // Default probability based on stage
    sanitized.probability = STAGE_DEFAULT_PROBABILITIES[sanitized.stage] ?? 50;
  }

  // Stage overrides for terminal states
  if (sanitized.stage === 'Won') {
    sanitized.probability = 100;
  } else if (sanitized.stage === 'Lost') {
    sanitized.probability = 0;
    if (!sanitized.lostReason || !String(sanitized.lostReason).trim()) {
      errors.push('A reason is required when marking a deal as Lost.');
    } else {
      sanitized.lostReason = String(sanitized.lostReason).trim();
    }
  }

  // 9. Weighted Value
  sanitized.weightedValue = calculateWeightedValue(sanitized.dealValue, sanitized.probability);

  // 10. Notes
  if (sanitized.notes && typeof sanitized.notes === 'string') {
    sanitized.notes = sanitized.notes.trim().slice(0, 5000);
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: sanitized,
  };
}

module.exports = {
  ALLOWED_DEAL_STAGES,
  STAGE_DEFAULT_PROBABILITIES,
  STAGE_TRANSITION_MAP,
  canTransitionDealStage,
  validateOpportunityName,
  validateDealValue,
  validateProbability,
  validateExpectedClosingDate,
  calculateWeightedValue,
  normalizeStage,
  validateDeal,
};
