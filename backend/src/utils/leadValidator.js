/**
 * HARVIK TECHNOLOGIES — Lead Validation & Utility Service
 * Enforces server-side validation and data integrity rules for Leads.
 */

const ALLOWED_SOURCES = [
  'WEBSITE',
  'REFERRAL',
  'SOCIAL_MEDIA',
  'ADVERTISEMENT',
  'EMAIL',
  'PHONE',
  'EVENT',
  'PARTNER',
  'OTHER',
  'COLD_CALL',
  'EMAIL_CAMPAIGN',
];

const ALLOWED_INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Manufacturing',
  'Retail',
  'Education',
  'Real Estate',
  'Media',
  'Transportation',
  'Energy',
  'Other',
];

const ALLOWED_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
];

const ALLOWED_LOSS_REASONS = [
  'PRICE',
  'COMPETITOR',
  'NO_RESPONSE',
  'BUDGET',
  'TIMING',
  'NOT_A_FIT',
  'CUSTOMER_CANCELLED',
  'OTHER',
];

/**
 * Validates and normalizes email addresses.
 * Rejects malformed strings.
 */
function validateEmail(email) {
  if (!email) return { isValid: true, normalized: null };
  if (typeof email !== 'string') return { isValid: false, error: 'Email must be a string' };

  const trimmed = email.trim().toLowerCase();
  // Standard RFC 5322 compliant regex for basic valid structure
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Malformed email format' };
  }

  return { isValid: true, normalized: trimmed };
}

/**
 * Validates phone numbers.
 * Rejects malformed or garbage values.
 */
function validatePhone(phone) {
  if (!phone) return { isValid: true, normalized: null };
  if (typeof phone !== 'string') return { isValid: false, error: 'Phone must be a string' };

  const trimmed = phone.trim();
  // Accepts international/domestic formats: e.g. +91 9876543210, 9876543210, +1 (555) 123-4567
  const phoneRegex = /^(\+?[0-9\s\-().]{7,25})$/;
  // Ensure it contains at least 7 digits
  const digitCount = (trimmed.match(/\d/g) || []).length;

  if (!phoneRegex.test(trimmed) || digitCount < 7) {
    return { isValid: false, error: 'Invalid phone number format. Minimum 7 digits required.' };
  }

  return { isValid: true, normalized: trimmed };
}

/**
 * Validates numeric expected value.
 * Must be numeric and non-negative.
 */
function validateExpectedValue(val) {
  if (val === undefined || val === null || val === '') {
    return { isValid: true, value: 0 };
  }
  const num = Number(val);
  if (isNaN(num) || !Number.isFinite(num)) {
    return { isValid: false, error: 'Expected value must be a valid number' };
  }
  if (num < 0) {
    return { isValid: false, error: 'Expected value cannot be negative' };
  }
  return { isValid: true, value: num };
}

/**
 * Normalizes lead status to canonical uppercase.
 */
function normalizeLeadStatus(status) {
  if (!status || typeof status !== 'string') return 'NEW';
  const clean = status.trim().toUpperCase().replace(/\s+/g, '_');
  if (ALLOWED_STATUSES.includes(clean)) return clean;
  // Fallbacks for title case
  const mapping = {
    NEW: 'NEW',
    CONTACTED: 'CONTACTED',
    QUALIFIED: 'QUALIFIED',
    PROPOSAL: 'PROPOSAL',
    NEGOTIATION: 'NEGOTIATION',
    WON: 'WON',
    LOST: 'LOST',
  };
  return mapping[clean] || 'NEW';
}

/**
 * Normalizes source string to controlled enum.
 */
