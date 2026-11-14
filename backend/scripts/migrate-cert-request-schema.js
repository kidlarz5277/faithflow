const { query, pool } = require("../db");

const MARRIAGE_FORM_SCHEMA = {
  label: "Marriage Certificate",
  fields: [
    { key: "groomFullName", label: "Groom Full Name", type: "text" },
    { key: "brideFullName", label: "Bride Full Name", type: "text" },
    { key: "groomAge", label: "Groom Age", type: "number" },
    { key: "brideAge", label: "Bride Age", type: "number" },
    { key: "groomPhoneNumber", label: "Groom Phone Number", type: "tel" },
    { key: "bridePhoneNumber", label: "Bride Phone Number", type: "tel" },
    { key: "dateOfMarriage", label: "Date of Marriage", type: "date" },
    { key: "address", label: "Address", type: "text" },
  ],
};

const BAPTISM_FORM_SCHEMA = {
  label: "Baptismal Certificate",
  fields: [
    { key: "childFullName", label: "Child Full Name", type: "text" },
    { key: "dateOfBaptism", label: "Date of Baptism", type: "date" },
    { key: "fatherName", label: "Father's Name", type: "text" },
    { key: "motherName", label: "Mother's Name", type: "text" },
    { key: "phoneNumber", label: "Phone Number", type: "tel" },
    { key: "address", label: "Address", type: "text" },
  ],
};

