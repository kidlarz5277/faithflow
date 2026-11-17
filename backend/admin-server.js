const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const multer = require("multer");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { query, pool } = require("./db-admin");

const app = express();
const PORT = Number(process.env.ADMIN_SERVER_PORT || 3002);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const MAIN_SERVER_BASE_URL = String(process.env.MAIN_SERVER_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const PHONE_INPUT_REGEX = /^09\d{9}$/;
const EMAIL_INPUT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_PREFIX_REGEX = /^\$2[aby]\$\d{2}\$/;
const isGmailAddress = (email) => String(email || "").trim().toLowerCase().endsWith("@gmail.com");
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeLoginPhone = (value) => {
  const raw = String(value || "").trim();
  if (!/^[+\d\s()-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("639")) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("9")) digits = `0${digits}`;
  return /^09\d{9}$/.test(digits) ? digits : "";
};
const normalizeGmailAppPassword = (value) => String(value || "").replace(/\s+/g, "").trim();
const isValidGmailAppPassword = (value) => /^[a-zA-Z0-9]{16}$/.test(normalizeGmailAppPassword(value));
const INTERNAL_MAILER_HEADER = "x-faithflow-internal-mailer";
const INTERNAL_MAILER_TOKEN = "faithflow-mailer";

const syncPriestMailerSender = async ({ senderEmail, smtpAppPassword }) => {
  const response = await fetch(`${MAIN_SERVER_BASE_URL}/settings/priest-email`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      senderEmail,
      smtpUser: senderEmail,
      smtpAppPassword,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Unable to update the priest email sender.");
  }
  return payload;
};
const adminPhotoUploadsDirectory = path.join(__dirname, "uploads", "admin-photos");
const adminPhotoPublicBasePath = "/uploads/admin-photos/";
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "15mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const normalizeBcryptHash = (hashValue) => {
  const hash = String(hashValue || "");
  if (hash.startsWith("$2y$")) return `$2b$${hash.slice(4)}`;
  return hash;
};

const verifyPasswordWithAutoUpgrade = async (plainPassword, storedPassword) => {
  const normalizedStoredPassword = String(storedPassword || "");
  if (!normalizedStoredPassword) return { isValid: false, upgradedHash: null };

  const normalizedHash = normalizeBcryptHash(normalizedStoredPassword);
  if (BCRYPT_PREFIX_REGEX.test(normalizedHash)) {
    const isValid = await bcrypt.compare(plainPassword, normalizedHash);
    return { isValid, upgradedHash: null };
  }

  const isLegacyMatch = plainPassword === normalizedStoredPassword;
  if (!isLegacyMatch) return { isValid: false, upgradedHash: null };

  const upgradedHash = await bcrypt.hash(plainPassword, 10);
  return { isValid: true, upgradedHash };
};

const sanitizeAdmin = (admin) => ({
  adminID: Number(admin.adminID),
  fullName: admin.fullName,
  userName: admin.userName,
  email: admin.email,
  address: admin.address,
  contactNumber: admin.contactNumber,
  parishName: admin.parishName,
  createdAt: admin.createdAt,
  photo: admin.photo,
});

const getAdminProfilePhotoFileName = (photoValue) => {
  const normalizedPath = String(photoValue || "")
    .replace(/\\/g, "/")
    .trim()
    .split("?")[0];
  if (!normalizedPath) return "";
  const fileName = path.basename(normalizedPath);
  if (!fileName || fileName === "." || fileName === ".." || fileName.includes("..")) return "";
  if (!/\.(jpg|jpeg|png|webp)$/i.test(fileName)) return "";
  return fileName;
};

const storeAdminProfilePhoto = async (uploadedFile) => {
  const fileName = path.basename(String(uploadedFile?.filename || uploadedFile?.path || ""));
  if (!fileName) {
    throw new Error("Photo file is required.");
  }
  await fs.mkdir(adminPhotoUploadsDirectory, { recursive: true });
  const destPath = path.join(adminPhotoUploadsDirectory, fileName);
  const sourcePath = String(uploadedFile?.path || "").trim();
  if (sourcePath && path.resolve(sourcePath) !== path.resolve(destPath)) {
    await fs.rename(sourcePath, destPath);
  }
  return `${adminPhotoPublicBasePath}${fileName}`;
};

const deleteStoredAdminProfilePhotoIfExists = async (photoValue) => {
  const fileName = getAdminProfilePhotoFileName(photoValue);
  if (!fileName) return;
  try {
    await fs.unlink(path.join(adminPhotoUploadsDirectory, fileName));
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EPERM" || error?.code === "EBUSY") return;
    console.error("Admin profile photo delete error:", error);
  }
};

const adminProfilePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      try {
        fsSync.mkdirSync(adminPhotoUploadsDirectory, { recursive: true });
        callback(null, adminPhotoUploadsDirectory);
      } catch (error) {
        callback(error);
      }
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(String(file?.originalname || "")).toLowerCase();
      const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
      const safeExtension = allowedExtensions.has(extension) ? extension : ".jpg";
      callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExtension}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    const mimeType = String(file?.mimetype || "").toLowerCase();
    if (!mimeType.startsWith("image/") || mimeType === "image/gif") {
      callback(new Error("Only image uploads are allowed."));
      return;
    }
    callback(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const progressPaymentReceiptUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    const mimeType = String(file?.mimetype || "").toLowerCase();
    const originalName = String(file?.originalname || "").toLowerCase();
    const isAllowed =
      mimeType.includes("pdf") ||
      mimeType.startsWith("image/") ||
      originalName.endsWith(".pdf") ||
      /\.(png|jpe?g|webp)$/i.test(originalName);
    if (!isAllowed) {
      callback(new Error("Only PDF or image receipt uploads are allowed."));
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const forwardMultipartRequestToMainServer = async (req, res) => {
  try {
    const originalUrl = String(req.originalUrl || req.url || "");
    const normalizedPath = originalUrl.replace(/^\/admin-api(?=\/|$)/, "");
    const requestPath = normalizedPath || String(req.url || "");
    const requestUrl = `${MAIN_SERVER_BASE_URL}${requestPath}`;
    const formData = new FormData();

    for (const [key, value] of Object.entries(req.body || {})) {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    }

    if (req.file?.buffer) {
      const blob = new Blob([req.file.buffer], {
        type: req.file.mimetype || "application/octet-stream",
      });
      formData.append("receiptFile", blob, req.file.originalname || "receipt");
    }

    const response = await fetch(requestUrl, {
      method: "POST",
      body: formData,
      headers: { "X-Faithflow-Write-Source": "admin" },
    });
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => ({ message: "Invalid JSON response from main server." }));
      return res.status(response.status).json(payload);
    }
    const binaryPayload = Buffer.from(await response.arrayBuffer());
    const upstreamContentType = response.headers.get("content-type");
    const upstreamDisposition = response.headers.get("content-disposition");
    if (upstreamContentType) res.setHeader("Content-Type", upstreamContentType);
    if (upstreamDisposition) res.setHeader("Content-Disposition", upstreamDisposition);
    return res.status(response.status).send(binaryPayload);
  } catch (error) {
    console.error("Multipart proxy to main server failed:", error);
    return res.status(502).json({ message: "Unable to reach main server." });
  }
};

const getRequestIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);

const recordAuditLog = async (action, req, { targetType = null, targetID = null, metadata = {} } = {}) => {
  try {
    await query(
      `
        INSERT INTO admin_audit_logs ("adminID", action, "targetType", metadata, "ipAddress")
        VALUES (1, $1, $2, $3::jsonb, $4)
      `,
      [String(action || "unknown_action"), targetType ? String(targetType) : null, JSON.stringify({ targetID, ...metadata }), getRequestIp(req) || null],
    );
  } catch (error) {
    console.error("Failed to write admin audit log:", error);
  }
};

const normalizeAdminNotificationRow = (row) => ({
  id: Number(row.adminNotifID),
  type: row.type,
  title: row.title,
  body: row.body,
  severity: "info",
  isRead: Boolean(row.isRead),
  createdAt: row.createdAt,
  readAt: row.readAt,
  metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
});

const initializeAdminDatabase = async () => {
  await query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await query(`
    DO $$
    BEGIN
      IF to_regclass('public.admin_account') IS NOT NULL AND to_regclass('public.admin') IS NULL THEN
        ALTER TABLE admin_account RENAME TO admin;
      END IF;
    END
    $$;
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_email_unique_lower
    ON admin (LOWER(email))
    WHERE email IS NOT NULL
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_contact_number_unique
    ON admin (regexp_replace(TRIM("contactNumber"), '[^0-9]', '', 'g'))
    WHERE LENGTH(TRIM(COALESCE("contactNumber", ''))) > 0
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin (
      "adminID" INT PRIMARY KEY CHECK ("adminID" = 1),
      "userName" VARCHAR(120) NOT NULL UNIQUE,
      email VARCHAR(255) UNIQUE,
      "fullName" VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      "contactNumber" VARCHAR(40),
      "parishName" VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      photo TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE admin ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
  await query(`ALTER TABLE admin ADD COLUMN IF NOT EXISTS photo TEXT`);
  await query(`ALTER TABLE admin ADD COLUMN IF NOT EXISTS "gmailAppPassword" TEXT`);
  await query(`ALTER TABLE admin ADD COLUMN IF NOT EXISTS about JSONB`);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_email_key'
      ) THEN
        BEGIN
          ALTER TABLE admin ADD CONSTRAINT admin_email_key UNIQUE (email);
        EXCEPTION
          WHEN duplicate_object THEN
            NULL;
          WHEN duplicate_table THEN
            NULL;
        END;
      END IF;
    END
    $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      "admin_auditID" BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      action VARCHAR(120) NOT NULL,
      "targetType" VARCHAR(120),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "ipAddress" VARCHAR(64),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_audit_logs' AND column_name = 'id'
      ) THEN
        ALTER TABLE admin_audit_logs RENAME COLUMN id TO "admin_auditID";
      END IF;
      ALTER TABLE admin_audit_logs DROP COLUMN IF EXISTS "targetID";
      ALTER TABLE admin_audit_logs DROP COLUMN IF EXISTS "userAgent";
    END
    $$;
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs ("createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      "adminNotifID" BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "readAt" TIMESTAMPTZ
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('admin_notifications.adminNotifID'));
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN id TO "adminNotifID";
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'admin_notifID'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN "admin_notifID" TO "adminNotifID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
      ALTER TABLE admin_notifications DROP COLUMN IF EXISTS severity;
      ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS "adminID" INT;
      UPDATE admin_notifications SET "adminID" = 1 WHERE "adminID" IS NULL;
      ALTER TABLE admin_notifications ALTER COLUMN "adminID" SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
      RAISE;
    END
    $$;
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications ("createdAt" DESC)`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_unread ON admin_notifications ("adminID", "isRead", "createdAt" DESC)`);

  await query("DROP TABLE IF EXISTS announcements CASCADE");
  await query("DROP TABLE IF EXISTS admin_sessions CASCADE");
  await query("DROP TABLE IF EXISTS admin_login_attempts CASCADE");
  await query("DROP TABLE IF EXISTS admin_settings CASCADE");
  await query("DROP TABLE IF EXISTS admin_api_keys CASCADE");

  const seededAdminUserName = String(process.env.ADMIN_USERNAME || "floribeth").trim().toLowerCase();
  const seededAdminPassword = String(process.env.ADMIN_PASSWORD || "flawsome123");
  const seededAdminEmail = String(process.env.ADMIN_EMAIL || "flawsome@faithflow.local").trim().toLowerCase();
  const seededAdminFullName = String(process.env.ADMIN_FULL_NAME || "Flawsome").trim();
  const seededAdminAddress = String(process.env.ADMIN_ADDRESS || "Parish Office").trim();
  const seededAdminContactNumber = String(process.env.ADMIN_CONTACT_NUMBER || "09123456789").trim();
  const seededAdminParishName = String(process.env.ADMIN_PARISH_NAME || "Faithflow Parish").trim();
  const seededAdminPhoto = String(process.env.ADMIN_PHOTO || "").trim() || null;
  const passwordHash = await bcrypt.hash(seededAdminPassword, 10);

  await query(
    `
      INSERT INTO admin ("adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT ("adminID") DO UPDATE
      SET "userName" = COALESCE(NULLIF(BTRIM(admin."userName"), ''), EXCLUDED."userName"),
          email = COALESCE(NULLIF(BTRIM(admin.email), ''), EXCLUDED.email),
          "fullName" = COALESCE(NULLIF(BTRIM(admin."fullName"), ''), EXCLUDED."fullName"),
          address = COALESCE(NULLIF(BTRIM(admin.address), ''), EXCLUDED.address),
          "contactNumber" = COALESCE(NULLIF(BTRIM(admin."contactNumber"), ''), EXCLUDED."contactNumber"),
          "parishName" = COALESCE(NULLIF(BTRIM(admin."parishName"), ''), EXCLUDED."parishName"),
          password = COALESCE(admin.password, EXCLUDED.password),
          photo = COALESCE(admin.photo, EXCLUDED.photo)
    `,
    [
      seededAdminUserName,
      seededAdminEmail || null,
      seededAdminFullName,
      seededAdminAddress,
      seededAdminContactNumber || null,
      seededAdminParishName || null,
      passwordHash,
      seededAdminPhoto,
    ],
  );
};

const forwardRequestToMainServer = async (req, res) => {
  try {
    const originalUrl = String(req.originalUrl || req.url || "");
    const normalizedPath = originalUrl.replace(/^\/admin-api(?=\/|$)/, "");
    const requestPath = normalizedPath || String(req.url || "");
    const requestUrl = `${MAIN_SERVER_BASE_URL}${requestPath}`;
    const method = String(req.method || "GET").toUpperCase();

    const headers = {};
    const options = { method, headers };
    if (!["GET", "HEAD"].includes(method)) {
      headers["X-Faithflow-Write-Source"] = "admin";
    }
    if (!["GET", "HEAD", "DELETE"].includes(method)) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(req.body || {});
    }

    const response = await fetch(requestUrl, options);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => ({ message: "Invalid JSON response from main server." }));
      return res.status(response.status).json(payload);
    }
    const binaryPayload = Buffer.from(await response.arrayBuffer());
    const upstreamContentType = response.headers.get("content-type");
    const upstreamDisposition = response.headers.get("content-disposition");
    if (upstreamContentType) res.setHeader("Content-Type", upstreamContentType);
    if (upstreamDisposition) res.setHeader("Content-Disposition", upstreamDisposition);
    return res.status(response.status).send(binaryPayload);
  } catch (error) {
    console.error("Proxy to main server failed:", error);
    return res.status(502).json({ message: "Unable to reach main server." });
  }
};

app.get("/internal/gmail-sender", async (req, res) => {
  if (req.get(INTERNAL_MAILER_HEADER) !== INTERNAL_MAILER_TOKEN) {
    return res.status(404).json({ message: "Not found." });
  }
  try {
    const result = await query(
      `
        SELECT email, "gmailAppPassword"
        FROM admin
        WHERE "adminID" = 1
        LIMIT 1
      `,
    );
    const row = result.rows[0] || {};
    return res.json({
      email: normalizeEmail(row.email || ""),
      gmailAppPassword: String(row.gmailAppPassword || "").trim(),
    });
  } catch (error) {
    console.error("Gmail sender lookup error:", error);
    return res.status(500).json({ message: "Unable to load the parish Gmail sender." });
  }
});

app.get("/about", async (_req, res) => {
  try {
    const result = await query(`SELECT about FROM admin WHERE "adminID" = 1 LIMIT 1`);
    const about = result.rows[0]?.about;
    return res.json({
      about: about && typeof about === "object" && !Array.isArray(about) ? about : null,
    });
  } catch (error) {
    console.error("Admin about fetch error:", error);
    return res.status(500).json({ message: "Unable to load landing page content." });
  }
});

app.put("/about", async (req, res) => {
  try {
    const about = req.body?.about;
    if (!about || typeof about !== "object" || Array.isArray(about)) {
      return res.status(400).json({ message: "about must be an object." });
    }
    const result = await query(
      `
        UPDATE admin
        SET about = $1::jsonb
        WHERE "adminID" = 1
        RETURNING about
      `,
      [JSON.stringify(about)],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    return res.json({ about: result.rows[0].about });
  } catch (error) {
    console.error("Admin about save error:", error);
    return res.status(500).json({ message: "Unable to save landing page content." });
  }
});

app.post("/verify-password", async (req, res) => {
  try {
    const password = String(req.body?.password || "");
    if (!password.trim()) {
      return res.status(400).json({ message: "Enter the admin password." });
    }
    const accountResult = await query(
      `
        SELECT "adminID", password
        FROM admin
        WHERE "adminID" = 1
        LIMIT 1
      `,
    );
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    const passwordVerification = await verifyPasswordWithAutoUpgrade(password, accountResult.rows[0].password);
    if (!passwordVerification.isValid) {
      return res.status(401).json({ message: "Password does not match the admin account." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Admin password verification error:", error);
    return res.status(500).json({ message: "Unable to verify the admin password." });
  }
});

app.get("/", (_req, res) => res.json({ status: "ok", message: "Faithflow admin server is running." }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.post("/admins/register", (_req, res) => res.status(403).json({ message: "Admin registration is disabled. Use the fixed admin account only." }));
app.post("/admins", (_req, res) => res.status(403).json({ message: "Admin registration is disabled. Use the fixed admin account only." }));

app.post("/login", async (req, res) => {
  try {
    const credential = String(req.body?.userName || req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!credential || !password.trim()) {
      return res.status(400).json({ message: "Username and password are required." });
    }
    const credentialPhone = normalizeLoginPhone(credential);

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo, "createdAt"
        FROM admin
        WHERE "adminID" = 1
          AND (
            LOWER("userName") = $1
            OR LOWER(COALESCE(email, '')) = $1
            OR (
              LENGTH($2) = 11
              AND regexp_replace(COALESCE("contactNumber", ''), '[^0-9]', '', 'g') = $2
            )
          )
        LIMIT 1
      `,
      [credential, credentialPhone],
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const foundAdmin = result.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(password, foundAdmin.password);
    if (!passwordVerification.isValid) {
      return res.status(401).json({ message: "Invalid username or password." });
    }
    if (passwordVerification.upgradedHash) {
      await query(
        `
          UPDATE admin
          SET password = $1
          WHERE "adminID" = 1
        `,
        [passwordVerification.upgradedHash],
      );
    }

    const token = crypto.randomBytes(24).toString("hex");
    await recordAuditLog("admin_login", req, { targetType: "admin", targetID: "1" });
    return res.json({ message: "Login successful.", token, accountType: "admin", user: sanitizeAdmin(foundAdmin) });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Unable to log in right now." });
  }
});

