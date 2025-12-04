require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seedDatabase() {
  try {
    // Insert test user
    const passwordHash = await bcrypt.hash('test123', 10);
    
    await pool.query(`
      INSERT INTO users (email, password_hash) 
      VALUES ($1, $2)
      ON CONFLICT (email) DO NOTHING
    `, ['admin@test.com', passwordHash]);

    // Insert sample robots
    const robots = [
      { name: 'Robot Alpha', lat: 52.520008, lon: 13.404954 },
      { name: 'Robot Beta', lat: 52.511, lon: 13.389 },
      { name: 'Robot Gamma', lat: 52.525, lon: 13.415 },
      { name: 'Robot Delta', lat: 52.505, lon: 13.395 }
    ];

    for (const robot of robots) {
      const robotResult = await pool.query(`
        INSERT INTO robots (name, lat, lon) 
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO NOTHING
        RETURNING id
      `, [robot.name, robot.lat, robot.lon]);

      const robotId = robotResult.rows[0]?.id;
      
      if (robotId) {
        // Create some initial position history for each robot
        for (let i = 0; i < 5; i++) {
          const historyLat = robot.lat + (Math.random() - 0.5) * 0.02;
          const historyLon = robot.lon + (Math.random() - 0.5) * 0.02;
          const hoursAgo = 24 - (i * 6); // Spread positions over last 24 hours
          
          await pool.query(`
            INSERT INTO robot_positions (robot_id, lat, lon, created_at)
            VALUES ($1, $2, $3, NOW() - INTERVAL '${hoursAgo} hours')
          `, [robotId, historyLat, historyLon]);
        }
      }
    }

    console.log('Database seeded successfully');
    console.log('Test user: admin@test.com / test123');
    console.log('Created position history for all robots');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    process.exit();
  }
}

seedDatabase();