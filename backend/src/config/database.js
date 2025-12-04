const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initializeDatabase = async () => {
  try {
    await pool.query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
};

const query = (text, params) => pool.query(text, params);

module.exports = {
  pool,
  initializeDatabase,
  query
};