app.get("/admins", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT "adminID", "parishName", address, "fullName", photo
        FROM admin
        WHERE "adminID" = 1
      `,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin list error:", error);
    return res.status(500).json({ message: "Unable to fetch admins." });
  }
});

app.get("/profile", async (req, res) => {
  try {
    const accountType = String(req.query?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.query?.accountID);
    if (accountType !== "admin") return res.status(400).json({ message: "A valid account type is required." });
    if (!Number.isInteger(accountID) || accountID !== 1) return res.status(404).json({ message: "Admin account not found." });

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", photo
        FROM admin
        WHERE "adminID" = 1
      `,
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Admin account not found." });
    return res.json({ accountType: "admin", user: sanitizeAdmin(result.rows[0]) });
  } catch (error) {
    console.error("Admin profile fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch profile." });
  }
});

app.patch("/profile", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    if (accountType !== "admin") return res.status(400).json({ message: "A valid account type is required." });
    if (!Number.isInteger(accountID) || accountID !== 1) return res.status(404).json({ message: "Admin account not found." });

    const payload = req.body || {};
    const allowedFields = [
      "fullName",
      "userName",
      "address",
      "contactNumber",
      "parishName",
      "email",
      "smtpAppPassword",
    ];
    const hasUnsupportedFields = Object.keys(payload)
      .filter((key) => key !== "accountType" && key !== "accountID")
      .some((key) => !allowedFields.includes(key));
    if (hasUnsupportedFields) return res.status(400).json({ message: "Profile contains unsupported fields." });

    const existingAdminResult = await query(
      `
        SELECT email, "contactNumber"
        FROM admin
        WHERE "adminID" = 1
      `,
    );
    if (existingAdminResult.rows.length === 0) return res.status(404).json({ message: "Admin account not found." });
    const previousEmail = normalizeEmail(existingAdminResult.rows[0]?.email || "");
    const previousPhone = String(existingAdminResult.rows[0]?.contactNumber || "").trim();

    const updates = [];
    const values = [];
    const pushField = (columnName, rawValue) => {
      const value = String(rawValue ?? "").trim();
      if (!value) return;
      updates.push(`"${columnName}" = $${values.length + 1}`);
      values.push(value);
    };

    let nextEmail = "";
    if (Object.prototype.hasOwnProperty.call(payload, "email")) {
      nextEmail = normalizeEmail(payload.email);
      if (!EMAIL_INPUT_REGEX.test(nextEmail) || !isGmailAddress(nextEmail)) {
        return res.status(400).json({ message: "Parish email must be a Gmail address (example@gmail.com)." });
      }
      const smtpAppPassword = normalizeGmailAppPassword(payload.smtpAppPassword);
      const emailChanged = nextEmail !== previousEmail;
      if (smtpAppPassword && !isValidGmailAppPassword(smtpAppPassword)) {
        return res.status(400).json({
          message: "Gmail App Password must be the 16-character code from Google App passwords, not your normal Gmail password.",
        });
      }
      if (emailChanged && !smtpAppPassword) {
        return res.status(400).json({
          message: "This new Gmail needs a 16-character App Password. Open the help icon, create one named Faithflow, then paste it here.",
        });
      }
      pushField("email", nextEmail);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "fullName")) pushField("fullName", payload.fullName);
    if (Object.prototype.hasOwnProperty.call(payload, "userName")) pushField("userName", payload.userName);
    if (Object.prototype.hasOwnProperty.call(payload, "address")) pushField("address", payload.address);
    if (Object.prototype.hasOwnProperty.call(payload, "contactNumber")) {
      const rawContact = String(payload.contactNumber ?? "").trim();
      const contact = normalizeLoginPhone(rawContact);
      if (rawContact && !contact) {
        return res.status(400).json({ message: "Contact number must be 11 digits and start with 09." });
      }
      pushField("contactNumber", contact);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "parishName")) pushField("parishName", payload.parishName);
    if (updates.length === 0) return res.status(400).json({ message: "No profile fields to update." });

    const targetEmail = nextEmail || previousEmail;
    const targetPhone = Object.prototype.hasOwnProperty.call(payload, "contactNumber")
      ? normalizeLoginPhone(payload.contactNumber)
      : previousPhone;
    const contactDetailsChanged =
      normalizeEmail(targetEmail) !== previousEmail ||
      normalizeLoginPhone(targetPhone) !== normalizeLoginPhone(previousPhone);
    if (contactDetailsChanged) {
      const availabilityResponse = await fetch(`${MAIN_SERVER_BASE_URL}/contact-identifiers/available`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, phoneNumber: targetPhone }),
      });
      const availabilityPayload = await availabilityResponse.json().catch(() => ({}));
      if (!availabilityResponse.ok) {
        return res.status(availabilityResponse.status).json({
          message: availabilityPayload.message || "Email or phone number is already in use.",
        });
      }
    }

    let nextGmailAppPassword = "";
    if (nextEmail) {
      const storedPasswordResult = await query(
        `SELECT "gmailAppPassword" FROM admin WHERE "adminID" = 1`,
      );
      const storedGmailAppPassword = String(storedPasswordResult.rows[0]?.gmailAppPassword || "").trim();
      const submittedGmailAppPassword = normalizeGmailAppPassword(payload.smtpAppPassword);
      nextGmailAppPassword = submittedGmailAppPassword || (nextEmail === previousEmail ? storedGmailAppPassword : "");
      try {
        await syncPriestMailerSender({
          senderEmail: nextEmail,
          smtpAppPassword: nextGmailAppPassword,
        });
      } catch (error) {
        return res.status(400).json({ message: error.message || "Unable to update the priest email sender." });
      }
      if (submittedGmailAppPassword) {
        updates.push(`"gmailAppPassword" = $${values.length + 1}`);
        values.push(submittedGmailAppPassword);
      }
    }

    values.push(1);
    const result = await query(
      `
        UPDATE admin
        SET ${updates.join(", ")}
        WHERE "adminID" = $${values.length}
        RETURNING "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", photo
      `,
      values,
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Admin account not found." });

    await recordAuditLog("admin_profile_update", req, {
      targetType: "admin",
      targetID: "1",
      metadata: {
        updatedFields: updates.map((item) => item.split("=")[0].trim().replace(/"/g, "")),
        senderEmailUpdated: Boolean(nextEmail),
      },
    });

    const successMessage = nextEmail
      ? "Parish email updated. Priest password emails will now be sent from this Gmail."
      : "Profile updated successfully.";
    return res.json({ message: successMessage, accountType: "admin", user: sanitizeAdmin(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Username or email is already taken." });
    console.error("Admin profile update error:", error);
    return res.status(500).json({ message: "Unable to update profile." });
  }
});

app.patch("/profile/password", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (accountType !== "admin") return res.status(400).json({ message: "A valid account type is required." });
    if (!Number.isInteger(accountID) || accountID !== 1) return res.status(404).json({ message: "Admin account not found." });
    if (!currentPassword.trim() || !newPassword.trim()) return res.status(400).json({ message: "Current and new passwords are required." });
    if (newPassword.length < 6) return res.status(400).json({ message: "New password must be at least 6 characters long." });
    if (currentPassword === newPassword) return res.status(400).json({ message: "New password must be different from your current password." });

    const accountResult = await query(
      `
        SELECT "adminID", password
        FROM admin
        WHERE "adminID" = 1
        LIMIT 1
      `,
    );
    if (accountResult.rows.length === 0) return res.status(404).json({ message: "Admin account not found." });

    const foundAdmin = accountResult.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(currentPassword, foundAdmin.password);
    if (!passwordVerification.isValid) return res.status(401).json({ message: "Current password is incorrect." });

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const updatePasswordResult = await query(
      `
        UPDATE admin
        SET password = $1
        WHERE "adminID" = 1
        RETURNING "adminID", "createdAt"
      `,
      [newPasswordHash],
    );
    if (updatePasswordResult.rows.length === 0) return res.status(404).json({ message: "Admin account not found." });

    await recordAuditLog("admin_password_change", req, {
      targetType: "admin",
      targetID: "1",
      metadata: { accountID: 1 },
    });

    return res.json({
      message: "Password changed successfully.",
      accountType: "admin",
      adminID: updatePasswordResult.rows[0].adminID,
      updatedAt: updatePasswordResult.rows[0].createdAt,
    });
  } catch (error) {
    console.error("Admin profile password update error:", error);
    return res.status(500).json({ message: "Unable to change password." });
  }
});

app.post("/profile/photo", (req, res, next) => {
  adminProfilePhotoUpload.single("photo")(req, res, (error) => {
    if (!error) return next();
    if (error?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Image size must be 5MB or smaller." });
    }
    if (error?.message === "Only image uploads are allowed.") {
      return res.status(400).json({ message: error.message });
    }
    console.error("Admin profile photo upload error:", error);
    return res.status(500).json({ message: "Unable to upload profile photo." });
  });
}, async (req, res) => {
  const storedUploadPath = req.file ? `${adminPhotoPublicBasePath}${req.file.filename}` : "";
  const cleanupUploadedPhotoIfPresent = async () => {
    if (!req.file?.filename) return;
    await deleteStoredAdminProfilePhotoIfExists(storedUploadPath);
  };

  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    if (accountType !== "admin") {
      await cleanupUploadedPhotoIfPresent();
      return res.status(400).json({ message: "This endpoint only supports admin profile photos." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      await cleanupUploadedPhotoIfPresent();
      return res.status(404).json({ message: "Admin account not found." });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Photo file is required." });
    }

    const existingAdminResult = await query(
      `
        SELECT "adminID", photo
        FROM admin
        WHERE "adminID" = 1
        LIMIT 1
      `,
    );
    if (existingAdminResult.rows.length === 0) {
      await cleanupUploadedPhotoIfPresent();
      return res.status(404).json({ message: "Admin account not found." });
    }

    const previousPhotoPath = existingAdminResult.rows[0].photo || null;
    const nextPhotoPath = await storeAdminProfilePhoto(req.file);
    const updateResult = await query(
      `
        UPDATE admin
        SET photo = $1
        WHERE "adminID" = 1
        RETURNING "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", photo
      `,
      [nextPhotoPath],
    );
    if (updateResult.rows.length === 0) {
      await cleanupUploadedPhotoIfPresent();
      return res.status(404).json({ message: "Admin account not found." });
    }
    if (previousPhotoPath && getAdminProfilePhotoFileName(previousPhotoPath) !== path.basename(nextPhotoPath)) {
      await deleteStoredAdminProfilePhotoIfExists(previousPhotoPath);
    }

    await recordAuditLog("admin_profile_photo_update", req, {
      targetType: "admin",
      targetID: "1",
      metadata: { photoUpdated: true },
    });

    return res.status(201).json({
      message: "Profile picture updated.",
      accountType: "admin",
      photo: nextPhotoPath,
      user: sanitizeAdmin(updateResult.rows[0]),
    });
  } catch (error) {
    try {
      await cleanupUploadedPhotoIfPresent();
    } catch (cleanupError) {
      console.error("Admin profile photo cleanup error:", cleanupError);
    }
    console.error("Admin profile photo upload error:", error);
    return res.status(500).json({ message: "Unable to upload profile photo." });
  }
});

app.post("/admin-notifications", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    const type = String(req.body?.type || "system").trim().slice(0, 50) || "system";
    const title = String(req.body?.title || "Notification").trim() || "Notification";
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ message: "body is required." });

    const metadata = req.body?.metadata && typeof req.body.metadata === "object" && !Array.isArray(req.body.metadata)
      ? req.body.metadata
      : {};
    const result = await query(
      `
        INSERT INTO admin_notifications ("adminID", type, title, body, metadata)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING "adminNotifID", type, title, body, metadata, "isRead", "createdAt", "readAt"
      `,
      [adminID, type, title, body, JSON.stringify(metadata)],
    );
    return res.status(201).json(normalizeAdminNotificationRow(result.rows[0]));
  } catch (error) {
    console.error("Admin notification create error:", error);
    return res.status(500).json({ message: "Unable to create admin notification." });
  }
});

app.get("/admin-notifications/unread-count", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    const result = await query(
      `
        SELECT COUNT(*)::INT AS count
        FROM admin_notifications
        WHERE "adminID" = $1
          AND "isRead" = FALSE
      `,
      [adminID],
    );
    return res.json({ count: Number(result.rows[0]?.count) || 0 });
  } catch (error) {
    console.error("Admin notification unread-count fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch admin notification count." });
  }
});

app.get("/admin-notifications", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    const parsedLimit = Number(req.query?.limit);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const unreadOnly = String(req.query?.unreadOnly || "").trim().toLowerCase();
    const showUnreadOnly = unreadOnly === "1" || unreadOnly === "true" || unreadOnly === "yes";

    const result = await query(
      `
        SELECT "adminNotifID", type, title, body, metadata, "isRead", "createdAt", "readAt"
        FROM admin_notifications
        WHERE "adminID" = $1
          AND ($2::BOOLEAN = FALSE OR "isRead" = FALSE)
        ORDER BY "createdAt" DESC
        LIMIT $3
      `,
      [adminID, showUnreadOnly, limit],
    );
    return res.json(result.rows.map(normalizeAdminNotificationRow));
  } catch (error) {
    console.error("Admin notifications fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch admin notifications." });
  }
});

app.patch("/admin-notifications/read-all", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const result = await query(
      `
        UPDATE admin_notifications
        SET "isRead" = TRUE,
            "readAt" = NOW()
        WHERE "adminID" = $1
          AND "isRead" = FALSE
        RETURNING "adminNotifID"
      `,
      [adminID],
    );
    return res.json({ updatedCount: result.rows.length });
  } catch (error) {
    console.error("Admin notification read-all update error:", error);
    return res.status(500).json({ message: "Unable to update admin notifications." });
  }
});

app.patch("/admin-notifications/:id/read", async (req, res) => {
  try {
    const notificationID = Number(req.params.id);
    if (!Number.isInteger(notificationID) || notificationID <= 0) {
      return res.status(400).json({ message: "Invalid admin notification id." });
    }
    const adminID = Number(req.body?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const result = await query(
      `
        UPDATE admin_notifications
        SET "isRead" = TRUE,
            "readAt" = NOW()
        WHERE "adminNotifID" = $1
          AND "adminID" = $2
        RETURNING "adminNotifID", type, title, body, "isRead", "createdAt", "readAt"
      `,
      [notificationID, adminID],
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Admin notification not found." });
    return res.json(normalizeAdminNotificationRow(result.rows[0]));
  } catch (error) {
    console.error("Admin notification read update error:", error);
    return res.status(500).json({ message: "Unable to update admin notification." });
  }
});

app.all("/history/admin", forwardRequestToMainServer);
app.get("/calendar-entries/print/month", async (req, res) => {
  try {
    const monthInput = String(req.query?.month || "").trim();
    const priestIdInput = req.query?.priestID;
    const hasPriestIdInput = priestIdInput !== undefined && priestIdInput !== null && priestIdInput !== "";
    const parsedPriestID = Number(priestIdInput);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput)) {
      return res.status(400).json({ message: "month must be in YYYY-MM format." });
    }
    if (hasPriestIdInput && (!Number.isInteger(parsedPriestID) || parsedPriestID <= 0)) {
      return res.status(400).json({ message: "priestID must be a positive whole number when provided." });
    }

    const adminProfileResult = await query(`SELECT "parishName" FROM admin WHERE "adminID" = 1 LIMIT 1`);
    const resolvedParishName = String(adminProfileResult.rows[0]?.parishName || "").trim() || "Parish";
    const requestQuery = new URLSearchParams({ adminID: "1", month: monthInput, parishName: resolvedParishName });
    if (hasPriestIdInput) requestQuery.set("priestID", String(parsedPriestID));
    const response = await fetch(`${MAIN_SERVER_BASE_URL}/calendar-entries/print/month?${requestQuery.toString()}`, { method: "GET" });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => ({ message: "Invalid JSON response from main server." }));
      return res.status(response.status).json(payload);
    }
    const binaryPayload = Buffer.from(await response.arrayBuffer());
    const upstreamContentType = response.headers.get("content-type");
    const upstreamDisposition = response.headers.get("content-disposition");
    if (upstreamContentType) res.setHeader("Content-Type", upstreamContentType);
    if (upstreamDisposition) res.setHeader("Content-Disposition", upstreamDisposition);
    return res.status(response.status).send(binaryPayload);
  } catch (error) {
    console.error("Calendar monthly print proxy error:", error);
    return res.status(502).json({ message: "Unable to print monthly calendar entries." });
  }
});

