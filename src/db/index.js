const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL が設定されていません');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));

module.exports = { pool, query: (text, params) => pool.query(text, params) };

