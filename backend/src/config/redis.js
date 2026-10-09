const { createClient } = require('redis');

let redisClient = null;
const stats = {
  hits: 0,
  misses: 0,
  failures: 0,
};

const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries) => {
          if (retries > 1) return false;
          return 500;
        },
      },
    });
    redisClient.on('error', (err) => {
      stats.failures++;
      console.warn('⚠️  Redis Client Error (non-fatal, fallback to MongoDB):', err.message);
    });
    redisClient.on('connect', () => console.log('✅ Redis Connected'));
    await redisClient.connect();
  } catch (error) {
    stats.failures++;
    console.warn('⚠️  Redis connection failed (running with MongoDB-only mode):', error.message);
    redisClient = null;
  }
};

const getRedis = () => redisClient;

const cacheGet = async (key) => {
  const start = Date.now();
  try {
    if (!redisClient || !redisClient.isOpen) {
      stats.misses++;
      return { data: null, duration: 0, hit: false };
    }
    const val = await redisClient.get(key);
    const duration = Date.now() - start;
    if (val) {
      stats.hits++;
      return { data: JSON.parse(val), duration, hit: true };
    }
    stats.misses++;
    return { data: null, duration, hit: false };
  } catch (err) {
    stats.failures++;
    return { data: null, duration: Date.now() - start, hit: false };
  }
};

const cacheSet = async (key, value, ttl = 60) => {
  const start = Date.now();
  try {
    if (!redisClient || !redisClient.isOpen) return 0;
    await redisClient.setEx(key, ttl, JSON.stringify(value));
    return Date.now() - start;
  } catch {
    stats.failures++;
    return 0;
  }
};

const cacheDel = async (key) => {
  try {
    if (!redisClient || !redisClient.isOpen) return;
    await redisClient.del(key);
  } catch {
    stats.failures++;
  }
};

const cacheDelPattern = async (pattern) => {
  try {
    if (!redisClient || !redisClient.isOpen) return;
    const keys = await redisClient.keys(pattern);
    if (keys && keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch {
    stats.failures++;
  }
};

const invalidateDashboardCache = async () => {
  await Promise.all([
    cacheDelPattern('cache:sales:dashboard:*'),
    cacheDelPattern('dashboard:*'),
  ]);
};

const getCacheStats = () => ({ ...stats });

module.exports = {
  connectRedis,
  getRedis,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  invalidateDashboardCache,
  getCacheStats,
};