app.all("/appointments", forwardRequestToMainServer);
app.all("/reports/records", forwardRequestToMainServer);
app.all("/appointments/admin", forwardRequestToMainServer);
app.all("/appointments/requests", forwardRequestToMainServer);
app.all("/appointments/:id/history-details", forwardRequestToMainServer);
app.all("/appointments/:id/progress", forwardRequestToMainServer);
app.all("/appointments/:id/schedule-remarks", forwardRequestToMainServer);
app.all("/appointments/:id/schedule-remarks/:remarkID/review", forwardRequestToMainServer);
app.all("/appointments/:id/preferred-slots", forwardRequestToMainServer);
app.post(
  "/appointments/:id/progress/payment-records",
  progressPaymentReceiptUpload.single("receiptFile"),
  forwardMultipartRequestToMainServer,
);
app.delete("/appointments/:id/progress/payment-records", forwardRequestToMainServer);
app.all("/appointments/:id/review-state", forwardRequestToMainServer);
app.all("/appointments/:id/status", forwardRequestToMainServer);
app.all("/appointments/:id/archive", forwardRequestToMainServer);
app.all("/progress-templates", forwardRequestToMainServer);
app.all("/progress-templates/:id", forwardRequestToMainServer);
app.all("/progress-templates/:id/steps", forwardRequestToMainServer);
app.all("/user-notifications/read-all", forwardRequestToMainServer);
app.all("/certificate-requests", forwardRequestToMainServer);
app.all("/certificate-requests/:id/history-details", forwardRequestToMainServer);
app.all("/certificate-requests/:id/status", forwardRequestToMainServer);
app.all("/certificate-types", forwardRequestToMainServer);
app.all("/certificate-types/archived", forwardRequestToMainServer);
app.all("/certificate-types/:id/fields", forwardRequestToMainServer);
app.all("/certificate-types/:id/name", forwardRequestToMainServer);
app.all("/certificate-types/:id/fee", forwardRequestToMainServer);
app.all("/certificate-types/:id/restore", forwardRequestToMainServer);
app.all("/certificate-types/:id/permanent", forwardRequestToMainServer);
app.all("/certificate-types/:id", forwardRequestToMainServer);
app.all("/calendar-entries", forwardRequestToMainServer);
app.all("/calendar-entries/:id", forwardRequestToMainServer);
app.all("/calendar-entries/:id/appointment-details", forwardRequestToMainServer);
app.all("/dashboard/stats", forwardRequestToMainServer);
app.all("/dashboard/office-status", forwardRequestToMainServer);
app.all("/day-offs", forwardRequestToMainServer);
app.all("/day-offs/weekday", forwardRequestToMainServer);
app.all("/day-offs/half-day", forwardRequestToMainServer);
app.all("/day-offs/date/:date", forwardRequestToMainServer);
app.all("/day-offs/:weekday", forwardRequestToMainServer);
app.all("/sacraments/archived", forwardRequestToMainServer);
app.all("/sacraments", forwardRequestToMainServer);
app.all("/sacrament-form-schemas", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/requirements", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/fields", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/name", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/archive", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/restore", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey", forwardRequestToMainServer);
app.all("/special-sacraments", forwardRequestToMainServer);
app.all("/special-sacraments/:id", forwardRequestToMainServer);
app.all("/special-sacraments/:id/name", forwardRequestToMainServer);
app.all("/special-sacrament-form-schemas", forwardRequestToMainServer);
app.all("/special-sacrament-form-schemas/:specialSacramentName", forwardRequestToMainServer);
app.all("/special-sacrament-form-schema-default", forwardRequestToMainServer);
app.all("/special-sacraments/:id/form-schema", forwardRequestToMainServer);
app.all("/parish-activities", forwardRequestToMainServer);
app.post("/parish-activities/upload-image", async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const response = await fetch(`${MAIN_SERVER_BASE_URL}/parish-activities/upload-image`, {
      method: "POST",
      headers: {
        "Content-Type": req.headers["content-type"] || "",
        "Content-Length": req.headers["content-length"] || String(Buffer.concat(chunks).length),
      },
      body: Buffer.concat(chunks),
    });
    const payload = await response.json().catch(() => ({ message: "Unable to upload parish activity photo." }));
    return res.status(response.status).json(payload);
  } catch (error) {
    console.error("Parish activity image proxy failed:", error);
    return res.status(502).json({ message: "Unable to upload parish activity photo." });
  }
});
app.post("/parish-activities/delete-media", forwardRequestToMainServer);
app.all("/parish-activities/:id", forwardRequestToMainServer);
app.all("/parish-activities/:id/slides/:slideId", forwardRequestToMainServer);
app.all("/priests", forwardRequestToMainServer);
app.all("/priests/:id", forwardRequestToMainServer);
app.all("/priests/:id/status", forwardRequestToMainServer);
app.all("/priests/:id/toggle-status", forwardRequestToMainServer);
app.all("/priests/:id/password-reset", forwardRequestToMainServer);
app.all("/priests/:id/sacramental-events", forwardRequestToMainServer);
app.all("/priests/:id/available-slots", forwardRequestToMainServer);
app.all("/priests/:id/schedule-remarks", forwardRequestToMainServer);
app.all("/priests/:id/schedule-remarks/:remarkID/review", forwardRequestToMainServer);
app.all("/settings/theme", forwardRequestToMainServer);
app.all("/settings/about-page", forwardRequestToMainServer);
app.all("/settings/religious-orders", forwardRequestToMainServer);
app.all("/settings/priest-email", forwardRequestToMainServer);
app.all("/settings/priest-email/google/status", forwardRequestToMainServer);
app.all("/settings/priest-email/google/connect", forwardRequestToMainServer);
app.all("/settings/priest-email/google/exchange-code", forwardRequestToMainServer);
app.all("/settings/priest-email/google/callback", forwardRequestToMainServer);
app.all("/settings/priest-email/google/test-email", forwardRequestToMainServer);

const startAdminServer = async () => {
  try {
    await initializeAdminDatabase();
    app.listen(PORT, () => {
      console.log(`Faithflow admin server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start admin server:", error);
    await pool.end();
    process.exit(1);
  }
};

startAdminServer();
/*
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, pool } = require("./db-admin");

const app = express();
const PORT = Number(process.env.ADMIN_SERVER_PORT || 3002);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const MAIN_SERVER_BASE_URL = String(process.env.MAIN_SERVER_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const PHONE_INPUT_REGEX = /^09\d{9}$/;
const BCRYPT_PREFIX_REGEX = /^\$2[aby]\$\d{2}\$/;

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "15mb" }));

const normalizeBcryptHash = (hashValue) => {
  const hash = String(hashValue || "");
  if (hash.startsWith("$2y$")) return `$2b$${hash.slice(4)}`;
  return hash;
};

const verifyPasswordWithAutoUpgrade = async (plainPassword, storedPassword) => {
  const normalizedStoredPassword = String(storedPassword || "");
  if (!normalizedStoredPassword) return { isValid: false, upgradedHash: null };

  const normalizedHash = normalizeBcryptHash(normalizedStoredPassword);
  if (BCRYPT_PREFIX_REGEX.test(normalizedHash)) {
    const isValid = await bcrypt.compare(plainPassword, normalizedHash);
    return { isValid, upgradedHash: null };
  }

  const isLegacyMatch = plainPassword === normalizedStoredPassword;
  if (!isLegacyMatch) return { isValid: false, upgradedHash: null };

  const upgradedHash = await bcrypt.hash(plainPassword, 10);
  return { isValid: true, upgradedHash };
};

const sanitizeAdmin = (admin) => ({
  adminID: Number(admin.adminID),
  fullName: admin.fullName,
  userName: admin.userName,
  email: admin.email,
  address: admin.address,
  contactNumber: admin.contactNumber,
  parishName: admin.parishName,
  createdAt: admin.createdAt,
  photo: admin.photo,
});

const getRequestIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);

const recordAuditLog = async (action, req, { targetType = null, targetID = null, metadata = {} } = {}) => {
  try {
    await query(
      `
        INSERT INTO admin_audit_logs ("adminID", action, "targetType", metadata, "ipAddress")
        VALUES (1, $1, $2, $3::jsonb, $4)
      `,
      [String(action || "unknown_action"), targetType ? String(targetType) : null, JSON.stringify({ targetID, ...metadata }), getRequestIp(req) || null],
    );
  } catch (error) {
    console.error("Failed to write admin audit log:", error);
  }
};

const normalizeAdminNotificationRow = (row) => ({
  id: Number(row.adminNotifID),
  type: row.type,
  title: row.title,
  body: row.body,
  severity: "info",
  isRead: Boolean(row.isRead),
  createdAt: row.createdAt,
  readAt: row.readAt,
  metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
});

const initializeAdminDatabase = async () => {
  await query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await query(`
    DO $$
    BEGIN
      IF to_regclass('public.admin_account') IS NOT NULL AND to_regclass('public.admin') IS NULL THEN
        ALTER TABLE admin_account RENAME TO admin;
      END IF;
    END
    $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin (
      "adminID" INT PRIMARY KEY CHECK ("adminID" = 1),
      "userName" VARCHAR(120) NOT NULL UNIQUE,
      email VARCHAR(255) UNIQUE,
      "fullName" VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      "contactNumber" VARCHAR(40),
      "parishName" VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      photo TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE admin ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      "admin_auditID" BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      action VARCHAR(120) NOT NULL,
      "targetType" VARCHAR(120),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "ipAddress" VARCHAR(64),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_audit_logs' AND column_name = 'id'
      ) THEN
        ALTER TABLE admin_audit_logs RENAME COLUMN id TO "admin_auditID";
      END IF;
      ALTER TABLE admin_audit_logs DROP COLUMN IF EXISTS "targetID";
      ALTER TABLE admin_audit_logs DROP COLUMN IF EXISTS "userAgent";
    END
    $$;
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs ("createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      "adminNotifID" BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "readAt" TIMESTAMPTZ
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('admin_notifications.adminNotifID'));
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN id TO "adminNotifID";
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'admin_notifID'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN "admin_notifID" TO "adminNotifID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
      ALTER TABLE admin_notifications DROP COLUMN IF EXISTS severity;
      ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS "adminID" INT;
      UPDATE admin_notifications SET "adminID" = 1 WHERE "adminID" IS NULL;
      ALTER TABLE admin_notifications ALTER COLUMN "adminID" SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
      RAISE;
    END
    $$;
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications ("createdAt" DESC)`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_unread ON admin_notifications ("adminID", "isRead", "createdAt" DESC)`);

  await query("DROP TABLE IF EXISTS announcements CASCADE");
  await query("DROP TABLE IF EXISTS admin_sessions CASCADE");
  await query("DROP TABLE IF EXISTS admin_login_attempts CASCADE");
  await query("DROP TABLE IF EXISTS admin_settings CASCADE");
  await query("DROP TABLE IF EXISTS admin_api_keys CASCADE");

  const seededAdminUserName = String(process.env.ADMIN_USERNAME || "floribeth").trim().toLowerCase();
  const seededAdminPassword = String(process.env.ADMIN_PASSWORD || "flawsome123");
  const seededAdminEmail = String(process.env.ADMIN_EMAIL || "flawsome@faithflow.local").trim().toLowerCase();
  const seededAdminFullName = String(process.env.ADMIN_FULL_NAME || "Flawsome").trim();
  const seededAdminAddress = String(process.env.ADMIN_ADDRESS || "Parish Office").trim();
  const seededAdminContactNumber = String(process.env.ADMIN_CONTACT_NUMBER || "09123456789").trim();
  const seededAdminParishName = String(process.env.ADMIN_PARISH_NAME || "Faithflow Parish").trim();
  const seededAdminPhoto = String(process.env.ADMIN_PHOTO || "").trim() || null;
  const passwordHash = await bcrypt.hash(seededAdminPassword, 10);

  await query(
    `
      INSERT INTO admin ("adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT ("adminID") DO UPDATE
      SET "userName" = EXCLUDED."userName",
          email = EXCLUDED.email,
          "fullName" = EXCLUDED."fullName",
          address = EXCLUDED.address,
          "contactNumber" = EXCLUDED."contactNumber",
          "parishName" = EXCLUDED."parishName",
          password = COALESCE(admin.password, EXCLUDED.password),
          photo = COALESCE(admin.photo, EXCLUDED.photo)
    `,
    [
      seededAdminUserName,
      seededAdminEmail || null,
      seededAdminFullName,
      seededAdminAddress,
      seededAdminContactNumber || null,
      seededAdminParishName || null,
      passwordHash,
      seededAdminPhoto,
    ],
  );
};

const forwardRequestToMainServer = async (req, res) => {
  try {
    const originalUrl = String(req.originalUrl || req.url || "");
    const normalizedPath = originalUrl.replace(/^\/admin-api(?=\/|$)/, "");
    const requestPath = normalizedPath || String(req.url || "");
    const requestUrl = `${MAIN_SERVER_BASE_URL}${requestPath}`;
    const method = String(req.method || "GET").toUpperCase();

    const headers = {};
    const options = { method, headers };
    if (!["GET", "HEAD"].includes(method)) {
      headers["X-Faithflow-Write-Source"] = "admin";
    }
    if (!["GET", "HEAD", "DELETE"].includes(method)) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(req.body || {});
    }

    const response = await fetch(requestUrl, options);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => ({ message: "Invalid JSON response from main server." }));
      return res.status(response.status).json(payload);
    }
    const binaryPayload = Buffer.from(await response.arrayBuffer());
    const upstreamContentType = response.headers.get("content-type");
    const upstreamDisposition = response.headers.get("content-disposition");
    if (upstreamContentType) res.setHeader("Content-Type", upstreamContentType);
    if (upstreamDisposition) res.setHeader("Content-Disposition", upstreamDisposition);
    return res.status(response.status).send(binaryPayload);
  } catch (error) {
    console.error("Proxy to main server failed:", error);
    return res.status(502).json({ message: "Unable to reach main server." });
  }
};

app.get("/", (_req, res) => res.json({ status: "ok", message: "Faithflow admin server is running." }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.post("/admins/register", (_req, res) => res.status(403).json({ message: "Admin registration is disabled. Use the fixed admin account only." }));
app.post("/admins", (_req, res) => res.status(403).json({ message: "Admin registration is disabled. Use the fixed admin account only." }));

app.post("/login", async (req, res) => {
  try {
    const credential = String(req.body?.userName || req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!credential || !password.trim()) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo, "createdAt"
        FROM admin
        WHERE "adminID" = 1 AND (LOWER("userName") = $1 OR LOWER(COALESCE(email, '')) = $1)
        LIMIT 1
      `,
      [credential],
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const foundAdmin = result.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(password, foundAdmin.password);
    if (!passwordVerification.isValid) {
      return res.status(401).json({ message: "Invalid username or password." });
    }
    if (passwordVerification.upgradedHash) {
      await query(
        `
          UPDATE admin
          SET password = $1
          WHERE "adminID" = 1
        `,
        [passwordVerification.upgradedHash],
      );
    }

    const token = crypto.randomBytes(24).toString("hex");
    await recordAuditLog("admin_login", req, { targetType: "admin", targetID: "1" });
    return res.json({ message: "Login successful.", token, accountType: "admin", user: sanitizeAdmin(foundAdmin) });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Unable to log in right now." });
  }
});

app.get("/admins", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT "adminID", "parishName", address, "fullName", photo
        FROM admin
        WHERE "adminID" = 1
      `,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin list error:", error);
    return res.status(500).json({ message: "Unable to fetch admins." });
  }
});

app.get("/profile", async (req, res) => {
  try {
    const accountType = String(req.query?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.query?.accountID);
    if (accountType !== "admin") return res.status(400).json({ message: "A valid account type is required." });
    if (!Number.isInteger(accountID) || accountID !== 1) return res.status(404).json({ message: "Admin account not found." });

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", photo
        FROM admin
        WHERE "adminID" = 1
      `,
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Admin account not found." });
    return res.json({ accountType: "admin", user: sanitizeAdmin(result.rows[0]) });
  } catch (error) {
    console.error("Admin profile fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch profile." });
  }
});

app.patch("/profile", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    if (accountType !== "admin") return res.status(400).json({ message: "A valid account type is required." });
    if (!Number.isInteger(accountID) || accountID !== 1) return res.status(404).json({ message: "Admin account not found." });

    const payload = req.body || {};
    const allowedFields = ["fullName", "userName", "address", "contactNumber"];
    const hasUnsupportedFields = Object.keys(payload)
      .filter((key) => key !== "accountType" && key !== "accountID")
      .some((key) => !allowedFields.includes(key));
    if (hasUnsupportedFields) return res.status(400).json({ message: "Profile contains unsupported fields." });

    const updates = [];
    const values = [];
    const pushField = (columnName, rawValue) => {
      const value = String(rawValue ?? "").trim();
      if (!value) return;
      updates.push(`"${columnName}" = $${values.length + 1}`);
      values.push(value);
    };

    if (Object.prototype.hasOwnProperty.call(payload, "fullName")) pushField("fullName", payload.fullName);
    if (Object.prototype.hasOwnProperty.call(payload, "userName")) pushField("userName", payload.userName);
    if (Object.prototype.hasOwnProperty.call(payload, "address")) pushField("address", payload.address);
    if (Object.prototype.hasOwnProperty.call(payload, "contactNumber")) {
      const contact = String(payload.contactNumber ?? "").trim();
      if (contact && !PHONE_INPUT_REGEX.test(contact)) {
        return res.status(400).json({ message: "Contact number must be 11 digits and start with 09." });
      }
      pushField("contactNumber", contact);
    }
    if (updates.length === 0) return res.status(400).json({ message: "No profile fields to update." });

    values.push(1);
    const result = await query(
      `
        UPDATE admin
        SET ${updates.join(", ")}
        WHERE "adminID" = $${values.length}
        RETURNING "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", photo
      `,
      values,
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Admin account not found." });

    await recordAuditLog("admin_profile_update", req, {
      targetType: "admin",
      targetID: "1",
      metadata: { updatedFields: updates.map((item) => item.split("=")[0].trim().replace(/"/g, "")) },
    });

    return res.json({ message: "Profile updated successfully.", accountType: "admin", user: sanitizeAdmin(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Username is already taken." });
    console.error("Admin profile update error:", error);
    return res.status(500).json({ message: "Unable to update profile." });
  }
});

app.patch("/profile/password", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (accountType !== "admin") return res.status(400).json({ message: "A valid account type is required." });
    if (!Number.isInteger(accountID) || accountID !== 1) return res.status(404).json({ message: "Admin account not found." });
    if (!currentPassword.trim() || !newPassword.trim()) return res.status(400).json({ message: "Current and new passwords are required." });
    if (newPassword.length < 6) return res.status(400).json({ message: "New password must be at least 6 characters long." });
    if (currentPassword === newPassword) return res.status(400).json({ message: "New password must be different from your current password." });

    const accountResult = await query(
      `
        SELECT "adminID", password
        FROM admin
        WHERE "adminID" = 1
        LIMIT 1
      `,
    );
    if (accountResult.rows.length === 0) return res.status(404).json({ message: "Admin account not found." });

    const foundAdmin = accountResult.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(currentPassword, foundAdmin.password);
    if (!passwordVerification.isValid) return res.status(401).json({ message: "Current password is incorrect." });

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const updatePasswordResult = await query(
      `
        UPDATE admin
        SET password = $1
        WHERE "adminID" = 1
        RETURNING "adminID", "createdAt"
      `,
      [newPasswordHash],
    );
    if (updatePasswordResult.rows.length === 0) return res.status(404).json({ message: "Admin account not found." });

    await recordAuditLog("admin_password_change", req, {
      targetType: "admin",
      targetID: "1",
      metadata: { accountID: 1 },
    });

    return res.json({
      message: "Password changed successfully.",
      accountType: "admin",
      adminID: updatePasswordResult.rows[0].adminID,
      updatedAt: updatePasswordResult.rows[0].createdAt,
    });
  } catch (error) {
    console.error("Admin profile password update error:", error);
    return res.status(500).json({ message: "Unable to change password." });
  }
});

app.get("/announcements", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT "announcementID", title, TO_CHAR("publishedDate", 'YYYY-MM-DD') AS "publishedDate", payload
        FROM announcements
        ORDER BY "publishedDate" DESC, "announcementID" DESC
      `,
    );
    const announcements = result.rows.map((row) => ({
      id: Number(row.announcementID),
      title: row.title,
      date: row.publishedDate,
      payload: row.payload || {},
    }));
    return res.json(announcements);
  } catch (error) {
    console.error("Announcements fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch announcements." });
  }
});