function normalizeLeadSource(source) {
  if (!source || typeof source !== 'string') return 'OTHER';
  const upper = source.trim().toUpperCase().replace(/[\s\/-]+/g, '_');
  const sourceMap = {
    WEBSITE: 'WEBSITE',
    REFERRAL: 'REFERRAL',
    COLD_CALL: 'COLD_CALL',
    EMAIL_CAMPAIGN: 'EMAIL_CAMPAIGN',
    EMAIL: 'EMAIL',
    PHONE: 'PHONE',
    SOCIAL_MEDIA: 'SOCIAL_MEDIA',
    EVENT: 'EVENT',
    EVENT_TRADE_SHOW: 'EVENT',
    TRADE_SHOW: 'EVENT',
    PARTNER: 'PARTNER',
    ADVERTISEMENT: 'ADVERTISEMENT',
    OTHER: 'OTHER',
  };
  return sourceMap[upper] || (ALLOWED_SOURCES.includes(upper) ? upper : 'OTHER');
}

/**
 * Normalizes industry string to controlled list.
 */
function normalizeIndustry(industry) {
  if (!industry || typeof industry !== 'string') return 'Other';
  const match = ALLOWED_INDUSTRIES.find(i => i.toLowerCase() === industry.trim().toLowerCase());
  return match || 'Other';
}

/**
 * Calculates lead age in days.
 */