const hasColumn = async (columnName) => {
  const result = await query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'cert_request'
        AND column_name = $1
      LIMIT 1
    `,
    [columnName],
  );
  return result.rows.length > 0;
};

const hasTable = async (tableName) => {
  const result = await query(`SELECT to_regclass($1) AS "tableName"`, [`public.${tableName}`]);
  return Boolean(result.rows[0]?.tableName);
};

const ensureCertificateType = async (schema) => {
  const existing = await query(
    `
      SELECT "certificateTypeID"
      FROM certificate_type
      WHERE "formSchema"->>'label' = $1
      LIMIT 1
    `,
    [schema.label],
  );
  if (existing.rows[0]?.certificateTypeID) {
    return Number(existing.rows[0].certificateTypeID);
  }
  const inserted = await query(
    `
      INSERT INTO certificate_type ("certTypeName", "formSchema")
      VALUES ($1, $2::jsonb)
      RETURNING "certificateTypeID"
    `,
    [schema.label, JSON.stringify(schema)],
  );
  return Number(inserted.rows[0].certificateTypeID);
};

(async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS certificate_type (
      "certificateTypeID" SERIAL PRIMARY KEY,
      "certTypeName" VARCHAR(255),
      "isArchived" BOOLEAN NOT NULL DEFAULT FALSE,
      "formSchema" JSONB NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`ALTER TABLE certificate_type ADD COLUMN IF NOT EXISTS "certTypeName" VARCHAR(255)`);
  await query(`ALTER TABLE certificate_type ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`
    UPDATE certificate_type
    SET "certTypeName" = NULLIF(BTRIM(COALESCE("formSchema"->>'label', '')), '')
    WHERE NULLIF(BTRIM(COALESCE("certTypeName", '')), '') IS NULL
  `);

  const marriageTypeID = await ensureCertificateType(MARRIAGE_FORM_SCHEMA);
  const baptismTypeID = await ensureCertificateType(BAPTISM_FORM_SCHEMA);

  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "certificateTypeID" INT`);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS credentials JSONB`);

  if ((await hasColumn("created_at")) && !(await hasColumn("createdAt"))) {
    await query(`ALTER TABLE cert_request RENAME COLUMN created_at TO "createdAt"`);
  } else {
    await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP`);
    if (await hasColumn("created_at")) {
      await query(`
        UPDATE cert_request
        SET "createdAt" = COALESCE("createdAt", created_at, CURRENT_TIMESTAMP)
        WHERE "createdAt" IS NULL
      `);
      await query(`ALTER TABLE cert_request DROP COLUMN created_at`);
    }
  }
  await query(`UPDATE cert_request SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL`);
  await query(`ALTER TABLE cert_request ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
  await query(`ALTER TABLE cert_request ALTER COLUMN "createdAt" SET NOT NULL`);

  if ((await hasColumn("marr_certID")) && (await hasTable("marriage_cert"))) {
    await query(
      `
        UPDATE cert_request cr
        SET
          "certificateTypeID" = $1,
          credentials = jsonb_strip_nulls(
            jsonb_build_object(
              'groomFullName', mc."groomFullName",
              'brideFullName', mc."brideFullName",
              'groomAge', mc."groomAge",
              'brideAge', mc."brideAge",
              'groomPhoneNumber', mc."groomPhoneNumber",
              'bridePhoneNumber', mc."bridePhoneNumber",
              'dateOfMarriage', mc."dateOfMarriage",
              'address', mc.address
            )
          )
        FROM marriage_cert mc
        WHERE mc."marr_certID" = cr."marr_certID"
          AND cr."certificateTypeID" IS NULL
      `,
      [marriageTypeID],
    );
    await query(
      `
        UPDATE cert_request cr
        SET "userID" = u."userID"
        FROM marriage_cert mc
        JOIN users u ON LOWER(TRIM(u."fullName")) = LOWER(TRIM(mc."groomFullName"))
        WHERE mc."marr_certID" = cr."marr_certID"
          AND cr."userID" IS NULL
      `,
    );
  }

  if ((await hasColumn("bapt_certID")) && (await hasTable("baptismal_cert"))) {
    await query(
      `
        UPDATE cert_request cr
        SET
          "certificateTypeID" = $1,
          credentials = jsonb_strip_nulls(
            jsonb_build_object(
              'childFullName', bc."childFullName",
              'dateOfBaptism', bc."dateOfBaptism",
              'fatherName', bc."fatherName",
              'motherName', bc."motherName",
              'phoneNumber', bc."phoneNumber",
              'address', bc.address
            )
          )
        FROM baptismal_cert bc
        WHERE bc."bapt_certID" = cr."bapt_certID"
          AND cr."certificateTypeID" IS NULL
      `,
      [baptismTypeID],
    );
  }

  await query(`UPDATE cert_request SET credentials = '{}'::jsonb WHERE credentials IS NULL`);
  await query(`ALTER TABLE cert_request ALTER COLUMN credentials SET NOT NULL`);

  const leftoverTypes = await query(`SELECT COUNT(*)::int AS count FROM cert_request WHERE "certificateTypeID" IS NULL`);
  if (leftoverTypes.rows[0].count === 0) {
    await query(`ALTER TABLE cert_request ALTER COLUMN "certificateTypeID" SET NOT NULL`);
  }

  const leftoverUsers = await query(`SELECT COUNT(*)::int AS count FROM cert_request WHERE "userID" IS NULL`);
  if (leftoverUsers.rows[0].count === 0) {
    await query(`ALTER TABLE cert_request ALTER COLUMN "userID" SET NOT NULL`);
  }

  const leftoverPickup = await query(`
    SELECT COUNT(*)::int AS count
    FROM cert_request
    WHERE "pickupDate" IS NULL OR "pickupTime" IS NULL
  `);
  if (leftoverPickup.rows[0].count === 0) {
    await query(`ALTER TABLE cert_request ALTER COLUMN "pickupDate" SET NOT NULL`);
    await query(`ALTER TABLE cert_request ALTER COLUMN "pickupTime" SET NOT NULL`);
  }

  await query(`ALTER TABLE cert_request DROP CONSTRAINT IF EXISTS chk_cert_request_only_one_cert_type`);
  await query(`ALTER TABLE cert_request DROP CONSTRAINT IF EXISTS fk_cert_request_admin`);
  await query(`ALTER TABLE cert_request DROP CONSTRAINT IF EXISTS fk_cert_request_marr`);
  await query(`ALTER TABLE cert_request DROP CONSTRAINT IF EXISTS fk_cert_request_bapt`);
  await query(`ALTER TABLE cert_request DROP CONSTRAINT IF EXISTS fk_cert_request_user`);
  await query(`ALTER TABLE cert_request DROP CONSTRAINT IF EXISTS fk_cert_request_certificate_type`);

  await query(`ALTER TABLE cert_request DROP COLUMN IF EXISTS "adminID"`);
  await query(`ALTER TABLE cert_request DROP COLUMN IF EXISTS "marr_certID"`);
  await query(`ALTER TABLE cert_request DROP COLUMN IF EXISTS "bapt_certID"`);
  await query(`ALTER TABLE cert_request DROP COLUMN IF EXISTS "declineReason"`);
  await query(`ALTER TABLE cert_request DROP COLUMN IF EXISTS is_archived`);
  await query("DROP TABLE IF EXISTS marriage_cert CASCADE");
  await query("DROP TABLE IF EXISTS baptismal_cert CASCADE");

  await query(`
    ALTER TABLE cert_request
    ADD CONSTRAINT fk_cert_request_user
    FOREIGN KEY ("userID") REFERENCES users("userID")
    ON DELETE RESTRICT
  `);
  await query(`
    ALTER TABLE cert_request
    ADD CONSTRAINT fk_cert_request_certificate_type
    FOREIGN KEY ("certificateTypeID") REFERENCES certificate_type("certificateTypeID")
    ON DELETE RESTRICT
  `);

  const columns = await query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cert_request'
    ORDER BY ordinal_position
  `);
  const constraints = await query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'cert_request'::regclass
    ORDER BY conname
  `);
  const leftover = await query(`SELECT "certID", "userID", "certificateTypeID" FROM cert_request ORDER BY "certID"`);
  console.log(JSON.stringify({ columns: columns.rows, constraints: constraints.rows, rows: leftover.rows }, null, 2));
  await pool.end();
})().catch(async (error) => {
  console.error(error.message);
  process.exitCode = 1;
  try {
    await pool.end();
  } catch {
    // ignore
  }
});