app.post("/admin-notifications", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    const type = String(req.body?.type || "system").trim().slice(0, 50) || "system";
    const title = String(req.body?.title || "Notification").trim() || "Notification";
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ message: "body is required." });

    const metadata = req.body?.metadata && typeof req.body.metadata === "object" && !Array.isArray(req.body.metadata)
      ? req.body.metadata
      : {};
    const result = await query(
      `
        INSERT INTO admin_notifications ("adminID", type, title, body, metadata)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING "adminNotifID", type, title, body, metadata, "isRead", "createdAt", "readAt"
      `,
      [adminID, type, title, body, JSON.stringify(metadata)],
    );
    return res.status(201).json(normalizeAdminNotificationRow(result.rows[0]));
  } catch (error) {
    console.error("Admin notification create error:", error);
    return res.status(500).json({ message: "Unable to create admin notification." });
  }
});

app.get("/admin-notifications/unread-count", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    const result = await query(
      `
        SELECT COUNT(*)::INT AS count
        FROM admin_notifications
        WHERE "adminID" = $1
          AND "isRead" = FALSE
      `,
      [adminID],
    );
    return res.json({ count: Number(result.rows[0]?.count) || 0 });
  } catch (error) {
    console.error("Admin notification unread-count fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch admin notification count." });
  }
});

app.get("/admin-notifications", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    const parsedLimit = Number(req.query?.limit);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const unreadOnly = String(req.query?.unreadOnly || "").trim().toLowerCase();
    const showUnreadOnly = unreadOnly === "1" || unreadOnly === "true" || unreadOnly === "yes";

    const result = await query(
      `
        SELECT "adminNotifID", type, title, body, metadata, "isRead", "createdAt", "readAt"
        FROM admin_notifications
        WHERE "adminID" = $1
          AND ($2::BOOLEAN = FALSE OR "isRead" = FALSE)
        ORDER BY "createdAt" DESC
        LIMIT $3
      `,
      [adminID, showUnreadOnly, limit],
    );
    return res.json(result.rows.map(normalizeAdminNotificationRow));
  } catch (error) {
    console.error("Admin notifications fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch admin notifications." });
  }
});

app.patch("/admin-notifications/read-all", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const result = await query(
      `
        UPDATE admin_notifications
        SET "isRead" = TRUE,
            "readAt" = NOW()
        WHERE "adminID" = $1
          AND "isRead" = FALSE
        RETURNING "adminNotifID"
      `,
      [adminID],
    );
    return res.json({ updatedCount: result.rows.length });
  } catch (error) {
    console.error("Admin notification read-all update error:", error);
    return res.status(500).json({ message: "Unable to update admin notifications." });
  }
});

app.patch("/admin-notifications/:id/read", async (req, res) => {
  try {
    const notificationID = Number(req.params.id);
    if (!Number.isInteger(notificationID) || notificationID <= 0) {
      return res.status(400).json({ message: "Invalid admin notification id." });
    }
    const adminID = Number(req.body?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const result = await query(
      `
        UPDATE admin_notifications
        SET "isRead" = TRUE,
            "readAt" = NOW()
        WHERE "adminNotifID" = $1
          AND "adminID" = $2
        RETURNING "adminNotifID", type, title, body, "isRead", "createdAt", "readAt"
      `,
      [notificationID, adminID],
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Admin notification not found." });
    return res.json(normalizeAdminNotificationRow(result.rows[0]));
  } catch (error) {
    console.error("Admin notification read update error:", error);
    return res.status(500).json({ message: "Unable to update admin notification." });
  }
});

app.all("/history/admin", forwardRequestToMainServer);

app.get("/calendar-entries/print/month", async (req, res) => {
  try {
    const monthInput = String(req.query?.month || "").trim();
    const priestIdInput = req.query?.priestID;
    const hasPriestIdInput = priestIdInput !== undefined && priestIdInput !== null && priestIdInput !== "";
    const parsedPriestID = Number(priestIdInput);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput)) {
      return res.status(400).json({ message: "month must be in YYYY-MM format." });
    }
    if (hasPriestIdInput && (!Number.isInteger(parsedPriestID) || parsedPriestID <= 0)) {
      return res.status(400).json({ message: "priestID must be a positive whole number when provided." });
    }

    const adminProfileResult = await query(
      `
        SELECT "parishName"
        FROM admin
        WHERE "adminID" = 1
        LIMIT 1
      `,
    );
    const resolvedParishName = String(adminProfileResult.rows[0]?.parishName || "").trim() || "Parish";
    const requestQuery = new URLSearchParams({
      adminID: "1",
      month: monthInput,
      parishName: resolvedParishName,
    });
    if (hasPriestIdInput) {
      requestQuery.set("priestID", String(parsedPriestID));
    }

    const requestPath = `/calendar-entries/print/month?${requestQuery.toString()}`;
    const requestUrl = `${MAIN_SERVER_BASE_URL}${requestPath}`;
    const response = await fetch(requestUrl, { method: "GET" });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => ({ message: "Invalid JSON response from main server." }));
      return res.status(response.status).json(payload);
    }

    const binaryPayload = Buffer.from(await response.arrayBuffer());
    const upstreamContentType = response.headers.get("content-type");
    const upstreamDisposition = response.headers.get("content-disposition");
    if (upstreamContentType) res.setHeader("Content-Type", upstreamContentType);
    if (upstreamDisposition) res.setHeader("Content-Disposition", upstreamDisposition);
    return res.status(response.status).send(binaryPayload);
  } catch (error) {
    console.error("Calendar monthly print proxy error:", error);
    return res.status(502).json({ message: "Unable to print monthly calendar entries." });
  }
});

// Admin dashboard shared-domain APIs are proxied to main server (faithflow DB).
app.all("/appointments", forwardRequestToMainServer);
app.all("/reports/records", forwardRequestToMainServer);
app.all("/appointments/admin", forwardRequestToMainServer);
app.all("/appointments/requests", forwardRequestToMainServer);
app.all("/appointments/:id/history-details", forwardRequestToMainServer);
app.all("/appointments/:id/progress", forwardRequestToMainServer);
app.all("/appointments/:id/schedule-remarks", forwardRequestToMainServer);
app.all("/appointments/:id/schedule-remarks/:remarkID/review", forwardRequestToMainServer);
app.all("/appointments/:id/preferred-slots", forwardRequestToMainServer);
app.post(
  "/appointments/:id/progress/payment-records",
  progressPaymentReceiptUpload.single("receiptFile"),
  forwardMultipartRequestToMainServer,
);
app.all("/appointments/:id/review-state", forwardRequestToMainServer);
app.all("/appointments/:id/status", forwardRequestToMainServer);
app.all("/appointments/:id/archive", forwardRequestToMainServer);
app.all("/progress-templates", forwardRequestToMainServer);
app.all("/progress-templates/:id", forwardRequestToMainServer);
app.all("/progress-templates/:id/steps", forwardRequestToMainServer);
app.all("/user-notifications/read-all", forwardRequestToMainServer);
app.all("/certificate-requests", forwardRequestToMainServer);
app.all("/certificate-requests/:id/history-details", forwardRequestToMainServer);
app.all("/certificate-requests/:id/status", forwardRequestToMainServer);
app.all("/certificate-types", forwardRequestToMainServer);
app.all("/certificate-types/archived", forwardRequestToMainServer);
app.all("/certificate-types/:id/fields", forwardRequestToMainServer);
app.all("/certificate-types/:id/name", forwardRequestToMainServer);
app.all("/certificate-types/:id/fee", forwardRequestToMainServer);
app.all("/certificate-types/:id/restore", forwardRequestToMainServer);
app.all("/certificate-types/:id/permanent", forwardRequestToMainServer);
app.all("/certificate-types/:id", forwardRequestToMainServer);
app.all("/calendar-entries", forwardRequestToMainServer);
app.all("/calendar-entries/:id", forwardRequestToMainServer);
app.all("/calendar-entries/:id/appointment-details", forwardRequestToMainServer);
app.all("/dashboard/stats", forwardRequestToMainServer);
app.all("/dashboard/office-status", forwardRequestToMainServer);
app.all("/day-offs", forwardRequestToMainServer);
app.all("/day-offs/weekday", forwardRequestToMainServer);
app.all("/day-offs/date/:date", forwardRequestToMainServer);
app.all("/day-offs/:weekday", forwardRequestToMainServer);
app.all("/sacraments/archived", forwardRequestToMainServer);
app.all("/sacraments", forwardRequestToMainServer);
app.all("/sacrament-form-schemas", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/requirements", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/fields", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/name", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/archive", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/restore", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey", forwardRequestToMainServer);
app.all("/special-sacraments", forwardRequestToMainServer);
app.all("/special-sacraments/:id", forwardRequestToMainServer);
app.all("/special-sacraments/:id/name", forwardRequestToMainServer);
app.all("/special-sacrament-form-schemas", forwardRequestToMainServer);
app.all("/special-sacrament-form-schemas/:specialSacramentName", forwardRequestToMainServer);
app.all("/special-sacrament-form-schema-default", forwardRequestToMainServer);
app.all("/special-sacraments/:id/form-schema", forwardRequestToMainServer);
app.all("/priests", forwardRequestToMainServer);
app.all("/priests/:id", forwardRequestToMainServer);
app.all("/priests/:id/status", forwardRequestToMainServer);
app.all("/priests/:id/toggle-status", forwardRequestToMainServer);
app.all("/priests/:id/password-reset", forwardRequestToMainServer);
app.all("/priests/:id/sacramental-events", forwardRequestToMainServer);
app.all("/priests/:id/available-slots", forwardRequestToMainServer);
app.all("/priests/:id/schedule-remarks", forwardRequestToMainServer);
app.all("/priests/:id/schedule-remarks/:remarkID/review", forwardRequestToMainServer);
app.all("/settings/theme", forwardRequestToMainServer);
app.all("/settings/about-page", forwardRequestToMainServer);
app.all("/settings/religious-orders", forwardRequestToMainServer);