function calculateLeadAge(createdAt) {
  if (!createdAt) return 0;
  const createdTime = new Date(createdAt).getTime();
  if (isNaN(createdTime)) return 0;
  const diffMs = Date.now() - createdTime;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Identifies if follow-up is overdue.
 * Definition: nextFollowUpAt < currentTime AND status NOT IN [WON, LOST]
 */
function isFollowUpOverdue(nextFollowUpAt, status) {
  const normStatus = normalizeLeadStatus(status);
  if (normStatus === 'WON' || normStatus === 'LOST') {
    return false;
  }
  if (!nextFollowUpAt) return false;
  const followUpTime = new Date(nextFollowUpAt).getTime();
  if (isNaN(followUpTime)) return false;
  return followUpTime < Date.now();
}

/**
 * Sanitizes text input and enforces max length.
 */
function sanitizeText(text, maxLength = 2000) {
  if (!text) return '';
  if (typeof text !== 'string') return String(text).slice(0, maxLength);
  return text.trim().slice(0, maxLength);
}

/**
 * Comprehensive Lead input validator for Create & Update operations.
 */
function validateLead(data = {}, isUpdate = false) {
  const errors = [];
  const normalized = {};

  // Company Name
  if (!isUpdate || data.companyName !== undefined) {
    if (!data.companyName || typeof data.companyName !== 'string' || !data.companyName.trim()) {
      errors.push({ field: 'companyName', message: 'Company name is required and cannot be empty or whitespace-only.' });
    } else {
      normalized.companyName = data.companyName.trim();
    }
  }

  // Contact Person
  if (!isUpdate || data.contactPerson !== undefined) {
    if (!data.contactPerson || typeof data.contactPerson !== 'string' || !data.contactPerson.trim()) {
      errors.push({ field: 'contactPerson', message: 'Contact person is required and cannot be empty.' });
    } else {
      normalized.contactPerson = data.contactPerson.trim();
    }
  }

  // Email
  if (data.email !== undefined) {
    const emailRes = validateEmail(data.email);
    if (!emailRes.isValid) {
      errors.push({ field: 'email', message: emailRes.error });
    } else {
      normalized.email = emailRes.normalized;
    }
  }

  // Phone
  if (data.phone !== undefined) {
    const phoneRes = validatePhone(data.phone);
    if (!phoneRes.isValid) {
      errors.push({ field: 'phone', message: phoneRes.error });
    } else {
      normalized.phone = phoneRes.normalized;
    }
  }

  // Source
  if (data.source !== undefined) {
    normalized.source = normalizeLeadSource(data.source);
  } else if (!isUpdate) {
    normalized.source = 'WEBSITE';
  }

  // Industry
  if (data.industry !== undefined) {
    normalized.industry = normalizeIndustry(data.industry);
  } else if (!isUpdate) {
    normalized.industry = 'Other';
  }

  // Location
  if (data.location !== undefined) {
    if (typeof data.location === 'object' && data.location !== null) {
      normalized.location = {
        city: data.location.city ? String(data.location.city).trim() : '',
        state: data.location.state ? String(data.location.state).trim() : '',
        country: data.location.country ? String(data.location.country).trim() : 'India',
      };
    } else {
      normalized.location = { city: '', state: '', country: 'India' };
    }
  }

  // Expected Value
  if (data.expectedValue !== undefined) {
    const evRes = validateExpectedValue(data.expectedValue);
    if (!evRes.isValid) {
      errors.push({ field: 'expectedValue', message: evRes.error });
    } else {
      normalized.expectedValue = evRes.value;
    }
  } else if (!isUpdate) {
    normalized.expectedValue = 0;
  }

  // Status
  if (data.status !== undefined) {
    normalized.status = normalizeLeadStatus(data.status);
  }

  // Assigned Salesperson
  const assigned = data.assignedSalesperson || data.assignedSalespersonId;
  if (assigned !== undefined) {
    normalized.assignedSalesperson = assigned || null;
  }

  // Next Follow-up
  const followUp = data.nextFollowUpAt || data.nextFollowUpDate;
  if (followUp !== undefined && followUp !== null && followUp !== '') {
    const d = new Date(followUp);
    if (isNaN(d.getTime())) {
      errors.push({ field: 'nextFollowUpAt', message: 'Invalid follow-up date format.' });
    } else {
      normalized.nextFollowUpAt = d;
      normalized.nextFollowUpDate = d;
    }
  } else if (followUp === null || followUp === '') {
    normalized.nextFollowUpAt = null;
    normalized.nextFollowUpDate = null;
  }

  // Last Contact
  const lastContact = data.lastContactAt || data.lastContactDate;
  if (lastContact !== undefined && lastContact !== null && lastContact !== '') {
    const lc = new Date(lastContact);
    if (!isNaN(lc.getTime())) {
      normalized.lastContactAt = lc;
      normalized.lastContactDate = lc;
    }
  }

  // Notes
  if (data.notes !== undefined) {
    normalized.notes = sanitizeText(data.notes, 2000);
  }

  // Loss Reason
  if (data.lossReason !== undefined) {
    const lr = String(data.lossReason).trim().toUpperCase();
    if (lr && !ALLOWED_LOSS_REASONS.includes(lr)) {
      errors.push({ field: 'lossReason', message: `Invalid lossReason. Allowed: ${ALLOWED_LOSS_REASONS.join(', ')}` });
    } else {
      normalized.lossReason = lr || null;
    }
  }

  // Commercial / qualification fields
  if (data.requirement !== undefined) normalized.requirement = sanitizeText(data.requirement, 1000);
  if (data.productService !== undefined) normalized.productService = sanitizeText(data.productService, 255);
  if (data.decisionMaker !== undefined) normalized.decisionMaker = sanitizeText(data.decisionMaker, 255);
  if (data.expectedClosingDate !== undefined && data.expectedClosingDate) {
    const cd = new Date(data.expectedClosingDate);
    if (!isNaN(cd.getTime())) normalized.expectedClosingDate = cd;
  }
  if (data.proposalValue !== undefined) {
    const pv = validateExpectedValue(data.proposalValue);
    if (pv.isValid) normalized.proposalValue = pv.value;
  }
  if (data.finalDealValue !== undefined) {
    const fv = validateExpectedValue(data.finalDealValue);
    if (fv.isValid) normalized.finalDealValue = fv.value;
  }

  return {
    isValid: errors.length === 0,
    errors,
    normalized,
  };
}

module.exports = {
  ALLOWED_SOURCES,
  ALLOWED_INDUSTRIES,
  ALLOWED_STATUSES,
  ALLOWED_LOSS_REASONS,
  validateEmail,
  validatePhone,
  validateExpectedValue,
  normalizeLeadStatus,
  normalizeLeadSource,
  normalizeIndustry,
  calculateLeadAge,
  isFollowUpOverdue,
  sanitizeText,
  validateLead,
};
