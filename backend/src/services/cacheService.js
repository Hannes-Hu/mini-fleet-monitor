const { getRedisClient } = require('../config/redis');

const getCachedData = async (key) => {
  try {
    const redisClient = getRedisClient();
    const cached = await redisClient.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

const setCachedData = async (key, data, ttl = 10) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.setEx(key, ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
};

const deleteCachedData = async (key) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
};

module.exports = {
  getCachedData,
  setCachedData,
  deleteCachedData
};