const startAdminServer = async () => {
  try {
    await initializeAdminDatabase();
    app.listen(PORT, () => {
      console.log(`Faithflow admin server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start admin server:", error);
    await pool.end();
    process.exit(1);
  }
};

startAdminServer();
const ping = "ok";
console.log(ping);
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, pool } = require("./db-admin");

const app = express();
const PORT = Number(process.env.ADMIN_SERVER_PORT || 3002);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const MAIN_SERVER_BASE_URL = String(process.env.MAIN_SERVER_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const PHONE_INPUT_REGEX = /^09\d{9}$/;
const BCRYPT_PREFIX_REGEX = /^\$2[aby]\$\d{2}\$/;
const DEFAULT_SESSION_TTL_HOURS = Number(process.env.ADMIN_SESSION_TTL_HOURS || 24 * 7);

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "15mb" }));

const normalizeBcryptHash = (hashValue) => {
  const hash = String(hashValue || "");
  if (hash.startsWith("$2y$")) return `$2b$${hash.slice(4)}`;
  return hash;
};

const verifyPasswordWithAutoUpgrade = async (plainPassword, storedPassword) => {
  const normalizedStoredPassword = String(storedPassword || "");
  if (!normalizedStoredPassword) return { isValid: false, upgradedHash: null };

  const normalizedHash = normalizeBcryptHash(normalizedStoredPassword);
  if (BCRYPT_PREFIX_REGEX.test(normalizedHash)) {
    const isValid = await bcrypt.compare(plainPassword, normalizedHash);
    return { isValid, upgradedHash: null };
  }

  const isLegacyMatch = plainPassword === normalizedStoredPassword;
  if (!isLegacyMatch) return { isValid: false, upgradedHash: null };

  const upgradedHash = await bcrypt.hash(plainPassword, 10);
  return { isValid: true, upgradedHash };
};

const sanitizeAdmin = (admin) => ({
  adminID: Number(admin.adminID),
  fullName: admin.fullName,
  userName: admin.userName,
  email: admin.email,
  address: admin.address,
  contactNumber: admin.contactNumber,
  parishName: admin.parishName,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
  photo: admin.photo,
});

const getRequestIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);

const getRequestUserAgent = (req) => String(req.headers["user-agent"] || "").trim().slice(0, 512);

const recordLoginAttempt = async (credential, wasSuccessful, req, failureReason = null) => {
  try {
    await query(
      `
        INSERT INTO admin_login_attempts (credential, "wasSuccessful", "failureReason", "ipAddress", "userAgent")
        VALUES ($1, $2, $3, $4, $5)
      `,
      [String(credential || ""), Boolean(wasSuccessful), failureReason, getRequestIp(req) || null, getRequestUserAgent(req) || null],
    );
  } catch (error) {
    console.error("Failed to write login attempt:", error);
  }
};

const getAdminLoginAttempts = async ({ limit, success, credential, from, to }) => {
  const parsedLimit = Number(limit);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;
  const conditions = [];
  const values = [];

  if (typeof success === "boolean") {
    values.push(success);
    conditions.push(`"wasSuccessful" = $${values.length}`);
  }

  const credentialFilter = String(credential || "").trim();
  if (credentialFilter) {
    values.push(`%${credentialFilter.toLowerCase()}%`);
    conditions.push(`LOWER(credential) LIKE $${values.length}`);
  }

  if (from) {
    values.push(String(from));
    conditions.push(`"createdAt" >= $${values.length}::timestamptz`);
  }

  if (to) {
    values.push(String(to));
    conditions.push(`"createdAt" <= $${values.length}::timestamptz`);
  }

  values.push(safeLimit);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `
      SELECT id, credential, "wasSuccessful", "failureReason", "ipAddress", "userAgent", "createdAt"
      FROM admin_login_attempts
      ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT $${values.length}
    `,
    values,
  );
  return result.rows;
};

const recordAuditLog = async (action, req, { targetType = null, targetID = null, metadata = {} } = {}) => {
  try {
    await query(
      `
        INSERT INTO admin_audit_logs ("adminID", action, "targetType", "targetID", metadata, "ipAddress", "userAgent")
        VALUES (1, $1, $2, $3, $4::jsonb, $5, $6)
      `,
      [
        String(action || "unknown_action"),
        targetType ? String(targetType) : null,
        targetID ? String(targetID) : null,
        JSON.stringify(metadata || {}),
        getRequestIp(req) || null,
        getRequestUserAgent(req) || null,
      ],
    );
  } catch (error) {
    console.error("Failed to write admin audit log:", error);
  }
};

const createAdminSession = async (sessionToken, req) => {
  const ttlHours = Number.isFinite(DEFAULT_SESSION_TTL_HOURS) && DEFAULT_SESSION_TTL_HOURS > 0 ? DEFAULT_SESSION_TTL_HOURS : 24 * 7;
  await query(
    `
      INSERT INTO admin_sessions ("adminID", "sessionToken", "ipAddress", "userAgent", "expiresAt", "lastSeenAt")
      VALUES (1, $1, $2, $3, NOW() + ($4::text || ' hours')::interval, NOW())
    `,
    [sessionToken, getRequestIp(req) || null, getRequestUserAgent(req) || null, String(ttlHours)],
  );
};

const initializeAdminDatabase = async () => {
  await query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await query(`
    CREATE TABLE IF NOT EXISTS admin_account (
      "adminID" INT PRIMARY KEY CHECK ("adminID" = 1),
      "userName" VARCHAR(120) NOT NULL UNIQUE,
      email VARCHAR(255) UNIQUE,
      "fullName" VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      "contactNumber" VARCHAR(40),
      "parishName" VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      photo TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      "sessionToken" VARCHAR(128) NOT NULL UNIQUE,
      "ipAddress" VARCHAR(64),
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "revokedAt" TIMESTAMPTZ,
      "lastSeenAt" TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions ("adminID")`);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions ("expiresAt")`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      action VARCHAR(120) NOT NULL,
      "targetType" VARCHAR(120),
      "targetID" VARCHAR(120),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "ipAddress" VARCHAR(64),
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs ("createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id BIGSERIAL PRIMARY KEY,
      credential VARCHAR(255) NOT NULL,
      "wasSuccessful" BOOLEAN NOT NULL,
      "failureReason" VARCHAR(120),
      "ipAddress" VARCHAR(64),
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_created_at ON admin_login_attempts ("createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedByAdminID" INT CHECK ("updatedByAdminID" = 1)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      "adminNotifID" BIGSERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "readAt" TIMESTAMPTZ
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('admin_notifications.adminNotifID'));
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN id TO "adminNotifID";
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'admin_notifID'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN "admin_notifID" TO "adminNotifID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
      RAISE;
    END
    $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_api_keys (
      id BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL DEFAULT 1 CHECK ("adminID" = 1),
      name VARCHAR(120) NOT NULL,
      "keyPrefix" VARCHAR(24) NOT NULL UNIQUE,
      "keyHash" VARCHAR(255) NOT NULL UNIQUE,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "lastUsedAt" TIMESTAMPTZ,
      "revokedAt" TIMESTAMPTZ
    )
  `);

  const seededAdminUserName = String(process.env.ADMIN_USERNAME || "floribeth").trim().toLowerCase();
  const seededAdminPassword = String(process.env.ADMIN_PASSWORD || "flawsome123");
  const seededAdminEmail = String(process.env.ADMIN_EMAIL || "flawsome@faithflow.local").trim().toLowerCase();
  const seededAdminFullName = String(process.env.ADMIN_FULL_NAME || "Flawsome").trim();
  const seededAdminAddress = String(process.env.ADMIN_ADDRESS || "Parish Office").trim();
  const seededAdminContactNumber = String(process.env.ADMIN_CONTACT_NUMBER || "09123456789").trim();
  const seededAdminParishName = String(process.env.ADMIN_PARISH_NAME || "Faithflow Parish").trim();
  const seededAdminPhoto = String(process.env.ADMIN_PHOTO || "").trim() || null;
  const passwordHash = await bcrypt.hash(seededAdminPassword, 10);

  await query(
    `
      INSERT INTO admin_account ("adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT ("adminID") DO UPDATE
      SET "userName" = EXCLUDED."userName",
          email = EXCLUDED.email,
          "fullName" = EXCLUDED."fullName",
          address = EXCLUDED.address,
          "contactNumber" = EXCLUDED."contactNumber",
          "parishName" = EXCLUDED."parishName",
          password = COALESCE(admin_account.password, EXCLUDED.password),
          photo = COALESCE(admin_account.photo, EXCLUDED.photo),
          "updatedAt" = CURRENT_TIMESTAMP
    `,
    [
      seededAdminUserName,
      seededAdminEmail || null,
      seededAdminFullName,
      seededAdminAddress,
      seededAdminContactNumber || null,
      seededAdminParishName || null,
      passwordHash,
      seededAdminPhoto,
    ],
  );
};

const forwardRequestToMainServer = async (req, res) => {
  try {
    const originalUrl = String(req.originalUrl || req.url || "");
    const normalizedPath = originalUrl.replace(/^\/admin-api(?=\/|$)/, "");
    const requestPath = normalizedPath || String(req.url || "");
    const requestUrl = `${MAIN_SERVER_BASE_URL}${requestPath}`;
    const method = String(req.method || "GET").toUpperCase();

    const headers = {};
    const options = { method, headers };
    if (!["GET", "HEAD"].includes(method)) {
      headers["X-Faithflow-Write-Source"] = "admin";
    }
    if (!["GET", "HEAD", "DELETE"].includes(method)) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(req.body || {});
    }

    const response = await fetch(requestUrl, options);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => ({ message: "Invalid JSON response from main server." }));
      return res.status(response.status).json(payload);
    }
    const binaryPayload = Buffer.from(await response.arrayBuffer());
    const upstreamContentType = response.headers.get("content-type");
    const upstreamDisposition = response.headers.get("content-disposition");
    if (upstreamContentType) {
      res.setHeader("Content-Type", upstreamContentType);
    }
    if (upstreamDisposition) {
      res.setHeader("Content-Disposition", upstreamDisposition);
    }
    return res.status(response.status).send(binaryPayload);
  } catch (error) {
    console.error("Proxy to main server failed:", error);
    return res.status(502).json({ message: "Unable to reach main server." });
  }
};

app.get("/", (_req, res) => res.json({ status: "ok", message: "Faithflow admin server is running." }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.post("/admins/register", (_req, res) => {
  return res.status(403).json({ message: "Admin registration is disabled. Use the fixed admin account only." });
});
app.post("/admins", (_req, res) => {
  return res.status(403).json({ message: "Admin registration is disabled. Use the fixed admin account only." });
});

app.post("/login", async (req, res) => {
  try {
    const credential = String(req.body?.userName || req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!credential || !password.trim()) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo, "createdAt", "updatedAt"
        FROM admin_account
        WHERE "adminID" = 1 AND (LOWER("userName") = $1 OR LOWER(COALESCE(email, '')) = $1)
        LIMIT 1
      `,
      [credential],
    );
    if (result.rows.length === 0) {
      await recordLoginAttempt(credential, false, req, "admin_not_found");
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const foundAdmin = result.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(password, foundAdmin.password);
    if (!passwordVerification.isValid) {
      await recordLoginAttempt(credential, false, req, "invalid_password");
      return res.status(401).json({ message: "Invalid username or password." });
    }
    if (passwordVerification.upgradedHash) {
      await query(
        `
          UPDATE admin_account
          SET password = $1, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "adminID" = 1
        `,
        [passwordVerification.upgradedHash],
      );
    }

    const token = crypto.randomBytes(24).toString("hex");
    await createAdminSession(token, req);
    await recordLoginAttempt(credential, true, req);
    await recordAuditLog("admin_login", req, { targetType: "admin_account", targetID: "1" });

    return res.json({ message: "Login successful.", token, accountType: "admin", user: sanitizeAdmin(foundAdmin) });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Unable to log in right now." });
  }
});

app.get("/admins", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT "adminID", "parishName", address, "fullName", photo
        FROM admin_account
        WHERE "adminID" = 1
      `,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin list error:", error);
    return res.status(500).json({ message: "Unable to fetch admins." });
  }
});

app.get("/profile", async (req, res) => {
  try {
    const accountType = String(req.query?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.query?.accountID);
    if (accountType !== "admin") {
      return res.status(400).json({ message: "A valid account type is required." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", "updatedAt", photo
        FROM admin_account
        WHERE "adminID" = 1
      `,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    return res.json({ accountType: "admin", user: sanitizeAdmin(result.rows[0]) });
  } catch (error) {
    console.error("Admin profile fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch profile." });
  }
});

app.patch("/profile", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    if (accountType !== "admin") {
      return res.status(400).json({ message: "A valid account type is required." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    const payload = req.body || {};
    const allowedFields = ["fullName", "userName", "address", "contactNumber"];
    const hasUnsupportedFields = Object.keys(payload)
      .filter((key) => key !== "accountType" && key !== "accountID")
      .some((key) => !allowedFields.includes(key));
    if (hasUnsupportedFields) {
      return res.status(400).json({ message: "Profile contains unsupported fields." });
    }

    const updates = [];
    const values = [];
    const pushField = (columnName, rawValue) => {
      const value = String(rawValue ?? "").trim();
      if (!value) return;
      updates.push(`"${columnName}" = $${values.length + 1}`);
      values.push(value);
    };

    if (Object.prototype.hasOwnProperty.call(payload, "fullName")) pushField("fullName", payload.fullName);
    if (Object.prototype.hasOwnProperty.call(payload, "userName")) pushField("userName", payload.userName);
    if (Object.prototype.hasOwnProperty.call(payload, "address")) pushField("address", payload.address);
    if (Object.prototype.hasOwnProperty.call(payload, "contactNumber")) {
      const contact = String(payload.contactNumber ?? "").trim();
      if (contact && !PHONE_INPUT_REGEX.test(contact)) {
        return res.status(400).json({ message: "Contact number must be 11 digits and start with 09." });
      }
      pushField("contactNumber", contact);
    }
    if (updates.length === 0) {
      return res.status(400).json({ message: "No profile fields to update." });
    }

    updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    values.push(1);

    const result = await query(
      `
        UPDATE admin_account
        SET ${updates.join(", ")}
        WHERE "adminID" = $${values.length}
        RETURNING "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", "updatedAt", photo
      `,
      values,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    await recordAuditLog("admin_profile_update", req, {
      targetType: "admin_account",
      targetID: "1",
      metadata: { updatedFields: updates.map((item) => item.split("=")[0].trim().replace(/"/g, "")) },
    });

    return res.json({ message: "Profile updated successfully.", accountType: "admin", user: sanitizeAdmin(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Username is already taken." });
    }
    console.error("Admin profile update error:", error);
    return res.status(500).json({ message: "Unable to update profile." });
  }
});

app.patch("/profile/password", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (accountType !== "admin") {
      return res.status(400).json({ message: "A valid account type is required." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    if (!currentPassword.trim() || !newPassword.trim()) {
      return res.status(400).json({ message: "Current and new passwords are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long." });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from your current password." });
    }

    const accountResult = await query(
      `
        SELECT "adminID", password
        FROM admin_account
        WHERE "adminID" = 1
        LIMIT 1
      `,
    );
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    const foundAdmin = accountResult.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(currentPassword, foundAdmin.password);
    if (!passwordVerification.isValid) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const updatePasswordResult = await query(
      `
        UPDATE admin_account
        SET password = $1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "adminID" = 1
        RETURNING "adminID", "updatedAt"
      `,
      [newPasswordHash],
    );
    if (updatePasswordResult.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    await recordAuditLog("admin_password_change", req, {
      targetType: "admin_account",
      targetID: "1",
      metadata: { accountID: 1 },
    });

    return res.json({
      message: "Password changed successfully.",
      accountType: "admin",
      adminID: updatePasswordResult.rows[0].adminID,
      updatedAt: updatePasswordResult.rows[0].updatedAt,
    });
  } catch (error) {
    console.error("Admin profile password update error:", error);
    return res.status(500).json({ message: "Unable to change password." });
  }
});

app.get("/admin-login-attempts", async (req, res) => {
  try {
    const successRaw = String(req.query?.success ?? "").trim().toLowerCase();
    let successFilter;
    if (successRaw) {
      if (["true", "1", "yes"].includes(successRaw)) successFilter = true;
      else if (["false", "0", "no"].includes(successRaw)) successFilter = false;
      else return res.status(400).json({ message: "Invalid success value. Use true or false." });
    }

    const fromRaw = String(req.query?.from ?? "").trim();
    const toRaw = String(req.query?.to ?? "").trim();
    if (fromRaw && Number.isNaN(Date.parse(fromRaw))) {
      return res.status(400).json({ message: "Invalid from value. Use a valid date/time." });
    }
    if (toRaw && Number.isNaN(Date.parse(toRaw))) {
      return res.status(400).json({ message: "Invalid to value. Use a valid date/time." });
    }

    const attempts = await getAdminLoginAttempts({
      limit: req.query?.limit,
      success: successFilter,
      credential: req.query?.credential,
      from: fromRaw || null,
      to: toRaw || null,
    });
    return res.json(attempts);
  } catch (error) {
    console.error("Admin login attempts fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch admin login attempts." });
  }
});

app.all("/history/admin", forwardRequestToMainServer);

app.get("/calendar-entries/print/month", async (req, res) => {
  try {
    const monthInput = String(req.query?.month || "").trim();
    const priestIdInput = req.query?.priestID;
    const hasPriestIdInput = priestIdInput !== undefined && priestIdInput !== null && priestIdInput !== "";
    const parsedPriestID = Number(priestIdInput);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput)) {
      return res.status(400).json({ message: "month must be in YYYY-MM format." });
    }
    if (hasPriestIdInput && (!Number.isInteger(parsedPriestID) || parsedPriestID <= 0)) {
      return res.status(400).json({ message: "priestID must be a positive whole number when provided." });
    }

    const adminProfileResult = await query(
      `
        SELECT "parishName"
        FROM admin_account
        WHERE "adminID" = 1
        LIMIT 1
      `,
    );
    const resolvedParishName = String(adminProfileResult.rows[0]?.parishName || "").trim() || "Parish";
    const requestQuery = new URLSearchParams({
      adminID: "1",
      month: monthInput,
      parishName: resolvedParishName,
    });
    if (hasPriestIdInput) {
      requestQuery.set("priestID", String(parsedPriestID));
    }
    const requestPath = `/calendar-entries/print/month?${requestQuery.toString()}`;
    const requestUrl = `${MAIN_SERVER_BASE_URL}${requestPath}`;
    const response = await fetch(requestUrl, { method: "GET" });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => ({ message: "Invalid JSON response from main server." }));
      return res.status(response.status).json(payload);
    }

    const binaryPayload = Buffer.from(await response.arrayBuffer());
    const upstreamContentType = response.headers.get("content-type");
    const upstreamDisposition = response.headers.get("content-disposition");
    if (upstreamContentType) {
      res.setHeader("Content-Type", upstreamContentType);
    }
    if (upstreamDisposition) {
      res.setHeader("Content-Disposition", upstreamDisposition);
    }
    return res.status(response.status).send(binaryPayload);
  } catch (error) {
    console.error("Calendar monthly print proxy error:", error);
    return res.status(502).json({ message: "Unable to print monthly calendar entries." });
  }
});

// Admin dashboard shared-domain APIs are proxied to main server (faithflow DB).
app.all("/appointments", forwardRequestToMainServer);
app.all("/reports/records", forwardRequestToMainServer);
app.all("/appointments/admin", forwardRequestToMainServer);
app.all("/appointments/requests", forwardRequestToMainServer);
app.all("/appointments/:id/history-details", forwardRequestToMainServer);
app.all("/appointments/:id/progress", forwardRequestToMainServer);
app.all("/appointments/:id/schedule-remarks", forwardRequestToMainServer);
app.all("/appointments/:id/schedule-remarks/:remarkID/review", forwardRequestToMainServer);
app.all("/appointments/:id/preferred-slots", forwardRequestToMainServer);
app.post(
  "/appointments/:id/progress/payment-records",
  progressPaymentReceiptUpload.single("receiptFile"),
  forwardMultipartRequestToMainServer,
);
app.all("/appointments/:id/review-state", forwardRequestToMainServer);
app.all("/appointments/:id/status", forwardRequestToMainServer);
app.all("/appointments/:id/archive", forwardRequestToMainServer);
app.all("/progress-templates", forwardRequestToMainServer);
app.all("/progress-templates/:id", forwardRequestToMainServer);
app.all("/progress-templates/:id/steps", forwardRequestToMainServer);
app.all("/admin-notifications", forwardRequestToMainServer);
app.all("/admin-notifications/unread-count", forwardRequestToMainServer);
app.all("/admin-notifications/:id/read", forwardRequestToMainServer);
app.all("/admin-notifications/read-all", forwardRequestToMainServer);
app.all("/user-notifications/read-all", forwardRequestToMainServer);
app.all("/certificate-requests", forwardRequestToMainServer);
app.all("/certificate-requests/:id/history-details", forwardRequestToMainServer);
app.all("/certificate-requests/:id/status", forwardRequestToMainServer);
app.all("/certificate-types", forwardRequestToMainServer);
app.all("/certificate-types/archived", forwardRequestToMainServer);
app.all("/certificate-types/:id/fields", forwardRequestToMainServer);
app.all("/certificate-types/:id/name", forwardRequestToMainServer);
app.all("/certificate-types/:id/fee", forwardRequestToMainServer);
app.all("/certificate-types/:id/restore", forwardRequestToMainServer);
app.all("/certificate-types/:id/permanent", forwardRequestToMainServer);
app.all("/certificate-types/:id", forwardRequestToMainServer);
app.all("/calendar-entries", forwardRequestToMainServer);
app.all("/calendar-entries/:id", forwardRequestToMainServer);
app.all("/calendar-entries/:id/appointment-details", forwardRequestToMainServer);
app.all("/dashboard/stats", forwardRequestToMainServer);
app.all("/dashboard/office-status", forwardRequestToMainServer);
app.all("/day-offs", forwardRequestToMainServer);
app.all("/day-offs/weekday", forwardRequestToMainServer);
app.all("/day-offs/date/:date", forwardRequestToMainServer);
app.all("/day-offs/:weekday", forwardRequestToMainServer);
app.all("/sacraments/archived", forwardRequestToMainServer);
app.all("/sacraments", forwardRequestToMainServer);
app.all("/sacrament-form-schemas", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/requirements", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/fields", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/name", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/archive", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey/restore", forwardRequestToMainServer);
app.all("/sacrament-form-schemas/:schemaKey", forwardRequestToMainServer);
app.all("/special-sacraments", forwardRequestToMainServer);
app.all("/special-sacraments/:id", forwardRequestToMainServer);
app.all("/special-sacraments/:id/name", forwardRequestToMainServer);
app.all("/special-sacrament-form-schemas", forwardRequestToMainServer);
app.all("/special-sacrament-form-schemas/:specialSacramentName", forwardRequestToMainServer);
app.all("/special-sacrament-form-schema-default", forwardRequestToMainServer);
app.all("/special-sacraments/:id/form-schema", forwardRequestToMainServer);
app.all("/priests", forwardRequestToMainServer);
app.all("/priests/:id", forwardRequestToMainServer);
app.all("/priests/:id/status", forwardRequestToMainServer);
app.all("/priests/:id/toggle-status", forwardRequestToMainServer);
app.all("/priests/:id/password-reset", forwardRequestToMainServer);
app.all("/priests/:id/sacramental-events", forwardRequestToMainServer);
app.all("/priests/:id/available-slots", forwardRequestToMainServer);
app.all("/priests/:id/schedule-remarks", forwardRequestToMainServer);
app.all("/priests/:id/schedule-remarks/:remarkID/review", forwardRequestToMainServer);
app.all("/settings/theme", forwardRequestToMainServer);
app.all("/settings/about-page", forwardRequestToMainServer);
app.all("/settings/religious-orders", forwardRequestToMainServer);

const startAdminServer = async () => {
  try {
    await initializeAdminDatabase();
    app.listen(PORT, () => {
      console.log(`Faithflow admin server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start admin server:", error);
    await pool.end();
    process.exit(1);
  }
};

startAdminServer();
if (false) {
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, pool } = require("./db-admin");

const app = express();
const PORT = Number(process.env.ADMIN_SERVER_PORT || 3002);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const PHONE_INPUT_REGEX = /^09\d{9}$/;
const BCRYPT_PREFIX_REGEX = /^\$2[aby]\$\d{2}\$/;
const DEFAULT_SESSION_TTL_HOURS = Number(process.env.ADMIN_SESSION_TTL_HOURS || 24 * 7);

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "15mb" }));

const normalizeBcryptHash = (hashValue) => {
  const hash = String(hashValue || "");
  if (hash.startsWith("$2y$")) {
    return `$2b$${hash.slice(4)}`;
  }
  return hash;
};

const verifyPasswordWithAutoUpgrade = async (plainPassword, storedPassword) => {
  const normalizedStoredPassword = String(storedPassword || "");
  if (!normalizedStoredPassword) {
    return { isValid: false, upgradedHash: null };
  }
  const normalizedHash = normalizeBcryptHash(normalizedStoredPassword);
  if (BCRYPT_PREFIX_REGEX.test(normalizedHash)) {
    const isValid = await bcrypt.compare(plainPassword, normalizedHash);
    return { isValid, upgradedHash: null };
  }
  const isLegacyMatch = plainPassword === normalizedStoredPassword;
  if (!isLegacyMatch) {
    return { isValid: false, upgradedHash: null };
  }
  const upgradedHash = await bcrypt.hash(plainPassword, 10);
  return { isValid: true, upgradedHash };
};

const sanitizeAdmin = (admin) => ({
  adminID: Number(admin.adminID),
  fullName: admin.fullName,
  userName: admin.userName,
  email: admin.email,
  address: admin.address,
  contactNumber: admin.contactNumber,
  parishName: admin.parishName,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
  photo: admin.photo,
});

const getRequestIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);

const getRequestUserAgent = (req) => String(req.headers["user-agent"] || "").trim().slice(0, 512);

const recordLoginAttempt = async (credential, wasSuccessful, req, failureReason = null) => {
  try {
    await query(
      `
        INSERT INTO admin_login_attempts (credential, "wasSuccessful", "failureReason", "ipAddress", "userAgent")
        VALUES ($1, $2, $3, $4, $5)
      `,
      [String(credential || ""), Boolean(wasSuccessful), failureReason, getRequestIp(req) || null, getRequestUserAgent(req) || null],
    );
  } catch (error) {
    console.error("Failed to write login attempt:", error);
  }
};

const recordAuditLog = async (action, req, { targetType = null, targetID = null, metadata = {} } = {}) => {
  try {
    await query(
      `
        INSERT INTO admin_audit_logs ("adminID", action, "targetType", "targetID", metadata, "ipAddress", "userAgent")
        VALUES (1, $1, $2, $3, $4::jsonb, $5, $6)
      `,
      [
        String(action || "unknown_action"),
        targetType ? String(targetType) : null,
        targetID ? String(targetID) : null,
        JSON.stringify(metadata || {}),
        getRequestIp(req) || null,
        getRequestUserAgent(req) || null,
      ],
    );
  } catch (error) {
    console.error("Failed to write admin audit log:", error);
  }
};

const createAdminSession = async (sessionToken, req) => {
  const ttlHours = Number.isFinite(DEFAULT_SESSION_TTL_HOURS) && DEFAULT_SESSION_TTL_HOURS > 0 ? DEFAULT_SESSION_TTL_HOURS : 24 * 7;
  await query(
    `
      INSERT INTO admin_sessions ("adminID", "sessionToken", "ipAddress", "userAgent", "expiresAt", "lastSeenAt")
      VALUES (1, $1, $2, $3, NOW() + ($4::text || ' hours')::interval, NOW())
    `,
    [sessionToken, getRequestIp(req) || null, getRequestUserAgent(req) || null, String(ttlHours)],
  );
};

const initializeAdminDatabase = async () => {
  await query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await query(`
    CREATE TABLE IF NOT EXISTS admin_account (
      "adminID" INT PRIMARY KEY CHECK ("adminID" = 1),
      "userName" VARCHAR(120) NOT NULL UNIQUE,
      email VARCHAR(255) UNIQUE,
      "fullName" VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      "contactNumber" VARCHAR(40),
      "parishName" VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      photo TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      "sessionToken" VARCHAR(128) NOT NULL UNIQUE,
      "ipAddress" VARCHAR(64),
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "revokedAt" TIMESTAMPTZ,
      "lastSeenAt" TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions ("adminID")`);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions ("expiresAt")`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      action VARCHAR(120) NOT NULL,
      "targetType" VARCHAR(120),
      "targetID" VARCHAR(120),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "ipAddress" VARCHAR(64),
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs ("createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id BIGSERIAL PRIMARY KEY,
      credential VARCHAR(255) NOT NULL,
      "wasSuccessful" BOOLEAN NOT NULL,
      "failureReason" VARCHAR(120),
      "ipAddress" VARCHAR(64),
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_created_at ON admin_login_attempts ("createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedByAdminID" INT CHECK ("updatedByAdminID" = 1)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      "adminNotifID" BIGSERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "readAt" TIMESTAMPTZ
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('admin_notifications.adminNotifID'));
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN id TO "adminNotifID";
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'admin_notifID'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN "admin_notifID" TO "adminNotifID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
      RAISE;
    END
    $$;
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications ("createdAt" DESC)`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_unread ON admin_notifications ("adminID", "isRead", "createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_api_keys (
      id BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL DEFAULT 1 CHECK ("adminID" = 1),
      name VARCHAR(120) NOT NULL,
      "keyPrefix" VARCHAR(24) NOT NULL UNIQUE,
      "keyHash" VARCHAR(255) NOT NULL UNIQUE,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "lastUsedAt" TIMESTAMPTZ,
      "revokedAt" TIMESTAMPTZ
    )
  `);

  const seededAdminUserName = String(process.env.ADMIN_USERNAME || "floribeth").trim().toLowerCase();
  const seededAdminPassword = String(process.env.ADMIN_PASSWORD || "flawsome123");
  const seededAdminEmail = String(process.env.ADMIN_EMAIL || "flawsome@faithflow.local").trim().toLowerCase();
  const seededAdminFullName = String(process.env.ADMIN_FULL_NAME || "Flawsome").trim();
  const seededAdminAddress = String(process.env.ADMIN_ADDRESS || "Parish Office").trim();
  const seededAdminContactNumber = String(process.env.ADMIN_CONTACT_NUMBER || "09123456789").trim();
  const seededAdminParishName = String(process.env.ADMIN_PARISH_NAME || "Faithflow Parish").trim();
  const seededAdminPhoto = String(process.env.ADMIN_PHOTO || "").trim() || null;
  const passwordHash = await bcrypt.hash(seededAdminPassword, 10);

  await query(
    `
      INSERT INTO admin_account ("adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT ("adminID") DO UPDATE
      SET "userName" = EXCLUDED."userName",
          email = EXCLUDED.email,
          "fullName" = EXCLUDED."fullName",
          address = EXCLUDED.address,
          "contactNumber" = EXCLUDED."contactNumber",
          "parishName" = EXCLUDED."parishName",
          password = COALESCE(admin_account.password, EXCLUDED.password),
          photo = COALESCE(admin_account.photo, EXCLUDED.photo),
          "updatedAt" = CURRENT_TIMESTAMP
    `,
    [
      seededAdminUserName,
      seededAdminEmail || null,
      seededAdminFullName,
      seededAdminAddress,
      seededAdminContactNumber || null,
      seededAdminParishName || null,
      passwordHash,
      seededAdminPhoto,
    ],
  );
};

app.get("/", (_req, res) => {
  return res.json({ status: "ok", message: "Faithflow admin server is running." });
});

app.get("/health", (_req, res) => {
  return res.json({ status: "ok" });
});

app.post("/login", async (req, res) => {
  try {
    const credential = String(req.body?.userName || req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!credential || !password.trim()) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo, "createdAt", "updatedAt"
        FROM admin_account
        WHERE "adminID" = 1 AND (LOWER("userName") = $1 OR LOWER(COALESCE(email, '')) = $1)
        LIMIT 1
      `,
      [credential],
    );
    if (result.rows.length === 0) {
      await recordLoginAttempt(credential, false, req, "admin_not_found");
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const foundAdmin = result.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(password, foundAdmin.password);
    if (!passwordVerification.isValid) {
      await recordLoginAttempt(credential, false, req, "invalid_password");
      return res.status(401).json({ message: "Invalid username or password." });
    }
    if (passwordVerification.upgradedHash) {
      await query(
        `
          UPDATE admin_account
          SET password = $1, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "adminID" = 1
        `,
        [passwordVerification.upgradedHash],
      );
    }

    const token = crypto.randomBytes(24).toString("hex");
    await createAdminSession(token, req);
    await recordLoginAttempt(credential, true, req);
    await recordAuditLog("admin_login", req, { targetType: "admin_account", targetID: "1" });

    return res.json({
      message: "Login successful.",
      token,
      accountType: "admin",
      user: sanitizeAdmin(foundAdmin),
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Unable to log in right now." });
  }
});

app.get("/admins", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT "adminID", "parishName", address, "fullName", photo
        FROM admin_account
        WHERE "adminID" = 1
      `,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin list error:", error);
    return res.status(500).json({ message: "Unable to fetch admins." });
  }
});

app.get("/profile", async (req, res) => {
  try {
    const accountType = String(req.query?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.query?.accountID);
    if (accountType !== "admin") {
      return res.status(400).json({ message: "A valid account type is required." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", "updatedAt", photo
        FROM admin_account
        WHERE "adminID" = 1
      `,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    return res.json({ accountType: "admin", user: sanitizeAdmin(result.rows[0]) });
  } catch (error) {
    console.error("Admin profile fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch profile." });
  }
});

app.patch("/profile", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    if (accountType !== "admin") {
      return res.status(400).json({ message: "A valid account type is required." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    const payload = req.body || {};
    const allowedFields = ["fullName", "userName", "address", "contactNumber"];
    const hasUnsupportedFields = Object.keys(payload)
      .filter((key) => key !== "accountType" && key !== "accountID")
      .some((key) => !allowedFields.includes(key));
    if (hasUnsupportedFields) {
      return res.status(400).json({ message: "Profile contains unsupported fields." });
    }

    const updates = [];
    const values = [];
    const pushField = (columnName, rawValue) => {
      const value = String(rawValue ?? "").trim();
      if (!value) return;
      updates.push(`"${columnName}" = $${values.length + 1}`);
      values.push(value);
    };

    if (Object.prototype.hasOwnProperty.call(payload, "fullName")) pushField("fullName", payload.fullName);
    if (Object.prototype.hasOwnProperty.call(payload, "userName")) pushField("userName", payload.userName);
    if (Object.prototype.hasOwnProperty.call(payload, "address")) pushField("address", payload.address);
    if (Object.prototype.hasOwnProperty.call(payload, "contactNumber")) {
      const contact = String(payload.contactNumber ?? "").trim();
      if (contact && !PHONE_INPUT_REGEX.test(contact)) {
        return res.status(400).json({ message: "Contact number must be 11 digits and start with 09." });
      }
      pushField("contactNumber", contact);
    }
    if (updates.length === 0) {
      return res.status(400).json({ message: "No profile fields to update." });
    }

    updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    values.push(1);

    const result = await query(
      `
        UPDATE admin_account
        SET ${updates.join(", ")}
        WHERE "adminID" = $${values.length}
        RETURNING "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", "updatedAt", photo
      `,
      values,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    await recordAuditLog("admin_profile_update", req, {
      targetType: "admin_account",
      targetID: "1",
      metadata: { updatedFields: updates.map((item) => item.split("=")[0].trim().replace(/"/g, "")) },
    });

    return res.json({
      message: "Profile updated successfully.",
      accountType: "admin",
      user: sanitizeAdmin(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Username is already taken." });
    }
    console.error("Admin profile update error:", error);
    return res.status(500).json({ message: "Unable to update profile." });
  }
});

const startAdminServer = async () => {
  try {
    await initializeAdminDatabase();
    app.listen(PORT, () => {
      console.log(`Faithflow admin server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start admin server:", error);
    await pool.end();
    process.exit(1);
  }
};

startAdminServer();
/*
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, pool } = require("./db-admin");

const app = express();
const PORT = Number(process.env.ADMIN_SERVER_PORT || 3002);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const PHONE_INPUT_REGEX = /^09\d{9}$/;
const BCRYPT_PREFIX_REGEX = /^\$2[aby]\$\d{2}\$/;
const DEFAULT_SESSION_TTL_HOURS = Number(process.env.ADMIN_SESSION_TTL_HOURS || 24 * 7);

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "15mb" }));

const normalizeBcryptHash = (hashValue) => {
  const hash = String(hashValue || "");
  if (hash.startsWith("$2y$")) {
    return `$2b$${hash.slice(4)}`;
  }
  return hash;
};

const verifyPasswordWithAutoUpgrade = async (plainPassword, storedPassword) => {
  const normalizedStoredPassword = String(storedPassword || "");
  if (!normalizedStoredPassword) {
    return { isValid: false, upgradedHash: null };
  }
  const normalizedHash = normalizeBcryptHash(normalizedStoredPassword);
  if (BCRYPT_PREFIX_REGEX.test(normalizedHash)) {
    const isValid = await bcrypt.compare(plainPassword, normalizedHash);
    return { isValid, upgradedHash: null };
  }
  const isLegacyMatch = plainPassword === normalizedStoredPassword;
  if (!isLegacyMatch) {
    return { isValid: false, upgradedHash: null };
  }
  const upgradedHash = await bcrypt.hash(plainPassword, 10);
  return { isValid: true, upgradedHash };
};

const sanitizeAdmin = (admin) => ({
  adminID: Number(admin.adminID),
  fullName: admin.fullName,
  userName: admin.userName,
  email: admin.email,
  address: admin.address,
  contactNumber: admin.contactNumber,
  parishName: admin.parishName,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
  photo: admin.photo,
});

const getRequestIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);

const getRequestUserAgent = (req) => String(req.headers["user-agent"] || "").trim().slice(0, 512);

const recordLoginAttempt = async (credential, wasSuccessful, req, failureReason = null) => {
  try {
    await query(
      `
        INSERT INTO admin_login_attempts (credential, "wasSuccessful", "failureReason", "ipAddress", "userAgent")
        VALUES ($1, $2, $3, $4, $5)
      `,
      [String(credential || ""), Boolean(wasSuccessful), failureReason, getRequestIp(req) || null, getRequestUserAgent(req) || null],
    );
  } catch (error) {
    console.error("Failed to write login attempt:", error);
  }
};

const recordAuditLog = async (action, req, { targetType = null, targetID = null, metadata = {} } = {}) => {
  try {
    await query(
      `
        INSERT INTO admin_audit_logs ("adminID", action, "targetType", "targetID", metadata, "ipAddress", "userAgent")
        VALUES (1, $1, $2, $3, $4::jsonb, $5, $6)
      `,
      [
        String(action || "unknown_action"),
        targetType ? String(targetType) : null,
        targetID ? String(targetID) : null,
        JSON.stringify(metadata || {}),
        getRequestIp(req) || null,
        getRequestUserAgent(req) || null,
      ],
    );
  } catch (error) {
    console.error("Failed to write admin audit log:", error);
  }
};

const createAdminSession = async (sessionToken, req) => {
  const ttlHours = Number.isFinite(DEFAULT_SESSION_TTL_HOURS) && DEFAULT_SESSION_TTL_HOURS > 0 ? DEFAULT_SESSION_TTL_HOURS : 24 * 7;
  await query(
    `
      INSERT INTO admin_sessions ("adminID", "sessionToken", "ipAddress", "userAgent", "expiresAt", "lastSeenAt")
      VALUES (1, $1, $2, $3, NOW() + ($4::text || ' hours')::interval, NOW())
    `,
    [sessionToken, getRequestIp(req) || null, getRequestUserAgent(req) || null, String(ttlHours)],
  );
};

const initializeAdminDatabase = async () => {
  await query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await query(`
    CREATE TABLE IF NOT EXISTS admin_account (
      "adminID" INT PRIMARY KEY CHECK ("adminID" = 1),
      "userName" VARCHAR(120) NOT NULL UNIQUE,
      email VARCHAR(255) UNIQUE,
      "fullName" VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      "contactNumber" VARCHAR(40),
      "parishName" VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      photo TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      "sessionToken" VARCHAR(128) NOT NULL UNIQUE,
      "ipAddress" VARCHAR(64),
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "revokedAt" TIMESTAMPTZ,
      "lastSeenAt" TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions ("adminID")`);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions ("expiresAt")`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL CHECK ("adminID" = 1),
      action VARCHAR(120) NOT NULL,
      "targetType" VARCHAR(120),
      "targetID" VARCHAR(120),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "ipAddress" VARCHAR(64),
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs ("createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id BIGSERIAL PRIMARY KEY,
      credential VARCHAR(255) NOT NULL,
      "wasSuccessful" BOOLEAN NOT NULL,
      "failureReason" VARCHAR(120),
      "ipAddress" VARCHAR(64),
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_created_at ON admin_login_attempts ("createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedByAdminID" INT CHECK ("updatedByAdminID" = 1)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      "adminNotifID" BIGSERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "readAt" TIMESTAMPTZ
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('admin_notifications.adminNotifID'));
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN id TO "adminNotifID";
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'admin_notifID'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_notifications' AND column_name = 'adminNotifID'
      ) THEN
        ALTER TABLE admin_notifications RENAME COLUMN "admin_notifID" TO "adminNotifID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(hashtext('admin_notifications.adminNotifID'));
      RAISE;
    END
    $$;
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications ("createdAt" DESC)`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_unread ON admin_notifications ("adminID", "isRead", "createdAt" DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_api_keys (
      id BIGSERIAL PRIMARY KEY,
      "adminID" INT NOT NULL DEFAULT 1 CHECK ("adminID" = 1),
      name VARCHAR(120) NOT NULL,
      "keyPrefix" VARCHAR(24) NOT NULL UNIQUE,
      "keyHash" VARCHAR(255) NOT NULL UNIQUE,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "lastUsedAt" TIMESTAMPTZ,
      "revokedAt" TIMESTAMPTZ
    )
  `);

  const seededAdminUserName = String(process.env.ADMIN_USERNAME || "floribeth").trim().toLowerCase();
  const seededAdminPassword = String(process.env.ADMIN_PASSWORD || "flawsome123");
  const seededAdminEmail = String(process.env.ADMIN_EMAIL || "flawsome@faithflow.local").trim().toLowerCase();
  const seededAdminFullName = String(process.env.ADMIN_FULL_NAME || "Flawsome").trim();
  const seededAdminAddress = String(process.env.ADMIN_ADDRESS || "Parish Office").trim();
  const seededAdminContactNumber = String(process.env.ADMIN_CONTACT_NUMBER || "09123456789").trim();
  const seededAdminParishName = String(process.env.ADMIN_PARISH_NAME || "Faithflow Parish").trim();
  const seededAdminPhoto = String(process.env.ADMIN_PHOTO || "").trim() || null;
  const passwordHash = await bcrypt.hash(seededAdminPassword, 10);

  await query(
    `
      INSERT INTO admin_account ("adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT ("adminID") DO UPDATE
      SET "userName" = EXCLUDED."userName",
          email = EXCLUDED.email,
          "fullName" = EXCLUDED."fullName",
          address = EXCLUDED.address,
          "contactNumber" = EXCLUDED."contactNumber",
          "parishName" = EXCLUDED."parishName",
          password = COALESCE(admin_account.password, EXCLUDED.password),
          photo = COALESCE(admin_account.photo, EXCLUDED.photo),
          "updatedAt" = CURRENT_TIMESTAMP
    `,
    [
      seededAdminUserName,
      seededAdminEmail || null,
      seededAdminFullName,
      seededAdminAddress,
      seededAdminContactNumber || null,
      seededAdminParishName || null,
      passwordHash,
      seededAdminPhoto,
    ],
  );
};

app.get("/", (_req, res) => {
  return res.json({ status: "ok", message: "Faithflow admin server is running." });
});

app.get("/health", (_req, res) => {
  return res.json({ status: "ok" });
});

app.post("/login", async (req, res) => {
  try {
    const credential = String(req.body?.userName || req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!credential || !password.trim()) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo, "createdAt", "updatedAt"
        FROM admin_account
        WHERE "adminID" = 1 AND (LOWER("userName") = $1 OR LOWER(COALESCE(email, '')) = $1)
        LIMIT 1
      `,
      [credential],
    );
    if (result.rows.length === 0) {
      await recordLoginAttempt(credential, false, req, "admin_not_found");
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const foundAdmin = result.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(password, foundAdmin.password);
    if (!passwordVerification.isValid) {
      await recordLoginAttempt(credential, false, req, "invalid_password");
      return res.status(401).json({ message: "Invalid username or password." });
    }
    if (passwordVerification.upgradedHash) {
      await query(
        `
          UPDATE admin_account
          SET password = $1, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "adminID" = 1
        `,
        [passwordVerification.upgradedHash],
      );
    }

    const token = crypto.randomBytes(24).toString("hex");
    await createAdminSession(token, req);
    await recordLoginAttempt(credential, true, req);
    await recordAuditLog("admin_login", req, { targetType: "admin_account", targetID: "1" });

    return res.json({
      message: "Login successful.",
      token,
      accountType: "admin",
      user: sanitizeAdmin(foundAdmin),
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Unable to log in right now." });
  }
});

app.get("/admins", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT "adminID", "parishName", address, "fullName", photo
        FROM admin_account
        WHERE "adminID" = 1
      `,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin list error:", error);
    return res.status(500).json({ message: "Unable to fetch admins." });
  }
});

app.get("/profile", async (req, res) => {
  try {
    const accountType = String(req.query?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.query?.accountID);
    if (accountType !== "admin") {
      return res.status(400).json({ message: "A valid account type is required." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", "updatedAt", photo
        FROM admin_account
        WHERE "adminID" = 1
      `,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    return res.json({ accountType: "admin", user: sanitizeAdmin(result.rows[0]) });
  } catch (error) {
    console.error("Admin profile fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch profile." });
  }
});

app.patch("/profile", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    if (accountType !== "admin") {
      return res.status(400).json({ message: "A valid account type is required." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    const payload = req.body || {};
    const allowedFields = ["fullName", "userName", "address", "contactNumber"];
    const hasUnsupportedFields = Object.keys(payload)
      .filter((key) => key !== "accountType" && key !== "accountID")
      .some((key) => !allowedFields.includes(key));
    if (hasUnsupportedFields) {
      return res.status(400).json({ message: "Profile contains unsupported fields." });
    }

    const updates = [];
    const values = [];
    const pushField = (columnName, rawValue) => {
      const value = String(rawValue ?? "").trim();
      if (!value) return;
      updates.push(`"${columnName}" = $${values.length + 1}`);
      values.push(value);
    };

    if (Object.prototype.hasOwnProperty.call(payload, "fullName")) pushField("fullName", payload.fullName);
    if (Object.prototype.hasOwnProperty.call(payload, "userName")) pushField("userName", payload.userName);
    if (Object.prototype.hasOwnProperty.call(payload, "address")) pushField("address", payload.address);
    if (Object.prototype.hasOwnProperty.call(payload, "contactNumber")) {
      const contact = String(payload.contactNumber ?? "").trim();
      if (contact && !PHONE_INPUT_REGEX.test(contact)) {
        return res.status(400).json({ message: "Contact number must be 11 digits and start with 09." });
      }
      pushField("contactNumber", contact);
    }
    if (updates.length === 0) {
      return res.status(400).json({ message: "No profile fields to update." });
    }

    updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    values.push(1);

    const result = await query(
      `
        UPDATE admin_account
        SET ${updates.join(", ")}
        WHERE "adminID" = $${values.length}
        RETURNING "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", "updatedAt", photo
      `,
      values,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    await recordAuditLog("admin_profile_update", req, {
      targetType: "admin_account",
      targetID: "1",
      metadata: { updatedFields: updates.map((item) => item.split("=")[0].trim().replace(/"/g, "")) },
    });

    return res.json({
      message: "Profile updated successfully.",
      accountType: "admin",
      user: sanitizeAdmin(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Username is already taken." });
    }
    console.error("Admin profile update error:", error);
    return res.status(500).json({ message: "Unable to update profile." });
  }
});

const startAdminServer = async () => {
  try {
    await initializeAdminDatabase();
    app.listen(PORT, () => {
      console.log(`Faithflow admin server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start admin server:", error);
    await pool.end();
    process.exit(1);
  }
};

startAdminServer();
* /
}
/*
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, pool } = require("./db-admin");

const app = express();
const PORT = Number(process.env.ADMIN_SERVER_PORT || 3002);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const PHONE_INPUT_REGEX = /^09\d{9}$/;
const sacramentSeeds = ["Baptism", "Marriage", "Funeral Mass", "Blessing"];

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "15mb" }));

const BCRYPT_PREFIX_REGEX = /^\$2[aby]\$\d{2}\$/;

const normalizeBcryptHash = (hashValue) => {
  const hash = String(hashValue || "");
  if (hash.startsWith("$2y$")) {
    return `$2b$${hash.slice(4)}`;
  }
  return hash;
};

const verifyPasswordWithAutoUpgrade = async (plainPassword, storedPassword) => {
  const normalizedStoredPassword = String(storedPassword || "");
  if (!normalizedStoredPassword) {
    return { isValid: false, upgradedHash: null };
  }
  const normalizedHash = normalizeBcryptHash(normalizedStoredPassword);
  if (BCRYPT_PREFIX_REGEX.test(normalizedHash)) {
    const isValid = await bcrypt.compare(plainPassword, normalizedHash);
    return { isValid, upgradedHash: null };
  }
  const isLegacyMatch = plainPassword === normalizedStoredPassword;
  if (!isLegacyMatch) {
    return { isValid: false, upgradedHash: null };
  }
  const upgradedHash = await bcrypt.hash(plainPassword, 10);
  return { isValid: true, upgradedHash };
};

const sanitizeAdmin = (admin) => ({
  adminID: Number(admin.adminID),
  fullName: admin.fullName,
  userName: admin.userName,
  email: admin.email,
  address: admin.address,
  contactNumber: admin.contactNumber,
  parishName: admin.parishName,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
  photo: admin.photo,
});

const initializeAdminInterfaceSchema = async () => {
  await query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      "userID" SERIAL PRIMARY KEY,
      "fullName" VARCHAR(255),
      address VARCHAR(255),
      "contactNumber" VARCHAR(40),
      birthdate DATE,
      gender VARCHAR(30),
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      photo TEXT
    )
  `);
  await query('ALTER TABLE users DROP COLUMN IF EXISTS role');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(30)');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "contactNumber" VARCHAR(40)');
  const usersUserNameColumnResult = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'userName'
    ) AS "exists"
  `);
  const usersEmailColumnResult = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
    ) AS "exists"
  `);
  if (usersUserNameColumnResult.rows[0].exists && !usersEmailColumnResult.rows[0].exists) {
    await query('ALTER TABLE users RENAME COLUMN "userName" TO email');
  } else if (usersUserNameColumnResult.rows[0].exists && usersEmailColumnResult.rows[0].exists) {
    await query(`
      UPDATE users
      SET email = COALESCE(NULLIF(BTRIM(email), ''), "userName")
      WHERE email IS NULL OR BTRIM(COALESCE(email, '')) = ''
    `);
    await query('ALTER TABLE users DROP COLUMN "userName"');
  }
  await query('ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255)');

  await query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      date DATE NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      time TEXT NOT NULL,
      event_date DATE NOT NULL
    )
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
        CREATE TYPE appointment_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_request_type') THEN
        CREATE TYPE appointment_request_type AS ENUM ('Appointment', 'Certificate');
      END IF;
    END
    $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sacraments (
      "sacramentID" SERIAL PRIMARY KEY,
      "sacramentName" VARCHAR(100) NOT NULL UNIQUE
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('sacraments.isArchived'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sacraments'
          AND column_name = 'is_archived'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sacraments'
          AND column_name = 'isArchived'
      ) THEN
        ALTER TABLE sacraments RENAME COLUMN is_archived TO "isArchived";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('sacraments.isArchived'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('sacraments.isArchived'));
        RAISE;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('sacraments.schemaAliases'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sacraments'
          AND column_name = 'schema_aliases'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sacraments'
          AND column_name = 'schemaAliases'
      ) THEN
        ALTER TABLE sacraments RENAME COLUMN schema_aliases TO "schemaAliases";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('sacraments.schemaAliases'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('sacraments.schemaAliases'));
        RAISE;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('sacraments.formSchema'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sacraments'
          AND column_name = 'form_schema'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sacraments'
          AND column_name = 'formSchema'
      ) THEN
        ALTER TABLE sacraments RENAME COLUMN form_schema TO "formSchema";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('sacraments.formSchema'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('sacraments.formSchema'));
        RAISE;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF to_regclass('public.special_sacraments_form_schemas') IS NULL THEN
        NULL;
      ELSE
        PERFORM pg_advisory_lock(hashtext('special_sacraments_form_schemas.formSchema'));
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'special_sacraments_form_schemas'
            AND column_name = 'form_schema'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'special_sacraments_form_schemas'
            AND column_name = 'formSchema'
        ) THEN
          ALTER TABLE special_sacraments_form_schemas RENAME COLUMN form_schema TO "formSchema";
        END IF;
        PERFORM pg_advisory_unlock(hashtext('special_sacraments_form_schemas.formSchema'));
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('special_sacraments_form_schemas.formSchema'));
        RAISE;
    END
    $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS special_sacraments (
      "s_sacramentID" SERIAL PRIMARY KEY,
      "s_sacramentName" VARCHAR(100) NOT NULL,
      "maxSlots" INT NOT NULL,
      "timeDate" TIMESTAMP NOT NULL,
      "currentAppliedCount" INT NOT NULL DEFAULT 0
    )
  `);
  await query('ALTER TABLE special_sacraments ADD COLUMN IF NOT EXISTS "currentAppliedCount" INT NOT NULL DEFAULT 0');
  await query('UPDATE special_sacraments SET "currentAppliedCount" = 0 WHERE "currentAppliedCount" IS NULL');

  await query(`
    CREATE TABLE IF NOT EXISTS priests (
      "priestID" SERIAL PRIMARY KEY,
      "fullName" VARCHAR(255) NOT NULL,
      "adminID" INT NOT NULL
    )
  `);
  await query("ALTER TABLE priests ADD COLUMN IF NOT EXISTS photo TEXT");
  await query('ALTER TABLE special_sacraments ADD COLUMN IF NOT EXISTS "priestID" INT');
  await query('ALTER TABLE special_sacraments ADD COLUMN IF NOT EXISTS "deadline" DATE');
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_special_sacrament_priest') THEN
        ALTER TABLE special_sacraments
        ADD CONSTRAINT fk_special_sacrament_priest
        FOREIGN KEY ("priestID") REFERENCES priests("priestID")
        ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS appointments (
      "appointmentID" SERIAL PRIMARY KEY,
      "userID" INT,
      "sacramentID" INT,
      "s_sacramentID" INT,
      "progressID" INT,
      status appointment_status DEFAULT 'PENDING',
      "adminID" INT NOT NULL,
      "priestID" INT,
      "requesterFullName" VARCHAR(255),
      credentials JSONB,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" TIMESTAMP,
      note TEXT
    )
  `);
  await query('ALTER TABLE appointments ALTER COLUMN "userID" DROP NOT NULL');
  await query('ALTER TABLE appointments ALTER COLUMN "progressID" DROP NOT NULL');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "requesterFullName" VARCHAR(255)');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS credentials JSONB');
  await query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS note TEXT");
  await query('ALTER TABLE appointments ALTER COLUMN "adminID" SET NOT NULL');

  await query(`
    CREATE TABLE IF NOT EXISTS appointment_review_states (
      "appointmentID" INT NOT NULL,
      "adminID" INT NOT NULL,
      "viewedAt" TIMESTAMPTZ,
      "underReviewAt" TIMESTAMPTZ,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("appointmentID", "adminID")
    )
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_appointment_review_states_appointment') THEN
        ALTER TABLE appointment_review_states
        ADD CONSTRAINT fk_appointment_review_states_appointment
        FOREIGN KEY ("appointmentID") REFERENCES appointments("appointmentID")
        ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);
  await query('ALTER TABLE appointment_review_states DROP CONSTRAINT IF EXISTS fk_appointment_review_states_admin');

  await query('DROP TABLE IF EXISTS certificate_requests CASCADE');

  await query(`
    CREATE TABLE IF NOT EXISTS marriage_appointments (
      id SERIAL PRIMARY KEY,
      "appointmentID" INT NOT NULL UNIQUE,
      "brideName" VARCHAR(255) NOT NULL,
      "groomName" VARCHAR(255) NOT NULL,
      "brideAge" INT NOT NULL CHECK ("brideAge" > 0),
      "groomAge" INT NOT NULL CHECK ("groomAge" > 0),
      "bridePhoneNumber" VARCHAR(40) NOT NULL,
      "groomPhoneNumber" VARCHAR(40) NOT NULL,
      "brideBirthCertificateFileUrl" TEXT,
      "brideBirthCertificateFileName" VARCHAR(255),
      "groomBirthCertificateFileUrl" TEXT,
      "groomBirthCertificateFileName" VARCHAR(255),
      address VARCHAR(255) NOT NULL,
      "phoneNumber" VARCHAR(40) NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('ALTER TABLE marriage_appointments ADD COLUMN IF NOT EXISTS "bridePhoneNumber" VARCHAR(40)');
  await query('ALTER TABLE marriage_appointments ADD COLUMN IF NOT EXISTS "groomPhoneNumber" VARCHAR(40)');
  await query('ALTER TABLE marriage_appointments ADD COLUMN IF NOT EXISTS "brideBirthCertificateFileUrl" TEXT');
  await query('ALTER TABLE marriage_appointments ADD COLUMN IF NOT EXISTS "brideBirthCertificateFileName" VARCHAR(255)');
  await query('ALTER TABLE marriage_appointments ADD COLUMN IF NOT EXISTS "groomBirthCertificateFileUrl" TEXT');
  await query('ALTER TABLE marriage_appointments ADD COLUMN IF NOT EXISTS "groomBirthCertificateFileName" VARCHAR(255)');

  await query(`
    CREATE TABLE IF NOT EXISTS baptism_appointments (
      id SERIAL PRIMARY KEY,
      "appointmentID" INT NOT NULL UNIQUE,
      "childFullName" VARCHAR(255) NOT NULL,
      "childBirthDate" DATE NOT NULL,
      "fatherName" VARCHAR(255) NOT NULL,
      "motherName" VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      "phoneNumber" VARCHAR(40) NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS death_mass_appointments (
      id SERIAL PRIMARY KEY,
      "appointmentID" INT NOT NULL UNIQUE,
      "deceasedName" VARCHAR(255) NOT NULL,
      "dateOfDeath" DATE NOT NULL,
      "familyContactName" VARCHAR(255) NOT NULL,
      "relationToDeceased" VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      "phoneNumber" VARCHAR(40) NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS blessing_appointments (
      id SERIAL PRIMARY KEY,
      "appointmentID" INT NOT NULL UNIQUE,
      "blessingType" VARCHAR(120) NOT NULL,
      "blessingTarget" VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      "phoneNumber" VARCHAR(40) NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS progress_tracker (
      "progressID" SERIAL PRIMARY KEY,
      "appointmentID" INT NOT NULL
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('progress_tracker.updatedAt'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'progress_tracker'
          AND column_name = 'updated_at'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'progress_tracker'
          AND column_name = 'updatedAt'
      ) THEN
        ALTER TABLE progress_tracker RENAME COLUMN updated_at TO "updatedAt";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('progress_tracker.updatedAt'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('progress_tracker.updatedAt'));
        RAISE;
    END
    $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS steps (
      "stepID" SERIAL PRIMARY KEY,
      "stepName" VARCHAR(255) NOT NULL,
      "progressID" INT NOT NULL,
      "isDone" BOOLEAN DEFAULT FALSE,
      "stepOrder" INT NOT NULL,
      "completedAt" TIMESTAMP,
      CONSTRAINT unique_step_order_per_progress
        UNIQUE ("progressID", "stepOrder")
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS calendar_entries (
      "calendarID" SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      schedule_type TEXT NOT NULL CHECK (schedule_type IN ('parish_event', 'priest_schedule')),
      event_date DATE NOT NULL,
      start_time TEXT,
      end_time TEXT,
      location TEXT,
      notes TEXT,
      "s_sacramentID" INT,
      "priestID" INT,
      "adminID" INT,
      "appointmentID" INT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('calendar_entries.calendarID'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'calendarID'
      ) THEN
        DROP VIEW IF EXISTS calendar_entries_resolved;
        ALTER TABLE calendar_entries RENAME COLUMN id TO "calendarID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('calendar_entries.calendarID'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('calendar_entries.calendarID'));
        RAISE;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('calendar_entries.createdAt'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'created_at'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'createdAt'
      ) THEN
        DROP VIEW IF EXISTS calendar_entries_resolved;
        ALTER TABLE calendar_entries RENAME COLUMN created_at TO "createdAt";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('calendar_entries.createdAt'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('calendar_entries.createdAt'));
        RAISE;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('calendar_entries.updatedAt'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'updated_at'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'updatedAt'
      ) THEN
        DROP VIEW IF EXISTS calendar_entries_resolved;
        ALTER TABLE calendar_entries RENAME COLUMN updated_at TO "updatedAt";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('calendar_entries.updatedAt'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('calendar_entries.updatedAt'));
        RAISE;
    END
    $$;
  `);
  await query('ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS "s_sacramentID" INT');
  await query('ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS "priestID" INT');
  await query('ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS "adminID" INT');
  await query('ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS "appointmentID" INT');
  await query('UPDATE calendar_entries SET "adminID" = 1 WHERE "adminID" IS NULL');
  await query(`
    UPDATE calendar_entries ce
    SET "appointmentID" = extracted."appointmentID"
    FROM (
      SELECT
        ce2."calendarID",
        COALESCE(
          NULLIF((regexp_match(COALESCE(ce2.notes, ''), '\\[AppointmentID:(\\d+)\\]', 'i'))[1], '')::INT,
          NULLIF((regexp_match(COALESCE(ce2.title, ''), 'appointment\\s*#\\s*(\\d+)', 'i'))[1], '')::INT
        ) AS "appointmentID"
      FROM calendar_entries ce2
      WHERE ce2."appointmentID" IS NULL
    ) extracted
    WHERE ce."calendarID" = extracted."calendarID"
      AND ce."appointmentID" IS NULL
      AND extracted."appointmentID" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM appointments a
        WHERE a."appointmentID" = extracted."appointmentID"
      )
  `);
  await query(`
    UPDATE calendar_entries
    SET notes = NULLIF(TRIM(REGEXP_REPLACE(COALESCE(notes, ''), '\\s*\\[AppointmentID:\\d+\\]', '', 'gi')), '')
    WHERE notes ILIKE '%[AppointmentID:%'
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recurring_day_offs (
      "recurringID" SERIAL PRIMARY KEY,
      weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      "adminID" INT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('recurring_day_offs.recurringID'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recurring_day_offs'
          AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recurring_day_offs'
          AND column_name = 'recurringID'
      ) THEN
        ALTER TABLE recurring_day_offs RENAME COLUMN id TO "recurringID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('recurring_day_offs.recurringID'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('recurring_day_offs.recurringID'));
        RAISE;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('recurring_day_offs.createdAt'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recurring_day_offs'
          AND column_name = 'created_at'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recurring_day_offs'
          AND column_name = 'createdAt'
      ) THEN
        ALTER TABLE recurring_day_offs RENAME COLUMN created_at TO "createdAt";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('recurring_day_offs.createdAt'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('recurring_day_offs.createdAt'));
        RAISE;
    END
    $$;
  `);
  await query('ALTER TABLE recurring_day_offs ADD COLUMN IF NOT EXISTS "adminID" INT');
  await query('ALTER TABLE recurring_day_offs DROP CONSTRAINT IF EXISTS recurring_day_offs_weekday_key');
  await query('DELETE FROM recurring_day_offs WHERE "adminID" IS NULL');
  await query('ALTER TABLE recurring_day_offs ALTER COLUMN "adminID" SET NOT NULL');
  await query('ALTER TABLE recurring_day_offs DROP CONSTRAINT IF EXISTS fk_recurring_day_off_admin');
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS recurring_day_offs_admin_weekday_unique
    ON recurring_day_offs ("adminID", weekday)
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS recurring_day_offs_admin_unique
    ON recurring_day_offs ("adminID")
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS day_off_dates (
      "dayOffID" SERIAL PRIMARY KEY,
      "dayOffDate" DATE NOT NULL,
      "adminID" INT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('day_off_dates.dayOffID'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'day_off_dates'
          AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'day_off_dates'
          AND column_name = 'dayOffID'
      ) THEN
        ALTER TABLE day_off_dates RENAME COLUMN id TO "dayOffID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('day_off_dates.dayOffID'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('day_off_dates.dayOffID'));
        RAISE;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('day_off_dates.dayOffDate'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'day_off_dates'
          AND column_name = 'day_off_date'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'day_off_dates'
          AND column_name = 'dayOffDate'
      ) THEN
        ALTER TABLE day_off_dates RENAME COLUMN day_off_date TO "dayOffDate";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('day_off_dates.dayOffDate'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('day_off_dates.dayOffDate'));
        RAISE;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('day_off_dates.createdAt'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'day_off_dates'
          AND column_name = 'created_at'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'day_off_dates'
          AND column_name = 'createdAt'
      ) THEN
        ALTER TABLE day_off_dates RENAME COLUMN created_at TO "createdAt";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('day_off_dates.createdAt'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('day_off_dates.createdAt'));
        RAISE;
    END
    $$;
  `);
  await query('ALTER TABLE day_off_dates ADD COLUMN IF NOT EXISTS "adminID" INT');
  await query('ALTER TABLE day_off_dates DROP CONSTRAINT IF EXISTS day_off_dates_day_off_date_key');
  await query('DELETE FROM day_off_dates WHERE "adminID" IS NULL');
  await query('ALTER TABLE day_off_dates ALTER COLUMN "adminID" SET NOT NULL');
  await query('ALTER TABLE day_off_dates DROP CONSTRAINT IF EXISTS fk_day_off_date_admin');
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS day_off_dates_admin_date_unique
    ON day_off_dates ("adminID", "dayOffDate")
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user') THEN
        ALTER TABLE appointments
        ADD CONSTRAINT fk_user
        FOREIGN KEY ("userID") REFERENCES users("userID");
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sacrament') THEN
        ALTER TABLE appointments
        ADD CONSTRAINT fk_sacrament
        FOREIGN KEY ("sacramentID") REFERENCES sacraments("sacramentID");
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_special_sacrament') THEN
        ALTER TABLE appointments
        ADD CONSTRAINT fk_special_sacrament
        FOREIGN KEY ("s_sacramentID") REFERENCES special_sacraments("s_sacramentID");
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_priest') THEN
        ALTER TABLE appointments
        ADD CONSTRAINT fk_priest
        FOREIGN KEY ("priestID") REFERENCES priests("priestID");
      END IF;
    END
    $$;
  `);
  await query('ALTER TABLE appointments DROP CONSTRAINT IF EXISTS fk_admin');

  await query('ALTER TABLE progress_tracker DROP CONSTRAINT IF EXISTS fk_progress_appointment');
  await query(`
    ALTER TABLE progress_tracker
    ADD CONSTRAINT fk_progress_appointment
    FOREIGN KEY ("appointmentID") REFERENCES appointments("appointmentID")
    ON DELETE CASCADE
    NOT VALID
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_step_progress') THEN
        ALTER TABLE steps
        ADD CONSTRAINT fk_step_progress
        FOREIGN KEY ("progressID") REFERENCES progress_tracker("progressID")
        ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_marriage_appointments_appointment') THEN
        ALTER TABLE marriage_appointments
        ADD CONSTRAINT fk_marriage_appointments_appointment
        FOREIGN KEY ("appointmentID") REFERENCES appointments("appointmentID")
        ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_baptism_appointments_appointment') THEN
        ALTER TABLE baptism_appointments
        ADD CONSTRAINT fk_baptism_appointments_appointment
        FOREIGN KEY ("appointmentID") REFERENCES appointments("appointmentID")
        ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_death_mass_appointments_appointment') THEN
        ALTER TABLE death_mass_appointments
        ADD CONSTRAINT fk_death_mass_appointments_appointment
        FOREIGN KEY ("appointmentID") REFERENCES appointments("appointmentID")
        ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_blessing_appointments_appointment') THEN
        ALTER TABLE blessing_appointments
        ADD CONSTRAINT fk_blessing_appointments_appointment
        FOREIGN KEY ("appointmentID") REFERENCES appointments("appointmentID")
        ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_entry_special_sacrament') THEN
        ALTER TABLE calendar_entries
        ADD CONSTRAINT fk_calendar_entry_special_sacrament
        FOREIGN KEY ("s_sacramentID") REFERENCES special_sacraments("s_sacramentID")
        ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_entry_priest') THEN
        ALTER TABLE calendar_entries
        ADD CONSTRAINT fk_calendar_entry_priest
        FOREIGN KEY ("priestID") REFERENCES priests("priestID")
        ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_entry_appointment') THEN
        ALTER TABLE calendar_entries
        ADD CONSTRAINT fk_calendar_entry_appointment
        FOREIGN KEY ("appointmentID") REFERENCES appointments("appointmentID")
        ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);
  await query('ALTER TABLE calendar_entries DROP CONSTRAINT IF EXISTS fk_calendar_entry_admin');

  const sacramentCountResult = await query('SELECT COUNT(*)::INT AS "count" FROM sacraments');
  if (sacramentCountResult.rows[0].count === 0) {
    for (const sacramentName of sacramentSeeds) {
      await query('INSERT INTO sacraments ("sacramentName") VALUES ($1)', [sacramentName]);
    }
  }
};

const initializeAdminDatabase = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_account (
      "adminID" INT PRIMARY KEY CHECK ("adminID" = 1),
      "userName" VARCHAR(120) NOT NULL UNIQUE,
      email VARCHAR(255) UNIQUE,
      "fullName" VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      "contactNumber" VARCHAR(40),
      "parishName" VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      photo TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const seededAdminUserName = String(process.env.ADMIN_USERNAME || "flawsome")
    .trim()
    .toLowerCase();
  const seededAdminPassword = String(process.env.ADMIN_PASSWORD || "flawsome123");
  const seededAdminEmail = String(process.env.ADMIN_EMAIL || "flawsome@faithflow.local")
    .trim()
    .toLowerCase();
  const seededAdminFullName = String(process.env.ADMIN_FULL_NAME || "Flawsome").trim();
  const seededAdminAddress = String(process.env.ADMIN_ADDRESS || "Parish Office").trim();
  const seededAdminContactNumber = String(process.env.ADMIN_CONTACT_NUMBER || "09123456789").trim();
  const seededAdminParishName = String(process.env.ADMIN_PARISH_NAME || "Faithflow Parish").trim();
  const seededAdminPhoto = String(process.env.ADMIN_PHOTO || "").trim() || null;

  const passwordHash = await bcrypt.hash(seededAdminPassword, 10);
  await query(
    `
      INSERT INTO admin_account ("adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT ("adminID") DO UPDATE
      SET "userName" = EXCLUDED."userName",
          email = EXCLUDED.email,
          "fullName" = EXCLUDED."fullName",
          address = EXCLUDED.address,
          "contactNumber" = EXCLUDED."contactNumber",
          "parishName" = EXCLUDED."parishName",
          password = COALESCE(admin_account.password, EXCLUDED.password),
          photo = COALESCE(admin_account.photo, EXCLUDED.photo),
          "updatedAt" = CURRENT_TIMESTAMP
    `,
    [
      seededAdminUserName,
      seededAdminEmail || null,
      seededAdminFullName,
      seededAdminAddress,
      seededAdminContactNumber || null,
      seededAdminParishName || null,
      passwordHash,
      seededAdminPhoto,
    ],
  );

  await initializeAdminInterfaceSchema();
};

app.get("/", (_req, res) => {
  return res.json({ status: "ok", message: "Faithflow admin server is running." });
});

app.get("/health", (_req, res) => {
  return res.json({ status: "ok" });
});

app.post("/login", async (req, res) => {
  try {
    const credential = String(req.body?.userName || req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!credential || !password.trim()) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", password, photo, "createdAt", "updatedAt"
        FROM admin_account
        WHERE "adminID" = 1 AND (LOWER("userName") = $1 OR LOWER(COALESCE(email, '')) = $1)
        LIMIT 1
      `,
      [credential],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid username or password." });
    }
    const foundAdmin = result.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(password, foundAdmin.password);
    if (!passwordVerification.isValid) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    if (passwordVerification.upgradedHash) {
      await query(
        `
          UPDATE admin_account
          SET password = $1, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "adminID" = 1
        `,
        [passwordVerification.upgradedHash],
      );
    }

    return res.json({
      message: "Login successful.",
      token: crypto.randomBytes(24).toString("hex"),
      accountType: "admin",
      user: sanitizeAdmin(foundAdmin),
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Unable to log in right now." });
  }
});

app.get("/admins", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT "adminID", "parishName", address, "fullName", photo
        FROM admin_account
        WHERE "adminID" = 1
      `,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin list error:", error);
    return res.status(500).json({ message: "Unable to fetch admins." });
  }
});

app.get("/profile", async (req, res) => {
  try {
    const accountType = String(req.query?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.query?.accountID);
    if (accountType !== "admin") {
      return res.status(400).json({ message: "A valid account type is required." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    const result = await query(
      `
        SELECT "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", "updatedAt", photo
        FROM admin_account
        WHERE "adminID" = 1
      `,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    return res.json({ accountType: "admin", user: sanitizeAdmin(result.rows[0]) });
  } catch (error) {
    console.error("Admin profile fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch profile." });
  }
});

app.patch("/profile", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "").trim().toLowerCase();
    const accountID = Number(req.body?.accountID);
    if (accountType !== "admin") {
      return res.status(400).json({ message: "A valid account type is required." });
    }
    if (!Number.isInteger(accountID) || accountID !== 1) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    const payload = req.body || {};
    const allowedFields = ["fullName", "userName", "address", "contactNumber"];
    const hasUnsupportedFields = Object.keys(payload)
      .filter((key) => key !== "accountType" && key !== "accountID")
      .some((key) => !allowedFields.includes(key));
    if (hasUnsupportedFields) {
      return res.status(400).json({ message: "Profile contains unsupported fields." });
    }

    const updates = [];
    const values = [];
    const pushField = (columnName, rawValue) => {
      const value = String(rawValue ?? "").trim();
      if (!value) return;
      updates.push(`"${columnName}" = $${values.length + 1}`);
      values.push(value);
    };
    if (Object.prototype.hasOwnProperty.call(payload, "fullName")) pushField("fullName", payload.fullName);
    if (Object.prototype.hasOwnProperty.call(payload, "userName")) pushField("userName", payload.userName);
    if (Object.prototype.hasOwnProperty.call(payload, "address")) pushField("address", payload.address);
    if (Object.prototype.hasOwnProperty.call(payload, "contactNumber")) {
      const contact = String(payload.contactNumber ?? "").trim();
      if (contact && !PHONE_INPUT_REGEX.test(contact)) {
        return res.status(400).json({ message: "Contact number must be 11 digits and start with 09." });
      }
      pushField("contactNumber", contact);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No profile fields to update." });
    }
    updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    values.push(1);

    const result = await query(
      `
        UPDATE admin_account
        SET ${updates.join(", ")}
        WHERE "adminID" = $${values.length}
        RETURNING "adminID", "userName", email, "fullName", address, "contactNumber", "parishName", "createdAt", "updatedAt", photo
      `,
      values,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found." });
    }
    return res.json({
      message: "Profile updated successfully.",
      accountType: "admin",
      user: sanitizeAdmin(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Username is already taken." });
    }
    console.error("Admin profile update error:", error);
    return res.status(500).json({ message: "Unable to update profile." });
  }
});

const startAdminServer = async () => {
  try {
    await initializeAdminDatabase();
    app.listen(PORT, () => {
      console.log(`Faithflow admin server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start admin server:", error);
    await pool.end();
    process.exit(1);
  }
};

startAdminServer();
*/
