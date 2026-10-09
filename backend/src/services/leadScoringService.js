/**
 * HARVIK TECHNOLOGIES — Lead Quality Scoring Service
 * Advisory scoring engine calculating multidimensional quality scores (0-100).
 * Note: AI/ML scores remain purely advisory and NEVER directly alter lead status.
 */

function calculateLeadQualityScore(lead = {}) {
  let score = 0;
  const factors = {
    contactCompleteness: 0,
    companyCompleteness: 0,
    sourceQuality: 0,
    commercialPotential: 0,
    followUpDiscipline: 0,
  };

  // 1. Contact Completeness (Max 25 pts)
  if (lead.contactPerson && String(lead.contactPerson).trim().length > 2) factors.contactCompleteness += 10;
  if (lead.email && lead.email.includes('@')) factors.contactCompleteness += 8;
  if (lead.phone && String(lead.phone).trim().length >= 7) factors.contactCompleteness += 7;

  // 2. Company Information Completeness (Max 20 pts)
  if (lead.companyName && String(lead.companyName).trim().length > 2) factors.companyCompleteness += 10;
  if (lead.industry && lead.industry !== 'Other') factors.companyCompleteness += 5;
  if (lead.location?.city) factors.companyCompleteness += 5;

  // 3. Source Quality (Max 20 pts)
  const source = (lead.source || '').toUpperCase();
  if (source === 'REFERRAL' || source === 'PARTNER') {
    factors.sourceQuality = 20;
  } else if (source === 'WEBSITE' || source === 'EVENT') {
    factors.sourceQuality = 15;
  } else if (source === 'SOCIAL_MEDIA' || source === 'EMAIL_CAMPAIGN') {
    factors.sourceQuality = 10;
  } else if (source === 'COLD_CALL' || source === 'ADVERTISEMENT') {
    factors.sourceQuality = 8;
  } else {
    factors.sourceQuality = 5;
  }

  // 4. Commercial Potential (Expected Value) (Max 20 pts)
  const val = Number(lead.expectedValue) || 0;
  if (val >= 2000000) {
    factors.commercialPotential = 20;
  } else if (val >= 1000000) {
    factors.commercialPotential = 16;
  } else if (val >= 500000) {
    factors.commercialPotential = 12;
  } else if (val > 0) {
    factors.commercialPotential = 8;
  } else {
    factors.commercialPotential = 0;
  }

  // 5. Follow-Up Discipline & Engagement (Max 15 pts)
  if (lead.nextFollowUpAt || lead.nextFollowUpDate) {
    factors.followUpDiscipline += 10;
  }
  if (lead.notes && String(lead.notes).trim().length > 10) {
    factors.followUpDiscipline += 5;
  }

  score = factors.contactCompleteness +
          factors.companyCompleteness +
          factors.sourceQuality +
          factors.commercialPotential +
          factors.followUpDiscipline;

  return {
    score: Math.min(100, Math.max(0, score)),
    scoreVersion: '1.0.0',
    generatedAt: new Date(),
    factors,
  };
}

module.exports = {
  calculateLeadQualityScore,
};
