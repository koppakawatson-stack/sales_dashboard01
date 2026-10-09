/**
 * HARVIK TECHNOLOGIES — Customer Validation Controls
 * Pure functions for validating and sanitizing customer records, contacts, and contract data.
 */

const ALLOWED_INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail',
  'Education', 'Real Estate', 'Media', 'Transportation', 'Energy', 'Other'
];

const ALLOWED_STATUSES = ['Active', 'Inactive', 'Prospect', 'Churned'];

const ALLOWED_CONTRACT_STATUSES = ['Active', 'Pending Renewal', 'Expired', 'Terminated'];

/**
 * Validates company name.
 * Must be non-empty string and not whitespace-only.
 */
function validateCompanyName(companyName) {
  if (!companyName || typeof companyName !== 'string') return false;
  return companyName.trim().length > 0;
}

/**
 * Validates and normalizes email format.
 */
function validateEmail(email) {
  if (!email) return { isValid: true, email: null };
  if (typeof email !== 'string') return { isValid: false, error: 'Email must be a string.' };

  const normalized = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(normalized)) {
    return { isValid: false, error: 'Malformed email address format.' };
  }
  return { isValid: true, email: normalized };
}

/**
 * Validates telephone number format.
 */
function validatePhone(phone) {
  if (!phone) return { isValid: true, phone: null };
  if (typeof phone !== 'string') return { isValid: false, error: 'Phone must be a string.' };

  const cleaned = phone.trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return { isValid: false, error: 'Phone number must contain between 7 and 15 digits.' };
  }
  return { isValid: true, phone: cleaned };
}

/**
 * Validates and normalizes industry.
 */
function normalizeIndustry(industry) {
  if (!industry) return 'Other';
  const match = ALLOWED_INDUSTRIES.find(
    i => i.toLowerCase() === String(industry).trim().toLowerCase()
  );
  return match || 'Other';
}

/**
 * Validates and normalizes customer status.
 */
function normalizeCustomerStatus(status) {
  if (!status) return 'Active';
  const match = ALLOWED_STATUSES.find(
    s => s.toLowerCase() === String(status).trim().toLowerCase()
  );
  return match || 'Active';
}

/**
 * Validates contract information.
 */
function validateContractInfo(contractInfo = {}) {
  const errors = [];
  if (!contractInfo || typeof contractInfo !== 'object') {
    return { isValid: true, data: {} };
  }

  const sanitized = { ...contractInfo };

  // Validate contract value
  if (sanitized.value !== undefined && sanitized.value !== null && sanitized.value !== '') {
    const val = Number(sanitized.value);
    if (isNaN(val) || val < 0) {
      errors.push('Contract value must be a non-negative number.');
    } else {
      sanitized.value = val;
    }
  }

  // Validate dates
  if (sanitized.startDate && sanitized.endDate) {
    const start = new Date(sanitized.startDate);
    const end = new Date(sanitized.endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end < start) {
      errors.push('Contract end date cannot be earlier than start date.');
    }
  }

  // Validate status
  if (sanitized.status) {
    const matchedStatus = ALLOWED_CONTRACT_STATUSES.find(
      s => s.toLowerCase() === String(sanitized.status).trim().toLowerCase()
    );
    if (!matchedStatus) {
      errors.push(`Invalid contract status. Allowed: ${ALLOWED_CONTRACT_STATUSES.join(', ')}`);
    } else {
      sanitized.status = matchedStatus;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: sanitized,
  };
}

/**
 * Checks if contract renewal is upcoming within N days.
 */
function isRenewalUpcoming(renewalDate, withinDays = 30) {
  if (!renewalDate) return false;
  const renewal = new Date(renewalDate);
  if (isNaN(renewal.getTime())) return false;

  const now = new Date();
  const diffTime = renewal.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= withinDays;
}

/**
 * Checks if contract is expired.
 */
function isContractExpired(endDate) {
  if (!endDate) return false;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return false;
  return end.getTime() < Date.now();
}

/**
 * Comprehensive customer input validation.
 */
function validateCustomer(payload = {}) {
  const errors = [];
  const sanitized = { ...payload };

  if (!validateCompanyName(sanitized.companyName)) {
    errors.push('Company name is required and cannot be empty or whitespace.');
  } else {
    sanitized.companyName = sanitized.companyName.trim();
  }

  if (sanitized.email) {
    const emailRes = validateEmail(sanitized.email);
    if (!emailRes.isValid) errors.push(emailRes.error);
    else sanitized.email = emailRes.email;
  }

  if (sanitized.phone) {
    const phoneRes = validatePhone(sanitized.phone);
    if (!phoneRes.isValid) errors.push(phoneRes.error);
    else sanitized.phone = phoneRes.phone;
  }

  sanitized.industry = normalizeIndustry(sanitized.industry);
  sanitized.status = normalizeCustomerStatus(sanitized.status);

  // Validate contact persons if provided
  if (sanitized.contactPersons && Array.isArray(sanitized.contactPersons)) {
    sanitized.contactPersons = sanitized.contactPersons.map((cp, idx) => {
      const p = { ...cp };
      if (!p.name || !String(p.name).trim()) {
        errors.push(`Contact person #${idx + 1} must have a name.`);
      } else {
        p.name = String(p.name).trim();
      }
      if (p.email) {
        const eRes = validateEmail(p.email);
        if (eRes.isValid) p.email = eRes.email;
      }
      return p;
    });
  }

  // Validate contract information
  if (sanitized.contractInfo) {
    const contractRes = validateContractInfo(sanitized.contractInfo);
    if (!contractRes.isValid) {
      errors.push(...contractRes.errors);
    } else {
      sanitized.contractInfo = contractRes.data;
    }
  }

  // Sanitize notes
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
  ALLOWED_INDUSTRIES,
  ALLOWED_STATUSES,
  ALLOWED_CONTRACT_STATUSES,
  validateCompanyName,
  validateEmail,
  validatePhone,
  normalizeIndustry,
  normalizeCustomerStatus,
  validateContractInfo,
  isRenewalUpcoming,
  isContractExpired,
  validateCustomer,
};
