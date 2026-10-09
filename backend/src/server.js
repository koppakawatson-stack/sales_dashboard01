require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');
const { initFollowUpQueue } = require('./jobs/followUpQueue');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const leadsRoutes = require('./routes/leads');
const customersRoutes = require('./routes/customers');
const dealsRoutes = require('./routes/deals');
const activitiesRoutes = require('./routes/activities');
const revenueRoutes = require('./routes/revenue');
const salespersonsRoutes = require('./routes/salespersons');

const app = express();


// Security & middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-dev-role', 'x-user-id', 'x-require-strict-auth'],
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const isDev = process.env.NODE_ENV !== 'production';
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: isDev ? 100000 : parseInt(process.env.RATE_LIMIT_MAX || '5000'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev && (req.path.startsWith('/health') || req.path.startsWith('/auth')),
});
app.use('/api/', limiter);



// Health checks & Diagnostics
const mongoose = require('mongoose');
const { getRedis } = require('./config/redis');

const healthHandler = (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'healthy' : 'disconnected';
  const redisClient = getRedis();
  const redisStatus = redisClient && redisClient.isOpen ? 'healthy' : 'fallback-mode';
  const isHealthy = mongoStatus === 'healthy';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    services: {
      api: 'healthy',
      mongodb: mongoStatus,
      redis: redisStatus,
    },
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// ── API v1 Routes (Primary Specification) ──
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/leads', leadsRoutes);
app.use('/api/v1/customers', customersRoutes);
app.use('/api/v1/deals', dealsRoutes);
app.use('/api/v1/activities', activitiesRoutes);
app.use('/api/v1/revenue', revenueRoutes);
app.use('/api/v1/salespersons', salespersonsRoutes);

// ── API Legacy Routes (Backward Compatibility) ──
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/salespersons', salespersonsRoutes);


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} not found.`,
    },
  });
});

// HARVIK Centralized Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  await connectRedis();
  initFollowUpQueue();
  app.listen(PORT, () => {
    console.log(`🚀 Harvik Sales API v1 running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
};

if (require.main === module) {
  start();
}

module.exports = app;
