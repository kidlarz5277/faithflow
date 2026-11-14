const { query, pool } = require("../db");

async function run() {
  try {
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'certificate_request_status') THEN
          CREATE TYPE certificate_request_status AS ENUM ('Pending', 'Approved', 'Completed', 'Cancelled');
        END IF;
      END
      $$;
    `);
    await query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE t.typname = 'certificate_request_status'
            AND e.enumlabel = 'Ongoing'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE t.typname = 'certificate_request_status'
            AND e.enumlabel = 'Approved'
        ) THEN
          ALTER TYPE certificate_request_status RENAME VALUE 'Ongoing' TO 'Approved';
        END IF;
      END
      $$;
    `);
    await query(`
      ALTER TYPE certificate_request_status ADD VALUE IF NOT EXISTS 'Cancelled';
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS cert_request (
        "certID" SERIAL PRIMARY KEY,
        "userID" INT,
        "adminID" INT,
        "marr_certID" INT,
        "bapt_certID" INT,
        status certificate_request_status NOT NULL DEFAULT 'Pending',
        "pickupDate" DATE,
        "pickupTime" TIME,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "pickupDate" DATE`);
    await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "pickupTime" TIME`);
    await query(`DROP TABLE IF EXISTS approved_cert CASCADE`);
    await query(`DROP TABLE IF EXISTS declined_cert CASCADE`);

    const verification = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('cert_request')
      ORDER BY table_name
    `);
    const certColumns = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cert_request'
      ORDER BY ordinal_position
    `);

    console.log("Created/verified tables:", verification.rows.map((row) => row.table_name).join(", "));
    console.log("cert_request columns:", certColumns.rows.map((row) => row.column_name).join(", "));
  } catch (error) {
    console.error("Failed to create cert status tables:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void run();
