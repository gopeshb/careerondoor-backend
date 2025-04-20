// redis.js
const redis = require('redis');

// Use environment variable or fallback to localhost (dev)
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis client
const client = redis.createClient({
  url: redisUrl,
});

// Handle errors
client.on('error', (err) => {
  console.error('❌ Redis Client Error:', err);
});

// Connect to Redis
(async () => {
  try {
    await client.connect();
    console.log('✅ Redis connected successfully');
  } catch (err) {
    console.error('❌ Redis connection failed:', err);
  }
})();

module.exports = client;
