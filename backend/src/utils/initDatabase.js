const { pool } = require('./config/database');

const initDatabase = async () => {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create robots table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS robots (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'idle' CHECK (status IN ('idle', 'moving')),
        lat DECIMAL(9,6) NOT NULL,
        lon DECIMAL(9,6) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create robot_positions table for history
    await pool.query(`
      CREATE TABLE IF NOT EXISTS robot_positions (
        id SERIAL PRIMARY KEY,
        robot_id INTEGER NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
        lat DECIMAL(9,6) NOT NULL,
        lon DECIMAL(9,6) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_robot_positions_robot_id 
      ON robot_positions(robot_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_robot_positions_created_at 
      ON robot_positions(created_at DESC)
    `);

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

module.exports = initDatabase;