const redis = require('redis');

let client;

const initializeRedis = async () => {
  client = redis.createClient({
    url: process.env.REDIS_URL
  });

  client.on('error', (err) => console.error('Redis Client Error', err));
  client.on('connect', () => console.log('Redis Client Connected'));

  await client.connect();
  return client;
};

const getRedisClient = () => {
  if (!client) {
    throw new Error('Redis client not initialized');
  }
  return client;
};

module.exports = {
  initializeRedis,
  getRedisClient
};