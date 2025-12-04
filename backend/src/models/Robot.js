const { query } = require('../config/database');
const { getRedisClient } = require('../config/redis');

class Robot {
  static async findAll() {
    const redisClient = getRedisClient();
    
    // Try to get from cache first
    try {
      const cached = await redisClient.get('robots:all');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Redis cache error:', error);
    }

    // If not in cache, get from database
    const result = await query(
      'SELECT * FROM robots ORDER BY updated_at DESC'
    );
    const robots = result.rows;

    // Cache for 10 seconds
    try {
      await redisClient.setEx('robots:all', 10, JSON.stringify(robots));
    } catch (error) {
      console.error('Redis set error:', error);
    }

    return robots;
  }

  static async findById(id) {
    const result = await query(
      'SELECT * FROM robots WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async updatePosition(id, lat, lon) {
    const { pool } = require('../config/database');
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update robot position
      const robotResult = await client.query(
        `UPDATE robots 
         SET lat = $1, lon = $2, status = 'moving', updated_at = NOW()
         WHERE id = $3 
         RETURNING *`,
        [lat, lon, id]
      );
      
      const updatedRobot = robotResult.rows[0];
      
      // Save position to history
      await client.query(
        `INSERT INTO robot_positions (robot_id, lat, lon) 
         VALUES ($1, $2, $3)`,
        [id, lat, lon]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      try {
        const redisClient = getRedisClient();
        await redisClient.del('robots:all');
        await redisClient.del(`robot:${id}:positions`);
      } catch (error) {
        console.error('Redis delete error:', error);
      }
      
      return updatedRobot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async create(name, lat = 52.520008, lon = 13.404954) {
    const result = await query(
      `INSERT INTO robots (name, status, lat, lon) 
       VALUES ($1, 'idle', $2, $3) 
       RETURNING *`,
      [name, lat, lon]
    );
    
    // Invalidate cache
    try {
      const redisClient = getRedisClient();
      await redisClient.del('robots:all');
    } catch (error) {
      console.error('Redis delete error:', error);
    }
    
    return result.rows[0];
  }

  static async updateStatus(id, status) {
    const result = await query(
      `UPDATE robots 
       SET status = $1, updated_at = NOW()
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );
    
    // Invalidate cache
    try {
      const redisClient = getRedisClient();
      await redisClient.del('robots:all');
    } catch (error) {
      console.error('Redis delete error:', error);
    }
    
    return result.rows[0];
  }

  // Get position history for a robot
  static async getPositionHistory(robotId, limit = 50) {
    const redisClient = getRedisClient();
    const cacheKey = `robot:${robotId}:positions:${limit}`;
    
    // Try to get from cache first
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Redis cache error:', error);
    }

    const result = await query(
      `SELECT * FROM robot_positions 
       WHERE robot_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [robotId, limit]
    );
    
    const positions = result.rows;
    
    // Cache for 30 seconds
    try {
      await redisClient.setEx(cacheKey, 30, JSON.stringify(positions));
    } catch (error) {
      console.error('Redis set error:', error);
    }
    
    return positions;
  }

  // Get recent positions for all robots
  static async getRecentPositions(limit = 100) {
    const result = await query(
      `SELECT rp.*, r.name as robot_name
       FROM robot_positions rp
       JOIN robots r ON rp.robot_id = r.id
       ORDER BY rp.created_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }

  // Get travel distance for a robot
  static async calculateTravelDistance(robotId) {
    const result = await query(
      `WITH ordered_positions AS (
         SELECT lat, lon, created_at,
                LAG(lat) OVER (ORDER BY created_at) as prev_lat,
                LAG(lon) OVER (ORDER BY created_at) as prev_lon
         FROM robot_positions 
         WHERE robot_id = $1
         ORDER BY created_at
       )
       SELECT SUM(
         6371 * ACOS(
           COS(RADIANS(lat)) * COS(RADIANS(prev_lat)) * 
           COS(RADIANS(prev_lon) - RADIANS(lon)) + 
           SIN(RADIANS(lat)) * SIN(RADIANS(prev_lat))
         )
       ) as total_distance_km
       FROM ordered_positions
       WHERE prev_lat IS NOT NULL AND prev_lon IS NOT NULL`,
      [robotId]
    );
    
    return parseFloat(result.rows[0]?.total_distance_km || 0);
  }
}

module.exports = Robot;