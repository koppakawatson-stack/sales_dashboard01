require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Salesperson = require('./src/models/Salesperson');
const Customer = require('./src/models/Customer');
const Lead = require('./src/models/Lead');
const Deal = require('./src/models/Deal');
const Activity = require('./src/models/Activity');
const Revenue = require('./src/models/Revenue');
const Target = require('./src/models/Target');
const AuditLog = require('./src/models/AuditLog');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/harvik_sales');
  console.log('✅ MongoDB Connected');
};

const seed = async () => {
  await connectDB();

  // Clear existing collections
  await Promise.all([
    Salesperson.deleteMany(),
    Customer.deleteMany(),
    Lead.deleteMany(),
    Deal.deleteMany(),
    Activity.deleteMany(),
    Revenue.deleteMany(),
    Target.deleteMany(),
    AuditLog.deleteMany(),
  ]);
  console.log('🗑️  Cleared existing collections');

  const defaultPasswordHash = await bcrypt.hash('Password@123', 10);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // ── 1. Salespersons ──
  // Arjun Sharma: Admin/Manager
  // Priya Patel: Sales Manager
  // Rahul Mehta: Scenario F (Target Achiever - Exceeded Monthly Target)
  // Sneha Reddy: Scenario G (Target Risk - Low Achievement vs High Target)
  // Vikram Singh: Mid-range Representative
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@harvik.com';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Password@123';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const salespersons = await Salesperson.insertMany([
    {
      userId: 'USR-0001',
      name: 'Arjun Sharma',
      email: 'arjun@harvik.com',
      phone: '+91 9876543210',
      department: 'Sales & Executive',
      role: 'Sales Manager',
      systemRole: 'ADMIN',
      status: 'ACTIVE',
      password: defaultPasswordHash,
      targets: { monthly: 500000, quarterly: 1500000, annual: 6000000 },
    },
    {
      userId: 'USR-0002',
      name: 'Priya Patel',
      email: 'priya@harvik.com',
      phone: '+91 9876543211',
      department: 'Regional Sales',
      role: 'Senior Sales Rep',
      systemRole: 'SALES_MANAGER',
      status: 'ACTIVE',
      password: defaultPasswordHash,
      targets: { monthly: 600000, quarterly: 1800000, annual: 7200000 },
    },
    {
      userId: 'USR-0003',
      name: 'Rahul Mehta', // Scenario F — Target Achiever
      email: 'rahul@harvik.com',
      phone: '+91 9876543212',
      department: 'Enterprise Sales',
      role: 'Account Executive',
      systemRole: 'SALESPERSON',
      status: 'ACTIVE',
      password: defaultPasswordHash,
      targets: { monthly: 800000, quarterly: 2400000, annual: 9600000 },
    },
    {
      userId: 'USR-0004',
      name: 'Sneha Reddy', // Scenario G — Target Risk
      email: 'sneha@harvik.com',
      phone: '+91 9876543213',
      department: 'Direct Sales',
      role: 'Sales Rep',
      systemRole: 'SALESPERSON',
      status: 'ACTIVE',
      password: defaultPasswordHash,
      targets: { monthly: 750000, quarterly: 2250000, annual: 9000000 },
    },
    {
      userId: 'USR-0005',
      name: 'Vikram Singh',
      email: 'vikram@harvik.com',
      phone: '+91 9876543214',
      department: 'Direct Sales',
      role: 'Sales Rep',
      systemRole: 'SALESPERSON',
      status: 'ACTIVE',
      password: defaultPasswordHash,
      targets: { monthly: 400000, quarterly: 1200000, annual: 4800000 },
    },
    {
      userId: 'USR-0006',
      name: 'Admin Manager',
      email: adminEmail,
      phone: '+91 9876543200',
      department: 'Sales Management',
      role: 'Sales Manager',
      systemRole: 'SALES_MANAGER',
      status: 'ACTIVE',
      password: adminPasswordHash,
      targets: { monthly: 1000000, quarterly: 3000000, annual: 12000000 },
    },
  ]);
  console.log('👤 Salespersons seeded:', salespersons.length);


  // ── 2. Customers (Scenarios A through E & Core Clients) ──
  const renewalSoonDate = new Date(now.getTime() + 18 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const oneYearFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const customers = await Customer.insertMany([
    {
      customerId: 'CUST-00001',
      companyName: 'TechNova Pvt Ltd', // Scenario A Customer
      email: 'procurement@technova.in',
      phone: '+91 9000000001',
      industry: 'Technology',
      status: 'Active',
      assignedSalesperson: salespersons[2]._id,
      totalRevenue: 2400000,
      productsPurchased: ['Enterprise Cloud CRM', 'API Analytics Pro'],
      contractInfo: {
        contractNumber: 'HAR-CTR-2025-001',
        value: 2400000,
        startDate: sixMonthsAgo,
        endDate: oneYearFuture,
        renewalDate: oneYearFuture,
        status: 'Active',
        terms: 'Annual enterprise multi-tenant SLA with 99.9% uptime and dedicated support.',
      },
      contactPersons: [
        { name: 'Karthik Rao', title: 'VP Engineering', email: 'karthik@technova.in', phone: '+91 9123456780', isPrimary: true },
        { name: 'Sunita Menon', title: 'Director Procurement', email: 'sunita@technova.in', phone: '+91 9123456781', isPrimary: false },
      ],
      address: { street: '12 Cyber Gateway, HITEC City', city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500081' },
      website: 'https://technova.in',
      notes: 'Strategic cloud customer; interested in expanding AI copilot add-on in Q3.',
    },
    {
      customerId: 'CUST-00002',
      companyName: 'ABC Solutions', // Scenario B Customer
      email: 'contact@abcsolutions.com',
      phone: '+91 9000000002',
      industry: 'Finance',
      status: 'Prospect',
      assignedSalesperson: salespersons[3]._id,
      totalRevenue: 0,
      productsPurchased: ['FinTech Audit Module (Pilot)'],
      contractInfo: {
        contractNumber: 'HAR-CTR-2026-002',
        value: 500000,
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        endDate: renewalSoonDate,
        renewalDate: renewalSoonDate,
        status: 'Pending Renewal',
        terms: 'Pilot evaluation phase contract expiring in 18 days.',
      },
      contactPersons: [
        { name: 'Deepak Varma', title: 'Operations Head', email: 'deepak@abcsolutions.com', phone: '+91 9123456782', isPrimary: true },
      ],
      address: { street: 'Plot 45, Bandra Kurla Complex', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400051' },
      website: 'https://abcsolutions.com',
      notes: 'Evaluation pilot running smoothly; renewal meeting scheduled with CFO.',
    },
    {
      customerId: 'CUST-00003',
      companyName: 'Global Systems Inc', // Scenario C Customer
      email: 'enterprise@globalsystems.com',
      phone: '+91 9000000003',
      industry: 'Technology',
      status: 'Active',
      assignedSalesperson: salespersons[1]._id,
      totalRevenue: 3500000,
      productsPurchased: ['Global Data Pipeline', 'Security Shield Plus', '24/7 Premium SLA'],
      contractInfo: {
        contractNumber: 'HAR-CTR-2024-089',
        value: 3500000,
        startDate: new Date(now.getTime() - 300 * 24 * 60 * 60 * 1000),
        endDate: oneYearFuture,
        renewalDate: oneYearFuture,
        status: 'Active',
        terms: '3-year master services agreement with quarterly billing.',
      },
      contactPersons: [
        { name: 'Sarah Jenkins', title: 'Director of IT', email: 'sarah@globalsystems.com', phone: '+91 9123456783', isPrimary: true },
        { name: 'Amit Desai', title: 'Infrastructure Lead', email: 'amit@globalsystems.com', phone: '+91 9123456784', isPrimary: false },
      ],
      address: { street: 'Tower 4, Embassy Golf Links', city: 'Bangalore', state: 'Karnataka', country: 'India', pincode: '560071' },
      website: 'https://globalsystems.com',
      notes: 'Key accounts tier; quarterly reviews conducted with executive team.',
    },
    {
      customerId: 'CUST-00004',
      companyName: 'Demo Industries', // Scenario D Customer
      email: 'info@demoindustries.com',
      phone: '+91 9000000004',
      industry: 'Manufacturing',
      status: 'Inactive',
      assignedSalesperson: salespersons[4]._id,
      totalRevenue: 450000,
      productsPurchased: ['Legacy ERP Connector'],
      contractInfo: {
        contractNumber: 'HAR-CTR-2023-012',
        value: 450000,
        startDate: new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
        renewalDate: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
        status: 'Expired',
        terms: 'Annual license expired; account currently inactive.',
      },
      contactPersons: [
        { name: 'Rajesh Nair', title: 'Plant Director', email: 'rajesh@demoindustries.com', phone: '+91 9123456785', isPrimary: true },
      ],
      address: { street: 'MIDC Industrial Estate Bhosari', city: 'Pune', state: 'Maharashtra', country: 'India', pincode: '411026' },
      website: 'https://demoindustries.com',
      notes: 'Plant modernization paused; re-engagement campaign planned for next fiscal year.',
    },
    {
      customerId: 'CUST-00005',
      companyName: 'Enterprise Client Corp', // Scenario E Customer
      email: 'procurement@enterpriseclient.com',
      phone: '+91 9000000005',
      industry: 'Healthcare',
      status: 'Active',
      assignedSalesperson: salespersons[2]._id,
      totalRevenue: 1200000,
      productsPurchased: ['Healthcare Compliance Suite', 'Patient Records Sync'],
      contractInfo: {
        contractNumber: 'HAR-CTR-2025-045',
        value: 1200000,
        startDate: sixMonthsAgo,
        endDate: oneYearFuture,
        renewalDate: oneYearFuture,
        status: 'Active',
        terms: 'HIPAA & ISO 27001 compliant enterprise health data license.',
      },
      contactPersons: [
        { name: 'Dr. Alok Sen', title: 'Chief Medical Officer', email: 'alok@enterpriseclient.com', phone: '+91 9123456786', isPrimary: true },
      ],
      address: { street: 'Barakhamba Road, Connaught Place', city: 'Delhi', state: 'Delhi', country: 'India', pincode: '110001' },
      website: 'https://enterpriseclient.com',
      notes: 'High satisfaction rating; expanding rollout to 4 regional hospitals.',
    },
    {
      customerId: 'CUST-00006',
      companyName: 'Apex Cloud Solutions',
      email: 'billing@apexcloud.io',
      phone: '+91 9000000006',
      industry: 'Technology',
      status: 'Active',
      assignedSalesperson: salespersons[0]._id,
      totalRevenue: 850000,
      productsPurchased: ['Apex Microservices Mesh'],
      contractInfo: {
        contractNumber: 'HAR-CTR-2025-067',
        value: 850000,
        startDate: sixMonthsAgo,
        endDate: oneYearFuture,
        renewalDate: oneYearFuture,
        status: 'Active',
        terms: 'Cloud services subscription with auto-scaling capabilities.',
      },
      contactPersons: [
        { name: 'Neha Kapoor', title: 'COO', email: 'neha@apexcloud.io', phone: '+91 9123456787', isPrimary: true },
      ],
      address: { street: 'Tidel Park, Rajiv Gandhi Salai', city: 'Chennai', state: 'Tamil Nadu', country: 'India', pincode: '600113' },
      website: 'https://apexcloud.io',
      notes: 'Early adopter customer; key partner for product feedback and beta trials.',
    },
  ]);
  console.log('🏢 Customers seeded:', customers.length);

  // ── 3. Leads (Section 36 Realistic Lifecycle Seed Data) ──
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const inTenDays = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  const leads = await Lead.insertMany([
    // LEAD-000001: TechNova Pvt Ltd — NEGOTIATION (₹18,00,000)
    {
      leadId: 'LEAD-000001',
      companyName: 'TechNova Pvt Ltd',
      contactPerson: 'Karthik Rao',
      email: 'procurement@technova.in',
      phone: '+91 9000000001',
      source: 'WEBSITE',
      industry: 'Technology',
      status: 'NEGOTIATION',
      expectedValue: 1800000,
      proposalValue: 1800000,
      assignedSalesperson: salespersons[2]._id, // Rahul Mehta
      requirement: 'Enterprise software requirement & cloud transition',
      productService: 'Enterprise Platform',
      decisionMaker: 'Karthik Rao (VP Eng)',
      negotiationAt: twoDaysAgo,
      proposalAt: fiveDaysAgo,
      qualifiedAt: tenDaysAgo,
      createdAt: tenDaysAgo,
      lastContactAt: yesterday,
      nextFollowUpAt: tomorrow,
      leadQualityScore: 92,
    },
    // LEAD-000002: ABC Solutions — NEW (₹4,50,000)
    {
      leadId: 'LEAD-000002',
      companyName: 'ABC Solutions',
      contactPerson: 'Deepak Varma',
      email: 'contact@abcsolutions.com',
      phone: '+91 9000000002',
      source: 'WEBSITE',
      industry: 'Finance',
      status: 'NEW',
      expectedValue: 450000,
      assignedSalesperson: salespersons[3]._id, // Sneha Reddy
      notes: 'Website enquiry regarding core platform integration',
      createdAt: twoDaysAgo,
      leadQualityScore: 78,
    },
    // LEAD-000003: Global Systems — QUALIFIED (₹25,00,000)
    {
      leadId: 'LEAD-000003',
      companyName: 'Global Systems Inc',
      contactPerson: 'Sarah Jenkins',
      email: 'enterprise@globalsystems.com',
      phone: '+91 9000000003',
      source: 'REFERRAL',
      industry: 'Technology',
      status: 'QUALIFIED',
      expectedValue: 2500000,
      assignedSalesperson: salespersons[1]._id, // Priya Patel
      requirement: 'Multi-region enterprise intelligence suite',
      qualifiedAt: threeDaysAgo,
      createdAt: fiveDaysAgo,
      lastContactAt: twoDaysAgo,
      nextFollowUpAt: inThreeDays,
      leadQualityScore: 95,
    },
    // LEAD-000004: Demo Industries — LOST (₹6,00,000, Reason: PRICE)
    {
      leadId: 'LEAD-000004',
      companyName: 'Demo Industries',
      contactPerson: 'Rajesh Nair',
      email: 'info@demoindustries.com',
      phone: '+91 9000000004',
      source: 'COLD_CALL',
      industry: 'Manufacturing',
      status: 'LOST',
      expectedValue: 600000,
      lossReason: 'PRICE',
      assignedSalesperson: salespersons[4]._id, // Vikram Singh
      requirement: 'Plant tracking software',
      lostAt: twoDaysAgo,
      createdAt: tenDaysAgo,
      notes: 'Price-sensitive customer; chose lower cost local vendor',
      leadQualityScore: 65,
    },
    // LEAD-000005: Enterprise Client — WON (₹12,00,000)
    {
      leadId: 'LEAD-000005',
      companyName: 'Enterprise Client Corp',
      contactPerson: 'Dr. Alok Sen',
      email: 'procurement@enterpriseclient.com',
      phone: '+91 9000000005',
      source: 'PARTNER',
      industry: 'Healthcare',
      status: 'WON',
      expectedValue: 1200000,
      finalDealValue: 1200000,
      productService: 'Healthcare AI Analytics',
      assignedSalesperson: salespersons[2]._id, // Rahul Mehta
      wonAt: yesterday,
      qualifiedAt: tenDaysAgo,
      proposalAt: fiveDaysAgo,
      negotiationAt: threeDaysAgo,
      createdAt: tenDaysAgo,
      notes: 'Large implementation across 14 hospital branches',
      leadQualityScore: 96,
    },
    // LEAD-000006: Prime Logistics Tech — CONTACTED (Overdue follow-up)
    {
      leadId: 'LEAD-000006',
      companyName: 'Prime Logistics Tech',
      contactPerson: 'Vikas Sharma',
      email: 'vikas@primelogistics.com',
      phone: '+91 9111111002',
      source: 'EMAIL_CAMPAIGN',
      industry: 'Transportation',
      status: 'CONTACTED',
      expectedValue: 700000,
      assignedSalesperson: salespersons[1]._id, // Priya Patel
      createdAt: tenDaysAgo,
      lastContactAt: fiveDaysAgo,
      nextFollowUpAt: yesterday, // Overdue follow-up!
      leadQualityScore: 80,
    },
    // LEAD-000007: EduSmart Platforms — PROPOSAL (₹8,50,000)
    {
      leadId: 'LEAD-000007',
      companyName: 'EduSmart Platforms',
      contactPerson: 'Pooja Bhatt',
      email: 'pooja@edusmart.org',
      phone: '+91 9111111005',
      source: 'WEBSITE',
      industry: 'Education',
      status: 'PROPOSAL',
      expectedValue: 850000,
      proposalValue: 850000,
      productService: 'Campus CRM Suite',
      requirement: 'Student lifecycle tracking',
      expectedClosingDate: inTenDays,
      assignedSalesperson: salespersons[0]._id, // Arjun Sharma
      qualifiedAt: fiveDaysAgo,
      proposalAt: twoDaysAgo,
      createdAt: tenDaysAgo,
      lastContactAt: yesterday,
      nextFollowUpAt: inThreeDays,
      leadQualityScore: 88,
    },
    // LEAD-000008: SolarGrid Energies — QUALIFIED (₹9,00,000)
    {
      leadId: 'LEAD-000008',
      companyName: 'SolarGrid Energies',
      contactPerson: 'Tarun Saxena',
      email: 'tarun@solargrid.com',
      phone: '+91 9111111006',
      source: 'SOCIAL_MEDIA',
      industry: 'Energy',
      status: 'QUALIFIED',
      expectedValue: 900000,
      assignedSalesperson: salespersons[4]._id, // Vikram Singh
      requirement: 'Renewable energy grid telemetry dashboard',
      qualifiedAt: twoDaysAgo,
      createdAt: fiveDaysAgo,
      lastContactAt: twoDaysAgo,
      nextFollowUpAt: inTenDays,
      leadQualityScore: 82,
    },
  ]);
  console.log('📋 Leads seeded:', leads.length);

  // ── 4. Deals (Scenarios A through E Explicitly Modeled) ──
  const deals = await Deal.insertMany([
    // SCENARIO A — Healthy Deal
    // Customer: TechNova Pvt Ltd, Deal: Enterprise Platform, Value: ₹18,00,000, Stage: Negotiation, Probability: 80%
    {
      dealId: 'DEAL-00001',
      opportunityName: 'TechNova - Enterprise Platform',
      customer: customers[0]._id,
      salesperson: salespersons[2]._id,
      productService: 'Enterprise Platform',
      dealValue: 1800000,
      probability: 80,
      stage: 'Negotiation',
      expectedClosingDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      weightedValue: 1440000,
    },
    // SCENARIO B — Stalled Deal
    // Customer: ABC Solutions, Value: ₹8,50,000, Stage: Proposal, Last activity: 21 days ago
    {
      dealId: 'DEAL-00002',
      opportunityName: 'ABC Solutions - Core Platform Upgrade',
      customer: customers[1]._id,
      salesperson: salespersons[3]._id,
      productService: 'Core Platform Upgrade',
      dealValue: 850000,
      probability: 50,
      stage: 'Proposal',
      expectedClosingDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      weightedValue: 425000,
      updatedAt: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000),
    },
    // SCENARIO C — Closing Soon
    // Customer: Global Systems, Value: ₹25,00,000, Expected close: within 7 days, Probability: 90%
    {
      dealId: 'DEAL-00003',
      opportunityName: 'Global Systems - Cloud Infrastructure Suite',
      customer: customers[2]._id,
      salesperson: salespersons[1]._id,
      productService: 'Cloud Infrastructure Suite',
      dealValue: 2500000,
      probability: 90,
      stage: 'Negotiation',
      expectedClosingDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      weightedValue: 2250000,
    },
    // SCENARIO D — Lost Deal
    // Customer: Demo Industries, Value: ₹6,00,000, Stage: LOST
    {
      dealId: 'DEAL-00004',
      opportunityName: 'Demo Industries - Analytics Engine',
      customer: customers[3]._id,
      salesperson: salespersons[4]._id,
      productService: 'Analytics Engine',
      dealValue: 600000,
      probability: 0,
      stage: 'Lost',
      expectedClosingDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      lostAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      lostReason: 'Budget cuts by executive leadership',
      weightedValue: 0,
    },
    // SCENARIO E — Won Deal
    // Customer: Enterprise Client, Value: ₹12,00,000, Stage: WON, Revenue: ₹12,00,000
    {
      dealId: 'DEAL-00005',
      opportunityName: 'Enterprise Client - Full Stack Deployment',
      customer: customers[4]._id,
      salesperson: salespersons[2]._id, // Rahul Mehta (Achiever)
      productService: 'Full Stack Deployment',
      dealValue: 1200000,
      probability: 100,
      stage: 'Won',
      expectedClosingDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      actualClosingDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      wonAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      weightedValue: 1200000,
    },
    // Additional Active Deals to flesh out pipeline
    {
      dealId: 'DEAL-00006',
      opportunityName: 'Apex Cloud - Maintenance & Support',
      customer: customers[5]._id,
      salesperson: salespersons[0]._id,
      productService: 'Maintenance & Support',
      dealValue: 500000,
      probability: 70,
      stage: 'Proposal',
      expectedClosingDate: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000),
      weightedValue: 350000,
    },
    {
      dealId: 'DEAL-00007',
      opportunityName: 'Prime Logistics - Fleet Optimizer',
      lead: leads[1]._id,
      salesperson: salespersons[1]._id,
      productService: 'Fleet Optimizer',
      dealValue: 600000,
      probability: 60,
      stage: 'Qualified',
      expectedClosingDate: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000),
      weightedValue: 360000,
    },
    // Second Won Deal in current month (helps Target Achiever Rahul Mehta exceed target)
    {
      dealId: 'DEAL-00008',
      opportunityName: 'TechNova - Security Auditing Phase',
      customer: customers[0]._id,
      salesperson: salespersons[2]._id, // Rahul Mehta
      productService: 'Security Auditing',
      dealValue: 300000,
      probability: 100,
      stage: 'Won',
      expectedClosingDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      actualClosingDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      wonAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      weightedValue: 300000,
    },
  ]);
  console.log('💼 Deals seeded:', deals.length);

  // ── 5. Revenue Records (Strictly Linked to Valid Business Events) ──
  // Scenario E Revenue: ₹12,00,000 for Enterprise Client (Deal #5)
  // Additional Revenue: ₹3,00,000 for Deal #8 (Total for Rahul = ₹15,00,000 vs Target ₹8,00,000 -> Exceeded!)
  // Sneha Reddy has ₹1,00,000 revenue vs Target ₹7,50,000 -> Scenario G Target Risk!
  const revenues = await Revenue.insertMany([
    // SCENARIO E REVENUE
    {
      revenueId: 'REV-00001',
      deal: deals[4]._id,
      customer: customers[4]._id,
      salesperson: salespersons[2]._id, // Rahul
      amount: 1200000,
      productService: 'Full Stack Deployment',
      date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      recognizedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      invoiceNumber: 'INV-2026-001',
      status: 'Paid',
      paymentStatus: 'Paid',
      source: 'OPPORTUNITY_WON',
    },
    // Deal #8 Revenue
    {
      revenueId: 'REV-00002',
      deal: deals[7]._id,
      customer: customers[0]._id,
      salesperson: salespersons[2]._id, // Rahul
      amount: 300000,
      productService: 'Security Auditing',
      date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      recognizedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      invoiceNumber: 'INV-2026-002',
      status: 'Paid',
      paymentStatus: 'Paid',
      source: 'OPPORTUNITY_WON',
    },
    // Sneha Reddy (Scenario G — Target Risk: only 1L revenue)
    {
      revenueId: 'REV-00003',
      customer: customers[1]._id,
      salesperson: salespersons[3]._id, // Sneha
      amount: 100000,
      productService: 'Consulting Retainer',
      date: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000),
      recognizedAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000),
      invoiceNumber: 'INV-2026-003',
      status: 'Paid',
      paymentStatus: 'Paid',
      source: 'DIRECT_CONTRACT',
    },
    // Priya Patel revenue
    {
      revenueId: 'REV-00004',
      customer: customers[2]._id,
      salesperson: salespersons[1]._id, // Priya
      amount: 500000,
      productService: 'Cloud Assessment',
      date: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      recognizedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      invoiceNumber: 'INV-2026-004',
      status: 'Paid',
      paymentStatus: 'Paid',
      source: 'OPPORTUNITY_WON',
    },
    // Arjun Sharma revenue
    {
      revenueId: 'REV-00005',
      customer: customers[5]._id,
      salesperson: salespersons[0]._id, // Arjun
      amount: 450000,
      productService: 'Maintenance & Support',
      date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      recognizedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      invoiceNumber: 'INV-2026-005',
      status: 'Paid',
      paymentStatus: 'Paid',
      source: 'OPPORTUNITY_WON',
    },
  ]);
  console.log('💰 Revenue records seeded:', revenues.length);

  // ── 6. Targets (Company & Per-Salesperson) ──
  // Company monthly target = ₹30,00,000 (total monthly revenue seeded = 12L + 3L + 1L + 5L + 4.5L = 25.5L -> ~85% achievement!)
  await Target.insertMany([
    {
      period: 'Monthly',
      year: currentYear,
      month: currentMonth,
      targetAmount: 3000000,
      salesperson: null, // Company overall target
      notes: 'Company Monthly Sales Target',
    },
    {
      period: 'Monthly',
      year: currentYear,
      month: currentMonth,
      targetAmount: 500000,
      salesperson: salespersons[0]._id,
    },
    {
      period: 'Monthly',
      year: currentYear,
      month: currentMonth,
      targetAmount: 600000,
      salesperson: salespersons[1]._id,
    },
    {
      // Rahul Mehta (Scenario F Achiever: Target 8L, Revenue 15L -> 187.5% achievement!)
      period: 'Monthly',
      year: currentYear,
      month: currentMonth,
      targetAmount: 800000,
      salesperson: salespersons[2]._id,
    },
    {
      // Sneha Reddy (Scenario G Target Risk: Target 7.5L, Revenue 1L -> 13.3% achievement!)
      period: 'Monthly',
      year: currentYear,
      month: currentMonth,
      targetAmount: 750000,
      salesperson: salespersons[3]._id,
    },
    {
      period: 'Monthly',
      year: currentYear,
      month: currentMonth,
      targetAmount: 400000,
      salesperson: salespersons[4]._id,
    },
  ]);
  console.log('🎯 Targets seeded');

  // ── 7. Activities (Including Scenario B: Stalled deal last activity 21 days ago) ──
  await Activity.insertMany([
    // Scenario B: ABC Solutions last activity 21 days ago
    {
      activityId: 'ACT-00001',
      activityType: 'Meeting',
      salesperson: salespersons[3]._id,
      customer: customers[1]._id,
      deal: deals[1]._id,
      date: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000),
      duration: 45,
      notes: 'Initial proposal review meeting. Awaiting customer feedback on budget.',
      outcome: 'Neutral',
      status: 'Completed',
    },
    {
      activityId: 'ACT-00002',
      activityType: 'Call',
      salesperson: salespersons[2]._id,
      customer: customers[0]._id,
      deal: deals[0]._id,
      date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      duration: 30,
      notes: 'Reviewed legal terms with VP Engineering.',
      outcome: 'Positive',
      status: 'Completed',
    },
    {
      activityId: 'ACT-00003',
      activityType: 'Demo',
      salesperson: salespersons[1]._id,
      customer: customers[2]._id,
      deal: deals[2]._id,
      date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      duration: 60,
      notes: 'Live cloud architecture demonstration.',
      outcome: 'Positive',
      status: 'Completed',
    },
  ]);
  console.log('📞 Activities seeded');

  // ── 8. Initial Audit Log Entries ──
  await AuditLog.insertMany([
    {
      actorId: String(salespersons[2]._id),
      action: 'OPPORTUNITY_WON',
      entityType: 'OPPORTUNITY',
      entityId: String(deals[4]._id),
      before: { stage: 'Negotiation' },
      after: { stage: 'Won', dealValue: 1200000 },
      timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      actorId: String(salespersons[2]._id),
      action: 'REVENUE_RECORDED',
      entityType: 'REVENUE',
      entityId: String(revenues[0]._id),
      before: {},
      after: { amount: 1200000, invoiceNumber: 'INV-2026-001' },
      timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  ]);
  console.log('📝 Audit entries recorded');

  console.log('\n========================================');
  console.log('✅ DATABASE SEED COMPLETE WITH SCENARIOS A - G');
  console.log('========================================');
  console.log('Verification Highlights:');
  console.log('• Total Active Pipeline (Deals #1, #2, #3, #6, #7):');
  console.log('  ₹18L + ₹8.5L + ₹25L + ₹5L + ₹6L = ₹62,50,000');
  console.log('• Total Won Revenue (REV #1 - #5):');
  console.log('  ₹12L + ₹3L + ₹1L + ₹5L + ₹4.5L = ₹25,50,000');
  console.log('• Monthly Company Target: ₹30,00,000');
  console.log('• Expected Company Target Achievement: 85.0% (25.5L / 30L)');
  console.log('• Scenario F (Rahul Mehta): Target ₹8L, Won Revenue ₹15L -> 187.5% (Achiever!)');
  console.log('• Scenario G (Sneha Reddy): Target ₹7.5L, Won Revenue ₹1L -> 13.3% (Risk!)');
  console.log('========================================\n');

  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});
