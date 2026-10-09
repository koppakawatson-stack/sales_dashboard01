const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const JWT_SECRET = process.env.JWT_SECRET || 'harvik_technologies_super_secret_jwt_key_2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Role Display Helper
function getDisplayRole(systemRole, customRole) {
  if (customRole) return customRole;
  switch ((systemRole || '').toUpperCase()) {
    case 'ADMIN': return 'Administrator';
    case 'SALES_MANAGER': return 'Sales Manager';
    case 'SALESPERSON': return 'Salesperson';
    default: return 'Sales Representative';
  }
}

// In-memory / rate limit tracking for login attempts
const failedAttempts = new Map();

/**
 * POST /api/v1/auth/login
 */
exports.login = async (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const requestId = req.headers['x-request-id'] || 'auth-req';

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required.',
        },
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // Check rate limit (max 25 failed attempts per IP/email per 15 min, with proper window reset)
    let attempts = failedAttempts.get(`${ip}:${normalizedEmail}`);
    if (attempts && Date.now() - attempts.firstAttempt > 15 * 60 * 1000) {
      failedAttempts.delete(`${ip}:${normalizedEmail}`);
      attempts = undefined;
    }
    if (!attempts) {
      attempts = { count: 0, firstAttempt: Date.now() };
    }
    if (attempts.count >= 25) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many failed login attempts. Please try again in 15 minutes.',
        },
      });
    }


    // Lookup user in MongoDB
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // Increment failed attempts
      attempts.count++;
      failedAttempts.set(`${ip}:${normalizedEmail}`, attempts);

      await AuditLog.create({
        actorId: 'ANONYMOUS',
        action: 'LOGIN_FAILURE',
        entityType: 'AUTH',
        entityId: normalizedEmail,
        after: { reason: 'User not found', ip, requestId },
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Invalid email or password.',
        },
      });
    }

    // Check account status
    if (!user.isActive || user.status === 'DISABLED' || user.status === 'INACTIVE') {
      await AuditLog.create({
        actorId: String(user._id),
        action: 'LOGIN_FAILURE',
        entityType: 'AUTH',
        entityId: user.userId || String(user._id),
        after: { reason: 'Account disabled', ip, requestId },
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Account has been deactivated. Please contact an administrator.',
        },
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      attempts.count++;
      failedAttempts.set(`${ip}:${normalizedEmail}`, attempts);

      await AuditLog.create({
        actorId: String(user._id),
        action: 'LOGIN_FAILURE',
        entityType: 'AUTH',
        entityId: user.userId || String(user._id),
        after: { reason: 'Invalid password', ip, requestId },
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Invalid email or password.',
        },
      });
    }

    // Clear failed attempts on successful login
    failedAttempts.delete(`${ip}:${normalizedEmail}`);

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save();

    // Sign JWT token
    const token = jwt.sign(
      {
        id: user._id,
        userId: user.userId,
        email: user.email,
        role: user.systemRole,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Audit login success
    await AuditLog.create({
      actorId: String(user._id),
      action: 'LOGIN_SUCCESS',
      entityType: 'AUTH',
      entityId: user.userId || String(user._id),
      after: { email: user.email, role: user.systemRole, ip, requestId },
    });

    const safeUser = {
      userId: user.userId || `USR-${String(user._id).substring(0, 6)}`,
      name: user.name,
      email: user.email,
      role: user.systemRole || 'SALES_MANAGER',
      displayRole: getDisplayRole(user.systemRole, user.role),
      status: user.status || (user.isActive ? 'ACTIVE' : 'DISABLED'),
      department: user.department || 'Sales',
      phone: user.phone || '',
      avatar: user.avatar || '',
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };

    res.json({
      success: true,
      token,
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/auth/me
 */
exports.getMe = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication token required.',
        },
      });
    }

    // Ensure we have latest user state from MongoDB
    const user = await User.findById(req.user._id || req.user.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User account not found or deactivated.',
        },
      });
    }

    const safeUser = {
      userId: user.userId || `USR-${String(user._id).substring(0, 6)}`,
      name: user.name,
      email: user.email,
      role: user.systemRole || 'SALES_MANAGER',
      displayRole: getDisplayRole(user.systemRole, user.role),
      status: user.status || (user.isActive ? 'ACTIVE' : 'DISABLED'),
      department: user.department || 'Sales',
      phone: user.phone || '',
      avatar: user.avatar || '',
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };

    res.json({
      success: true,
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/logout
 */
exports.logout = async (req, res, next) => {
  try {
    if (req.user) {
      await AuditLog.create({
        actorId: String(req.user._id || req.user.id || 'ANONYMOUS'),
        action: 'LOGOUT',
        entityType: 'AUTH',
        entityId: req.user.userId || String(req.user._id || 'USER'),
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (err) {
    next(err);
  }
};
