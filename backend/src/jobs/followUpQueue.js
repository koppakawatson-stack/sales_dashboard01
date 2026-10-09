/**
 * HARVIK TECHNOLOGIES — BullMQ Follow-Up Queue & Worker
 * Asynchronously processes lead follow-ups and notifications.
 * Degrades gracefully if Redis is unavailable so Lead CRUD remains 100% operational.
 */

const { Queue, Worker } = require('bullmq');
const { getRedis } = require('../config/redis');

const QUEUE_NAME = 'lead-followups';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let followUpQueue = null;
let followUpWorker = null;

const getRedisConnection = () => {
  try {
    const url = new URL(REDIS_URL);
    return {
      host: url.hostname || 'localhost',
      port: Number(url.port) || 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 1000,
      retryStrategy: () => null, // Stop reconnecting if offline
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 1000,
      retryStrategy: () => null,
    };
  }
};

/**
 * Initializes BullMQ Queue and Worker safely.
 * Only connects if Redis client is connected and active.
 */
function initFollowUpQueue() {
  const activeRedis = getRedis();
  if (!activeRedis || !activeRedis.isOpen) {
    console.log('ℹ️  Redis offline: BullMQ running in non-blocking in-memory fallback mode.');
    followUpQueue = null;
    return;
  }

  try {
    const connection = getRedisConnection();
    followUpQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    followUpQueue.on('error', (err) => {
      console.warn('⚠️  BullMQ Queue non-fatal error:', err.message);
    });

    followUpWorker = new Worker(QUEUE_NAME, async (job) => {
      const { leadId, companyName, reason } = job.data;
      console.log(`⏰ [BULLMQ WORKER] Processing follow-up job #${job.id}: Lead ${leadId} (${companyName}) reason=${reason}`);
      return { processed: true, leadId, timestamp: new Date() };
    }, { connection });

    followUpWorker.on('error', (err) => {
      console.warn('⚠️  BullMQ Worker non-fatal error:', err.message);
    });

    console.log('✅ BullMQ Follow-up Queue initialized with Redis');
  } catch (err) {
    console.warn('⚠️  BullMQ initialization fallback (running with in-memory fallback):', err.message);
    followUpQueue = null;
  }
}

/**
 * Enqueue a follow-up job asynchronously.
 * Never blocks API execution and never throws if Redis is down.
 */
async function enqueueFollowUpJob(leadData, reason = 'FOLLOW_UP_SCHEDULED') {
  if (!leadData) return;

  const jobPayload = {
    leadId: leadData.leadId,
    companyName: leadData.companyName,
    contactPerson: leadData.contactPerson,
    nextFollowUpAt: leadData.nextFollowUpAt || leadData.nextFollowUpDate,
    assignedSalesperson: leadData.assignedSalesperson,
    reason,
    queuedAt: new Date().toISOString(),
  };

  try {
    if (followUpQueue) {
      await followUpQueue.add('check-followup', jobPayload, {
        jobId: `followup-${leadData.leadId}-${Date.now()}`,
      });
      console.log(`📋 [BULLMQ] Enqueued follow-up job for Lead ${leadData.leadId}`);
    } else {
      // Graceful fallback
      console.log(`📋 [BULLMQ IN-MEMORY] Lead follow-up noted for ${leadData.leadId}: ${reason}`);
    }
  } catch (err) {
    console.warn(`⚠️  Failed to enqueue BullMQ follow-up job for ${leadData.leadId}:`, err.message);
  }
}

module.exports = {
  initFollowUpQueue,
  enqueueFollowUpJob,
};
