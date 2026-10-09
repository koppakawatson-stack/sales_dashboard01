require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/harvik_sales');
    console.log('✅ MongoDB Connected for User Seeding');

    const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Password@123';
    const hash = await bcrypt.hash(defaultPassword, 10);

    const testUsers = [
      {
        userId: 'USR-0001',
        name: 'Admin Manager',
        email: process.env.INITIAL_ADMIN_EMAIL || 'admin@harvik.com',
        phone: '+91 9876543200',
        department: 'Sales Management',
        role: 'Sales Manager',
        systemRole: 'SALES_MANAGER',
        status: 'ACTIVE',
        password: hash,
      },
      {
        userId: 'USR-0002',
        name: 'Arjun Sharma',
        email: process.env.ADMIN_EMAIL || 'arjun@harvik.com',
        phone: '+91 9876543210',
        department: 'Executive Administration',
        role: 'Administrator',
        systemRole: 'ADMIN',
        status: 'ACTIVE',
        password: hash,
      },
      {
        userId: 'USR-0003',
        name: 'Rahul Mehta',
        email: process.env.SALESPERSON_EMAIL || 'rahul@harvik.com',
        phone: '+91 9876543212',
        department: 'Enterprise Sales',
        role: 'Account Executive',
        systemRole: 'SALESPERSON',
        status: 'ACTIVE',
        password: hash,
      },

      {
        userId: 'USR-0004',
        name: 'Priya Patel',
        email: process.env.MANAGER_EMAIL || 'priya@harvik.com',
        phone: '+91 9876543211',
        department: 'Regional Sales',
        role: 'Sales Manager',
        systemRole: 'SALES_MANAGER',
        status: 'ACTIVE',
        password: hash,
      },
      {
        userId: 'USR-0005',
        name: 'Disabled User',
        email: 'disabled@harvik.com',
        phone: '+91 9876543299',
        department: 'Archived',
        role: 'Sales Rep',
        systemRole: 'SALESPERSON',
        status: 'DISABLED',
        isActive: false,
        password: hash,
      },
    ];

    for (const u of testUsers) {
      await User.findOneAndUpdate(
        { email: u.email },
        { $set: u },
        { upsert: true, new: true }
      );
      console.log(`👤 Seeded User: ${u.name} (${u.email}) [Role: ${u.systemRole}]`);
    }

    console.log('✅ User seeding completed successfully.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ User seeding failed:', err.message);
    process.exit(1);
  }
};

seedUsers();
