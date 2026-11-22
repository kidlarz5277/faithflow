const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const pool = new Pool({
  host: process.env.ADMIN_PGHOST || process.env.PGHOST || "localhost",
  port: Number(process.env.ADMIN_PGPORT || process.env.PGPORT || 5432),
  database: process.env.ADMIN_PGDATABASE || "faithflow_admin",
  user: process.env.ADMIN_PGUSER || process.env.PGUSER || "postgres",
  password: process.env.ADMIN_PGPASSWORD || process.env.PGPASSWORD || "postgres",
  ssl: process.env.ADMIN_PGSSL === "true" ? { rejectUnauthorized: false } : false,
  max: 5,
  connectionTimeoutMillis: 10000,
});

const query = (text, params = []) => pool.query(text, params);

module.exports = { pool, query };
  