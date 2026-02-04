/**
 * Queue Service - Bull + Redis для управления очередями задач
 *
 * Обеспечивает:
 * - Многопоточное создание аккаунтов
 * - Retry логику при ошибках
 * - Отслеживание прогресса
 */

import Bull from 'bull';
import Redis from 'ioredis';

// Redis connection config - supports REDIS_URL or separate host/port
function getRedisConfig() {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    // Parse redis://host:port format
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        maxRetriesPerRequest: 3
      };
    } catch (e) {
      console.warn('Failed to parse REDIS_URL, falling back to defaults');
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3
  };
}

const redisConfig = getRedisConfig();

// Queue instances
let accountCreationQueue = null;
let redisClient = null;

/**
 * Initialize Redis connection
 */
export async function initRedis() {
  if (redisClient) return redisClient;

  try {
    redisClient = new Redis(redisConfig);

    redisClient.on('error', (err) => {
      console.error('Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });

    // Test connection
    await redisClient.ping();

    return redisClient;

  } catch (error) {
    console.error('Failed to connect to Redis:', error.message);
    redisClient = null;
    throw error;
  }
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable() {
  try {
    const client = new Redis({ ...redisConfig, lazyConnect: true });
    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get or create the account creation queue
 */
export function getAccountCreationQueue() {
  if (accountCreationQueue) return accountCreationQueue;

  accountCreationQueue = new Bull('account-creation', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 100 // Keep last 100 failed jobs
    }
  });

  // Queue event handlers
  accountCreationQueue.on('error', (error) => {
    console.error('Queue error:', error.message);
  });

  accountCreationQueue.on('waiting', (jobId) => {
    console.log(`Job ${jobId} is waiting`);
  });

  accountCreationQueue.on('active', (job) => {
    console.log(`Job ${job.id} started processing`);
  });

  accountCreationQueue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed`);
  });

  accountCreationQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
  });

  accountCreationQueue.on('stalled', (job) => {
    console.warn(`Job ${job.id} stalled`);
  });

  return accountCreationQueue;
}

/**
 * Add account creation job to queue
 * @param {object} data - Job data
 * @param {string} data.workspaceId - Workspace ID
 * @param {string} data.createdBy - Creator (Manual or Key ID)
 * @param {number} data.priority - Job priority (lower = higher priority)
 */
export async function addAccountCreationJob(data, options = {}) {
  const queue = getAccountCreationQueue();

  const job = await queue.add('create-account', data, {
    priority: options.priority || 0,
    delay: options.delay || 0,
    jobId: options.jobId || undefined
  });

  return job;
}

/**
 * Add multiple account creation jobs
 * @param {string} workspaceId - Workspace ID
 * @param {number} count - Number of accounts to create
 * @param {string} createdBy - Creator
 */
export async function addBulkAccountCreationJobs(workspaceId, count, createdBy = 'Manual') {
  const queue = getAccountCreationQueue();
  const jobs = [];

  for (let i = 0; i < count; i++) {
    const job = await queue.add('create-account', {
      workspaceId,
      createdBy,
      index: i,
      total: count
    }, {
      priority: i // Process in order
    });
    jobs.push(job);
  }

  return jobs;
}

/**
 * Get queue status
 */
export async function getQueueStatus() {
  const queue = getAccountCreationQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed
  };
}

/**
 * Get active jobs
 */
export async function getActiveJobs() {
  const queue = getAccountCreationQueue();
  return queue.getActive();
}

/**
 * Get waiting jobs
 */
export async function getWaitingJobs() {
  const queue = getAccountCreationQueue();
  return queue.getWaiting();
}

/**
 * Get failed jobs
 */
export async function getFailedJobs() {
  const queue = getAccountCreationQueue();
  return queue.getFailed();
}

/**
 * Pause queue
 */
export async function pauseQueue() {
  const queue = getAccountCreationQueue();
  await queue.pause();
  console.log('Queue paused');
}

/**
 * Resume queue
 */
export async function resumeQueue() {
  const queue = getAccountCreationQueue();
  await queue.resume();
  console.log('Queue resumed');
}

/**
 * Clean completed and failed jobs
 */
export async function cleanQueue() {
  const queue = getAccountCreationQueue();

  await Promise.all([
    queue.clean(3600000, 'completed'), // Clean completed older than 1 hour
    queue.clean(86400000, 'failed') // Clean failed older than 24 hours
  ]);

  console.log('Queue cleaned');
}

/**
 * Get job by ID
 */
export async function getJob(jobId) {
  const queue = getAccountCreationQueue();
  return queue.getJob(jobId);
}

/**
 * Cancel job by ID
 */
export async function cancelJob(jobId) {
  const job = await getJob(jobId);
  if (job) {
    await job.remove();
    return true;
  }
  return false;
}

/**
 * Cancel all waiting jobs
 */
export async function cancelAllWaitingJobs() {
  const queue = getAccountCreationQueue();
  const waiting = await queue.getWaiting();

  for (const job of waiting) {
    await job.remove();
  }

  return waiting.length;
}

/**
 * Shutdown queue gracefully
 */
export async function shutdownQueue() {
  if (accountCreationQueue) {
    await accountCreationQueue.close();
    accountCreationQueue = null;
    console.log('Queue shutdown complete');
  }

  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis connection closed');
  }
}

/**
 * Queue processor registration
 * This should be called with the actual processing function
 */
export function registerProcessor(processorFn, concurrency = 1) {
  const queue = getAccountCreationQueue();

  queue.process('create-account', concurrency, async (job) => {
    const { workspaceId, createdBy, index, total } = job.data;

    // Update progress
    job.progress(0);

    try {
      const result = await processorFn(workspaceId, createdBy, job);

      job.progress(100);
      return result;

    } catch (error) {
      console.error(`Job ${job.id} failed:`, error.message);
      throw error;
    }
  });

  console.log(`Queue processor registered with concurrency: ${concurrency}`);
}

export default {
  initRedis,
  isRedisAvailable,
  getAccountCreationQueue,
  addAccountCreationJob,
  addBulkAccountCreationJobs,
  getQueueStatus,
  getActiveJobs,
  getWaitingJobs,
  getFailedJobs,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  getJob,
  cancelJob,
  cancelAllWaitingJobs,
  shutdownQueue,
  registerProcessor
};
