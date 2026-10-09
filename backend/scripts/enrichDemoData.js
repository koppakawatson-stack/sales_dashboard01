/**
 * HARVIK TECHNOLOGIES — Enrich Demo Leads with Activities & Audit History
 * Links rich activities and audit logs to all seeded leads for live UI demonstration.
 */

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Lead = require('../src/models/Lead');
const Activity = require('../src/models/Activity');
const AuditLog = require('../src/models/AuditLog');
const Salesperson = require('../src/models/Salesperson');

async function enrichDemo() {
  await connectDB();
  console.log('Enriching demo leads with activities and audit history...');

  const rahul = await Salesperson.findOne({ email: 'rahul@harvik.com' });
  const priya = await Salesperson.findOne({ email: 'priya@harvik.com' });
  const sneha = await Salesperson.findOne({ email: 'sneha@harvik.com' });
  const vikram = await Salesperson.findOne({ email: 'vikram@harvik.com' });
  const arjun = await Salesperson.findOne({ email: 'arjun@harvik.com' });

  const lead1 = await Lead.findOne({ leadId: 'LEAD-000001' }); // TechNova (NEGOTIATION)
  const lead2 = await Lead.findOne({ leadId: 'LEAD-000002' }); // ABC Solutions (NEW)
  const lead3 = await Lead.findOne({ leadId: 'LEAD-000003' }); // Global Systems (QUALIFIED)
  const lead4 = await Lead.findOne({ leadId: 'LEAD-000004' }); // Demo Industries (LOST)
  const lead5 = await Lead.findOne({ leadId: 'LEAD-000005' }); // Enterprise Client (WON)
  const lead6 = await Lead.findOne({ leadId: 'LEAD-000006' }); // Prime Logistics (CONTACTED - OVERDUE)
  const lead7 = await Lead.findOne({ leadId: 'LEAD-000007' }); // EduSmart (PROPOSAL)
  const lead8 = await Lead.findOne({ leadId: 'LEAD-000008' }); // SolarGrid (QUALIFIED)

  await Activity.deleteMany({ activityId: null });
  // Clear existing lead-specific activities
  if (lead1) await Activity.deleteMany({ lead: { $in: [lead1._id, lead2?._id, lead3?._id, lead6?._id, lead7?._id, lead8?._id] } });

  const now = new Date();
  const d = (daysAgo) => new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

  const activities = [];

  // LEAD-000001 (TechNova) Activities
  if (lead1) {
    activities.push(
      {
        activityType: 'Call',
        salesperson: rahul._id,
        lead: lead1._id,
        date: d(9),
        duration: 25,
        notes: 'Introductory call with Karthik Rao (VP Engineering). Expressed urgent need for enterprise cloud migration.',
        outcome: 'Positive',
        status: 'Completed',
      },
      {
        activityType: 'Meeting',
        salesperson: rahul._id,
        lead: lead1._id,
        date: d(6),
        duration: 45,
        notes: 'Requirement scoping workshop. Board approved ₹18,00,000 preliminary budget.',
        outcome: 'Positive',
        status: 'Completed',
      },
      {
        activityType: 'Proposal',
        salesperson: rahul._id,
        lead: lead1._id,
        date: d(4),
        duration: 30,
        notes: 'Submitted formal commercial proposal and architecture security blueprints.',
        outcome: 'Positive',
        status: 'Completed',
      },
      {
        activityType: 'Call',
        salesperson: rahul._id,
        lead: lead1._id,
        date: d(1),
        duration: 20,
        notes: 'Negotiation round on payment milestones and annual support SLA. Ready for final closing.',
        outcome: 'Positive',
        status: 'Completed',
      }
    );
  }

  // LEAD-000003 (Global Systems) Activities
  if (lead3) {
    activities.push(
      {
        activityType: 'Email',
        salesperson: priya._id,
        lead: lead3._id,
        date: d(4),
        notes: 'Sent enterprise product brochure and compliance certifications to Sarah Jenkins.',
        outcome: 'Positive',
        status: 'Completed',
      },
      {
        activityType: 'Demo',
        salesperson: priya._id,
        lead: lead3._id,
        date: d(2),
        duration: 60,
        notes: 'Full technical demo of Harvik Sales Intelligence platform to IT leadership.',
        outcome: 'Positive',
        status: 'Completed',
      }
    );
  }

  // LEAD-000006 (Prime Logistics Tech - Overdue) Activities
  if (lead6) {
    activities.push(
      {
        activityType: 'Email',
        salesperson: priya._id,
        lead: lead6._id,
        date: d(5),
        notes: 'Initial email exchange regarding logistics tracking automation.',
        outcome: 'Neutral',
        status: 'Completed',
      },
      {
        activityType: 'Follow-up',
        salesperson: priya._id,
        lead: lead6._id,
        date: d(1),
        notes: 'Follow-up scheduled to confirm discovery call time — OVERDUE.',
        outcome: 'Pending',
        status: 'Planned',
      }
    );
  }

  // LEAD-000007 (EduSmart) Activities
  if (lead7) {
    activities.push(
      {
        activityType: 'Meeting',
        salesperson: arjun._id,
        lead: lead7._id,
        date: d(3),
        duration: 50,
        notes: 'Commercial presentation of Campus CRM Suite to Dean and IT committee.',
        outcome: 'Positive',
        status: 'Completed',
      }
    );
  }

  if (activities.length > 0) {
    const existingCount = await Activity.countDocuments();
    activities.forEach((act, idx) => {
      act.activityId = `ACT-LD-${String(existingCount + idx + 1).padStart(4, '0')}`;
    });
    await Activity.insertMany(activities);
    console.log(`✅ Seeded ${activities.length} activities linked to leads`);
  }

  // Ensure Lead-specific Audit Logs exist
  const audits = [];
  if (lead1) {
    audits.push(
      {
        actorId: String(rahul._id),
        action: 'LEAD_CREATED',
        entityType: 'LEAD',
        entityId: 'LEAD-000001',
        after: { status: 'NEW', companyName: 'TechNova Pvt Ltd' },
        timestamp: d(10),
      },
      {
        actorId: String(rahul._id),
        action: 'LEAD_STATUS_CHANGED',
        entityType: 'LEAD',
        entityId: 'LEAD-000001',
        before: { status: 'NEW' },
        after: { status: 'CONTACTED' },
        timestamp: d(8),
      },
      {
        actorId: String(rahul._id),
        action: 'LEAD_QUALIFIED',
        entityType: 'LEAD',
        entityId: 'LEAD-000001',
        before: { status: 'CONTACTED' },
        after: { status: 'QUALIFIED' },
        timestamp: d(6),
      },
      {
        actorId: String(rahul._id),
        action: 'LEAD_STATUS_CHANGED',
        entityType: 'LEAD',
        entityId: 'LEAD-000001',
        before: { status: 'QUALIFIED' },
        after: { status: 'PROPOSAL' },
        timestamp: d(4),
      },
      {
        actorId: String(rahul._id),
        action: 'LEAD_STATUS_CHANGED',
        entityType: 'LEAD',
        entityId: 'LEAD-000001',
        before: { status: 'PROPOSAL' },
        after: { status: 'NEGOTIATION' },
        timestamp: d(2),
      }
    );
  }

  if (lead4) {
    audits.push({
      actorId: String(vikram._id),
      action: 'LEAD_LOST',
      entityType: 'LEAD',
      entityId: 'LEAD-000004',
      before: { status: 'NEGOTIATION' },
      after: { status: 'LOST', lossReason: 'PRICE' },
      timestamp: d(2),
    });
  }

  if (lead5) {
    audits.push({
      actorId: String(rahul._id),
      action: 'LEAD_WON',
      entityType: 'LEAD',
      entityId: 'LEAD-000005',
      before: { status: 'NEGOTIATION' },
      after: { status: 'WON', finalDealValue: 1200000 },
      timestamp: d(1),
    });
  }

  if (audits.length > 0) {
    await AuditLog.insertMany(audits);
    console.log(`✅ Seeded ${audits.length} audit trail records for leads`);
  }

  console.log('✅ Demo enrichment complete!');
  process.exit(0);
}

enrichDemo().catch(err => {
  console.error(err);
  process.exit(1);
});
