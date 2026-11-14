const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "faithflow",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

const query = (text, params = []) => pool.query(text, params);

module.exports = { pool, query };
