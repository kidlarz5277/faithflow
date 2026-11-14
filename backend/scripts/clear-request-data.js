const { query, pool } = require("../db");

const REQUEST_DATA_TABLES = [
  "appointment_review_states",
  "progress_tracker",
  "marriage_appointments",
  "baptism_appointments",
  "death_mass_appointments",
  "blessing_appointments",
  "appointments",
  "cert_request",
];

const truncateTable = async (tableName) => {
  const sql = `TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`;
  try {
    await query(sql);
  } catch (error) {
    if (error?.code === "42P01") return;
    throw error;
  }
};

const clearRequestData = async () => {
  for (const tableName of REQUEST_DATA_TABLES) {
    await truncateTable(tableName);
  }

  await query(`
    UPDATE special_sacraments
    SET "currentAppliedCount" = 0
    WHERE COALESCE("currentAppliedCount", 0) <> 0
  `);
};

const logTableCounts = async () => {
  for (const tableName of REQUEST_DATA_TABLES) {
    try {
      const result = await query(`SELECT COUNT(*)::int AS count FROM "${tableName}"`);
      console.log(`${tableName}: ${result.rows[0].count}`);
    } catch (error) {
      if (error?.code === "42P01") {
        console.log(`${tableName}: table not found (skipped)`);
        continue;
      }
      throw error;
    }
  }
};

const run = async () => {
  try {
    await clearRequestData();
    console.log("Cleared appointment, certificate, and sacramental request data.");
    await logTableCounts();
  } catch (error) {
    console.error("Failed to clear request data:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
