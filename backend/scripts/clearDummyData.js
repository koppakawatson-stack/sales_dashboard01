require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Salesperson = require('../src/models/Salesperson');
const Customer = require('../src/models/Customer');
const Lead = require('../src/models/Lead');
const Deal = require('../src/models/Deal');
const Activity = require('../src/models/Activity');
const Revenue = require('../src/models/Revenue');
const Target = require('../src/models/Target');
const AuditLog = require('../src/models/AuditLog');

const clearDummyData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/harvik_sales';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB:', mongoUri);

    console.log('\n--- 1. CURRENT RECORD COUNTS (BEFORE DELETION) ---');
    console.log('Leads:', await Lead.countDocuments());
    console.log('Deals:', await Deal.countDocuments());
    console.log('Customers:', await Customer.countDocuments());
    console.log('Activities:', await Activity.countDocuments());
    console.log('Revenue records:', await Revenue.countDocuments());
    console.log('Targets:', await Target.countDocuments());
    console.log('Audit Logs:', await AuditLog.countDocuments());
    console.log('Salespersons / Users:', await Salesperson.countDocuments());

    console.log('\n--- 2. DELETING DUMMY OPERATIONAL & TRANSACTIONAL DATA ---');
    const [leadsRes, dealsRes, custRes, actRes, revRes, targetRes, auditRes] = await Promise.all([
      Lead.deleteMany({}),
      Deal.deleteMany({}),
      Customer.deleteMany({}),
      Activity.deleteMany({}),
      Revenue.deleteMany({}),
      Target.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    console.log(`🗑️ Deleted ${leadsRes.deletedCount} Leads`);
    console.log(`🗑️ Deleted ${dealsRes.deletedCount} Deals`);
    console.log(`🗑️ Deleted ${custRes.deletedCount} Customers`);
    console.log(`🗑️ Deleted ${actRes.deletedCount} Activities`);
    console.log(`🗑️ Deleted ${revRes.deletedCount} Revenue records`);
    console.log(`🗑️ Deleted ${targetRes.deletedCount} Targets`);
    console.log(`🗑️ Deleted ${auditRes.deletedCount} Audit Logs`);

    // Reset Salespersons target achievements to 0 while keeping login credentials
    await Salesperson.updateMany({}, {
      $set: {
        'targets.monthly': 0,
        'targets.quarterly': 0,
        'targets.annual': 0
      }
    });

    console.log('\n--- 3. VERIFYING CLEAN STATE (AFTER DELETION) ---');
    console.log('Leads:', await Lead.countDocuments());
    console.log('Deals:', await Deal.countDocuments());
    console.log('Customers:', await Customer.countDocuments());
    console.log('Activities:', await Activity.countDocuments());
    console.log('Revenue records:', await Revenue.countDocuments());
    console.log('Targets:', await Target.countDocuments());
    console.log('Audit Logs:', await AuditLog.countDocuments());
    console.log('Salespersons / Users:', await Salesperson.countDocuments());

    console.log('\n✅ All dummy data has been successfully deleted. Database is clean!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to clear dummy data:', err);
    process.exit(1);
  }
};

clearDummyData();
