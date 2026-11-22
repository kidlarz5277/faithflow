const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { query, pool } = require("./db");
const { query: adminQuery } = require("./db-admin");

const sqlPersonFullName = (alias = "") => {
  const column = (name) => (alias ? `${alias}."${name}"` : `"${name}"`);
  return `BTRIM(CONCAT_WS(' ', NULLIF(BTRIM(${column("firstName")}), ''), NULLIF(BTRIM(${column("lastName")}), '')))`;
};
const app = express();
const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const ADMIN_SERVICE_BASE_URL = String(process.env.ADMIN_SERVICE_BASE_URL || "http://localhost:3002").replace(/\/+$/, "");
const WLDEH_BIBLE_API_BASE_URL = String(
  process.env.WLDEH_BIBLE_API_BASE_URL || "https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles",
).replace(/\/+$/, "");
const WLDEH_BIBLE_VERSION = String(process.env.WLDEH_BIBLE_VERSION || "en-kjv").trim() || "en-kjv";
const SMS_LAMBDA_URL = String(
  process.env.SMS_LAMBDA_URL ||
    "https://swse26cb3mk34w6a6anslpwpsu0kwwgx.lambda-url.ap-southeast-1.on.aws/",
).trim();
const backendEnvPath = path.join(__dirname, ".env");
const VERSE_OF_DAY_POOL = [
  { book: "genesis", chapter: 1, verse: 1, reference: "Genesis 1:1" },
  { book: "psalms", chapter: 23, verse: 1, reference: "Psalm 23:1" },
  { book: "psalms", chapter: 46, verse: 1, reference: "Psalm 46:1" },
  { book: "proverbs", chapter: 3, verse: 5, reference: "Proverbs 3:5" },
  { book: "isaiah", chapter: 41, verse: 10, reference: "Isaiah 41:10" },
  { book: "jeremiah", chapter: 29, verse: 11, reference: "Jeremiah 29:11" },
  { book: "matthew", chapter: 5, verse: 9, reference: "Matthew 5:9" },
  { book: "matthew", chapter: 11, verse: 28, reference: "Matthew 11:28" },
  { book: "matthew", chapter: 28, verse: 20, reference: "Matthew 28:20" },
  { book: "luke", chapter: 1, verse: 37, reference: "Luke 1:37" },
  { book: "john", chapter: 3, verse: 16, reference: "John 3:16" },
  { book: "john", chapter: 14, verse: 6, reference: "John 14:6" },
  { book: "romans", chapter: 8, verse: 28, reference: "Romans 8:28" },
  { book: "romans", chapter: 12, verse: 12, reference: "Romans 12:12" },
  { book: "1corinthians", chapter: 13, verse: 4, reference: "1 Corinthians 13:4" },
  { book: "2corinthians", chapter: 5, verse: 7, reference: "2 Corinthians 5:7" },
  { book: "galatians", chapter: 5, verse: 22, reference: "Galatians 5:22" },
  { book: "philippians", chapter: 4, verse: 13, reference: "Philippians 4:13" },
  { book: "hebrews", chapter: 11, verse: 1, reference: "Hebrews 11:1" },
  { book: "1peter", chapter: 5, verse: 7, reference: "1 Peter 5:7" },
];
let cachedVerseOfDay = null;
const userPhotoUploadsDirectory = path.join(__dirname, "uploads", "user-photos");
const userPhotoPublicBasePath = "/uploads/user-photos/";
const priestPhotoUploadsDirectory = path.join(__dirname, "uploads", "priest-photos");
const priestPhotoPublicBasePath = "/uploads/priest-photos/";
const parishActivityUploadsDirectory = path.join(__dirname, "uploads", "parish-activities");
const parishActivityPublicBasePath = "/uploads/parish-activities/";
const marriageBirthCertDirectory = path.join(__dirname, "uploads", "Appointments", "Marriage", "birthCert");
const marriageBirthCertPublicBasePath = "/uploads/Appointments/Marriage/birthCert";
const appointmentUploadsRoot = path.join(__dirname, "uploads", "Appointments");
const appointmentIncomingDirectory = path.join(appointmentUploadsRoot, "_incoming");
const progressPaymentUploadsDirectory = path.join(__dirname, "uploads", "progress-payments");
const progressPaymentPublicBasePath = "/uploads/progress-payments";
const legacyUsersFilePath = path.join(__dirname, "data", "users.json");
const GLOBAL_THEME_SETTINGS_KEY = "global_theme_settings_v1";
const ABOUT_PAGE_SETTINGS_KEY = "about_page_content_v1";
const DEFAULT_ABOUT_PAGE_CONTENT = {
  parishName: "Our Lady of Guadalupe Parish - Villanueva",
  parishTagline: "A parish service platform designed for easier requests, clearer schedules, and faster updates.",
  sacramentalOffers: ["Marriage", "Christening", "Funeral Mass", "Blessing"],
  certificateOffers: ["Baptismal Certificate", "Marriage Certificate"],
  missionTitle: "Our Lady of Guadalupe Parish Villanueva Mission",
  missionBody:
    "Guided by the love of Jesus and the maternal care of Our Lady of Guadalupe, We commit ourselves to building a vibrant and welcoming parish community where every baptized person feels valued and included.\n\nWe nurture our faith through active participation in the sacraments, ongoing catechesis, and the strengthening of Basic Ecclesial Communities that foster prayer, communion, and shared responsibility in the life and mission of the Church.\n\nWe promote the formation of families as the domestic church, recognizing their vital role in nurturing faith, values, and Christian life in the community.\n\nWe prioritize the formation and accompaniment of the youth, empowering them to become active disciples and leaders in the Church and society.\n\nRooted in faith and inspired to serve, we seek to respond with humility and compassion to the social challenges affecting our community, faithfully living out and proclaiming the message of the Gospel.",
  visionTitle: "Our Lady of Guadalupe Parish Villanueva Vision",
  visionBody:
    "Our Lady of Guadalupe Parish of Villanueva is a strengthened community of faithful who deeply appreciate the sacraments, where every baptized person feels a true sense of belongingness.\n\nCentered on the love of Jesus, united in prayer, devoted to humble and compassionate service, and persevering in carrying out the message of the Gospel.",
  brandTitle: "FaithFlow",
  brandBody:
    "FaithFlow is an online parish service management system developed for Our Lady of Guadalupe Parish - Villanueva. It provides a convenient digital platform where parishioners can request sacramental services such as Christening Mass, Marriage, Funeral Mass, and Blessings, as well as submit certificate requests including Baptismal and Marriage Certificates.\n\nBy moving these services into one system, FaithFlow helps make the process faster, more organized, and easier to track for both parishioners and parish staff. It improves request handling, reduces manual paperwork, and supports more efficient schedule and record management.",
};
const DEFAULT_GLOBAL_THEME_SETTINGS = {
  appTheme: "system",
  colorPreset: "maroon-white",
  primaryColor: "#6D1022",
  secondaryColor: "#FFFFFF",
  thirdColor: "#9C2B3E",
  backgroundColor: "#F8F5F4",
  containerColor: "#FFFFFF",
  backgroundStyle: "solid",
  designStyle: "classic",
};
const ALLOWED_APP_THEMES = new Set(["system", "light", "dark"]);
const ALLOWED_BACKGROUND_STYLES = new Set(["solid", "gradient", "soft-pattern"]);
const ALLOWED_DESIGN_STYLES = new Set(["classic", "modern", "soft"]);
const ALLOWED_COLOR_PRESETS = new Set([
  "maroon-white",
  "green-yellow",
  "navy-gold",
  "teal-sand",
  "plum-rose",
  "charcoal-champagne",
  "amethyst-candlelight",
  "sapphire-pearl",
  "mahogany-cream",
  "naruto-ember",
  "custom",
]);

app.use(cors({ origin: CLIENT_ORIGIN }));

// In production only this server's port is public, so requests for the admin
// server arrive here as /admin-api/* and are streamed to it unchanged (bodies
// included, so file uploads work). Mounted before express.json() on purpose.
// In local dev the Vite proxy sends /admin-api straight to port 3002 instead.
app.use("/admin-api", (req, res) => {
  const target = new URL(req.url, `${ADMIN_SERVICE_BASE_URL}/`);
  const transport = target.protocol === "https:" ? require("https") : require("http");
  const proxyReq = transport.request(
    target,
    { method: req.method, headers: { ...req.headers, host: target.host } },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (error) => {
    console.error("Admin service proxy error:", error.message);
    if (!res.headersSent) res.status(502).json({ message: "Admin service is unavailable." });
    else res.end();
  });
  req.pipe(proxyReq);
});

app.use(express.json({ limit: "15mb" }));
app.use((error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      message: "The parish activity images are too large. Please use smaller photos (under 3MB each).",
    });
  }
  return next(error);
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const stripHtmlTags = (value) => String(value || "").replace(/<[^>]*>/g, " ");
const isValidHexColor = (value) => /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
const MAROON_PRESET_DISALLOWED_SECONDARY_COLORS = new Set(["#d4af37", "#c5a424", "#c7a33a", "#e1c775", "#b88974"]);

const LEGACY_MAROON_PRESET_PRIMARY_COLORS = new Set(["#6e1423"]);

const normalizeMaroonPresetThemeSettings = (themeSettingsInput = {}) => {
  const colorPreset = String(themeSettingsInput?.colorPreset || "").trim().toLowerCase();
  if (colorPreset !== "maroon-white") return themeSettingsInput;
  if (LEGACY_MAROON_PRESET_PRIMARY_COLORS.has(String(themeSettingsInput?.primaryColor || "").trim().toLowerCase())) {
    return {
      ...themeSettingsInput,
      primaryColor: DEFAULT_GLOBAL_THEME_SETTINGS.primaryColor,
      secondaryColor: DEFAULT_GLOBAL_THEME_SETTINGS.secondaryColor,
      thirdColor: DEFAULT_GLOBAL_THEME_SETTINGS.thirdColor,
      backgroundColor: DEFAULT_GLOBAL_THEME_SETTINGS.backgroundColor,
      containerColor: DEFAULT_GLOBAL_THEME_SETTINGS.containerColor,
    };
  }
  const secondaryColor = String(themeSettingsInput?.secondaryColor || "").trim().toLowerCase();
  if (!MAROON_PRESET_DISALLOWED_SECONDARY_COLORS.has(secondaryColor)) return themeSettingsInput;
  return {
    ...themeSettingsInput,
    secondaryColor: DEFAULT_GLOBAL_THEME_SETTINGS.secondaryColor,
  };
};

const WHITE_SECONDARY_PRESET_COLORS = {
  "green-yellow": { legacySecondaryColor: "#e6d5a8", primaryColor: "#163D2E", thirdColor: "#B89B5E", backgroundColor: "#F5F5F1" },
  "navy-gold": { legacySecondaryColor: "#c6a15b", primaryColor: "#12263A", thirdColor: "#B8924A", backgroundColor: "#F4F5F7" },
  "teal-sand": { legacySecondaryColor: "#e3d3b8", primaryColor: "#0F4240", thirdColor: "#A68A64", backgroundColor: "#F3F6F5" },
  "plum-rose": { legacySecondaryColor: "#e7d6d0", primaryColor: "#4A1730", thirdColor: "#B78A86", backgroundColor: "#F8F4F5" },
  "charcoal-champagne": { legacySecondaryColor: "#d7c4a3", primaryColor: "#1F1D1B", thirdColor: "#A8916A", backgroundColor: "#F5F4F2" },
  "amethyst-candlelight": { legacySecondaryColor: "#f3e2b5", primaryColor: "#2E1B4A", thirdColor: "#B8954F", backgroundColor: "#F6F4F8" },
  "mahogany-cream": { legacySecondaryColor: "#f3e6d4", primaryColor: "#3E2216", thirdColor: "#B87A45", backgroundColor: "#F7F3EF" },
};

const normalizeWhiteSecondaryPresetThemeSettings = (themeSettingsInput = {}) => {
  const colorPreset = String(themeSettingsInput?.colorPreset || "").trim().toLowerCase();
  const presetColors = WHITE_SECONDARY_PRESET_COLORS[colorPreset];
  if (!presetColors) return themeSettingsInput;
  const secondaryColor = String(themeSettingsInput?.secondaryColor || "").trim().toLowerCase();
  if (secondaryColor !== presetColors.legacySecondaryColor) return themeSettingsInput;
  return {
    ...themeSettingsInput,
    primaryColor: presetColors.primaryColor,
    secondaryColor: "#FFFFFF",
    thirdColor: presetColors.thirdColor,
    backgroundColor: presetColors.backgroundColor,
    containerColor: "#FFFFFF",
  };
};

const sanitizeThemeSettingsPayload = (themeSettingsInput = {}) => {
  const normalizedTheme = normalizeWhiteSecondaryPresetThemeSettings(
    normalizeMaroonPresetThemeSettings(themeSettingsInput)
  );
  return {
  appTheme: ALLOWED_APP_THEMES.has(String(normalizedTheme.appTheme))
    ? String(normalizedTheme.appTheme)
    : DEFAULT_GLOBAL_THEME_SETTINGS.appTheme,
  colorPreset: ALLOWED_COLOR_PRESETS.has(String(normalizedTheme.colorPreset))
    ? String(normalizedTheme.colorPreset)
    : DEFAULT_GLOBAL_THEME_SETTINGS.colorPreset,
  primaryColor: isValidHexColor(normalizedTheme.primaryColor)
    ? String(normalizedTheme.primaryColor).trim()
    : DEFAULT_GLOBAL_THEME_SETTINGS.primaryColor,
  secondaryColor: isValidHexColor(normalizedTheme.secondaryColor)
    ? String(normalizedTheme.secondaryColor).trim()
    : DEFAULT_GLOBAL_THEME_SETTINGS.secondaryColor,
  thirdColor: isValidHexColor(normalizedTheme.thirdColor)
    ? String(normalizedTheme.thirdColor).trim()
    : DEFAULT_GLOBAL_THEME_SETTINGS.thirdColor,
  backgroundColor: isValidHexColor(normalizedTheme.backgroundColor)
    ? String(normalizedTheme.backgroundColor).trim()
    : DEFAULT_GLOBAL_THEME_SETTINGS.backgroundColor,
  containerColor: isValidHexColor(normalizedTheme.containerColor)
    ? String(normalizedTheme.containerColor).trim()
    : DEFAULT_GLOBAL_THEME_SETTINGS.containerColor,
  backgroundStyle: ALLOWED_BACKGROUND_STYLES.has(String(normalizedTheme.backgroundStyle))
    ? String(normalizedTheme.backgroundStyle)
    : DEFAULT_GLOBAL_THEME_SETTINGS.backgroundStyle,
  designStyle: ALLOWED_DESIGN_STYLES.has(String(normalizedTheme.designStyle))
    ? String(normalizedTheme.designStyle)
    : DEFAULT_GLOBAL_THEME_SETTINGS.designStyle,
  };
};

const ensureAppSettingsTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(150) PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
};

const getGlobalThemeSettings = async () => {
  await ensureAppSettingsTable();
  const settingResult = await query(
    `
      SELECT value
      FROM app_settings
      WHERE key = $1
      LIMIT 1
    `,
    [GLOBAL_THEME_SETTINGS_KEY],
  );
  return sanitizeThemeSettingsPayload(settingResult.rows[0]?.value || DEFAULT_GLOBAL_THEME_SETTINGS);
};

const persistGlobalThemeSettings = async (themeSettingsInput) => {
  await ensureAppSettingsTable();
  const sanitizedThemeSettings = sanitizeThemeSettingsPayload(themeSettingsInput);
  const persistedValue = {
    ...sanitizedThemeSettings,
    modalTheme: buildModalThemeContract(sanitizedThemeSettings),
  };
  await query(
    `
      INSERT INTO app_settings (key, value)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
    `,
    [GLOBAL_THEME_SETTINGS_KEY, JSON.stringify(persistedValue)],
  );
  return sanitizedThemeSettings;
};

const clampAboutText = (value, fallback, maxLength) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
};

const sanitizeAboutOfferList = (value, fallback) => {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\n|,/)
        .map((item) => item.trim());
  const cleaned = source
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((item) => item.slice(0, 80));
  return cleaned.length > 0 ? cleaned : [...fallback];
};

const sanitizeHeroBackgroundImage = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("data:image/") && text.length < 8000000) return text;
  if (text.startsWith("/uploads/") || text.startsWith("/api/") || /^https?:\/\//i.test(text)) return text.slice(0, 500);
  return "";
};

const sanitizeAboutPageContent = (value = {}) => ({
  parishName: clampAboutText(value.parishName, DEFAULT_ABOUT_PAGE_CONTENT.parishName, 180),
  parishTagline: clampAboutText(value.parishTagline, DEFAULT_ABOUT_PAGE_CONTENT.parishTagline, 400),
  sacramentalOffers: sanitizeAboutOfferList(value.sacramentalOffers, DEFAULT_ABOUT_PAGE_CONTENT.sacramentalOffers),
  certificateOffers: sanitizeAboutOfferList(value.certificateOffers, DEFAULT_ABOUT_PAGE_CONTENT.certificateOffers),
  missionTitle: clampAboutText(value.missionTitle, DEFAULT_ABOUT_PAGE_CONTENT.missionTitle, 180),
  missionBody: clampAboutText(value.missionBody, DEFAULT_ABOUT_PAGE_CONTENT.missionBody, 6000),
  visionTitle: clampAboutText(value.visionTitle, DEFAULT_ABOUT_PAGE_CONTENT.visionTitle, 180),
  visionBody: clampAboutText(value.visionBody, DEFAULT_ABOUT_PAGE_CONTENT.visionBody, 6000),
  brandTitle: clampAboutText(value.brandTitle, DEFAULT_ABOUT_PAGE_CONTENT.brandTitle, 180),
  brandBody: clampAboutText(value.brandBody, DEFAULT_ABOUT_PAGE_CONTENT.brandBody, 6000),
  heroBackgroundImage: sanitizeHeroBackgroundImage(value.heroBackgroundImage),
});

const ABOUT_COLUMN_FIELDS = ["missionTitle", "missionBody", "visionTitle", "visionBody"];

const pickAboutColumnContent = (value = {}) => {
  const sanitized = sanitizeAboutPageContent(value);
  return ABOUT_COLUMN_FIELDS.reduce((about, field) => {
    about[field] = sanitized[field];
    return about;
  }, {});
};

const getFixedLandingPageContent = async () => {
  await ensureAppSettingsTable();
  const settingResult = await query(
    `
      SELECT value
      FROM app_settings
      WHERE key = $1
      LIMIT 1
    `,
    [ABOUT_PAGE_SETTINGS_KEY],
  );
  return sanitizeAboutPageContent(settingResult.rows[0]?.value || DEFAULT_ABOUT_PAGE_CONTENT);
};

const mergeAboutColumnContent = (fixedContent, about) => {
  if (!about || typeof about !== "object" || Array.isArray(about)) return fixedContent;
  const next = { ...fixedContent };
  ABOUT_COLUMN_FIELDS.forEach((field) => {
    if (about[field] != null && String(about[field]).trim()) next[field] = about[field];
  });
  return sanitizeAboutPageContent(next);
};

const applyAdminParishName = async (content) => {
  const remote = await forwardJsonRequestToAdminService("/profile?accountType=admin&accountID=1");
  const parishName = String(remote.payload?.user?.parishName || "").trim();
  if (!remote.ok || !parishName) return content;
  return { ...content, parishName };
};

const applySacramentOffers = async (content) => {
  const result = await query(
    `
      SELECT "sacramentName"
      FROM sacraments
      WHERE COALESCE("isArchived", FALSE) = FALSE
      ORDER BY "sacramentID" ASC
    `,
  );
  const sacramentalOffers = result.rows
    .map((row) => String(row.sacramentName || "").trim())
    .filter(Boolean);
  if (sacramentalOffers.length === 0) return content;
  return { ...content, sacramentalOffers };
};

const applyCertificateOffers = async (content) => {
  const result = await query(
    `
      SELECT "certTypeName"
      FROM certificate_type
      WHERE COALESCE("isArchived", FALSE) = FALSE
        AND NULLIF(BTRIM(COALESCE("certTypeName", '')), '') IS NOT NULL
      ORDER BY "certificateTypeID" ASC
    `,
  );
  const certificateOffers = result.rows.map((row) => String(row.certTypeName || "").trim()).filter(Boolean);
  if (certificateOffers.length === 0) return content;
  return { ...content, certificateOffers };
};

const finalizeAboutPageContent = async (content) =>
  applyCertificateOffers(await applySacramentOffers(content));

const getAboutPageContent = async () => {
  const fixedContent = await getFixedLandingPageContent();
  const remote = await forwardJsonRequestToAdminService("/about");
  if (!remote.ok) return finalizeAboutPageContent(fixedContent);
  const about = remote.payload?.about;
  if (!about) {
    await forwardJsonRequestToAdminService("/about", {
      method: "PUT",
      body: { about: pickAboutColumnContent(fixedContent) },
    });
    return finalizeAboutPageContent(fixedContent);
  }
  const hasExtraFields = Object.keys(about).some((key) => !ABOUT_COLUMN_FIELDS.includes(key));
  if (hasExtraFields) {
    const trimmed = pickAboutColumnContent(mergeAboutColumnContent(fixedContent, about));
    await forwardJsonRequestToAdminService("/about", {
      method: "PUT",
      body: { about: trimmed },
    });
    return finalizeAboutPageContent(mergeAboutColumnContent(fixedContent, trimmed));
  }
  return finalizeAboutPageContent(mergeAboutColumnContent(fixedContent, about));
};

const persistAboutPageContent = async (aboutPageInput) => {
  await ensureAppSettingsTable();
  const sanitizedContent = sanitizeAboutPageContent(aboutPageInput);
  await query(
    `
      INSERT INTO app_settings (key, value)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
    `,
    [ABOUT_PAGE_SETTINGS_KEY, JSON.stringify(sanitizedContent)],
  );
  const fixedContent = sanitizedContent;
  const about = pickAboutColumnContent(sanitizedContent);
  const remote = await forwardJsonRequestToAdminService("/about", {
    method: "PUT",
    body: { about },
  });
  if (!remote.ok) {
    throw new Error(remote.payload?.message || "Unable to save landing page content.");
  }
  return finalizeAboutPageContent(mergeAboutColumnContent(fixedContent, remote.payload?.about || about));
};

const buildModalThemeContract = (themeSettingsInput = {}) => {
  const themeSettings = sanitizeThemeSettingsPayload(themeSettingsInput);
  return {
    usesGlobalTheme: true,
    headerColor: themeSettings.primaryColor,
    headerAccentColor: themeSettings.thirdColor,
    buttonColor: themeSettings.primaryColor,
    surfaceColor: themeSettings.secondaryColor,
    backgroundColor: themeSettings.backgroundColor,
    containerColor: themeSettings.containerColor,
    colorPreset: themeSettings.colorPreset,
  };
};

const getTodayDateKey = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};

const getVerseSelectionForToday = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 1);
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayIndex = Math.floor((todayDateOnly.getTime() - start.getTime()) / 86400000);
  const normalizedIndex = Number.isInteger(dayIndex) ? dayIndex : 0;
  const versePoolSize = VERSE_OF_DAY_POOL.length || 1;
  return VERSE_OF_DAY_POOL[((normalizedIndex % versePoolSize) + versePoolSize) % versePoolSize];
};

const cleanWldehVerseText = (value) =>
  stripHtmlTags(value)
    .replace(/^¶+\s*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\d+\.\d+\s+for:.*$/i, "")
    .trim();

const fetchWldehVerseOfDay = async () => {
  const todayKey = getTodayDateKey();
  if (cachedVerseOfDay?.dateKey === todayKey && cachedVerseOfDay.text && cachedVerseOfDay.reference) {
    return cachedVerseOfDay;
  }

  const selectedVerse = getVerseSelectionForToday();
  const endpoint = `${WLDEH_BIBLE_API_BASE_URL}/${encodeURIComponent(WLDEH_BIBLE_VERSION)}/books/${encodeURIComponent(
    selectedVerse.book,
  )}/chapters/${encodeURIComponent(String(selectedVerse.chapter))}/verses/${encodeURIComponent(String(selectedVerse.verse))}.json`;

  const response = await fetch(endpoint);
  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(responseData?.message || "").trim() || "Bible API request failed.");
  }

  const verseText = cleanWldehVerseText(responseData?.text || responseData?.verse?.text || "");
  const reference = String(selectedVerse.reference || "").trim();
  if (!verseText || !reference) {
    throw new Error("Bible API returned an invalid verse payload.");
  }

  cachedVerseOfDay = {
    dateKey: todayKey,
    text: verseText,
    reference,
    source: "wldeh/bible-api",
    version: WLDEH_BIBLE_VERSION,
  };
  return cachedVerseOfDay;
};

const forwardJsonRequestToAdminService = async (servicePath, { method = "GET", body, headers = {} } = {}) => {
  const response = await fetch(`${ADMIN_SERVICE_BASE_URL}${servicePath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = { message: "Invalid response from admin service." };
  }
  return { ok: response.ok, status: response.status, payload };
};

const ADMIN_EXISTS_CACHE_MS = 60000;
const adminExistsCache = new Map();

const assertAdminExistsInAdminService = async (adminID) => {
  const cached = adminExistsCache.get(adminID);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const result = await forwardJsonRequestToAdminService(
    `/profile?accountType=admin&accountID=${encodeURIComponent(String(adminID))}`,
  );
  const value = result.ok
    ? { ok: true, status: 200, message: "" }
    : result.status === 404
      ? { ok: false, status: 404, message: "Admin account not found." }
      : { ok: false, status: 503, message: "Admin service is unavailable." };

  if (value.ok) {
    adminExistsCache.set(adminID, { value, expiresAt: Date.now() + ADMIN_EXISTS_CACHE_MS });
  }
  return value;
};

const resolveUserEmail = (user) => String(user?.email || user?.userName || "").trim();
const resolveRequestEmail = (payload = {}) =>
  normalizeEmail(payload.email || payload.userName || payload.username || "");
const payloadHasEmailField = (payload = {}) =>
  Object.prototype.hasOwnProperty.call(payload, "email")
  || Object.prototype.hasOwnProperty.call(payload, "userName")
  || Object.prototype.hasOwnProperty.call(payload, "username");

const splitStoredPersonName = (fullName) => {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};
const composeStoredPersonName = (firstName, lastName, fullName = "") => {
  const joined = [String(firstName || "").trim(), String(lastName || "").trim()].filter(Boolean).join(" ");
  return joined || String(fullName || "").trim();
};
const resolveStoredPersonName = (source = {}) => {
  const split = splitStoredPersonName(source.fullName);
  const firstName = String(source.firstName || "").trim() || split.firstName;
  const lastName = String(source.lastName || "").trim() || split.lastName;
  return {
    firstName,
    lastName,
    fullName: composeStoredPersonName(firstName, lastName, source.fullName),
  };
};

const sanitizeUser = (user) => {
  const email = resolveUserEmail(user) || null;
  const personName = resolveStoredPersonName(user);
  return {
    userID: user.userID,
    firstName: personName.firstName,
    lastName: personName.lastName,
    fullName: personName.fullName,
    address: user.address,
    contactNumber: user.contactNumber,
    birthdate: user.birthdate,
    gender: user.gender,
    email,
    userName: email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    photo: user.photo,
  };
};

const sanitizePriestSession = (priest) => ({
  priestID: Number(priest.priestID),
  priestAdminID: Number(priest.adminID),
  firstName: resolveStoredPersonName(priest).firstName,
  lastName: resolveStoredPersonName(priest).lastName,
  fullName: priest.fullName,
  email: String(priest.email || "").trim() || null,
  userName: priest.email,
  contactNumber: priest.phoneNumber,
  address: "",
  birthdate: null,
  gender: null,
  photo: priest.photo || null,
  priestEmail: String(priest.email || "").trim() || null,
  createdAt: null,
  updatedAt: null,
});

const fetchPriestDetailsByID = async (priestID, dbClient) => {
  const result = await runAuthQuery(
    dbClient,
    `
      SELECT
        p."priestID",
        p."firstName",
        p."lastName",
        p."fullName",
        p.email,
        p."phoneNumber",
        p."clergyType",
        p."religiousOrderCode",
        p."adminID",
        COALESCE(p."isActive", TRUE) AS "isActive",
        p.photo
      FROM priests p
      WHERE p."priestID" = $1
      LIMIT 1
    `,
    [priestID],
  );
  return result.rows[0] || null;
};

const buildPriestContext = (priest, account = null) => {
  if (!priest) return null;
  return {
    user: account ? sanitizeUser(account) : sanitizePriestSession(priest),
    priest: {
      priestID: Number(priest.priestID),
      fullName: priest.fullName,
      email: priest.email,
      phoneNumber: priest.phoneNumber,
      clergyType: priest.clergyType,
      religiousOrderCode: priest.religiousOrderCode,
      adminID: Number(priest.adminID),
      isActive: priest.isActive !== false,
      photo: priest.photo || account?.photo || null,
      linkedUserUpdatedAt: account?.updatedAt || null,
    },
  };
};

const resolvePriestContext = async ({ userID = null, priestID = null } = {}, dbClient) => {
  const normalizedPriestID = Number(priestID);
  if (Number.isInteger(normalizedPriestID) && normalizedPriestID > 0) {
    const priest = await fetchPriestDetailsByID(normalizedPriestID, dbClient);
    return buildPriestContext(priest);
  }

  const normalizedUserID = Number(userID);
  if (!Number.isInteger(normalizedUserID) || normalizedUserID <= 0) {
    return null;
  }

  const accountResult = await runAuthQuery(
    dbClient,
    `
      SELECT "userID", ${sqlPersonFullName()} AS "fullName", email, "contactNumber", "updatedAt", photo
      FROM users
      WHERE "userID" = $1
      LIMIT 1
    `,
    [normalizedUserID],
  );
  if (accountResult.rows.length === 0) return null;
  const account = accountResult.rows[0];
  const linkedPriest = await findPriestLinkedToUser(account, dbClient);
  if (linkedPriest) {
    const priest = await fetchPriestDetailsByID(linkedPriest.priestID, dbClient);
    return buildPriestContext(priest, account);
  }

  const fallbackResult = await runAuthQuery(
    dbClient,
    `
      SELECT
        p."priestID",
        p."fullName",
        p.email,
        p."phoneNumber",
        p."clergyType",
        p."religiousOrderCode",
        p."adminID",
        COALESCE(p."isActive", TRUE) AS "isActive",
        p.photo
      FROM priests p
      WHERE LOWER(TRIM(COALESCE(p."fullName", ''))) = LOWER(TRIM($1))
      ORDER BY p."priestID" DESC
      LIMIT 1
    `,
    [account.fullName || ""],
  );
  return buildPriestContext(fallbackResult.rows[0] || null, account);
};

const resolvePriestContextFromRequest = async (req, dbClient) => {
  const priestID = Number(req.query?.priestID ?? req.body?.priestID);
  const userID = Number(req.query?.userID ?? req.body?.userID);
  if (Number.isInteger(priestID) && priestID > 0) {
    return resolvePriestContext({ priestID }, dbClient);
  }
  if (Number.isInteger(userID) && userID > 0) {
    return resolvePriestContext({ userID }, dbClient);
  }
  return null;
};

const getProfilePhotoFileName = (photoValue) => {
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

const getProfilePhotoDirectory = (accountType) =>
  accountType === "priest" ? priestPhotoUploadsDirectory : userPhotoUploadsDirectory;

const getProfilePhotoPublicBasePath = (accountType) =>
  accountType === "priest" ? priestPhotoPublicBasePath : userPhotoPublicBasePath;

const storeProfilePhoto = async (uploadedFile, accountType) => {
  const fileName = path.basename(String(uploadedFile?.filename || uploadedFile?.path || ""));
  if (!fileName) {
    throw new Error("Photo file is required.");
  }
  const destDirectory = getProfilePhotoDirectory(accountType);
  await fs.mkdir(destDirectory, { recursive: true });
  const destPath = path.join(destDirectory, fileName);
  const sourcePath = String(uploadedFile?.path || "").trim();
  if (sourcePath && path.resolve(sourcePath) !== path.resolve(destPath)) {
    await fs.rename(sourcePath, destPath);
  }
  return `${getProfilePhotoPublicBasePath(accountType)}${fileName}`;
};

const deleteStoredProfilePhotoIfExists = async (photoValue, accountType) => {
  const fileName = getProfilePhotoFileName(photoValue);
  if (!fileName) return;
  try {
    await fs.unlink(path.join(getProfilePhotoDirectory(accountType), fileName));
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EPERM" || error?.code === "EBUSY") return;
    console.error("Profile photo delete error:", error);
  }
};

const getParishActivityMediaFileName = (mediaValue) => {
  const normalizedPath = String(mediaValue || "").replace(/\\/g, "/").trim();
  if (!normalizedPath) return "";
  const isParishActivityMediaPath =
    normalizedPath.includes("/assets/parish-activity-media/") ||
    normalizedPath.includes("/uploads/parish-activities/") ||
    normalizedPath.startsWith("parish-activity-media/") ||
    normalizedPath.startsWith("assets/parish-activity-media/");
  if (!isParishActivityMediaPath) return "";
  return path.basename(normalizedPath);
};

const resolveParishActivityMediaPath = (value) => {
  const normalized = String(value || "").replace(/\\/g, "/").trim();
  if (!normalized) return "";
  const fileName = getParishActivityMediaFileName(normalized);
  if (fileName) return `${parishActivityPublicBasePath}${fileName}`;
  return normalized;
};

const storeParishActivityMediaFile = async (uploadedFile) => {
  const sourcePath = String(uploadedFile?.path || "").trim();
  const fileName = path.basename(String(uploadedFile?.filename || sourcePath || ""));
  if (!sourcePath || !fileName) {
    throw new Error("Media file is required.");
  }
  await fs.mkdir(parishActivityUploadsDirectory, { recursive: true });
  const storedPath = path.join(parishActivityUploadsDirectory, fileName);
  if (path.resolve(storedPath) !== path.resolve(sourcePath)) {
    await fs.copyFile(sourcePath, storedPath);
  }
  return `${parishActivityPublicBasePath}${fileName}`;
};

const deleteStoredParishActivityMediaIfExists = async (mediaPath) => {
  const fileName = getParishActivityMediaFileName(mediaPath);
  if (!fileName) return;
  const candidatePaths = [path.join(parishActivityUploadsDirectory, fileName)];
  for (const candidatePath of candidatePaths) {
    try {
      await fs.unlink(candidatePath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
  }
};

const collectParishActivityMediaPaths = (payloadInput = {}) => {
  const payload = parseParishActivityPayload(payloadInput);
  return normalizeParishActivityMediaItems(payload.media, payload.imageUrl ?? payload.image_url ?? "")
    .map((item) => resolveParishActivityMediaPath(item.filePath || item.url))
    .filter(Boolean);
};

const deleteRemovedParishActivityMediaFiles = async (previousPayload, nextPayload) => {
  const previousPaths = new Set(collectParishActivityMediaPaths(previousPayload));
  const nextPaths = new Set(collectParishActivityMediaPaths(nextPayload));
  for (const mediaPath of previousPaths) {
    if (!nextPaths.has(mediaPath)) {
      await deleteStoredParishActivityMediaIfExists(mediaPath);
    }
  }
};

const profilePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      try {
        const accountType = String(req.body?.accountType || "").trim().toLowerCase();
        const destDirectory = getProfilePhotoDirectory(accountType);
        fsSync.mkdirSync(destDirectory, { recursive: true });
        callback(null, destDirectory);
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

const isAllowedParishActivityImage = (file) => {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  const extension = path.extname(String(file?.originalname || "")).toLowerCase();
  const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  const allowedVideoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v"]);
  if (mimeType === "image/gif") return false;
  if (mimeType.startsWith("image/")) return true;
  if (mimeType.startsWith("video/")) return true;
  return allowedImageExtensions.has(extension) || allowedVideoExtensions.has(extension);
};

const getParishActivityUploadedMediaType = (file) => {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  const extension = path.extname(String(file?.originalname || "")).toLowerCase();
  if (mimeType.startsWith("video/") || [".mp4", ".webm", ".mov", ".m4v"].includes(extension)) {
    return "video";
  }
  return "image";
};

const parishActivityImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      try {
        fsSync.mkdirSync(parishActivityUploadsDirectory, { recursive: true });
        callback(null, parishActivityUploadsDirectory);
      } catch (error) {
        callback(error);
      }
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(String(file?.originalname || "")).toLowerCase();
      const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm", ".mov", ".m4v"]);
      const mediaType = getParishActivityUploadedMediaType(file);
      const fallbackExtension = mediaType === "video" ? ".mp4" : ".jpg";
      const safeExtension = allowedExtensions.has(extension) ? extension : fallbackExtension;
      callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExtension}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!isAllowedParishActivityImage(file)) {
      callback(new Error("Only JPG, PNG, WEBP, MP4, WEBM, or MOV uploads are allowed."));
      return;
    }
    callback(null, true);
  },
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

const appointmentDocumentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fsSync.mkdirSync(appointmentIncomingDirectory, { recursive: true });
      callback(null, appointmentIncomingDirectory);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(String(file?.originalname || "")).toLowerCase() || ".pdf";
      callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    const mimeType = String(file?.mimetype || "").toLowerCase();
    const originalName = String(file?.originalname || "").toLowerCase();
    const isGifMimeType = mimeType === "image/gif";
    const isGifExtension = originalName.endsWith(".gif");
    const isAllowedMimeType =
      mimeType === "application/pdf" ||
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      (mimeType.startsWith("image/") && !isGifMimeType);
    const hasAllowedExtension =
      originalName.endsWith(".pdf") ||
      originalName.endsWith(".docx") ||
      /\.(png|jpe?g|webp|bmp|svg|avif|tiff?|heic|heif)$/i.test(originalName);
    const isAllowedFile = (isAllowedMimeType || hasAllowedExtension) && !isGifExtension;
    if (!isAllowedFile) {
      callback(new Error("Only PDF, DOCX, and non-GIF image uploads are allowed for appointment documents."));
      return;
    }
    callback(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const progressPaymentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      const appointmentID = Number(req.params?.id);
      const targetDirectory = path.join(
        progressPaymentUploadsDirectory,
        Number.isInteger(appointmentID) && appointmentID > 0 ? String(appointmentID) : "unknown",
      );
      fsSync.mkdirSync(targetDirectory, { recursive: true });
      callback(null, targetDirectory);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(String(file?.originalname || "")).toLowerCase();
      const safeExtension = [".pdf", ".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".pdf";
      callback(null, `receipt-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExtension}`);
    },
  }),
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
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

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

const toMinutes = (timeValue) => {
  const normalized = normalizeTimeToHHMM(timeValue);
  if (!normalized) return null;
  const [hoursRaw, minutesRaw] = normalized.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS = 5;
const FUNERAL_MASS_MIN_ADVANCE_DAYS = 1;
const SCHEDULE_SLOT_DURATION_MINUTES = 60;

const PARISH_APPOINTMENT_TIME_SLOTS = [
  ["04:00", "05:00"],
  ["05:00", "06:00"],
  ["06:00", "07:00"],
  ["07:00", "08:00"],
  ["08:00", "09:00"],
  ["09:00", "10:00"],
  ["10:00", "11:00"],
  ["11:00", "12:00"],
  ["13:00", "14:00"],
  ["14:00", "15:00"],
  ["15:00", "16:00"],
  ["16:00", "17:00"],
];

const SPECIAL_PROGRAM_MAX_DURATION_HOURS = 8;

const fetchRecurringHalfDay = async (adminID) => {
  const result = await query(
    `
      SELECT weekday, "startTime"::text AS "startTime", "endTime"::text AS "endTime"
      FROM recurring_half_days
      WHERE "recurring_halfID" = $1
        AND "isEnabled" = TRUE
      LIMIT 1
    `,
    [adminID],
  );
  const row = result.rows[0];
  if (!row) return null;
  const weekday = Number(row.weekday);
  const startTime = normalizeTimeToHHMM(row.startTime);
  const endTime = normalizeTimeToHHMM(row.endTime);
  if (!Number.isInteger(weekday) || !startTime || !endTime) return null;
  return { weekday, startTime, endTime };
};

const findPriestNoteScheduleConflict = async ({ priestID, adminID, dates, occupiedSlots }) => {
  if (!dates.length || !occupiedSlots.length) return "";
  const [recurringResult, specificResult, halfDay, entryResult] = await Promise.all([
    query(`SELECT weekday FROM recurring_day_offs WHERE "adminID" = $1 LIMIT 1`, [adminID]),
    query(
      `SELECT "dayOffDate"::text AS "dayOffDate" FROM day_off_dates WHERE "adminID" = $1 AND "dayOffDate" = ANY($2::date[])`,
      [adminID, dates],
    ),
    fetchRecurringHalfDay(adminID),
    query(
      `
        SELECT
          title,
          "eventDate"::text AS "eventDate",
          "startTime" AS "startTime",
          "endTime" AS "endTime",
          "occupiedSlots" AS "occupiedSlots"
        FROM calendar_entries
        WHERE "priestID" = $1
          AND "eventDate" = ANY($2::date[])
      `,
      [priestID, dates],
    ),
  ]);
  const closedWeekday = recurringResult.rows.length > 0 ? Number(recurringResult.rows[0].weekday) : null;
  const closedDates = new Set(specificResult.rows.map((row) => String(row.dayOffDate).slice(0, 10)));
  for (const entry of entryResult.rows) {
    const dateKey = String(entry.eventDate || "").slice(0, 10);
    const weekday = new Date(`${dateKey}T12:00:00`).getDay();
    if (closedDates.has(dateKey) || closedWeekday === weekday) continue;
    const ranges = expandOccupiedRanges(entry);
    for (const slot of occupiedSlots) {
      if (halfDay && !isSlotWithinHalfDayHours(halfDay, weekday, slot.startTime, slot.endTime)) continue;
      const start = toMinutes(slot.startTime);
      const end = toMinutes(slot.endTime);
      const hit = ranges.find((range) => range.start < end && start < range.end);
      if (hit) {
        const title = String(entry.title || hit.title || "a schedule").trim() || "a schedule";
        return `${dateKey} already has ${title} at ${slot.startTime}. Choose dates that do not include your existing schedule.`;
      }
    }
  }
  return "";
};

const expandOccupiedRanges = (entry) => {
  const slots = normalizeOccupiedSlots(entry?.occupiedSlots, entry?.startTime, entry?.endTime);
  return slots
    .map((slot) => ({
      start: toMinutes(slot.startTime),
      end: toMinutes(slot.endTime),
      title: String(entry?.title || "schedule").trim(),
    }))
    .filter((range) => range.start !== null && range.end !== null);
};

const findParishClosureConflict = async ({ adminID, dateKey, startTime, endTime }) => {
  const normalizedAdminID = Number(adminID);
  const normalizedDateKey = String(dateKey || "").trim().slice(0, 10);
  if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateKey)) return "";
  const weekday = new Date(`${normalizedDateKey}T12:00:00`).getDay();
  const [recurringResult, specificResult] = await Promise.all([
    query(`SELECT weekday FROM recurring_day_offs WHERE "adminID" = $1 LIMIT 1`, [normalizedAdminID]),
    query(
      `SELECT 1 FROM day_off_dates WHERE "adminID" = $1 AND "dayOffDate" = $2::date LIMIT 1`,
      [normalizedAdminID, normalizedDateKey],
    ),
  ]);
  if (specificResult.rows.length > 0) {
    return "The parish is closed on this date (day off). Please choose another date.";
  }
  if (recurringResult.rows.length > 0 && Number(recurringResult.rows[0].weekday) === weekday) {
    return "The parish is closed every week on this day (day off). Please choose another date.";
  }
  const halfDay = await fetchRecurringHalfDay(normalizedAdminID);
  if (halfDay && startTime && endTime && !isSlotWithinHalfDayHours(halfDay, weekday, startTime, endTime)) {
    return `This day is a half day. The parish is open ${formatClockRange(halfDay.startTime, halfDay.endTime)} only.`;
  }
  return "";
};

const isSlotWithinHalfDayHours = (halfDay, weekday, slotStart, slotEnd) => {
  if (!halfDay || halfDay.weekday !== weekday) return true;
  const start = toMinutes(slotStart);
  const end = toMinutes(slotEnd);
  const openStart = toMinutes(halfDay.startTime);
  const openEnd = toMinutes(halfDay.endTime);
  if (start === null || end === null || openStart === null || openEnd === null) return true;
  return start >= openStart && end <= openEnd;
};

const normalizeSpecialProgramDurationHours = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(SPECIAL_PROGRAM_MAX_DURATION_HOURS, parsed);
};

const buildParishDurationSlots = (durationHours = 1) => {
  const hours = Number(durationHours);
  if (!Number.isInteger(hours) || hours <= 1) {
    return PARISH_APPOINTMENT_TIME_SLOTS.map(([startTime, endTime]) => [startTime, endTime]);
  }
  const slots = [];
  for (let index = 0; index < PARISH_APPOINTMENT_TIME_SLOTS.length; index += 1) {
    const startSlot = PARISH_APPOINTMENT_TIME_SLOTS[index];
    const endSlot = PARISH_APPOINTMENT_TIME_SLOTS[index + hours - 1];
    if (!endSlot) continue;
    const startMinutes = toMinutes(startSlot[0]);
    const endMinutes = toMinutes(endSlot[1]);
    if (startMinutes === null || endMinutes === null) continue;
    if (endMinutes - startMinutes !== hours * 60) continue;
    slots.push([startSlot[0], endSlot[1]]);
  }
  return slots;
};

const normalizeTimeToHHMM = (timeValue) => {
  const match = String(timeValue || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "";
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const getLocalDateKey = (date = new Date()) =>
  date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const addDaysToLocalDateKey = (days, fromDate = new Date()) => {
  const baseKey =
    fromDate instanceof Date
      ? getLocalDateKey(fromDate)
      : String(fromDate || "").trim().slice(0, 10);
  const parsed = new Date(`${baseKey}T12:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return getLocalDateKey();
  parsed.setTime(parsed.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);
  return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
};

const getManilaMinutesNow = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 0;
  return hour * 60 + minute;
};

const isScheduleSlotInThePast = (dateKey, startTime, now = new Date()) => {
  const normalizedDateKey = String(dateKey || "").trim();
  const startMinutes = toMinutes(startTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateKey) || startMinutes === null) return false;
  const todayKey = getLocalDateKey(now);
  if (normalizedDateKey < todayKey) return true;
  if (normalizedDateKey > todayKey) return false;
  return startMinutes <= getManilaMinutesNow(now);
};

const normalizeScheduleMinAdvanceDays = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
    return PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS;
  }
  return parsed;
};

const getScheduleLockThroughDateKey = (advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
  const days = normalizeScheduleMinAdvanceDays(advanceDays);
  if (days <= 0) return "";
  return addDaysToLocalDateKey(days);
};

const getMinimumProgressScheduleDateKey = (advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
  const days = normalizeScheduleMinAdvanceDays(advanceDays);
  if (days <= 0) return getLocalDateKey();
  return addDaysToLocalDateKey(days + 1);
};

const isFuneralMassScheduleService = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "funeral mass" ||
    normalized === "funeral-mass" ||
    normalized.includes("funeral") ||
    normalized.includes("death mass") ||
    normalized.includes("death-mass")
  );
};

const resolveSacramentScheduleAdvanceDays = (sacramentName) =>
  isFuneralMassScheduleService(sacramentName) ? FUNERAL_MASS_MIN_ADVANCE_DAYS : null;

const parseAdvanceDaysOverride = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) return null;
  return parsed;
};

const resolveAppointmentScheduleAdvanceDays = async (adminID, appointment = {}) => {
  const override = resolveSacramentScheduleAdvanceDays(
    appointment?.sacramentName || appointment?.serviceName || appointment?.specialSacramentName,
  );
  if (override !== null) return override;
  return resolveScheduleMinAdvanceDays(adminID);
};

const resolveScheduleMinAdvanceDays = async () => PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS;

const buildScheduleLockPolicy = (advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
  const minAdvanceDays = normalizeScheduleMinAdvanceDays(advanceDays);
  const todayKey = getLocalDateKey();
  if (minAdvanceDays <= 0) {
    return {
      minAdvanceDays: 0,
      todayKey,
      lockedThroughDateKey: "",
      minSelectableDateKey: todayKey,
    };
  }
  const lockedThroughDateKey = getScheduleLockThroughDateKey(minAdvanceDays);
  const minSelectableDateKey = getMinimumProgressScheduleDateKey(minAdvanceDays);
  return {
    minAdvanceDays,
    todayKey,
    lockedThroughDateKey,
    minSelectableDateKey,
  };
};

const assertProgressScheduleDateAllowed = (dateKey, advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
  const normalizedDateKey = String(dateKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateKey)) {
    return { ok: false, message: "Schedule date must be in YYYY-MM-DD format." };
  }
  const policy = buildScheduleLockPolicy(advanceDays);
  if (normalizedDateKey < policy.minSelectableDateKey) {
    if (policy.minAdvanceDays <= 0) {
      return {
        ok: false,
        message: "Schedule date cannot be in the past.",
        ...policy,
      };
    }
    return {
      ok: false,
      message: `Schedule date must be on or after ${policy.minSelectableDateKey}. Today through ${policy.lockedThroughDateKey} are locked (${policy.minAdvanceDays}-day interval).`,
      ...policy,
    };
  }
  return { ok: true, ...policy };
};

const assertScheduleTimeSlotAllowed = (startTime, endTime) => {
  const normalizedStart = normalizeTimeToHHMM(startTime);
  const normalizedEnd = normalizeTimeToHHMM(endTime);
  if (!normalizedStart || !normalizedEnd) {
    return { ok: false, message: "Invalid start or end time format." };
  }
  const isAllowed = PARISH_APPOINTMENT_TIME_SLOTS.some(
    ([slotStart, slotEnd]) => slotStart === normalizedStart && slotEnd === normalizedEnd,
  );
  if (!isAllowed) {
    return {
      ok: false,
      message:
        "Selected time must be one of the parish appointment slots (4:00 AM - 12:00 PM and 1:00 PM - 5:00 PM, hourly).",
    };
  }
  return { ok: true, durationHours: 1 };
};

const CALENDAR_SCHEDULE_TYPES = ["parish_event", "priest_schedule", "priest_activity"];
const assertPriestActivityRequest = ({
  priestID,
  eventDate,
  startTime,
  endTime,
  occupiedSlots,
  isKeepingExistingDate = false,
}) => {
  if (!Number.isInteger(priestID) || priestID <= 0) {
    return { ok: false, message: "Please select the priest who will be unavailable." };
  }
  if (!isKeepingExistingDate) {
    const dateCheck = assertProgressScheduleDateAllowed(eventDate, 0);
    if (!dateCheck.ok) return dateCheck;
  }
  const slots = normalizeOccupiedSlots(occupiedSlots, startTime, endTime);
  if (!slots.length) {
    return { ok: false, message: "Choose at least one time slot when the priest is unavailable." };
  }
  const lastSlot = slots[slots.length - 1];
  if (!isKeepingExistingDate && isScheduleSlotInThePast(eventDate, lastSlot.endTime)) {
    return { ok: false, message: "This time has already passed." };
  }
  return {
    ok: true,
    occupiedSlots: slots,
    startTime: slots[0].startTime,
    endTime: lastSlot.endTime,
  };
};

const isParishHourPair = (startTime, endTime) =>
  PARISH_APPOINTMENT_TIME_SLOTS.some(([slotStart, slotEnd]) => slotStart === startTime && slotEnd === endTime);

const normalizeOccupiedSlots = (rawSlots, startTime, endTime) => {
  const unique = [];
  const seen = new Set();
  const pushSlot = (slotStart, slotEnd) => {
    const normalizedStart = normalizeTimeToHHMM(slotStart);
    const normalizedEnd = normalizeTimeToHHMM(slotEnd);
    if (!isParishHourPair(normalizedStart, normalizedEnd)) return;
    const key = `${normalizedStart}-${normalizedEnd}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push({ startTime: normalizedStart, endTime: normalizedEnd });
  };

  (Array.isArray(rawSlots) ? rawSlots : []).forEach((slot) => {
    if (typeof slot === "string") {
      const [slotStart, slotEnd] = slot.split("-");
      pushSlot(slotStart, slotEnd);
      return;
    }
    pushSlot(slot?.startTime || slot?.start_time, slot?.endTime || slot?.end_time);
  });

  if (!unique.length) {
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start !== null && end !== null) {
      PARISH_APPOINTMENT_TIME_SLOTS.forEach(([slotStart, slotEnd]) => {
        const slotStartMinutes = toMinutes(slotStart);
        const slotEndMinutes = toMinutes(slotEnd);
        if (slotStartMinutes !== null && slotEndMinutes !== null && slotStartMinutes >= start && slotEndMinutes <= end) {
          pushSlot(slotStart, slotEnd);
        }
      });
    }
  }

  unique.sort((left, right) => (toMinutes(left.startTime) || 0) - (toMinutes(right.startTime) || 0));
  return unique;
};

const expandBusyRangesFromEntry = (entry) => {
  const occupied = normalizeOccupiedSlots(entry?.occupiedSlots || entry?.occupied_slots, null, null);
  if (occupied.length) {
    return occupied
      .map((slot) => ({
        start: toMinutes(slot.startTime),
        end: toMinutes(slot.endTime),
        title: String(entry?.title || "Priest Schedule").trim() || "Priest Schedule",
      }))
      .filter((range) => range.start !== null && range.end !== null);
  }
  const start = toMinutes(entry?.startTime || entry?.start_time);
  const end = toMinutes(entry?.endTime || entry?.end_time);
  if (start === null || end === null) return [];
  return [
    {
      start,
      end,
      title: String(entry?.title || "Priest Schedule").trim() || "Priest Schedule",
    },
  ];
};

const findProposedSlotsConflict = (proposedSlots, entries) => {
  const proposedRanges = (Array.isArray(proposedSlots) ? proposedSlots : [])
    .map((slot) => ({
      start: toMinutes(slot.startTime || slot.start_time),
      end: toMinutes(slot.endTime || slot.end_time),
    }))
    .filter((range) => range.start !== null && range.end !== null);
  for (const entry of Array.isArray(entries) ? entries : []) {
    const busyRanges = expandBusyRangesFromEntry(entry);
    const hasOverlap = proposedRanges.some((proposed) =>
      busyRanges.some((busy) => proposed.start < busy.end && busy.start < proposed.end),
    );
    if (hasOverlap) {
      return {
        conflict: true,
        title: String(entry.title || "Priest Schedule").trim() || "Priest Schedule",
      };
    }
  }
  return { conflict: false, title: "" };
};

const assertSpecialProgramOccupiedSlotsAllowed = (occupiedSlots) => {
  if (!occupiedSlots.length) {
    return {
      ok: false,
      message: "Choose at least one available 1-hour time slot for this special program.",
    };
  }
  if (occupiedSlots.length > SPECIAL_PROGRAM_MAX_DURATION_HOURS) {
    return {
      ok: false,
      message: "Special sacrament programs can occupy at most 8 parish hour slots.",
    };
  }
  return {
    ok: true,
    durationHours: occupiedSlots.length,
    occupiedSlots,
    startTime: occupiedSlots[0].startTime,
    endTime: occupiedSlots[occupiedSlots.length - 1].endTime,
  };
};

const assertSpecialProgramTimeSlotAllowed = (startTime, endTime, durationHours = 1, occupiedSlots = []) => {
  const normalizedSlots = normalizeOccupiedSlots(occupiedSlots, startTime, endTime);
  if (normalizedSlots.length) {
    return assertSpecialProgramOccupiedSlotsAllowed(normalizedSlots);
  }
  const normalizedStart = normalizeTimeToHHMM(startTime);
  const normalizedEnd = normalizeTimeToHHMM(endTime);
  const hours = normalizeSpecialProgramDurationHours(durationHours);
  if (!normalizedStart || !normalizedEnd) {
    return { ok: false, message: "Invalid start or end time format." };
  }
  const startMinutes = toMinutes(normalizedStart);
  const endMinutes = toMinutes(normalizedEnd);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return {
      ok: false,
      message: "Choose at least one available 1-hour time slot for this special program.",
    };
  }
  const derivedSlots = normalizeOccupiedSlots([], normalizedStart, normalizedEnd);
  if (derivedSlots.length) {
    return assertSpecialProgramOccupiedSlotsAllowed(derivedSlots);
  }
  const isAllowed = buildParishDurationSlots(hours).some(
    ([slotStart, slotEnd]) => slotStart === normalizedStart && slotEnd === normalizedEnd,
  );
  if (!isAllowed) {
    return {
      ok: false,
      message: "Selected time must use parish hour slots (8:00 AM - 12:00 PM and 1:00 PM - 5:00 PM).",
    };
  }
  return { ok: true, durationHours: hours, occupiedSlots: derivedSlots, startTime: normalizedStart, endTime: normalizedEnd };
};

const formatParishSlotLabel = (startTime, endTime) => {
  const toLabel = (value) => {
    const normalized = normalizeTimeToHHMM(value);
    if (!normalized) return "";
    const [hoursRaw, minutesRaw] = normalized.split(":");
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    const period = hours >= 12 ? "PM" : "AM";
    const twelveHour = hours % 12 || 12;
    return `${twelveHour}:${String(minutes).padStart(2, "0")} ${period}`;
  };
  const startLabel = toLabel(startTime);
  const endLabel = toLabel(endTime);
  return startLabel && endLabel ? `${startLabel} - ${endLabel}` : "";
};

const getPriestDayAvailability = async ({
  priestID,
  adminID,
  dateKey,
  excludeCalendarEntryID = null,
  durationHours = 1,
  advanceDays: advanceDaysOverride = null,
}) => {
  const normalizedPriestID = Number(priestID);
  const normalizedAdminID = Number(adminID);
  const normalizedDateKey = String(dateKey || "").trim();
  const excludeID = Number(excludeCalendarEntryID);
  if (!Number.isInteger(normalizedPriestID) || normalizedPriestID <= 0) {
    throw Object.assign(new Error("A valid priestID is required."), { status: 400 });
  }
  if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) {
    throw Object.assign(new Error("A valid adminID is required."), { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateKey)) {
    throw Object.assign(new Error("date must be in YYYY-MM-DD format."), { status: 400 });
  }

  const priestResult = await query(
    `
      SELECT "priestID", "fullName"
      FROM priests
      WHERE "priestID" = $1
        AND "adminID" = $2
      LIMIT 1
    `,
    [normalizedPriestID, normalizedAdminID],
  );
  if (priestResult.rows.length === 0) {
    throw Object.assign(new Error("Priest not found for this parish."), { status: 404 });
  }

  const parsedAdvanceOverride = parseAdvanceDaysOverride(advanceDaysOverride);
  const advanceDays =
    parsedAdvanceOverride !== null
      ? parsedAdvanceOverride
      : await resolveScheduleMinAdvanceDays(normalizedAdminID);
  const dateCheck = assertProgressScheduleDateAllowed(normalizedDateKey, advanceDays);
  const parsedDate = new Date(`${normalizedDateKey}T12:00:00`);
  const weekday = Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getDay();

  const [weekdayResult, specificDateResult, entriesResult] = await Promise.all([
    query(
      `
        SELECT weekday
        FROM recurring_day_offs
        WHERE "adminID" = $1
        ORDER BY "recurringID" DESC
        LIMIT 1
      `,
      [normalizedAdminID],
    ),
    query(
      `
        SELECT 1
        FROM day_off_dates
        WHERE "adminID" = $1
          AND "dayOffDate" = $2::date
        LIMIT 1
      `,
      [normalizedAdminID, normalizedDateKey],
    ),
    query(
      `
        SELECT
          ce."calendarID" AS id,
          ce.title,
          ce."scheduleType" AS "scheduleType",
          ce."eventDate"::text AS "eventDate",
          ce."startTime" AS "startTime",
          ce."endTime" AS "endTime",
          ce.occupied_slots AS "occupiedSlots"
        FROM calendar_entries_resolved ce
        WHERE ce."adminID" = $1
          AND ce."priestID" = $2
          AND ce."eventDate" = $3::date
          AND ${calendarEntryHasActivePriestSql()}
        ORDER BY ce."startTime" ASC NULLS LAST, ce."calendarID" ASC
      `,
      [normalizedAdminID, normalizedPriestID, normalizedDateKey],
    ),
  ]);

  const recurringWeekday = weekdayResult.rows.length > 0 ? Number(weekdayResult.rows[0].weekday) : null;
  const isSpecificDayOff = specificDateResult.rows.length > 0;
  const isRecurringDayOff = Number.isInteger(recurringWeekday) && recurringWeekday === weekday;
  const isDayOff = isSpecificDayOff || isRecurringDayOff;
  const isLocked = !dateCheck.ok;

  const existingSchedules = entriesResult.rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title || "Priest Schedule").trim() || "Priest Schedule",
    scheduleType: String(row.scheduleType || "").trim(),
    eventDate: String(row.eventDate || "").slice(0, 10),
    startTime: normalizeTimeToHHMM(row.startTime) || null,
    endTime: normalizeTimeToHHMM(row.endTime) || null,
    occupiedSlots:
      String(row.scheduleType || "").trim() === "priest_activity"
        ? normalizeOccupiedSlots(row.occupiedSlots, null, null)
        : normalizeOccupiedSlots(row.occupiedSlots, row.startTime, row.endTime),
  }));

  const consideredSchedules = entriesResult.rows.filter(
    (entry) => !Number.isInteger(excludeID) || excludeID <= 0 || Number(entry.id) !== excludeID,
  );

  const halfDay = await fetchRecurringHalfDay(normalizedAdminID);
  const isHalfDay = !isDayOff && Boolean(halfDay) && halfDay.weekday === weekday;
  const halfDayMessage = isHalfDay
    ? `Half day: the parish is open ${formatClockRange(halfDay.startTime, halfDay.endTime)} only.`
    : "";

  const slots = PARISH_APPOINTMENT_TIME_SLOTS.map(([startTime, endTime]) => {
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    const conflict =
      start === null || end === null
        ? { conflict: false, title: "" }
        : findProposedSlotsConflict([{ startTime, endTime }], consideredSchedules);
    const isPastSlot = isScheduleSlotInThePast(normalizedDateKey, startTime);
    const isOutsideHalfDay = isHalfDay && !isSlotWithinHalfDayHours(halfDay, weekday, startTime, endTime);
    const available =
      !isDayOff &&
      !isLocked &&
      !isPastSlot &&
      !isOutsideHalfDay &&
      start !== null &&
      end !== null &&
      !conflict.conflict;
    return {
      startTime,
      endTime,
      durationHours: 1,
      label: formatParishSlotLabel(startTime, endTime),
      available,
      conflictTitle: isPastSlot
        ? "This time has already passed."
        : isOutsideHalfDay
          ? halfDayMessage
          : conflict.title || "",
      isPast: isPastSlot,
    };
  });

  return {
    priestID: normalizedPriestID,
    priestName: String(priestResult.rows[0].fullName || "").trim(),
    date: normalizedDateKey,
    isDayOff,
    isHalfDay,
    halfDay: isHalfDay ? halfDay : null,
    halfDayMessage,
    isLocked,
    lockedMessage: isLocked ? dateCheck.message : "",
    minAdvanceDays: dateCheck.minAdvanceDays ?? advanceDays,
    lockedThroughDateKey: dateCheck.lockedThroughDateKey || "",
    minSelectableDateKey: dateCheck.minDateKey || dateCheck.minSelectableDateKey || "",
    slots,
    existingSchedules,
  };
};

const getPriestOpenScheduleWindow = async ({
  priestID,
  adminID,
  excludeCalendarEntryID = null,
  dayCount = 75,
  advanceDays: advanceDaysOverride = null,
} = {}) => {
  const normalizedPriestID = Number(priestID);
  const normalizedAdminID = Number(adminID);
  const excludeID = Number(excludeCalendarEntryID);
  if (!Number.isInteger(normalizedPriestID) || normalizedPriestID <= 0) {
    throw Object.assign(new Error("A valid priestID is required."), { status: 400 });
  }
  if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) {
    throw Object.assign(new Error("A valid adminID is required."), { status: 400 });
  }

  const priestResult = await query(
    `
      SELECT "priestID", "fullName"
      FROM priests
      WHERE "priestID" = $1
        AND "adminID" = $2
        AND COALESCE("isActive", TRUE) = TRUE
      LIMIT 1
    `,
    [normalizedPriestID, normalizedAdminID],
  );
  if (priestResult.rows.length === 0) {
    throw Object.assign(new Error("Priest not found for this parish."), { status: 404 });
  }

  const parsedAdvanceOverride = parseAdvanceDaysOverride(advanceDaysOverride);
  const advanceDays =
    parsedAdvanceOverride !== null
      ? parsedAdvanceOverride
      : await resolveScheduleMinAdvanceDays(normalizedAdminID);
  const policy = buildScheduleLockPolicy(advanceDays);
  const startKey = policy.minSelectableDateKey;
  const startDate = new Date(`${startKey}T12:00:00`);
  const safeDayCount = Math.min(120, Math.max(14, Number(dayCount) || 75));
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + safeDayCount - 1);
  const endKey = getLocalDateKey(endDate);

  const [weekdayResult, specificDatesResult, entriesResult] = await Promise.all([
    query(
      `
        SELECT weekday
        FROM recurring_day_offs
        WHERE "adminID" = $1
        ORDER BY "recurringID" DESC
        LIMIT 1
      `,
      [normalizedAdminID],
    ),
    query(
      `
        SELECT "dayOffDate"::text AS "dateKey"
        FROM day_off_dates
        WHERE "adminID" = $1
          AND "dayOffDate" >= $2::date
          AND "dayOffDate" <= $3::date
      `,
      [normalizedAdminID, startKey, endKey],
    ),
    query(
      `
        SELECT
          ce."calendarID" AS id,
          ce."eventDate"::text AS "eventDate",
          ce."startTime" AS "startTime",
          ce."endTime" AS "endTime"
        FROM calendar_entries_resolved ce
        WHERE ce."adminID" = $1
          AND ce."priestID" = $2
          AND ce."eventDate" >= $3::date
          AND ce."eventDate" <= $4::date
          AND ${calendarEntryHasActivePriestSql()}
      `,
      [normalizedAdminID, normalizedPriestID, startKey, endKey],
    ),
  ]);

  const recurringWeekday = weekdayResult.rows.length > 0 ? Number(weekdayResult.rows[0].weekday) : null;
  const specificDayOffs = new Set(
    specificDatesResult.rows.map((row) => String(row.dateKey || "").slice(0, 10)).filter(Boolean),
  );
  const entriesByDate = new Map();
  entriesResult.rows.forEach((row) => {
    const dateKey = String(row.eventDate || "").slice(0, 10);
    if (!dateKey) return;
    if (Number.isInteger(excludeID) && excludeID > 0 && Number(row.id) === excludeID) return;
    const list = entriesByDate.get(dateKey) || [];
    list.push({
      startTime: normalizeTimeToHHMM(row.startTime),
      endTime: normalizeTimeToHHMM(row.endTime),
    });
    entriesByDate.set(dateKey, list);
  });

  const halfDay = await fetchRecurringHalfDay(normalizedAdminID);
  const openDates = [];
  for (let offset = 0; offset < safeDayCount; offset += 1) {
    const cursor = new Date(startDate);
    cursor.setDate(startDate.getDate() + offset);
    const dateKey = getLocalDateKey(cursor);
    const weekday = cursor.getDay();
    const isDayOff =
      specificDayOffs.has(dateKey) ||
      (Number.isInteger(recurringWeekday) && recurringWeekday === weekday);
    if (isDayOff) continue;
    const busy = entriesByDate.get(dateKey) || [];
    const hasOpenSlot = PARISH_APPOINTMENT_TIME_SLOTS.some(([startTime, endTime]) => {
      const start = toMinutes(startTime);
      const end = toMinutes(endTime);
      if (start === null || end === null) return false;
      if (!isSlotWithinHalfDayHours(halfDay, weekday, startTime, endTime)) return false;
      return !busy.some((entry) => {
        const busyStart = toMinutes(entry.startTime);
        const busyEnd = toMinutes(entry.endTime);
        if (busyStart === null || busyEnd === null) return false;
        return start < busyEnd && busyStart < end;
      });
    });
    if (hasOpenSlot) openDates.push(dateKey);
  }

  return {
    priestID: normalizedPriestID,
    priestName: String(priestResult.rows[0].fullName || "").trim(),
    ...policy,
    openDates,
  };
};

const getPriestMonthAvailability = async ({
  priestID,
  adminID,
  monthKey,
  excludeCalendarEntryID = null,
  advanceDays: advanceDaysOverride = null,
} = {}) => {
  const normalizedPriestID = Number(priestID);
  const normalizedAdminID = Number(adminID);
  const normalizedMonthKey = String(monthKey || "").trim();
  const excludeID = Number(excludeCalendarEntryID);
  if (!Number.isInteger(normalizedPriestID) || normalizedPriestID <= 0) {
    throw Object.assign(new Error("A valid priestID is required."), { status: 400 });
  }
  if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) {
    throw Object.assign(new Error("A valid adminID is required."), { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(normalizedMonthKey)) {
    throw Object.assign(new Error("month must be in YYYY-MM format."), { status: 400 });
  }

  const priestResult = await query(
    `
      SELECT "priestID", "fullName"
      FROM priests
      WHERE "priestID" = $1
        AND "adminID" = $2
        AND COALESCE("isActive", TRUE) = TRUE
      LIMIT 1
    `,
    [normalizedPriestID, normalizedAdminID],
  );
  if (priestResult.rows.length === 0) {
    throw Object.assign(new Error("Priest not found for this parish."), { status: 404 });
  }

  const startKey = `${normalizedMonthKey}-01`;
  const startDate = new Date(`${startKey}T12:00:00`);
  if (Number.isNaN(startDate.getTime())) {
    throw Object.assign(new Error("month must be in YYYY-MM format."), { status: 400 });
  }
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
  const endKey = getLocalDateKey(endDate);
  const parsedAdvanceOverride = parseAdvanceDaysOverride(advanceDaysOverride);
  const advanceDays =
    parsedAdvanceOverride !== null
      ? parsedAdvanceOverride
      : await resolveScheduleMinAdvanceDays(normalizedAdminID);
  const policy = buildScheduleLockPolicy(advanceDays);

  const [weekdayResult, specificDatesResult, entriesResult] = await Promise.all([
    query(
      `
        SELECT weekday
        FROM recurring_day_offs
        WHERE "adminID" = $1
        ORDER BY "recurringID" DESC
        LIMIT 1
      `,
      [normalizedAdminID],
    ),
    query(
      `
        SELECT "dayOffDate"::text AS "dateKey"
        FROM day_off_dates
        WHERE "adminID" = $1
          AND "dayOffDate" >= $2::date
          AND "dayOffDate" <= $3::date
      `,
      [normalizedAdminID, startKey, endKey],
    ),
    query(
      `
        SELECT
          ce."calendarID" AS id,
          ce.title,
          ce."eventDate"::text AS "eventDate",
          ce."startTime" AS "startTime",
          ce."endTime" AS "endTime"
        FROM calendar_entries_resolved ce
        WHERE ce."adminID" = $1
          AND ce."priestID" = $2
          AND ce."eventDate" >= $3::date
          AND ce."eventDate" <= $4::date
          AND ${calendarEntryHasActivePriestSql()}
        ORDER BY ce."eventDate" ASC, ce."startTime" ASC NULLS LAST, ce."calendarID" ASC
      `,
      [normalizedAdminID, normalizedPriestID, startKey, endKey],
    ),
  ]);

  return {
    priestID: normalizedPriestID,
    priestName: String(priestResult.rows[0].fullName || "").trim(),
    month: normalizedMonthKey,
    ...policy,
    recurringWeekday: weekdayResult.rows.length > 0 ? Number(weekdayResult.rows[0].weekday) : null,
    halfDay: await fetchRecurringHalfDay(normalizedAdminID),
    dayOffDates: specificDatesResult.rows
      .map((row) => String(row.dateKey || "").slice(0, 10))
      .filter(Boolean),
    entries: entriesResult.rows.map((row) => ({
      id: Number(row.id),
      title: String(row.title || "Priest Schedule").trim() || "Priest Schedule",
      eventDate: String(row.eventDate || "").slice(0, 10),
      startTime: normalizeTimeToHHMM(row.startTime) || null,
      endTime: normalizeTimeToHHMM(row.endTime) || null,
      isCurrentAppointment: Number.isInteger(excludeID) && excludeID > 0 && Number(row.id) === excludeID,
    })),
  };
};

const extractDateKeyFromDateTimeValue = (value) => {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return getLocalDateKey(parsed);
  }
  const normalized = String(value).trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

const toScheduledEventDateTimeOrNull = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === false) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const toManilaScheduledEventDateTime = (eventDate, startTime) => {
  const dateKey = String(eventDate || "").trim().slice(0, 10);
  const timeKey = normalizeTimeToHHMM(startTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !timeKey) return null;
  return toScheduledEventDateTimeOrNull(`${dateKey}T${timeKey}:00+08:00`) || null;
};

const parseTimestampPartsInManila = (value) => {
  if (!value) return { eventDate: "", startTime: "" };
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (match) {
    return { eventDate: match[1], startTime: match[2] };
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const read = (type) => parts.find((part) => part.type === type)?.value || "";
    return {
      eventDate: `${read("year")}-${read("month")}-${read("day")}`,
      startTime: `${read("hour")}:${read("minute")}`,
    };
  }
  return { eventDate: "", startTime: "" };
};

// Slot times are parish (Manila) times, whatever time zone the server runs in.
const getManilaOneHourSlot = (value) => {
  const start = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startTime: parseTimestampPartsInManila(start).startTime,
    endTime: parseTimestampPartsInManila(end).startTime,
  };
};

const APPOINTMENT_CREDENTIAL_SCHEDULE_KEYS = [
  "scheduledEventDateTime",
  "finalSchedule",
  "finalEventSchedule",
  "eventSchedule",
  "eventDateTime",
];

const APPOINTMENT_HAS_CREDENTIAL_SCHEDULE_SQL = `
  (
    NULLIF(BTRIM(COALESCE(
      a.credentials->>'scheduledEventDateTime',
      a.credentials->>'finalSchedule',
      a.credentials->>'finalEventSchedule',
      a.credentials->>'eventSchedule',
      a.credentials->>'eventDateTime'
    )), '') IS NOT NULL
    OR (
      NULLIF(BTRIM(COALESCE(a.credentials->>'eventDate', a.credentials->>'scheduleDate')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(
        a.credentials->>'startTime',
        a.credentials->>'scheduleTime',
        a.credentials->>'eventTime'
      )), '') IS NOT NULL
    )
  )
`;

const REPORT_PAYMENT_SATISFIED_SQL = `
  (
    a."s_sacramentID" IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(a.credentials->'paymentRecords', '[]'::jsonb)) rec
      WHERE COALESCE((rec->>'isArchived')::boolean, false) = false
        AND BTRIM(COALESCE(rec->>'invoiceNumber', '')) <> ''
    )
  )
`;

const appointmentCredentialsHavePaidRecord = (credentials) => {
  const records = Array.isArray(credentials?.paymentRecords) ? credentials.paymentRecords : [];
  return records.some((record) => {
    if (!record || typeof record !== "object") return false;
    if (record.isArchived) return false;
    if (String(record.invoiceNumber || "").trim()) return true;
    return Number(record.amount || 0) > 0;
  });
};

const readCredentialScheduleValue = (credentials) => {
  const source = credentials && typeof credentials === "object" && !Array.isArray(credentials) ? credentials : {};
  for (const key of APPOINTMENT_CREDENTIAL_SCHEDULE_KEYS) {
    const parsed = toScheduledEventDateTimeOrNull(source[key]);
    if (parsed) return parsed;
  }
  const dateKey = String(source.eventDate || source.scheduleDate || "").trim().slice(0, 10);
  const timeKey = normalizeTimeToHHMM(source.startTime || source.scheduleTime || source.eventTime);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && timeKey) {
    return toScheduledEventDateTimeOrNull(`${dateKey}T${timeKey}:00+08:00`);
  }
  return null;
};

const persistAppointmentCredentialSchedule = async (appointmentID, scheduledEventDateTime) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;
  const parsedSchedule = toScheduledEventDateTimeOrNull(scheduledEventDateTime);
  if (!parsedSchedule) {
    await query(
      `
        UPDATE appointments
        SET credentials = COALESCE(credentials, '{}'::jsonb)
          - 'scheduledEventDateTime'
          - 'finalSchedule'
          - 'finalEventSchedule'
          - 'eventSchedule'
          - 'eventDateTime'
        WHERE "appointmentID" = $1
      `,
      [normalizedAppointmentID],
    );
    return null;
  }
  await query(
    `
      UPDATE appointments
      SET credentials = COALESCE(credentials, '{}'::jsonb)
        || jsonb_build_object('scheduledEventDateTime', $2::text)
      WHERE "appointmentID" = $1
    `,
    [normalizedAppointmentID, parsedSchedule],
  );
  return parsedSchedule;
};

const resolveSpecialProgramEventSchedule = async (sSacramentID, dbClient = null) => {
  const normalizedID = Number(sSacramentID);
  if (!Number.isInteger(normalizedID) || normalizedID <= 0) return null;
  const runQuery = (text, values) => (dbClient ? dbClient.query(text, values) : query(text, values));
  const result = await runQuery(
    `
      SELECT
        ss."s_sacramentID",
        ss."timeDate",
        to_char(ss."timeDate", 'YYYY-MM-DD') AS "programDate",
        to_char(ss."timeDate", 'HH24:MI') AS "programTime",
        COALESCE(ce."priestID", ss."priestID") AS "priestID",
        p."fullName" AS "priestName",
        ce."eventDate"::text AS "eventDate",
        ce."startTime" AS "startTime",
        ce."endTime" AS "endTime",
        ss."occupiedSlots" AS "occupiedSlots"
      FROM special_sacraments ss
      LEFT JOIN calendar_entries ce
        ON ce."s_sacramentID" = ss."s_sacramentID"
       AND COALESCE(ce."appointmentID", 0) = 0
      LEFT JOIN priests p ON p."priestID" = COALESCE(ce."priestID", ss."priestID")
      WHERE ss."s_sacramentID" = $1
      ORDER BY ce."calendarID" DESC NULLS LAST
      LIMIT 1
    `,
    [normalizedID],
  );
  const row = result.rows[0];
  if (!row) return null;

  const parsedTimeDate = parseTimestampPartsInManila(row.timeDate);
  const eventDate =
    String(row.eventDate || "").slice(0, 10) ||
    String(row.programDate || "").slice(0, 10) ||
    parsedTimeDate.eventDate;
  const startTime =
    normalizeTimeToHHMM(row.startTime) ||
    normalizeTimeToHHMM(row.programTime) ||
    parsedTimeDate.startTime;
  const scheduledEventDateTime = toManilaScheduledEventDateTime(eventDate, startTime);
  const programSlots = normalizeOccupiedSlots(row.occupiedSlots, null, null);
  const endTime =
    normalizeTimeToHHMM(row.endTime) || normalizeTimeToHHMM(programSlots[programSlots.length - 1]?.endTime) || "";

  const priestID = Number(row.priestID);
  return {
    scheduledEventDateTime: scheduledEventDateTime || null,
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate : "",
    startTime: startTime || "",
    endTime: endTime && (!startTime || endTime > startTime) ? endTime : "",
    timeSlots: programSlots,
    priestID: Number.isInteger(priestID) && priestID > 0 ? priestID : null,
    priestName: String(row.priestName || "").trim(),
  };
};

const applySpecialProgramScheduleToAppointment = async (appointmentID, programSchedule, dbClient = null) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return programSchedule;
  if (!programSchedule?.scheduledEventDateTime) return programSchedule;
  const runQuery = (text, values) => (dbClient ? dbClient.query(text, values) : query(text, values));
  const priestID = Number(programSchedule.priestID);
  if (Number.isInteger(priestID) && priestID > 0) {
    await runQuery(
      `
        UPDATE appointments
        SET "priestID" = $1
        WHERE "appointmentID" = $2
          AND ("priestID" IS DISTINCT FROM $1)
      `,
      [priestID, normalizedAppointmentID],
    );
  }
  await runQuery(
    `
      INSERT INTO progress_tracker ("appointmentID", "scheduledEventDateTime", "updatedAt")
      VALUES ($2, $1::timestamptz, NOW())
      ON CONFLICT ("appointmentID")
      DO UPDATE SET
        "scheduledEventDateTime" = EXCLUDED."scheduledEventDateTime",
        "updatedAt" = NOW()
    `,
    [programSchedule.scheduledEventDateTime, normalizedAppointmentID],
  );
  if (!dbClient) {
    await persistAppointmentCredentialSchedule(normalizedAppointmentID, programSchedule.scheduledEventDateTime);
    await removeAppointmentCalendarEntry(normalizedAppointmentID);
  }
  return programSchedule;
};

const cascadeSpecialProgramScheduleToAppointments = async (sSacramentID, programSchedule) => {
  const normalizedID = Number(sSacramentID);
  if (!Number.isInteger(normalizedID) || normalizedID <= 0) return;
  if (!programSchedule?.scheduledEventDateTime) return;
  const linkedResult = await query(
    `
      SELECT
        a."appointmentID",
        a."priestID",
        pt."scheduledEventDateTime"
      FROM appointments a
      LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
      WHERE a."s_sacramentID" = $1
        AND a.status <> 'CANCELLED'
    `,
    [normalizedID],
  );
  for (const row of linkedResult.rows) {
    const appointmentID = Number(row.appointmentID);
    const previousSchedule = row.scheduledEventDateTime || null;
    const previousPriestID = Number(row.priestID) || null;
    await applySpecialProgramScheduleToAppointment(appointmentID, programSchedule);
    await persistAppointmentCredentialSchedule(appointmentID, programSchedule.scheduledEventDateTime);
    await removeAppointmentCalendarEntry(appointmentID);
    await notifyProgressScheduleUpdated({
      appointmentID,
      previousSchedule,
      nextSchedule: programSchedule.scheduledEventDateTime,
      previousPriestID,
      nextPriestID: programSchedule.priestID,
    });
  }
};

const schedulesOverlap = (startA, endA, startB, endB) => startA < endB && startB < endA;

const attachPriestNameToCalendarEntry = async (entry) => {
  if (!entry) return entry;
  const priestID = Number(entry.priestID);
  if (!Number.isInteger(priestID) || priestID <= 0) {
    return { ...entry, priestName: null };
  }
  const priestResult = await query(
    `
      SELECT "fullName"
      FROM priests
      WHERE "priestID" = $1
      LIMIT 1
    `,
    [priestID],
  );
  return {
    ...entry,
    priestName: String(priestResult.rows[0]?.fullName || "").trim() || null,
  };
};

const PRIEST_CLERGY_TYPES = {
  DIOCESAN: "DIOCESAN",
  RELIGIOUS: "RELIGIOUS",
};
const PRIEST_CLERGY_TYPE_SET = new Set(Object.values(PRIEST_CLERGY_TYPES));
const DEFAULT_RELIGIOUS_ORDER_OPTIONS = [
  { code: "SJ", label: "Jesuits", active: true },
  { code: "OP", label: "Dominicans", active: true },
  { code: "OFM", label: "Franciscans (OFM)", active: true },
  { code: "SDB", label: "Salesians of Don Bosco", active: true },
  { code: "SSJV", label: "SSJV", active: true },
];

const normalizePriestClergyType = (value, { fallbackToDiocesan = true } = {}) => {
  const normalizedValue = String(value || "").trim().toUpperCase();
  if (!normalizedValue) {
    return fallbackToDiocesan ? PRIEST_CLERGY_TYPES.DIOCESAN : "";
  }
  return PRIEST_CLERGY_TYPE_SET.has(normalizedValue) ? normalizedValue : "";
};

const normalizeReligiousOrderCode = (value) => {
  const normalizedValue = String(value || "").trim().toUpperCase();
  return normalizedValue || null;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const isGmailAddress = (email) => String(email || "").trim().toLowerCase().endsWith("@gmail.com");
const normalizeGmailAppPassword = (value) => String(value || "").replace(/\s+/g, "").trim();
const GMAIL_APP_PASSWORD_REGEX = /^[a-zA-Z0-9]{16}$/;
const isValidGmailAppPassword = (value) => GMAIL_APP_PASSWORD_REGEX.test(normalizeGmailAppPassword(value));

const generateTemporaryPassword = (length = 10) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join("");
};

let priestSmtpTransporter = null;
let priestSmtpTransporterKey = "";

const refreshBackendEnv = () => {
  dotenv.config({ path: backendEnvPath, override: true });
};

const isMissingOrPlaceholderValue = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  return normalized.toUpperCase().startsWith("REPLACE_WITH_");
};

const pickFirstConfiguredValue = (...values) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!isMissingOrPlaceholderValue(normalized)) return normalized;
  }
  return "";
};

const resetPriestSmtpTransporter = () => {
  priestSmtpTransporter = null;
  priestSmtpTransporterKey = "";
};

const getParishSecretaryProfileEmail = async () => {
  try {
    const result = await forwardJsonRequestToAdminService("/profile?accountType=admin&accountID=1");
    return normalizeEmail(result?.payload?.user?.email || "");
  } catch (error) {
    console.error("Unable to load parish secretary email for mailer:", error);
    return "";
  }
};

const getAdminGmailSender = async () => {
  try {
    const result = await forwardJsonRequestToAdminService("/internal/gmail-sender", {
      headers: { "X-Faithflow-Internal-Mailer": "faithflow-mailer" },
    });
    if (!result.ok) return { email: "", gmailAppPassword: "" };
    return {
      email: normalizeEmail(result.payload?.email || ""),
      gmailAppPassword: String(result.payload?.gmailAppPassword || "").trim(),
    };
  } catch (error) {
    console.error("Unable to load parish Gmail App Password:", error);
    return { email: "", gmailAppPassword: "" };
  }
};

const verifyPriestSmtpCredentials = async ({ host, port, secure, user, pass }) => {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
  try {
    await transporter.verify();
  } catch (error) {
    const smtpCode = String(error?.responseCode || "");
    const smtpText = String(error?.response || error?.message || "").toLowerCase();
    if (
      smtpCode === "535" ||
      smtpText.includes("invalid login") ||
      smtpText.includes("username and password not accepted")
    ) {
      throw new Error(
        "Gmail rejected this address or App Password. Use a Gmail App Password for that account, not the normal Gmail password.",
      );
    }
    throw new Error(error?.message || "Unable to verify Gmail sender credentials.");
  } finally {
    transporter.close();
  }
};

const getPriestMailerConfig = async () => {
  refreshBackendEnv();
  const host = String(process.env.PRIEST_SMTP_HOST || process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const parsedPort = Number(process.env.PRIEST_SMTP_PORT || process.env.SMTP_PORT || 465);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 465;
  const secure = String(process.env.PRIEST_SMTP_SECURE || process.env.SMTP_SECURE || "true")
    .trim()
    .toLowerCase() !== "false";
  const adminEmailFallback = normalizeEmail(process.env.ADMIN_EMAIL || "");
  const envUser = pickFirstConfiguredValue(process.env.PRIEST_SMTP_USER, process.env.SMTP_USER, adminEmailFallback);
  const envPass = pickFirstConfiguredValue(
    process.env.PRIEST_SMTP_PASS,
    process.env.SMTP_PASS,
    process.env.ADMIN_SMTP_PASS,
    process.env.ADMIN_EMAIL_APP_PASSWORD,
    process.env.ADMIN_PASSWORD,
  );
  const adminGmailSender = await getAdminGmailSender();
  const adminProfileEmail = adminGmailSender.email || (await getParishSecretaryProfileEmail());
  const profileSender = isGmailAddress(adminProfileEmail) ? adminProfileEmail : "";
  const storedSmtpPass = String(adminGmailSender.gmailAppPassword || "").trim();
  const user = pickFirstConfiguredValue(profileSender, envUser);
  const envOAuthUser = String(process.env.PRIEST_GMAIL_OAUTH_USER || user).trim();
  const envOAuthClientId = String(process.env.PRIEST_GMAIL_OAUTH_CLIENT_ID || "").trim();
  const envOAuthClientSecret = String(process.env.PRIEST_GMAIL_OAUTH_CLIENT_SECRET || "").trim();
  const envOAuthRefreshToken = String(process.env.PRIEST_GMAIL_OAUTH_REFRESH_TOKEN || "").trim();
  const envOAuthRedirectUri = String(process.env.PRIEST_GMAIL_OAUTH_REDIRECT_URI || "").trim();
  const envFrom = pickFirstConfiguredValue(
    process.env.PRIEST_SMTP_FROM,
    process.env.SMTP_FROM,
    adminEmailFallback,
    envOAuthUser,
    user,
  );
  const oauthUser = envOAuthUser;
  const oauthClientId = envOAuthClientId;
  const oauthClientSecret = envOAuthClientSecret;
  const oauthRefreshToken = envOAuthRefreshToken;
  const oauthRedirectUri = envOAuthRedirectUri;
  const hasMatchingStoredPass = !isMissingOrPlaceholderValue(storedSmtpPass) && Boolean(profileSender);
  const hasMatchingEnvPass =
    !isMissingOrPlaceholderValue(envPass) && normalizeEmail(envUser) === normalizeEmail(user);
  const pass = hasMatchingStoredPass ? storedSmtpPass : hasMatchingEnvPass ? envPass : profileSender ? "" : envPass;
  const canUseOAuth2 = !isMissingOrPlaceholderValue(oauthUser)
    && !isMissingOrPlaceholderValue(oauthClientId)
    && !isMissingOrPlaceholderValue(oauthClientSecret)
    && !isMissingOrPlaceholderValue(oauthRefreshToken);
  const profileSmtpReady = Boolean(profileSender && user === profileSender && !isMissingOrPlaceholderValue(pass));
  const authMode = !profileSmtpReady && canUseOAuth2 ? "oauth2" : "smtp-password";
  const from = String(
    authMode === "oauth2"
      ? envFrom || oauthUser || user
      : profileSender || envFrom || user,
  ).trim();
  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    authMode,
    oauthUser,
    oauthClientId,
    oauthClientSecret,
    oauthRefreshToken,
    oauthRedirectUri,
    hasStoredMailerSettings: hasMatchingStoredPass,
  };
};

const getPriestSmtpTransporter = async () => {
  const config = await getPriestMailerConfig();
  const missingFields = [];
  if (config.authMode === "oauth2") {
    if (isMissingOrPlaceholderValue(config.oauthUser)) missingFields.push("PRIEST_GMAIL_OAUTH_USER");
    if (isMissingOrPlaceholderValue(config.oauthClientId)) missingFields.push("PRIEST_GMAIL_OAUTH_CLIENT_ID");
    if (isMissingOrPlaceholderValue(config.oauthClientSecret)) missingFields.push("PRIEST_GMAIL_OAUTH_CLIENT_SECRET");
    if (isMissingOrPlaceholderValue(config.oauthRefreshToken)) missingFields.push("PRIEST_GMAIL_OAUTH_REFRESH_TOKEN");
  } else {
    if (isMissingOrPlaceholderValue(config.user)) missingFields.push("PRIEST_SMTP_USER");
    if (isMissingOrPlaceholderValue(config.pass)) missingFields.push("PRIEST_SMTP_PASS");
  }
  if (isMissingOrPlaceholderValue(config.from)) missingFields.push("PRIEST_SMTP_FROM");
  if (missingFields.length > 0) {
    return { transporter: null, config, missingFields };
  }

  const transportKey = config.authMode === "oauth2"
    ? `oauth2|${config.oauthUser}|${config.oauthClientId}|${config.from}`
    : `smtp|${config.host}|${config.port}|${config.secure}|${config.user}|${config.from}`;
  if (!priestSmtpTransporter || priestSmtpTransporterKey !== transportKey) {
    priestSmtpTransporter = config.authMode === "oauth2"
      ? nodemailer.createTransport({
          service: "gmail",
          auth: {
            type: "OAuth2",
            user: config.oauthUser,
            clientId: config.oauthClientId,
            clientSecret: config.oauthClientSecret,
            refreshToken: config.oauthRefreshToken,
          },
        })
      : nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: {
            user: config.user,
            pass: config.pass,
          },
        });
    priestSmtpTransporterKey = transportKey;
  }
  return { transporter: priestSmtpTransporter, config, missingFields: [] };
};

const toInternationalPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\+639\d{9}$/.test(String(value || "").trim())) return String(value).trim();
  return "";
};

const parseSmsGatewayResponse = (responseText) => {
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = responseText.trim();
  }

  if (payload && typeof payload === "object" && typeof payload.body === "string") {
    try {
      payload = { ...payload, ...JSON.parse(payload.body) };
    } catch {
      payload = { ...payload, body: payload.body.trim() };
    }
  }

  const statusCode = Number(payload?.statusCode);
  if (Number.isFinite(statusCode) && statusCode >= 400) {
    throw new Error(`SMS gateway rejected the message (status ${statusCode}).`);
  }

  const status = [payload?.status, payload?.message, payload?.body, typeof payload === "string" ? payload : ""]
    .filter((value) => typeof value === "string")
    .join(" ")
    .trim()
    .toLowerCase();
  const explicitlyAccepted =
    payload?.success === true ||
    payload?.sent === true ||
    payload?.accepted === true ||
    ["success", "succeeded", "sent", "accepted", "queued", "delivered"].includes(status) ||
    Boolean(payload?.messageId || payload?.MessageId || payload?.sid) ||
    (/\b(sent|accepted|queued|delivered)\b/i.test(status) &&
      !/\b(not|failed|failure|error|reject(?:ed)?|unable|could not)\b/i.test(status));
  const explicitlyRejected =
    payload?.success === false ||
    payload?.sent === false ||
    payload?.accepted === false ||
    ["failed", "error", "rejected"].includes(status);

  if (explicitlyRejected || !explicitlyAccepted) {
    const detail = typeof payload?.message === "string" ? ` ${payload.message.slice(0, 180)}` : "";
    throw new Error(`SMS gateway did not confirm acceptance of the message.${detail}`);
  }
};

const sendSms = async ({ phoneNumber, message }) => {
  const normalizedPhone = toInternationalPhone(phoneNumber);
  const body = String(message || "").trim();
  if (!normalizedPhone) throw new Error("The phone number on file is not a valid SMS destination.");
  if (!body) throw new Error("The SMS message is empty and cannot be sent.");
  if (!SMS_LAMBDA_URL) throw new Error("SMS delivery is not configured on the server.");
  const response = await fetch(SMS_LAMBDA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phoneNumber: normalizedPhone,
      message: body,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`SMS provider returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  const responseText = await response.text();
  parseSmsGatewayResponse(responseText);
  return { sent: true, phoneNumber: normalizedPhone };
};

const buildPriestWelcomeSmsMessage = ({ fullName, temporaryPassword }) => {
  const priestName = String(fullName || "Father").trim() || "Father";
  return `Faithflow: Hello Fr. ${priestName}. Your priest account is ready. Temporary password: ${temporaryPassword}. Please sign in and change your password.`;
};

const buildPasswordResetSmsMessage = ({ fullName, accountType, temporaryPassword }) => {
  const normalizedAccountType = String(accountType || "user").trim().toLowerCase();
  const name = String(fullName || "user").trim() || "user";
  const who = normalizedAccountType === "priest" ? `Fr. ${name}` : name;
  return `Faithflow: Hello ${who}. Your new password is ${temporaryPassword}. Sign in and change it soon. Contact the parish if you did not request this.`;
};

const sendPriestWelcomeEmail = async ({ email, fullName, phoneNumber, temporaryPassword }) => {
  const { transporter, config, missingFields } = await getPriestSmtpTransporter();
  if (!transporter) {
    throw new Error(
      `Priest email delivery is not configured for ${config.from || "the parish email"}. Save a Gmail App Password on the Profile page, or set ${missingFields.join(", ")} in backend .env.`,
    );
  }
  const priestEmail = normalizeEmail(email);
  if (!isGmailAddress(priestEmail)) {
    throw new Error("A Gmail address is required to email priest credentials.");
  }
  const priestName = String(fullName || "Father").trim() || "Father";
  const loginPhone = String(phoneNumber || "").trim();
  const loginUsernames = [
    `Google account: ${priestEmail}`,
    loginPhone ? `Phone number: ${loginPhone}` : null,
  ].filter(Boolean);
  const textBody = [
    `Hello Fr. ${priestName},`,
    "",
    "Your Faithflow priest account has been created by the parish secretary.",
    "",
    loginUsernames.length > 1 ? "You can log in with either of these usernames:" : "You can log in with this username:",
    ...loginUsernames,
    "",
    `Temporary password: ${temporaryPassword}`,
    "",
    "Please log in and change your password immediately for security.",
    "",
    "Faithflow System",
  ].join("\n");
  const htmlBody = `
    <p>Hello Fr. ${priestName},</p>
    <p>Your Faithflow priest account has been created by the parish secretary.</p>
    <p>${loginUsernames.length > 1 ? "You can log in with either of these usernames:" : "You can log in with this username:"}</p>
    <ul>
      <li><strong>Google account:</strong> ${priestEmail}</li>
      ${loginPhone ? `<li><strong>Phone number:</strong> ${loginPhone}</li>` : ""}
    </ul>
    <p><strong>Temporary password:</strong> ${temporaryPassword}</p>
    <p>Please log in and change your password immediately for security.</p>
    <p>Faithflow System</p>
  `;
  try {
    await transporter.sendMail({
      from: config.from,
      to: priestEmail,
      subject: "Your Faithflow Priest Account",
      text: textBody,
      html: htmlBody,
    });
  } catch (error) {
    const smtpCode = String(error?.responseCode || "");
    const smtpText = String(error?.response || error?.message || "").toLowerCase();
    if (
      smtpCode === "535" ||
      smtpText.includes("invalid login") ||
      smtpText.includes("username and password not accepted")
    ) {
      if (config.authMode === "oauth2") {
        throw new Error(
          "Gmail rejected OAuth2 credentials. Check PRIEST_GMAIL_OAUTH_USER / CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN values.",
        );
      }
      throw new Error(
        "Gmail rejected SMTP login. Use PRIEST_GMAIL_OAUTH_* variables (no App Password) or set a real Gmail sender with PRIEST_SMTP_USER + PRIEST_SMTP_PASS.",
      );
    }
    throw error;
  }
  try {
    await sendSms({
      phoneNumber: loginPhone,
      message: buildPriestWelcomeSmsMessage({ fullName: priestName, temporaryPassword }),
    });
  } catch (smsError) {
    console.error("Priest welcome SMS error:", smsError);
  }
};

const escapeHtmlText = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const forgotPasswordInFlight = new Set();
const FORGOT_PASSWORD_MAX_PER_WINDOW = 1;
const FORGOT_PASSWORD_WINDOW_HOURS = 24;

const ensurePasswordResetRequestsTable = async () => {
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      "accountType" VARCHAR(20) NOT NULL DEFAULT 'user',
      "accountID" INT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await adminQuery(
    'CREATE INDEX IF NOT EXISTS idx_password_reset_requests_email_created_at ON password_reset_requests (email, "createdAt" DESC)',
  );
  await adminQuery(
    'CREATE INDEX IF NOT EXISTS idx_password_reset_requests_account_type_id_created_at ON password_reset_requests ("accountType", "accountID", "createdAt" DESC)',
  );
};

const formatForgotPasswordRetryWait = (retryAt) => {
  const remainingMs = Math.max(0, new Date(retryAt).getTime() - Date.now());
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  if (remainingMinutes < 60) {
    return `${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`;
  }
  const remainingHours = Math.max(1, Math.ceil(remainingMinutes / 60));
  return `${remainingHours} hour${remainingHours === 1 ? "" : "s"}`;
};

const getForgotPasswordAccountKey = (accountType, accountID) => {
  const normalizedType = String(accountType || "").trim().toLowerCase();
  const normalizedID = Number(accountID);
  if (!normalizedType || !Number.isInteger(normalizedID) || normalizedID <= 0) {
    throw new Error("Unable to identify this account for password recovery.");
  }
  return `${normalizedType}:${normalizedID}`;
};

const assertForgotPasswordLimit = async ({
  email,
  accountType,
  accountID,
  maxPerWindow = FORGOT_PASSWORD_MAX_PER_WINDOW,
}) => {
  const key = getForgotPasswordAccountKey(accountType, accountID);
  if (forgotPasswordInFlight.has(key)) {
    const error = new Error("A password request is already in progress for this account. Please wait a moment.");
    error.status = 429;
    throw error;
  }
  const allowedCount = Math.max(1, Number(maxPerWindow) || FORGOT_PASSWORD_MAX_PER_WINDOW);
  const result = await adminQuery(
    `
      SELECT "createdAt"
      FROM password_reset_requests
      WHERE "accountType" = $1
        AND ("accountID" = $2 OR ("accountID" IS NULL AND email = $3))
        AND "createdAt" > NOW() - ($4 * INTERVAL '1 hour')
      ORDER BY "createdAt" ASC
    `,
    [
      String(accountType).trim().toLowerCase(),
      Number(accountID),
      normalizeEmail(email),
      FORGOT_PASSWORD_WINDOW_HOURS,
    ],
  );
  if (result.rows.length >= allowedCount) {
    const retryAt = new Date(result.rows[0].createdAt).getTime() + FORGOT_PASSWORD_WINDOW_HOURS * 60 * 60 * 1000;
    const limitLabel = allowedCount === 1 ? "one password reset is" : `${allowedCount} password resets are`;
    const error = new Error(
      `Only ${limitLabel} allowed in a 24-hour period. Email and SMS requests share this limit. Please try again in ${formatForgotPasswordRetryWait(retryAt)}.`,
    );
    error.status = 429;
    throw error;
  }
  forgotPasswordInFlight.add(key);
};

const releaseForgotPasswordLock = (accountType, accountID) => {
  forgotPasswordInFlight.delete(getForgotPasswordAccountKey(accountType, accountID));
};

const recordForgotPasswordRequest = async ({ email, accountType = "user", accountID = null }) => {
  const key = normalizeEmail(email);
  if (!key) return;
  await adminQuery(
    `
      INSERT INTO password_reset_requests (email, "accountType", "accountID")
      VALUES ($1, $2, $3)
    `,
    [key, String(accountType || "user").trim().toLowerCase() || "user", Number(accountID) || null],
  );
};

const sendFaithflowPasswordReset = async ({
  email,
  fullName,
  accountType = "user",
  temporaryPassword,
  loginHint = "",
  phoneNumber = "",
  deliveryMethod = "email",
}) => {
  const recipientName = String(fullName || "Faithflow user").trim() || "Faithflow user";
  const normalizedAccountType = String(accountType || "user").trim().toLowerCase();
  const normalizedDeliveryMethod = String(deliveryMethod || "email").trim().toLowerCase();
  if (normalizedDeliveryMethod === "sms") {
    const smsResult = await sendSms({
      phoneNumber,
      message: buildPasswordResetSmsMessage({
        fullName: recipientName,
        accountType: normalizedAccountType,
        temporaryPassword,
      }),
    });
    if (!smsResult.sent) {
      throw new Error("The SMS service did not confirm accepting the new password message. Your password was not changed.");
    }
    return "sms";
  }
  if (normalizedDeliveryMethod !== "email") {
    throw new Error("Choose email or SMS to receive the new password.");
  }
  const normalizedEmail = normalizeEmail(email);
  if (!isGmailAddress(normalizedEmail)) {
    throw new Error("A registered Gmail address is required to send the new password by email.");
  }
  const { transporter, config, missingFields } = await getPriestSmtpTransporter();
  if (!transporter) {
    throw new Error(
      `Password reset email is not configured for ${config.from || "the parish email"}. Save a Gmail App Password on the Profile page, or set ${missingFields.join(", ")} in backend .env.`,
    );
  }
  const accountLabel =
    normalizedAccountType === "priest"
      ? "priest"
      : normalizedAccountType === "admin"
        ? "parish secretary"
        : "parishioner";
  const greeting = normalizedAccountType === "priest" ? `Hello Fr. ${recipientName},` : `Hello ${recipientName},`;
  const loginLine = String(loginHint || email || "").trim();
  const textBody = [
    greeting,
    "",
    `A new Faithflow password was generated for your ${accountLabel} account.`,
    // loginLine ? `Sign in with: ${loginLine}` : null,
    "",
    `New password: ${temporaryPassword}`,
    "",
    "Use this password on the Faithflow login page. For security, change it after you sign in.",
    "",
    "If you did not request this, contact the parish office.",
    "",
    "Faithflow System",
  ]
    .filter((line) => line !== null)
    .join("\n");
  const htmlBody = `
    <p>${escapeHtmlText(greeting)}</p>
    <p>A new Faithflow password was generated for your ${escapeHtmlText(accountLabel)} account.</p>
    ${loginLine ? `<p><strong>Sign in with:</strong> ${escapeHtmlText(loginLine)}</p>` : ""}
    <p><strong>New password:</strong> ${escapeHtmlText(temporaryPassword)}</p>
    <p>Use this password on the Faithflow login page. For security, change it after you sign in.</p>
    <p>If you did not request this, contact the parish office.</p>
    <p>Faithflow System</p>
  `;
  try {
    await transporter.sendMail({
      from: config.from,
      to: normalizedEmail,
      subject: "Your new Faithflow password",
      text: textBody,
      html: htmlBody,
    });
  } catch (error) {
    const smtpCode = String(error?.responseCode || "");
    const smtpText = String(error?.response || error?.message || "").toLowerCase();
    if (
      smtpCode === "535" ||
      smtpText.includes("invalid login") ||
      smtpText.includes("username and password not accepted")
    ) {
      throw new Error(
        "Gmail could not send the password email. Ask the parish office to check the parish sender Gmail on Profile.",
      );
    }
    throw error;
  }
  return "email";
};

const isTrustedLocalMailRequest = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || String(req.socket?.remoteAddress || req.ip || "");
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip.endsWith("127.0.0.1");
};

const parseAndNormalizeReligiousOrderOptions = (options) => {
  if (!Array.isArray(options)) {
    throw new Error("religiousOrderOptions must be an array.");
  }

  const seenCodes = new Set();
  const normalizedOptions = [];
  for (const option of options) {
    if (!option || typeof option !== "object" || Array.isArray(option)) {
      throw new Error("Each religious order option must be an object.");
    }
    const code = String(option.code || "").trim().toUpperCase();
    const label = String(option.label || "").trim();
    const active = option.active !== false;

    if (!code) {
      throw new Error("Each religious order option requires a code.");
    }
    if (!/^[A-Z0-9._-]{2,30}$/.test(code)) {
      throw new Error("Religious order code can only contain A-Z, 0-9, dot, underscore, and hyphen.");
    }
    if (!label) {
      throw new Error(`Religious order option "${code}" requires a label.`);
    }
    if (seenCodes.has(code)) {
      throw new Error(`Duplicate religious order code: ${code}.`);
    }

    seenCodes.add(code);
    normalizedOptions.push({ code, label, active: Boolean(active) });
  }

  return normalizedOptions;
};

const normalizeReligiousOrderOptionsFromDatabase = (value) => {
  if (!Array.isArray(value)) {
    return DEFAULT_RELIGIOUS_ORDER_OPTIONS.map((item) => ({ ...item }));
  }

  try {
    return parseAndNormalizeReligiousOrderOptions(value);
  } catch {
    return DEFAULT_RELIGIOUS_ORDER_OPTIONS.map((item) => ({ ...item }));
  }
};

const notificationStreamClients = {
  admin: new Map(),
  user: new Map(),
  priest: new Map(),
};

const getNotificationClientSet = (accountType, accountID) => {
  const typeKey =
    accountType === "admin" ? "admin" : accountType === "user" ? "user" : accountType === "priest" ? "priest" : null;
  const normalizedID = Number(accountID);
  if (!typeKey || !Number.isInteger(normalizedID) || normalizedID <= 0) return null;
  const clientsByType = notificationStreamClients[typeKey];
  if (!clientsByType.has(normalizedID)) {
    clientsByType.set(normalizedID, new Set());
  }
  return clientsByType.get(normalizedID);
};

const pushNotificationStreamEvent = (accountType, accountID, payload = {}) => {
  const targetClients = getNotificationClientSet(accountType, accountID);
  if (!targetClients || targetClients.size === 0) return;
  const serializedPayload = JSON.stringify({
    ...payload,
    accountType,
    accountID: Number(accountID),
    emittedAt: new Date().toISOString(),
  });

  for (const response of Array.from(targetClients)) {
    try {
      response.write(`event: notification\ndata: ${serializedPayload}\n\n`);
    } catch {
      targetClients.delete(response);
    }
  }
};

const broadcastAdminRealtimeEvent = (payload = {}) => {
  for (const [adminID, clientSet] of notificationStreamClients.admin.entries()) {
    if (!clientSet || clientSet.size === 0) continue;
    pushNotificationStreamEvent("admin", adminID, {
      action: "realtime_update",
      ...payload,
    });
  }
};

const broadcastUserRealtimeEvent = (payload = {}) => {
  for (const [userID, clientSet] of notificationStreamClients.user.entries()) {
    if (!clientSet || clientSet.size === 0) continue;
    pushNotificationStreamEvent("user", userID, {
      action: "realtime_update",
      ...payload,
    });
  }
};

const refreshSpecialSacramentAppliedCounts = async (dbClient = { query }) => {
  await dbClient.query(`
    UPDATE special_sacraments ss
    SET "currentAppliedCount" = (
      SELECT COUNT(*)::INT
      FROM appointments a
      WHERE a."s_sacramentID" = ss."s_sacramentID" AND a.status <> 'CANCELLED'
    )
  `);
};

const createAdminNotification = async (
  { adminID, type = "system", title = "Notification", body, severity = "info", metadata = {} },
  dbClient = { query },
) => {
  const normalizedAdminID = Number(adminID);
  if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) return;
  const normalizedBody = String(body || "").trim();
  if (!normalizedBody) return;
  const normalizedTitle = String(title || "Notification").trim() || "Notification";
  const normalizedType = String(type || "system").trim().slice(0, 50) || "system";
  const normalizedSeverity = String(severity || "info").trim().slice(0, 20) || "info";
  const normalizedMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};

  const { ok, payload } = await forwardJsonRequestToAdminService("/admin-notifications", {
    method: "POST",
    body: {
      adminID: normalizedAdminID,
      type: normalizedType,
      title: normalizedTitle,
      body: normalizedBody,
      severity: normalizedSeverity,
      metadata: normalizedMetadata,
    },
  });
  if (!ok) {
    throw new Error(String(payload?.message || "Unable to create admin notification in admin service."));
  }
  pushNotificationStreamEvent("admin", normalizedAdminID, {
    action: "created",
    notificationId: Number(payload?.id) || null,
    type: normalizedType,
    title: normalizedTitle,
    body: normalizedBody,
    metadata: normalizedMetadata,
  });
  return payload || null;
};

const createUserNotification = async (
  { userID, type = "system", title = "Notification", body, severity = "info", metadata = {} },
  dbClient = { query },
) => {
  const normalizedUserID = Number(userID);
  if (!Number.isInteger(normalizedUserID) || normalizedUserID <= 0) return null;
  const normalizedBody = String(body || "").trim();
  if (!normalizedBody) return null;
  const normalizedTitle = String(title || "Notification").trim() || "Notification";
  const normalizedType = String(type || "system").trim().slice(0, 50) || "system";
  const normalizedSeverity = String(severity || "info").trim().slice(0, 20) || "info";
  const normalizedMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};

  const result = await dbClient.query(
    `
      INSERT INTO user_notifications ("userID", type, title, body, severity, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING "userNotifID", "userID", type, title, body, severity, metadata, "isRead", "createdAt", "readAt"
    `,
    [normalizedUserID, normalizedType, normalizedTitle, normalizedBody, normalizedSeverity, JSON.stringify(normalizedMetadata)],
  );
  pushNotificationStreamEvent("user", normalizedUserID, {
    action: "created",
    notificationId: Number(result.rows[0]?.userNotifID) || null,
    type: normalizedType,
    title: normalizedTitle,
    body: normalizedBody,
    severity: normalizedSeverity,
    metadata: normalizedMetadata,
  });
  return result.rows[0] || null;
};

const createPriestNotification = async (
  { priestID, type = "system", title = "Notification", body, severity = "info", metadata = {} },
  dbClient = { query },
) => {
  const normalizedPriestID = Number(priestID);
  if (!Number.isInteger(normalizedPriestID) || normalizedPriestID <= 0) return null;
  const normalizedBody = String(body || "").trim();
  if (!normalizedBody) return null;
  const normalizedTitle = String(title || "Notification").trim() || "Notification";
  const normalizedType = String(type || "system").trim().slice(0, 50) || "system";
  const normalizedSeverity = String(severity || "info").trim().slice(0, 20) || "info";
  const normalizedMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};

  const result = await dbClient.query(
    `
      INSERT INTO priest_notifications ("priestID", type, title, body, severity, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING "priestNotifID", "priestID", type, title, body, severity, metadata, "isRead", "createdAt", "readAt"
    `,
    [
      normalizedPriestID,
      normalizedType,
      normalizedTitle,
      normalizedBody,
      normalizedSeverity,
      JSON.stringify(normalizedMetadata),
    ],
  );
  pushNotificationStreamEvent("priest", normalizedPriestID, {
    action: "created",
    notificationId: Number(result.rows[0]?.priestNotifID) || null,
    type: normalizedType,
    title: normalizedTitle,
    body: normalizedBody,
    severity: normalizedSeverity,
    metadata: normalizedMetadata,
  });
  return result.rows[0] || null;
};

const buildPriestAssignedAppointmentsPath = ({ scheduleID = null, view = "awaiting" } = {}) => {
  const params = new URLSearchParams();
  if (view) params.set("view", String(view));
  const normalizedScheduleID = Number(scheduleID);
  if (Number.isInteger(normalizedScheduleID) && normalizedScheduleID > 0) {
    params.set("scheduleID", String(normalizedScheduleID));
  }
  const query = params.toString();
  return query ? `/priest/assigned-appointments?${query}` : "/priest/assigned-appointments";
};

const buildAdminPriestManagementPath = ({
  priestID = null,
  scheduleID = null,
  remarkID = null,
  appointmentID = null,
  view = "",
} = {}) => {
  const params = new URLSearchParams();
  const normalizedPriestID = Number(priestID);
  if (Number.isInteger(normalizedPriestID) && normalizedPriestID > 0) {
    params.set("priestID", String(normalizedPriestID));
  }
  if (view) params.set("view", String(view));
  const normalizedScheduleID = Number(scheduleID);
  if (Number.isInteger(normalizedScheduleID) && normalizedScheduleID > 0) {
    params.set("scheduleID", String(normalizedScheduleID));
  }
  const normalizedRemarkID = Number(remarkID);
  if (Number.isInteger(normalizedRemarkID) && normalizedRemarkID > 0) {
    params.set("remarkID", String(normalizedRemarkID));
  }
  const normalizedAppointmentID = Number(appointmentID);
  if (Number.isInteger(normalizedAppointmentID) && normalizedAppointmentID > 0) {
    params.set("appointmentID", String(normalizedAppointmentID));
  }
  const query = params.toString();
  return query ? `/admin/priest-management?${query}` : "/admin/priest-management";
};

const resolveAppointmentIDFromCalendarEntry = (entry = {}) => {
  const fromColumn = Number(entry?.appointmentID);
  return Number.isInteger(fromColumn) && fromColumn > 0 ? fromColumn : null;
};

const toManilaScheduleTimestamp = (eventDate, startTime) => {
  const dateKey = String(eventDate || "").trim().slice(0, 10);
  const timeKey = normalizeTimeToHHMM(startTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !timeKey) return null;
  return `${dateKey}T${timeKey}:00+08:00`;
};

const syncLinkedAppointmentScheduleFromCalendarEntry = async ({
  appointmentID,
  eventDate,
  startTime,
  priestID = null,
  previousEventDate = null,
  previousStartTime = null,
}) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;

  const existingResult = await query(
    `
      SELECT
        a."priestID",
        pt."scheduledEventDateTime"
      FROM appointments a
      LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  if (existingResult.rows.length === 0) return null;

  const previousPriestID = Number(existingResult.rows[0]?.priestID);
  const previousSchedule =
    existingResult.rows[0]?.scheduledEventDateTime ||
    toManilaScheduleTimestamp(previousEventDate, previousStartTime);
  const nextSchedule = toManilaScheduleTimestamp(eventDate, startTime);
  const nextPriestID = Number.isInteger(Number(priestID)) && Number(priestID) > 0 ? Number(priestID) : null;

  if (nextSchedule) {
    await query(
      `
        UPDATE progress_tracker
        SET
          "scheduledEventDateTime" = $1::timestamptz,
          "updatedAt" = NOW()
        WHERE "appointmentID" = $2
      `,
      [nextSchedule, normalizedAppointmentID],
    );
    await persistAppointmentCredentialSchedule(normalizedAppointmentID, nextSchedule);
  }
  if (nextPriestID) {
    await query(
      `
        UPDATE appointments
        SET "priestID" = $1
        WHERE "appointmentID" = $2
          AND ("priestID" IS DISTINCT FROM $1)
      `,
      [nextPriestID, normalizedAppointmentID],
    );
  }

  await restoreAppointmentCalendarEntry(normalizedAppointmentID);

  return notifyProgressScheduleUpdated({
    appointmentID: normalizedAppointmentID,
    previousSchedule,
    nextSchedule,
    previousPriestID,
    nextPriestID,
  });
};

const removeAppointmentCalendarEntry = async (appointmentID) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;
  const result = await query(
    `
      DELETE FROM calendar_entries
      WHERE "appointmentID" = $1
      RETURNING "calendarID" AS id
    `,
    [normalizedAppointmentID],
  );
  return result.rows[0] || null;
};

const restoreAppointmentCalendarEntry = async (appointmentID) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;

  const appointmentResult = await query(
    `
      SELECT
        a."appointmentID",
        a."priestID",
        a."s_sacramentID",
        a.status::text AS status,
        a."isArchived",
        a.credentials,
        COALESCE(s."sacramentName", ss."s_sacramentName", 'Service') AS "serviceName"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  const appointment = appointmentResult.rows[0];
  if (!appointment) return null;

  const linkedSpecialSacramentID = Number(appointment.s_sacramentID);
  if (Number.isInteger(linkedSpecialSacramentID) && linkedSpecialSacramentID > 0) {
    await removeAppointmentCalendarEntry(normalizedAppointmentID);
    return null;
  }

  const adminID = 1;
  const priestID = Number(appointment.priestID);
  const resolvedPriestID = Number.isInteger(priestID) && priestID > 0 ? priestID : null;
  const credentialSchedule = readCredentialScheduleValue(appointment.credentials);
  const schedulePartsResult = credentialSchedule
    ? await query(
        `
          SELECT
            to_char(($1::timestamptz AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS "eventDate",
            to_char($1::timestamptz AT TIME ZONE 'Asia/Manila', 'HH24:MI') AS "startTime",
            to_char(($1::timestamptz + INTERVAL '1 hour') AT TIME ZONE 'Asia/Manila', 'HH24:MI') AS "endTime"
        `,
        [credentialSchedule],
      )
    : { rows: [] };
  const eventDate = String(schedulePartsResult.rows[0]?.eventDate || "").trim();
  const startTime = String(schedulePartsResult.rows[0]?.startTime || "").trim();
  const endTime = String(schedulePartsResult.rows[0]?.endTime || "").trim();
  const hasAssignedPriest = Boolean(resolvedPriestID);
  const hasCredentialSchedule = Boolean(credentialSchedule) && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && startTime && endTime;
  const isCancelledOrArchived =
    appointment.isArchived === true || String(appointment.status || "").toUpperCase() === "CANCELLED";

  if (!hasAssignedPriest || !hasCredentialSchedule || isCancelledOrArchived || !Number.isInteger(adminID) || adminID <= 0) {
    await removeAppointmentCalendarEntry(normalizedAppointmentID);
    return null;
  }

  if (!appointmentCredentialsHavePaidRecord(appointment.credentials)) {
    await removeAppointmentCalendarEntry(normalizedAppointmentID);
    return null;
  }

  const serviceName = String(appointment.serviceName || "Service").trim() || "Service";
  const title = serviceName;
  const sSacramentID = Number(appointment.s_sacramentID);
  const resolvedSSacramentID = Number.isInteger(sSacramentID) && sSacramentID > 0 ? sSacramentID : null;

  const existingResult = await query(
    `
      SELECT "calendarID" AS id
      FROM calendar_entries
      WHERE "appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );

  const calendarValues = [
    title,
    eventDate,
    startTime,
    endTime,
    "Parish",
    resolvedSSacramentID,
    resolvedPriestID,
    adminID,
    normalizedAppointmentID,
  ];

  if (existingResult.rows.length > 0) {
    const updateResult = await query(
      `
        UPDATE calendar_entries
        SET
          title = $1,
          "scheduleType" = 'priest_schedule',
          "eventDate" = $2::date,
          "startTime" = $3,
          "endTime" = $4,
          location = $5,
          notes = NULL,
          "s_sacramentID" = $6,
          "priestID" = $7,
          "adminID" = $8,
          "updatedAt" = NOW()
        WHERE "appointmentID" = $9
        RETURNING
          "calendarID" AS id,
          title,
          "appointmentID",
          "adminID",
          "priestID",
          "eventDate"::text AS "eventDate",
          "startTime" AS "startTime",
          "endTime" AS "endTime"
      `,
      calendarValues,
    );
    return updateResult.rows[0] || null;
  }

  const insertResult = await query(
    `
      INSERT INTO calendar_entries (
        title,
        "scheduleType",
        "eventDate",
        "startTime",
        "endTime",
        location,
        notes,
        "s_sacramentID",
        "priestID",
        "adminID",
        "appointmentID"
      )
      VALUES ($1, 'priest_schedule', $2::date, $3, $4, $5, NULL, $6, $7, $8, $9)
      RETURNING
        "calendarID" AS id,
        title,
        "appointmentID",
        "adminID",
        "priestID",
        "eventDate"::text AS "eventDate",
        "startTime" AS "startTime",
        "endTime" AS "endTime"
    `,
    calendarValues,
  );
  return insertResult.rows[0] || null;
};

const ensureAppointmentCalendarEntriesForAdmin = async (adminID) => {
  const normalizedAdminID = Number(adminID);
  if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) return;

  await query(
    `
      DELETE FROM calendar_entries ce
      WHERE ce."adminID" = $1
        AND ce."appointmentID" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM appointments a
          WHERE a."appointmentID" = ce."appointmentID"
            AND a."isArchived" = FALSE
            AND a.status = 'CONFIRMED'
            AND a."priestID" IS NOT NULL
            AND ${APPOINTMENT_HAS_CREDENTIAL_SCHEDULE_SQL}
            AND ${REPORT_PAYMENT_SATISFIED_SQL}
        )
    `,
    [normalizedAdminID],
  );

  const scheduledResult = await query(
    `
      SELECT a."appointmentID"
      FROM appointments a
      WHERE a."isArchived" = FALSE
        AND a.status = 'CONFIRMED'
        AND a."priestID" IS NOT NULL
        AND ${APPOINTMENT_HAS_CREDENTIAL_SCHEDULE_SQL}
        AND ${REPORT_PAYMENT_SATISFIED_SQL}
        AND COALESCE((a.credentials->>'removedFromCalendar')::boolean, false) = false
        AND (
          NOT EXISTS (
            SELECT 1
            FROM calendar_entries ce
            WHERE ce."appointmentID" = a."appointmentID"
          )
          OR EXISTS (
            SELECT 1
            FROM calendar_entries ce
            WHERE ce."appointmentID" = a."appointmentID"
              AND (
                ce."eventDate" IS NULL
                OR ce.title IS NULL
                OR ce."priestID" IS DISTINCT FROM a."priestID"
              )
          )
        )
      ORDER BY a."appointmentID" ASC
    `,
  );

  for (const row of scheduledResult.rows) {
    try {
      await restoreAppointmentCalendarEntry(row.appointmentID);
    } catch (error) {
      console.error("Appointment calendar sync error:", error);
    }
  }
};

const resolveCalendarAppointmentID = async ({ appointmentID } = {}) => {
  const resolved = Number.isInteger(Number(appointmentID)) && Number(appointmentID) > 0 ? Number(appointmentID) : null;
  if (!resolved) return null;
  const existing = await query(
    `
      SELECT "appointmentID"
      FROM appointments
      WHERE "appointmentID" = $1
      LIMIT 1
    `,
    [resolved],
  );
  return existing.rows[0]?.appointmentID || null;
};

const calendarEntryHasActivePriestSql = (priestIdExpr = 'ce."priestID"') => `
  (
    ${priestIdExpr} IS NULL
    OR EXISTS (
      SELECT 1
      FROM priests calendar_priest
      WHERE calendar_priest."priestID" = ${priestIdExpr}
        AND COALESCE(calendar_priest."isActive", TRUE) = TRUE
    )
  )
`;

const restorePriestAppointmentCalendarEntries = async (priestID) => {
  const appointmentsResult = await query(
    `
      SELECT a."appointmentID"
      FROM appointments a
      WHERE a."priestID" = $1
        AND a."isArchived" = FALSE
        AND a.status = 'CONFIRMED'
        AND a."finishedAt" IS NULL
        AND ${APPOINTMENT_HAS_CREDENTIAL_SCHEDULE_SQL}
        AND ${REPORT_PAYMENT_SATISFIED_SQL}
      ORDER BY a."appointmentID" ASC
    `,
    [priestID],
  );

  let restoredMissing = 0;
  for (const row of appointmentsResult.rows) {
    try {
      const created = await restoreAppointmentCalendarEntry(row.appointmentID);
      if (created) restoredMissing += 1;
    } catch (restoreError) {
      console.error("Priest reactivate calendar restore error:", restoreError);
    }
  }

  return { restoredMissing };
};

const normalizePersonNameKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

const deletePriestAccountCompletely = async ({ priestID, adminID }) => {
  const normalizedPriestID = Number(priestID);
  const normalizedAdminID = Number(adminID);
  if (!Number.isInteger(normalizedPriestID) || normalizedPriestID <= 0) {
    throw Object.assign(new Error("A valid priestID is required."), { status: 400 });
  }
  if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) {
    throw Object.assign(new Error("A valid adminID is required."), { status: 400 });
  }

  const existingResult = await query(
    `
      SELECT "priestID", "fullName", email, "phoneNumber", photo
      FROM priests
      WHERE "priestID" = $1 AND "adminID" = $2
      LIMIT 1
    `,
    [normalizedPriestID, normalizedAdminID],
  );
  if (existingResult.rows.length === 0) {
    throw Object.assign(new Error("Priest not found."), { status: 404 });
  }

  const priest = existingResult.rows[0];
  const priestEmail = normalizeEmail(priest.email);
  const priestPhone = String(priest.phoneNumber || "").trim();
  const priestNameKey = normalizePersonNameKey(priest.fullName);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`UPDATE appointments SET "priestID" = NULL WHERE "priestID" = $1`, [normalizedPriestID]);
    await client.query(`DELETE FROM calendar_entries WHERE "priestID" = $1`, [normalizedPriestID]);
    await client.query(`DELETE FROM priest_schedule_remarks WHERE "priestID" = $1`, [normalizedPriestID]);
    await client.query(`DELETE FROM priest_notifications WHERE "priestID" = $1`, [normalizedPriestID]);

    const linkedUsersResult = await client.query(
      `
        SELECT "userID", ${sqlPersonFullName()} AS "fullName", email, "contactNumber"
        FROM users
        WHERE ($1 <> '' AND LOWER(TRIM(email)) = $1)
           OR ($2 <> '' AND BTRIM(COALESCE("contactNumber", '')) = $2)
      `,
      [priestEmail, priestPhone],
    );
    const namedUsersResult = priestNameKey
      ? await client.query(`SELECT "userID", ${sqlPersonFullName()} AS "fullName", email, "contactNumber" FROM users`)
      : { rows: [] };
    const linkedUsers = [
      ...linkedUsersResult.rows,
      ...namedUsersResult.rows.filter((row) => normalizePersonNameKey(row.fullName) === priestNameKey),
    ].filter((row, index, list) => list.findIndex((item) => Number(item.userID) === Number(row.userID)) === index);

    for (const user of linkedUsers) {
      const userID = Number(user.userID);
      if (!Number.isInteger(userID) || userID <= 0) continue;
      await client.query(`DELETE FROM cert_request WHERE "userID" = $1`, [userID]);
      await client.query(`DELETE FROM appointments WHERE "userID" = $1`, [userID]);
      await client.query(`DELETE FROM user_notifications WHERE "userID" = $1`, [userID]);
      await client.query(`DELETE FROM users WHERE "userID" = $1`, [userID]);
    }

    await client.query(`DELETE FROM priests WHERE "priestID" = $1 AND "adminID" = $2`, [normalizedPriestID, normalizedAdminID]);
    await client.query("COMMIT");

    await deleteStoredProfilePhotoIfExists(priest.photo, "priest");
    return {
      priest,
      deletedUserIDs: linkedUsers.map((row) => Number(row.userID)).filter((id) => Number.isInteger(id) && id > 0),
      deletedEmails: [priestEmail, ...linkedUsers.map((row) => normalizeEmail(row.email))].filter(Boolean),
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    client.release();
  }
};

// Every string value anywhere in the appointment's credentials that is a Philippine mobile number:
// starts with "09" and is exactly 11 digits (e.g. "09171234567"), whatever the question was called.
const getAppointmentCredentialPhoneNumbers = (credentials) => {
  const found = [];
  const visit = (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (/^09\d{9}$/.test(trimmed)) found.push(trimmed);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(credentials);
  return found;
};

// Texts the same message once to each distinct number (account contactNumber + every 09XXXXXXXXX value in
// the appointment credentials). Fire-and-forget so a slow or failing SMS gateway never blocks or breaks the
// admin action that triggered it; results go to the backend log.
const sendAppointmentRequesterSms = ({ appointmentID, label, message, phoneNumbers = [], logSubject = "" }) => {
  const subject = logSubject || `Appointment ${appointmentID}`;
  const recipients = [];
  const seen = new Set();
  for (const value of phoneNumbers) {
    const international = toInternationalPhone(value);
    if (!international || seen.has(international)) continue;
    seen.add(international);
    recipients.push(String(value).trim());
  }
  if (recipients.length === 0 || !String(message || "").trim()) return;

  for (const phoneNumber of recipients) {
    sendSms({ phoneNumber, message })
      .then(() => console.log(`${subject} ${label} SMS accepted for ${phoneNumber}.`))
      .catch((error) => console.error(`${subject} ${label} SMS failed for ${phoneNumber}:`, error.message));
  }
};

const sendAppointmentDecisionSms = ({ appointmentID, action, serviceName, declineReason = "", phoneNumbers = [] }) => {
  const reason = toSmsSafeText(declineReason).replace(/[.\s]+$/, "");
  const smsServiceName = toSmsSafeText(serviceName) || "appointment";
  const messageByAction = {
    approved: `Faithflow: Your ${smsServiceName} appointment request was approved. Check your Status page for the next steps.`,
    declined: `Faithflow: Your ${smsServiceName} appointment request was declined.${reason ? ` Reason: ${reason}.` : ""} Contact the parish office for questions.`,
    // "Cancel Appointment" on a confirmed appointment (Progress Tracker / Report Generation).
    cancelled: `Faithflow: Your appointment for ${smsServiceName} is cancelled${reason ? `, because ${reason}` : ""}.`,
    // "Restore" on a cancelled appointment in Progress Tracker (back to CONFIRMED).
    restored: `Faithflow: Good news! Your appointment for ${smsServiceName} has been restored by the parish office. Check your Status page to continue.`,
  };
  const message = messageByAction[action];
  if (!message) return;
  sendAppointmentRequesterSms({ appointmentID, label: action, message, phoneNumbers });
};

const notifyAppointmentRequester = async ({ appointmentID, action, declineReason = "" }) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;

  const appointmentResult = await query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName",
        u."contactNumber" AS "userContactNumber",
        a.credentials
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN users u ON u."userID" = a."userID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  const appointment = appointmentResult.rows[0];
  if (appointment && ["approved", "declined", "cancelled", "restored"].includes(action)) {
    sendAppointmentDecisionSms({
      appointmentID: normalizedAppointmentID,
      action,
      serviceName: String(appointment.serviceName || "appointment").trim() || "appointment",
      declineReason,
      phoneNumbers: [
        appointment.userContactNumber,
        ...getAppointmentCredentialPhoneNumbers(appointment.credentials),
      ],
    });
  }
  const userID = Number(appointment?.userID);
  if (!appointment || !Number.isInteger(userID) || userID <= 0) return null;

  const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
  const normalizedDeclineReason = String(declineReason || "").trim();
  const notificationByAction = {
    approved: {
      type: "appointment_approved",
      title: "Appointment request approved",
      body: `Your ${serviceName} appointment request was approved.`,
      severity: "success",
    },
    declined: {
      type: "appointment_declined",
      title: "Appointment request declined",
      body: normalizedDeclineReason
        ? `Your ${serviceName} appointment request was declined. Reason: ${normalizedDeclineReason}`
        : `Your ${serviceName} appointment request was declined.`,
      severity: "warning",
    },
    cancelled: {
      type: "appointment_cancelled",
      title: "Appointment cancelled",
      body: normalizedDeclineReason
        ? `Your ${serviceName} appointment was cancelled by the parish office. Reason: ${normalizedDeclineReason}`
        : `Your ${serviceName} appointment was cancelled by the parish office.`,
      severity: "warning",
    },
    under_review: {
      type: "appointment_under_review",
      title: "Appointment request under review",
      body: `Your ${serviceName} appointment request is now under review.`,
      severity: "info",
    },
    restored: {
      type: "appointment_restored",
      title: "Appointment restored",
      body: `Your ${serviceName} appointment was restored by the parish office. You can continue it on your Status page.`,
      severity: "success",
    },
  };
  const notification = notificationByAction[action];
  if (!notification) return null;

  return createUserNotification({
    userID,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    severity: notification.severity,
    metadata: {
      path: `/dashboard/status/${normalizedAppointmentID}`,
      appointmentID: normalizedAppointmentID,
      action,
    },
  });
};

const CERTIFICATE_PICKUP_TIME_SLOTS = [
  { startTime: "08:00", endTime: "09:00" },
  { startTime: "09:00", endTime: "10:00" },
  { startTime: "10:00", endTime: "11:00" },
  { startTime: "11:00", endTime: "12:00" },
  { startTime: "13:00", endTime: "14:00" },
  { startTime: "14:00", endTime: "15:00" },
  { startTime: "15:00", endTime: "16:00" },
  { startTime: "16:00", endTime: "17:00" },
];

const normalizeCertificateClockTime = (value) => {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "";
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const resolveCertificatePickupSlot = (startTime, endTime) => {
  const start = normalizeCertificateClockTime(startTime);
  if (!start) return null;
  const matched = CERTIFICATE_PICKUP_TIME_SLOTS.find((slot) => slot.startTime === start);
  if (!matched) return null;
  const end = normalizeCertificateClockTime(endTime);
  if (end && end !== matched.endTime) return null;
  return matched;
};

const formatCertificateClockLabel = (timeValue) => {
  const normalized = normalizeCertificateClockTime(timeValue);
  if (!normalized) return "";
  const [hoursRaw, minutesRaw] = normalized.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
};

const toCertificatePickupDateKey = (pickupDate) => {
  if (!pickupDate) return "";
  if (pickupDate instanceof Date && !Number.isNaN(pickupDate.getTime())) {
    return pickupDate.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  }
  const raw = String(pickupDate).trim();
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return parsedDate.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
};

const formatCertificatePickupDateLabel = (pickupDate) => {
  const dateKey = toCertificatePickupDateKey(pickupDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "";
  const parsedDate = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return dateKey;
  return parsedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const getCertificatePickupEndTime = (pickupTime) => resolveCertificatePickupSlot(pickupTime)?.endTime || null;

const formatCertificatePickupLabel = (pickupDate, pickupTime) => {
  const dateLabel = formatCertificatePickupDateLabel(pickupDate);
  const slot = resolveCertificatePickupSlot(pickupTime);
  const startLabel = formatCertificateClockLabel(slot?.startTime || pickupTime);
  const endLabel = formatCertificateClockLabel(slot?.endTime);
  if (dateLabel && startLabel && endLabel) return `${dateLabel}, ${startLabel} - ${endLabel}`;
  if (dateLabel && startLabel) return `${dateLabel}, ${startLabel}`;
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return dateLabel || startLabel;
};

const OFFICE_WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const getOfficeDayWeekdayFromDateKey = (dateKey) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return null;
  const parsedDate = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getDay();
};

const assertCertificatePickupDateNotOfficeDayOff = async (dateKey, adminID = 1) => {
  const normalizedDateKey = String(dateKey || "").slice(0, 10);
  const normalizedAdminID = Number(adminID);
  const parishAdminID = Number.isInteger(normalizedAdminID) && normalizedAdminID > 0 ? normalizedAdminID : 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateKey)) {
    return { ok: false, message: "Pickup date is required." };
  }

  const weekday = getOfficeDayWeekdayFromDateKey(normalizedDateKey);
  const [weekdayResult, specificDateResult] = await Promise.all([
    query(
      `
        SELECT weekday
        FROM recurring_day_offs
        WHERE "adminID" = $1
        ORDER BY "recurringID" DESC
        LIMIT 1
      `,
      [parishAdminID],
    ),
    query(
      `
        SELECT 1
        FROM day_off_dates
        WHERE "adminID" = $1
          AND "dayOffDate" = $2::date
        LIMIT 1
      `,
      [parishAdminID, normalizedDateKey],
    ),
  ]);

  const recurringWeekday = weekdayResult.rows.length > 0 ? Number(weekdayResult.rows[0].weekday) : null;
  if (specificDateResult.rows.length > 0) {
    return { ok: false, message: "Office is closed on that date. Choose another pickup day." };
  }
  if (Number.isInteger(recurringWeekday) && recurringWeekday === weekday) {
    const dayName = OFFICE_WEEKDAY_LABELS[recurringWeekday] || "the office day off";
    return { ok: false, message: `Office is closed on ${dayName}s. Choose another pickup day.` };
  }
  return { ok: true };
};

const notifyCertificateRequester = async ({
  certID,
  action,
  declineReason = "",
  pickupDate = null,
  pickupTime = null,
}) => {
  const normalizedCertID = Number(certID);
  if (!Number.isInteger(normalizedCertID) || normalizedCertID <= 0) return null;

  const requestResult = await query(
    `
      SELECT
        cr."certID",
        cr."userID",
        COALESCE(ct."formSchema"->>'label', 'certificate') AS "certificateType",
        u."contactNumber" AS "userContactNumber",
        cr.credentials
      FROM cert_request cr
      LEFT JOIN certificate_type ct ON ct."certificateTypeID" = cr."certificateTypeID"
      LEFT JOIN users u ON u."userID" = cr."userID"
      WHERE cr."certID" = $1
      LIMIT 1
    `,
    [normalizedCertID],
  );
  const certificateRequest = requestResult.rows[0];
  const certificateType = String(certificateRequest?.certificateType || "certificate").trim() || "certificate";
  const pickupLabel = formatCertificatePickupLabel(pickupDate, pickupTime);

  // Text the requester (account number + 09XXXXXXXXX values in the request) for each certificate action:
  // Approve Request, Decline, marked picked up (Completed), and Restore to pending.
  if (certificateRequest) {
    const smsCertificateType = toSmsSafeText(certificateType) || "certificate";
    const smsReason = toSmsSafeText(declineReason).replace(/[.\s]+$/, "");
    const smsByAction = {
      approved: `Faithflow: Your ${smsCertificateType} request is approved.${
        pickupLabel ? ` You may pick it up at the parish office on ${pickupLabel}.` : " The parish office will tell you when to pick it up."
      }`,
      declined: `Faithflow: Your ${smsCertificateType} request was declined${
        smsReason ? `, because ${smsReason}` : ""
      }. Contact the parish office for questions.`,
      completed: `Faithflow: Your ${smsCertificateType} has been picked up. Thank you! You can find it in your History page.`,
      pending: `Faithflow: Your ${smsCertificateType} request was restored and is pending again. The parish office will review it soon.`,
    };
    if (smsByAction[action]) {
      sendAppointmentRequesterSms({
        appointmentID: normalizedCertID,
        logSubject: `Certificate request ${normalizedCertID}`,
        label: action,
        message: smsByAction[action],
        phoneNumbers: [
          certificateRequest.userContactNumber,
          ...getAppointmentCredentialPhoneNumbers(certificateRequest.credentials),
        ],
      });
    }
  }

  const userID = Number(certificateRequest?.userID);
  if (!certificateRequest || !Number.isInteger(userID) || userID <= 0) return null;

  const normalizedDeclineReason = String(declineReason || "").trim();
  const notificationByAction = {
    approved: {
      type: "certificate_approved",
      title: "Certificate request approved",
      body: pickupLabel
        ? `Your ${certificateType} request was approved. Pickup: ${pickupLabel}.`
        : `Your ${certificateType} request was approved.`,
      severity: "success",
    },
    declined: {
      type: "certificate_declined",
      title: "Certificate request declined",
      body: normalizedDeclineReason
        ? `Your ${certificateType} request was declined. Reason: ${normalizedDeclineReason}`
        : `Your ${certificateType} request was declined.`,
      severity: "warning",
    },
    completed: {
      type: "certificate_claimed",
      title: "Certificate picked up",
      body: `Your ${certificateType} request was picked up and moved to your history.`,
      severity: "success",
    },
    pending: {
      type: "certificate_restored",
      title: "Certificate request restored",
      body: `Your ${certificateType} request was restored to pending. The parish office will review it again.`,
      severity: "info",
    },
  };
  const notification = notificationByAction[action];
  if (!notification) return null;

  return createUserNotification({
    userID,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    severity: notification.severity,
    metadata: {
      path: action === "completed" ? "/dashboard/history" : "/dashboard/status",
      certID: normalizedCertID,
      action,
    },
  });
};

const PROGRESS_UNCHECK_SMS_REASON_LIMIT = 100;

// "Faithflow: Your Blessing request update. Step 1, Task 2 was unchecked on November 22, 2026, 4:27 PM. Reason: ..."
const buildProgressTaskUncheckedSms = ({ serviceName, stepIndex, taskIndex, uncheckedAt, reason }) => {
  const when = uncheckedAt.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).replace(" at ", ", ");
  const safeReason = toSmsSafeText(reason);
  const shortReason =
    safeReason.length > PROGRESS_UNCHECK_SMS_REASON_LIMIT
      ? `${safeReason.slice(0, PROGRESS_UNCHECK_SMS_REASON_LIMIT).trimEnd()}...`
      : safeReason;
  return `Faithflow: Your ${toSmsSafeText(serviceName)} request update. Step ${stepIndex + 1}, Task ${taskIndex + 1} was unchecked on ${when}. Reason: ${shortReason}`;
};

const notifyProgressTaskUnchecked = async ({ appointmentID, taskLabel, stepTitle, stepIndex, taskIndex, reason }) => {
  const normalizedAppointmentID = Number(appointmentID);
  const normalizedReason = String(reason || "").trim();
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0 || !normalizedReason) {
    return null;
  }

  const appointmentResult = await query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName",
        u."contactNumber" AS "userContactNumber",
        a.credentials
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN users u ON u."userID" = a."userID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  const appointment = appointmentResult.rows[0];
  if (!appointment) return null;

  const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
  if (Number.isInteger(stepIndex) && stepIndex >= 0 && Number.isInteger(taskIndex) && taskIndex >= 0) {
    sendAppointmentRequesterSms({
      appointmentID: normalizedAppointmentID,
      label: "checklist uncheck",
      message: buildProgressTaskUncheckedSms({
        serviceName,
        stepIndex,
        taskIndex,
        uncheckedAt: new Date(),
        reason: normalizedReason,
      }),
      phoneNumbers: [appointment.userContactNumber, ...getAppointmentCredentialPhoneNumbers(appointment.credentials)],
    });
  }

  const userID = Number(appointment.userID);
  if (!Number.isInteger(userID) || userID <= 0) return null;

  const normalizedTaskLabel = String(taskLabel || "A checklist task").trim() || "A checklist task";
  const normalizedStepTitle = String(stepTitle || "").trim();
  const stepContext = normalizedStepTitle ? ` in "${normalizedStepTitle}"` : "";

  return createUserNotification({
    userID,
    type: "progress_task_unchecked",
    title: "Progress checklist updated",
    body: `Your ${serviceName} request: "${normalizedTaskLabel}"${stepContext} was unchecked by the parish office. Reason: ${normalizedReason}`,
    severity: "warning",
    metadata: {
      path: `/dashboard/status/${normalizedAppointmentID}`,
      appointmentID: normalizedAppointmentID,
      taskLabel: normalizedTaskLabel,
      stepTitle: normalizedStepTitle,
      reason: normalizedReason,
    },
  });
};

// "Nov 25, 2026, 9:00 AM - 10:00 AM" in parish time (1-hour slots).
const formatEventScheduleForSms = (value) => {
  if (!value) return "";
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const dateLabel = start.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeOptions = { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" };
  return `${dateLabel}, ${start.toLocaleTimeString("en-US", timeOptions)} - ${end.toLocaleTimeString("en-US", timeOptions)}`;
};

// Confirm on "Set Next Event Schedule": text the requester (account + form numbers) and the assigned priest
// whenever the event date/time or the priest changes and a schedule is set.
const sendProgressScheduleSms = async ({
  appointmentID,
  previousSchedule = null,
  nextSchedule = null,
  previousPriestID = null,
  nextPriestID = null,
}) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return;
  const scheduleLabel = formatEventScheduleForSms(nextSchedule);
  if (!scheduleLabel) return;
  // Compare instants, not strings: the stored value (DB) and the incoming value (request) may be formatted
  // differently, and a string compare would re-send the SMS on every save.
  const toInstant = (value) => {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isNaN(time) ? null : time;
  };
  const scheduleChanged = toInstant(previousSchedule) !== toInstant(nextSchedule);
  const priestChanged = Number(previousPriestID || 0) !== Number(nextPriestID || 0);
  if (!scheduleChanged && !priestChanged) return;

  const appointmentResult = await query(
    `
      SELECT
        COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName",
        u."contactNumber" AS "userContactNumber",
        a.credentials,
        p."phoneNumber" AS "priestPhoneNumber"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN users u ON u."userID" = a."userID"
      LEFT JOIN priests p ON p."priestID" = $2
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID, Number(nextPriestID) > 0 ? Number(nextPriestID) : null],
  );
  const appointment = appointmentResult.rows[0];
  if (!appointment) return;

  const serviceName = toSmsSafeText(appointment.serviceName) || "appointment";
  const message = `Faithflow: Your event schedule for ${serviceName} is ${scheduleLabel}.`;
  sendAppointmentRequesterSms({
    appointmentID: normalizedAppointmentID,
    label: "schedule (requester)",
    message,
    phoneNumbers: [appointment.userContactNumber, ...getAppointmentCredentialPhoneNumbers(appointment.credentials)],
  });
  sendAppointmentRequesterSms({
    appointmentID: normalizedAppointmentID,
    label: "schedule (priest)",
    message,
    phoneNumbers: [appointment.priestPhoneNumber],
  });
};

const notifyProgressScheduleUpdated = async ({
  appointmentID,
  previousSchedule = null,
  nextSchedule = null,
  previousPriestID = null,
  nextPriestID = null,
}) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;

  const previousScheduleValue = previousSchedule ? String(previousSchedule) : "";
  const nextScheduleValue = nextSchedule ? String(nextSchedule) : "";
  const scheduleChanged = previousScheduleValue !== nextScheduleValue;
  const priestChanged = Number(previousPriestID) !== Number(nextPriestID);
  if (!scheduleChanged && !priestChanged) return null;

  const appointmentResult = await query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  const appointment = appointmentResult.rows[0];
  const userID = Number(appointment?.userID);
  if (!appointment || !Number.isInteger(userID) || userID <= 0) return null;

  const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
  const formatScheduleParts = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const dateLabel = parsed.toLocaleDateString("en-US", {
      timeZone: "Asia/Manila",
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const timeLabel = parsed.toLocaleTimeString("en-US", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
    });
    return { dateLabel, timeLabel, label: `${dateLabel} at ${timeLabel}` };
  };

  const previousParts = formatScheduleParts(previousScheduleValue);
  const nextParts = formatScheduleParts(nextScheduleValue);
  const changeParts = [];
  if (scheduleChanged && nextParts) {
    if (previousParts) {
      const dateChanged = previousParts.dateLabel !== nextParts.dateLabel;
      const timeChanged = previousParts.timeLabel !== nextParts.timeLabel;
      if (dateChanged && timeChanged) {
        changeParts.push(`date and time was changed from ${previousParts.label} to ${nextParts.label}`);
      } else if (dateChanged) {
        changeParts.push(`date was changed from ${previousParts.dateLabel} to ${nextParts.dateLabel} (${nextParts.timeLabel})`);
      } else {
        changeParts.push(`time was changed from ${previousParts.timeLabel} to ${nextParts.timeLabel} on ${nextParts.dateLabel}`);
      }
    } else {
      changeParts.push(`is now scheduled for ${nextParts.label}`);
    }
  }
  if (priestChanged && Number(nextPriestID) > 0) {
    const priestResult = await query(
      `
        SELECT "fullName"
        FROM priests
        WHERE "priestID" = $1
        LIMIT 1
      `,
      [Number(nextPriestID)],
    );
    const priestName = String(priestResult.rows[0]?.fullName || "the assigned priest").trim() || "the assigned priest";
    changeParts.push(
      Number(previousPriestID) > 0
        ? `assigned priest updated to ${priestName}`
        : `assigned priest set to ${priestName}`,
    );
  }
  if (changeParts.length === 0) return null;

  return createUserNotification({
    userID,
    type: "progress_schedule_updated",
    title: previousParts && nextParts ? "Appointment date and time changed" : "Appointment scheduled",
    body: `Your ${serviceName} appointment ${changeParts.join(" and ")}.`,
    severity: "info",
    metadata: {
      path: `/dashboard/status/${normalizedAppointmentID}`,
      appointmentID: normalizedAppointmentID,
      serviceName,
      previousSchedule: previousScheduleValue || null,
      nextSchedule: nextScheduleValue || null,
      previousLabel: previousParts?.label || null,
      nextLabel: nextParts?.label || null,
      previousPriestID: Number(previousPriestID) > 0 ? Number(previousPriestID) : null,
      nextPriestID: Number(nextPriestID) > 0 ? Number(nextPriestID) : null,
    },
  });
};

const isScheduledEventDateTimePast = (scheduledEventDateTime, referenceDate = new Date()) => {
  const parsed = new Date(scheduledEventDateTime);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() <= referenceDate.getTime();
};

const promoteDueAppointmentsToHistory = async ({ appointmentID = null } = {}) => {
  const scopedAppointmentID =
    Number.isInteger(Number(appointmentID)) && Number(appointmentID) > 0 ? Number(appointmentID) : null;
  const promotionResult = await query(
    `
      UPDATE appointments a
      SET "finishedAt" = NOW()
      FROM progress_tracker pt
      WHERE pt."appointmentID" = a."appointmentID"
        AND a."finishedAt" IS NULL
        AND a."isArchived" = FALSE
        AND a.status = 'CONFIRMED'
        AND pt."scheduledEventDateTime" IS NOT NULL
        AND pt."scheduledEventDateTime" <= NOW()
        AND ${CHECKLIST_FULLY_COMPLETE_SQL}
        AND ($1::int IS NULL OR a."appointmentID" = $1)
      RETURNING a."appointmentID"
    `,
    [scopedAppointmentID],
  );

  const promotedAppointmentIDs = promotionResult.rows
    .map((row) => Number(row.appointmentID))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (promotedAppointmentIDs.length > 0) {
    await query(
      `
        UPDATE progress_tracker
        SET "eventDone" = TRUE, "updatedAt" = NOW()
        WHERE "appointmentID" = ANY($1::int[])
          AND COALESCE("eventDone", FALSE) = FALSE
      `,
      [promotedAppointmentIDs],
    );
  }

  for (const promotedAppointmentID of promotedAppointmentIDs) {
    await notifyProgressCompleted({ appointmentID: promotedAppointmentID });
  }

  return promotedAppointmentIDs;
};

const DUE_APPOINTMENT_SWEEP_INTERVAL_MS = 60 * 1000;
let isDueAppointmentSweepRunning = false;

const startDueAppointmentHistorySweep = () => {
  const runSweep = async () => {
    if (isDueAppointmentSweepRunning) return;
    isDueAppointmentSweepRunning = true;
    try {
      await promoteDueAppointmentsToHistory();
    } catch (error) {
      console.error("Due appointment history sweep error:", error);
    } finally {
      isDueAppointmentSweepRunning = false;
    }
  };
  void runSweep();
  const timer = setInterval(runSweep, DUE_APPOINTMENT_SWEEP_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
};

const notifyProgressCompleted = async ({ appointmentID }) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;

  const appointmentResult = await query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        a."priestID",
        a."finishedAt",
        COALESCE(ss."s_sacramentName", s."sacramentName", 'appointment') AS "serviceName",
        pt."scheduledEventDateTime"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  const appointment = appointmentResult.rows[0];
  if (!appointment?.finishedAt) return null;

  const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
  const scheduleLabel = (() => {
    if (!appointment.scheduledEventDateTime) return "";
    const parsed = new Date(appointment.scheduledEventDateTime);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  })();
  const scheduleText = scheduleLabel ? ` Scheduled for ${scheduleLabel}.` : "";

  const requesterUserID = Number(appointment.userID);
  if (Number.isInteger(requesterUserID) && requesterUserID > 0) {
    await createUserNotification({
      userID: requesterUserID,
      type: "progress_completed",
      title: "Appointment completed",
      body: `Your ${serviceName} appointment has been completed and moved to your history.${scheduleText}`,
      severity: "success",
      metadata: {
        path: `/dashboard/history`,
        appointmentID: normalizedAppointmentID,
      },
    });
  }

  const priestID = Number(appointment.priestID);
  if (Number.isInteger(priestID) && priestID > 0) {
    await createPriestNotification({
      priestID,
      type: "progress_completed",
      title: "Assigned appointment completed",
      body: `The ${serviceName} appointment you conducted has been marked complete and moved to history.${scheduleText}`,
      severity: "success",
      metadata: {
        path: "/priest/history",
        appointmentID: normalizedAppointmentID,
        priestID,
      },
    });
  }

  return { ok: true };
};

const notifyProgressPaymentUndone = async ({ appointmentID, previousAmount = 0 }) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;

  const appointmentResult = await query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  const appointment = appointmentResult.rows[0];
  const userID = Number(appointment?.userID);
  if (!appointment || !Number.isInteger(userID) || userID <= 0) return null;

  const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
  const formattedAmount =
    Number.isFinite(Number(previousAmount)) && Number(previousAmount) > 0
      ? ` Amount removed: PHP ${Number(previousAmount).toFixed(2)}.`
      : "";

  return createUserNotification({
    userID,
    type: "progress_payment_undone",
    title: "Payment update",
    body: `Your ${serviceName} request payment was reversed by the parish office.${formattedAmount} Status is now unpaid.`,
    severity: "warning",
    metadata: {
      path: `/dashboard/status/${normalizedAppointmentID}`,
      appointmentID: normalizedAppointmentID,
      paymentStatus: "unpaid",
    },
  });
};

const applyTaskUncheckMetadata = (checklist, taskUncheck) => {
  if (!Array.isArray(checklist) || !taskUncheck || typeof taskUncheck !== "object") return checklist;
  const stepIndex = Number(taskUncheck.stepIndex);
  const taskIndex = Number(taskUncheck.taskIndex);
  const reason = String(taskUncheck.reason || "").trim();
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || !Number.isInteger(taskIndex) || taskIndex < 0 || !reason) {
    return checklist;
  }

  const nextChecklist = checklist.map((step, currentStepIndex) => {
    if (currentStepIndex !== stepIndex) return step;
    const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
    return {
      ...step,
      tasks: tasks.map((task, currentTaskIndex) => {
        if (currentTaskIndex !== taskIndex) return task;
        const baseTask =
          typeof task === "string"
            ? { label: task.trim(), done: false, nextScheduleDateTime: null }
            : { ...task };
        return {
          ...baseTask,
          done: false,
          lastUncheckReason: reason,
          lastUncheckedAt: new Date().toISOString(),
        };
      }),
    };
  });

  return nextChecklist;
};

const findProgressTaskUnchecks = (previousChecklist, nextChecklist) => {
  const previous = Array.isArray(previousChecklist) ? previousChecklist : [];
  const next = Array.isArray(nextChecklist) ? nextChecklist : [];
  const unchecks = [];
  const sharedStepCount = Math.min(previous.length, next.length);

  for (let stepIndex = 0; stepIndex < sharedStepCount; stepIndex += 1) {
    const previousTasks = Array.isArray(previous[stepIndex]?.tasks) ? previous[stepIndex].tasks : [];
    const nextTasks = Array.isArray(next[stepIndex]?.tasks) ? next[stepIndex].tasks : [];
    const sharedTaskCount = Math.min(previousTasks.length, nextTasks.length);

    for (let taskIndex = 0; taskIndex < sharedTaskCount; taskIndex += 1) {
      const previousTask = previousTasks[taskIndex];
      const nextTask = nextTasks[taskIndex];
      const wasDone = typeof previousTask === "object" && previousTask !== null ? Boolean(previousTask.done) : false;
      const isDone = typeof nextTask === "object" && nextTask !== null ? Boolean(nextTask.done) : false;
      if (!wasDone || isDone) continue;

      const taskLabel =
        typeof nextTask === "object" && nextTask !== null
          ? String(nextTask.label || "").trim()
          : typeof previousTask === "object" && previousTask !== null
            ? String(previousTask.label || "").trim()
            : String(nextTask || previousTask || "").trim();

      unchecks.push({
        stepIndex,
        taskIndex,
        stepTitle: String(next[stepIndex]?.title || previous[stepIndex]?.title || "").trim(),
        taskLabel: taskLabel || "A checklist task",
      });
    }
  }

  return unchecks;
};

const isProgressTaskDone = (task) => typeof task === "object" && task !== null && Boolean(task.done);

const readProgressTaskLabel = (task) =>
  typeof task === "object" && task !== null ? String(task.label || "").trim() : String(task || "").trim();

const findProgressTaskChecks = (previousChecklist, nextChecklist) => {
  const previous = Array.isArray(previousChecklist) ? previousChecklist : [];
  const next = Array.isArray(nextChecklist) ? nextChecklist : [];
  const checks = [];

  next.forEach((step, stepIndex) => {
    const nextTasks = Array.isArray(step?.tasks) ? step.tasks : [];
    const previousTasks = Array.isArray(previous[stepIndex]?.tasks) ? previous[stepIndex].tasks : [];
    nextTasks.forEach((task, taskIndex) => {
      if (!isProgressTaskDone(task) || isProgressTaskDone(previousTasks[taskIndex])) return;
      checks.push({
        stepIndex,
        taskIndex,
        stepTitle: String(step?.title || "").trim(),
        taskLabel: readProgressTaskLabel(task) || "A checklist task",
      });
    });
  });

  return checks;
};

const summarizeProgressChecklist = (checklist) => {
  const steps = Array.isArray(checklist) ? checklist : [];
  let totalTasks = 0;
  let doneTasks = 0;
  const completedStepIndexes = new Set();
  steps.forEach((step, stepIndex) => {
    const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
    const stepDone = tasks.filter(isProgressTaskDone).length;
    totalTasks += tasks.length;
    doneTasks += stepDone;
    if (tasks.length > 0 && stepDone === tasks.length) completedStepIndexes.add(stepIndex);
  });
  return { totalTasks, doneTasks, completedStepIndexes };
};

// First task still not done, in checklist order (step by step, task by task), starting at fromStepIndex.
const findNextOpenProgressTask = (checklist, fromStepIndex = 0) => {
  const steps = Array.isArray(checklist) ? checklist : [];
  for (let stepIndex = Math.max(0, fromStepIndex); stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
    for (const task of tasks) {
      if (isProgressTaskDone(task)) continue;
      const taskLabel = readProgressTaskLabel(task);
      if (taskLabel) return { stepIndex, stepTitle: String(step?.title || "").trim() || `Step ${stepIndex + 1}`, taskLabel };
    }
  }
  return null;
};

const isProgressStepComplete = (step) => {
  const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
  return tasks.length > 0 && tasks.every(isProgressTaskDone);
};

// SMS text: the task(s) just checked, then what comes next.
// - Step still has open tasks -> "Next: <task>."
// - The check finished the step -> "Next step: <next step title>. First task: <its first open task>."
// The SMS Sender ID rejects anything that looks like a link ("Links are prohibited under this SenderID").
// Task names such as "Priest//Clergy" or "St.Joseph" trip that filter, so space them out for SMS only.
const toSmsSafeText = (value) =>
  String(value || "")
    .replace(/\s*\/+\s*/g, " / ")
    .replace(/\.(?=[A-Za-z])/g, ". ")
    .replace(/\b(https?|www)\b:?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const buildProgressTasksCheckedSms = ({
  serviceName: rawServiceName,
  checkedTasks,
  nextChecklist,
  markAllStepIndex = null,
  specialEventLabel = "",
}) => {
  const serviceName = toSmsSafeText(rawServiceName);
  // Last message once every step is done. Special programs get their shared event date.
  const allCompleteText = specialEventLabel
    ? `All steps are complete! Your ${serviceName} event is on ${specialEventLabel}. See you there!`
    : "All checklist tasks are complete.";

  // "Mark All as Done" on a step: "You completed <step>." then the next step and its first task.
  const markAllSteps = Array.isArray(nextChecklist) ? nextChecklist : [];
  if (Number.isInteger(markAllStepIndex) && isProgressStepComplete(markAllSteps[markAllStepIndex])) {
    const completedStepTitle =
      toSmsSafeText(markAllSteps[markAllStepIndex]?.title) || `Step ${markAllStepIndex + 1}`;
    const upcomingStep =
      findNextOpenProgressTask(markAllSteps, markAllStepIndex + 1) || findNextOpenProgressTask(markAllSteps);
    const upcomingText = !upcomingStep
      ? allCompleteText
      : upcomingStep.stepIndex > markAllStepIndex
        ? `Next step: ${toSmsSafeText(upcomingStep.stepTitle)}. First task: ${toSmsSafeText(upcomingStep.taskLabel)}.`
        : `Next: ${toSmsSafeText(upcomingStep.taskLabel)}.`;
    return `Faithflow: Your ${serviceName} request update. You completed ${completedStepTitle}. ${upcomingText}`;
  }

  const labels = checkedTasks.map((task) => toSmsSafeText(task.taskLabel));
  const doneText =
    labels.length <= 3
      ? labels.join(", ")
      : `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more`;

  const steps = Array.isArray(nextChecklist) ? nextChecklist : [];
  const lastCheckedStepIndex = Math.max(...checkedTasks.map((task) => task.stepIndex));
  const finishedStep = isProgressStepComplete(steps[lastCheckedStepIndex]);
  const upcoming = finishedStep
    ? findNextOpenProgressTask(steps, lastCheckedStepIndex + 1) || findNextOpenProgressTask(steps)
    : findNextOpenProgressTask(steps, lastCheckedStepIndex) || findNextOpenProgressTask(steps);

  let nextText = allCompleteText;
  if (upcoming && finishedStep && upcoming.stepIndex > lastCheckedStepIndex) {
    nextText = `Next step: ${toSmsSafeText(upcoming.stepTitle)}. First task: ${toSmsSafeText(upcoming.taskLabel)}.`;
  } else if (upcoming) {
    nextText = `Next: ${toSmsSafeText(upcoming.taskLabel)}.`;
  }
  return `Faithflow: Your ${serviceName} request update. Done: ${doneText}. ${nextText}`;
};

const notifyProgressTasksChecked = async ({
  appointmentID,
  checkedTasks,
  previousChecklist,
  nextChecklist,
  markAllStepIndex = null,
}) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;
  if (!Array.isArray(checkedTasks) || checkedTasks.length === 0) return null;

  const appointmentResult = await query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName",
        u."contactNumber" AS "userContactNumber",
        a.credentials,
        -- Special program event, formatted as stored (timeDate has no time zone): "December 9, 2026, 8:00 AM - 12:00 PM"
        CASE WHEN ss."timeDate" IS NOT NULL THEN
          to_char(ss."timeDate", 'FMMonth FMDD, YYYY, FMHH12:MI AM') || ' - ' ||
          to_char(ss."timeDate" + make_interval(hours => GREATEST(COALESCE(ss."durationHours", 1), 1)), 'FMHH12:MI AM')
        END AS "specialEventLabel"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN users u ON u."userID" = a."userID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  const appointment = appointmentResult.rows[0];
  if (!appointment) return null;

  const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
  sendAppointmentRequesterSms({
    appointmentID: normalizedAppointmentID,
    label: "checklist",
    message: buildProgressTasksCheckedSms({
      serviceName,
      checkedTasks,
      nextChecklist,
      markAllStepIndex,
      specialEventLabel: appointment.specialEventLabel || "",
    }),
    phoneNumbers: [appointment.userContactNumber, ...getAppointmentCredentialPhoneNumbers(appointment.credentials)],
  });

  const userID = Number(appointment?.userID);
  if (!Number.isInteger(userID) || userID <= 0) return null;

  const previousSummary = summarizeProgressChecklist(previousChecklist);
  const nextSummary = summarizeProgressChecklist(nextChecklist);
  const newlyCompletedSteps = [...nextSummary.completedStepIndexes]
    .filter((stepIndex) => !previousSummary.completedStepIndexes.has(stepIndex))
    .map((stepIndex) => String(nextChecklist?.[stepIndex]?.title || `Step ${stepIndex + 1}`).trim());
  const isChecklistComplete = nextSummary.totalTasks > 0 && nextSummary.doneTasks === nextSummary.totalTasks;

  const firstTask = checkedTasks[0];
  const stepContext = firstTask.stepTitle ? ` in "${firstTask.stepTitle}"` : "";
  const taskSentence =
    checkedTasks.length === 1
      ? `"${firstTask.taskLabel}"${stepContext} was marked done by the parish office.`
      : `${checkedTasks.length} checklist tasks were marked done by the parish office: ${checkedTasks
          .slice(0, 3)
          .map((task) => `"${task.taskLabel}"`)
          .join(", ")}${checkedTasks.length > 3 ? `, and ${checkedTasks.length - 3} more` : ""}.`;
  const stepSentence = isChecklistComplete
    ? " All checklist steps are now complete."
    : newlyCompletedSteps.length > 0
      ? ` Step completed: ${newlyCompletedSteps.join(", ")}.`
      : "";
  const countSentence =
    nextSummary.totalTasks > 0 ? ` Progress: ${nextSummary.doneTasks} of ${nextSummary.totalTasks} tasks done.` : "";

  return createUserNotification({
    userID,
    type: "progress_task_checked",
    title: isChecklistComplete ? "Progress checklist complete" : "Progress update",
    body: `Your ${serviceName} request: ${taskSentence}${stepSentence}${countSentence}`,
    severity: "success",
    metadata: {
      path: `/dashboard/status/${normalizedAppointmentID}`,
      appointmentID: normalizedAppointmentID,
      checkedTasks: checkedTasks.slice(0, 10),
      doneTasks: nextSummary.doneTasks,
      totalTasks: nextSummary.totalTasks,
    },
  });
};

const notifyProgressPaymentRecorded = async ({ appointmentID, invoiceNumber = "", isEdit = false }) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;

  const appointmentResult = await query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  const appointment = appointmentResult.rows[0];
  const userID = Number(appointment?.userID);
  if (!appointment || !Number.isInteger(userID) || userID <= 0) return null;

  const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
  const normalizedInvoice = String(invoiceNumber || "").trim();
  const invoiceSentence = normalizedInvoice ? ` Invoice/receipt no. ${normalizedInvoice}.` : "";

  return createUserNotification({
    userID,
    type: isEdit ? "progress_payment_updated" : "progress_payment_recorded",
    title: isEdit ? "Payment record updated" : "Payment recorded",
    body: isEdit
      ? `The parish office updated the payment record for your ${serviceName} request.${invoiceSentence}`
      : `The parish office recorded your payment for your ${serviceName} request. It is now marked paid.${invoiceSentence}`,
    severity: "success",
    metadata: {
      path: `/dashboard/status/${normalizedAppointmentID}`,
      appointmentID: normalizedAppointmentID,
      paymentStatus: "paid",
    },
  });
};

const normalizeParishActivitySlides = (rawSlides) => {
  const parsedSlides = Array.isArray(rawSlides)
    ? rawSlides
    : typeof rawSlides === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(rawSlides);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return parsedSlides
    .map((slide, index) => {
      const rawSlideId = String(slide?.slideId ?? slide?.id ?? "").trim();
      const fallbackSlideId = `legacy-${index + 1}`;
      return {
        slideId: rawSlideId || fallbackSlideId,
        subtitle: String(slide?.subtitle || "").trim(),
        summary: String(slide?.summary || "").trim(),
        details: String(slide?.details || "").trim(),
        imageUrl: String(slide?.imageUrl ?? slide?.image_url ?? "").trim(),
      };
    })
    .filter((slide) => slide.subtitle || slide.summary || slide.details || slide.imageUrl)
    .slice(0, 20);
};

const parseParishActivityPayload = (rawPayload) => {
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    return rawPayload;
  }
  if (typeof rawPayload === "string") {
    try {
      const parsed = JSON.parse(rawPayload);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const normalizeParishActivityMediaItems = (rawMedia, legacyImageUrl = "") => {
  const parsedItems = Array.isArray(rawMedia) ? rawMedia : [];
  const normalized = parsedItems
    .map((item) => {
      const filePath = resolveParishActivityMediaPath(item?.filePath ?? item?.url ?? item?.imageUrl ?? "");
      return {
        type: String(item?.type || "").trim().toLowerCase() === "video" ? "video" : "image",
        filePath,
        url: filePath,
        fileName: String(item?.fileName || "").trim(),
        summary: String(item?.summary || item?.description || item?.caption || "").trim(),
      };
    })
    .filter((item) => item.filePath)
    .slice(0, 20);

  if (normalized.length === 0) {
    const legacyPath = resolveParishActivityMediaPath(legacyImageUrl);
    if (legacyPath) {
      normalized.push({ type: "image", filePath: legacyPath, url: legacyPath, fileName: "", summary: "" });
    }
  }

  return normalized;
};

const normalizeOptionalIsoDate = (value) => {
  const raw = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
};

const buildParishActivityPayload = ({
  summary = "",
  details = "",
  imageUrl = "",
  media = [],
  slides = [],
  expiresOn = "",
}) => {
  const normalizedMedia = normalizeParishActivityMediaItems(media, imageUrl);
  const firstImage = normalizedMedia.find((item) => item.type === "image");
  const legacyImagePath = resolveParishActivityMediaPath(imageUrl);
  return {
    summary: String(summary || "").trim(),
    details: String(details || "").trim(),
    imageUrl: String(firstImage?.filePath || legacyImagePath || "").trim(),
    media: normalizedMedia,
    slides: normalizeParishActivitySlides(slides),
    expiresOn: normalizeOptionalIsoDate(expiresOn),
  };
};

const PARISH_ACTIVITY_RETURNING_FIELDS = `
  "parishActID" AS id,
  "parishActID",
  title,
  "publishedDate" AS "activityDate",
  "publishedDate",
  payload,
  "adminID",
  "createdAt",
  "updatedAt"
`;

const normalizeParishActivityRecord = (row) => {
  const payload = parseParishActivityPayload(row?.payload);
  const rawActivityDate =
    row?.activityDate ?? row?.publishedDate ?? row?.activity_date ?? row?.published_date ?? null;
  let activityDate = "";
  if (rawActivityDate instanceof Date) {
    activityDate = rawActivityDate.toISOString().slice(0, 10);
  } else {
    activityDate = String(rawActivityDate || "").trim().slice(0, 10);
  }
  const parishActID = Number(row?.parishActID ?? row?.id);
  const media = normalizeParishActivityMediaItems(
    payload.media,
    payload.imageUrl ?? payload.image_url ?? row?.imageUrl ?? row?.image_url ?? "",
  );
  const legacySummary = String(payload.summary ?? row?.summary ?? "").trim();
  if (legacySummary && media.length > 0 && !media.some((item) => item.summary)) {
    media[0] = { ...media[0], summary: legacySummary };
  }
  const firstImage = media.find((item) => item.type === "image");
  const legacyImagePath = resolveParishActivityMediaPath(
    payload.imageUrl ?? payload.image_url ?? row?.imageUrl ?? row?.image_url ?? "",
  );
  return {
    id: parishActID,
    parishActID,
    title: String(row?.title || "").trim(),
    activityDate: /^\d{4}-\d{2}-\d{2}$/.test(activityDate) ? activityDate : "",
    summary: String(payload.summary ?? row?.summary ?? "").trim(),
    details: String(payload.details ?? row?.details ?? "").trim(),
    imageUrl: String(firstImage?.filePath || legacyImagePath || "").trim(),
    media,
    slides: normalizeParishActivitySlides(payload.slides ?? row?.slides ?? row?.slides_json),
    expiresOn: normalizeOptionalIsoDate(payload.expiresOn ?? payload.expires_on ?? row?.expiresOn),
    adminID: Number(row?.adminID ?? row?.admin_id),
    createdAt: row?.createdAt ?? row?.created_at ?? null,
    updatedAt: row?.updatedAt ?? row?.updated_at ?? null,
  };
};

const notifyPriestScheduleAssignment = async ({ adminID, priestID, calendarEntry, action = "assigned" }) => {
  const normalizedAdminID = Number(adminID);
  const normalizedPriestID = Number(priestID);
  if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) return;
  if (!Number.isInteger(normalizedPriestID) || normalizedPriestID <= 0) return;

  try {
    const priestRecipientResult = await query(
      `
        SELECT p."priestID"
        FROM priests p
        WHERE p."priestID" = $1
          AND p."adminID" = $2
        LIMIT 1
      `,
      [normalizedPriestID, normalizedAdminID],
    );
    if (priestRecipientResult.rows.length === 0) return;

    const actionLabel = action === "updated" ? "updated" : action === "unassigned" ? "unassigned" : "assigned";
    const eventDateLabel = String(
      calendarEntry?.eventDate instanceof Date
        ? calendarEntry.eventDate.toISOString().slice(0, 10)
        : calendarEntry?.eventDate || "",
    ).trim();
    const startTimeLabel = normalizeTimeToHHMM(calendarEntry?.startTime);
    const endTimeLabel = normalizeTimeToHHMM(calendarEntry?.endTime);
    const timeRangeLabel =
      startTimeLabel && endTimeLabel ? ` from ${startTimeLabel} to ${endTimeLabel}` : startTimeLabel ? ` at ${startTimeLabel}` : "";
    const rawScheduleType = String(calendarEntry?.scheduleType || "").trim().toLowerCase();
    const isSpecialProgram = Number(calendarEntry?.s_sacramentID || calendarEntry?.sSacramentID) > 0;
    const isParishEvent = rawScheduleType === "parish_event";
    const entryKindLabel = isSpecialProgram ? "special program" : isParishEvent ? "parish event" : "appointment";
    const title = String(
      calendarEntry?.s_sacramentName || calendarEntry?.title || (isSpecialProgram ? "Special program" : isParishEvent ? "Parish event" : "Priest schedule"),
    ).trim() || "Priest schedule";
    const linkedAppointmentID = resolveAppointmentIDFromCalendarEntry(calendarEntry);
    const calendarEntryID = Number(calendarEntry?.id || calendarEntry?.calendarID || calendarEntry?.calendarEntryID) || null;
    const assignmentView = actionLabel === "unassigned" ? "awaiting" : "awaiting";
    const priestPath = buildPriestAssignedAppointmentsPath({
      scheduleID: calendarEntryID,
      view: assignmentView,
    });
    const body =
      actionLabel === "unassigned"
        ? `Parish secretary removed your assigned ${entryKindLabel} "${title}".`
        : eventDateLabel
          ? `Parish secretary ${actionLabel} you to ${entryKindLabel} "${title}" on ${eventDateLabel}${timeRangeLabel}. Please review it in Appointments.`
          : `Parish secretary ${actionLabel} you to ${entryKindLabel} "${title}". Please review it in Appointments.`;

    await createPriestNotification({
      priestID: normalizedPriestID,
      type: "priest_assignment",
      title:
        actionLabel === "updated"
          ? isSpecialProgram
            ? "Special program updated"
            : "Schedule assignment updated"
          : actionLabel === "unassigned"
            ? isSpecialProgram
              ? "Special program removed"
              : "Schedule assignment removed"
            : isSpecialProgram
              ? "New special program assigned"
              : "New appointment assigned",
      body,
      severity: actionLabel === "unassigned" ? "info" : "success",
      metadata: {
        path: priestPath,
        priestID: normalizedPriestID,
        adminID: normalizedAdminID,
        calendarEntryID: Number.isInteger(calendarEntryID) && calendarEntryID > 0 ? calendarEntryID : null,
        appointmentID: linkedAppointmentID,
        action: actionLabel,
      },
    });
  } catch (error) {
    console.error("Priest schedule assignment notification error:", error);
  }
};

const notifyPriestAppointmentAssignment = async ({
  appointmentID,
  previousPriestID = null,
  nextPriestID = null,
  scheduledEventDateTime = null,
}) => {
  const normalizedAppointmentID = Number(appointmentID);
  const previousID = Number(previousPriestID);
  const nextID = Number(nextPriestID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;
  if (Number(previousID || 0) === Number(nextID || 0)) return null;

  try {
    const appointmentResult = await query(
      `
        SELECT
          a."appointmentID",
          a."requesterFullName",
          COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        WHERE a."appointmentID" = $1
        LIMIT 1
      `,
      [normalizedAppointmentID],
    );
    const appointment = appointmentResult.rows[0];
    if (!appointment) return null;
    const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
    const requesterName = String(appointment.requesterFullName || "a parishioner").trim() || "a parishioner";
    const parsedSchedule = scheduledEventDateTime ? new Date(scheduledEventDateTime) : null;
    const scheduleLabel =
      parsedSchedule && !Number.isNaN(parsedSchedule.getTime())
        ? parsedSchedule.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "";

    if (Number.isInteger(previousID) && previousID > 0) {
      await createPriestNotification({
        priestID: previousID,
        type: "priest_assignment",
        title: "Appointment reassigned",
        body: `Parish secretary reassigned the ${serviceName} appointment for ${requesterName}. It is no longer on your list.`,
        severity: "info",
        metadata: {
          path: "/priest/assigned-appointments",
          appointmentID: normalizedAppointmentID,
          action: "unassigned",
        },
      });
    }

    if (Number.isInteger(nextID) && nextID > 0) {
      const calendarResult = await query(
        `
          SELECT "calendarID" AS id
          FROM calendar_entries
          WHERE "appointmentID" = $1
            AND "priestID" = $2
          ORDER BY "calendarID" DESC
          LIMIT 1
        `,
        [normalizedAppointmentID, nextID],
      );
      const calendarEntryID = Number(calendarResult.rows[0]?.id);
      await createPriestNotification({
        priestID: nextID,
        type: "priest_assignment",
        title: "New appointment assigned",
        body: scheduleLabel
          ? `Parish secretary assigned you to conduct ${serviceName} for ${requesterName} on ${scheduleLabel}.`
          : `Parish secretary assigned you to conduct ${serviceName} for ${requesterName}. A date and time will be set next.`,
        severity: "success",
        metadata: {
          path: buildPriestAssignedAppointmentsPath({
            scheduleID: calendarEntryID,
            view: "awaiting",
          }),
          appointmentID: normalizedAppointmentID,
          calendarEntryID: Number.isInteger(calendarEntryID) && calendarEntryID > 0 ? calendarEntryID : null,
          action: "assigned",
        },
      });
    }
  } catch (error) {
    console.error("Priest appointment assignment notification error:", error);
  }
  return null;
};

const notifyPriestsPreferredScheduleRequested = async ({
  appointmentID,
  currentPriestID = null,
  preferredPriestID = null,
  requesterName,
  serviceName,
  preferredDate,
  preferredTime,
}) => {
  const currentID = Number(currentPriestID);
  const preferredID = Number(preferredPriestID);
  const priestIDs = [...new Set(
    [currentID, preferredID].filter((id) => Number.isInteger(id) && id > 0),
  )];
  if (priestIDs.length === 0) return;

  const preferredDateTime = toManilaScheduledEventDateTime(preferredDate, preferredTime);
  const parsedPreferred = preferredDateTime ? new Date(preferredDateTime) : null;
  const scheduleLabel =
    parsedPreferred && !Number.isNaN(parsedPreferred.getTime())
      ? parsedPreferred.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "";
  const requester = String(requesterName || "A requester").trim() || "A requester";
  const service = String(serviceName || "appointment").trim() || "appointment";
  const priestChanged = currentID !== preferredID;

  try {
    for (const priestID of priestIDs) {
      const isCurrent = priestID === currentID;
      const isPreferred = priestID === preferredID;
      let title = "Requester requested a new schedule";
      let body = scheduleLabel
        ? `${requester} requested a different ${service} schedule on ${scheduleLabel}. The parish office will review this.`
        : `${requester} requested a different ${service} date or time. The parish office will review this.`;
      if (isCurrent && priestChanged) {
        title = "Requester asked to change assignment";
        body = `${requester} requested a different priest for their ${service} appointment. The parish office will review this.`;
      } else if (isPreferred && priestChanged) {
        title = "Requester preferred you";
        body = scheduleLabel
          ? `${requester} requested you to conduct ${service} on ${scheduleLabel}. The parish office will review this.`
          : `${requester} requested you to conduct ${service}. The parish office will review this.`;
      }
      await createPriestNotification({
        priestID,
        type: "user_schedule_remark",
        title,
        body,
        severity: "info",
        metadata: {
          path: "/priest/assigned-appointments",
          appointmentID: Number(appointmentID) || null,
          action: "preferred_requested",
          currentPriestID: Number.isInteger(currentID) && currentID > 0 ? currentID : null,
          preferredPriestID: Number.isInteger(preferredID) && preferredID > 0 ? preferredID : null,
        },
      });
    }
  } catch (error) {
    console.error("Priest preferred-schedule request notification error:", error);
  }
};

const formatPriestScheduleRangeLabel = (scheduledEventDateTime) => {
  const parsed = new Date(scheduledEventDateTime);
  if (Number.isNaN(parsed.getTime())) return "";
  const dateLabel = parsed.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const startLabel = parsed.toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
  const endLabel = new Date(parsed.getTime() + 60 * 60 * 1000).toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!dateLabel || !startLabel || !endLabel) return "";
  return `${dateLabel}, ${startLabel} to ${endLabel}`;
};

const fetchPriestCalendarNoticeContext = async (appointmentID) => {
  const normalizedAppointmentID = Number(appointmentID);
  if (!Number.isInteger(normalizedAppointmentID) || normalizedAppointmentID <= 0) return null;
  const result = await query(
    `
      SELECT
        a."appointmentID",
        a."priestID",
        a."s_sacramentID",
        a."requesterFullName",
        COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName",
        COALESCE(
          pt."scheduledEventDateTime",
          NULLIF(BTRIM(COALESCE(a.credentials->>'scheduledEventDateTime', a.credentials->>'finalSchedule')), '')
        ) AS "scheduledEventDateTime"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [normalizedAppointmentID],
  );
  return result.rows[0] || null;
};

const notifyPriestCalendarHold = async ({ appointmentID }) => {
  const appointment = await fetchPriestCalendarNoticeContext(appointmentID);
  const priestID = Number(appointment?.priestID);
  if (!appointment || !Number.isInteger(priestID) || priestID <= 0) return null;
  if (Number(appointment.s_sacramentID) > 0) return null;
  const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
  const requesterName = String(appointment.requesterFullName || "a parishioner").trim() || "a parishioner";
  const scheduleLabel = formatPriestScheduleRangeLabel(appointment.scheduledEventDateTime);
  const body = scheduleLabel
    ? `The parish office has temporarily withdrawn the ${serviceName} appointment for ${requesterName}, scheduled on ${scheduleLabel}, from your calendar. Your assignment remains on record. The parish office will restore this schedule to your calendar once it is ready to proceed.`
    : `The parish office has temporarily withdrawn the ${serviceName} appointment for ${requesterName} from your calendar. Your assignment remains on record and will be restored once the parish office is ready to proceed.`;
  return createPriestNotification({
    priestID,
    type: "priest_schedule_hold",
    title: "Appointment removed from your calendar",
    body,
    severity: "warning",
    metadata: {
      path: "/priest/dashboard",
      appointmentID: Number(appointment.appointmentID),
      action: "calendar_hold",
    },
  });
};

const notifyPriestCalendarRestored = async ({ appointmentID }) => {
  const appointment = await fetchPriestCalendarNoticeContext(appointmentID);
  const priestID = Number(appointment?.priestID);
  if (!appointment || !Number.isInteger(priestID) || priestID <= 0) return null;
  if (Number(appointment.s_sacramentID) > 0) return null;
  const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
  const requesterName = String(appointment.requesterFullName || "a parishioner").trim() || "a parishioner";
  const scheduleLabel = formatPriestScheduleRangeLabel(appointment.scheduledEventDateTime);
  const body = scheduleLabel
    ? `The parish office has restored the ${serviceName} appointment for ${requesterName} to your calendar on ${scheduleLabel}. Please review your schedule.`
    : `The parish office has restored the ${serviceName} appointment for ${requesterName} to your calendar. Please review your schedule.`;
  return createPriestNotification({
    priestID,
    type: "priest_schedule_restored",
    title: "Appointment restored to your calendar",
    body,
    severity: "success",
    metadata: {
      path: "/priest/dashboard",
      appointmentID: Number(appointment.appointmentID),
      action: "calendar_restored",
    },
  });
};

app.get("/notifications/stream", async (req, res) => {
  const accountType = String(req.query?.accountType || "").trim().toLowerCase();
  const accountID =
    accountType === "admin"
      ? Number(req.query?.adminID)
      : accountType === "priest"
        ? Number(req.query?.priestID)
        : Number(req.query?.userID);
  if (!["admin", "user", "priest"].includes(accountType) || !Number.isInteger(accountID) || accountID <= 0) {
    return res.status(400).json({ message: "Valid accountType and account ID are required." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const clientSet = getNotificationClientSet(accountType, accountID);
  if (!clientSet) {
    return res.status(400).json({ message: "Unable to initialize notification stream." });
  }
  clientSet.add(res);

  const connectedPayload = JSON.stringify({
    accountType,
    accountID,
    connectedAt: new Date().toISOString(),
  });
  res.write(`event: connected\ndata: ${connectedPayload}\n\n`);

  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: {"time":"${new Date().toISOString()}"}\n\n`);
    } catch {
      clearInterval(heartbeatInterval);
      clientSet.delete(res);
    }
  }, 45000);

  req.on("close", () => {
    clearInterval(heartbeatInterval);
    clientSet.delete(res);
    if (clientSet.size === 0) {
      const bucket = notificationStreamClients[accountType];
      bucket?.delete(accountID);
    }
  });
});

app.get("/user-notifications/unread-count", async (req, res) => {
  try {
    const userID = Number(req.query?.userID);
    if (!Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "A valid userID is required." });
    }
    const result = await query(
      `
        SELECT COUNT(*)::INT AS count
        FROM user_notifications
        WHERE "userID" = $1
          AND "isRead" = FALSE
      `,
      [userID],
    );
    return res.json({ count: Number(result.rows[0]?.count || 0) });
  } catch (error) {
    console.error("User unread notifications count error:", error);
    return res.status(500).json({ message: "Unable to load unread notifications count." });
  }
});

app.get("/user-notifications", async (req, res) => {
  try {
    const userID = Number(req.query?.userID);
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 12;
    if (!Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "A valid userID is required." });
    }
    const result = await query(
      `
        SELECT "userNotifID", "userID", type, title, body, severity, metadata, "isRead", "createdAt", "readAt"
        FROM user_notifications
        WHERE "userID" = $1
        ORDER BY "createdAt" DESC, "userNotifID" DESC
        LIMIT $2
      `,
      [userID, limit],
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("User notifications fetch error:", error);
    return res.status(500).json({ message: "Unable to load notifications." });
  }
});

app.patch("/user-notifications/:id/read", async (req, res) => {
  try {
    const notificationID = Number(req.params.id);
    const userID = Number(req.body?.userID);
    if (!Number.isInteger(notificationID) || notificationID <= 0) {
      return res.status(400).json({ message: "A valid notification ID is required." });
    }
    if (!Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "A valid userID is required." });
    }
    const result = await query(
      `
        UPDATE user_notifications
        SET "isRead" = TRUE,
            "readAt" = COALESCE("readAt", NOW())
        WHERE "userNotifID" = $1
          AND "userID" = $2
        RETURNING "userNotifID", "isRead", "readAt"
      `,
      [notificationID, userID],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Notification not found." });
    }
    pushNotificationStreamEvent("user", userID, {
      action: "updated",
      notificationId: notificationID,
    });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("User notification mark-read error:", error);
    return res.status(500).json({ message: "Unable to mark notification as read." });
  }
});

app.patch("/user-notifications/read-all", async (req, res) => {
  try {
    const userID = Number(req.body?.userID);
    if (!Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "A valid userID is required." });
    }
    await query(
      `
        UPDATE user_notifications
        SET "isRead" = TRUE,
            "readAt" = COALESCE("readAt", NOW())
        WHERE "userID" = $1
          AND "isRead" = FALSE
      `,
      [userID],
    );
    pushNotificationStreamEvent("user", userID, {
      action: "read_all",
    });
    return res.json({ message: "Notifications marked as read." });
  } catch (error) {
    console.error("User notifications read-all error:", error);
    return res.status(500).json({ message: "Unable to mark notifications as read." });
  }
});

app.get("/priest-notifications/unread-count", async (req, res) => {
  try {
    const priestID = Number(req.query?.priestID);
    if (!Number.isInteger(priestID) || priestID <= 0) {
      return res.status(400).json({ message: "A valid priestID is required." });
    }
    const result = await query(
      `
        SELECT COUNT(*)::INT AS count
        FROM priest_notifications
        WHERE "priestID" = $1
          AND "isRead" = FALSE
      `,
      [priestID],
    );
    return res.json({ count: Number(result.rows[0]?.count || 0) });
  } catch (error) {
    console.error("Priest unread notifications count error:", error);
    return res.status(500).json({ message: "Unable to load unread notifications count." });
  }
});

app.get("/priest-notifications", async (req, res) => {
  try {
    const priestID = Number(req.query?.priestID);
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 12;
    if (!Number.isInteger(priestID) || priestID <= 0) {
      return res.status(400).json({ message: "A valid priestID is required." });
    }
    const result = await query(
      `
        SELECT "priestNotifID", "priestID", type, title, body, severity, metadata, "isRead", "createdAt", "readAt"
        FROM priest_notifications
        WHERE "priestID" = $1
        ORDER BY "createdAt" DESC, "priestNotifID" DESC
        LIMIT $2
      `,
      [priestID, limit],
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Priest notifications fetch error:", error);
    return res.status(500).json({ message: "Unable to load notifications." });
  }
});

app.patch("/priest-notifications/:id/read", async (req, res) => {
  try {
    const notificationID = Number(req.params.id);
    const priestID = Number(req.body?.priestID);
    if (!Number.isInteger(notificationID) || notificationID <= 0) {
      return res.status(400).json({ message: "A valid notification ID is required." });
    }
    if (!Number.isInteger(priestID) || priestID <= 0) {
      return res.status(400).json({ message: "A valid priestID is required." });
    }
    const result = await query(
      `
        UPDATE priest_notifications
        SET "isRead" = TRUE,
            "readAt" = COALESCE("readAt", NOW())
        WHERE "priestNotifID" = $1
          AND "priestID" = $2
        RETURNING "priestNotifID", "isRead", "readAt"
      `,
      [notificationID, priestID],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Notification not found." });
    }
    pushNotificationStreamEvent("priest", priestID, {
      action: "updated",
      notificationId: notificationID,
    });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Priest notification mark-read error:", error);
    return res.status(500).json({ message: "Unable to mark notification as read." });
  }
});

app.patch("/priest-notifications/read-all", async (req, res) => {
  try {
    const priestID = Number(req.body?.priestID);
    if (!Number.isInteger(priestID) || priestID <= 0) {
      return res.status(400).json({ message: "A valid priestID is required." });
    }
    await query(
      `
        UPDATE priest_notifications
        SET "isRead" = TRUE,
            "readAt" = COALESCE("readAt", NOW())
        WHERE "priestID" = $1
          AND "isRead" = FALSE
      `,
      [priestID],
    );
    pushNotificationStreamEvent("priest", priestID, {
      action: "read_all",
    });
    return res.json({ message: "Notifications marked as read." });
  } catch (error) {
    console.error("Priest notifications read-all error:", error);
    return res.status(500).json({ message: "Unable to mark notifications as read." });
  }
});

const migrateLegacyJsonUsers = async () => {
  let legacyUsers = [];
  try {
    const fileContents = await fs.readFile(legacyUsersFilePath, "utf8");
    const parsed = JSON.parse(fileContents);
    if (Array.isArray(parsed)) {
      legacyUsers = parsed;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Legacy users migration skipped due to file read/parse error:", error);
    }
    return;
  }

  if (legacyUsers.length === 0) return;

  for (const legacyUser of legacyUsers) {
    const legacyEmail = String(legacyUser?.email || legacyUser?.username || legacyUser?.userName || "").trim();
    const legacyPasswordHash = String(legacyUser?.passwordHash || legacyUser?.password || "").trim();
    if (!legacyEmail || !legacyPasswordHash) {
      continue;
    }

    await query(
      `
        INSERT INTO users ("firstName", "lastName", address, birthdate, gender, email, password, "createdAt", "updatedAt", photo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (email) DO NOTHING
      `,
      [
        resolveStoredPersonName({
          firstName: legacyUser?.firstName,
          lastName: legacyUser?.lastName,
          fullName: legacyUser?.fullName || legacyEmail,
        }).firstName,
        resolveStoredPersonName({
          firstName: legacyUser?.firstName,
          lastName: legacyUser?.lastName,
          fullName: legacyUser?.fullName || legacyEmail,
        }).lastName,
        legacyUser?.address ? String(legacyUser.address).trim() : null,
        legacyUser?.birthdate || null,
        legacyUser?.gender ? String(legacyUser.gender).trim().toLowerCase() : null,
        legacyEmail,
        normalizeBcryptHash(legacyPasswordHash),
        legacyUser?.createdAt || null,
        legacyUser?.createdAt || null,
        legacyUser?.photo || null,
      ],
    );
  }
};

const sacramentSeeds = ["Baptism", "Marriage", "Funeral Mass", "Blessing"];
const PROGRESS_TEMPLATE_SEED_CLEANUP_MIGRATION_KEY = "2026-04-21-progress-template-seed-cleanup";
const PARISH_ACTIVITIES_SCHEMA_MIGRATION_KEY = "2026-09-05-parish-activities-payload-schema";
const PARISH_ACTIVITIES_MEDIA_FILEPATH_MIGRATION_KEY = "2026-09-05-parish-activities-media-filepath";
const MARRIAGE_SEPARATE_ADDRESSES_MIGRATION_KEY = "2026-09-11-marriage-separate-bride-groom-addresses";
const MARRIAGE_ADDRESS_BELOW_PHONE_MIGRATION_KEY = "2026-09-11-marriage-address-below-phone-numbers";
const MARRIAGE_ADDRESS_PLACEHOLDER_MIGRATION_KEY = "2026-09-11-marriage-address-matching-placeholders";
const FUNERAL_DECEASED_ADDRESS_MIGRATION_KEY = "2026-09-11-funeral-deceased-address";
const FUNERAL_ADDRESS_BELOW_FAMILY_MIGRATION_KEY = "2026-09-11-funeral-address-below-family-contact";
const MARRIAGE_BRIDE_ADDRESS_FIELD = {
  key: "brideAddress",
  label: "Bride Address",
  type: "text",
  required: true,
  placeholder: "Enter bride address",
};
const MARRIAGE_GROOM_ADDRESS_FIELD = {
  key: "groomAddress",
  label: "Groom Address",
  type: "text",
  required: true,
  placeholder: "Enter groom address",
};
const SACRAMENT_SCHEMA_KEY_TO_NAME = {
  marriage: "Marriage",
  baptism: "Baptism",
  death_mass: "Funeral Mass",
  blessing: "Blessing",
};
const BAPTISM_GODPARENT_FIELDS = [
  { key: "ninong", label: "Ninong (Godfathers)", type: "list", required: true, minEntries: 2 },
  { key: "ninang", label: "Ninang (Godmothers)", type: "list", required: true, minEntries: 2 },
];
const DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG = {
  version: 1,
  sacraments: {
    marriage: {
      label: "Marriage",
      aliases: ["marriage"],
      requirements: {
        documents: [
          "Cenomar",
          "Civil Marriage Contract",
          "Permit Mix Marriage",
          "Birth Certificate",
          "Confirmation Certificate",
          "Parish Permit",
          "Marriage Contract",
          "Marriage License",
        ],
        nonDocuments: ["Bec-Seminar", "Tawag", "Priest Interview", "Pre-Cana Seminar"],
      },
      fields: [
        { key: "brideName", label: "Bride Full Name", type: "text", required: true, placeholder: "Enter bride full name" },
        { key: "groomName", label: "Groom Full Name", type: "text", required: true, placeholder: "Enter groom full name" },
        { key: "brideAge", label: "Bride Age", type: "number", required: true, placeholder: "Enter bride age" },
        { key: "groomAge", label: "Groom Age", type: "number", required: true, placeholder: "Enter groom age" },
        { key: "bridePhoneNumber", label: "Bride Phone Number", type: "tel", required: true, placeholder: "Enter bride contact number" },
        { key: "groomPhoneNumber", label: "Groom Phone Number", type: "tel", required: true, placeholder: "Enter groom contact number" },
        { ...MARRIAGE_BRIDE_ADDRESS_FIELD },
        { ...MARRIAGE_GROOM_ADDRESS_FIELD },
        { key: "brideBirthCertificateFile", label: "Bride Birth Certificate", type: "file", required: true, accept: ".pdf,.docx,image/*" },
        { key: "groomBirthCertificateFile", label: "Groom Birth Certificate", type: "file", required: true, accept: ".pdf,.docx,image/*" },
        {
          key: "godparents",
          label: "Godparents (Ninong & Ninang)",
          type: "list",
          required: true,
          minEntries: 3,
        },
      ],
    },
    baptism: {
      label: "Baptism",
      aliases: ["baptism", "christening"],
      requirements: {
        documents: ["Endorsement Form", "Birth Certificate", "Marriage Contract of Parents"],
        nonDocuments: ["Seminar 1", "Seminar 2"],
      },
      fields: [
        { key: "childFullName", label: "Child Full Name", type: "text", required: true, placeholder: "Enter child full name" },
        { key: "childBirthDate", label: "Birth Date", type: "date", required: true },
        { key: "fatherName", label: "Father's Name", type: "text", required: true, placeholder: "Enter father's name" },
        { key: "motherName", label: "Mother's Name", type: "text", required: true, placeholder: "Enter mother's name" },
        { key: "address", label: "Address", type: "text", required: true, placeholder: "Enter complete address" },
        { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number" },
        ...BAPTISM_GODPARENT_FIELDS,
      ],
    },
    death_mass: {
      label: "Funeral Mass",
      aliases: ["funeral mass", "funeral-mass", "death mass", "death-mass"],
      requirements: {
        documents: ["Endorsement Form", "Death Certificate"],
        nonDocuments: [],
      },
      fields: [
        { key: "deceasedName", label: "Deceased Full Name", type: "text", required: true, placeholder: "Enter deceased full name" },
        { key: "dateOfDeath", label: "Date of Death", type: "date", required: true },
        { key: "familyContactName", label: "Family Contact Name", type: "text", required: true, placeholder: "Enter family contact name" },
        { key: "relationToDeceased", label: "Relationship to Deceased", type: "text", required: true, placeholder: "Enter relationship" },
        { key: "deceasedAddress", label: "Deceased Address", type: "text", required: true, placeholder: "Enter deceased address" },
        { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number" },
      ],
    },
    blessing: {
      label: "Blessing",
      aliases: ["blessing", "blessings"],
      requirements: {
        documents: [],
        nonDocuments: [],
      },
      fields: [
        {
          key: "blessingType",
          label: "Blessing Type",
          type: "select",
          required: true,
          options: ["House Blessing", "Vehicle Blessing", "Business Blessing", "Other Blessing"],
        },
        { key: "blessingTarget", label: "What will be blessed?", type: "text", required: true, placeholder: "Ex. New house at Zone 2" },
        { key: "address", label: "Address", type: "text", required: true, placeholder: "Enter complete address" },
        { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number" },
      ],
    },
    default: {
      label: "Default",
      aliases: [],
      requirements: {
        documents: [],
        nonDocuments: [],
      },
      fields: [
        { key: "address", label: "Address", type: "text", required: true, placeholder: "Enter complete address" },
        { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number" },
      ],
    },
  },
};
const DEFAULT_SPECIAL_SACRAMENT_FORM_SCHEMA = {
  version: 1,
  requirements: {
    documents: [],
    nonDocuments: [],
  },
  fields: [],
};
const EMPTY_SPECIAL_SACRAMENT_FORM_SCHEMA = {
  version: 1,
  requirements: {
    documents: [],
    nonDocuments: [],
  },
  fields: [],
};
const DEFAULT_SPECIAL_SACRAMENT_NAME = "Special Sacramental Program";
const PHONE_INPUT_REGEX = /^09\d{9}$/;
const EMAIL_INPUT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const normalizeLoginPhone = (value) => {
  const raw = String(value || "").trim();
  if (!/^[+\d\s()-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("639")) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("9")) digits = `0${digits}`;
  return /^09\d{9}$/.test(digits) ? digits : "";
};
const resolvePriestLoginIdentifiers = ({ email, phoneNumber } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = String(phoneNumber || "").trim();
  return {
    email: normalizedEmail,
    phoneNumber: normalizedPhone,
    storedEmail: normalizedEmail || null,
    storedPhoneNumber: normalizedPhone || null,
  };
};
const getPriestLoginIdentifierError = ({ email, phoneNumber } = {}) => {
  if (!email && !phoneNumber) {
    return "Provide a Gmail address, a phone number, or both so the priest can log in.";
  }
  if (email && (!EMAIL_INPUT_REGEX.test(email) || !isGmailAddress(email))) {
    return "Please use a Gmail address (example@gmail.com) for priest login.";
  }
  if (phoneNumber && !PHONE_INPUT_REGEX.test(phoneNumber)) {
    return "Phone number must be 11 digits and start with 09.";
  }
  return "";
};
const runAuthQuery = (dbClient, text, params = []) => {
  if (dbClient && typeof dbClient.query === "function") {
    return dbClient.query(text, params);
  }
  return query(text, params);
};
const priestMatchesUserSql = `
  (
    LENGTH(TRIM(COALESCE(p.email, ''))) > 0
    AND LOWER(TRIM(COALESCE(u.email, ''))) = LOWER(TRIM(COALESCE(p.email, '')))
  )
  OR (
    LENGTH(TRIM(COALESCE(p."phoneNumber", ''))) > 0
    AND LENGTH(TRIM(COALESCE(u."contactNumber", ''))) > 0
    AND regexp_replace(TRIM(u."contactNumber"), '[^0-9]', '', 'g')
      = regexp_replace(TRIM(p."phoneNumber"), '[^0-9]', '', 'g')
  )
`;
const findUserByLoginCredential = async (credential, dbClient) => {
  const normalizedEmail = normalizeEmail(credential);
  const normalizedPhone = normalizeLoginPhone(credential);
  const result = await runAuthQuery(
    dbClient,
    `
      SELECT "userID", "firstName", "lastName", ${sqlPersonFullName()} AS "fullName", address, "contactNumber", birthdate, gender, email, password, "createdAt", "updatedAt", photo
      FROM users
      WHERE LOWER(TRIM(email)) = $1
         OR (
           LENGTH($2) = 11
           AND regexp_replace(TRIM(COALESCE("contactNumber", '')), '[^0-9]', '', 'g') = $2
         )
      ORDER BY
        CASE WHEN LOWER(TRIM(email)) = $1 THEN 0 ELSE 1 END,
        "userID" DESC
      LIMIT 1
    `,
    [normalizedEmail, normalizedPhone],
  );
  return result.rows[0] || null;
};
const findPriestByLoginCredential = async (credential, dbClient) => {
  const normalizedEmail = normalizeEmail(credential);
  const normalizedPhone = normalizeLoginPhone(credential);
  const result = await runAuthQuery(
    dbClient,
    `
      SELECT
        p."priestID",
        p."adminID",
        p."fullName",
        p.email,
        p."phoneNumber",
        p.password,
        p.photo,
        COALESCE(p."isActive", TRUE) AS "isActive"
      FROM priests p
      WHERE
        (
          LENGTH(TRIM(COALESCE(p.email, ''))) > 0
          AND LOWER(TRIM(p.email)) = $1
        )
        OR (
          LENGTH($2) = 11
          AND regexp_replace(TRIM(COALESCE(p."phoneNumber", '')), '[^0-9]', '', 'g') = $2
        )
      ORDER BY
        CASE
          WHEN LENGTH(TRIM(COALESCE(p.email, ''))) > 0 AND LOWER(TRIM(p.email)) = $1 THEN 0
          ELSE 1
        END,
        p."priestID" DESC
      LIMIT 1
    `,
    [normalizedEmail, normalizedPhone],
  );
  return result.rows[0] || null;
};
const findPriestLinkedToUser = async (user, dbClient) => {
  if (!user) return null;
  const result = await runAuthQuery(
    dbClient,
    `
      SELECT
        p."priestID",
        p."adminID",
        p."fullName",
        p.email,
        p."phoneNumber",
        p.password,
        p.photo,
        COALESCE(p."isActive", TRUE) AS "isActive"
      FROM priests p
      WHERE
        (
          LENGTH(TRIM(COALESCE(p.email, ''))) > 0
          AND LOWER(TRIM(p.email)) = LOWER(TRIM($1))
        )
        OR (
          LENGTH(TRIM(COALESCE(p."phoneNumber", ''))) > 0
          AND LENGTH(TRIM($2)) > 0
          AND regexp_replace(TRIM(p."phoneNumber"), '[^0-9]', '', 'g')
            = regexp_replace(TRIM($2), '[^0-9]', '', 'g')
        )
      ORDER BY
        CASE
          WHEN LENGTH(TRIM(COALESCE(p.email, ''))) > 0 AND LOWER(TRIM(p.email)) = LOWER(TRIM($1)) THEN 0
          ELSE 1
        END,
        p."priestID" DESC
      LIMIT 1
    `,
    [resolveUserEmail(user), user.contactNumber || ""],
  );
  return result.rows[0] || null;
};

const findUserLinkedToPriest = async (priest, dbClient) => {
  if (!priest) return null;
  const priestEmail = normalizeEmail(priest.email);
  const priestPhone = String(priest.phoneNumber || "").trim();
  const result = await runAuthQuery(
    dbClient,
    `
      SELECT "userID", ${sqlPersonFullName()} AS "fullName", email, "contactNumber", photo
      FROM users
      WHERE
        (
          LENGTH(TRIM($1)) > 0
          AND LOWER(TRIM(email)) = LOWER(TRIM($1))
        )
        OR (
          LENGTH(TRIM($2)) > 0
          AND regexp_replace(TRIM(COALESCE("contactNumber", '')), '[^0-9]', '', 'g')
            = regexp_replace(TRIM($2), '[^0-9]', '', 'g')
        )
      ORDER BY
        CASE
          WHEN LENGTH(TRIM($1)) > 0 AND LOWER(TRIM(email)) = LOWER(TRIM($1)) THEN 0
          ELSE 1
        END,
        "userID" DESC
      LIMIT 1
    `,
    [priestEmail, priestPhone],
  );
  return result.rows[0] || null;
};
const assertLoginIdentifiersAvailable = async ({
  email,
  phoneNumber,
  excludeUserID = null,
  excludePriestID = null,
  excludeAdminID = null,
} = {}, dbClient) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizeLoginPhone(phoneNumber);
  if (!normalizedEmail && normalizedPhone.length !== 11) return;
  const conflicts = await runAuthQuery(
    dbClient,
    `
      SELECT kind
      FROM (
        SELECT 'email' AS kind
        FROM users
        WHERE $1 <> ''
          AND LOWER(email) = $1
          AND ($3::INT IS NULL OR "userID" <> $3)
        UNION ALL
        SELECT 'phone'
        FROM users
        WHERE $2 <> ''
          AND regexp_replace(TRIM(COALESCE("contactNumber", '')), '[^0-9]', '', 'g') = $2
          AND ($3::INT IS NULL OR "userID" <> $3)
        UNION ALL
        SELECT 'email'
        FROM priests
        WHERE $1 <> ''
          AND LOWER(email) = $1
          AND ($4::INT IS NULL OR "priestID" <> $4)
        UNION ALL
        SELECT 'phone'
        FROM priests
        WHERE $2 <> ''
          AND regexp_replace(TRIM(COALESCE("phoneNumber", '')), '[^0-9]', '', 'g') = $2
          AND ($4::INT IS NULL OR "priestID" <> $4)
      ) matches
      GROUP BY kind
    `,
    [normalizedEmail, normalizedPhone, excludeUserID, excludePriestID],
  );
  const kinds = new Set(conflicts.rows.map((row) => row.kind));
  if (kinds.size === 0 && excludeAdminID !== 1) {
    const adminResult = await forwardJsonRequestToAdminService("/profile?accountType=admin&accountID=1");
    if (!adminResult.ok || !adminResult.payload?.user) {
      const error = new Error("Unable to verify that this email address and phone number are available.");
      error.status = 503;
      throw error;
    }
    const admin = adminResult.payload.user;
    if (normalizedEmail && normalizeEmail(admin.email) === normalizedEmail) kinds.add("email");
    if (normalizedPhone && normalizeLoginPhone(admin.contactNumber) === normalizedPhone) kinds.add("phone");
  }
  if (kinds.size === 0) return;
  const emailTaken = kinds.has("email");
  const phoneTaken = kinds.has("phone");
  const error = new Error(
    emailTaken && phoneTaken
      ? "This Gmail address and phone number are already in use."
      : emailTaken
        ? "This email address is already in use."
        : "This phone number is already in use.",
  );
  error.status = 409;
  throw error;
};

const syncLinkedPriestIdentifiers = async (user, { email, phoneNumber, fullName } = {}) => {
  const linkedPriest = await findPriestLinkedToUser(user);
  if (!linkedPriest) return null;
  const nextEmail = email === undefined ? linkedPriest.email : normalizeEmail(email);
  const nextPhone = phoneNumber === undefined ? linkedPriest.phoneNumber : String(phoneNumber || "").trim();
  const nextName = fullName === undefined ? linkedPriest.fullName : String(fullName || "").trim();
  await query(
    `
      UPDATE priests
      SET
        email = $1,
        "phoneNumber" = $2,
        "firstName" = COALESCE(NULLIF(split_part(BTRIM($3), ' ', 1), ''), "firstName"),
        "lastName" = COALESCE(NULLIF(regexp_replace(BTRIM($3), '^\\S+\\s*', ''), ''), "lastName")
      WHERE "priestID" = $4
    `,
    [nextEmail, nextPhone, nextName, linkedPriest.priestID],
  );
  return linkedPriest;
};
const hasTextValue = (value) => String(value || "").trim().length > 0;
const toTrimmedOrNull = (value) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};
const toNullablePositiveInt = (value) => {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const normalizeCertificateTypeKey = (value) => String(value || "").trim().toLowerCase();
const normalizeCertificateRequestStatusInput = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue === "pending") return "Pending";
  if (normalizedValue === "ongoing" || normalizedValue === "approved") return "Approved";
  if (normalizedValue === "completed") return "Completed";
  if (normalizedValue === "cancelled" || normalizedValue === "canceled" || normalizedValue === "declined") return "Cancelled";
  return null;
};
const normalizeCertificateRequestStatusOutput = (value) =>
  normalizeCertificateRequestStatusInput(value) || "Pending";
const mapCertificateStatusToStatusPageState = (value) => {
  const normalizedStatus = normalizeCertificateRequestStatusOutput(value);
  if (normalizedStatus === "Approved") return "Ongoing";
  if (normalizedStatus === "Completed") return "Completed";
  if (normalizedStatus === "Pending") return "Pending";
  return normalizedStatus === "Cancelled" ? "Declined" : normalizedStatus;
};
const normalizeSacramentalTypeLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "marriage" || normalized === "marriage certificate") return "Marriage";
  if (normalized === "funeral mass" || normalized === "funeral-mass") return "Funeral Mass";
  if (normalized === "baptism" || normalized === "christening" || normalized === "baptismal certificate") return "Baptism";
  if (normalized === "blessing" || normalized === "blessings") return "Blessing";
  return "";
};
const isFuneralMassSacramentName = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "funeral mass" || normalized === "funeral-mass";
};
const FUNERAL_DECEASED_ADDRESS_FIELD = {
  key: "deceasedAddress",
  label: "Deceased Address",
  type: "text",
  required: true,
  placeholder: "Enter deceased address",
};
const FUNERAL_REQUIRED_SCHEMA_FIELDS = [
  {
    key: "deceasedName",
    label: "Deceased Full Name",
    type: "text",
    required: true,
    placeholder: "Enter deceased full name",
    aliases: ["deceasedName", "deceasedFullName"],
  },
  {
    key: "dateOfDeath",
    label: "Date of Death",
    type: "date",
    required: true,
    aliases: ["dateOfDeath"],
  },
  {
    key: "familyContactName",
    label: "Family Contact Name",
    type: "text",
    required: true,
    placeholder: "Enter family contact name",
    aliases: ["familyContactName"],
  },
  {
    key: "relationToDeceased",
    label: "Relationship to Deceased",
    type: "text",
    required: true,
    placeholder: "Enter relationship to deceased",
    aliases: ["relationToDeceased", "relationshipToDeceased"],
  },
  { ...FUNERAL_DECEASED_ADDRESS_FIELD, aliases: ["deceasedAddress", "address"] },
];
const normalizeComparableFieldToken = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const fieldMatchesFuneralRequirement = (field, requiredField) => {
  const fieldKey = normalizeComparableFieldToken(field?.key);
  const requiredKey = normalizeComparableFieldToken(requiredField?.key);
  if (
    fieldKey &&
    (fieldKey === requiredKey ||
      (requiredField?.aliases || []).some((alias) => normalizeComparableFieldToken(alias) === fieldKey))
  ) {
    return true;
  }
  const fieldLabel = normalizeComparableFieldToken(field?.label);
  const requiredLabel = normalizeComparableFieldToken(requiredField?.label);
  return Boolean(fieldLabel && requiredLabel && fieldLabel === requiredLabel);
};
const ensureFuneralMassRequiredFieldSchema = (fields, sacramentName) => {
  const normalizedFields = Array.isArray(fields) ? fields.map((field) => ({ ...(field || {}) })) : [];
  if (!isFuneralMassSacramentName(sacramentName)) return normalizedFields;

  const keyOf = (field) => String(field?.key || "").trim();
  const addressIndex = normalizedFields.findIndex((field) => normalizeComparableFieldToken(keyOf(field)) === "address");
  const deceasedAddressIndex = normalizedFields.findIndex(
    (field) => normalizeComparableFieldToken(keyOf(field)) === "deceasedaddress",
  );
  if (addressIndex > -1 && deceasedAddressIndex === -1) {
    normalizedFields[addressIndex] = {
      ...FUNERAL_DECEASED_ADDRESS_FIELD,
      ...normalizedFields[addressIndex],
      ...FUNERAL_DECEASED_ADDRESS_FIELD,
    };
  } else if (addressIndex > -1 && deceasedAddressIndex > -1) {
    normalizedFields.splice(addressIndex, 1);
  }

  const withRequired = [...normalizedFields];
  for (const requiredField of FUNERAL_REQUIRED_SCHEMA_FIELDS) {
    const hasField = withRequired.some((field) => fieldMatchesFuneralRequirement(field, requiredField));
    if (!hasField) {
      const { aliases: _aliases, ...fieldToAdd } = requiredField;
      withRequired.push({ ...fieldToAdd });
    }
  }

  return withRequired;
};
const DEFAULT_MIN_LIST_ENTRIES = 3;
const ensureSacramentRequiredFieldSchema = (fields, sacramentName) =>
  ensureFuneralMassRequiredFieldSchema(fields, sacramentName);
const resolveCertificateRequestTypeKey = (certificateType, details = {}) => {
  const normalizedType = normalizeCertificateTypeKey(certificateType);
  const normalizedDetailType = normalizeCertificateTypeKey(details?.certificateType);
  const source = normalizedDetailType || normalizedType;
  if (source.includes("marriage")) return "marriage";
  if (source.includes("baptism")) return "baptismal";
  return "";
};

const cloneDefaultSacramentSchemaConfig = () => JSON.parse(JSON.stringify(DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG));

const normalizeSchemaName = (value) => String(value || "").trim().toLowerCase();
const toSchemaKeyFromName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const sanitizeSchemaField = (field, index) => {
  const key = String(field?.key || "").trim();
  const label = String(field?.label || key || `Field ${index + 1}`).trim();
  const type = String(field?.type || "text").trim().toLowerCase();
  const sanitized = {
    key: key || `field_${index + 1}`,
    label: label || `Field ${index + 1}`,
    type: type || "text",
    required: field?.required !== false,
    placeholder: String(field?.placeholder || "").trim(),
    accept: String(field?.accept || "").trim(),
    options: Array.isArray(field?.options)
      ? field.options.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  };
  if (type === "list") {
    sanitized.minEntries = Math.max(1, Number(field?.minEntries) || DEFAULT_MIN_LIST_ENTRIES);
  }
  return sanitized;
};

const normalizeSacramentFormSchemaConfig = (rawConfig) => {
  const fallback = cloneDefaultSacramentSchemaConfig();
  if (!rawConfig || typeof rawConfig !== "object" || typeof rawConfig.sacraments !== "object") {
    return { ...fallback, archivedSacraments: {} };
  }
  const rawArchivedSacraments =
    rawConfig.archivedSacraments && typeof rawConfig.archivedSacraments === "object"
      ? rawConfig.archivedSacraments
      : {};
  const archivedDefaultKeys = new Set(
    Object.keys(rawArchivedSacraments)
      .map((key) => toSchemaKeyFromName(key))
      .filter(Boolean),
  );

  const result = {
    version: Number(rawConfig.version) || fallback.version,
    sacraments: {},
    archivedSacraments: {},
  };

  for (const [schemaKey, defaultSchema] of Object.entries(fallback.sacraments)) {
    if (schemaKey !== "default" && archivedDefaultKeys.has(schemaKey)) continue;
    const candidate = rawConfig.sacraments[schemaKey];
    const aliases = Array.isArray(candidate?.aliases)
      ? candidate.aliases.map((item) => normalizeSchemaName(item)).filter(Boolean)
      : defaultSchema.aliases;
    const requirementDocuments = Array.isArray(candidate?.requirements?.documents)
      ? candidate.requirements.documents.map((item) => String(item || "").trim()).filter(Boolean)
      : defaultSchema.requirements.documents;
    const requirementNonDocuments = Array.isArray(candidate?.requirements?.nonDocuments)
      ? candidate.requirements.nonDocuments.map((item) => String(item || "").trim()).filter(Boolean)
      : defaultSchema.requirements.nonDocuments;
    const fieldSource = Array.isArray(candidate?.fields) && candidate.fields.length > 0 ? candidate.fields : defaultSchema.fields;
    result.sacraments[schemaKey] = {
      label: String(candidate?.label || defaultSchema.label).trim() || defaultSchema.label,
      aliases: aliases.length > 0 || schemaKey === "default" ? aliases : defaultSchema.aliases,
      requirements: {
        documents: requirementDocuments,
        nonDocuments: requirementNonDocuments,
      },
      fields: fieldSource.map((field, index) => sanitizeSchemaField(field, index)),
    };
  }

  const customEntries = Object.entries(rawConfig.sacraments).filter(([schemaKey]) => !Object.prototype.hasOwnProperty.call(fallback.sacraments, schemaKey));
  for (const [rawSchemaKey, rawSchema] of customEntries) {
    const normalizedSchemaKey = toSchemaKeyFromName(rawSchemaKey);
    if (!normalizedSchemaKey || normalizedSchemaKey === "default") continue;
    if (Object.prototype.hasOwnProperty.call(result.sacraments, normalizedSchemaKey)) continue;
    const label = String(rawSchema?.label || rawSchemaKey).trim();
    const aliases = Array.isArray(rawSchema?.aliases)
      ? rawSchema.aliases.map((item) => normalizeSchemaName(item)).filter(Boolean)
      : [];
    const requirementDocuments = Array.isArray(rawSchema?.requirements?.documents)
      ? rawSchema.requirements.documents.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const requirementNonDocuments = Array.isArray(rawSchema?.requirements?.nonDocuments)
      ? rawSchema.requirements.nonDocuments.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const fieldSource = Array.isArray(rawSchema?.fields) && rawSchema.fields.length > 0 ? rawSchema.fields : fallback.sacraments.default.fields;
    result.sacraments[normalizedSchemaKey] = {
      label: label || rawSchemaKey,
      aliases: aliases.length > 0 ? aliases : [normalizeSchemaName(label || rawSchemaKey)],
      requirements: {
        documents: requirementDocuments,
        nonDocuments: requirementNonDocuments,
      },
      fields: fieldSource.map((field, index) => sanitizeSchemaField(field, index)),
    };
  }

  const archivedEntries = Object.entries(rawArchivedSacraments);
  for (const [rawSchemaKey, rawSchema] of archivedEntries) {
    const normalizedSchemaKey = toSchemaKeyFromName(rawSchemaKey);
    if (!normalizedSchemaKey || normalizedSchemaKey === "default") continue;
    if (Object.prototype.hasOwnProperty.call(result.sacraments, normalizedSchemaKey)) continue;
    if (Object.prototype.hasOwnProperty.call(result.archivedSacraments, normalizedSchemaKey)) continue;
    const fallbackSchema = fallback.sacraments[normalizedSchemaKey] || fallback.sacraments.default;
    const label = String(rawSchema?.label || fallbackSchema?.label || rawSchemaKey).trim();
    const aliases = Array.isArray(rawSchema?.aliases)
      ? rawSchema.aliases.map((item) => normalizeSchemaName(item)).filter(Boolean)
      : Array.isArray(fallbackSchema?.aliases)
        ? fallbackSchema.aliases
        : [];
    const requirementDocuments = Array.isArray(rawSchema?.requirements?.documents)
      ? rawSchema.requirements.documents.map((item) => String(item || "").trim()).filter(Boolean)
      : Array.isArray(fallbackSchema?.requirements?.documents)
        ? fallbackSchema.requirements.documents
        : [];
    const requirementNonDocuments = Array.isArray(rawSchema?.requirements?.nonDocuments)
      ? rawSchema.requirements.nonDocuments.map((item) => String(item || "").trim()).filter(Boolean)
      : Array.isArray(fallbackSchema?.requirements?.nonDocuments)
        ? fallbackSchema.requirements.nonDocuments
        : [];
    const fieldSource = Array.isArray(rawSchema?.fields) && rawSchema.fields.length > 0 ? rawSchema.fields : fallback.sacraments.default.fields;
    result.archivedSacraments[normalizedSchemaKey] = {
      label: label || rawSchemaKey,
      aliases: aliases.length > 0 ? aliases : [normalizeSchemaName(label || rawSchemaKey)],
      requirements: {
        documents: requirementDocuments,
        nonDocuments: requirementNonDocuments,
      },
      fields: fieldSource.map((field, index) => sanitizeSchemaField(field, index)),
    };
  }

  return result;
};

const normalizeSpecialSacramentFormSchema = (rawSchema) => {
  const fallback = JSON.parse(JSON.stringify(DEFAULT_SPECIAL_SACRAMENT_FORM_SCHEMA));
  if (!rawSchema || typeof rawSchema !== "object") {
    return fallback;
  }
  const requirementDocuments = Array.isArray(rawSchema?.requirements?.documents)
    ? rawSchema.requirements.documents.map((item) => String(item || "").trim()).filter(Boolean)
    : fallback.requirements.documents;
  const requirementNonDocuments = Array.isArray(rawSchema?.requirements?.nonDocuments)
    ? rawSchema.requirements.nonDocuments.map((item) => String(item || "").trim()).filter(Boolean)
    : fallback.requirements.nonDocuments;
  const fieldSource = Array.isArray(rawSchema?.fields) ? rawSchema.fields : fallback.fields;

  return {
    version: Number(rawSchema?.version) || fallback.version,
    requirements: {
      documents: requirementDocuments,
      nonDocuments: requirementNonDocuments,
    },
    fields: fieldSource.map((field, index) => sanitizeSchemaField(field, index)),
  };
};

const normalizeSpecialSacramentName = (value) => {
  const normalized = String(value || "").trim();
  return normalized || DEFAULT_SPECIAL_SACRAMENT_NAME;
};

const mapSpecialSacramentSchemaTemplate = (row) => {
  const specialSacramentName = normalizeSpecialSacramentName(row.specialSacramentName);
  const schemaID = Number(row.schemaID);
  return {
    s_sacramentID: schemaID,
    schemaID,
    specialSacramentName,
    s_sacramentName: specialSacramentName,
    displayLabel: specialSacramentName,
    formSchema: normalizeSpecialSacramentFormSchema(row.formSchema || row.form_schema),
    isTemplateOnly: false,
  };
};

const listStoredSpecialSacramentSchemaTemplates = async () => {
  const result = await query(
    `
      SELECT "schemaID",
             "specialSacramentName",
             "formSchema"
      FROM special_sacraments_form_schemas
      ORDER BY LOWER(TRIM("specialSacramentName")) ASC, "updatedAt" DESC, "schemaID" DESC
    `,
  );
  return result.rows.map((row) => mapSpecialSacramentSchemaTemplate(row));
};

const findSpecialSacramentSchemaByName = async (specialSacramentName, dbClient = null) => {
  const runner = dbClient && typeof dbClient.query === "function" ? dbClient.query.bind(dbClient) : query;
  const result = await runner(
    `
      SELECT "schemaID",
             "specialSacramentName",
             "formSchema"
      FROM special_sacraments_form_schemas
      WHERE LOWER(TRIM("specialSacramentName")) = LOWER(TRIM($1))
      ORDER BY "updatedAt" DESC, "schemaID" DESC
      LIMIT 1
    `,
    [specialSacramentName],
  );
  return result.rows[0] || null;
};

const getStoredDefaultSpecialSacramentSchema = async () => {
  const result = await query(
    `
      SELECT "specialSacramentName",
             "formSchema"
      FROM special_sacraments_form_schemas
      WHERE LOWER(TRIM("specialSacramentName")) = LOWER(TRIM($1))
      ORDER BY "updatedAt" DESC, "schemaID" DESC
      LIMIT 1
    `,
    [DEFAULT_SPECIAL_SACRAMENT_NAME],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const normalizedName = normalizeSpecialSacramentName(result.rows[0].specialSacramentName);
  return {
    specialSacramentName: normalizedName,
    displayLabel: normalizedName,
    formSchema: normalizeSpecialSacramentFormSchema(result.rows[0].formSchema),
  };
};

const ensureSpecialSchemaProgressTemplate = async (schemaID, dbClient = null) => {
  const normalizedSchemaID = Number(schemaID);
  if (!Number.isInteger(normalizedSchemaID) || normalizedSchemaID <= 0) return null;
  const runner = dbClient && typeof dbClient.query === "function" ? dbClient.query.bind(dbClient) : query;
  const result = await runner(
    `
      INSERT INTO progress_templates (scope, "sacramentID", "schemaID", "templateName", "isActive")
      SELECT 'special_sacrament', NULL, $1, NULL, TRUE
      WHERE NOT EXISTS (
        SELECT 1
        FROM progress_templates
        WHERE scope = 'special_sacrament'
          AND "schemaID" = $1
      )
      RETURNING "templateID"
    `,
    [normalizedSchemaID],
  );
  return result.rows[0] ? Number(result.rows[0].templateID) : null;
};

const collectRenamedSpecialSacramentFieldKeys = (previousFields, nextFields) => {
  const previous = Array.isArray(previousFields) ? previousFields : [];
  const next = Array.isArray(nextFields) ? nextFields : [];
  const renames = [];
  const limit = Math.min(previous.length, next.length);
  for (let index = 0; index < limit; index += 1) {
    const oldKey = String(previous[index]?.key || "").trim();
    const newKey = String(next[index]?.key || "").trim();
    if (!oldKey || !newKey || oldKey === newKey) continue;
    const oldKeyStillUsed = next.some(
      (field, fieldIndex) => fieldIndex !== index && String(field?.key || "").trim() === oldKey,
    );
    const newKeyAlreadyUsed = previous.some(
      (field, fieldIndex) => fieldIndex !== index && String(field?.key || "").trim() === newKey,
    );
    if (oldKeyStillUsed || newKeyAlreadyUsed) continue;
    renames.push({ oldKey, newKey });
  }
  return renames;
};

const rewriteSpecialSacramentCredentialKeys = async (specialSacramentName, renames, dbClient = null) => {
  const sacramentName = String(specialSacramentName || "").trim();
  if (!sacramentName || !Array.isArray(renames) || renames.length === 0) return;
  const runner = dbClient && typeof dbClient.query === "function" ? dbClient.query.bind(dbClient) : query;
  for (const rename of renames) {
    const oldKey = String(rename?.oldKey || "").trim();
    const newKey = String(rename?.newKey || "").trim();
    if (!oldKey || !newKey || oldKey === newKey) continue;
    await runner(
      `
        UPDATE appointments a
        SET credentials = (a.credentials - $2) || jsonb_build_object($3, a.credentials -> $2)
        FROM special_sacraments ss
        WHERE a."s_sacramentID" = ss."s_sacramentID"
          AND LOWER(TRIM(ss."s_sacramentName")) = LOWER(TRIM($1))
          AND jsonb_typeof(a.credentials) = 'object'
          AND a.credentials ? $2
          AND NOT (a.credentials ? $3)
      `,
      [sacramentName, oldKey, newKey],
    );
  }
};

const upsertSpecialSacramentSchemaTemplate = async ({ specialSacramentName, displayLabel, formSchema }, dbClient = null) => {
  const normalizedSpecialSacramentName = normalizeSpecialSacramentName(specialSacramentName || displayLabel);
  const normalizedFormSchema = normalizeSpecialSacramentFormSchema(formSchema);
  const runner = dbClient && typeof dbClient.query === "function" ? dbClient.query.bind(dbClient) : query;
  const existingSchema = await findSpecialSacramentSchemaByName(normalizedSpecialSacramentName, dbClient);
  const renamedFieldKeys = collectRenamedSpecialSacramentFieldKeys(
    normalizeSpecialSacramentFormSchema(existingSchema?.formSchema).fields,
    normalizedFormSchema.fields,
  );
  const result = await runner(
    `
      INSERT INTO special_sacraments_form_schemas ("specialSacramentName", "formSchema", "updatedAt")
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT ("specialSacramentName") DO UPDATE
      SET "formSchema" = EXCLUDED."formSchema",
          "updatedAt" = NOW()
      RETURNING "schemaID", "specialSacramentName"
    `,
    [normalizedSpecialSacramentName, JSON.stringify(normalizedFormSchema)],
  );
  const schemaID = Number(result.rows[0]?.schemaID);
  await ensureSpecialSchemaProgressTemplate(schemaID, dbClient);
  await rewriteSpecialSacramentCredentialKeys(normalizedSpecialSacramentName, renamedFieldKeys, dbClient);
  return {
    schemaID: Number.isInteger(schemaID) && schemaID > 0 ? schemaID : null,
    specialSacramentName: normalizedSpecialSacramentName,
    displayLabel: normalizedSpecialSacramentName,
    formSchema: normalizedFormSchema,
  };
};

const upsertDefaultSpecialSacramentSchema = async ({ specialSacramentName, displayLabel, formSchema }, dbClient = null) =>
  upsertSpecialSacramentSchemaTemplate({ specialSacramentName, displayLabel, formSchema }, dbClient);

const getSpecialSacramentSchemaByName = async (specialSacramentName, dbClient = null) => {
  const normalizedSpecialSacramentName = normalizeSpecialSacramentName(specialSacramentName);
  if (!normalizedSpecialSacramentName) {
    return normalizeSpecialSacramentFormSchema(DEFAULT_SPECIAL_SACRAMENT_FORM_SCHEMA);
  }
  const runner = dbClient && typeof dbClient.query === "function" ? dbClient.query.bind(dbClient) : query;
  const result = await runner(
    `
      SELECT "formSchema"
      FROM special_sacraments_form_schemas
      WHERE LOWER(TRIM("specialSacramentName")) = LOWER(TRIM($1))
      ORDER BY "updatedAt" DESC, "schemaID" DESC
      LIMIT 1
    `,
    [normalizedSpecialSacramentName],
  );
  if (result.rows.length > 0) {
    return normalizeSpecialSacramentFormSchema(result.rows[0].formSchema ?? result.rows[0].form_schema);
  }
  const defaultResult = await runner(
    `
      SELECT "formSchema"
      FROM special_sacraments_form_schemas
      WHERE LOWER(TRIM("specialSacramentName")) = LOWER(TRIM($1))
      ORDER BY "updatedAt" DESC, "schemaID" DESC
      LIMIT 1
    `,
    [DEFAULT_SPECIAL_SACRAMENT_NAME],
  );
  return defaultResult.rows.length > 0
    ? normalizeSpecialSacramentFormSchema(defaultResult.rows[0].formSchema ?? defaultResult.rows[0].form_schema)
    : normalizeSpecialSacramentFormSchema(DEFAULT_SPECIAL_SACRAMENT_FORM_SCHEMA);
};

const hasCredentialTextValue = (value) => String(value ?? "").trim().length > 0;

// Records saved before the single-list change stored two named groups.
const toListCredentialEntries = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const legacyGroups = [value.godfathers, value.godmothers, value.entries].filter(Array.isArray);
    if (legacyGroups.length > 0) return legacyGroups.flat();
  }
  return [];
};

const sanitizeListCredentialValue = (value) =>
  toListCredentialEntries(value)
    .map((entry) => ({
      name: String(entry?.name || "").trim(),
      phone: String(entry?.phone || "").trim(),
    }))
    .filter((entry) => entry.name)
    .map((entry) => ({
      name: entry.name,
      ...(entry.phone ? { phone: entry.phone } : {}),
    }));

const validateListCredentialValue = (value, field = {}) => {
  const minEntries = Math.max(1, Number(field?.minEntries) || DEFAULT_MIN_LIST_ENTRIES);
  const fieldLabel = String(field?.label || "List").trim();
  const sanitized = sanitizeListCredentialValue(value);
  if (sanitized.length < minEntries) {
    return `Please enter at least ${minEntries} ${fieldLabel} entr${minEntries === 1 ? "y" : "ies"}.`;
  }
  for (const entry of sanitized) {
    if (entry.phone && !PHONE_INPUT_REGEX.test(String(entry.phone).trim())) {
      return `${fieldLabel}: phone numbers must be 11 digits and start with 09.`;
    }
  }
  return "";
};

const getRequiredCredentialValue = (credentials = {}, field = {}) => {
  const fieldKey = String(field?.key || "").trim();
  if (!fieldKey) return null;
  const directValue = credentials?.[fieldKey];
    if (field?.type === "file") {
      if (directValue) return directValue;
      const candidates = [
        `${fieldKey}Url`,
        `${fieldKey}FileUrl`,
        fieldKey.replace(/File$/i, "FileUrl"),
        `${fieldKey}Name`,
        `${fieldKey}FileName`,
        fieldKey.replace(/File$/i, "FileName"),
      ];
      for (const candidateKey of candidates) {
        if (hasCredentialTextValue(credentials?.[candidateKey])) return credentials[candidateKey];
      }
      return null;
    }
    if (String(field?.type || "").trim().toLowerCase() === "list") {
      return credentials?.[fieldKey];
    }
    return directValue;
};

const validateCredentialsAgainstFieldSchema = (credentials = {}, fieldSchema = []) => {
  const safeSchema = Array.isArray(fieldSchema) ? fieldSchema : [];
  for (const field of safeSchema) {
    const fieldKey = String(field?.key || "").trim();
    const fieldLabel = String(field?.label || fieldKey || "Field").trim();
    const fieldType = String(field?.type || "text").trim().toLowerCase();
    if (!fieldKey) continue;
    const value = getRequiredCredentialValue(credentials, field);
    if (fieldType === "list") {
      if (field?.required !== false || value) {
        const listValidationError = validateListCredentialValue(value, field);
        if (listValidationError) return listValidationError;
      }
      continue;
    }
    if (field?.required !== false) {
      const isMissing =
        fieldType === "file"
          ? !value
          : !hasCredentialTextValue(value);
      if (isMissing) {
        return `${fieldLabel} is required.`;
      }
    }
    if (!hasCredentialTextValue(value)) continue;
    if (fieldType === "number") {
      const parsedNumber = Number(value);
      if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) {
        return `${fieldLabel} must be a valid number.`;
      }
    }
    if (fieldType === "date" && !DATE_ONLY_REGEX.test(String(value).trim())) {
      return `${fieldLabel} must be in YYYY-MM-DD format.`;
    }
    const normalizedKey = fieldKey.toLowerCase();
    const normalizedLabel = fieldLabel.toLowerCase();
    const isPhoneLikeField =
      fieldType === "tel" ||
      normalizedKey.includes("phone") ||
      normalizedKey.includes("contactnumber") ||
      normalizedKey.includes("contact_number") ||
      normalizedLabel.includes("phone number") ||
      normalizedLabel.includes("contact number");
    if (isPhoneLikeField && !PHONE_INPUT_REGEX.test(String(value).trim())) {
      return `${fieldLabel} must be 11 digits and start with 09.`;
    }
  }
  const isMarriageSchema = safeSchema.some((field) => field?.key === "brideName") &&
    safeSchema.some((field) => field?.key === "groomName");
  if (isMarriageSchema) return findMarriageDuplicateNameError(credentials, safeSchema);
  return "";
};

const toComparablePersonName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

const findMarriageDuplicateNameError = (credentials = {}, fieldSchema = []) => {
  const brideName = toComparablePersonName(credentials?.brideName);
  const groomName = toComparablePersonName(credentials?.groomName);
  if (brideName && groomName && brideName === groomName) {
    return "The bride and groom cannot have the same name.";
  }
  const seenSponsors = new Map();
  for (const field of fieldSchema) {
    if (String(field?.type || "").trim().toLowerCase() !== "list") continue;
    const fieldLabel = String(field?.label || field?.key || "Sponsors").trim();
    const entries = Array.isArray(credentials?.[field.key]) ? credentials[field.key] : [];
    for (const entry of entries) {
      const rawName = String(entry?.name || "").trim();
      const name = toComparablePersonName(rawName);
      if (!name) continue;
      if (name === brideName || name === groomName) {
        return `${rawName} is already entered as the ${name === brideName ? "bride" : "groom"} and cannot also be a sponsor.`;
      }
      const firstField = seenSponsors.get(name);
      if (firstField) {
        return firstField === fieldLabel
          ? `${fieldLabel}: "${rawName}" is entered more than once. Each sponsor must have a different name.`
          : `"${rawName}" is entered in both ${firstField} and ${fieldLabel}. Each sponsor must have a different name.`;
      }
      seenSponsors.set(name, fieldLabel);
    }
  }
  return "";
};

const buildSacramentFormSchemaConfigFromRows = (rows = []) => {
  const baseConfig = cloneDefaultSacramentSchemaConfig();
  baseConfig.archivedSacraments = {};
  const rowsByName = new Map(
    rows.map((row) => [String(row?.sacramentName || "").trim().toLowerCase(), row]),
  );

  for (const [schemaKey, sacramentName] of Object.entries(SACRAMENT_SCHEMA_KEY_TO_NAME)) {
    const targetRow = rowsByName.get(String(sacramentName).toLowerCase());
    if (!targetRow) continue;
    const baseSchema = baseConfig.sacraments[schemaKey];
    const mergedSchema = {
      ...baseSchema,
      aliases:
        Array.isArray(targetRow.schemaAliases) && targetRow.schemaAliases.length > 0
          ? targetRow.schemaAliases
          : baseSchema.aliases,
      requirements:
        targetRow.requirements && typeof targetRow.requirements === "object"
          ? targetRow.requirements
          : baseSchema.requirements,
      fields: ensureSacramentRequiredFieldSchema(
        Array.isArray(targetRow.formSchema) && targetRow.formSchema.length > 0 ? targetRow.formSchema : baseSchema.fields,
        sacramentName,
      ),
    };
    if (Boolean(targetRow?.isArchived) && schemaKey !== "default") {
      baseConfig.archivedSacraments[schemaKey] = mergedSchema;
      delete baseConfig.sacraments[schemaKey];
      continue;
    }
    baseConfig.sacraments[schemaKey] = mergedSchema;
  }

  for (const row of rows) {
    const sacramentName = String(row?.sacramentName || "").trim();
    if (!sacramentName) continue;
    const mappedDefaultKey = Object.entries(SACRAMENT_SCHEMA_KEY_TO_NAME).find(
      ([, label]) => normalizeSchemaName(label) === normalizeSchemaName(sacramentName),
    )?.[0];
    if (mappedDefaultKey) continue;
    const schemaKey = toSchemaKeyFromName(sacramentName);
    if (!schemaKey || schemaKey === "default") continue;
    const nextSchema = {
      label: sacramentName,
      aliases:
        Array.isArray(row?.schemaAliases) && row.schemaAliases.length > 0
          ? row.schemaAliases
          : [normalizeSchemaName(sacramentName)],
      requirements:
        row?.requirements && typeof row.requirements === "object"
          ? row.requirements
          : { documents: [], nonDocuments: [] },
      fields: ensureSacramentRequiredFieldSchema(
        Array.isArray(row?.formSchema) && row.formSchema.length > 0 ? row.formSchema : baseConfig.sacraments.default.fields,
        sacramentName,
      ),
    };
    if (Boolean(row?.isArchived)) {
      if (!Object.prototype.hasOwnProperty.call(baseConfig.archivedSacraments, schemaKey)) {
        baseConfig.archivedSacraments[schemaKey] = nextSchema;
      }
      delete baseConfig.sacraments[schemaKey];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(baseConfig.sacraments, schemaKey)) {
      baseConfig.sacraments[schemaKey] = nextSchema;
    }
  }

  return normalizeSacramentFormSchemaConfig(baseConfig);
};

const DEFAULT_SCHEMA_KEY_BY_SACRAMENT_NAME = new Map(
  Object.entries(SACRAMENT_SCHEMA_KEY_TO_NAME).map(([schemaKey, sacramentName]) => [normalizeSchemaName(sacramentName), schemaKey]),
);

const toRequirementList = (values) =>
  Array.isArray(values) ? values.map((item) => String(item || "").trim()).filter(Boolean) : [];

// Builds the config strictly from sacraments rows so the manager reflects the table as-is.
const buildSacramentFormSchemaConfigFromSacramentsTable = (rows = []) => {
  const config = { version: 1, sacraments: {}, archivedSacraments: {} };
  for (const row of rows) {
    const sacramentName = String(row?.sacramentName || "").trim().replace(/\s+/g, " ");
    if (!sacramentName) continue;
    const schemaKey =
      DEFAULT_SCHEMA_KEY_BY_SACRAMENT_NAME.get(normalizeSchemaName(sacramentName)) || toSchemaKeyFromName(sacramentName);
    if (!schemaKey || schemaKey === "default") continue;
    const aliases = Array.isArray(row?.schemaAliases)
      ? row.schemaAliases.map((item) => normalizeSchemaName(item)).filter(Boolean)
      : [];
    const schema = {
      label: sacramentName,
      aliases: aliases.length > 0 ? aliases : [normalizeSchemaName(sacramentName)],
      requirements: {
        documents: toRequirementList(row?.requirements?.documents),
        nonDocuments: toRequirementList(row?.requirements?.nonDocuments),
      },
      fields: (Array.isArray(row?.formSchema) ? row.formSchema : []).map((field, index) => sanitizeSchemaField(field, index)),
    };
    const target = row?.isArchived ? config.archivedSacraments : config.sacraments;
    if (!Object.prototype.hasOwnProperty.call(target, schemaKey)) {
      target[schemaKey] = schema;
    }
  }
  return config;
};

const getSacramentFormSchemaConfigFromSacramentsTable = async () => {
  const result = await query(
    `
      SELECT "sacramentName", "formSchema", requirements, "schemaAliases"
            , COALESCE("isArchived", FALSE) AS "isArchived"
      FROM sacraments
      ORDER BY "sacramentID" ASC
    `,
  );
  return buildSacramentFormSchemaConfigFromSacramentsTable(result.rows);
};

const getStoredSacramentFormSchemaConfig = getSacramentFormSchemaConfigFromSacramentsTable;

const schemaKeyForSacramentName = (sacramentName) => {
  const name = String(sacramentName || "").trim();
  if (!name) return "";
  return DEFAULT_SCHEMA_KEY_BY_SACRAMENT_NAME.get(normalizeSchemaName(name)) || toSchemaKeyFromName(name);
};

const findSacramentRowBySchemaKey = async (schemaKeyInput, options = {}) => {
  const sacramentID = Number(options.sacramentID);
  if (Number.isInteger(sacramentID) && sacramentID > 0) {
    const result = await query(
      `
        SELECT "sacramentID", "sacramentName", "formSchema", requirements, "schemaAliases"
              , COALESCE("isArchived", FALSE) AS "isArchived"
        FROM sacraments
        WHERE "sacramentID" = $1
        LIMIT 1
      `,
      [sacramentID],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { ...row, schemaKey: schemaKeyForSacramentName(row.sacramentName) };
  }

  const schemaKey = toSchemaKeyFromName(schemaKeyInput);
  if (!schemaKey || schemaKey === "default") return null;
  const result = await query(
    `
      SELECT "sacramentID", "sacramentName", "formSchema", requirements, "schemaAliases"
            , COALESCE("isArchived", FALSE) AS "isArchived"
      FROM sacraments
    `,
  );
  const row = result.rows.find((candidate) => {
    const mappedKey = schemaKeyForSacramentName(candidate?.sacramentName);
    const slugKey = toSchemaKeyFromName(candidate?.sacramentName);
    return mappedKey === schemaKey || slugKey === schemaKey;
  });
  if (!row) return null;
  return { ...row, schemaKey: schemaKeyForSacramentName(row.sacramentName) };
};

const parseIncomingSchemaField = (rawField, index = 0) => {
  const optionsFromText = String(rawField?.optionsText || "")
    .split("\n")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return sanitizeSchemaField(
    {
      ...rawField,
      options: Array.isArray(rawField?.options) && rawField.options.length > 0 ? rawField.options : optionsFromText,
    },
    index,
  );
};

const updateSacramentFormSchemaFields = async (sacramentID, fields) => {
  await query(
    `
      UPDATE sacraments
      SET "formSchema" = $1::jsonb
      WHERE "sacramentID" = $2
    `,
    [JSON.stringify(fields), sacramentID],
  );
};

const persistSacramentFormSchemaConfigToSacraments = async (config, { fillOnlyMissing = false } = {}) => {
  const normalizedConfig = normalizeSacramentFormSchemaConfig(config);
  const persistSchemaEntry = async (schemaKey, schema, isArchived) => {
    if (schemaKey === "default") return;
    const sacramentName = String(schema?.label || schemaKey)
      .trim()
      .replace(/\s+/g, " ");
    if (!sacramentName) return;
    await query(
      `
        INSERT INTO sacraments ("sacramentName")
        VALUES ($1)
        ON CONFLICT ("sacramentName") DO NOTHING
      `,
      [sacramentName],
    );
    if (fillOnlyMissing) {
      await query(
        `
          UPDATE sacraments
          SET "formSchema" = COALESCE("formSchema", $1::jsonb),
              requirements = COALESCE(requirements, $2::jsonb),
              "schemaAliases" = COALESCE("schemaAliases", $3::jsonb),
              "isArchived" = COALESCE("isArchived", $4::boolean)
          WHERE LOWER("sacramentName") = LOWER($5)
        `,
        [JSON.stringify(schema.fields || []), JSON.stringify(schema.requirements || {}), JSON.stringify(schema.aliases || []), isArchived, sacramentName],
      );
      return;
    }
    await query(
      `
        UPDATE sacraments
        SET "formSchema" = $1::jsonb,
            requirements = $2::jsonb,
            "schemaAliases" = $3::jsonb,
            "isArchived" = $4::boolean
        WHERE LOWER("sacramentName") = LOWER($5)
      `,
      [JSON.stringify(schema.fields || []), JSON.stringify(schema.requirements || {}), JSON.stringify(schema.aliases || []), isArchived, sacramentName],
    );
  };
  for (const [schemaKey, schema] of Object.entries(normalizedConfig.sacraments || {})) {
    await persistSchemaEntry(schemaKey, schema, false);
  }
  for (const [schemaKey, schema] of Object.entries(normalizedConfig.archivedSacraments || {})) {
    if (Object.prototype.hasOwnProperty.call(normalizedConfig.sacraments || {}, schemaKey)) continue;
    await persistSchemaEntry(schemaKey, schema, true);
  }
};

const moveSacramentSchemaArchiveState = async (schemaKeyInput, shouldArchive, options = {}) => {
  const schemaKey = toSchemaKeyFromName(schemaKeyInput);
  if (!schemaKey || schemaKey === "default") {
    return { status: 400, message: "A valid sacrament schema key is required." };
  }

  const row = await findSacramentRowBySchemaKey(schemaKey, options);
  if (!row) {
    return { status: 404, message: shouldArchive ? "Sacrament type not found in active list." : "Sacrament type not found in archive." };
  }

  if (shouldArchive) {
    if (row.isArchived) {
      return { status: 400, message: "Sacrament type is already archived." };
    }
    const activeCountResult = await query(
      `
        SELECT COUNT(*)::int AS count
        FROM sacraments
        WHERE COALESCE("isArchived", FALSE) = FALSE
      `,
    );
    if ((activeCountResult.rows[0]?.count || 0) <= 1) {
      return { status: 400, message: "At least one sacrament type must remain active." };
    }
  } else if (!row.isArchived) {
    return { status: 400, message: "Sacrament type is not archived." };
  }

  await query(
    `
      UPDATE sacraments
      SET "isArchived" = $1::boolean
      WHERE "sacramentID" = $2
    `,
    [shouldArchive, row.sacramentID],
  );

  const config = await getSacramentFormSchemaConfigFromSacramentsTable();
  return { status: 200, config, schemaKey: row.schemaKey };
};

const deleteArchivedSacramentSchema = async (schemaKeyInput, options = {}) => {
  const schemaKey = toSchemaKeyFromName(schemaKeyInput);
  if (!schemaKey || schemaKey === "default") {
    return { status: 400, message: "A valid sacrament schema key is required." };
  }

  const row = await findSacramentRowBySchemaKey(schemaKey, options);
  if (!row) {
    return { status: 404, message: "Sacrament type not found in archive." };
  }
  if (!row.isArchived) {
    return { status: 400, message: "Only archived sacrament types can be deleted." };
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    // Remove linked appointment records first so the sacrament row can be deleted safely.
    await dbClient.query(
      `
        DELETE FROM appointments
        WHERE "sacramentID" = $1
      `,
      [row.sacramentID],
    );
    await dbClient.query(
      `
        DELETE FROM sacraments
        WHERE "sacramentID" = $1
      `,
      [row.sacramentID],
    );
    await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK");
    if (error?.code === "23503") {
      return {
        status: 409,
        message: "Cannot delete this sacrament type because it is still used by existing records.",
      };
    }
    throw error;
  } finally {
    dbClient.release();
  }

  const config = await getSacramentFormSchemaConfigFromSacramentsTable();
  return { status: 200, config, schemaKey: row.schemaKey };
};

const migrateLegacySacramentSchemaSettings = async () => {
  const tableResult = await query(`SELECT to_regclass('public.app_settings') AS "tableName"`);
  if (!tableResult.rows[0]?.tableName) {
    await persistSacramentFormSchemaConfigToSacraments(DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG, { fillOnlyMissing: true });
    return;
  }
  const legacySettingsResult = await query(
    `
      SELECT value
      FROM app_settings
      WHERE key = 'sacrament_form_schemas_v1'
      LIMIT 1
    `,
  );
  const sourceConfig = legacySettingsResult.rows[0]?.value || DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG;
  await persistSacramentFormSchemaConfigToSacraments(sourceConfig, { fillOnlyMissing: true });
};

const migrateMarriageFormSchemaFields = (fields) => {
  const nextFields = Array.isArray(fields) ? fields.map((field) => ({ ...(field || {}) })) : [];
  const keyOf = (field) => String(field?.key || "").trim();
  const existingBrideAddress = nextFields.find((field) => keyOf(field) === "brideAddress");
  const existingGroomAddress = nextFields.find((field) => keyOf(field) === "groomAddress");
  const withoutAddresses = nextFields.filter((field) => {
    const key = keyOf(field);
    return key !== "address" && key !== "brideAddress" && key !== "groomAddress";
  });
  const groomPhoneIndex = withoutAddresses.findIndex((field) => keyOf(field) === "groomPhoneNumber");
  const bridePhoneIndex = withoutAddresses.findIndex((field) => keyOf(field) === "bridePhoneNumber");
  const insertAt =
    groomPhoneIndex > -1 || bridePhoneIndex > -1
      ? Math.max(groomPhoneIndex, bridePhoneIndex) + 1
      : withoutAddresses.length;

  withoutAddresses.splice(
    insertAt,
    0,
    {
      ...MARRIAGE_BRIDE_ADDRESS_FIELD,
      ...(existingBrideAddress || {}),
      ...MARRIAGE_BRIDE_ADDRESS_FIELD,
    },
    {
      ...MARRIAGE_GROOM_ADDRESS_FIELD,
      ...(existingGroomAddress || {}),
      ...MARRIAGE_GROOM_ADDRESS_FIELD,
    },
  );
  return withoutAddresses;
};

const runBaptismGodparentFieldsMigration = async () => {
  const migrationKey = "2026-10-19-baptism-required-godparents";
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(150) PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existingMigrationResult = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1 LIMIT 1`,
    [migrationKey],
  );
  if (existingMigrationResult.rowCount > 0) return;

  await query("BEGIN");
  try {
    const baptismSchemaResult = await query(
      `
        SELECT "sacramentID", "formSchema"
        FROM sacraments
        WHERE LOWER(TRIM("sacramentName")) IN ('baptism', 'christening')
      `,
    );

    let updatedSchemaCount = 0;
    for (const row of baptismSchemaResult.rows) {
      const sourceFields = Array.isArray(row.formSchema) && row.formSchema.length > 0
        ? row.formSchema
        : DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG.sacraments.baptism.fields;
      const nextFields = sourceFields.map((field) => ({ ...(field || {}) }));
      for (const requiredField of BAPTISM_GODPARENT_FIELDS) {
        const existingIndex = nextFields.findIndex(
          (field) => String(field?.key || "").trim() === requiredField.key,
        );
        if (existingIndex < 0) {
          nextFields.push({ ...requiredField });
          continue;
        }
        nextFields[existingIndex] = {
          ...requiredField,
          ...nextFields[existingIndex],
          type: "list",
          required: true,
          minEntries: 2,
        };
      }
      if (JSON.stringify(nextFields) === JSON.stringify(row.formSchema || [])) continue;
      await query(
        `UPDATE sacraments SET "formSchema" = $1::jsonb WHERE "sacramentID" = $2`,
        [JSON.stringify(nextFields), row.sacramentID],
      );
      updatedSchemaCount += 1;
    }

    await query(
      `INSERT INTO app_migrations (migration_key, metadata) VALUES ($1, $2::jsonb)`,
      [migrationKey, JSON.stringify({ updatedSchemaCount })],
    );
    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

const runMarriageSeparateAddressesMigration = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(150) PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existingMigrationResult = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1 LIMIT 1`,
    [MARRIAGE_SEPARATE_ADDRESSES_MIGRATION_KEY],
  );
  if (existingMigrationResult.rowCount > 0) {
    return;
  }

  await query("BEGIN");
  try {
    const marriageSchemaResult = await query(
      `
        SELECT "sacramentID", "formSchema"
        FROM sacraments
        WHERE LOWER(TRIM("sacramentName")) LIKE '%marriage%'
      `,
    );

    let updatedSchemaCount = 0;
    for (const row of marriageSchemaResult.rows) {
      const nextFields = migrateMarriageFormSchemaFields(row.formSchema);
      if (JSON.stringify(nextFields) === JSON.stringify(row.formSchema || [])) continue;
      await query(
        `
          UPDATE sacraments
          SET "formSchema" = $1::jsonb
          WHERE "sacramentID" = $2
        `,
        [JSON.stringify(nextFields), row.sacramentID],
      );
      updatedSchemaCount += 1;
    }

    const credentialsResult = await query(
      `
        UPDATE appointments a
        SET credentials = a.credentials
          || jsonb_strip_nulls(
            jsonb_build_object(
              'brideAddress', CASE
                WHEN BTRIM(COALESCE(a.credentials->>'brideAddress', '')) <> '' THEN a.credentials->>'brideAddress'
                WHEN BTRIM(COALESCE(a.credentials->>'address', '')) <> '' THEN a.credentials->>'address'
                ELSE NULL
              END,
              'groomAddress', CASE
                WHEN BTRIM(COALESCE(a.credentials->>'groomAddress', '')) <> '' THEN a.credentials->>'groomAddress'
                WHEN BTRIM(COALESCE(a.credentials->>'address', '')) <> '' THEN a.credentials->>'address'
                ELSE NULL
              END
            )
          )
        FROM sacraments s
        WHERE a."sacramentID" = s."sacramentID"
          AND LOWER(TRIM(s."sacramentName")) LIKE '%marriage%'
          AND a.credentials IS NOT NULL
          AND jsonb_typeof(a.credentials) = 'object'
          AND (
            (
              BTRIM(COALESCE(a.credentials->>'address', '')) <> ''
              AND BTRIM(COALESCE(a.credentials->>'brideAddress', '')) = ''
            )
            OR (
              BTRIM(COALESCE(a.credentials->>'address', '')) <> ''
              AND BTRIM(COALESCE(a.credentials->>'groomAddress', '')) = ''
            )
          )
      `,
    );

    await query(
      `
        INSERT INTO app_migrations (migration_key, metadata)
        VALUES ($1, $2::jsonb)
      `,
      [
        MARRIAGE_SEPARATE_ADDRESSES_MIGRATION_KEY,
        JSON.stringify({
          updatedSchemaCount,
          updatedAppointmentCount: credentialsResult.rowCount || 0,
        }),
      ],
    );

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

const runMarriageAddressBelowPhoneMigration = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(150) PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existingMigrationResult = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1 LIMIT 1`,
    [MARRIAGE_ADDRESS_BELOW_PHONE_MIGRATION_KEY],
  );
  if (existingMigrationResult.rowCount > 0) {
    return;
  }

  await query("BEGIN");
  try {
    const marriageSchemaResult = await query(
      `
        SELECT "sacramentID", "formSchema"
        FROM sacraments
        WHERE LOWER(TRIM("sacramentName")) LIKE '%marriage%'
      `,
    );

    let updatedSchemaCount = 0;
    for (const row of marriageSchemaResult.rows) {
      const nextFields = migrateMarriageFormSchemaFields(row.formSchema);
      if (JSON.stringify(nextFields) === JSON.stringify(row.formSchema || [])) continue;
      await query(
        `
          UPDATE sacraments
          SET "formSchema" = $1::jsonb
          WHERE "sacramentID" = $2
        `,
        [JSON.stringify(nextFields), row.sacramentID],
      );
      updatedSchemaCount += 1;
    }

    await query(
      `
        INSERT INTO app_migrations (migration_key, metadata)
        VALUES ($1, $2::jsonb)
      `,
      [
        MARRIAGE_ADDRESS_BELOW_PHONE_MIGRATION_KEY,
        JSON.stringify({ updatedSchemaCount }),
      ],
    );

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

const runMarriageAddressPlaceholderMigration = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(150) PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existingMigrationResult = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1 LIMIT 1`,
    [MARRIAGE_ADDRESS_PLACEHOLDER_MIGRATION_KEY],
  );
  if (existingMigrationResult.rowCount > 0) {
    return;
  }

  await query("BEGIN");
  try {
    const marriageSchemaResult = await query(
      `
        SELECT "sacramentID", "formSchema"
        FROM sacraments
        WHERE LOWER(TRIM("sacramentName")) LIKE '%marriage%'
      `,
    );

    let updatedSchemaCount = 0;
    for (const row of marriageSchemaResult.rows) {
      const nextFields = migrateMarriageFormSchemaFields(row.formSchema);
      if (JSON.stringify(nextFields) === JSON.stringify(row.formSchema || [])) continue;
      await query(
        `
          UPDATE sacraments
          SET "formSchema" = $1::jsonb
          WHERE "sacramentID" = $2
        `,
        [JSON.stringify(nextFields), row.sacramentID],
      );
      updatedSchemaCount += 1;
    }

    await query(
      `
        INSERT INTO app_migrations (migration_key, metadata)
        VALUES ($1, $2::jsonb)
      `,
      [MARRIAGE_ADDRESS_PLACEHOLDER_MIGRATION_KEY, JSON.stringify({ updatedSchemaCount })],
    );

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

const runFuneralDeceasedAddressMigration = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(150) PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existingMigrationResult = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1 LIMIT 1`,
    [FUNERAL_DECEASED_ADDRESS_MIGRATION_KEY],
  );
  if (existingMigrationResult.rowCount > 0) {
    return;
  }

  await query("BEGIN");
  try {
    const funeralSchemaResult = await query(
      `
        SELECT "sacramentID", "formSchema", "schemaAliases"
        FROM sacraments
        WHERE LOWER(TRIM("sacramentName")) LIKE '%funeral%'
           OR LOWER(TRIM("sacramentName")) LIKE '%death mass%'
      `,
    );

    let updatedSchemaCount = 0;
    for (const row of funeralSchemaResult.rows) {
      const nextFields = ensureFuneralMassRequiredFieldSchema(row.formSchema, "Funeral Mass");
      const currentAliases = Array.isArray(row.schemaAliases) ? row.schemaAliases : [];
      const nextAliases = Array.from(
        new Set(
          [...currentAliases, "funeral mass", "funeral-mass", "death mass", "death-mass"]
            .map((item) => String(item || "").trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      const schemaChanged = JSON.stringify(nextFields) !== JSON.stringify(row.formSchema || []);
      const aliasesChanged = JSON.stringify(nextAliases) !== JSON.stringify(currentAliases);
      if (!schemaChanged && !aliasesChanged) continue;
      await query(
        `
          UPDATE sacraments
          SET "formSchema" = $1::jsonb,
              "schemaAliases" = $2::jsonb
          WHERE "sacramentID" = $3
        `,
        [JSON.stringify(nextFields), JSON.stringify(nextAliases), row.sacramentID],
      );
      updatedSchemaCount += 1;
    }

    const credentialsResult = await query(
      `
        UPDATE appointments a
        SET credentials = a.credentials
          || jsonb_strip_nulls(
            jsonb_build_object(
              'deceasedAddress', CASE
                WHEN BTRIM(COALESCE(a.credentials->>'deceasedAddress', '')) <> '' THEN a.credentials->>'deceasedAddress'
                WHEN BTRIM(COALESCE(a.credentials->>'address', '')) <> '' THEN a.credentials->>'address'
                ELSE NULL
              END
            )
          )
        FROM sacraments s
        WHERE a."sacramentID" = s."sacramentID"
          AND (
            LOWER(TRIM(s."sacramentName")) LIKE '%funeral%'
            OR LOWER(TRIM(s."sacramentName")) LIKE '%death mass%'
          )
          AND a.credentials IS NOT NULL
          AND jsonb_typeof(a.credentials) = 'object'
          AND BTRIM(COALESCE(a.credentials->>'address', '')) <> ''
          AND BTRIM(COALESCE(a.credentials->>'deceasedAddress', '')) = ''
      `,
    );

    await query(
      `
        INSERT INTO app_migrations (migration_key, metadata)
        VALUES ($1, $2::jsonb)
      `,
      [
        FUNERAL_DECEASED_ADDRESS_MIGRATION_KEY,
        JSON.stringify({
          updatedSchemaCount,
          updatedAppointmentCount: credentialsResult.rowCount || 0,
        }),
      ],
    );

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

const runFuneralAddressBelowFamilyMigration = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(150) PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existingMigrationResult = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1 LIMIT 1`,
    [FUNERAL_ADDRESS_BELOW_FAMILY_MIGRATION_KEY],
  );
  if (existingMigrationResult.rowCount > 0) {
    return;
  }

  await query("BEGIN");
  try {
    const funeralSchemaResult = await query(
      `
        SELECT "sacramentID", "formSchema"
        FROM sacraments
        WHERE LOWER(TRIM("sacramentName")) LIKE '%funeral%'
           OR LOWER(TRIM("sacramentName")) LIKE '%death mass%'
      `,
    );

    let updatedSchemaCount = 0;
    for (const row of funeralSchemaResult.rows) {
      const nextFields = ensureFuneralMassRequiredFieldSchema(row.formSchema, "Funeral Mass");
      if (JSON.stringify(nextFields) === JSON.stringify(row.formSchema || [])) continue;
      await query(
        `
          UPDATE sacraments
          SET "formSchema" = $1::jsonb
          WHERE "sacramentID" = $2
        `,
        [JSON.stringify(nextFields), row.sacramentID],
      );
      updatedSchemaCount += 1;
    }

    await query(
      `
        INSERT INTO app_migrations (migration_key, metadata)
        VALUES ($1, $2::jsonb)
      `,
      [FUNERAL_ADDRESS_BELOW_FAMILY_MIGRATION_KEY, JSON.stringify({ updatedSchemaCount })],
    );

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

const toIsoDate = (dateValue) => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const runProgressTemplateSeedCleanupMigration = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(150) PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existingMigrationResult = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1 LIMIT 1`,
    [PROGRESS_TEMPLATE_SEED_CLEANUP_MIGRATION_KEY],
  );
  if (existingMigrationResult.rowCount > 0) {
    return;
  }

  await query("BEGIN");
  try {
    const specialTemplateName = "special sacramental program Default Template";
    const cleanupResult = await query(
      `
        WITH seeded_templates AS (
          SELECT t."templateID"
          FROM progress_templates t
          LEFT JOIN sacraments s ON s."sacramentID" = t."sacramentID"
          WHERE
            (
              t.scope = 'sacrament'
              AND s."sacramentName" = ANY($1::text[])
              AND t."templateName" = CONCAT(s."sacramentName", ' Default Template')
            )
            OR (
              t.scope = 'special_sacrament'
              AND t."templateName" = $2
            )
        ),
        deleted_steps AS (
          DELETE FROM progress_template_steps pts
          USING seeded_templates st
          WHERE pts."templateID" = st."templateID"
          RETURNING pts."stepID"
        ),
        deleted_templates AS (
          DELETE FROM progress_templates t
          USING seeded_templates st
          WHERE t."templateID" = st."templateID"
          RETURNING t."templateID"
        )
        SELECT
          (SELECT COUNT(*)::INT FROM deleted_steps) AS "deletedSteps",
          (SELECT COUNT(*)::INT FROM deleted_templates) AS "deletedTemplates"
      `,
      [sacramentSeeds, specialTemplateName],
    );

    await query(
      `
        INSERT INTO app_migrations (migration_key, metadata)
        VALUES ($1, $2::jsonb)
      `,
      [
        PROGRESS_TEMPLATE_SEED_CLEANUP_MIGRATION_KEY,
        JSON.stringify({
          deletedSteps: cleanupResult.rows[0]?.deletedSteps || 0,
          deletedTemplates: cleanupResult.rows[0]?.deletedTemplates || 0,
        }),
      ],
    );

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

const runParishActivitiesSchemaMigration = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(150) PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('parish_activities.createdAt'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'parish_activities'
          AND column_name = 'created_at'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'parish_activities'
          AND column_name = 'createdAt'
      ) THEN
        ALTER TABLE parish_activities RENAME COLUMN created_at TO "createdAt";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('parish_activities.createdAt'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('parish_activities.createdAt'));
        RAISE;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('parish_activities.updatedAt'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'parish_activities'
          AND column_name = 'updated_at'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'parish_activities'
          AND column_name = 'updatedAt'
      ) THEN
        ALTER TABLE parish_activities RENAME COLUMN updated_at TO "updatedAt";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('parish_activities.updatedAt'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('parish_activities.updatedAt'));
        RAISE;
    END
    $$;
  `);

  const existingMigrationResult = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1 LIMIT 1`,
    [PARISH_ACTIVITIES_SCHEMA_MIGRATION_KEY],
  );
  if (existingMigrationResult.rowCount > 0) {
    return;
  }

  const tableExistsResult = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'parish_activities'
    ) AS exists
  `);
  if (!tableExistsResult.rows[0]?.exists) {
    await query(`
      CREATE TABLE parish_activities (
        "parishActID" SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        "publishedDate" DATE NOT NULL DEFAULT CURRENT_DATE,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        "adminID" INT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_parish_activities_admin_date
      ON parish_activities ("adminID", "publishedDate" DESC, "parishActID" DESC)
    `);
    await query(
      `
        INSERT INTO app_migrations (migration_key, metadata)
        VALUES ($1, '{}'::jsonb)
      `,
      [PARISH_ACTIVITIES_SCHEMA_MIGRATION_KEY],
    );
    return;
  }

  const columnsResult = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parish_activities'
  `);
  const columnNames = new Set(columnsResult.rows.map((row) => String(row.column_name || "")));

  await query("BEGIN");
  try {
    if (!columnNames.has("parishActID") && columnNames.has("id")) {
      await query(`ALTER TABLE parish_activities RENAME COLUMN id TO "parishActID"`);
    }

    await query(`ALTER TABLE parish_activities ADD COLUMN IF NOT EXISTS "publishedDate" DATE`);
    await query(`ALTER TABLE parish_activities ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb`);
    await query(`ALTER TABLE parish_activities ADD COLUMN IF NOT EXISTS "adminID" INT`);

    if (columnNames.has("activity_date") || columnNames.has("summary")) {
      await query(`
        UPDATE parish_activities
        SET
          "publishedDate" = COALESCE("publishedDate", activity_date, CURRENT_DATE),
          payload = CASE
            WHEN payload IS NULL OR payload = '{}'::jsonb THEN
              jsonb_build_object(
                'summary', COALESCE(summary, ''),
                'details', COALESCE(details, ''),
                'imageUrl', COALESCE(image_url, ''),
                'slides', COALESCE(slides_json, '[]'::jsonb)
              )
            ELSE payload
          END
      `);
    } else {
      await query(`
        UPDATE parish_activities
        SET
          "publishedDate" = COALESCE("publishedDate", CURRENT_DATE),
          payload = COALESCE(payload, '{}'::jsonb)
        WHERE "publishedDate" IS NULL OR payload IS NULL
      `);
    }

    await query(`UPDATE parish_activities SET "adminID" = 1 WHERE "adminID" IS NULL`);
    await query(`ALTER TABLE parish_activities ALTER COLUMN "adminID" SET NOT NULL`);

    await query(`ALTER TABLE parish_activities ALTER COLUMN "publishedDate" SET DEFAULT CURRENT_DATE`);
    await query(`UPDATE parish_activities SET "publishedDate" = CURRENT_DATE WHERE "publishedDate" IS NULL`);
    await query(`ALTER TABLE parish_activities ALTER COLUMN "publishedDate" SET NOT NULL`);

    await query(`ALTER TABLE parish_activities ALTER COLUMN payload SET DEFAULT '{}'::jsonb`);
    await query(`UPDATE parish_activities SET payload = '{}'::jsonb WHERE payload IS NULL`);
    await query(`ALTER TABLE parish_activities ALTER COLUMN payload SET NOT NULL`);

    if (columnNames.has("activity_date")) {
      await query(`ALTER TABLE parish_activities DROP COLUMN activity_date`);
    }
    if (columnNames.has("summary")) {
      await query(`ALTER TABLE parish_activities DROP COLUMN summary`);
    }
    if (columnNames.has("details")) {
      await query(`ALTER TABLE parish_activities DROP COLUMN details`);
    }
    if (columnNames.has("image_url")) {
      await query(`ALTER TABLE parish_activities DROP COLUMN image_url`);
    }
    if (columnNames.has("slides_json")) {
      await query(`ALTER TABLE parish_activities DROP COLUMN slides_json`);
    }

    await query(`DROP INDEX IF EXISTS idx_parish_activities_admin_date`);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_parish_activities_admin_date
      ON parish_activities ("adminID", "publishedDate" DESC, "parishActID" DESC)
    `);

    await query(
      `
        INSERT INTO app_migrations (migration_key, metadata)
        VALUES ($1, '{}'::jsonb)
      `,
      [PARISH_ACTIVITIES_SCHEMA_MIGRATION_KEY],
    );
    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

const migrateLegacyParishActivityMediaFile = async (mediaPath) => {
  const resolvedPath = resolveParishActivityMediaPath(mediaPath);
  if (!resolvedPath) return "";
  const fileName = getParishActivityMediaFileName(resolvedPath);
  if (!fileName) return resolvedPath;

  return `${parishActivityPublicBasePath}${fileName}`;
};

const runParishActivitiesMediaFilePathMigration = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(150) PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existingMigrationResult = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1 LIMIT 1`,
    [PARISH_ACTIVITIES_MEDIA_FILEPATH_MIGRATION_KEY],
  );
  if (existingMigrationResult.rowCount > 0) {
    return;
  }

  const tableExistsResult = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'parish_activities'
    ) AS exists
  `);
  if (!tableExistsResult.rows[0]?.exists) {
    await query(
      `
        INSERT INTO app_migrations (migration_key, metadata)
        VALUES ($1, '{}'::jsonb)
      `,
      [PARISH_ACTIVITIES_MEDIA_FILEPATH_MIGRATION_KEY],
    );
    return;
  }

  const rowsResult = await query(`
    SELECT "parishActID", payload
    FROM parish_activities
  `);

  for (const row of rowsResult.rows) {
    const payload = parseParishActivityPayload(row?.payload);
    const legacyImagePath = resolveParishActivityMediaPath(payload.imageUrl ?? payload.image_url ?? "");
    const migratedMedia = [];
    for (const item of Array.isArray(payload.media) ? payload.media : []) {
      const migratedPath = await migrateLegacyParishActivityMediaFile(
        item?.filePath ?? item?.url ?? item?.imageUrl ?? "",
      );
      if (!migratedPath) continue;
      migratedMedia.push({
        type: String(item?.type || "").trim().toLowerCase() === "video" ? "video" : "image",
        filePath: migratedPath,
        url: migratedPath,
        fileName: String(item?.fileName || "").trim(),
      });
    }

    const nextPayload = buildParishActivityPayload({
      summary: payload.summary,
      details: payload.details,
      imageUrl: legacyImagePath,
      media: migratedMedia,
      slides: payload.slides,
      expiresOn: payload.expiresOn,
    });

    await query(
      `
        UPDATE parish_activities
        SET payload = $2::jsonb
        WHERE "parishActID" = $1
      `,
      [row.parishActID, JSON.stringify(nextPayload)],
    );
  }

  await query(
    `
      INSERT INTO app_migrations (migration_key, metadata)
      VALUES ($1, '{}'::jsonb)
    `,
    [PARISH_ACTIVITIES_MEDIA_FILEPATH_MIGRATION_KEY],
  );
};

const getAdminReligiousOrderOptions = async (adminID) => {
  const result = await query(
    `
      SELECT "religiousOrderOptions"
      FROM admin_directory
      WHERE "adminID" = $1
      LIMIT 1
    `,
    [adminID],
  );
  const rawOptions = result.rows[0]?.religiousOrderOptions;
  return normalizeReligiousOrderOptionsFromDatabase(rawOptions);
};

const isReligiousOrderCodeAllowedForAdmin = async (adminID, religiousOrderCode) => {
  if (!religiousOrderCode) return false;
  const options = await getAdminReligiousOrderOptions(adminID);
  return options.some((option) => option.active !== false && option.code === religiousOrderCode);
};

const initializeDatabase = async () => {
  await query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await fs.mkdir(userPhotoUploadsDirectory, { recursive: true });
  await fs.mkdir(priestPhotoUploadsDirectory, { recursive: true });
  await fs.mkdir(parishActivityUploadsDirectory, { recursive: true });
  await fs.mkdir(marriageBirthCertDirectory, { recursive: true });
  await fs.mkdir(appointmentIncomingDirectory, { recursive: true });
  await fs.mkdir(progressPaymentUploadsDirectory, { recursive: true });

  const usersExistsResult = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS "exists"
  `);
  const usersExists = usersExistsResult.rows[0].exists;

  if (usersExists) {
    const userIdColumnResult = await query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'userID'
      ) AS "exists"
    `);

    if (!userIdColumnResult.rows[0].exists) {
      await query("ALTER TABLE users RENAME TO users_legacy");
    }
  }

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      "userID" SERIAL PRIMARY KEY,
      "firstName" VARCHAR(120),
      "lastName" VARCHAR(120),
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
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "firstName" VARCHAR(120)');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastName" VARCHAR(120)');
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'fullName'
      ) THEN
        UPDATE users
        SET
          "firstName" = COALESCE(
            NULLIF(BTRIM("firstName"), ''),
            NULLIF(split_part(BTRIM(COALESCE("fullName", '')), ' ', 1), '')
          ),
          "lastName" = COALESCE(
            NULLIF(BTRIM("lastName"), ''),
            NULLIF(BTRIM(regexp_replace(BTRIM(COALESCE("fullName", '')), '^\\S+[[:space:]]*', '')), '')
          )
        WHERE NULLIF(BTRIM(COALESCE("firstName", '')), '') IS NULL
          AND NULLIF(BTRIM(COALESCE("fullName", '')), '') IS NOT NULL;
        ALTER TABLE users DROP COLUMN "fullName";
      END IF;
    END
    $$;
  `);
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "contactNumber" VARCHAR(40)');
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS photo TEXT");
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
  await query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
  try {
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique_lower
      ON users (LOWER(email))
      WHERE email IS NOT NULL AND LENGTH(TRIM(email)) > 0
    `);
  } catch (error) {
    console.warn("Unable to create unique users email index:", error.message);
  }
  try {
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_contact_number_unique
      ON users (regexp_replace(TRIM("contactNumber"), '[^0-9]', '', 'g'))
      WHERE LENGTH(TRIM(COALESCE("contactNumber", ''))) > 0
    `);
  } catch (error) {
    console.warn("Unable to create unique users contact-number index:", error.message);
  }
  await query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      "userNotifID" BIGSERIAL PRIMARY KEY,
      "userID" INT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "readAt" TIMESTAMPTZ,
      CONSTRAINT fk_user_notifications_user
        FOREIGN KEY ("userID") REFERENCES users("userID")
        ON DELETE CASCADE
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('user_notifications.userNotifID'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_notifications'
          AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_notifications'
          AND column_name = 'userNotifID'
      ) THEN
        ALTER TABLE user_notifications RENAME COLUMN id TO "userNotifID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('user_notifications.userNotifID'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('user_notifications.userNotifID'));
        RAISE;
    END
    $$;
  `);
  await query(
    'CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created_at ON user_notifications ("userID", "createdAt" DESC)',
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_user_notifications_user_is_read ON user_notifications ("userID", "isRead")',
  );
  await ensurePasswordResetRequestsTable();

  const legacyUsersExistsResult = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users_legacy'
    ) AS "exists"
  `);

  if (legacyUsersExistsResult.rows[0].exists) {
    const usersCountResult = await query('SELECT COUNT(*)::INT AS "count" FROM users');
    if (usersCountResult.rows[0].count === 0) {
      await query(`
        INSERT INTO users ("firstName", "lastName", address, email, password, "createdAt", "updatedAt")
        SELECT
          NULLIF(split_part(BTRIM(COALESCE(full_name, username, '')), ' ', 1), ''),
          NULLIF(BTRIM(regexp_replace(BTRIM(COALESCE(full_name, username, '')), '^\\S+[[:space:]]*', '')), ''),
          address,
          username,
          password_hash,
          created_at,
          created_at
        FROM users_legacy
        ON CONFLICT (email) DO NOTHING
      `);
    }
    await query("DROP TABLE IF EXISTS users_legacy CASCADE");
  }

  // Admin identity/auth is now isolated in admin-server.js + faithflow_admin DB.

  await query("DROP TABLE IF EXISTS announcements CASCADE");

  await query("DROP TABLE IF EXISTS activities CASCADE");

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
        CREATE TYPE appointment_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
      END IF;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_request_type') THEN
        CREATE TYPE appointment_request_type AS ENUM ('Appointment', 'Certificate', 'Special Sacrament Program');
      END IF;
    END
    $$;
  `);
  await query(`
    ALTER TYPE appointment_request_type ADD VALUE IF NOT EXISTS 'Special Sacrament Program';
  `);
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

  const appointmentsExistsResult = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'appointments'
    ) AS "exists"
  `);
  const appointmentsExists = appointmentsExistsResult.rows[0].exists;

  if (appointmentsExists) {
    const appointmentIdColumnResult = await query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'appointmentID'
      ) AS "exists"
    `);

    if (!appointmentIdColumnResult.rows[0].exists) {
      await query("ALTER TABLE appointments RENAME TO appointments_legacy");
    }
  }

  await query(`
    CREATE TABLE IF NOT EXISTS appointments (
      "appointmentID" SERIAL PRIMARY KEY,
      "userID" INT,
      "sacramentID" INT,
      "s_sacramentID" INT,
      "progressID" INT,
      status appointment_status DEFAULT 'PENDING',
      "priestID" INT,
      "requesterFullName" VARCHAR(255),
      credentials JSONB,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" TIMESTAMP,
      note TEXT,
      "isArchived" BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await query("DROP TABLE IF EXISTS appointments_legacy CASCADE");
  await query('ALTER TABLE appointments ALTER COLUMN "userID" DROP NOT NULL');
  await query('ALTER TABLE appointments ALTER COLUMN "progressID" DROP NOT NULL');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "requesterFullName" VARCHAR(255)');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS credentials JSONB');
  await query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS note TEXT");
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'appointments'
          AND column_name = 'is_archived'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'appointments'
          AND column_name = 'isArchived'
      ) THEN
        ALTER TABLE appointments RENAME COLUMN is_archived TO "isArchived";
      END IF;
    END
    $$;
  `);
  await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE appointments DROP COLUMN IF EXISTS "cancelledFrom"`);
  await query(`
    CREATE TABLE IF NOT EXISTS appointment_review_states (
      "appointmentID" INT NOT NULL,
      "adminID" INT NOT NULL,
      "viewedAt" TIMESTAMPTZ,
      "underReviewAt" TIMESTAMPTZ,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("appointmentID", "adminID"),
      CONSTRAINT fk_appointment_review_states_appointment
        FOREIGN KEY ("appointmentID") REFERENCES appointments("appointmentID")
        ON DELETE CASCADE
    )
  `);
  await query('ALTER TABLE appointment_review_states DROP CONSTRAINT IF EXISTS fk_appointment_review_states_admin');
  await query(`
    UPDATE appointments a
    SET "requesterFullName" = ${sqlPersonFullName("u")}
    FROM users u
    WHERE a."requesterFullName" IS NULL
      AND a."userID" = u."userID"
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_appointments_status_finished
    ON appointments (status, "finishedAt")
    WHERE "isArchived" = FALSE
  `);
  await query('ALTER TABLE appointments DROP CONSTRAINT IF EXISTS fk_admin');
  await query('DROP INDEX IF EXISTS idx_appointments_admin_status_finished');
  await query('ALTER TABLE appointments DROP COLUMN IF EXISTS "adminID"');
  await query("DROP TABLE IF EXISTS admin_notifications CASCADE");
  await query(`
    CREATE TABLE IF NOT EXISTS admin_directory (
      "adminID" INT PRIMARY KEY,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "religiousOrderOptions" JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `);
  await query(`ALTER TABLE admin_directory ADD COLUMN IF NOT EXISTS "religiousOrderOptions" JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await query(
    `
      UPDATE admin_directory
      SET "religiousOrderOptions" = $1::jsonb
      WHERE "religiousOrderOptions" IS NULL OR "religiousOrderOptions" = '[]'::jsonb
    `,
    [JSON.stringify(DEFAULT_RELIGIOUS_ORDER_OPTIONS)],
  );
  await query(`
    INSERT INTO admin_directory ("adminID")
    VALUES (1)
    ON CONFLICT ("adminID") DO NOTHING
  `);
  await query(
    `ALTER TABLE admin_directory ALTER COLUMN "religiousOrderOptions" SET DEFAULT '[{"code":"SJ","label":"Jesuits","active":true},{"code":"OP","label":"Dominicans","active":true},{"code":"OFM","label":"Franciscans (OFM)","active":true},{"code":"SDB","label":"Salesians of Don Bosco","active":true},{"code":"SSJV","label":"SSJV","active":true}]'::jsonb`,
  );
  await query(
    `
      UPDATE admin_directory
      SET "religiousOrderOptions" = $1::jsonb
      WHERE "religiousOrderOptions" IS NULL OR "religiousOrderOptions" = '[]'::jsonb
    `,
    [JSON.stringify(DEFAULT_RELIGIOUS_ORDER_OPTIONS)],
  );

  await query(`
    CREATE TABLE IF NOT EXISTS cert_request (
      "certID" SERIAL PRIMARY KEY,
      "userID" INT,
      "certificateTypeID" INT,
      status certificate_request_status NOT NULL DEFAULT 'Pending',
      credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
      "pickupDate" DATE,
      "pickupTime" TIME,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "userID" INT`);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "certificateTypeID" INT`);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS credentials JSONB`);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "pickupDate" DATE`);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "pickupTime" TIME`);
  await query(`ALTER TABLE cert_request DROP COLUMN IF EXISTS "pickupEndTime"`);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP`);
  await query(`ALTER TABLE cert_request DROP COLUMN IF EXISTS "paymentStatus"`);
  await query(`
    UPDATE cert_request
    SET "claimedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
    WHERE status = 'Completed'::certificate_request_status
      AND "claimedAt" IS NULL
  `);
  await query(`ALTER TABLE cert_request ALTER COLUMN "pickupDate" DROP NOT NULL`);
  await query(`ALTER TABLE cert_request ALTER COLUMN "pickupTime" DROP NOT NULL`);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP`);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await query(`
    DO $$
    DECLARE status_udt_name TEXT;
    BEGIN
      SELECT c.udt_name
      INTO status_udt_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cert_request'
        AND c.column_name = 'status'
      LIMIT 1;

      IF status_udt_name IS NULL THEN
        ALTER TABLE cert_request
          ADD COLUMN status certificate_request_status NOT NULL DEFAULT 'Pending'::certificate_request_status;
      ELSIF status_udt_name <> 'certificate_request_status' THEN
        ALTER TABLE cert_request
          ALTER COLUMN status DROP DEFAULT;
        ALTER TABLE cert_request
          ALTER COLUMN status TYPE certificate_request_status
          USING (
            CASE
              WHEN LOWER(TRIM(COALESCE(status::text, ''))) = 'pending' THEN 'Pending'
              WHEN LOWER(TRIM(COALESCE(status::text, ''))) IN ('ongoing', 'approved') THEN 'Approved'
              WHEN LOWER(TRIM(COALESCE(status::text, ''))) IN ('completed', 'declined') THEN 'Completed'
              WHEN LOWER(TRIM(COALESCE(status::text, ''))) IN ('cancelled', 'canceled') THEN 'Cancelled'
              ELSE 'Pending'
            END
          )::certificate_request_status;
      END IF;
    END
    $$;
  `);
  await query(`
    UPDATE cert_request
    SET status = CASE
      WHEN LOWER(TRIM(COALESCE(status::text, ''))) = 'pending' THEN 'Pending'::certificate_request_status
      WHEN LOWER(TRIM(COALESCE(status::text, ''))) IN ('ongoing', 'approved') THEN 'Approved'::certificate_request_status
      WHEN LOWER(TRIM(COALESCE(status::text, ''))) IN ('completed', 'declined') THEN 'Completed'::certificate_request_status
      WHEN LOWER(TRIM(COALESCE(status::text, ''))) IN ('cancelled', 'canceled') THEN 'Cancelled'::certificate_request_status
      ELSE 'Pending'::certificate_request_status
    END
  `);
  await query(`ALTER TABLE cert_request ALTER COLUMN status SET DEFAULT 'Pending'::certificate_request_status`);
  await query(`UPDATE cert_request SET status = 'Pending'::certificate_request_status WHERE status IS NULL`);
  await query(`ALTER TABLE cert_request ALTER COLUMN status SET NOT NULL`);
  await query('DROP TABLE IF EXISTS approved_cert CASCADE');
  await query('DROP TABLE IF EXISTS declined_cert CASCADE');
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cert_request'
          AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cert_request'
          AND column_name = 'certID'
      ) THEN
        ALTER TABLE cert_request RENAME COLUMN id TO "certID";
      END IF;
    END
    $$;
  `);
  const unusedCertDetailColumnsResult = await query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'marriage_cert' AND column_name = 'certRequestID')
        OR (table_name = 'baptismal_cert' AND column_name = 'certRequestID')
      )
  `);
  const unusedCertDetailColumns = new Set(
    unusedCertDetailColumnsResult.rows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  if (unusedCertDetailColumns.has("marriage_cert.certRequestID")) {
    await query(`
      UPDATE cert_request cr
      SET credentials = jsonb_strip_nulls(
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
      WHERE mc."certRequestID" = cr."certID"
        AND (cr.credentials IS NULL OR cr.credentials = '{}'::jsonb)
    `);
  }
  if (unusedCertDetailColumns.has("baptismal_cert.certRequestID")) {
    await query(`
      UPDATE cert_request cr
      SET credentials = jsonb_strip_nulls(
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
      WHERE bc."certRequestID" = cr."certID"
        AND (cr.credentials IS NULL OR cr.credentials = '{}'::jsonb)
    `);
  }
  await query("DROP TABLE IF EXISTS marriage_cert CASCADE");
  await query("DROP TABLE IF EXISTS baptismal_cert CASCADE");
  await query('ALTER TABLE cert_request DROP COLUMN IF EXISTS full_name');
  await query('ALTER TABLE cert_request DROP COLUMN IF EXISTS contact_number');
  await query('ALTER TABLE cert_request DROP COLUMN IF EXISTS certificate_type');
  await query('ALTER TABLE cert_request DROP COLUMN IF EXISTS purpose');
  await query('ALTER TABLE cert_request DROP COLUMN IF EXISTS request_details');
  await query(`
    SELECT setval(
      pg_get_serial_sequence('cert_request', 'certID'),
      COALESCE((SELECT MAX("certID") FROM cert_request), 1),
      TRUE
    )
  `);
  await query('DROP TABLE IF EXISTS certificate_requests CASCADE');
  await query(`
    UPDATE cert_request cr
    SET "userID" = NULL
    WHERE "userID" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM users u
        WHERE u."userID" = cr."userID"
      )
  `);

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
  await query(`ALTER TABLE certificate_type ADD COLUMN IF NOT EXISTS "fee" NUMERIC(10, 2)`);
  await query(`
    UPDATE certificate_type
    SET "fee" = 100
    WHERE "fee" IS NULL
      AND LOWER(BTRIM(COALESCE("certTypeName", "formSchema"->>'label', ''))) IN (
        'baptismal certificate',
        'confirmation certificate'
      )
  `);
  await query(`
    UPDATE certificate_type
    SET
      "formSchema" = jsonb_set(
        "formSchema",
        '{label}',
        to_jsonb(TRIM(COALESCE("formSchema"->>'label', '')) || ' Certificate'),
        true
      ),
      "updatedAt" = NOW()
    WHERE NULLIF(BTRIM(COALESCE("formSchema"->>'label', '')), '') IS NOT NULL
      AND LOWER("formSchema"->>'label') NOT LIKE '%certificate%'
  `);
  await query(`
    UPDATE certificate_type
    SET "certTypeName" = NULLIF(BTRIM(COALESCE("formSchema"->>'label', '')), '')
    WHERE NULLIF(BTRIM(COALESCE("certTypeName", '')), '') IS NULL
  `);
  await query(`UPDATE cert_request SET credentials = '{}'::jsonb WHERE credentials IS NULL`);
  await query(`ALTER TABLE cert_request ALTER COLUMN credentials SET DEFAULT '{}'::jsonb`);
  await query(`ALTER TABLE cert_request ALTER COLUMN credentials SET NOT NULL`);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cert_request'
          AND column_name = 'created_at'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cert_request'
          AND column_name = 'createdAt'
      ) THEN
        ALTER TABLE cert_request RENAME COLUMN created_at TO "createdAt";
      END IF;
    END
    $$;
  `);
  await query(`UPDATE cert_request SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL`);
  await query(`ALTER TABLE cert_request ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
  await query(`ALTER TABLE cert_request ALTER COLUMN "createdAt" SET NOT NULL`);
  await query(`ALTER TABLE cert_request ADD COLUMN IF NOT EXISTS "requestSource" VARCHAR(20) NOT NULL DEFAULT 'online'`);
  await query(`
    UPDATE cert_request
    SET "requestSource" = 'online'
    WHERE "requestSource" IS NULL OR BTRIM("requestSource") = ''
  `);
  await query(`
    UPDATE cert_request
    SET "requestSource" = 'online'
    WHERE LOWER(BTRIM("requestSource")) NOT IN ('online', 'onsite')
  `);
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
  await query(`ALTER TABLE cert_request DROP COLUMN IF EXISTS created_at`);
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

  await query(`
    CREATE TABLE IF NOT EXISTS sacraments (
      "sacramentID" SERIAL PRIMARY KEY,
      "sacramentName" VARCHAR(100) NOT NULL UNIQUE
    )
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
  await query(`ALTER TABLE sacraments ADD COLUMN IF NOT EXISTS "formSchema" JSONB`);
  await query(`ALTER TABLE sacraments ADD COLUMN IF NOT EXISTS requirements JSONB`);
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
  await query(`ALTER TABLE sacraments ADD COLUMN IF NOT EXISTS "schemaAliases" JSONB`);
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
  await query(`ALTER TABLE sacraments ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`UPDATE sacraments SET "isArchived" = FALSE WHERE "isArchived" IS NULL`);
  await query(`ALTER TABLE sacraments DROP CONSTRAINT IF EXISTS chk_sacraments_min_advance_days`);
  await query(`ALTER TABLE sacraments DROP COLUMN IF EXISTS "minAdvanceDays"`);
  await query(`ALTER TABLE sacraments ADD COLUMN IF NOT EXISTS "residentFee" NUMERIC(10, 2)`);
  await query(`ALTER TABLE sacraments ADD COLUMN IF NOT EXISTS "nonResidentFee" NUMERIC(10, 2)`);
  await query(`
    UPDATE sacraments AS s
    SET "residentFee" = defaults.resident_fee,
        "nonResidentFee" = defaults.non_resident_fee
    FROM (
      VALUES
        ('marriage', 5000::NUMERIC, 5000::NUMERIC),
        ('baptism', 3000::NUMERIC, 5000::NUMERIC),
        ('funeral mass', 3000::NUMERIC, 3000::NUMERIC)
    ) AS defaults(sacrament_name, resident_fee, non_resident_fee)
    WHERE LOWER(BTRIM(s."sacramentName")) = defaults.sacrament_name
      AND s."residentFee" IS NULL
      AND s."nonResidentFee" IS NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS special_sacraments (
      "s_sacramentID" SERIAL PRIMARY KEY,
      "s_sacramentName" VARCHAR(100) NOT NULL,
      "maxSlots" INT,
      "timeDate" TIMESTAMP NOT NULL,
      "currentAppliedCount" INT NOT NULL DEFAULT 0,
      "isUnlimitedSlots" BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await query('ALTER TABLE special_sacraments ALTER COLUMN "maxSlots" DROP NOT NULL');
  await query('ALTER TABLE special_sacraments ADD COLUMN IF NOT EXISTS "currentAppliedCount" INT NOT NULL DEFAULT 0');
  await query('ALTER TABLE special_sacraments ADD COLUMN IF NOT EXISTS "isUnlimitedSlots" BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE special_sacraments ADD COLUMN IF NOT EXISTS "deadline" DATE');
  await query('UPDATE special_sacraments SET "currentAppliedCount" = 0 WHERE "currentAppliedCount" IS NULL');
  await query(`
    UPDATE special_sacraments
    SET "isUnlimitedSlots" = TRUE,
        "maxSlots" = NULL
    WHERE COALESCE("maxSlots", 0) <= 0
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS special_sacraments_form_schemas (
      "schemaID" SERIAL PRIMARY KEY,
      "specialSacramentName" VARCHAR(120) NOT NULL UNIQUE,
      "formSchema" JSONB NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    DO $$
    BEGIN
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
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('special_sacraments_form_schemas.formSchema'));
        RAISE;
    END
    $$;
  `);
  const legacySpecialSchemaTableResult = await query(
    `SELECT to_regclass('public.special_sacrament_form_schemas') AS "tableName"`,
  );
  if (legacySpecialSchemaTableResult.rows[0]?.tableName) {
    await query(`
      INSERT INTO special_sacraments_form_schemas ("specialSacramentName", "formSchema", "createdAt", "updatedAt")
      SELECT TRIM("specialSacramentName"), form_schema, "createdAt", "updatedAt"
      FROM special_sacrament_form_schemas
      WHERE LENGTH(TRIM("specialSacramentName")) > 0
      ON CONFLICT ("specialSacramentName") DO NOTHING
    `);
    await query("DROP TABLE IF EXISTS special_sacrament_form_schemas CASCADE");
  }
  await query(`
    DELETE FROM special_sacraments_form_schemas base
    USING (
      SELECT "schemaID"
      FROM (
        SELECT "schemaID",
               ROW_NUMBER() OVER (
                 PARTITION BY LOWER(TRIM("specialSacramentName"))
                 ORDER BY "updatedAt" DESC NULLS LAST, "schemaID" DESC
               ) AS row_order
        FROM special_sacraments_form_schemas
      ) ranked
      WHERE ranked.row_order > 1
    ) duplicates
    WHERE base."schemaID" = duplicates."schemaID"
  `);
  await query(`
    UPDATE special_sacraments_form_schemas
    SET "specialSacramentName" = TRIM("specialSacramentName")
    WHERE "specialSacramentName" IS NOT NULL
  `);
  await query(`
    DELETE FROM special_sacraments_form_schemas
    WHERE LENGTH(TRIM("specialSacramentName")) = 0
  `);
  await query(`DROP INDEX IF EXISTS special_sacraments_form_schemas_specialtemplatekey_key`);
  await query(`ALTER TABLE special_sacraments_form_schemas DROP CONSTRAINT IF EXISTS "special_sacraments_form_schemas_specialTemplateKey_key"`);
  await query(`ALTER TABLE special_sacraments_form_schemas DROP COLUMN IF EXISTS "specialTemplateKey"`);
  await query(`ALTER TABLE special_sacraments_form_schemas DROP CONSTRAINT IF EXISTS "special_sacraments_form_schemas_specialSacramentName_key"`);
  await query(`
    ALTER TABLE special_sacraments_form_schemas
    ADD CONSTRAINT "special_sacraments_form_schemas_specialSacramentName_key" UNIQUE ("specialSacramentName")
  `);
  const specialFormSchemaColumnResult = await query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'special_sacraments'
      AND column_name = 'special_form_schema'
    LIMIT 1
  `);
  if (specialFormSchemaColumnResult.rows.length > 0) {
    await query(`
      INSERT INTO special_sacraments_form_schemas ("specialSacramentName", "formSchema")
      SELECT DISTINCT ON (LOWER(TRIM("s_sacramentName")))
             TRIM("s_sacramentName") AS "specialSacramentName",
             special_form_schema
      FROM special_sacraments
      WHERE special_form_schema IS NOT NULL
        AND LENGTH(TRIM("s_sacramentName")) > 0
      ORDER BY LOWER(TRIM("s_sacramentName")) ASC, "timeDate" DESC, "s_sacramentID" DESC
      ON CONFLICT ("specialSacramentName") DO NOTHING
    `);
    await query(`ALTER TABLE special_sacraments DROP COLUMN IF EXISTS special_form_schema`);
  }

  await query(`
    CREATE TABLE IF NOT EXISTS priests (
      "priestID" SERIAL PRIMARY KEY,
      "fullName" VARCHAR(255) NOT NULL,
      "adminID" INT NOT NULL,
      email VARCHAR(255),
      password VARCHAR(255),
      "phoneNumber" VARCHAR(40),
      "clergyType" VARCHAR(20) NOT NULL DEFAULT 'DIOCESAN',
      "religiousOrderCode" VARCHAR(30),
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await query('ALTER TABLE priests ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
  await query('ALTER TABLE priests ADD COLUMN IF NOT EXISTS password VARCHAR(255)');
  await query('ALTER TABLE priests ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(40)');
  await query(`ALTER TABLE priests ADD COLUMN IF NOT EXISTS "clergyType" VARCHAR(20) NOT NULL DEFAULT 'DIOCESAN'`);
  await query(`ALTER TABLE priests ADD COLUMN IF NOT EXISTS "religiousOrderCode" VARCHAR(30)`);
  await query(`ALTER TABLE priests ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE`);
  await query("ALTER TABLE priests ADD COLUMN IF NOT EXISTS photo TEXT");
  await query('ALTER TABLE priests ADD COLUMN IF NOT EXISTS "firstName" VARCHAR(120)');
  await query('ALTER TABLE priests ADD COLUMN IF NOT EXISTS "lastName" VARCHAR(120)');
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'priests'
          AND column_name = 'fullName'
          AND is_generated = 'NEVER'
      ) THEN
        UPDATE priests
        SET
          "firstName" = COALESCE(
            NULLIF(BTRIM("firstName"), ''),
            NULLIF(split_part(BTRIM(COALESCE("fullName", '')), ' ', 1), '')
          ),
          "lastName" = COALESCE(
            NULLIF(BTRIM("lastName"), ''),
            NULLIF(regexp_replace(BTRIM(COALESCE("fullName", '')), '^\\S+\\s*', ''), '')
          );
        DROP VIEW IF EXISTS calendar_entries_resolved;
        ALTER TABLE priests DROP COLUMN "fullName";
      END IF;
    END
    $$;
  `);
  await query('ALTER TABLE priests ADD COLUMN IF NOT EXISTS "fullName" VARCHAR(255)');
  await query(`
    CREATE OR REPLACE FUNCTION sync_priest_full_name()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW."fullName" := BTRIM(CONCAT_WS(' ', NULLIF(BTRIM(NEW."firstName"), ''), NULLIF(BTRIM(NEW."lastName"), '')));
      RETURN NEW;
    END;
    $$;
  `);
  await query('DROP TRIGGER IF EXISTS tr_priests_sync_full_name ON priests');
  await query(`
    CREATE TRIGGER tr_priests_sync_full_name
    BEFORE INSERT OR UPDATE OF "firstName", "lastName" ON priests
    FOR EACH ROW
    EXECUTE FUNCTION sync_priest_full_name()
  `);
  await query(`
    UPDATE priests
    SET "firstName" = "firstName"
    WHERE "fullName" IS DISTINCT FROM BTRIM(CONCAT_WS(' ', NULLIF(BTRIM("firstName"), ''), NULLIF(BTRIM("lastName"), '')))
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_priests_email_unique_lower
    ON priests (LOWER(email))
    WHERE email IS NOT NULL
  `);
  try {
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_priests_phone_unique
      ON priests (regexp_replace(TRIM("phoneNumber"), '[^0-9]', '', 'g'))
      WHERE LENGTH(TRIM(COALESCE("phoneNumber", ''))) > 0
    `);
  } catch (error) {
    console.warn("Unable to create unique priests phone-number index:", error.message);
  }
  await query(`ALTER TABLE priests DROP CONSTRAINT IF EXISTS fk_priests_linked_user`);
  await query('DROP INDEX IF EXISTS idx_priests_linked_user_unique');
  await query('ALTER TABLE priests DROP COLUMN IF EXISTS "linkedUserID"');
  await query('ALTER TABLE special_sacraments ADD COLUMN IF NOT EXISTS "priestID" INT');
  await query(`
    DO $$
    BEGIN
      IF to_regclass('public.calendar_entries') IS NOT NULL THEN
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
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('calendar_entries.calendarID'));
        RAISE;
    END
    $$;
  `);
  await query(`
    UPDATE special_sacraments ss
    SET "priestID" = source."priestID"
    FROM (
      SELECT DISTINCT ON ("s_sacramentID")
        "s_sacramentID",
        "priestID"
      FROM calendar_entries
      WHERE "s_sacramentID" IS NOT NULL
        AND COALESCE("appointmentID", 0) = 0
        AND "priestID" IS NOT NULL
      ORDER BY "s_sacramentID", "calendarID" DESC
    ) source
    WHERE ss."s_sacramentID" = source."s_sacramentID"
      AND ss."priestID" IS NULL
  `);
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
  await query('ALTER TABLE special_sacraments ADD COLUMN IF NOT EXISTS "durationHours" INT NOT NULL DEFAULT 1');
  await query('ALTER TABLE special_sacraments ADD COLUMN IF NOT EXISTS "occupiedSlots" JSONB NOT NULL DEFAULT \'[]\'::jsonb');
  await query(`ALTER TABLE special_sacraments ALTER COLUMN "durationHours" SET DEFAULT 1`);
  await query(`UPDATE special_sacraments SET "durationHours" = 1 WHERE COALESCE("durationHours", 0) NOT BETWEEN 1 AND 8`);
  await query(`ALTER TABLE special_sacraments DROP CONSTRAINT IF EXISTS chk_special_sacraments_duration_hours`);
  await query(`
    ALTER TABLE special_sacraments
    ADD CONSTRAINT chk_special_sacraments_duration_hours
    CHECK ("durationHours" BETWEEN 1 AND 8)
  `);
  await query(`
    UPDATE special_sacraments AS ss
    SET "occupiedSlots" = COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('startTime', slot.start_time, 'endTime', slot.end_time)
        ORDER BY slot.start_time
      )
      FROM (
        VALUES
          ('08:00', '09:00'),
          ('09:00', '10:00'),
          ('10:00', '11:00'),
          ('11:00', '12:00'),
          ('13:00', '14:00'),
          ('14:00', '15:00'),
          ('15:00', '16:00'),
          ('16:00', '17:00')
      ) AS slot(start_time, end_time)
      WHERE ss."timeDate" IS NOT NULL
        AND slot.start_time::time >= ss."timeDate"::time
        AND slot.end_time::time <= (ss."timeDate" + (GREATEST(COALESCE(ss."durationHours", 1), 1) * INTERVAL '1 hour'))::time
    ), '[]'::jsonb)
    WHERE COALESCE(jsonb_array_length(ss."occupiedSlots"), 0) = 0
  `);
  await query(`
    UPDATE special_sacraments
    SET "durationHours" = GREATEST(jsonb_array_length("occupiedSlots"), 1)
    WHERE COALESCE(jsonb_array_length("occupiedSlots"), 0) > 0
  `);
  await query(`
    CREATE OR REPLACE FUNCTION hash_priest_password()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.password IS NULL OR LENGTH(BTRIM(NEW.password)) = 0 THEN
        NEW.password := NULL;
      ELSIF NEW.password !~ '^\\$2[aby]\\$\\d{2}\\$' THEN
        NEW.password := crypt(NEW.password, gen_salt('bf', 10));
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await query('DROP TRIGGER IF EXISTS tr_priests_hash_password ON priests');
  await query(`
    CREATE TRIGGER tr_priests_hash_password
    BEFORE INSERT OR UPDATE OF password ON priests
    FOR EACH ROW
    EXECUTE FUNCTION hash_priest_password()
  `);
  await query(`
    UPDATE priests
    SET password = crypt(password, gen_salt('bf', 10))
    WHERE password IS NOT NULL
      AND LENGTH(BTRIM(password)) > 0
      AND password !~ '^\\$2[aby]\\$\\d{2}\\$'
  `);
  await query(`UPDATE priests SET "clergyType" = 'DIOCESAN' WHERE "clergyType" IS NULL`);
  await query(`UPDATE priests SET "isActive" = TRUE WHERE "isActive" IS NULL`);
  await query(`ALTER TABLE priests DROP CONSTRAINT IF EXISTS chk_priests_clergy_type`);
  await query(`
    ALTER TABLE priests
    ADD CONSTRAINT chk_priests_clergy_type
    CHECK ("clergyType" IN ('DIOCESAN', 'RELIGIOUS'))
  `);
  await query(`ALTER TABLE priests DROP CONSTRAINT IF EXISTS chk_priests_religious_order`);
  await query(`
    ALTER TABLE priests
    ADD CONSTRAINT chk_priests_religious_order
    CHECK (
      ("clergyType" = 'RELIGIOUS' AND "religiousOrderCode" IS NOT NULL AND LENGTH(TRIM("religiousOrderCode")) > 0)
      OR
      ("clergyType" = 'DIOCESAN' AND "religiousOrderCode" IS NULL)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS priest_notifications (
      "priestNotifID" BIGSERIAL PRIMARY KEY,
      "priestID" INT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "readAt" TIMESTAMPTZ,
      CONSTRAINT fk_priest_notifications_priest
        FOREIGN KEY ("priestID") REFERENCES priests("priestID")
        ON DELETE CASCADE
    )
  `);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'priest_notifications'
          AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'priest_notifications'
          AND column_name = 'priestNotifID'
      ) THEN
        ALTER TABLE priest_notifications RENAME COLUMN id TO "priestNotifID";
      END IF;
    END $$;
  `);
  await query(
    'CREATE INDEX IF NOT EXISTS idx_priest_notifications_priest_created_at ON priest_notifications ("priestID", "createdAt" DESC)',
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_priest_notifications_priest_is_read ON priest_notifications ("priestID", "isRead")',
  );
  await query('ALTER TABLE priests DROP CONSTRAINT IF EXISTS fk_priest_admin');
  await query("DROP TABLE IF EXISTS priest_google_oauth_configs CASCADE");
  await query("DROP TABLE IF EXISTS priest_mailer_settings CASCADE");
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

  // Progress tracking schema:
  // drop only the legacy checklist table, then create normalized template + tracker tables if missing.
  await query('DROP TABLE IF EXISTS steps CASCADE');

  await query(`
    CREATE TABLE IF NOT EXISTS progress_templates (
      "templateID" SERIAL PRIMARY KEY,
      scope VARCHAR(32) NOT NULL CHECK (scope IN ('sacrament', 'special_sacrament')),
      "sacramentID" INT,
      "schemaID" INT,
      "templateName" VARCHAR(255),
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_progress_template_sacrament
        FOREIGN KEY ("sacramentID") REFERENCES sacraments("sacramentID")
        ON DELETE CASCADE
    )
  `);
  await query(`ALTER TABLE progress_templates ADD COLUMN IF NOT EXISTS "schemaID" INT`);
  await query(`ALTER TABLE progress_templates DROP CONSTRAINT IF EXISTS progress_template_scope_target_check`);
  const hasLegacySpecialTemplateKey = await query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'progress_templates'
      AND column_name = 'specialTemplateKey'
    LIMIT 1
  `);
  if (hasLegacySpecialTemplateKey.rows.length > 0) {
    const orphanTemplates = await query(`
      SELECT "templateID", "specialTemplateKey", "templateName"
      FROM progress_templates
      WHERE scope = 'special_sacrament'
        AND "schemaID" IS NULL
    `);
    for (const row of orphanTemplates.rows) {
      const key = String(row.specialTemplateKey || "").trim().toLowerCase();
      const templateName = String(row.templateName || "").trim();
      const strippedName = templateName.replace(/\s+progress\s+template$/i, "").trim();
      let matched = key
        ? (
            await query(`
              SELECT "schemaID", "specialSacramentName"
              FROM special_sacraments_form_schemas
            `)
          ).rows.find((schema) => toSpecialTemplateKey(schema.specialSacramentName) === key)
        : null;
      if (!matched && strippedName) {
        matched = await findSpecialSacramentSchemaByName(strippedName);
      }
      if (!matched && templateName) {
        matched = await findSpecialSacramentSchemaByName(templateName);
      }
      if (!matched) {
        const inferredName =
          strippedName ||
          key
            .split("-")
            .filter(Boolean)
            .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
            .join(" ");
        if (inferredName) {
          await upsertSpecialSacramentSchemaTemplate({
            specialSacramentName: inferredName,
            displayLabel: inferredName,
            formSchema: EMPTY_SPECIAL_SACRAMENT_FORM_SCHEMA,
          });
          matched = await findSpecialSacramentSchemaByName(inferredName);
        }
      }
      const schemaID = Number(matched?.schemaID);
      if (Number.isInteger(schemaID) && schemaID > 0) {
        await query(`UPDATE progress_templates SET "schemaID" = $2 WHERE "templateID" = $1`, [row.templateID, schemaID]);
      }
    }
  }
  await query(`DROP INDEX IF EXISTS progress_templates_special_key_unique`);
  await query(`ALTER TABLE progress_templates DROP COLUMN IF EXISTS "specialTemplateKey"`);
  await query(`ALTER TABLE progress_templates DROP CONSTRAINT IF EXISTS fk_progress_template_special_schema`);
  await query(`
    ALTER TABLE progress_templates
    ADD CONSTRAINT fk_progress_template_special_schema
    FOREIGN KEY ("schemaID") REFERENCES special_sacraments_form_schemas("schemaID")
    ON DELETE CASCADE
  `);
  await query(`
    ALTER TABLE progress_templates
    ADD CONSTRAINT progress_template_scope_target_check CHECK (
      (scope = 'sacrament' AND "sacramentID" IS NOT NULL AND "schemaID" IS NULL) OR
      (scope = 'special_sacrament' AND "sacramentID" IS NULL AND "schemaID" IS NOT NULL)
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS progress_templates_sacrament_unique
    ON progress_templates ("sacramentID")
    WHERE scope = 'sacrament' AND "isActive" = TRUE
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS progress_templates_special_schema_unique
    ON progress_templates ("schemaID")
    WHERE scope = 'special_sacrament' AND "isActive" = TRUE
  `);
  await query(`
    INSERT INTO progress_templates (scope, "sacramentID", "schemaID", "templateName", "isActive")
    SELECT 'special_sacrament', NULL, sfs."schemaID", NULL, TRUE
    FROM special_sacraments_form_schemas sfs
    WHERE NOT EXISTS (
      SELECT 1
      FROM progress_templates t
      WHERE t.scope = 'special_sacrament'
        AND t."schemaID" = sfs."schemaID"
    )
  `);
  await query(`
    CREATE OR REPLACE FUNCTION create_progress_template_for_special_schema()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO progress_templates (scope, "sacramentID", "schemaID", "templateName", "isActive")
      SELECT 'special_sacrament', NULL, NEW."schemaID", NULL, TRUE
      WHERE NOT EXISTS (
        SELECT 1
        FROM progress_templates
        WHERE scope = 'special_sacrament'
          AND "schemaID" = NEW."schemaID"
      );
      RETURN NEW;
    END;
    $$;
  `);
  await query(`DROP TRIGGER IF EXISTS trg_special_schema_progress_template ON special_sacraments_form_schemas`);
  await query(`
    CREATE TRIGGER trg_special_schema_progress_template
    AFTER INSERT ON special_sacraments_form_schemas
    FOR EACH ROW
    EXECUTE PROCEDURE create_progress_template_for_special_schema()
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS progress_template_steps (
      "stepID" SERIAL PRIMARY KEY,
      "templateID" INT NOT NULL,
      "stepOrder" INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_progress_template_steps_template
        FOREIGN KEY ("templateID") REFERENCES progress_templates("templateID")
        ON DELETE CASCADE,
      CONSTRAINT progress_template_steps_unique_order UNIQUE ("templateID", "stepOrder"),
      CONSTRAINT progress_template_steps_tasks_array_check CHECK (jsonb_typeof(tasks) = 'array')
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS progress_tracker (
      "progressID" SERIAL PRIMARY KEY,
      "appointmentID" INT NOT NULL UNIQUE,
      "templateID" INT,
      checklist_data JSONB NOT NULL DEFAULT '[]'::jsonb,
      "scheduledEventDateTime" TIMESTAMPTZ,
      "eventDone" BOOLEAN NOT NULL DEFAULT FALSE,
      "priestComments" TEXT,
      "secretaryRemarks" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_progress_tracker_appointment
        FOREIGN KEY ("appointmentID") REFERENCES appointments("appointmentID")
        ON DELETE CASCADE,
      CONSTRAINT fk_progress_tracker_template
        FOREIGN KEY ("templateID") REFERENCES progress_templates("templateID")
        ON DELETE SET NULL,
      CONSTRAINT progress_tracker_checklist_array_check CHECK (jsonb_typeof(checklist_data) = 'array')
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
  await query('ALTER TABLE progress_tracker ADD COLUMN IF NOT EXISTS "scheduledEventDateTime" TIMESTAMPTZ');
  await query('ALTER TABLE progress_tracker ADD COLUMN IF NOT EXISTS "eventDone" BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE progress_tracker ADD COLUMN IF NOT EXISTS "priestComments" TEXT');
  await query('ALTER TABLE progress_tracker ADD COLUMN IF NOT EXISTS "secretaryRemarks" TEXT');
  await query(`
    CREATE TABLE IF NOT EXISTS appointment_schedule_remarks (
      "remarkID" SERIAL PRIMARY KEY,
      "appointmentID" INTEGER NOT NULL REFERENCES appointments("appointmentID") ON DELETE CASCADE,
      "userID" INTEGER NOT NULL REFERENCES users("userID") ON DELETE CASCADE,
      decision TEXT NOT NULL CHECK (decision IN ('accepted', 'preferred')),
      message TEXT NOT NULL DEFAULT '',
      "preferredDate" DATE,
      "preferredTime" TEXT,
      "preferredPriestID" INTEGER REFERENCES priests("priestID") ON DELETE SET NULL,
      "currentScheduledEventDateTime" TIMESTAMPTZ,
      "currentPriestID" INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
      "reviewedByAdminID" INTEGER,
      "reviewedAt" TIMESTAMPTZ,
      "adminDecision" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_appointment_schedule_remarks_appointment
      ON appointment_schedule_remarks ("appointmentID", status, "createdAt" DESC)
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_schedule_remarks_pending_unique
      ON appointment_schedule_remarks ("appointmentID")
      WHERE status = 'pending'
  `);
  const progressPaymentColumns = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'progress_tracker'
      AND column_name IN ('paymentRecords', 'paymentStatus')
  `);
  const hasProgressPaymentRecordsColumn = progressPaymentColumns.rows.some((row) => row.column_name === "paymentRecords");
  if (hasProgressPaymentRecordsColumn) {
    await query(`
      UPDATE appointments a
      SET credentials = COALESCE(a.credentials, '{}'::jsonb) || jsonb_build_object('paymentRecords', pt."paymentRecords")
      FROM progress_tracker pt
      WHERE pt."appointmentID" = a."appointmentID"
        AND jsonb_typeof(COALESCE(pt."paymentRecords", '[]'::jsonb)) = 'array'
        AND jsonb_array_length(COALESCE(pt."paymentRecords", '[]'::jsonb)) > 0
        AND jsonb_array_length(COALESCE(a.credentials->'paymentRecords', '[]'::jsonb)) = 0
    `);
  }
  await query(`ALTER TABLE progress_tracker DROP COLUMN IF EXISTS "paymentRecords"`);
  await query(`ALTER TABLE progress_tracker DROP COLUMN IF EXISTS "paymentStatus"`);
  await query(`ALTER TABLE progress_tracker DROP CONSTRAINT IF EXISTS progress_tracker_gifts_array_check`);
  await query(`ALTER TABLE progress_tracker DROP COLUMN IF EXISTS "giftAmount"`);
  await query(`ALTER TABLE progress_tracker DROP COLUMN IF EXISTS "giftOfferingsReceipts"`);
  await query(`ALTER TABLE appointments DROP COLUMN IF EXISTS "cancelledFrom"`);
  await runProgressTemplateSeedCleanupMigration();

  await query(`
    CREATE TABLE IF NOT EXISTS calendar_entries (
      "calendarID" SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      "scheduleType" TEXT NOT NULL CHECK ("scheduleType" IN ('parish_event', 'priest_schedule')),
      "eventDate" DATE NOT NULL,
      "startTime" TEXT,
      "endTime" TEXT,
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
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'schedule_type'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'scheduleType'
      ) THEN
        ALTER TABLE calendar_entries RENAME COLUMN schedule_type TO "scheduleType";
      END IF;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'event_date'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'eventDate'
      ) THEN
        ALTER TABLE calendar_entries RENAME COLUMN event_date TO "eventDate";
      END IF;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'start_time'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'startTime'
      ) THEN
        ALTER TABLE calendar_entries RENAME COLUMN start_time TO "startTime";
      END IF;
    END
    $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'end_time'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_entries'
          AND column_name = 'endTime'
      ) THEN
        ALTER TABLE calendar_entries RENAME COLUMN end_time TO "endTime";
      END IF;
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
  await query(`
    DO $$
    DECLARE
      constraint_row RECORD;
    BEGIN
      FOR constraint_row IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'calendar_entries'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%scheduleType%'
          AND con.conname <> 'calendar_entries_schedule_type_allowed'
      LOOP
        EXECUTE format('ALTER TABLE calendar_entries DROP CONSTRAINT %I', constraint_row.conname);
      END LOOP;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_entries_schedule_type_allowed') THEN
        ALTER TABLE calendar_entries
        ADD CONSTRAINT calendar_entries_schedule_type_allowed
        CHECK ("scheduleType" IN ('parish_event', 'priest_schedule', 'priest_activity'));
      END IF;
    END
    $$;
  `);
  await query('ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS "s_sacramentID" INT');
  await query('ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS "priestID" INT');
  await query('ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS "adminID" INT');
  await query('ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS "appointmentID" INT');
  await query(`
    DELETE FROM calendar_entries ce
    USING appointments a
    WHERE ce."appointmentID" = a."appointmentID"
      AND a."s_sacramentID" IS NOT NULL
  `);
  await query(`
    UPDATE calendar_entries
    SET
      title = NULL,
      "eventDate" = NULL,
      "startTime" = NULL,
      "endTime" = NULL,
      location = NULL,
      notes = NULL,
      "priestID" = NULL
    WHERE "s_sacramentID" IS NOT NULL
      AND COALESCE("appointmentID", 0) = 0
  `);
  await query(`ALTER TABLE special_sacraments DROP COLUMN IF EXISTS "calendarColor"`);
  await query(`ALTER TABLE calendar_entries DROP COLUMN IF EXISTS "eventColor"`);
  await query(`
    UPDATE calendar_entries ce
    SET "adminID" = p."adminID"
    FROM priests p
    WHERE ce."adminID" IS NULL
      AND ce."priestID" = p."priestID"
  `);
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
          AND a."s_sacramentID" IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM calendar_entries existing
        WHERE existing."appointmentID" = extracted."appointmentID"
      )
  `);
  await query(`
    UPDATE calendar_entries
    SET notes = NULLIF(TRIM(REGEXP_REPLACE(COALESCE(notes, ''), '\\s*\\[AppointmentID:\\d+\\]', '', 'gi')), '')
    WHERE notes ILIKE '%[AppointmentID:%'
  `);
  await query(`
    UPDATE calendar_entries
    SET location = NULL
    WHERE "scheduleType" = 'parish_event'
      AND location IS NOT NULL
  `);
  await query(`
    DO $$
    BEGIN
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
  await query(
    `
      DELETE FROM calendar_entries
      WHERE "scheduleType" IN ('priest_schedule', 'priest_activity')
        AND "appointmentID" IS NULL
        AND (
          "priestID" IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM priests p
            WHERE p."priestID" = calendar_entries."priestID"
          )
        )
    `,
  );
  await query(`
    CREATE OR REPLACE FUNCTION delete_priest_schedules_on_priest_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      DELETE FROM calendar_entries
      WHERE "scheduleType" IN ('priest_schedule', 'priest_activity')
        AND "priestID" = OLD."priestID";
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_entries_priest_date
    ON calendar_entries ("adminID", "priestID", "eventDate")
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_entries_priest_created_at
    ON calendar_entries ("priestID", "createdAt" DESC, "calendarID" DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_entries_priest_type_created_at
    ON calendar_entries ("priestID", "scheduleType", "createdAt" DESC, "calendarID" DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_entries_priest_type_event_date
    ON calendar_entries ("adminID", "priestID", "scheduleType", "eventDate", "startTime", "calendarID")
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_entries_appointment
    ON calendar_entries ("appointmentID")
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS calendar_entries_appointment_unique
    ON calendar_entries ("appointmentID")
    WHERE "appointmentID" IS NOT NULL
  `);
  await query(`
    UPDATE calendar_entries
    SET notes = NULL, "updatedAt" = NOW()
    WHERE notes IS NOT NULL
      AND (
        LOWER(BTRIM(notes)) IN ('yes', 'y')
        OR notes ILIKE '%auto-generated from progress tracker%'
      )
  `);
  await query(`
    UPDATE calendar_entries AS ce
    SET
      title = cleaned.new_title,
      location = CASE
        WHEN LOWER(BTRIM(COALESCE(ce.location, ''))) = LOWER(cleaned.new_title) THEN 'Parish'
        WHEN LOWER(BTRIM(COALESCE(ce.location, ''))) IN ('marriage', 'baptism', 'christening', 'funeral mass', 'parish schedule')
          THEN 'Parish'
        ELSE ce.location
      END,
      "updatedAt" = NOW()
    FROM (
      SELECT
        "calendarID",
        COALESCE(
          NULLIF(BTRIM(REGEXP_REPLACE(title, '^Appointment\\s*#\\s*\\d+\\s*[-–:]\\s*', '', 'i')), ''),
          title
        ) AS new_title
      FROM calendar_entries
      WHERE title ILIKE 'Appointment #%'
    ) AS cleaned
    WHERE ce."calendarID" = cleaned."calendarID"
  `);
  await query("ALTER TABLE calendar_entries ALTER COLUMN title DROP NOT NULL");
  await query('ALTER TABLE calendar_entries ALTER COLUMN "eventDate" DROP NOT NULL');
  await query("DROP VIEW IF EXISTS calendar_entries_resolved");
  await query(`ALTER TABLE calendar_entries DROP COLUMN IF EXISTS "heldForInactivePriest"`);
  await query(`ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS "occupiedSlots" JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await query(`
    CREATE OR REPLACE VIEW calendar_entries_resolved AS
    SELECT
      ce."calendarID",
      CASE
        WHEN ce."appointmentID" IS NOT NULL THEN
          COALESCE(s."sacramentName", ss."s_sacramentName", ce.title, 'Appointment')
        WHEN ce."s_sacramentID" IS NOT NULL THEN
          COALESCE(ss."s_sacramentName", ce.title, 'Special Sacrament Program')
        ELSE ce.title
      END AS title,
      ce."scheduleType",
      COALESCE(
        (
          CASE
            WHEN COALESCE(a.credentials->>'scheduledEventDateTime', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN (a.credentials->>'scheduledEventDateTime')::timestamptz
            WHEN COALESCE(a.credentials->>'finalSchedule', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN (a.credentials->>'finalSchedule')::timestamptz
            WHEN COALESCE(a.credentials->>'finalEventSchedule', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN (a.credentials->>'finalEventSchedule')::timestamptz
            ELSE NULL
          END
          AT TIME ZONE 'Asia/Manila'
        )::date,
        CASE
          WHEN ce."appointmentID" IS NULL AND ss."timeDate" IS NOT NULL THEN ss."timeDate"::date
          ELSE NULL
        END,
        ce."eventDate"
      ) AS "eventDate",
      COALESCE(
        to_char(
          CASE
            WHEN COALESCE(a.credentials->>'scheduledEventDateTime', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN (a.credentials->>'scheduledEventDateTime')::timestamptz
            WHEN COALESCE(a.credentials->>'finalSchedule', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN (a.credentials->>'finalSchedule')::timestamptz
            WHEN COALESCE(a.credentials->>'finalEventSchedule', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN (a.credentials->>'finalEventSchedule')::timestamptz
            ELSE NULL
          END
          AT TIME ZONE 'Asia/Manila',
          'HH24:MI'
        ),
        CASE
          WHEN ce."appointmentID" IS NULL AND ss."timeDate" IS NOT NULL THEN to_char(ss."timeDate", 'HH24:MI')
          ELSE NULL
        END,
        ce."startTime"
      ) AS "startTime",
      COALESCE(
        to_char(
          (
            CASE
              WHEN COALESCE(a.credentials->>'scheduledEventDateTime', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                THEN (a.credentials->>'scheduledEventDateTime')::timestamptz
              WHEN COALESCE(a.credentials->>'finalSchedule', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                THEN (a.credentials->>'finalSchedule')::timestamptz
              WHEN COALESCE(a.credentials->>'finalEventSchedule', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                THEN (a.credentials->>'finalEventSchedule')::timestamptz
              ELSE NULL
            END
            + INTERVAL '1 hour'
          ) AT TIME ZONE 'Asia/Manila',
          'HH24:MI'
        ),
        CASE
          WHEN ce."appointmentID" IS NULL AND ss."timeDate" IS NOT NULL THEN COALESCE(
            (
              SELECT to_char(MAX((elem->>'endTime')::time), 'HH24:MI')
              FROM jsonb_array_elements(COALESCE(ss."occupiedSlots", '[]'::jsonb)) AS elem
              WHERE COALESCE(elem->>'endTime', '') <> ''
            ),
            to_char(
              ss."timeDate" + (GREATEST(COALESCE(ss."durationHours", 1), 1) * INTERVAL '1 hour'),
              'HH24:MI'
            )
          )
          ELSE NULL
        END,
        ce."endTime"
      ) AS "endTime",
      CASE
        WHEN ce."appointmentID" IS NOT NULL THEN
          CASE
            WHEN NULLIF(BTRIM(ce.location), '') IS NOT NULL
              AND LOWER(BTRIM(ce.location)) <> LOWER(COALESCE(s."sacramentName", ss."s_sacramentName", ''))
            THEN BTRIM(ce.location)
            ELSE 'Parish'
          END
        WHEN ce."s_sacramentID" IS NOT NULL THEN NULL
        ELSE ce.location
      END AS location,
      CASE
        WHEN ce."appointmentID" IS NOT NULL OR ce."s_sacramentID" IS NOT NULL THEN NULL
        ELSE ce.notes
      END AS notes,
      COALESCE(a."s_sacramentID", ce."s_sacramentID") AS "s_sacramentID",
      COALESCE(a."priestID", ss."priestID", ce."priestID") AS "priestID",
      ce."adminID",
      ce."appointmentID",
      ce."createdAt",
      ce."updatedAt",
      COALESCE(s."sacramentName", ss."s_sacramentName") AS sacrament_name,
      a."requesterFullName" AS requester_full_name,
      CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS request_type,
      CASE
        WHEN ce."appointmentID" IS NULL AND ce."scheduleType" = 'priest_activity' THEN COALESCE(ce."occupiedSlots", '[]'::jsonb)
        WHEN ce."appointmentID" IS NULL THEN COALESCE(ss."occupiedSlots", '[]'::jsonb)
        ELSE '[]'::jsonb
      END AS occupied_slots
    FROM calendar_entries ce
    LEFT JOIN appointments a ON a."appointmentID" = ce."appointmentID"
    LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
    LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = COALESCE(a."s_sacramentID", ce."s_sacramentID")
  `);
  await query(`ALTER TABLE appointments DROP COLUMN IF EXISTS "requestType"`);
  await query(`
    UPDATE progress_tracker pt
    SET
      "scheduledEventDateTime" = program_schedule.scheduled_at,
      "updatedAt" = NOW()
    FROM appointments a
    JOIN LATERAL (
      SELECT
        COALESCE(
          CASE
            WHEN ce."eventDate" IS NOT NULL AND NULLIF(BTRIM(ce."startTime"), '') IS NOT NULL
              THEN (ce."eventDate" + NULLIF(BTRIM(ce."startTime"), '')::time) AT TIME ZONE 'Asia/Manila'
            ELSE NULL
          END,
          to_timestamp(to_char(ss."timeDate", 'YYYY-MM-DD HH24:MI'), 'YYYY-MM-DD HH24:MI') AT TIME ZONE 'Asia/Manila'
        ) AS scheduled_at,
        ce."priestID"
      FROM special_sacraments ss
      LEFT JOIN calendar_entries ce
        ON ce."s_sacramentID" = ss."s_sacramentID"
       AND COALESCE(ce."appointmentID", 0) = 0
      WHERE ss."s_sacramentID" = a."s_sacramentID"
      ORDER BY ce."calendarID" DESC NULLS LAST
      LIMIT 1
    ) program_schedule ON TRUE
    WHERE pt."appointmentID" = a."appointmentID"
      AND a."s_sacramentID" IS NOT NULL
      AND a.status <> 'CANCELLED'
      AND pt."scheduledEventDateTime" IS NULL
      AND program_schedule.scheduled_at IS NOT NULL
  `);
  await query(`
    UPDATE appointments a
    SET credentials = COALESCE(a.credentials, '{}'::jsonb)
      || jsonb_build_object(
        'scheduledEventDateTime',
        to_char(timezone('UTC', pt."scheduledEventDateTime"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    FROM progress_tracker pt
    WHERE pt."appointmentID" = a."appointmentID"
      AND a."s_sacramentID" IS NOT NULL
      AND a.status <> 'CANCELLED'
      AND pt."scheduledEventDateTime" IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(a.credentials->>'scheduledEventDateTime', '')), '') IS NULL
  `);
  await query(`
    UPDATE appointments a
    SET "priestID" = ce."priestID"
    FROM calendar_entries ce
    WHERE ce."s_sacramentID" = a."s_sacramentID"
      AND COALESCE(ce."appointmentID", 0) = 0
      AND a.status <> 'CANCELLED'
      AND a."priestID" IS NULL
      AND ce."priestID" IS NOT NULL
  `);
  await query(`
    UPDATE appointments a
    SET credentials = COALESCE(a.credentials, '{}'::jsonb)
      || jsonb_build_object(
        'scheduledEventDateTime',
        to_char(timezone('UTC', pt."scheduledEventDateTime"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    FROM progress_tracker pt
    WHERE pt."appointmentID" = a."appointmentID"
      AND a."priestID" IS NOT NULL
      AND pt."scheduledEventDateTime" IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(
        a.credentials->>'scheduledEventDateTime',
        a.credentials->>'finalSchedule',
        a.credentials->>'finalEventSchedule'
      )), '') IS NULL
  `);
  const scheduledAppointmentsToSync = await query(
    `
      SELECT a."appointmentID"
      FROM appointments a
      WHERE COALESCE(a."isArchived", FALSE) = FALSE
        AND a.status = 'CONFIRMED'
        AND a."priestID" IS NOT NULL
        AND ${APPOINTMENT_HAS_CREDENTIAL_SCHEDULE_SQL}
      ORDER BY a."appointmentID" ASC
    `,
  );
  for (const row of scheduledAppointmentsToSync.rows) {
    try {
      await restoreAppointmentCalendarEntry(row.appointmentID);
    } catch (error) {
      console.error("Appointment calendar bootstrap sync error:", error);
    }
  }
  await query("DROP TRIGGER IF EXISTS tr_priests_delete_schedules ON priests");
  await query(`
    CREATE TRIGGER tr_priests_delete_schedules
    BEFORE DELETE ON priests
    FOR EACH ROW
    EXECUTE FUNCTION delete_priest_schedules_on_priest_delete()
  `);
  await query('ALTER TABLE calendar_entries DROP CONSTRAINT IF EXISTS fk_calendar_entry_admin');
  await query(`
    CREATE TABLE IF NOT EXISTS priest_schedule_remarks (
      "remarkID" BIGSERIAL PRIMARY KEY,
      "calendarEntryID" INT NOT NULL,
      "priestID" INT NOT NULL,
      "adminID" INT NOT NULL,
      remarks TEXT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'remarks_sent',
      "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_priest_schedule_remarks_calendar_entry
        FOREIGN KEY ("calendarEntryID") REFERENCES calendar_entries("calendarID")
        ON DELETE CASCADE,
      CONSTRAINT fk_priest_schedule_remarks_priest
        FOREIGN KEY ("priestID") REFERENCES priests("priestID")
        ON DELETE CASCADE
    )
  `);
  await query('ALTER TABLE priest_schedule_remarks ADD COLUMN IF NOT EXISTS "adminID" INT');
  await query('ALTER TABLE priest_schedule_remarks ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT \'remarks_sent\'');
  await query('ALTER TABLE priest_schedule_remarks ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await query('ALTER TABLE priest_schedule_remarks ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await query('ALTER TABLE priest_schedule_remarks ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await query('ALTER TABLE priest_schedule_remarks ADD COLUMN IF NOT EXISTS "reviewedBySecretary" BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE priest_schedule_remarks ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ');
  await query(`
    UPDATE priest_schedule_remarks psr
    SET "adminID" = ce."adminID"
    FROM calendar_entries ce
    WHERE psr."adminID" IS NULL
      AND psr."calendarEntryID" = ce."calendarID"
  `);
  await query('UPDATE priest_schedule_remarks SET "adminID" = 1 WHERE "adminID" IS NULL');
  await query('ALTER TABLE priest_schedule_remarks ALTER COLUMN "adminID" SET NOT NULL');
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_priest_schedule_remarks_entry_priest_unique
    ON priest_schedule_remarks ("calendarEntryID", "priestID")
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_priest_schedule_remarks_priest_sent_at
    ON priest_schedule_remarks ("priestID", "sentAt" DESC)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS priest_schedule_notes (
      "noteID" BIGSERIAL PRIMARY KEY,
      "priestID" INT NOT NULL REFERENCES priests("priestID") ON DELETE CASCADE,
      "adminID" INT NOT NULL,
      "noteDate" DATE NOT NULL,
      "occupiedSlots" JSONB NOT NULL DEFAULT '[]'::jsonb,
      reason VARCHAR(120) NOT NULL,
      message TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      "calendarEntryID" INT REFERENCES calendar_entries("calendarID") ON DELETE SET NULL,
      "reviewedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_priest_schedule_notes_admin_date
    ON priest_schedule_notes ("adminID", "noteDate")
  `);
  await query(`
    ALTER TABLE priest_schedule_notes
    ADD COLUMN IF NOT EXISTS "coverageDates" JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await query(`
    ALTER TABLE priest_schedule_notes
    ADD COLUMN IF NOT EXISTS "coverageKind" TEXT NOT NULL DEFAULT 'day'
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS appointment_change_requests (
      "requestID" BIGSERIAL PRIMARY KEY,
      "appointmentID" INT NOT NULL REFERENCES appointments("appointmentID") ON DELETE CASCADE,
      "userID" INT NOT NULL,
      "adminID" INT NOT NULL,
      "requestType" VARCHAR(20) NOT NULL,
      reason TEXT NOT NULL,
      "previousStatus" VARCHAR(20),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      "adminResponse" TEXT,
      "reviewedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_change_requests_one_pending
    ON appointment_change_requests ("appointmentID")
    WHERE status = 'pending'
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_appointment_change_requests_admin_status
    ON appointment_change_requests ("adminID", status, "createdAt" DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_priest_schedule_remarks_admin_sent_at
    ON priest_schedule_remarks ("adminID", "sentAt" DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_priest_schedule_remarks_admin_unreviewed
    ON priest_schedule_remarks ("adminID", "reviewedBySecretary", "sentAt" DESC)
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
    CREATE TABLE IF NOT EXISTS recurring_half_days (
      "recurring_halfID" INT PRIMARY KEY,
      weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      "startTime" TIME NOT NULL,
      "endTime" TIME NOT NULL,
      "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ("endTime" > "startTime")
    )
  `);
  await query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_lock(hashtext('recurring_half_days.recurring_halfID'));
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recurring_half_days'
          AND column_name = 'adminID'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recurring_half_days'
          AND column_name = 'recurring_halfID'
      ) THEN
        ALTER TABLE recurring_half_days RENAME COLUMN "adminID" TO "recurring_halfID";
      END IF;
      PERFORM pg_advisory_unlock(hashtext('recurring_half_days.recurring_halfID'));
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(hashtext('recurring_half_days.recurring_halfID'));
        RAISE;
    END
    $$;
  `);
  await query(`
    INSERT INTO recurring_half_days ("recurring_halfID", weekday, "startTime", "endTime", "isEnabled")
    VALUES (1, 0, '08:00', '12:00', TRUE)
    ON CONFLICT ("recurring_halfID") DO NOTHING
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
  // Legacy global day-off rows (without adminID) must not be auto-assigned to any admin.
  await query('DELETE FROM recurring_day_offs WHERE "adminID" IS NULL');
  await query('DELETE FROM day_off_dates WHERE "adminID" IS NULL');
  await query('ALTER TABLE day_off_dates ALTER COLUMN "adminID" SET NOT NULL');
  await query('ALTER TABLE day_off_dates DROP CONSTRAINT IF EXISTS fk_day_off_date_admin');
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS day_off_dates_admin_date_unique
    ON day_off_dates ("adminID", "dayOffDate")
  `);
  await query("DROP TABLE IF EXISTS schedule_lock_settings");

  await runParishActivitiesSchemaMigration();
  await runParishActivitiesMediaFilePathMigration();

  // Remove legacy admin table in main DB after all foreign-key ties are detached.
  await query('DROP TABLE IF EXISTS admins');

  const sacramentCountResult = await query('SELECT COUNT(*)::INT AS "count" FROM sacraments');
  if (sacramentCountResult.rows[0].count === 0) {
    for (const sacramentName of sacramentSeeds) {
      await query('INSERT INTO sacraments ("sacramentName") VALUES ($1)', [sacramentName]);
    }
  }
  await query(
    `
      UPDATE sacraments
      SET "sacramentName" = 'Funeral Mass'
      WHERE LOWER(TRIM("sacramentName")) IN ('death mass', 'death-mass')
    `,
  );
  await query(
    `
      UPDATE progress_templates
      SET "templateName" = REPLACE("templateName", 'Death Mass', 'Funeral Mass')
      WHERE "templateName" ILIKE '%Death Mass%'
    `,
  );
  await migrateLegacySacramentSchemaSettings();
  await runBaptismGodparentFieldsMigration();
  await runMarriageSeparateAddressesMigration();
  await runMarriageAddressBelowPhoneMigration();
  await runMarriageAddressPlaceholderMigration();
  await runFuneralDeceasedAddressMigration();
  await runFuneralAddressBelowFamilyMigration();

  const calendarEntriesCountResult = await query('SELECT COUNT(*)::INT AS "count" FROM calendar_entries');
  const specialSacramentsCountResult = await query('SELECT COUNT(*)::INT AS "count" FROM special_sacraments');

  if (calendarEntriesCountResult.rows[0].count === 0 && specialSacramentsCountResult.rows[0].count === 0) {
    const now = new Date();
    const todayDate = toIsoDate(now);
    const upcomingDate = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5));

    const seededSpecialSacramentResult = await query(
      `
        INSERT INTO special_sacraments ("s_sacramentName", "maxSlots", "timeDate")
        VALUES ($1, $2, $3)
        RETURNING "s_sacramentID"
      `,
      ["Special Sacramental Program", 25, `${upcomingDate}T00:00:00`],
    );
    const seededSpecialSacramentId = seededSpecialSacramentResult.rows[0].s_sacramentID;

    await query(
      `
        INSERT INTO calendar_entries (title, "scheduleType", "eventDate", "startTime", "endTime", location, notes, "s_sacramentID", "priestID", "adminID")
        VALUES
          ($1, 'parish_event', $2, $3, $4, $5, $6, NULL, NULL, NULL),
          (NULL, 'parish_event', NULL, NULL, NULL, NULL, NULL, $7, NULL, NULL)
      `,
      [
        "Morning Mass Schedule",
        todayDate,
        "06:00",
        "07:00",
        "Main Chapel",
        "Daily parish mass schedule.",
        seededSpecialSacramentId,
      ],
    );
  }

  await refreshSpecialSacramentAppliedCounts();
  await migrateLegacyJsonUsers();
};

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Faithflow backend is running." });
});

app.get("/server-time", async (_req, res) => {
  try {
    const result = await query(`SELECT NOW() AS "now"`);
    return res.json({
      now: result.rows[0]?.now || new Date().toISOString(),
      timeZone: "Asia/Manila",
    });
  } catch (error) {
    console.error("Server time error:", error);
    return res.json({ now: new Date().toISOString(), timeZone: "Asia/Manila" });
  }
});

app.get("/verse-of-day", async (_req, res) => {
  try {
    const verse = await fetchWldehVerseOfDay();
    return res.json({
      text: verse.text,
      reference: verse.reference,
      source: verse.source,
      version: verse.version,
    });
  } catch (error) {
    console.error("Verse of day fetch error:", error);
    return res.status(502).json({ message: "Unable to fetch verse of the day." });
  }
});

const createUserAccount = async (req, res) => {
  try {
    const { fullName, firstName, lastName, address, contactNumber, birthdate, gender, password, photo } = req.body || {};
    const email = resolveRequestEmail(req.body || {});
    const personName = resolveStoredPersonName({ firstName, lastName, fullName });
    const normalizedFullName = personName.fullName;
    const normalizedAddress = String(address || "").trim();

    if (!normalizedFullName || !normalizedAddress || !password) {
      return res.status(400).json({ message: "Please complete all registration fields." });
    }
    if (!email || !EMAIL_INPUT_REGEX.test(email) || !isGmailAddress(email)) {
      return res.status(400).json({ message: "A Gmail address is required to create an account." });
    }

    const normalizedContactNumber = String(contactNumber || "").trim();
    if (!PHONE_INPUT_REGEX.test(normalizedContactNumber)) {
      return res.status(400).json({ message: "A phone number is required and must be 11 digits starting with 09." });
    }

    const normalizedGender = String(gender || "")
      .trim()
      .toLowerCase();
    if (!normalizedGender) {
      return res.status(400).json({ message: "Gender is required for user registration." });
    }
    if (!["male", "female"].includes(normalizedGender)) {
      return res.status(400).json({ message: "Gender must be male or female." });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    await assertLoginIdentifiersAvailable({
      email,
      phoneNumber: normalizedContactNumber,
    });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const insertUserResult = await query(
      `
        INSERT INTO users ("firstName", "lastName", address, "contactNumber", birthdate, gender, email, password, photo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING "userID", "firstName", "lastName", ${sqlPersonFullName()} AS "fullName", address, "contactNumber", birthdate, gender, email, "createdAt", "updatedAt", photo
      `,
      [
        personName.firstName,
        personName.lastName,
        normalizedAddress,
        normalizedContactNumber,
        birthdate || null,
        normalizedGender,
        email,
        passwordHash,
        photo || null,
      ],
    );
    const createdAccount = sanitizeUser(insertUserResult.rows[0]);

    return res.status(201).json({
      message: "Account created successfully. You can log in with your Gmail or phone number.",
      token: crypto.randomBytes(24).toString("hex"),
      accountType: "user",
      user: createdAccount,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error.code === "23505") {
      return res.status(409).json({ message: "This email address or phone number is already in use." });
    }
    console.error("Register error:", error);
    return res.status(500).json({ message: "Unable to create account right now." });
  }
};

app.post("/register", (req, res) => createUserAccount(req, res));
app.post("/users/register", (req, res) => createUserAccount(req, res));
app.post("/users", (req, res) => createUserAccount(req, res));

app.post("/contact-identifiers/available", async (req, res) => {
  try {
    await assertLoginIdentifiersAvailable({
      email: req.body?.email,
      phoneNumber: req.body?.phoneNumber,
      excludeAdminID: 1,
    });
    return res.json({ available: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Contact identifier availability check error:", error);
    return res.status(500).json({ message: "Unable to check contact availability." });
  }
});

const TEXT_STYLE_IDS = new Set([
  "poppins",
  "inter",
  "nunito",
  "lato",
  "montserrat",
  "georgia",
  "merriweather",
  "lora",
  "source-serif",
  "cinzel",
]);

const ensureAccountTextStyleTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS account_text_styles (
      "accountType" VARCHAR(20) NOT NULL,
      "accountID" INTEGER NOT NULL,
      "textStyle" VARCHAR(30) NOT NULL DEFAULT 'poppins',
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("accountType", "accountID")
    )
  `);
};

const resolveTextStyleAccount = (source = {}) => {
  const accountType = String(source.accountType || "").trim().toLowerCase();
  const accountID = Number(source.accountID);
  if (!["user", "priest"].includes(accountType) || !Number.isInteger(accountID) || accountID <= 0) {
    return null;
  }
  return { accountType, accountID };
};

const sanitizeTextStyle = (value) => (TEXT_STYLE_IDS.has(String(value || "").trim()) ? String(value).trim() : "poppins");

app.get("/settings/text-style", async (req, res) => {
  try {
    const account = resolveTextStyleAccount(req.query || {});
    if (!account) {
      return res.status(400).json({ message: "A user or priest account is required." });
    }
    await ensureAccountTextStyleTable();
    const result = await query(
      `
        SELECT "textStyle"
        FROM account_text_styles
        WHERE "accountType" = $1 AND "accountID" = $2
        LIMIT 1
      `,
      [account.accountType, account.accountID],
    );
    return res.json({
      accountType: account.accountType,
      accountID: account.accountID,
      textStyle: sanitizeTextStyle(result.rows[0]?.textStyle),
    });
  } catch (error) {
    console.error("Account text style fetch error:", error);
    return res.status(500).json({ message: "Unable to load text style." });
  }
});

app.put("/settings/text-style", async (req, res) => {
  try {
    const account = resolveTextStyleAccount(req.body || {});
    if (!account) {
      return res.status(400).json({ message: "A user or priest account is required." });
    }
    const textStyle = sanitizeTextStyle(req.body?.textStyle);
    await ensureAccountTextStyleTable();
    const accountTable = account.accountType === "priest" ? "priests" : "users";
    const accountColumn = account.accountType === "priest" ? "priestID" : "userID";
    const accountResult = await query(
      `SELECT 1 FROM ${accountTable} WHERE "${accountColumn}" = $1 LIMIT 1`,
      [account.accountID],
    );
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: "Account not found." });
    }
    await query(
      `
        INSERT INTO account_text_styles ("accountType", "accountID", "textStyle", "updatedAt")
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT ("accountType", "accountID")
        DO UPDATE SET "textStyle" = EXCLUDED."textStyle", "updatedAt" = CURRENT_TIMESTAMP
      `,
      [account.accountType, account.accountID, textStyle],
    );
    return res.json({
      message: "Text style saved for this account.",
      accountType: account.accountType,
      accountID: account.accountID,
      textStyle,
    });
  } catch (error) {
    console.error("Account text style save error:", error);
    return res.status(500).json({ message: "Unable to save text style." });
  }
});

app.get("/settings/theme", async (_req, res) => {
  try {
    const themeSettings = await getGlobalThemeSettings();
    return res.json({
      themeSettings,
      modalTheme: buildModalThemeContract(themeSettings),
    });
  } catch (error) {
    console.error("Global theme settings fetch error:", error);
    return res.status(500).json({ message: "Unable to load global theme settings." });
  }
});

app.put("/settings/theme", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const themeSettingsInput =
      req.body?.themeSettings && typeof req.body.themeSettings === "object" ? req.body.themeSettings : {};
    const themeSettings = await persistGlobalThemeSettings(themeSettingsInput);
    return res.json({
      message: "Global theme settings saved successfully.",
      themeSettings,
      modalTheme: buildModalThemeContract(themeSettings),
    });
  } catch (error) {
    console.error("Global theme settings save error:", error);
    return res.status(500).json({ message: "Unable to save global theme settings." });
  }
});

app.get("/settings/about-page", async (_req, res) => {
  try {
    const aboutPage = await getAboutPageContent();
    return res.json({ aboutPage });
  } catch (error) {
    console.error("About page settings fetch error:", error);
    return res.status(500).json({ message: "Unable to load About Us content." });
  }
});

app.put("/settings/about-page", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const aboutPageInput =
      req.body?.aboutPage && typeof req.body.aboutPage === "object" ? req.body.aboutPage : req.body || {};
    const aboutPage = await persistAboutPageContent(aboutPageInput, { adminID });
    return res.json({
      message: "About Us content saved successfully.",
      aboutPage,
    });
  } catch (error) {
    console.error("About page settings save error:", error);
    return res.status(500).json({ message: "Unable to save About Us content." });
  }
});

app.get("/settings/religious-orders", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const religiousOrderOptions = await getAdminReligiousOrderOptions(adminID);
    return res.json({ religiousOrderOptions });
  } catch (error) {
    console.error("Religious order options fetch error:", error);
    return res.status(500).json({ message: "Unable to load religious order options." });
  }
});

app.patch("/settings/religious-orders", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    const submittedOptions = req.body?.religiousOrderOptions;
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const religiousOrderOptions = parseAndNormalizeReligiousOrderOptions(
      Array.isArray(submittedOptions) ? submittedOptions : [],
    );

    await query(
      `
        INSERT INTO admin_directory ("adminID", "religiousOrderOptions")
        VALUES ($1, $2::jsonb)
        ON CONFLICT ("adminID") DO UPDATE
        SET "religiousOrderOptions" = EXCLUDED."religiousOrderOptions"
      `,
      [adminID, JSON.stringify(religiousOrderOptions)],
    );

    return res.json({
      message: "Religious order options updated successfully.",
      religiousOrderOptions,
    });
  } catch (error) {
    if (String(error?.message || "").includes("religiousOrderOptions")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Religious order options update error:", error);
    return res.status(500).json({ message: "Unable to update religious order options." });
  }
});

app.get("/settings/priest-email", async (_req, res) => {
  try {
    const config = await getPriestMailerConfig();
    return res.json({
      senderEmail: config.from || null,
      smtpUser: config.user || null,
      authMode: config.authMode,
      hasStoredPassword: Boolean(config.hasStoredMailerSettings),
      appPasswordUpdatedAt: null,
      isReady: !isMissingOrPlaceholderValue(config.from)
        && (
          (config.authMode === "oauth2" && !isMissingOrPlaceholderValue(config.oauthRefreshToken))
          || (config.authMode === "smtp-password" && !isMissingOrPlaceholderValue(config.user) && !isMissingOrPlaceholderValue(config.pass))
        ),
    });
  } catch (error) {
    console.error("Priest email settings fetch error:", error);
    return res.status(500).json({ message: "Unable to load parish sender email settings." });
  }
});

app.put("/settings/priest-email", async (req, res) => {
  try {
    const senderEmail = normalizeEmail(req.body?.senderEmail || req.body?.email || "");
    const smtpUser = normalizeEmail(req.body?.smtpUser || senderEmail);
    const smtpAppPassword = normalizeGmailAppPassword(req.body?.smtpAppPassword || req.body?.smtpPass || "");
    if (smtpAppPassword && !isValidGmailAppPassword(smtpAppPassword)) {
      return res.status(400).json({
        message: "Gmail App Password must be the 16-character code from Google App passwords, not your normal Gmail password.",
      });
    }

    if (!EMAIL_INPUT_REGEX.test(senderEmail) || !isGmailAddress(senderEmail)) {
      return res.status(400).json({ message: "Parish sender email must be a Gmail address (example@gmail.com)." });
    }
    if (!isGmailAddress(smtpUser)) {
      return res.status(400).json({ message: "Parish sender email must be a Gmail address (example@gmail.com)." });
    }

    refreshBackendEnv();
    const host = String(process.env.PRIEST_SMTP_HOST || process.env.SMTP_HOST || "smtp.gmail.com").trim();
    const parsedPort = Number(process.env.PRIEST_SMTP_PORT || process.env.SMTP_PORT || 465);
    const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 465;
    const secure = String(process.env.PRIEST_SMTP_SECURE || process.env.SMTP_SECURE || "true")
      .trim()
      .toLowerCase() !== "false";
    const envUser = normalizeEmail(pickFirstConfiguredValue(process.env.PRIEST_SMTP_USER, process.env.SMTP_USER));
    const envPass = pickFirstConfiguredValue(
      process.env.PRIEST_SMTP_PASS,
      process.env.SMTP_PASS,
      process.env.ADMIN_SMTP_PASS,
      process.env.ADMIN_EMAIL_APP_PASSWORD,
    );
    const adminGmailSender = await getAdminGmailSender();
    const existingPass = String(adminGmailSender.gmailAppPassword || "").trim();

    let nextPass = smtpAppPassword;
    if (!nextPass) {
      if (normalizeEmail(adminGmailSender.email) === smtpUser && !isMissingOrPlaceholderValue(existingPass)) {
        nextPass = existingPass;
      } else if (envUser === smtpUser && !isMissingOrPlaceholderValue(envPass)) {
        nextPass = envPass;
      }
    }

    if (isMissingOrPlaceholderValue(nextPass)) {
      return res.status(400).json({
        message: "This Gmail needs an App Password so Faithflow can send priest login emails. Create a Gmail App Password, then save it here.",
      });
    }

    await verifyPriestSmtpCredentials({
      host,
      port,
      secure,
      user: smtpUser,
      pass: nextPass,
    });
    resetPriestSmtpTransporter();

    return res.json({
      message: "Parish Gmail App Password verified. Priest password emails will be sent from this Gmail.",
      senderEmail,
      smtpUser,
      hasStoredPassword: Boolean(nextPass),
    });
  } catch (error) {
    const message = String(error?.message || "Unable to update parish sender email.");
    if (
      message.includes("Gmail")
      || message.includes("App Password")
      || message.includes("must be a Gmail")
    ) {
      return res.status(400).json({ message });
    }
    console.error("Priest email settings update error:", error);
    return res.status(500).json({
      message: "Unable to save the parish Gmail sender. Check the App Password and try again.",
    });
  }
});

app.get("/priests", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    const includeInactiveRaw = String(req.query?.includeInactive || "").trim().toLowerCase();
    const includeInactive = ["1", "true", "yes"].includes(includeInactiveRaw);

    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const listResult = await query(
      `
        SELECT
          p."priestID",
          p."fullName",
          p."adminID",
          p.email,
          p."phoneNumber",
          p."clergyType",
          p."religiousOrderCode",
          COALESCE(p."isActive", TRUE) AS "isActive",
          COALESCE(NULLIF(BTRIM(p.photo), ''), linked_user.photo) AS photo,
          linked_user."updatedAt" AS "linkedUserUpdatedAt"
        FROM priests p
        LEFT JOIN LATERAL (
          SELECT
            u.photo,
            u."updatedAt",
            u."userID"
          FROM users u
          WHERE
            ${priestMatchesUserSql}
            OR LOWER(TRIM(COALESCE(${sqlPersonFullName("u")}, ''))) = LOWER(TRIM(COALESCE(p."fullName", '')))
          ORDER BY
            CASE
              WHEN ${priestMatchesUserSql} THEN 0
              ELSE 1
            END,
            u."updatedAt" DESC NULLS LAST,
            u."userID" DESC
          LIMIT 1
        ) AS linked_user ON TRUE
        WHERE p."adminID" = $1
          AND ($2::BOOLEAN = TRUE OR COALESCE(p."isActive", TRUE) = TRUE)
        ORDER BY LOWER(TRIM(COALESCE(p."fullName", ''))) ASC, p."priestID" ASC
      `,
      [adminID, includeInactive],
    );

    return res.json(listResult.rows);
  } catch (error) {
    console.error("Priests list fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch priests." });
  }
});

app.get("/priest/me/dashboard", async (req, res) => {
  try {
    await promoteDueAppointmentsToHistory();
    const priestID = Number(req.query?.priestID);
    const userID = Number(req.query?.userID);
    if ((!Number.isInteger(priestID) || priestID <= 0) && (!Number.isInteger(userID) || userID <= 0)) {
      return res.status(400).json({ message: "A valid priestID or userID is required." });
    }

    const context = await resolvePriestContextFromRequest(req);
    if (!context) {
      return res.status(404).json({ message: "Priest account not found for this login." });
    }
    if (context.priest.isActive === false) {
      return res.status(403).json({ message: "Priest account is inactive. Please contact the parish secretary." });
    }

    const schedulesResult = await query(
      `
        SELECT
          ce."calendarID" AS id,
          ce.title,
          ce."scheduleType" AS "scheduleType",
          ce."eventDate"::text AS "eventDate",
          ce."startTime" AS "startTime",
          ce."endTime" AS "endTime",
          ce.location,
          ce.notes
        FROM calendar_entries_resolved ce
        WHERE ce."adminID" = $1
          AND ce."priestID" = $2
          AND ${calendarEntryHasActivePriestSql()}
        ORDER BY ce."eventDate" ASC, ce."startTime" ASC NULLS FIRST, ce."calendarID" ASC
      `,
      [context.priest.adminID, context.priest.priestID],
    );

    const recordsResult = await query(
      `
        SELECT
          a."appointmentID",
          a.status,
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
          a."requesterFullName",
          a.credentials,
          a.note,
          a."createdAt",
          a."finishedAt",
          COALESCE(ss."s_sacramentName", s."sacramentName", 'Assigned Schedule') AS "sacramentName",
          a."s_sacramentID",
          pt."scheduledEventDateTime",
          pt."updatedAt" AS "progressUpdatedAt",
          pt."eventDone",
          pt."priestComments",
          pt."secretaryRemarks",
          psr.status AS "remarkStatus",
          psr.remarks AS "priestRemarks",
          psr."sentAt" AS "remarkSentAt",
          psr."updatedAt" AS "remarkUpdatedAt",
          psr."reviewedBySecretary",
          psr."reviewedAt"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
        LEFT JOIN LATERAL (
          SELECT ce."calendarID"
          FROM calendar_entries ce
          WHERE ce."priestID" = a."priestID"
            AND (
              pt."scheduledEventDateTime" IS NULL
              OR ce."eventDate" = pt."scheduledEventDateTime"::date
            )
          ORDER BY ce."eventDate" DESC, ce."startTime" DESC NULLS LAST, ce."calendarID" DESC
          LIMIT 1
        ) schedule_link ON TRUE
        LEFT JOIN priest_schedule_remarks psr
          ON psr."calendarEntryID" = schedule_link."calendarID"
          AND psr."priestID" = a."priestID"
        WHERE a."priestID" = $1
          AND a."isArchived" = FALSE
        ORDER BY COALESCE(pt."scheduledEventDateTime", a."createdAt") DESC, a."appointmentID" DESC
      `,
      [context.priest.priestID],
    );

    const todayKey = new Date().toISOString().slice(0, 10);
    const schedules = schedulesResult.rows.map((row) => ({
      id: Number(row.id),
      title: row.title || "Priest Schedule",
      scheduleType: row.scheduleType || "priest_schedule",
      eventDate: String(row.eventDate || ""),
      startTime: row.startTime || null,
      endTime: row.endTime || null,
      location: row.location || "",
      notes: row.notes || "",
    }));
    const records = recordsResult.rows.map((row) => {
      const appointmentStatus = String(row.status || "").trim().toUpperCase();
      const historyStatus = appointmentStatus === "CANCELLED"
        ? "CANCELLED"
        : row.finishedAt
          ? "COMPLETED"
          : appointmentStatus;
      return {
      appointmentID: Number(row.appointmentID),
      status: historyStatus,
      requestType: Number(row.s_sacramentID) > 0 ? "Special Program" : (row.requestType || "Appointment"),
      requestCategory: Number(row.s_sacramentID) > 0 ? "special_program" : "appointment",
      s_sacramentID: Number(row.s_sacramentID) > 0 ? Number(row.s_sacramentID) : null,
      requesterFullName: row.requesterFullName || "Unknown requester",
      credentials: row.credentials && typeof row.credentials === "object" ? row.credentials : {},
      note: row.note || "",
      createdAt: row.createdAt || null,
      finishedAt: row.finishedAt || null,
      sacramentName: row.sacramentName || "Assigned Schedule",
      scheduledEventDateTime: row.scheduledEventDateTime || null,
      progressUpdatedAt: row.progressUpdatedAt || null,
      eventDone: Boolean(row.eventDone),
      priestComments: row.priestComments || "",
      secretaryRemarks: row.secretaryRemarks || "",
      remarkStatus: row.remarkStatus || "awaiting_remarks",
      priestRemarks: row.priestRemarks || "",
      remarkSentAt: row.remarkSentAt || null,
      remarkUpdatedAt: row.remarkUpdatedAt || null,
    };
    });

    const totalSchedules = schedules.length;
    const completedSchedules = schedules.filter((entry) => String(entry.eventDate || "") < todayKey).length;
    const upcomingSchedules = Math.max(0, totalSchedules - completedSchedules);
    const totalRecords = records.length;
    const completedRecords = records.filter((entry) => entry.status === "COMPLETED").length;
    const cancelledRecords = records.filter((entry) => entry.status === "CANCELLED").length;
    const pendingRecords = Math.max(0, totalRecords - completedRecords - cancelledRecords);

    return res.json({
      priest: context.priest,
      stats: {
        totalSchedules,
        upcomingSchedules,
        completedSchedules,
        totalRecords,
        completedRecords,
        pendingRecords,
      },
      schedules,
      records,
    });
  } catch (error) {
    console.error("Priest dashboard fetch error:", error);
    return res.status(500).json({ message: "Unable to load priest dashboard." });
  }
});

app.get("/priest/me/sacramental-calendar", async (req, res) => {
  try {
    const priestID = Number(req.query?.priestID);
    const userID = Number(req.query?.userID);
    const scope = String(req.query?.scope || "mine").trim().toLowerCase();
    const targetPriestID = Number(req.query?.targetPriestID);
    if ((!Number.isInteger(priestID) || priestID <= 0) && (!Number.isInteger(userID) || userID <= 0)) {
      return res.status(400).json({ message: "A valid priestID or userID is required." });
    }

    const context = await resolvePriestContextFromRequest(req);
    if (!context) {
      return res.status(404).json({ message: "Priest account not found for this login." });
    }
    if (context.priest.isActive === false) {
      return res.status(403).json({ message: "Priest account is inactive. Please contact the parish secretary." });
    }

    let filterPriestID = context.priest.priestID;
    if (scope === "all") {
      filterPriestID = null;
    } else if (scope === "priest") {
      if (!Number.isInteger(targetPriestID) || targetPriestID <= 0) {
        return res.status(400).json({ message: "A valid targetPriestID is required for priest scope." });
      }
      filterPriestID = targetPriestID;
    }

    await ensureAppointmentCalendarEntriesForAdmin(context.priest.adminID);

    const [eventsResult, priestsResult] = await Promise.all([
      query(
        `
          SELECT
            ce."calendarID" AS "calendarEntryID",
            ce."calendarID" AS id,
            ce.title,
            ce."scheduleType" AS "scheduleType",
            ce."eventDate"::text AS "eventDate",
            ce."startTime" AS "startTime",
            ce."endTime" AS "endTime",
            ce.location,
            ce.notes,
            ce."priestID",
            ce."appointmentID",
            ce."s_sacramentID",
            ce.occupied_slots AS "occupiedSlots",
            ce.sacrament_name AS "resolvedSacramentName",
            ce.requester_full_name AS "requesterFullName",
            ce.request_type AS "requestType",
            p."fullName" AS "priestName",
            p."clergyType",
            p."religiousOrderCode",
            CASE
              WHEN ce."scheduleType" = 'parish_event' THEN COALESCE(NULLIF(TRIM(ce.title), ''), 'Parish Event')
              ELSE COALESCE(ss."s_sacramentName", ce.title, 'Priest Schedule')
            END AS "sacramentName"
          FROM calendar_entries_resolved ce
          LEFT JOIN priests p ON p."priestID" = ce."priestID"
          LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = ce."s_sacramentID"
          WHERE ce."adminID" = $1
            AND ce."scheduleType" IN ('priest_schedule', 'parish_event', 'priest_activity')
            AND ${calendarEntryHasActivePriestSql()}
            AND ($2::INT IS NULL OR ce."priestID" = $2 OR ce."scheduleType" = 'parish_event')
            AND (
              ce."appointmentID" IS NOT NULL
              OR ce."scheduleType" = 'parish_event'
              OR (p."priestID" IS NOT NULL AND COALESCE(p."isActive", TRUE) = TRUE)
            )
          ORDER BY ce."eventDate" ASC, ce."startTime" ASC NULLS FIRST, ce."calendarID" ASC
        `,
        [context.priest.adminID, filterPriestID],
      ),
      query(
        `
          SELECT
            p."priestID",
            p."fullName",
            p.email
          FROM priests p
          WHERE p."adminID" = $1
            AND COALESCE(p."isActive", TRUE) = TRUE
          ORDER BY LOWER(TRIM(COALESCE(p."fullName", ''))) ASC, p."priestID" ASC
        `,
        [context.priest.adminID],
      ),
    ]);

    return res.json({
      events: eventsResult.rows.map((row) => ({
        scheduleType: String(row.scheduleType || "").trim().toLowerCase() || "priest_schedule",
        calendarEntryID: Number(row.calendarEntryID),
        id: Number(row.id),
        title: row.title || (String(row.scheduleType || "").trim().toLowerCase() === "parish_event" ? "Parish Event" : "Priest Schedule"),
        sacramentName:
          row.resolvedSacramentName ||
          row.sacramentName ||
          row.title ||
          (String(row.scheduleType || "").trim().toLowerCase() === "parish_event" ? "Parish Event" : "Priest Schedule"),
        requesterFullName: String(row.requesterFullName || "").trim() || null,
        requestType: String(row.requestType || "").trim() || null,
        eventDate: String(row.eventDate || ""),
        startTime: row.startTime || null,
        endTime: row.endTime || null,
        occupiedSlots:
          String(row.scheduleType || "").trim().toLowerCase() === "priest_activity"
            ? normalizeOccupiedSlots(row.occupiedSlots, null, null)
            : normalizeOccupiedSlots(row.occupiedSlots, row.startTime, row.endTime),
        location: row.location || "",
        note: row.notes || "",
        notes: row.notes || "",
        priestID: Number.isInteger(Number(row.priestID)) ? Number(row.priestID) : null,
        priestName: String(row.priestName || "").trim(),
        clergyType: String(row.clergyType || "").trim() || null,
        religiousOrderCode: String(row.religiousOrderCode || "").trim() || null,
        appointmentID: Number.isInteger(Number(row.appointmentID)) && Number(row.appointmentID) > 0
          ? Number(row.appointmentID)
          : null,
        s_sacramentID: Number.isInteger(Number(row.s_sacramentID)) && Number(row.s_sacramentID) > 0
          ? Number(row.s_sacramentID)
          : null,
      })),
      priests: priestsResult.rows.map((row) => ({
        priestID: Number(row.priestID),
        fullName: row.fullName || "Priest",
        email: row.email || null,
      })),
    });
  } catch (error) {
    console.error("Priest calendar fetch error:", error);
    return res.status(500).json({ message: "Unable to load priest calendar." });
  }
});

const getAssignedScheduleRequesterName = (row, isParishEvent) => {
  if (isParishEvent) return "";
  const direct = String(row.requesterFullName || "").trim();
  if (direct) return direct;
  const credentials = row.credentials && typeof row.credentials === "object" ? row.credentials : {};
  const groomName = String(credentials.groomName || credentials.groomFullName || "").trim();
  const brideName = String(credentials.brideName || credentials.brideFullName || "").trim();
  if (groomName && brideName) return `${groomName} & ${brideName}`;
  return String(
    resolveChildDisplayName(credentials) ||
      credentials.deceasedName ||
      credentials.deceasedFullName ||
      credentials.childFullName ||
      credentials.fullName ||
      credentials.blessingTarget ||
      "",
  ).trim();
};

const getAssignedScheduleContactNumber = (row) => {
  const credentials = row.credentials && typeof row.credentials === "object" ? row.credentials : {};
  return String(
    row.contactNumber ||
      credentials.phoneNumber ||
      credentials.contactNumber ||
      credentials.phone ||
      credentials.mobileNumber ||
      "",
  ).trim();
};

const getAssignedScheduleLocationLabel = ({ isParishEvent, location, title, sacramentName }) => {
  if (isParishEvent) return "Parish";
  const raw = String(location || "").trim();
  if (!raw) return "Parish";
  const normalized = raw.toLowerCase();
  const titleNorm = String(title || "").trim().toLowerCase();
  const sacramentNorm = String(sacramentName || "").trim().toLowerCase();
  if (
    normalized === "parish" ||
    normalized === "parish schedule" ||
    normalized === titleNorm ||
    (sacramentNorm && normalized === sacramentNorm)
  ) {
    return "Parish";
  }
  return raw;
};

const sanitizeCalendarDisplayTitle = (title) => {
  const raw = String(title || "").trim();
  const stripped = raw.replace(/^appointment\s*#\s*\d+\s*[-–:]\s*/i, "").trim();
  return stripped || raw;
};

const mapCalendarEntryForParishOffice = (row) => {
  const rawScheduleType = String(row.scheduleType || "").trim().toLowerCase();
  const isParishEvent = rawScheduleType === "parish_event";
  const isPriestActivity = rawScheduleType === "priest_activity";
  const appointmentID = Number(row.appointmentID);
  const hasAppointment = Number.isInteger(appointmentID) && appointmentID > 0;
  const sacramentName = String(row.sacramentName || row.s_sacramentName || "").trim();
  const displayTitle =
    sanitizeCalendarDisplayTitle(row.title || sacramentName || "") ||
    (isParishEvent ? "Parish Event" : isPriestActivity ? "Priest Unavailability" : hasAppointment ? "Appointment" : "Priest Schedule");
  const timing = getAssignedScheduleTiming(row.daysUntil);
  const statusKey =
    timing.timingKey === "today" ? "today" : timing.timingKey === "past" ? "past" : timing.timingKey === "unscheduled" ? "unknown" : "upcoming";
  const statusLabel =
    statusKey === "today" ? "Today" : statusKey === "past" ? "Completed" : statusKey === "unknown" ? "Date not set" : "Upcoming";
  return {
    ...row,
    id: Number(row.calendarID ?? row.id),
    title: displayTitle,
    displayTitle,
    sacramentName,
    occupiedSlots: isPriestActivity
      ? normalizeOccupiedSlots(row.occupiedSlots, null, null)
      : normalizeOccupiedSlots(row.occupiedSlots, row.startTime, row.endTime),
    notes: sanitizeCalendarDisplayNotes(row.notes) || null,
    locationLabel: getAssignedScheduleLocationLabel({
      isParishEvent,
      location: row.location,
      title: displayTitle,
      sacramentName,
    }),
    requesterFullName: String(row.requesterFullName || "").trim(),
    daysUntil: timing.daysUntil,
    timingKey: timing.timingKey,
    timingLabel: timing.timingLabel,
    statusKey,
    statusLabel,
    kind: isParishEvent ? "parish_event" : isPriestActivity ? "priest_activity" : hasAppointment ? "appointment" : "priest_schedule",
    kindLabel: isParishEvent ? "Parish Event" : isPriestActivity ? "Priest Unavailability" : hasAppointment ? "Appointment" : "Priest Schedule",
  };
};

const sanitizeCalendarDisplayNotes = (notes) => {
  const cleaned = String(notes || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (/auto-generated from progress tracker/i.test(cleaned)) return "";
  const normalized = cleaned.toLowerCase().replace(/[.:!]+$/g, "");
  if (normalized === "yes" || normalized === "y") return "";
  return cleaned;
};

const getAssignedScheduleTiming = (daysUntilRaw) => {
  if (daysUntilRaw === null || daysUntilRaw === undefined || Number.isNaN(Number(daysUntilRaw))) {
    return { daysUntil: null, timingKey: "unscheduled", timingLabel: "Date not set" };
  }
  const daysUntil = Number(daysUntilRaw);
  if (daysUntil === 0) return { daysUntil, timingKey: "today", timingLabel: "Today" };
  if (daysUntil === 1) return { daysUntil, timingKey: "tomorrow", timingLabel: "Tomorrow" };
  if (daysUntil === -1) return { daysUntil, timingKey: "past", timingLabel: "Yesterday" };
  if (daysUntil < 0) return { daysUntil, timingKey: "past", timingLabel: `${Math.abs(daysUntil)} days ago` };
  return { daysUntil, timingKey: "upcoming", timingLabel: `In ${daysUntil} days` };
};

app.get("/priest/me/assigned-schedules", async (req, res) => {
  try {
    const priestID = Number(req.query?.priestID);
    const userID = Number(req.query?.userID);
    if ((!Number.isInteger(priestID) || priestID <= 0) && (!Number.isInteger(userID) || userID <= 0)) {
      return res.status(400).json({ message: "A valid priestID or userID is required." });
    }

    const context = await resolvePriestContextFromRequest(req);
    if (!context) {
      return res.status(404).json({ message: "Priest account not found for this login." });
    }
    if (context.priest.isActive === false) {
      return res.status(403).json({ message: "Priest account is inactive. Please contact the parish secretary." });
    }

    const requestedType = String(req.query?.type || "").trim().toLowerCase();
    const typeFilter = requestedType === "parish_event" || requestedType === "priest_schedule" ? requestedType : null;
    const requestedSort = String(req.query?.sort || "upcoming").trim().toLowerCase();
    const sortOldest = requestedSort === "oldest";
    const sortUpcoming = requestedSort === "upcoming";
    const orderDirection = sortOldest ? "ASC" : "DESC";
    const dateOrder = sortUpcoming
      ? `COALESCE(ce."eventDate", (program_sacrament."timeDate")::date) ASC NULLS LAST, COALESCE(ce."startTime", to_char(program_sacrament."timeDate", 'HH24:MI:SS')) ASC NULLS LAST, ce."calendarID" ASC`
      : `ce."createdAt" ${orderDirection} NULLS LAST, ce."calendarID" ${orderDirection}`;

    const result = await query(
      `
        SELECT
          ce."calendarID" AS "calendarEntryID",
          COALESCE(NULLIF(BTRIM(program_sacrament."s_sacramentName"), ''), NULLIF(BTRIM(ce.title), '')) AS "calendarTitle",
          COALESCE(ce."eventDate", (program_sacrament."timeDate")::date)::text AS "eventDate",
          COALESCE(ce."startTime", to_char(program_sacrament."timeDate", 'HH24:MI:SS')) AS "startTime",
          ce."endTime" AS "endTime",
          ce.location,
          ce.notes,
          ce."scheduleType" AS "scheduleType",
          ce."s_sacramentID",
          program_sacrament."occupiedSlots",
          ce."createdAt" AS "assignedAt",
          ce."updatedAt",
          CASE
            WHEN COALESCE(ce."eventDate", (program_sacrament."timeDate")::date) IS NULL THEN NULL
            ELSE (COALESCE(ce."eventDate", (program_sacrament."timeDate")::date) - ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date))
          END AS "daysUntil",
          linked_appointment."appointmentID",
          linked_appointment.status,
          linked_appointment."requestType",
          linked_appointment."requesterFullName",
          linked_appointment.credentials,
          linked_appointment.note,
          linked_appointment."createdAt" AS "appointmentCreatedAt",
          linked_appointment."finishedAt",
          linked_appointment."scheduledEventDateTime",
          linked_appointment."priestComments",
          linked_appointment."contactNumber",
          COALESCE(linked_appointment."sacramentName", program_sacrament."s_sacramentName") AS "sacramentName",
          psr.status AS "remarkStatus",
          psr.remarks AS "priestRemarks",
          psr."sentAt" AS "remarkSentAt",
          psr."updatedAt" AS "remarkUpdatedAt",
          psr."reviewedBySecretary",
          psr."reviewedAt"
        FROM calendar_entries ce
        LEFT JOIN special_sacraments program_sacrament
          ON program_sacrament."s_sacramentID" = ce."s_sacramentID"
        LEFT JOIN LATERAL (
          SELECT
            a."appointmentID",
            a.status,
            CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
            a."requesterFullName",
            a.credentials,
            a.note,
            a."createdAt",
            a."finishedAt",
            pt."scheduledEventDateTime",
            pt."priestComments",
            NULLIF(BTRIM(COALESCE(
              a.credentials->>'phoneNumber',
              a.credentials->>'contactNumber',
              a.credentials->>'phone',
              a.credentials->>'mobileNumber',
              ''
            )), '') AS "contactNumber",
            COALESCE(ss."s_sacramentName", s."sacramentName") AS "sacramentName"
          FROM appointments a
          LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
          LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
          LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
          WHERE a."appointmentID" = ce."appointmentID"
            AND a."isArchived" = FALSE
          LIMIT 1
        ) linked_appointment ON TRUE
        LEFT JOIN priest_schedule_remarks psr
          ON psr."calendarEntryID" = ce."calendarID"
          AND psr."priestID" = COALESCE(ce."priestID", program_sacrament."priestID")
        WHERE ce."adminID" = $1
          AND COALESCE(ce."priestID", program_sacrament."priestID") = $2
          AND ce."scheduleType" IN ('priest_schedule', 'parish_event')
          AND ${calendarEntryHasActivePriestSql()}
          AND ($3::text IS NULL OR ce."scheduleType" = $3)
        ORDER BY
          CASE
            WHEN NULLIF(BTRIM(COALESCE(psr.remarks, '')), '') IS NULL AND psr."remarkID" IS NULL THEN 0
            ELSE 1
          END ASC,
          ${dateOrder}
      `,
      [context.priest.adminID, context.priest.priestID, typeFilter],
    );

    const schedules = result.rows.map((row) => {
      const reviewedBySecretaryRaw = row.reviewedBySecretary ?? row.reviewedbysecretary ?? false;
      const reviewedAtRaw = row.reviewedAt ?? row.reviewedat ?? null;
      const remarkStatusRaw = String(row.remarkStatus ?? row.remarkstatus ?? "").trim().toLowerCase();
      const rawScheduleType = String(row.scheduleType || "").trim().toLowerCase();
      const isParishEvent = rawScheduleType === "parish_event";
      const isSpecialProgram = Number(row.s_sacramentID) > 0;
      const isReviewedBySecretary =
        Boolean(reviewedBySecretaryRaw) || remarkStatusRaw === "reviewed_by_secretary";
      const priestRemarks = String(row.priestRemarks || "").trim();
      const hasRemarks = Boolean(priestRemarks) || remarkStatusRaw === "remarks_sent" || isReviewedBySecretary;
      const remarkStatus = isReviewedBySecretary
        ? "reviewed_by_secretary"
        : hasRemarks
          ? "remarks_sent"
          : "awaiting_remarks";
      const timing = getAssignedScheduleTiming(row.daysUntil);
      const sacramentName = String(row.sacramentName || "").trim();
      const typeLabel = isSpecialProgram ? "Special Program" : isParishEvent ? "Parish Event" : "Priest Schedule";
      const title = row.calendarTitle || sacramentName || (isSpecialProgram ? "Special Program" : isParishEvent ? "Parish Event" : "Assigned Sacramental Schedule");
      const locationLabel = getAssignedScheduleLocationLabel({
        isParishEvent,
        location: row.location,
        title,
        sacramentName,
      });
      const occupiedSlots = normalizeOccupiedSlots(row.occupiedSlots, row.startTime, row.endTime);
      return {
        id: Number(row.calendarEntryID),
        appointmentID:
          row.appointmentID === null || row.appointmentID === undefined
            ? null
            : Number.isInteger(Number(row.appointmentID))
              ? Number(row.appointmentID)
              : null,
        sSacramentID: Number.isInteger(Number(row.s_sacramentID)) && Number(row.s_sacramentID) > 0
          ? Number(row.s_sacramentID)
          : null,
        title,
        sacramentName,
        scheduleType: rawScheduleType || "priest_schedule",
        typeLabel,
        eventDate: String(row.eventDate || "").trim(),
        startTime: occupiedSlots[0]?.startTime || row.startTime || null,
        endTime: occupiedSlots[occupiedSlots.length - 1]?.endTime || row.endTime || null,
        occupiedSlots,
        location: isParishEvent ? null : row.location || "",
        locationLabel,
        daysUntil: timing.daysUntil,
        timingKey: timing.timingKey,
        timingLabel: timing.timingLabel,
        note: sanitizeCalendarDisplayNotes(row.notes || row.note || ""),
        status: isParishEvent ? "PARISH_EVENT" : String(row.status || "CONFIRMED").trim().toUpperCase(),
        requesterFullName: getAssignedScheduleRequesterName(row, isParishEvent),
        contactNumber: getAssignedScheduleContactNumber(row),
        credentials: row.credentials && typeof row.credentials === "object" ? row.credentials : {},
        assignedAt: row.assignedAt || null,
        createdAt: row.assignedAt || row.appointmentCreatedAt || null,
        finishedAt: row.finishedAt || null,
        scheduledEventDateTime: row.scheduledEventDateTime || null,
        priestComments: row.priestComments || "",
        hasRemarks,
        remarkStatus,
        remarkStatusLabel: isReviewedBySecretary ? "Reviewed" : hasRemarks ? "Remarks Sent" : "Needs Remarks",
        priestRemarks,
        remarkSentAt: row.remarkSentAt || null,
        remarkUpdatedAt: row.remarkUpdatedAt || null,
        reviewedBySecretary: isReviewedBySecretary,
        reviewedAt: reviewedAtRaw || null,
      };
    });

    return res.json({
      summary: {
        totalAssigned: schedules.length,
        awaitingRemarks: schedules.filter((entry) => !entry.hasRemarks).length,
        remarksSent: schedules.filter((entry) => entry.hasRemarks).length,
        reviewed: schedules.filter((entry) => entry.reviewedBySecretary).length,
      },
      schedules,
    });
  } catch (error) {
    console.error("Priest assigned schedules fetch error:", error);
    return res.status(500).json({ message: "Unable to load assigned appointments." });
  }
});

app.post("/priest/me/assigned-schedules/:scheduleID/remarks", async (req, res) => {
  try {
    const priestID = Number(req.query?.priestID ?? req.body?.priestID);
    const userID = Number(req.query?.userID ?? req.body?.userID);
    const scheduleID = Number(req.params.scheduleID);
    const remarks = String(req.body?.remarks || "").trim();
    if ((!Number.isInteger(priestID) || priestID <= 0) && (!Number.isInteger(userID) || userID <= 0)) {
      return res.status(400).json({ message: "A valid priestID or userID is required." });
    }
    if (!Number.isInteger(scheduleID) || scheduleID <= 0) {
      return res.status(400).json({ message: "A valid schedule ID is required." });
    }
    if (!remarks) {
      return res.status(400).json({ message: "Please enter your remarks before sending." });
    }

    const context = await resolvePriestContextFromRequest(req);
    if (!context) {
      return res.status(404).json({ message: "Priest account not found for this login." });
    }
    if (context.priest.isActive === false) {
      return res.status(403).json({ message: "Priest account is inactive. Please contact the parish secretary." });
    }

    const scheduleResult = await query(
      `
        SELECT
          ce."calendarID" AS id,
          ce.title,
          ce."appointmentID",
          ce."eventDate"::text AS "eventDate",
          COALESCE(s."sacramentName", ss."s_sacramentName", ce.title, 'Assigned schedule') AS "serviceName"
        FROM calendar_entries ce
        LEFT JOIN appointments a ON a."appointmentID" = ce."appointmentID"
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = COALESCE(a."s_sacramentID", ce."s_sacramentID")
        WHERE ce."calendarID" = $1
          AND ce."adminID" = $2
          AND COALESCE(ce."priestID", ss."priestID") = $3
        LIMIT 1
      `,
      [scheduleID, context.priest.adminID, context.priest.priestID],
    );
    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ message: "Assigned schedule not found for this priest account." });
    }
    const scheduleRow = scheduleResult.rows[0];
    const existingRemarkResult = await query(
      `
        SELECT "remarkID"
        FROM priest_schedule_remarks
        WHERE "calendarEntryID" = $1
          AND "priestID" = $2
        LIMIT 1
      `,
      [scheduleID, context.priest.priestID],
    );
    const isRemarkUpdate = existingRemarkResult.rows.length > 0;

    const upsertResult = await query(
      `
        INSERT INTO priest_schedule_remarks (
          "calendarEntryID",
          "priestID",
          remarks,
          status,
          "adminID",
          "sentAt",
          "createdAt",
          "updatedAt",
          "reviewedBySecretary",
          "reviewedAt"
        )
        VALUES ($1, $2, $3, 'remarks_sent', $4, NOW(), NOW(), NOW(), FALSE, NULL)
        ON CONFLICT ("calendarEntryID", "priestID")
        DO UPDATE
        SET
          remarks = EXCLUDED.remarks,
          status = 'remarks_sent',
          "adminID" = EXCLUDED."adminID",
          "sentAt" = NOW(),
          "updatedAt" = NOW(),
          "reviewedBySecretary" = FALSE,
          "reviewedAt" = NULL
        RETURNING
          "remarkID",
          "calendarEntryID",
          "priestID",
          remarks,
          status,
          "sentAt",
          "updatedAt",
          "reviewedBySecretary",
          "reviewedAt"
      `,
      [scheduleID, context.priest.priestID, remarks, context.priest.adminID],
    );
    const savedRemark = upsertResult.rows[0] || null;
    const serviceName = sanitizeCalendarDisplayTitle(scheduleRow.serviceName || scheduleRow.title || "assigned schedule");
    const priestName = String(context.priest.fullName || "The assigned priest").trim() || "The assigned priest";
    const appointmentID = Number(scheduleRow.appointmentID);
    const remarkID = Number(savedRemark?.remarkID);
    const adminPath = buildAdminPriestManagementPath({
      priestID: context.priest.priestID,
      scheduleID,
      remarkID,
      appointmentID,
      view: "remarks",
    });

    try {
      await createAdminNotification({
        adminID: context.priest.adminID,
        type: isRemarkUpdate ? "priest_remark_updated" : "priest_remark_sent",
        title: isRemarkUpdate ? "Priest remarks updated" : "Priest remarks received",
        body: isRemarkUpdate
          ? `${priestName} updated remarks for ${serviceName}.`
          : `${priestName} sent remarks for ${serviceName}.`,
        severity: "info",
        metadata: {
          path: adminPath,
          priestID: context.priest.priestID,
          calendarEntryID: scheduleID,
          appointmentID: Number.isInteger(appointmentID) && appointmentID > 0 ? appointmentID : null,
          remarkID: Number.isInteger(remarkID) && remarkID > 0 ? remarkID : null,
          action: isRemarkUpdate ? "updated" : "sent",
        },
      });
    } catch (notificationError) {
      console.error("Priest remarks admin notification error:", notificationError);
    }

    return res.status(201).json({
      message: "Remarks sent to parish secretary successfully.",
      remark: savedRemark,
    });
  } catch (error) {
    console.error("Priest schedule remarks save error:", error);
    return res.status(500).json({ message: "Unable to send remarks right now." });
  }
});

const PRIEST_SCHEDULE_NOTE_STATUSES = ["pending", "scheduled", "reviewed"];

const mapPriestScheduleNoteRow = (row) => ({
  noteID: Number(row.noteID),
  priestID: Number(row.priestID),
  priestName: String(row.priestName || "").trim(),
  adminID: Number(row.adminID),
  noteDate: String(row.noteDate || "").slice(0, 10),
  coverageKind: ["day", "range", "week", "month"].includes(row.coverageKind) ? row.coverageKind : "day",
  coverageDates: (Array.isArray(row.coverageDates)
    ? row.coverageDates
    : typeof row.coverageDates === "string"
      ? JSON.parse(row.coverageDates || "[]")
      : []
  ).map((value) => String(value || "").slice(0, 10)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  occupiedSlots: normalizeOccupiedSlots(row.occupiedSlots, null, null),
  reason: String(row.reason || "").trim(),
  message: String(row.message || "").trim(),
  status: PRIEST_SCHEDULE_NOTE_STATUSES.includes(row.status) ? row.status : "pending",
  calendarEntryID: Number(row.calendarEntryID) > 0 ? Number(row.calendarEntryID) : null,
  reviewedAt: row.reviewedAt || null,
  createdAt: row.createdAt || null,
  updatedAt: row.updatedAt || null,
});

const PRIEST_SCHEDULE_NOTE_SELECT_SQL = `
  SELECT
    n."noteID",
    n."priestID",
    p."fullName" AS "priestName",
    n."adminID",
    n."noteDate"::text AS "noteDate",
    n."coverageKind",
    n."coverageDates",
    n."occupiedSlots",
    n.reason,
    n.message,
    n.status,
    n."calendarEntryID",
    n."reviewedAt",
    n."createdAt",
    n."updatedAt"
  FROM priest_schedule_notes n
  LEFT JOIN priests p ON p."priestID" = n."priestID"
`;

const formatNoteSlotsLabel = (slots) => {
  const ranges = [];
  normalizeOccupiedSlots(slots, null, null).forEach((slot) => {
    const last = ranges[ranges.length - 1];
    if (last && last.endTime === slot.startTime) {
      last.endTime = slot.endTime;
      return;
    }
    ranges.push({ ...slot });
  });
  const toLabel = (value) => {
    const minutes = toMinutes(value);
    if (minutes === null) return value;
    const hours = Math.floor(minutes / 60);
    const suffix = hours >= 12 ? "PM" : "AM";
    return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
  };
  return ranges.map((range) => `${toLabel(range.startTime)} - ${toLabel(range.endTime)}`).join(", ");
};

const formatNoteDateLabel = (dateKey) => {
  const parsed = new Date(`${String(dateKey || "").slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(dateKey || "");
  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

app.get("/priest/me/schedule-notes", async (req, res) => {
  try {
    const context = await resolvePriestContextFromRequest(req);
    if (!context) {
      return res.status(404).json({ message: "Priest account not found for this login." });
    }
    const result = await query(
      `${PRIEST_SCHEDULE_NOTE_SELECT_SQL}
        WHERE n."priestID" = $1
        ORDER BY n."noteDate" DESC, n."createdAt" DESC`,
      [context.priest.priestID],
    );
    return res.json({ notes: result.rows.map(mapPriestScheduleNoteRow) });
  } catch (error) {
    console.error("Priest schedule notes fetch error:", error);
    return res.status(500).json({ message: "Unable to load your schedule notes." });
  }
});

app.post("/priest/me/schedule-notes", async (req, res) => {
  try {
    const context = await resolvePriestContextFromRequest(req);
    if (!context) {
      return res.status(404).json({ message: "Priest account not found for this login." });
    }
    if (context.priest.isActive === false) {
      return res.status(403).json({ message: "Priest account is inactive. Please contact the parish secretary." });
    }
    const coverageKind = ["day", "range", "week", "month"].includes(req.body?.coverageKind) ? req.body.coverageKind : "day";
    const requestedDates = (Array.isArray(req.body?.noteDates) ? req.body.noteDates : [req.body?.noteDate])
      .map((value) => String(value || "").trim().slice(0, 10))
      .filter((value, index, list) => /^\d{4}-\d{2}-\d{2}$/.test(value) && list.indexOf(value) === index)
      .sort();
    const noteDate = requestedDates[0] || "";
    const reason = String(req.body?.reason || "").trim().slice(0, 120);
    const message = String(req.body?.message || "").trim().slice(0, 1000);
    const occupiedSlots = normalizeOccupiedSlots(req.body?.occupiedSlots, null, null);
    if (!requestedDates.length) {
      return res.status(400).json({ message: "Please choose a valid date." });
    }
    if (requestedDates.some((value) => value < getLocalDateKey(new Date()))) {
      return res.status(400).json({ message: "You can only send a note for today or a future date." });
    }
    if (requestedDates.length > 31) {
      return res.status(400).json({ message: "A note can cover up to 31 days." });
    }
    if (!reason) {
      return res.status(400).json({ message: "Please select or type a reason." });
    }
    if (!occupiedSlots.length) {
      return res.status(400).json({ message: "Pick at least one time slot." });
    }
    if (requestedDates.length === 1) {
      for (const slot of occupiedSlots) {
        const closureConflict = await findParishClosureConflict({
          adminID: context.priest.adminID,
          dateKey: noteDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
        if (closureConflict) {
          return res.status(400).json({ message: closureConflict });
        }
      }
    }

    const scheduleConflict = await findPriestNoteScheduleConflict({
      priestID: context.priest.priestID,
      adminID: context.priest.adminID,
      dates: requestedDates,
      occupiedSlots,
    });
    if (scheduleConflict) {
      return res.status(409).json({ message: scheduleConflict });
    }

    const insertResult = await query(
      `
        INSERT INTO priest_schedule_notes ("priestID", "adminID", "noteDate", "coverageKind", "coverageDates", "occupiedSlots", reason, message)
        VALUES ($1, $2, $3::date, $4, $5::jsonb, $6::jsonb, $7, NULLIF($8, ''))
        RETURNING "noteID"
      `,
      [
        context.priest.priestID,
        context.priest.adminID,
        noteDate,
        coverageKind,
        JSON.stringify(requestedDates),
        JSON.stringify(occupiedSlots),
        reason,
        message,
      ],
    );
    const noteID = Number(insertResult.rows[0]?.noteID);
    const savedResult = await query(`${PRIEST_SCHEDULE_NOTE_SELECT_SQL} WHERE n."noteID" = $1`, [noteID]);
    const savedNote = savedResult.rows[0] ? mapPriestScheduleNoteRow(savedResult.rows[0]) : null;

    const priestName = String(context.priest.fullName || "A priest").trim() || "A priest";
    try {
      await createAdminNotification({
        adminID: context.priest.adminID,
        type: "priest_schedule_note",
        title: "Priest schedule note",
        body: `${priestName} sent a ${coverageKind === "month" ? "month" : coverageKind === "week" ? "week" : coverageKind === "range" ? "date range" : "day"} unavailability request for ${
          requestedDates.length > 1
            ? `${formatNoteDateLabel(requestedDates[0])} to ${formatNoteDateLabel(requestedDates[requestedDates.length - 1])} (${requestedDates.length} days)`
            : formatNoteDateLabel(noteDate)
        } (${formatNoteSlotsLabel(occupiedSlots)}): ${reason}.`,
        severity: "warning",
        metadata: {
          path: `/admin/dashboard?date=${noteDate}`,
          priestID: context.priest.priestID,
          noteID,
          noteDate,
        },
      });
    } catch (notificationError) {
      console.error("Priest schedule note admin notification error:", notificationError);
    }

    return res.status(201).json({ message: "Your note was sent to the parish office.", note: savedNote });
  } catch (error) {
    console.error("Priest schedule note save error:", error);
    return res.status(500).json({ message: "Unable to send your note right now." });
  }
});

app.delete("/priest/me/schedule-notes/:noteID", async (req, res) => {
  try {
    const context = await resolvePriestContextFromRequest(req);
    if (!context) {
      return res.status(404).json({ message: "Priest account not found for this login." });
    }
    const noteID = Number(req.params.noteID);
    if (!Number.isInteger(noteID) || noteID <= 0) {
      return res.status(400).json({ message: "A valid note ID is required." });
    }
    const result = await query(
      `
        DELETE FROM priest_schedule_notes
        WHERE "noteID" = $1
          AND "priestID" = $2
          AND status = 'pending'
        RETURNING "noteID"
      `,
      [noteID, context.priest.priestID],
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ message: "This note was already handled by the parish office and can no longer be withdrawn." });
    }
    return res.json({ message: "Your note was withdrawn.", noteID });
  } catch (error) {
    console.error("Priest schedule note delete error:", error);
    return res.status(500).json({ message: "Unable to withdraw your note right now." });
  }
});

app.get("/schedule-notes", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    const result = await query(
      `${PRIEST_SCHEDULE_NOTE_SELECT_SQL}
        WHERE n."adminID" = $1
        ORDER BY n."noteDate" ASC, n."createdAt" ASC`,
      [adminID],
    );
    return res.json({ notes: result.rows.map(mapPriestScheduleNoteRow) });
  } catch (error) {
    console.error("Schedule notes fetch error:", error);
    return res.status(500).json({ message: "Unable to load priest schedule notes." });
  }
});

app.patch("/schedule-notes/:noteID/review", async (req, res) => {
  try {
    const noteID = Number(req.params.noteID);
    const adminID = Number(req.query?.adminID ?? req.body?.adminID);
    const calendarEntryIDRaw = Number(req.body?.calendarEntryID);
    const calendarEntryID = Number.isInteger(calendarEntryIDRaw) && calendarEntryIDRaw > 0 ? calendarEntryIDRaw : null;
    if (!Number.isInteger(noteID) || noteID <= 0) {
      return res.status(400).json({ message: "A valid note ID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    const nextStatus = calendarEntryID ? "scheduled" : "reviewed";
    const updateResult = await query(
      `
        UPDATE priest_schedule_notes
        SET status = $3,
            "calendarEntryID" = COALESCE($4, "calendarEntryID"),
            "reviewedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE "noteID" = $1
          AND "adminID" = $2
        RETURNING "noteID"
      `,
      [noteID, adminID, nextStatus, calendarEntryID],
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Priest schedule note not found." });
    }
    const savedResult = await query(`${PRIEST_SCHEDULE_NOTE_SELECT_SQL} WHERE n."noteID" = $1`, [noteID]);
    const note = savedResult.rows[0] ? mapPriestScheduleNoteRow(savedResult.rows[0]) : null;

    if (note) {
      try {
        await createPriestNotification({
          priestID: note.priestID,
          type: "priest_schedule_note_reviewed",
          title: nextStatus === "scheduled" ? "Marked unavailable" : "Note reviewed",
          body:
            nextStatus === "scheduled"
              ? `The parish office marked you unavailable on ${formatNoteDateLabel(note.noteDate)} for "${note.reason}".`
              : `The parish office reviewed your note for ${formatNoteDateLabel(note.noteDate)} ("${note.reason}").`,
          severity: "info",
          metadata: { path: `/priest/dashboard?date=${note.noteDate}`, noteID, noteDate: note.noteDate },
        });
      } catch (notificationError) {
        console.error("Priest schedule note priest notification error:", notificationError);
      }
    }

    return res.json({
      message: nextStatus === "scheduled" ? "Priest marked unavailable and note marked as handled." : "Note marked as reviewed.",
      note,
    });
  } catch (error) {
    console.error("Schedule note review error:", error);
    return res.status(500).json({ message: "Unable to update this note right now." });
  }
});

app.get("/priest/me/appointments/:appointmentID/details", async (req, res) => {
  try {
    const priestID = Number(req.query?.priestID);
    const userID = Number(req.query?.userID);
    const appointmentID = Number(req.params.appointmentID);
    if ((!Number.isInteger(priestID) || priestID <= 0) && (!Number.isInteger(userID) || userID <= 0)) {
      return res.status(400).json({ message: "A valid priestID or userID is required." });
    }
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "A valid appointment ID is required." });
    }

    const context = await resolvePriestContextFromRequest(req);
    if (!context) {
      return res.status(404).json({ message: "Priest account not found for this login." });
    }
    if (context.priest.isActive === false) {
      return res.status(403).json({ message: "Priest account is inactive. Please contact the parish secretary." });
    }

    const result = await query(
      `
        SELECT
          a."appointmentID",
          a.status,
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
          a."requesterFullName",
          a.credentials,
          a.note,
          a."createdAt",
          a."finishedAt",
          COALESCE(ss."s_sacramentName", s."sacramentName", 'Assigned Schedule') AS "sacramentName",
          pt."scheduledEventDateTime",
          pt."eventDone",
          pt."priestComments",
          pt."secretaryRemarks"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
        WHERE a."appointmentID" = $1
          AND a."priestID" = $2
        LIMIT 1
      `,
      [appointmentID, context.priest.priestID],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Appointment details not found for this priest." });
    }

    const row = result.rows[0];
    return res.json({
      appointmentID: Number(row.appointmentID),
      status: String(row.status || "").trim().toUpperCase(),
      requestType: row.requestType || "Appointment",
      requesterFullName: row.requesterFullName || "Unknown requester",
      credentials: row.credentials && typeof row.credentials === "object" ? row.credentials : {},
      note: row.note || "",
      createdAt: row.createdAt || null,
      finishedAt: row.finishedAt || null,
      sacramentName: row.sacramentName || "Assigned Schedule",
      scheduledEventDateTime: row.scheduledEventDateTime || null,
      finalDetails: {
        eventDone: Boolean(row.eventDone),
        priestComments: row.priestComments || "",
        secretaryRemarks: row.secretaryRemarks || "",
      },
    });
  } catch (error) {
    console.error("Priest appointment details fetch error:", error);
    return res.status(500).json({ message: "Unable to load appointment details." });
  }
});

app.get("/priests/:id/schedule-remarks", async (req, res) => {
  try {
    const priestID = Number(req.params.id);
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(priestID) || priestID <= 0) {
      return res.status(400).json({ message: "A valid priestID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const summaryResult = await query(
      `
        WITH priest_schedules AS (
          SELECT ce."calendarID"
          FROM calendar_entries_resolved ce
          WHERE ce."adminID" = $2
            AND ce."priestID" = $1
            AND ${calendarEntryHasActivePriestSql()}
            AND LOWER(TRIM(ce."scheduleType")) IN ('priest_schedule', 'parish_event')
        ),
        priest_remarks AS (
          SELECT
            psr."remarkID",
            psr."calendarEntryID",
            COALESCE(psr."reviewedBySecretary", FALSE) AS "reviewedBySecretary"
          FROM priest_schedule_remarks psr
          WHERE psr."priestID" = $1
            AND psr."adminID" = $2
        )
        SELECT
          (SELECT COUNT(*) FROM priest_schedules)::int AS "totalSchedules",
          (SELECT COUNT(*) FROM priest_remarks)::int AS "submittedRemarks",
          GREATEST(
            (SELECT COUNT(*) FROM priest_schedules) - (SELECT COUNT(*) FROM priest_remarks),
            0
          )::int AS "pendingRemarks",
          (SELECT COUNT(*) FROM priest_remarks WHERE "reviewedBySecretary" = FALSE)::int AS "unreviewedRemarks"
      `,
      [priestID, adminID],
    );

    const result = await query(
      `
        SELECT
          psr."remarkID",
          psr."calendarEntryID",
          psr."priestID",
          psr.remarks,
          psr.status,
          psr."sentAt",
          psr."updatedAt",
          psr."reviewedBySecretary",
          psr."reviewedAt",
          ce.title,
          ce."scheduleType" AS "scheduleType",
          ce."eventDate"::text AS "eventDate",
          ce."startTime" AS "startTime",
          ce."endTime" AS "endTime",
          ce.location,
          linked."appointmentID",
          linked."requesterFullName",
          linked."sacramentName"
        FROM priest_schedule_remarks psr
        INNER JOIN calendar_entries ce
          ON ce."calendarID" = psr."calendarEntryID"
        LEFT JOIN LATERAL (
          SELECT
            a."appointmentID",
            a."requesterFullName",
            COALESCE(ss."s_sacramentName", s."sacramentName", ce.title, 'Assigned Schedule') AS "sacramentName"
          FROM appointments a
          LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
          LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
          WHERE a."appointmentID" = ce."appointmentID"
            AND a."isArchived" = FALSE
          LIMIT 1
        ) linked ON TRUE
        WHERE psr."priestID" = $1
          AND psr."adminID" = $2
        ORDER BY
          CASE WHEN COALESCE(psr."reviewedBySecretary", FALSE) = FALSE THEN 0 ELSE 1 END,
          psr."sentAt" DESC,
          psr."remarkID" DESC
      `,
      [priestID, adminID],
    );
    const summaryRow = summaryResult.rows[0] || {};
    return res.json({
      remarks: result.rows.map((row) => ({
        remarkID: Number(row.remarkID),
        calendarEntryID: Number(row.calendarEntryID),
        priestID: Number(row.priestID),
        appointmentID: Number(row.appointmentID) > 0 ? Number(row.appointmentID) : null,
        requesterFullName: String(row.requesterFullName || "").trim(),
        sacramentName: String(row.sacramentName || "").trim(),
        title: row.title || row.sacramentName || "Assigned Schedule",
        scheduleType: String(row.scheduleType || "").trim() || "priest_schedule",
        eventDate: String(row.eventDate || ""),
        startTime: row.startTime || null,
        endTime: row.endTime || null,
        location: row.location || "",
        remarks: row.remarks || "",
        status: row.status || "remarks_sent",
        sentAt: row.sentAt || null,
        updatedAt: row.updatedAt || null,
        reviewedBySecretary: Boolean(row.reviewedBySecretary),
        reviewedAt: row.reviewedAt || null,
      })),
      summary: {
        totalSchedules: Number(summaryRow.totalSchedules) || 0,
        submittedRemarks: Number(summaryRow.submittedRemarks) || 0,
        pendingRemarks: Number(summaryRow.pendingRemarks) || 0,
        unreviewedRemarks: Number(summaryRow.unreviewedRemarks) || 0,
      },
    });
  } catch (error) {
    console.error("Priest schedule remarks fetch error:", error);
    return res.status(500).json({ message: "Unable to load priest remarks." });
  }
});

app.get("/priests/:id/available-slots", async (req, res) => {
  try {
    const appointmentID = Number(req.query?.appointmentID);
    let advanceDays = req.query?.minAdvanceDays;
    if (Number.isInteger(appointmentID) && appointmentID > 0) {
      const appointmentResult = await query(
        `
          SELECT
            s."sacramentName",
            ss."s_sacramentName" AS "specialSacramentName"
          FROM appointments a
          LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
          LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
          WHERE a."appointmentID" = $1
          LIMIT 1
        `,
        [appointmentID],
      );
      if (appointmentResult.rows[0]) {
        advanceDays = await resolveAppointmentScheduleAdvanceDays(
          req.query?.adminID,
          appointmentResult.rows[0],
        );
      }
    }
    const availability = await getPriestDayAvailability({
      priestID: req.params.id,
      adminID: req.query?.adminID,
      dateKey: req.query?.date,
      excludeCalendarEntryID: req.query?.excludeCalendarEntryID,
      durationHours: req.query?.durationHours,
      advanceDays,
    });
    return res.json(availability);
  } catch (error) {
    const status = Number(error?.status);
    if (!Number.isInteger(status) || status < 400 || status >= 500) {
      console.error("Priest available slots fetch error:", error);
      return res.status(500).json({ message: "Unable to load priest availability." });
    }
    return res.status(status).json({ message: error.message || "Unable to load priest availability." });
  }
});

app.patch("/priests/:id/schedule-remarks/:remarkID/review", async (req, res) => {
  try {
    const priestID = Number(req.params.id);
    const remarkID = Number(req.params.remarkID);
    const adminID = Number(req.query?.adminID || req.body?.adminID);
    if (!Number.isInteger(priestID) || priestID <= 0) {
      return res.status(400).json({ message: "A valid priestID is required." });
    }
    if (!Number.isInteger(remarkID) || remarkID <= 0) {
      return res.status(400).json({ message: "A valid remarkID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const updateResult = await query(
      `
        UPDATE priest_schedule_remarks
        SET
          status = 'reviewed_by_secretary',
          "reviewedBySecretary" = TRUE,
          "reviewedAt" = NOW(),
          "updatedAt" = NOW()
        WHERE "remarkID" = $1
          AND "priestID" = $2
          AND "adminID" = $3
        RETURNING
          "remarkID",
          "calendarEntryID",
          "priestID",
          remarks,
          status,
          "sentAt",
          "updatedAt",
          "reviewedBySecretary",
          "reviewedAt"
      `,
      [remarkID, priestID, adminID],
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Priest remark not found." });
    }
    const updatedRemark = updateResult.rows[0];
    const calendarEntryID = Number(updatedRemark.calendarEntryID);
    const scheduleMetaResult = Number.isInteger(calendarEntryID) && calendarEntryID > 0
      ? await query(
          `
            SELECT
              ce.title,
              ce."appointmentID",
              COALESCE(s."sacramentName", ss."s_sacramentName", ce.title, 'assigned schedule') AS "serviceName"
            FROM calendar_entries ce
            LEFT JOIN appointments a ON a."appointmentID" = ce."appointmentID"
            LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
            LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = COALESCE(a."s_sacramentID", ce."s_sacramentID")
            WHERE ce."calendarID" = $1
            LIMIT 1
          `,
          [calendarEntryID],
        )
      : { rows: [] };
    const scheduleMeta = scheduleMetaResult.rows[0] || {};
    const serviceName = sanitizeCalendarDisplayTitle(scheduleMeta.serviceName || scheduleMeta.title || "assigned schedule");
    const appointmentID = Number(scheduleMeta.appointmentID);

    try {
      await createPriestNotification({
        priestID,
        type: "priest_schedule_remark_reviewed",
        title: "Remarks reviewed",
        body: `The parish secretary reviewed your remarks for ${serviceName}.`,
        severity: "success",
        metadata: {
          path: buildPriestAssignedAppointmentsPath({
            scheduleID: calendarEntryID,
            view: "remarked",
          }),
          priestID,
          adminID,
          calendarEntryID: Number.isInteger(calendarEntryID) && calendarEntryID > 0 ? calendarEntryID : null,
          appointmentID: Number.isInteger(appointmentID) && appointmentID > 0 ? appointmentID : null,
          remarkID: Number(updatedRemark.remarkID) || null,
          action: "reviewed_by_secretary",
        },
      });
    } catch (notificationError) {
      console.error("Priest remark review notification error:", notificationError);
    }

    return res.json({
      message: "Priest remark marked as reviewed.",
      remark: updatedRemark,
    });
  } catch (error) {
    console.error("Priest remark review update error:", error);
    return res.status(500).json({ message: "Unable to mark priest remark as reviewed." });
  }
});

app.post("/calendar-entries", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const scheduleType = String(req.body?.scheduleType || "").trim();
    const eventDate = String(req.body?.eventDate || "").trim();
    const startTimeRaw = req.body?.startTime;
    const endTimeRaw = req.body?.endTime;
    let startTime = startTimeRaw === null || startTimeRaw === undefined || String(startTimeRaw).trim() === "" ? null : String(startTimeRaw).trim();
    let endTime = endTimeRaw === null || endTimeRaw === undefined || String(endTimeRaw).trim() === "" ? null : String(endTimeRaw).trim();
    let activitySlots = [];
    const requestedLocation = req.body?.location === null || req.body?.location === undefined ? null : String(req.body.location).trim() || null;
    const notes = req.body?.notes === null || req.body?.notes === undefined ? null : String(req.body.notes).trim() || null;
    const priestIDRaw = Number(req.body?.priestID);
    const priestID = Number.isInteger(priestIDRaw) && priestIDRaw > 0 ? priestIDRaw : null;
    const adminID = Number(req.body?.adminID);
    const sSacramentIDRaw = Number(req.body?.sSacramentID ?? req.body?.s_sacramentID);
    const sSacramentID = Number.isInteger(sSacramentIDRaw) && sSacramentIDRaw > 0 ? sSacramentIDRaw : null;
    const location = scheduleType === "parish_event" ? null : requestedLocation;

    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }
    const linkedAppointmentID = await resolveCalendarAppointmentID({ appointmentID: req.body?.appointmentID });
    if (linkedAppointmentID) {
      const pointer = await restoreAppointmentCalendarEntry(linkedAppointmentID);
      if (!pointer) {
        return res.status(400).json({ message: "Unable to link this appointment to the calendar." });
      }
      const resolvedResult = await query(
        `
          SELECT
            "calendarID" AS id,
            title,
            "scheduleType" AS "scheduleType",
            "eventDate"::text AS "eventDate",
            "startTime" AS "startTime",
            "endTime" AS "endTime",
            location,
            notes,
            "s_sacramentID" AS "sSacramentID",
            "priestID",
            "adminID",
            "appointmentID",
            "createdAt",
            "updatedAt"
          FROM calendar_entries_resolved
          WHERE "calendarID" = $1
          LIMIT 1
        `,
        [pointer.id],
      );
      return res.status(201).json(resolvedResult.rows[0] || pointer);
    }
    if (!title) {
      return res.status(400).json({ message: "Calendar title is required." });
    }
    if (!CALENDAR_SCHEDULE_TYPES.includes(scheduleType)) {
      return res.status(400).json({ message: "scheduleType must be parish_event, priest_schedule, or priest_activity." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return res.status(400).json({ message: "eventDate must be in YYYY-MM-DD format." });
    }
    if (scheduleType === "priest_activity") {
      const activityCheck = assertPriestActivityRequest({
        priestID,
        eventDate,
        startTime,
        endTime,
        occupiedSlots: req.body?.occupiedSlots,
      });
      if (!activityCheck.ok) {
        return res.status(400).json({ message: activityCheck.message });
      }
      activitySlots = activityCheck.occupiedSlots;
      startTime = activityCheck.startTime;
      endTime = activityCheck.endTime;
    }
    if (["parish_event", "priest_schedule"].includes(scheduleType) && !sSacramentID) {
      const scheduleDateCheck = assertProgressScheduleDateAllowed(eventDate, 0);
      if (!scheduleDateCheck.ok) {
        return res.status(400).json({ message: scheduleDateCheck.message });
      }
    }
    if (["parish_event", "priest_schedule"].includes(scheduleType) && !Number.isInteger(priestID)) {
      return res.status(400).json({ message: "Please select the priest who will conduct this event." });
    }
    if (scheduleType === "priest_schedule" && !sSacramentID && !location) {
      return res.status(400).json({ message: "Please enter the location. Priest schedules are held outside the parish." });
    }

    const startMinutes = startTime ? toMinutes(startTime) : null;
    const endMinutes = endTime ? toMinutes(endTime) : null;
    if (startTime && startMinutes === null) {
      return res.status(400).json({ message: "Invalid start time format." });
    }
    if (endTime && endMinutes === null) {
      return res.status(400).json({ message: "Invalid end time format." });
    }
    if ((startTime && !endTime) || (!startTime && endTime)) {
      return res.status(400).json({ message: "Both start and end time are required together." });
    }
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      return res.status(400).json({ message: "End time must be later than start time." });
    }
    if (["parish_event", "priest_schedule"].includes(scheduleType) && !sSacramentID && (!startTime || !endTime)) {
      return res.status(400).json({ message: "Please choose an available 1-hour time slot." });
    }
    if (["parish_event", "priest_schedule"].includes(scheduleType) && startTime && endTime) {
      const slotCheck = assertScheduleTimeSlotAllowed(startTime, endTime);
      if (!slotCheck.ok) {
        return res.status(400).json({ message: slotCheck.message });
      }
      const closureMessage = await findParishClosureConflict({ adminID, dateKey: eventDate, startTime, endTime });
      if (closureMessage) {
        return res.status(400).json({ message: closureMessage });
      }
    }

    if (Number.isInteger(priestID)) {
      const priestResult = await query(
        `
          SELECT "priestID"
          FROM priests
          WHERE "priestID" = $1
            AND "adminID" = $2
            AND COALESCE("isActive", TRUE) = TRUE
          LIMIT 1
        `,
        [priestID, adminID],
      );
      if (priestResult.rows.length === 0) {
        return res.status(400).json({ message: "Selected priest is not available for this parish." });
      }
    }

    if (Number.isInteger(priestID) && startMinutes !== null && endMinutes !== null) {
      const overlapResult = await query(
        `
          SELECT "calendarID" AS id, title, "startTime", "endTime", occupied_slots
          FROM calendar_entries_resolved ce
          WHERE ce."adminID" = $1
            AND ce."priestID" = $2
            AND ce."eventDate" = $3::date
            AND ${calendarEntryHasActivePriestSql()}
          ORDER BY "calendarID" ASC
        `,
        [adminID, priestID, eventDate],
      );
      const hasConflict = findProposedSlotsConflict(
        activitySlots.length ? activitySlots : [{ startTime, endTime }],
        overlapResult.rows,
      ).conflict;
      if (hasConflict) {
        return res.status(409).json({ message: "Priest already has another schedule that overlaps this time." });
      }
    }

    const appointmentID = await resolveCalendarAppointmentID({
      appointmentID: req.body?.appointmentID,
    });

    const insertResult = await query(
      `
        INSERT INTO calendar_entries (
          title,
          "scheduleType",
          "eventDate",
          "startTime",
          "endTime",
          location,
          notes,
          "s_sacramentID",
          "priestID",
          "adminID",
          "appointmentID",
          "occupiedSlots"
        )
        VALUES (
          CASE WHEN $8::INT IS NULL THEN $1 ELSE NULL END,
          $2,
          CASE WHEN $8::INT IS NULL THEN $3::date ELSE NULL END,
          CASE WHEN $8::INT IS NULL THEN $4 ELSE NULL END,
          CASE WHEN $8::INT IS NULL THEN $5 ELSE NULL END,
          CASE WHEN $8::INT IS NULL THEN $6 ELSE NULL END,
          CASE WHEN $8::INT IS NULL THEN $7 ELSE NULL END,
          $8,
          CASE WHEN $8::INT IS NULL THEN $9::INT ELSE NULL END,
          $10,
          $11,
          $12::jsonb
        )
        RETURNING
          "calendarID" AS id,
          title,
          "scheduleType" AS "scheduleType",
          "eventDate"::text AS "eventDate",
          "startTime" AS "startTime",
          "endTime" AS "endTime",
          location,
          notes,
          "s_sacramentID" AS "sSacramentID",
          "priestID",
          "adminID",
          "appointmentID",
          "createdAt",
          "updatedAt"
      `,
      [
        title,
        scheduleType,
        eventDate,
        startTime,
        endTime,
        location,
        notes,
        sSacramentID,
        priestID,
        adminID,
        appointmentID,
        JSON.stringify(activitySlots),
      ],
    );
    if (sSacramentID && eventDate && startTime) {
      await query(
        `
          UPDATE special_sacraments
          SET "timeDate" = $2::timestamp,
              "priestID" = COALESCE($3, "priestID"),
              "s_sacramentName" = COALESCE(NULLIF(BTRIM($4), ''), "s_sacramentName")
          WHERE "s_sacramentID" = $1
        `,
        [sSacramentID, `${eventDate}T${startTime}:00`, priestID, title],
      );
    }
    const createdEntry = await attachPriestNameToCalendarEntry(
      sSacramentID
        ? (await loadResolvedCalendarEntry(insertResult.rows[0]?.id)) || insertResult.rows[0]
        : insertResult.rows[0] || null,
    );
    if (createdEntry) {
      await notifyPriestScheduleAssignment({
        adminID,
        priestID: createdEntry.priestID,
        calendarEntry: createdEntry,
        action: "assigned",
      });
    }
    return res.status(201).json(createdEntry);
  } catch (error) {
    console.error("Calendar entry create error:", error);
    return res.status(500).json({ message: "Unable to save calendar entry." });
  }
});

app.patch("/calendar-entries/:id", async (req, res) => {
  try {
    const entryID = Number(req.params.id);
    const title = String(req.body?.title || "").trim();
    const scheduleType = String(req.body?.scheduleType || "").trim();
    const eventDate = String(req.body?.eventDate || "").trim();
    const startTimeRaw = req.body?.startTime;
    const endTimeRaw = req.body?.endTime;
    let startTime = startTimeRaw === null || startTimeRaw === undefined || String(startTimeRaw).trim() === "" ? null : String(startTimeRaw).trim();
    let endTime = endTimeRaw === null || endTimeRaw === undefined || String(endTimeRaw).trim() === "" ? null : String(endTimeRaw).trim();
    let activitySlots = [];
    const requestedLocation = req.body?.location === null || req.body?.location === undefined ? null : String(req.body.location).trim() || null;
    const notes = req.body?.notes === null || req.body?.notes === undefined ? null : String(req.body.notes).trim() || null;
    const priestIDRaw = Number(req.body?.priestID);
    const priestID = Number.isInteger(priestIDRaw) && priestIDRaw > 0 ? priestIDRaw : null;
    const adminID = Number(req.body?.adminID ?? req.query?.adminID);
    const sSacramentIDRaw = Number(req.body?.sSacramentID ?? req.body?.s_sacramentID);
    const sSacramentID = Number.isInteger(sSacramentIDRaw) && sSacramentIDRaw > 0 ? sSacramentIDRaw : null;
    const location = scheduleType === "parish_event" ? null : requestedLocation;

    if (!Number.isInteger(entryID) || entryID <= 0) {
      return res.status(400).json({ message: "A valid calendar entry id is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    if (!title) {
      return res.status(400).json({ message: "Calendar title is required." });
    }
    if (!CALENDAR_SCHEDULE_TYPES.includes(scheduleType)) {
      return res.status(400).json({ message: "scheduleType must be parish_event, priest_schedule, or priest_activity." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return res.status(400).json({ message: "eventDate must be in YYYY-MM-DD format." });
    }
    if (["parish_event", "priest_schedule"].includes(scheduleType) && !Number.isInteger(priestID)) {
      return res.status(400).json({ message: "Please select the priest who will conduct this event." });
    }
    if (scheduleType === "priest_schedule" && !sSacramentID && !location) {
      return res.status(400).json({ message: "Please enter the location. Priest schedules are held outside the parish." });
    }

    const existingResult = await query(
      `
        SELECT
          "calendarID" AS id,
          title,
          notes,
          "priestID",
          "adminID",
          "appointmentID",
          "eventDate"::text AS "eventDate",
          "startTime" AS "startTime"
        FROM calendar_entries
        WHERE "calendarID" = $1
          AND "adminID" = $2
        LIMIT 1
      `,
      [entryID, adminID],
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: "Calendar entry not found." });
    }
    const existingEntry = existingResult.rows[0];
    const linkedAppointmentID =
      (await resolveCalendarAppointmentID({ appointmentID: req.body?.appointmentID })) ||
      resolveAppointmentIDFromCalendarEntry(existingEntry);
    const persistedNotes = notes === null ? existingEntry.notes : notes;
    const existingEventDate = String(existingEntry?.eventDate || "").slice(0, 10);
    const isKeepingExistingDate = existingEventDate === eventDate;
    if (scheduleType === "priest_activity") {
      const activityCheck = assertPriestActivityRequest({
        priestID,
        eventDate,
        startTime,
        endTime,
        occupiedSlots: req.body?.occupiedSlots,
        isKeepingExistingDate,
      });
      if (!activityCheck.ok) {
        return res.status(400).json({ message: activityCheck.message });
      }
      activitySlots = activityCheck.occupiedSlots;
      startTime = activityCheck.startTime;
      endTime = activityCheck.endTime;
    }
    if (["parish_event", "priest_schedule"].includes(scheduleType) && !sSacramentID && !isKeepingExistingDate) {
      const scheduleDateCheck = assertProgressScheduleDateAllowed(eventDate, 0);
      if (!scheduleDateCheck.ok) {
        return res.status(400).json({ message: scheduleDateCheck.message });
      }
    }

    const startMinutes = startTime ? toMinutes(startTime) : null;
    const endMinutes = endTime ? toMinutes(endTime) : null;
    if (startTime && startMinutes === null) return res.status(400).json({ message: "Invalid start time format." });
    if (endTime && endMinutes === null) return res.status(400).json({ message: "Invalid end time format." });
    if ((startTime && !endTime) || (!startTime && endTime)) {
      return res.status(400).json({ message: "Both start and end time are required together." });
    }
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      return res.status(400).json({ message: "End time must be later than start time." });
    }
    if (["parish_event", "priest_schedule"].includes(scheduleType) && !sSacramentID && (!startTime || !endTime)) {
      return res.status(400).json({ message: "Please choose an available 1-hour time slot." });
    }
    if (["parish_event", "priest_schedule"].includes(scheduleType) && startTime && endTime) {
      const slotCheck = assertScheduleTimeSlotAllowed(startTime, endTime);
      if (!slotCheck.ok) {
        return res.status(400).json({ message: slotCheck.message });
      }
      const closureMessage = await findParishClosureConflict({ adminID, dateKey: eventDate, startTime, endTime });
      if (closureMessage) {
        return res.status(400).json({ message: closureMessage });
      }
    }

    if (Number.isInteger(priestID)) {
      const priestResult = await query(
        `
          SELECT "priestID"
          FROM priests
          WHERE "priestID" = $1
            AND "adminID" = $2
            AND COALESCE("isActive", TRUE) = TRUE
          LIMIT 1
        `,
        [priestID, adminID],
      );
      if (priestResult.rows.length === 0) {
        return res.status(400).json({ message: "Selected priest is not available for this parish." });
      }
    }

    if (Number.isInteger(priestID) && startMinutes !== null && endMinutes !== null) {
      const overlapResult = await query(
        `
          SELECT "calendarID" AS id, "startTime", "endTime", occupied_slots
          FROM calendar_entries_resolved ce
          WHERE ce."adminID" = $1
            AND ce."priestID" = $2
            AND ce."eventDate" = $3::date
            AND ce."calendarID" <> $4
            AND ${calendarEntryHasActivePriestSql()}
          ORDER BY "calendarID" ASC
        `,
        [adminID, priestID, eventDate, entryID],
      );
      const hasConflict = findProposedSlotsConflict(
        activitySlots.length ? activitySlots : [{ startTime, endTime }],
        overlapResult.rows,
      ).conflict;
      if (hasConflict) {
        return res.status(409).json({ message: "Priest already has another schedule that overlaps this time." });
      }
    }

    const updateResult = await query(
      `
        UPDATE calendar_entries
        SET
          title = CASE WHEN $8::INT IS NULL THEN $1 ELSE NULL END,
          "scheduleType" = $2,
          "eventDate" = CASE WHEN $8::INT IS NULL THEN $3::date ELSE NULL END,
          "startTime" = CASE WHEN $8::INT IS NULL THEN $4 ELSE NULL END,
          "endTime" = CASE WHEN $8::INT IS NULL THEN $5 ELSE NULL END,
          location = CASE WHEN $8::INT IS NULL THEN $6 ELSE NULL END,
          notes = CASE WHEN $8::INT IS NULL THEN $7 ELSE NULL END,
          "s_sacramentID" = $8,
          "priestID" = CASE WHEN $8::INT IS NULL THEN $9::INT ELSE NULL END,
          "appointmentID" = COALESCE($10, "appointmentID"),
          "occupiedSlots" = $13::jsonb,
          "updatedAt" = NOW()
        WHERE "calendarID" = $11
          AND "adminID" = $12
        RETURNING
          "calendarID" AS id,
          title,
          "scheduleType" AS "scheduleType",
          "eventDate"::text AS "eventDate",
          "startTime" AS "startTime",
          "endTime" AS "endTime",
          location,
          notes,
          "s_sacramentID" AS "sSacramentID",
          "priestID",
          "adminID",
          "appointmentID",
          "createdAt",
          "updatedAt"
      `,
      [
        title,
        scheduleType,
        eventDate,
        startTime,
        endTime,
        location,
        persistedNotes,
        sSacramentID,
        priestID,
        linkedAppointmentID,
        entryID,
        adminID,
        JSON.stringify(activitySlots),
      ],
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Calendar entry not found." });
    }
    if (sSacramentID && eventDate && startTime) {
      await query(
        `
          UPDATE special_sacraments
          SET "timeDate" = $2::timestamp,
              "priestID" = COALESCE($3, "priestID"),
              "s_sacramentName" = COALESCE(NULLIF(BTRIM($4), ''), "s_sacramentName")
          WHERE "s_sacramentID" = $1
        `,
        [sSacramentID, `${eventDate}T${startTime}:00`, priestID, title],
      );
    }
    const existingPriestID = Number(existingEntry?.priestID);
    const updatedEntry = await attachPriestNameToCalendarEntry(
      sSacramentID
        ? (await loadResolvedCalendarEntry(updateResult.rows[0]?.id)) || updateResult.rows[0]
        : updateResult.rows[0],
    );
    if (Number.isInteger(existingPriestID) && existingPriestID > 0 && existingPriestID !== Number(updatedEntry?.priestID)) {
      await notifyPriestScheduleAssignment({
        adminID,
        priestID: existingPriestID,
        calendarEntry: updatedEntry,
        action: "unassigned",
      });
    }
    if (Number.isInteger(Number(updatedEntry?.priestID)) && Number(updatedEntry.priestID) > 0) {
      await notifyPriestScheduleAssignment({
        adminID,
        priestID: Number(updatedEntry.priestID),
        calendarEntry: updatedEntry,
        action: existingPriestID === Number(updatedEntry.priestID) ? "updated" : "assigned",
      });
    }
    if (linkedAppointmentID) {
      try {
        await syncLinkedAppointmentScheduleFromCalendarEntry({
          appointmentID: linkedAppointmentID,
          eventDate,
          startTime,
          priestID,
          previousEventDate: existingEntry.eventDate,
          previousStartTime: existingEntry.startTime,
        });
      } catch (notificationError) {
        console.error("Linked appointment schedule notification error:", notificationError);
      }
    }
    return res.json(updatedEntry);
  } catch (error) {
    console.error("Calendar entry update error:", error);
    return res.status(500).json({ message: "Unable to save calendar entry." });
  }
});

app.delete("/calendar-entries/:id", async (req, res) => {
  try {
    const entryID = Number(req.params.id);
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(entryID) || entryID <= 0) {
      return res.status(400).json({ message: "A valid calendar entry id is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const deleteResult = await query(
      `
        DELETE FROM calendar_entries
        WHERE "calendarID" = $1
          AND "adminID" = $2
        RETURNING
          "calendarID" AS id,
          title,
          "scheduleType" AS "scheduleType",
          "eventDate"::text AS "eventDate",
          "startTime" AS "startTime",
          "endTime" AS "endTime",
          notes,
          "priestID",
          "adminID",
          "appointmentID"
      `,
      [entryID, adminID],
    );
    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ message: "Calendar entry not found." });
    }
    const deletedEntry = deleteResult.rows[0];
    const linkedAppointmentID = Number(deletedEntry.appointmentID);
    if (Number.isInteger(linkedAppointmentID) && linkedAppointmentID > 0) {
      await query(
        `
          UPDATE appointments
          SET credentials = COALESCE(credentials, '{}'::jsonb) || '{"removedFromCalendar": true}'::jsonb
          WHERE "appointmentID" = $1
        `,
        [linkedAppointmentID],
      );
    }
    if (Number.isInteger(Number(deletedEntry?.priestID)) && Number(deletedEntry.priestID) > 0) {
      await notifyPriestScheduleAssignment({
        adminID,
        priestID: Number(deletedEntry.priestID),
        calendarEntry: deletedEntry,
        action: "unassigned",
      });
    }
    return res.json({ message: "Calendar entry deleted successfully." });
  } catch (error) {
    console.error("Calendar entry delete error:", error);
    return res.status(500).json({ message: "Unable to delete calendar entry." });
  }
});

app.get("/calendar-entries", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    await ensureAppointmentCalendarEntriesForAdmin(adminID);

    const result = await query(
      `
        SELECT
          ce."calendarID" AS id,
          ce.title,
          ce."scheduleType" AS "scheduleType",
          ce."eventDate"::text AS "eventDate",
          ce."startTime" AS "startTime",
          ce."endTime" AS "endTime",
          ce.location,
          ce.notes,
          ce."s_sacramentID" AS "sSacramentID",
          ce."s_sacramentID",
          ss."s_sacramentName",
          ss."maxSlots",
          ss."currentAppliedCount",
          ss."isUnlimitedSlots",
          ss."durationHours",
          to_char(ss."deadline", 'YYYY-MM-DD') AS deadline,
          ce.occupied_slots AS "occupiedSlots",
          sfs."formSchema",
          ce."priestID",
          p."fullName" AS "priestName",
          p."clergyType",
          p."religiousOrderCode",
          ce."adminID",
          ce."appointmentID",
          ce.sacrament_name AS "sacramentName",
          ce.requester_full_name AS "requesterFullName",
          ce.request_type AS "requestType",
          ce."createdAt",
          ce."updatedAt",
          CASE
            WHEN ce."eventDate" IS NULL THEN NULL
            ELSE (ce."eventDate" - ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date))
          END AS "daysUntil"
        FROM calendar_entries_resolved ce
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = ce."s_sacramentID"
        LEFT JOIN special_sacraments_form_schemas sfs
          ON LOWER(TRIM(sfs."specialSacramentName")) = LOWER(TRIM(COALESCE(ss."s_sacramentName", ce.title)))
        LEFT JOIN priests p ON p."priestID" = ce."priestID"
        WHERE ce."adminID" = $1
          AND ${calendarEntryHasActivePriestSql()}
          AND (
            ce."appointmentID" IS NOT NULL
            OR ce."scheduleType" <> 'priest_schedule'
            OR (
              ce."priestID" IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM priests p
                WHERE p."priestID" = ce."priestID"
                  AND COALESCE(p."isActive", TRUE) = TRUE
              )
            )
          )
        ORDER BY ce."eventDate" ASC, ce."startTime" ASC NULLS FIRST, ce."calendarID" ASC
      `,
      [adminID],
    );

    return res.json(result.rows.map((row) => mapCalendarEntryForParishOffice(row)));
  } catch (error) {
    console.error("Calendar entries fetch error:", error);
    return res.status(500).json({ message: "Unable to load schedule entries." });
  }
});

app.get("/calendar-entries/:id/appointment-details", async (req, res) => {
  try {
    const calendarEntryID = Number(req.params.id);
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(calendarEntryID) || calendarEntryID <= 0) {
      return res.status(400).json({ message: "A valid calendar entry id is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const entryResult = await query(
      `
        SELECT "calendarID" AS id, "eventDate", "priestID", "adminID", "appointmentID"
        FROM calendar_entries
        WHERE "calendarID" = $1
          AND "adminID" = $2
        LIMIT 1
      `,
      [calendarEntryID, adminID],
    );
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ message: "Schedule entry not found." });
    }

    const targetEntry = entryResult.rows[0];
    const linkedAppointmentID = Number(targetEntry.appointmentID);
    if (!Number.isInteger(linkedAppointmentID) || linkedAppointmentID <= 0) {
      return res.json({ relatedAppointments: [] });
    }

    const relatedAppointmentsResult = await query(
      `
        SELECT
          a."appointmentID",
          a."requesterFullName",
          ${sqlPersonFullName("u")} AS "userFullName",
          u.email,
          u.email AS "userName",
          u."contactNumber" AS "userContactNumber",
          u.address AS "userAddress",
          a.status,
          (a."finishedAt" IS NOT NULL AND a.status = 'CONFIRMED') AS "isConducted",
          COALESCE(ss."s_sacramentName", s."sacramentName") AS "resolvedSacramentName",
          pt."scheduledEventDateTime",
          a.credentials,
          a.note,
          a."createdAt",
          a."finishedAt"
        FROM appointments a
        LEFT JOIN users u ON u."userID" = a."userID"
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN progress_tracker pt ON pt."progressID" = a."progressID"
        WHERE a."appointmentID" = $1
        ORDER BY a."appointmentID" DESC
      `,
      [linkedAppointmentID],
    );

    return res.json({
      relatedAppointments: relatedAppointmentsResult.rows,
    });
  } catch (error) {
    console.error("Calendar appointment details fetch error:", error);
    return res.status(500).json({ message: "Unable to load appointment details for this event." });
  }
});

app.get("/parish-activities", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const result = await query(
      `
        SELECT
          ${PARISH_ACTIVITY_RETURNING_FIELDS}
        FROM parish_activities
        WHERE "adminID" = $1
        ORDER BY "publishedDate" DESC, "parishActID" DESC
      `,
      [adminID],
    );

    return res.json(result.rows.map(normalizeParishActivityRecord));
  } catch (error) {
    console.error("Parish activities fetch error:", error);
    return res.status(500).json({ message: "Unable to load parish activities." });
  }
});

app.get("/public/parish-activities", async (req, res) => {
  try {
    const adminIDRaw = req.query?.adminID;
    const adminID = Number(adminIDRaw ?? 1);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const result = await query(
      `
        SELECT
          ${PARISH_ACTIVITY_RETURNING_FIELDS}
        FROM parish_activities
        WHERE "adminID" = $1
        ORDER BY "publishedDate" DESC, "parishActID" DESC
      `,
      [adminID],
    );

    const todayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return res.json(
      result.rows
        .map(normalizeParishActivityRecord)
        .filter((activity) => !activity.expiresOn || activity.expiresOn >= todayKey),
    );
  } catch (error) {
    console.error("Public parish activities fetch error:", error);
    return res.status(500).json({ message: "Unable to load parish activities." });
  }
});

app.post("/parish-activities/upload-image", (req, res) => {
  parishActivityImageUpload.single("photo")(req, res, async (error) => {
    if (error) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Each file must be 100MB or smaller." });
      }
      return res.status(400).json({ message: error.message || "Unable to upload parish activity media." });
    }
    if (!req.file?.filename) {
      return res.status(400).json({ message: "Please choose a photo or video to upload." });
    }
    try {
      const mediaType = getParishActivityUploadedMediaType(req.file);
      const filePath = await storeParishActivityMediaFile(req.file);
      return res.status(201).json({
        message: `Parish activity ${mediaType} uploaded successfully.`,
        filePath,
        url: filePath,
        imageUrl: mediaType === "image" ? filePath : "",
        mediaType,
        fileName: req.file.originalname || req.file.filename,
      });
    } catch (storeError) {
      console.error("Parish activity media store error:", storeError);
      return res.status(500).json({ message: "Unable to store parish activity media." });
    }
  });
});

app.post("/parish-activities/delete-media", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    const activityID = Number(req.body?.activityID);
    const filePath = resolveParishActivityMediaPath(req.body?.filePath ?? req.body?.url ?? "");

    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    if (!filePath) {
      return res.status(400).json({ message: "A valid media filePath is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    if (Number.isInteger(activityID) && activityID > 0) {
      const existingResult = await query(
        `
          SELECT payload
          FROM parish_activities
          WHERE "parishActID" = $1
            AND "adminID" = $2
          LIMIT 1
        `,
        [activityID, adminID],
      );
      if (existingResult.rows.length === 0) {
        return res.status(404).json({ message: "Parish activity not found." });
      }

      const previousPayload = parseParishActivityPayload(existingResult.rows[0]?.payload);
      const remainingMedia = normalizeParishActivityMediaItems(previousPayload.media, previousPayload.imageUrl).filter(
        (item) => resolveParishActivityMediaPath(item.filePath || item.url) !== filePath,
      );
      const hadMedia = normalizeParishActivityMediaItems(previousPayload.media, previousPayload.imageUrl).some(
        (item) => resolveParishActivityMediaPath(item.filePath || item.url) === filePath,
      );
      if (!hadMedia) {
        return res.status(404).json({ message: "Media file not found on this activity." });
      }

      const nextPayload = buildParishActivityPayload({
        summary: previousPayload.summary,
        details: previousPayload.details,
        imageUrl: previousPayload.imageUrl,
        media: remainingMedia,
        slides: previousPayload.slides,
        expiresOn: previousPayload.expiresOn,
      });

      await query(
        `
          UPDATE parish_activities
          SET payload = $1::jsonb, "updatedAt" = NOW()
          WHERE "parishActID" = $2
            AND "adminID" = $3
        `,
        [JSON.stringify(nextPayload), activityID, adminID],
      );
    }

    await deleteStoredParishActivityMediaIfExists(filePath);
    return res.json({ message: "Parish activity media deleted successfully.", filePath });
  } catch (error) {
    console.error("Parish activity media delete error:", error);
    return res.status(500).json({ message: "Unable to delete parish activity media." });
  }
});

app.post("/parish-activities", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    const title = String(req.body?.title || "").trim();
    const activityDate = String(req.body?.activityDate || "").trim();
    const summary = String(req.body?.summary || "").trim();
    const details = String(req.body?.details || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    const media = Array.isArray(req.body?.media) ? req.body.media : [];
    const slides = normalizeParishActivitySlides(req.body?.slides);
    const expiresOnRaw = String(req.body?.expiresOn || "").trim();
    const expiresOn = normalizeOptionalIsoDate(expiresOnRaw);

    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    if (!title) {
      return res.status(400).json({ message: "Activity title is required." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) {
      return res.status(400).json({ message: "activityDate must be in YYYY-MM-DD format." });
    }
    if (expiresOnRaw && !expiresOn) {
      return res.status(400).json({ message: "Expiration date must be in YYYY-MM-DD format." });
    }
    if (expiresOn && expiresOn < activityDate) {
      return res.status(400).json({ message: "Expiration date cannot be earlier than the activity date." });
    }
    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const payload = buildParishActivityPayload({ summary, details, imageUrl, media, slides, expiresOn });

    const result = await query(
      `
        INSERT INTO parish_activities (title, "publishedDate", payload, "adminID")
        VALUES ($1, $2::date, $3::jsonb, $4)
        RETURNING
          ${PARISH_ACTIVITY_RETURNING_FIELDS}
      `,
      [title, activityDate, JSON.stringify(payload), adminID],
    );

    return res.status(201).json(normalizeParishActivityRecord(result.rows[0]));
  } catch (error) {
    console.error("Parish activity create error:", error);
    return res.status(500).json({ message: "Unable to save parish activity." });
  }
});

app.patch("/parish-activities/:id", async (req, res) => {
  try {
    const activityID = Number(req.params.id);
    const adminID = Number(req.body?.adminID);
    const title = String(req.body?.title || "").trim();
    const activityDate = String(req.body?.activityDate || "").trim();
    const summary = String(req.body?.summary || "").trim();
    const details = String(req.body?.details || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    const media = Array.isArray(req.body?.media) ? req.body.media : [];
    const slides = normalizeParishActivitySlides(req.body?.slides);
    const expiresOnRaw = String(req.body?.expiresOn || "").trim();
    const expiresOn = normalizeOptionalIsoDate(expiresOnRaw);

    if (!Number.isInteger(activityID) || activityID <= 0) {
      return res.status(400).json({ message: "A valid activity ID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    if (!title) {
      return res.status(400).json({ message: "Activity title is required." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) {
      return res.status(400).json({ message: "activityDate must be in YYYY-MM-DD format." });
    }
    if (expiresOnRaw && !expiresOn) {
      return res.status(400).json({ message: "Expiration date must be in YYYY-MM-DD format." });
    }
    if (expiresOn && expiresOn < activityDate) {
      return res.status(400).json({ message: "Expiration date cannot be earlier than the activity date." });
    }
    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const existingResult = await query(
      `
        SELECT payload
        FROM parish_activities
        WHERE "parishActID" = $1
          AND "adminID" = $2
        LIMIT 1
      `,
      [activityID, adminID],
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: "Parish activity not found." });
    }

    const previousPayload = parseParishActivityPayload(existingResult.rows[0]?.payload);
    const payload = buildParishActivityPayload({ summary, details, imageUrl, media, slides, expiresOn });
    await deleteRemovedParishActivityMediaFiles(previousPayload, payload);

    const result = await query(
      `
        UPDATE parish_activities
        SET
          title = $1,
          "publishedDate" = $2::date,
          payload = $3::jsonb,
          "updatedAt" = NOW()
        WHERE "parishActID" = $4
          AND "adminID" = $5
        RETURNING
          ${PARISH_ACTIVITY_RETURNING_FIELDS}
      `,
      [title, activityDate, JSON.stringify(payload), activityID, adminID],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Parish activity not found." });
    }

    return res.json(normalizeParishActivityRecord(result.rows[0]));
  } catch (error) {
    console.error("Parish activity update error:", error);
    return res.status(500).json({ message: "Unable to update parish activity." });
  }
});

app.delete("/parish-activities/:id", async (req, res) => {
  try {
    const activityID = Number(req.params.id);
    const adminID = Number(req.query?.adminID ?? req.body?.adminID);

    if (!Number.isInteger(activityID) || activityID <= 0) {
      return res.status(400).json({ message: "A valid activity ID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const existingResult = await query(
      `
        SELECT payload
        FROM parish_activities
        WHERE "parishActID" = $1
          AND "adminID" = $2
        LIMIT 1
      `,
      [activityID, adminID],
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: "Parish activity not found." });
    }

    for (const mediaPath of collectParishActivityMediaPaths(existingResult.rows[0]?.payload)) {
      await deleteStoredParishActivityMediaIfExists(mediaPath);
    }

    const result = await query(
      `
        DELETE FROM parish_activities
        WHERE "parishActID" = $1
          AND "adminID" = $2
        RETURNING "parishActID", title
      `,
      [activityID, adminID],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Parish activity not found." });
    }

    return res.json({
      message: "Parish activity deleted successfully.",
      id: Number(result.rows[0]?.parishActID),
      title: String(result.rows[0]?.title || "").trim(),
    });
  } catch (error) {
    console.error("Parish activity delete error:", error);
    return res.status(500).json({ message: "Unable to delete parish activity." });
  }
});

app.delete("/parish-activities/:id/slides/:slideId", async (req, res) => {
  try {
    const activityID = Number(req.params.id);
    const slideID = String(req.params.slideId || "").trim();
    const adminID = Number(req.query?.adminID ?? req.body?.adminID);

    if (!Number.isInteger(activityID) || activityID <= 0) {
      return res.status(400).json({ message: "A valid activity ID is required." });
    }
    if (!slideID) {
      return res.status(400).json({ message: "A valid slide ID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const existingResult = await query(
      `
        SELECT "parishActID", payload
        FROM parish_activities
        WHERE "parishActID" = $1
          AND "adminID" = $2
        LIMIT 1
      `,
      [activityID, adminID],
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: "Parish activity not found." });
    }

    const existingPayload = parseParishActivityPayload(existingResult.rows[0]?.payload);
    const currentSlides = normalizeParishActivitySlides(existingPayload.slides);
    const filteredSlides = currentSlides.filter((slide) => String(slide?.slideId || "").trim() !== slideID);
    if (filteredSlides.length === currentSlides.length) {
      return res.status(404).json({ message: "Slide not found for this parish activity." });
    }

    const nextPayload = {
      ...existingPayload,
      slides: filteredSlides,
    };

    const updateResult = await query(
      `
        UPDATE parish_activities
        SET
          payload = $1::jsonb,
          "updatedAt" = NOW()
        WHERE "parishActID" = $2
          AND "adminID" = $3
        RETURNING
          ${PARISH_ACTIVITY_RETURNING_FIELDS}
      `,
      [JSON.stringify(nextPayload), activityID, adminID],
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Parish activity not found." });
    }

    return res.json(normalizeParishActivityRecord(updateResult.rows[0]));
  } catch (error) {
    console.error("Parish activity slide delete error:", error);
    return res.status(500).json({ message: "Unable to remove slide from parish activity." });
  }
});

const getManilaNowSnapshot = () => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayKey = String(partMap.weekday || "").trim().slice(0, 3).toLowerCase();
  const weekdayIndexMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const weekday = weekdayIndexMap[weekdayKey] ?? null;
  const dateISO =
    /^\d{4}$/.test(String(partMap.year || "")) &&
    /^\d{2}$/.test(String(partMap.month || "")) &&
    /^\d{2}$/.test(String(partMap.day || ""))
      ? `${partMap.year}-${partMap.month}-${partMap.day}`
      : "";
  const hour = Number(partMap.hour || 0);
  const minute = Number(partMap.minute || 0);
  const nowMinutes = Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
  const timeLabel = (() => {
    const normalizedHours = ((hour % 24) + 24) % 24;
    const period = normalizedHours >= 12 ? "PM" : "AM";
    const twelveHour = normalizedHours % 12 || 12;
    return `${twelveHour}:${String(minute).padStart(2, "0")} ${period}`;
  })();
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  return {
    timezone: "Asia/Manila",
    weekday,
    dateISO,
    nowMinutes,
    dateLabel,
    timeLabel,
  };
};

const parseClockToMinutes = (value) => {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const formatClockTo12Hour = (value) => {
  const totalMinutes = parseClockToMinutes(value);
  if (totalMinutes === null) return "";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${period}`;
};

const formatClockRange = (startTime, endTime) => {
  const startLabel = formatClockTo12Hour(startTime);
  const endLabel = formatClockTo12Hour(endTime);
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || "Time not set";
};

app.get("/day-offs", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const [weekdayResult, specificDatesResult] = await Promise.all([
      query(
        `
          SELECT weekday
          FROM recurring_day_offs
          WHERE "adminID" = $1
          ORDER BY "recurringID" DESC
          LIMIT 1
        `,
        [adminID],
      ),
      query(
        `
          SELECT "dayOffDate"
          FROM day_off_dates
          WHERE "adminID" = $1
          ORDER BY "dayOffDate" ASC
        `,
        [adminID],
      ),
    ]);
    const minAdvanceDays = await resolveScheduleMinAdvanceDays(adminID);
    const lockPolicy = buildScheduleLockPolicy(minAdvanceDays);

    const weekdayValue = weekdayResult.rows.length > 0 ? Number(weekdayResult.rows[0].weekday) : null;
    const specificDates = specificDatesResult.rows
      .map((row) => {
        const raw = row?.dayOffDate;
        if (!raw) return "";
        if (raw instanceof Date) return raw.toISOString().slice(0, 10);
        return String(raw).slice(0, 10);
      })
      .filter((dateValue) => /^\d{4}-\d{2}-\d{2}$/.test(dateValue))
      .map((dateValue) => ({ date: dateValue }));

    const halfDay = await fetchRecurringHalfDay(adminID);

    return res.json({
      weekday: Number.isInteger(weekdayValue) && weekdayValue >= 0 && weekdayValue <= 6 ? weekdayValue : null,
      halfDay,
      specificDates,
      minAdvanceDays: lockPolicy.minAdvanceDays,
      todayKey: lockPolicy.todayKey,
      lockedThroughDateKey: lockPolicy.lockedThroughDateKey,
      minSelectableDateKey: lockPolicy.minSelectableDateKey,
    });
  } catch (error) {
    console.error("Day-off settings fetch error:", error);
    return res.status(500).json({ message: "Unable to load day-off settings." });
  }
});

app.post("/day-offs", async (req, res) => {
  try {
    const adminID = Number(req.body?.adminID);
    const mode = String(req.body?.mode || "").trim().toLowerCase();
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    if (mode !== "weekday" && mode !== "specific_date" && mode !== "half_day") {
      return res.status(400).json({ message: "mode must be weekday, specific_date, or half_day." });
    }

    if (mode === "half_day") {
      const weekday = Number(req.body?.weekday);
      const startTime = normalizeTimeToHHMM(req.body?.startTime);
      const endTime = normalizeTimeToHHMM(req.body?.endTime);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        return res.status(400).json({ message: "weekday must be between 0 and 6." });
      }
      if (!startTime || !endTime || toMinutes(endTime) <= toMinutes(startTime)) {
        return res.status(400).json({ message: "Closing time must be later than opening time." });
      }
      const dayOffResult = await query(
        `SELECT weekday FROM recurring_day_offs WHERE "adminID" = $1 LIMIT 1`,
        [adminID],
      );
      if (dayOffResult.rows.length > 0 && Number(dayOffResult.rows[0].weekday) === weekday) {
        return res.status(400).json({ message: "This weekday is already the church day off. Pick a different day for the half day." });
      }
      await query(
        `
          INSERT INTO recurring_half_days ("recurring_halfID", weekday, "startTime", "endTime", "isEnabled", "updatedAt")
          VALUES ($1, $2, $3::time, $4::time, TRUE, NOW())
          ON CONFLICT ("recurring_halfID")
          DO UPDATE SET weekday = EXCLUDED.weekday,
                        "startTime" = EXCLUDED."startTime",
                        "endTime" = EXCLUDED."endTime",
                        "isEnabled" = TRUE,
                        "updatedAt" = NOW()
        `,
        [adminID, weekday, startTime, endTime],
      );
      return res.status(201).json({ message: "Half day saved.", halfDay: { weekday, startTime, endTime } });
    }

    if (mode === "weekday") {
      const weekday = Number(req.body?.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        return res.status(400).json({ message: "weekday must be between 0 and 6." });
      }
      await query(
        `
          INSERT INTO recurring_day_offs (weekday, "adminID")
          VALUES ($1, $2)
          ON CONFLICT ("adminID")
          DO UPDATE SET weekday = EXCLUDED.weekday
        `,
        [weekday, adminID],
      );
      return res.status(201).json({ message: "Recurring day-off saved.", weekday });
    }

    const dateValue = String(req.body?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return res.status(400).json({ message: "date must be in YYYY-MM-DD format." });
    }
    await query(
      `
        INSERT INTO day_off_dates ("dayOffDate", "adminID")
        VALUES ($1::date, $2)
        ON CONFLICT ("adminID", "dayOffDate")
        DO NOTHING
      `,
      [dateValue, adminID],
    );
    return res.status(201).json({ message: "Specific day-off date saved.", date: dateValue });
  } catch (error) {
    console.error("Day-off settings save error:", error);
    return res.status(500).json({ message: "Unable to save day-off setting." });
  }
});

app.delete("/day-offs/weekday", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    await query(
      `
        DELETE FROM recurring_day_offs
        WHERE "adminID" = $1
      `,
      [adminID],
    );
    return res.json({ message: "Recurring day-off removed." });
  } catch (error) {
    console.error("Day-off weekday delete error:", error);
    return res.status(500).json({ message: "Unable to remove day-off setting." });
  }
});

app.delete("/day-offs/half-day", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    await query(
      `UPDATE recurring_half_days SET "isEnabled" = FALSE, "updatedAt" = NOW() WHERE "recurring_halfID" = $1`,
      [adminID],
    );
    return res.json({ message: "Half day removed." });
  } catch (error) {
    console.error("Half day delete error:", error);
    return res.status(500).json({ message: "Unable to remove half day." });
  }
});

app.delete("/day-offs/date/:date", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    const dateValue = String(req.params?.date || "").trim();
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return res.status(400).json({ message: "date must be in YYYY-MM-DD format." });
    }
    await query(
      `
        DELETE FROM day_off_dates
        WHERE "adminID" = $1
          AND "dayOffDate" = $2::date
      `,
      [adminID, dateValue],
    );
    return res.json({ message: "Specific day-off date removed." });
  } catch (error) {
    console.error("Day-off specific date delete error:", error);
    return res.status(500).json({ message: "Unable to remove day-off setting." });
  }
});

app.get("/dashboard/stats", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const result = await query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE a.status = 'PENDING'
          )::int AS "pendingAppointments",
          COUNT(*) FILTER (
            WHERE a.status = 'CONFIRMED'
              AND a."finishedAt" IS NULL
          )::int AS "ongoingAppointments",
          COUNT(*) FILTER (
            WHERE a.status = 'CONFIRMED'
              AND (
                (COALESCE(a."finishedAt", a."createdAt") AT TIME ZONE 'Asia/Manila')::date
                = (NOW() AT TIME ZONE 'Asia/Manila')::date
              )
          )::int AS "approvedToday",
          (
            SELECT COUNT(*)::int
            FROM cert_request cr
            WHERE cr.status::text ILIKE 'pending'
          ) AS "certificateRequests"
        FROM appointments a
        WHERE a."isArchived" = FALSE
      `,
    );

    const row = result.rows[0] || {};
    return res.json({
      pendingAppointments: Number(row.pendingAppointments) || 0,
      approvedToday: Number(row.approvedToday) || 0,
      ongoingAppointments: Number(row.ongoingAppointments) || 0,
      certificateRequests: Number(row.certificateRequests) || 0,
    });
  } catch (error) {
    console.error("Dashboard stats fetch error:", error);
    return res.status(500).json({ message: "Unable to load dashboard stats." });
  }
});

app.get("/dashboard/office-status", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const nowSnapshot = getManilaNowSnapshot();
    const [weekdayResult, specificDatesResult, schedulesResult] = await Promise.all([
      query(
        `
          SELECT weekday
          FROM recurring_day_offs
          WHERE "adminID" = $1
          ORDER BY "recurringID" DESC
          LIMIT 1
        `,
        [adminID],
      ),
      query(
        `
          SELECT "dayOffDate"
          FROM day_off_dates
          WHERE "adminID" = $1
        `,
        [adminID],
      ),
      query(
        `
          SELECT ce."calendarID" AS id, ce.title, ce."scheduleType", ce."eventDate", ce."startTime", ce."endTime", ce.location, ce.notes, ce."priestID", ce."s_sacramentID"
          FROM calendar_entries_resolved ce
          WHERE ce."adminID" = $1
            AND ce."eventDate"::date = $2::date
            AND ${calendarEntryHasActivePriestSql()}
          ORDER BY "startTime" NULLS LAST, "calendarID" ASC
        `,
        [adminID, nowSnapshot.dateISO],
      ),
    ]);

    const recurringWeekday = weekdayResult.rows.length > 0 ? Number(weekdayResult.rows[0].weekday) : null;
    const specificDateSet = new Set(
      specificDatesResult.rows
        .map((row) => {
          const raw = row?.dayOffDate;
          if (!raw) return "";
          if (raw instanceof Date) return raw.toISOString().slice(0, 10);
          return String(raw).slice(0, 10);
        })
        .filter((dateValue) => /^\d{4}-\d{2}-\d{2}$/.test(dateValue)),
    );

    const isSpecificDateDayOff = Boolean(nowSnapshot.dateISO && specificDateSet.has(nowSnapshot.dateISO));
    const isRecurringDayOff =
      Number.isInteger(nowSnapshot.weekday) &&
      Number.isInteger(recurringWeekday) &&
      recurringWeekday >= 0 &&
      recurringWeekday <= 6 &&
      nowSnapshot.weekday === recurringWeekday;
    const isFullDayOff = isSpecificDateDayOff || isRecurringDayOff;
    const halfDay = await fetchRecurringHalfDay(adminID);
    const isHalfDayToday = !isFullDayOff && Boolean(halfDay) && nowSnapshot.weekday === halfDay.weekday;
    const halfDayStart = isHalfDayToday ? toMinutes(halfDay.startTime) : null;
    const halfDayEnd = isHalfDayToday ? toMinutes(halfDay.endTime) : null;
    const isOutsideHalfDayHours =
      isHalfDayToday &&
      nowSnapshot.nowMinutes !== null &&
      halfDayStart !== null &&
      halfDayEnd !== null &&
      (nowSnapshot.nowMinutes < halfDayStart || nowSnapshot.nowMinutes >= halfDayEnd);
    const isDayOff = isFullDayOff || isOutsideHalfDayHours;
    const halfDayRangeLabel = isHalfDayToday ? formatClockRange(halfDay.startTime, halfDay.endTime) : "";

    const todaySchedules = schedulesResult.rows.map((row) => {
      const startTime = String(row?.startTime || "").trim() || null;
      const endTime = String(row?.endTime || "").trim() || null;
      return {
        id: Number(row.id),
        title: String(row.title || "").trim() || "Untitled schedule",
        scheduleType: String(row.scheduleType || "").trim() || "parish_event",
        eventDate: row.eventDate instanceof Date ? row.eventDate.toISOString().slice(0, 10) : String(row.eventDate || "").slice(0, 10),
        startTime,
        endTime,
        timeLabel: formatClockRange(startTime, endTime),
        location: String(row.location || "").trim() || null,
        notes: String(row.notes || "").trim() || null,
        priestID: Number.isInteger(Number(row.priestID)) ? Number(row.priestID) : null,
        sSacramentID: Number.isInteger(Number(row.s_sacramentID)) ? Number(row.s_sacramentID) : null,
      };
    });

    const activeSchedule =
      isDayOff || nowSnapshot.nowMinutes === null
        ? null
        : todaySchedules.find((entry) => {
            const startMinutes = parseClockToMinutes(entry.startTime);
            const endMinutes = parseClockToMinutes(entry.endTime);
            if (startMinutes === null || endMinutes === null) return false;
            return nowSnapshot.nowMinutes >= startMinutes && nowSnapshot.nowMinutes <= endMinutes;
          }) || null;

    const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const reason = isDayOff
      ? isSpecificDateDayOff
        ? "Office is closed today due to a specific day-off date."
        : isOutsideHalfDayHours
          ? `Half day today. Office is open ${halfDayRangeLabel} only.`
          : `Office is closed today. Recurring day-off is ${weekdayLabels[recurringWeekday] || "configured day-off"}.`
      : activeSchedule
        ? `Office is open. Ongoing schedule: ${activeSchedule.title} (${activeSchedule.timeLabel}).`
        : isHalfDayToday
          ? `Half day today. Office is open ${halfDayRangeLabel} only.`
          : "Office is open today.";

    return res.json({
      timezone: nowSnapshot.timezone,
      now: {
        dateISO: nowSnapshot.dateISO,
        dateLabel: nowSnapshot.dateLabel,
        timeLabel: nowSnapshot.timeLabel,
      },
      office: {
        isOpen: !isDayOff,
        statusLabel: !isDayOff ? "Open" : "Closed",
        isHalfDay: isHalfDayToday,
        reason,
        activeSchedule,
        nextOpening: null,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Office status fetch error:", error);
    return res.status(500).json({ message: "Unable to load office status." });
  }
});

const APPOINTMENT_ALLOWED_STATUSES = new Set(["PENDING", "CONFIRMED", "CANCELLED"]);
const DEFAULT_SPECIAL_PROGRAM_FIELD_SCHEMA = [
  { key: "address", label: "Address", type: "text", required: true, placeholder: "Enter complete address" },
  { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number" },
];

const readAppointmentCredentialText = (credentials, keys) => {
  const source = credentials && typeof credentials === "object" ? credentials : {};
  for (const key of keys) {
    const value = String(source?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const normalizeCredentialKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const readCredentialByKeyMatch = (credentials, predicate) => {
  const source = credentials && typeof credentials === "object" && !Array.isArray(credentials) ? credentials : {};
  for (const [key, value] of Object.entries(source)) {
    if (!predicate(normalizeCredentialKey(key))) continue;
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const resolveChildDisplayName = (credentials) => {
  const firstName = readCredentialByKeyMatch(
    credentials,
    (key) => key.includes("child") && (key.includes("first") || key.includes("given")),
  );
  const lastName = readCredentialByKeyMatch(
    credentials,
    (key) => key.includes("child") && (key.includes("last") || key.includes("sur") || key.includes("family")),
  );
  const composed = [firstName, lastName].filter(Boolean).join(" ");
  if (composed) return composed;
  return (
    readCredentialByKeyMatch(credentials, (key) => key === "childfullname" || key === "childname") ||
    readAppointmentCredentialText(credentials, ["childFullName"])
  );
};

const isFamilyOrPartNameCredentialKey = (key) => {
  const normalized = normalizeCredentialKey(key);
  if (!normalized) return true;
  if (normalized.includes("father") || normalized.includes("mother")) return true;
  if (normalized.includes("ninong") || normalized.includes("ninang")) return true;
  if (normalized.includes("godparent") || normalized.includes("godfather") || normalized.includes("godmother")) return true;
  if (normalized.includes("contact") || normalized.includes("requester") || normalized.includes("requestor")) return true;
  if (normalized.includes("firstname") || normalized.includes("lastname") || normalized.includes("givenname") || normalized.includes("surname")) {
    return true;
  }
  return false;
};

const formatBlessingTypeLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("house") || normalized.includes("home")) return "Home Blessing";
  if (normalized.includes("vehicle") || normalized.includes("car")) return "Car Blessing";
  if (normalized.includes("business")) return "Business Blessing";
  return String(value || "").trim();
};

const getAppointmentConductedPersonSummary = (appointment) => {
  const credentials = appointment?.credentials && typeof appointment.credentials === "object" ? appointment.credentials : {};
  const sacramentName = String(
    appointment?.resolvedSacramentName || appointment?.specialSacramentName || appointment?.sacramentName || "",
  )
    .trim()
    .toLowerCase();

  if (sacramentName.includes("marriage") || sacramentName.includes("kasalan") || sacramentName.includes("kasal")) {
    const personName = (role) => {
      const full = readAppointmentCredentialText(credentials, [`${role}Name`, `${role}FullName`]);
      if (full && !/\.(png|jpe?g|pdf|webp|docx?)$/i.test(full)) return full;
      const first = readCredentialByKeyMatch(
        credentials,
        (key) => key.includes(role) && (key.includes("first") || key.includes("given")),
      );
      const last = readCredentialByKeyMatch(
        credentials,
        (key) => key.includes(role) && (key.includes("last") || key.includes("sur") || key.includes("family")),
      );
      return [first, last].filter(Boolean).join(" ");
    };
    const groomName = personName("groom");
    const brideName = personName("bride");
    const coupleName = groomName && brideName ? `${groomName} & ${brideName}` : groomName || brideName;
    return { conductedPersonLabel: "Couple", conductedPersonValue: coupleName || "Not provided" };
  }
  if (sacramentName.includes("funeral") || sacramentName.includes("death")) {
    return {
      conductedPersonLabel: "Deceased",
      conductedPersonValue: readAppointmentCredentialText(credentials, ["deceasedName", "deceasedFullName", "fullName"]) || "Not provided",
    };
  }
  if (sacramentName.includes("blessing")) {
    const blessingType = formatBlessingTypeLabel(readAppointmentCredentialText(credentials, ["blessingType"]));
    const blessingTarget = readAppointmentCredentialText(credentials, ["blessingTarget"]);
    return {
      conductedPersonLabel: "Blessing type",
      conductedPersonValue: blessingType || blessingTarget || "Not provided",
    };
  }
  if (
    sacramentName.includes("baptism") ||
    sacramentName.includes("christening") ||
    sacramentName.includes("binyagan")
  ) {
    return {
      conductedPersonLabel: "Child",
      conductedPersonValue:
        resolveChildDisplayName(credentials) ||
        readAppointmentCredentialText(credentials, ["childFullName", "fullName"]) ||
        "Not provided",
    };
  }
  return {
    conductedPersonLabel: "Conducted for",
    conductedPersonValue:
      readAppointmentCredentialText(credentials, ["childFullName", "fullName", "deceasedName", "deceasedFullName", "blessingTarget"]) ||
      "Not provided",
  };
};

const computeChecklistProgressMetrics = (checklist) => {
  const source = Array.isArray(checklist)
    ? checklist
    : typeof checklist === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(checklist);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  let totalTasks = 0;
  let completedTasks = 0;

  source.forEach((step) => {
    const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
    tasks.forEach((task) => {
      totalTasks += 1;
      if (task && typeof task === "object" && Boolean(task.done)) {
        completedTasks += 1;
      }
    });
  });

  if (totalTasks <= 0) {
    return { progressPercent: 0, completedTasks: 0, totalTasks: 0 };
  }

  return {
    progressPercent: Math.max(0, Math.min(100, Math.round((completedTasks / totalTasks) * 100))),
    completedTasks,
    totalTasks,
  };
};

const resolveListProgressState = (row) => {
  const normalizedStatus = String(row?.status || "").trim().toUpperCase();
  if (normalizedStatus === "CANCELLED") return "Cancelled";
  if (normalizedStatus === "CONFIRMED") return "Ongoing";
  return "For Review";
};

const resolveUserFacingProgressState = ({
  status,
  isCertificateRequest = false,
  totalTasks = 0,
  completedTasks = 0,
  progressPercent = 0,
  eventDone = false,
}) => {
  if (isCertificateRequest) {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized === "approved" || normalized === "ongoing" || normalized === "completed") {
      return "Ongoing";
    }
    return "Pending";
  }

  const normalizedStatus = String(status || "").trim().toUpperCase();
  const hasStartedProgress =
    Boolean(eventDone) || Number(completedTasks) > 0 || Number(progressPercent) > 0;
  if (normalizedStatus === "CONFIRMED" || hasStartedProgress) {
    return "Ongoing";
  }
  return "Pending";
};

const resolveAppointmentCardName = (appointment) => {
  const conductedName = String(getAppointmentConductedPersonSummary(appointment).conductedPersonValue || "").trim();
  if (conductedName && conductedName !== "Not provided") return conductedName;
  const credentialNames = collectCertificateCredentialNames(appointment?.credentials);
  if (credentialNames.length > 0) return credentialNames.join(" & ");
  return String(appointment?.requesterFullName || "").trim();
};

const toAppointmentResponseRow = (row) => {
  const checklistMetrics = computeChecklistProgressMetrics(row.checklist_data || row.checklistData);
  const appointment = {
    appointmentID: Number(row.appointmentID),
    userID: row.userID === null ? null : Number(row.userID),
    priestID: row.priestID === null ? null : Number(row.priestID),
    priestName: String(row.priestName || "").trim(),
    progressID: row.progressID === null ? null : Number(row.progressID),
    sacramentID: row.sacramentID === null ? null : Number(row.sacramentID),
    s_sacramentID: row.s_sacramentID === null ? null : Number(row.s_sacramentID),
    status: row.status,
    requestType: row.requestType,
    requesterFullName: row.requesterFullName,
    credentials: row.credentials && typeof row.credentials === "object" ? row.credentials : {},
    note: row.note,
    declineReason: String(row.note || "").trim(),
    hasProgressTracker: Boolean(row.hasProgressTracker),
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    sacramentName: row.sacramentName || row.specialSacramentName || "",
    specialSacramentName: row.specialSacramentName || "",
    s_sacramentName: row.specialSacramentName || "",
    resolvedSacramentName: row.sacramentName || row.specialSacramentName || "",
    reviewViewedAt: row.reviewViewedAt || null,
    reviewUnderReviewAt: row.reviewUnderReviewAt || null,
    giftAmount: sumProgressPaymentAmount(readPaymentRecordsFromSources(row)),
    paymentStatus: resolveAppointmentPaymentStatus(row),
    eventDone: Boolean(row.eventDone),
    progressPercent: checklistMetrics.progressPercent,
    completedTasks: checklistMetrics.completedTasks,
    totalTasks: checklistMetrics.totalTasks,
    progressState: resolveListProgressState(row),
  };
  return {
    ...appointment,
    ...getAppointmentConductedPersonSummary(appointment),
  };
};

const toOptionalPositiveInteger = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === "null") return null;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) return Number.NaN;
  return parsed;
};

const toSpecialTemplateKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseAppointmentCredentialsInput = (rawCredentials) => {
  if (rawCredentials && typeof rawCredentials === "object" && !Array.isArray(rawCredentials)) {
    return { ...rawCredentials };
  }
  if (typeof rawCredentials === "string" && rawCredentials.trim()) {
    try {
      const parsed = JSON.parse(rawCredentials);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return {};
};

const sanitizeAppointmentCredentialsRecord = (credentials = {}, fieldSchema = [], options = {}) => {
  const sanitized = {};
  const schemaByKey = new Map(
    (Array.isArray(fieldSchema) ? fieldSchema : [])
      .map((field) => [String(field?.key || "").trim(), field])
      .filter(([key]) => key),
  );
  const schemaKeysOnly = options.schemaKeysOnly === true && schemaByKey.size > 0;
  const sourceEntries = schemaKeysOnly
    ? [...schemaByKey.keys()].map((key) => [key, credentials?.[key]])
    : Object.entries(credentials || {});
  sourceEntries.forEach(([key, value]) => {
    const fieldKey = String(key || "").trim();
    if (!fieldKey) return;
    if (value === undefined || value === null) return;
    const field = schemaByKey.get(fieldKey);
    if (String(field?.type || "").trim().toLowerCase() === "list" || fieldKey === "godparents") {
      sanitized[fieldKey] = sanitizeListCredentialValue(value);
      return;
    }
    if (typeof value === "object") return;
    const textValue = String(value).trim();
    if (!textValue) return;
    sanitized[fieldKey] = textValue;
  });
  return sanitized;
};

const listUploadedAppointmentFiles = (files = {}) =>
  Array.isArray(files) ? files : Object.values(files || {}).flatMap((entry) => (Array.isArray(entry) ? entry : entry ? [entry] : []));

const toAppointmentUploadFolderName = (id, name) => {
  const slug = String(name || "service")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "service";
  return `${id}-${slug}`;
};

const placeAppointmentUploads = async (files, { sacramentID = null, sacramentName = "", specialSacramentID = null, specialSacramentName = "", appointmentID = null } = {}) => {
  const folderName = Number(specialSacramentID) > 0
    ? path.join("SpecialPrograms", toAppointmentUploadFolderName(specialSacramentID, specialSacramentName))
    : path.join("Sacraments", toAppointmentUploadFolderName(sacramentID, sacramentName));
  const appointmentFolder = Number(appointmentID) > 0 ? String(appointmentID) : "unassigned";
  const targetDirectory = path.join(appointmentUploadsRoot, folderName, appointmentFolder);
  await fs.mkdir(targetDirectory, { recursive: true });
  const publicBasePath = `/uploads/Appointments/${folderName.split(path.sep).join("/")}/${appointmentFolder}`;
  for (const file of listUploadedAppointmentFiles(files)) {
    if (!file?.filename) continue;
    const currentPath = String(file.path || "");
    const nextPath = path.join(targetDirectory, file.filename);
    if (currentPath && path.resolve(currentPath) !== path.resolve(nextPath)) {
      await fs.rename(currentPath, nextPath);
      file.path = nextPath;
      file.destination = targetDirectory;
    }
    file.publicBasePath = publicBasePath;
  }
  return publicBasePath;
};

const attachAppointmentDocumentFiles = (credentials = {}, files = {}) => {
  const nextCredentials = { ...credentials };
  listUploadedAppointmentFiles(files).forEach((file) => {
    const fieldKey = String(file?.fieldname || "").trim();
    if (!fieldKey || !file?.filename) return;
    const fileUrl = `${file.publicBasePath || marriageBirthCertPublicBasePath}/${file.filename}`;
    const fileName = String(file.originalname || file.filename).trim();
    nextCredentials[`${fieldKey}Url`] = fileUrl;
    nextCredentials[`${fieldKey}Name`] = fileName;
    if (/File$/i.test(fieldKey)) {
      const legacyBase = fieldKey.replace(/File$/i, "");
      nextCredentials[`${legacyBase}FileUrl`] = fileUrl;
      nextCredentials[`${legacyBase}FileName`] = fileName;
    }
    delete nextCredentials[fieldKey];
  });
  return nextCredentials;
};

const removeUploadedAppointmentFiles = async (files = {}) => {
  const uploadedFiles = listUploadedAppointmentFiles(files);
  await Promise.all(
    uploadedFiles.map(async (file) => {
      if (!file?.path) return;
      try {
        await fs.unlink(file.path);
      } catch {
        // Best-effort cleanup if validation fails after multer already saved the file.
      }
    }),
  );
};

const getSacramentFieldSchemaByName = (config, sacramentName) => {
  const normalizedName = normalizeSchemaName(sacramentName);
  const sacraments = config?.sacraments && typeof config.sacraments === "object" ? config.sacraments : {};
  for (const [schemaKey, schema] of Object.entries(sacraments)) {
    const aliases = Array.isArray(schema?.aliases) ? schema.aliases.map((item) => normalizeSchemaName(item)) : [];
    if (
      aliases.includes(normalizedName) ||
      normalizeSchemaName(schemaKey) === normalizedName ||
      normalizeSchemaName(schema?.label) === normalizedName ||
      (schemaKey === "death_mass" && (normalizedName.includes("funeral") || normalizedName.includes("death")))
    ) {
      const resolvedFields = ensureSacramentRequiredFieldSchema(
        Array.isArray(schema?.fields) ? schema.fields : [],
        sacramentName,
      );
      return normalizedName.includes("marriage") ? migrateMarriageFormSchemaFields(resolvedFields) : resolvedFields;
    }
  }
  return ensureSacramentRequiredFieldSchema(
    Array.isArray(sacraments.default?.fields) ? sacraments.default.fields : [],
    sacramentName,
  );
};

const mergeStoredChecklistWithTemplate = (storedChecklist, templateSteps) => {
  const templateChecklist = buildChecklistFromTemplateSteps(templateSteps);
  if (!templateChecklist.length) return Array.isArray(storedChecklist) ? storedChecklist : [];
  const stored = Array.isArray(storedChecklist) ? storedChecklist : [];
  const used = new Set();
  const taskKey = (label) => String(label || "").trim().toLowerCase();
  const takeMatch = (label, stepIndex) => {
    const key = taskKey(label);
    const searchSteps = [stepIndex, ...stored.map((_step, index) => index).filter((index) => index !== stepIndex)];
    for (const currentStepIndex of searchSteps) {
      const tasks = stored[currentStepIndex]?.tasks;
      if (!Array.isArray(tasks)) continue;
      const taskIndex = tasks.findIndex(
        (task, index) => !used.has(`${currentStepIndex}:${index}`) && taskKey(task?.label || task) === key,
      );
      if (taskIndex >= 0) {
        used.add(`${currentStepIndex}:${taskIndex}`);
        return tasks[taskIndex];
      }
    }
    return null;
  };
  return templateChecklist.map((step, stepIndex) => ({
    title: step.title,
    tasks: step.tasks.map((task) => {
      const previous = takeMatch(task.label, stepIndex);
      if (!previous || typeof previous !== "object") return task;
      return {
        ...task,
        done: Boolean(previous.done),
        nextScheduleDateTime: previous.nextScheduleDateTime || null,
        ...(previous.lastUncheckReason ? { lastUncheckReason: previous.lastUncheckReason } : {}),
        ...(previous.lastUncheckedAt ? { lastUncheckedAt: previous.lastUncheckedAt } : {}),
      };
    }),
  }));
};

const buildChecklistFromTemplateSteps = (steps = []) =>
  (Array.isArray(steps) ? steps : [])
    .map((step) => ({
      title: String(step?.title || "").trim() || "Step",
      tasks: (Array.isArray(step?.tasks) ? step.tasks : [])
        .map((task) => ({
          label: typeof task === "string" ? task.trim() : String(task?.label || task?.title || "").trim(),
          done: false,
          nextScheduleDateTime: null,
        }))
        .filter((task) => task.label),
    }))
    .filter((step) => step.tasks.length > 0);

const normalizeProgressTemplateStepsInput = (rawSteps = []) =>
  (Array.isArray(rawSteps) ? rawSteps : [])
    .map((step, index) => ({
      title: String(step?.title || `Step ${index + 1}`).trim(),
      tasks: (Array.isArray(step?.tasks) ? step.tasks : [])
        .map((task) =>
          String(typeof task === "string" ? task : task?.label || task?.title || "")
            .trim(),
        )
        .filter(Boolean),
    }))
    .filter((step) => step.title && step.tasks.length > 0);

const mapProgressTemplateStepRow = (row = {}) => ({
  stepID: Number(row.stepID),
  stepOrder: Number(row.stepOrder),
  title: String(row.title || "").trim(),
  tasks: (Array.isArray(row.tasks) ? row.tasks : [])
    .map((task) => (typeof task === "string" ? task.trim() : String(task?.label || task?.title || "").trim()))
    .filter(Boolean),
});

const mapProgressTemplateResponse = (templateRow = {}, stepRows = []) => ({
  templateID: Number(templateRow.templateID),
  scope: String(templateRow.scope || ""),
  sacramentID: templateRow.sacramentID === null || templateRow.sacramentID === undefined ? null : Number(templateRow.sacramentID),
  schemaID: templateRow.schemaID === null || templateRow.schemaID === undefined ? null : Number(templateRow.schemaID),
  specialSacramentName: templateRow.specialSacramentName || null,
  templateName: String(templateRow.templateName || "").trim(),
  sacramentName: templateRow.sacramentName || null,
  isActive: templateRow.isActive !== false,
  steps: (Array.isArray(stepRows) ? stepRows : [])
    .map(mapProgressTemplateStepRow)
    .sort((left, right) => left.stepOrder - right.stepOrder),
});

const parseProgressTemplatePayload = (body = {}, { requireSteps = false } = {}) => {
  const scope = String(body?.scope || "").trim();
  if (!["sacrament", "special_sacrament"].includes(scope)) {
    throw new Error("Invalid template scope.");
  }

  const sacramentID = scope === "sacrament" ? Number(body?.sacramentID) : null;
  const schemaID = scope === "special_sacrament" ? Number(body?.schemaID) : null;
  const templateName = String(body?.templateName || "").trim();
  const isActive = body?.isActive !== false;

  if (scope === "sacrament" && (!Number.isInteger(sacramentID) || sacramentID <= 0)) {
    throw new Error("A valid sacrament is required.");
  }
  if (scope === "special_sacrament" && (!Number.isInteger(schemaID) || schemaID <= 0)) {
    throw new Error("A valid special sacrament form is required.");
  }
  if (!templateName) {
    throw new Error("Template name is required.");
  }

  const payload = {
    scope,
    sacramentID: scope === "sacrament" ? sacramentID : null,
    schemaID: scope === "special_sacrament" ? schemaID : null,
    templateName,
    isActive,
  };

  if (requireSteps || Object.prototype.hasOwnProperty.call(body || {}, "steps")) {
    payload.steps = normalizeProgressTemplateStepsInput(body?.steps);
  }

  return payload;
};

const fetchProgressTemplateById = async (templateID, dbClient = { query }) => {
  const result = await dbClient.query(
    `
      SELECT
        t."templateID",
        t.scope,
        t."sacramentID",
        t."schemaID",
        t."templateName",
        t."isActive",
        s."sacramentName",
        sfs."specialSacramentName"
      FROM progress_templates t
      LEFT JOIN sacraments s ON s."sacramentID" = t."sacramentID"
      LEFT JOIN special_sacraments_form_schemas sfs ON sfs."schemaID" = t."schemaID"
      WHERE t."templateID" = $1
      LIMIT 1
    `,
    [templateID],
  );
  return result.rows[0] || null;
};

const fetchProgressTemplateSteps = async (templateID, dbClient = { query }) => {
  const result = await dbClient.query(
    `
      SELECT "stepID", "stepOrder", title, tasks
      FROM progress_template_steps
      WHERE "templateID" = $1
        AND "isActive" = TRUE
      ORDER BY "stepOrder" ASC, "stepID" ASC
    `,
    [templateID],
  );
  return result.rows;
};

const replaceProgressTemplateSteps = async (templateID, steps, dbClient = { query }) => {
  const normalizedSteps = normalizeProgressTemplateStepsInput(steps);

  await dbClient.query(`DELETE FROM progress_template_steps WHERE "templateID" = $1`, [templateID]);
  for (let index = 0; index < normalizedSteps.length; index += 1) {
    const step = normalizedSteps[index];
    await dbClient.query(
      `
        INSERT INTO progress_template_steps ("templateID", "stepOrder", title, tasks, "updatedAt")
        VALUES ($1, $2, $3, $4::jsonb, NOW())
      `,
      [templateID, index + 1, step.title, JSON.stringify(step.tasks)],
    );
  }
  await dbClient.query(`UPDATE progress_templates SET "updatedAt" = NOW() WHERE "templateID" = $1`, [templateID]);
  return normalizedSteps;
};

const normalizeProgressChecklistPayload = (rawChecklist) => {
  if (!Array.isArray(rawChecklist)) return null;
  return rawChecklist
    .map((step, stepIndex) => ({
      title: String(step?.title || `Step ${stepIndex + 1}`).trim() || `Step ${stepIndex + 1}`,
      tasks: (Array.isArray(step?.tasks) ? step.tasks : [])
        .map((task) => {
          if (typeof task === "string") {
            const label = task.trim();
            return label ? { label, done: false, nextScheduleDateTime: null } : null;
          }
          const label = String(task?.label || task?.title || "").trim();
          if (!label) return null;
          const rawSchedule = String(task?.nextScheduleDateTime || "").trim();
          const lastUncheckReason = String(task?.lastUncheckReason || "").trim();
          const lastUncheckedAt = String(task?.lastUncheckedAt || "").trim();
          return {
            label,
            done: Boolean(task?.done),
            nextScheduleDateTime: rawSchedule || null,
            ...(lastUncheckReason ? { lastUncheckReason } : {}),
            ...(lastUncheckedAt ? { lastUncheckedAt } : {}),
          };
        })
        .filter(Boolean),
    }))
    .filter((step) => step.tasks.length > 0);
};

const normalizeProgressPaymentRecords = (rawRecords) => {
  if (!Array.isArray(rawRecords)) return [];
  return rawRecords
    .map((record, index) => {
      if (!record || typeof record !== "object") return null;
      const legacyAmount = Number(record.amount);
      const legacyNotes = String(record.notes || "").trim();
      return {
        recordID: String(record.recordID || record.id || `payment-${index + 1}`).trim() || `payment-${index + 1}`,
        invoiceNumber: String(record.invoiceNumber || record.invoiceNo || "").trim(),
        paymentDate: /^\d{4}-\d{2}-\d{2}$/.test(String(record.paymentDate || "").trim())
          ? String(record.paymentDate).trim()
          : null,
        ...(Number.isFinite(legacyAmount) && legacyAmount > 0 ? { amount: legacyAmount } : {}),
        ...(legacyNotes ? { notes: legacyNotes } : {}),
        receiptFileUrl: String(record.receiptFileUrl || record.receiptUrl || "").trim() || null,
        receiptFileName: String(record.receiptFileName || record.fileName || "").trim() || null,
        recordedAt: record.recordedAt || record.createdAt || null,
        recordedAtStep: Number.isInteger(Number(record.recordedAtStep)) ? Number(record.recordedAtStep) : null,
        recordedByAdminID:
          Number.isInteger(Number(record.recordedByAdminID)) && Number(record.recordedByAdminID) > 0
            ? Number(record.recordedByAdminID)
            : null,
        isArchived: Boolean(record.isArchived),
        archivedAt: record.archivedAt || null,
      };
    })
    .filter(Boolean);
};

const getAppointmentCredentialsObject = (credentials) => {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return {};
  return { ...credentials };
};

const readPaymentRecordsFromSources = ({ credentials } = {}) =>
  normalizeProgressPaymentRecords(getAppointmentCredentialsObject(credentials).paymentRecords);

const mergeCredentialsPaymentRecords = (credentials, paymentRecords) => ({
  ...getAppointmentCredentialsObject(credentials),
  paymentRecords: normalizeProgressPaymentRecords(paymentRecords),
});

const getActiveProgressPaymentRecords = (records = []) =>
  normalizeProgressPaymentRecords(records).filter((record) => !record.isArchived);

const sumProgressPaymentAmount = (records = []) =>
  getActiveProgressPaymentRecords(records).reduce((total, record) => total + Number(record.amount || 0), 0);

const hasRecordedProgressPayment = (records = []) =>
  getActiveProgressPaymentRecords(records).some((record) => Boolean(String(record.invoiceNumber || "").trim()));

const SPECIAL_PROGRAM_PAYMENT_STATUS = "free";

const isSpecialSacramentRecord = (row = {}) => {
  const specialID = Number(row.s_sacramentID ?? row.sSacramentID);
  if (Number.isInteger(specialID) && specialID > 0) return true;
  return String(row.requestType || "").trim().toLowerCase().includes("special sacrament");
};

const resolveAppointmentPaymentStatus = (row = {}) => {
  if (isSpecialSacramentRecord(row)) return SPECIAL_PROGRAM_PAYMENT_STATUS;
  const paymentRecords = readPaymentRecordsFromSources(row);
  if (hasRecordedProgressPayment(paymentRecords) || sumProgressPaymentAmount(paymentRecords) > 0) {
    return "paid";
  }
  return "unpaid";
};

const CHECKLIST_FULLY_COMPLETE_SQL = `
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(COALESCE(pt.checklist_data, '[]'::jsonb)) AS step
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(step->'tasks') = 'array' THEN step->'tasks'
        ELSE '[]'::jsonb
      END
    ) AS task
  ) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(pt.checklist_data, '[]'::jsonb)) AS step
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(step->'tasks') = 'array' THEN step->'tasks'
        ELSE '[]'::jsonb
      END
    ) AS task
    WHERE NOT (
      jsonb_typeof(task) = 'object'
      AND COALESCE((task->>'done')::boolean, FALSE) = TRUE
    )
  )
`;

const isChecklistFullyComplete = (checklist) => {
  const metrics = computeChecklistProgressMetrics(checklist);
  return metrics.totalTasks > 0 && metrics.completedTasks >= metrics.totalTasks;
};

const isProgressPaymentSatisfied = (paymentStatus, row = {}) => {
  const normalized = String(paymentStatus || "").trim().toLowerCase();
  if (normalized === "paid" || normalized === "free") return true;
  return Number(row?.s_sacramentID) > 0;
};

const computeProgressHistoryState = ({
  finishedAt = null,
  scheduledEventDateTime = null,
  priestID = null,
  paymentStatus = "",
  checklist = [],
  s_sacramentID = null,
} = {}) => {
  if (finishedAt) {
    return { pendingHistory: false, historyEligibleAt: null, isReadyForHistory: false };
  }
  const resolvedSchedule = toScheduledEventDateTimeOrNull(scheduledEventDateTime) || null;
  const hasSchedule = Boolean(resolvedSchedule);
  const hasPriest = Number(priestID) > 0;
  const ready =
    hasSchedule &&
    hasPriest &&
    isProgressPaymentSatisfied(paymentStatus, { s_sacramentID }) &&
    isChecklistFullyComplete(checklist);
  const isPast = hasSchedule && isScheduledEventDateTimePast(resolvedSchedule);
  return {
    pendingHistory: ready && !isPast,
    historyEligibleAt: ready && !isPast ? resolvedSchedule : null,
    isReadyForHistory: ready && isPast,
  };
};

const fetchPriestDisplayName = async (priestID) => {
  const id = Number(priestID);
  if (!Number.isInteger(id) || id <= 0) return "";
  const result = await query(
    `
      SELECT "fullName"
      FROM priests
      WHERE "priestID" = $1
      LIMIT 1
    `,
    [id],
  );
  return String(result.rows[0]?.fullName || "").trim();
};

const buildProgressResponse = async (appointmentID, row = {}) => {
  const priestID = Number(row.priestID);
  let priestName = String(row.priestName || "").trim();
  if (!priestName && Number.isInteger(priestID) && priestID > 0) {
    priestName = await fetchPriestDisplayName(priestID);
  }
  return toProgressResponse(appointmentID, {
    ...row,
    priestID: Number.isInteger(priestID) && priestID > 0 ? priestID : row.priestID,
    priestName,
  });
};

const toProgressResponse = (appointmentID, row = {}) => {
  const paymentRecords = readPaymentRecordsFromSources(row);
  const resolvedGiftAmount = sumProgressPaymentAmount(paymentRecords);
  const resolvedPaymentStatus = resolveAppointmentPaymentStatus({
    ...row,
    paymentRecords,
  });

  return {
    appointmentID: Number(appointmentID),
    progressID: row.progressID ? Number(row.progressID) : null,
    templateID: row.templateID ? Number(row.templateID) : null,
    checklist: Array.isArray(row.checklist_data) ? row.checklist_data : Array.isArray(row.checklist) ? row.checklist : [],
    paymentRecords,
    totalPaymentAmount: Number.isFinite(resolvedGiftAmount) ? Math.max(0, resolvedGiftAmount) : 0,
    paymentStatus: resolvedPaymentStatus,
    finalDetails: {
      eventDone: Boolean(row.eventDone),
      scheduledEventDateTime:
        toScheduledEventDateTimeOrNull(row.scheduledEventDateTime) ||
        toManilaScheduledEventDateTime(row.programEventDate, row.programStartTime) ||
        null,
      programEventDate: String(row.programEventDate || "").slice(0, 10) || "",
      programStartTime: normalizeTimeToHHMM(row.programStartTime) || "",
      programEndTime: normalizeTimeToHHMM(row.programEndTime) || "",
      programTimeSlots: normalizeOccupiedSlots(row.programTimeSlots, null, null),
      scheduledEventEndDateTime:
        toManilaScheduledEventDateTime(row.programEventDate, normalizeTimeToHHMM(row.programEndTime)) || null,
      conductedPriestID: (() => {
        const rawPriestID = Number(row.priestID);
        return Number.isInteger(rawPriestID) && rawPriestID > 0 ? rawPriestID : null;
      })(),
      priestName: String(row.priestName || "").trim(),
      priestComments: row.priestComments || "",
      secretaryRemarks: row.secretaryRemarks || "",
      giftAmount: resolvedGiftAmount || "0.00",
      giftOfferingsReceipts: [],
    },
    appointmentStatus: row.appointmentStatus || "",
    scheduleMinAdvanceDays:
      Number.isInteger(Number(row.scheduleMinAdvanceDays)) && Number(row.scheduleMinAdvanceDays) >= 0
        ? Number(row.scheduleMinAdvanceDays)
        : undefined,
    allowsImmediateSchedule: Number(row.scheduleMinAdvanceDays) === 0,
    finishedAt: row.finishedAt || null,
    pendingHistory:
      row.pendingHistory !== undefined
        ? Boolean(row.pendingHistory)
        : computeProgressHistoryState({
            finishedAt: row.finishedAt,
            scheduledEventDateTime: row.scheduledEventDateTime,
            priestID: row.priestID,
            paymentStatus: resolvedPaymentStatus,
            checklist: Array.isArray(row.checklist_data)
              ? row.checklist_data
              : Array.isArray(row.checklist)
                ? row.checklist
                : [],
            s_sacramentID: row.s_sacramentID,
          }).pendingHistory,
    historyEligibleAt:
      row.historyEligibleAt !== undefined
        ? row.historyEligibleAt || null
        : computeProgressHistoryState({
            finishedAt: row.finishedAt,
            scheduledEventDateTime: row.scheduledEventDateTime,
            priestID: row.priestID,
            paymentStatus: resolvedPaymentStatus,
            checklist: Array.isArray(row.checklist_data)
              ? row.checklist_data
              : Array.isArray(row.checklist)
                ? row.checklist
                : [],
            s_sacramentID: row.s_sacramentID,
          }).historyEligibleAt,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
};

const handleAppointmentDocumentUpload = (req, res, next) => {
  appointmentDocumentUpload.any()(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Each appointment file must be 10MB or smaller." });
    }
    return res.status(400).json({
      message: error.message || "Unable to upload appointment documents.",
    });
  });
};

const fetchAppointmentResponseById = async (appointmentID, dbClient = { query }) => {
  const result = await dbClient.query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        a."priestID",
        a."progressID",
        a."sacramentID",
        a."s_sacramentID",
        a.status::text AS status,
        CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
        a."requesterFullName",
        a.credentials,
        a.note,
        a."createdAt",
        a."finishedAt",
        s."sacramentName",
        ss."s_sacramentName" AS "specialSacramentName",
        p."fullName" AS "priestName",
        ars."viewedAt" AS "reviewViewedAt",
        ars."underReviewAt" AS "reviewUnderReviewAt",
        pt.checklist_data,
        pt."eventDone",
        (pt."progressID" IS NOT NULL) AS "hasProgressTracker"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN priests p ON p."priestID" = a."priestID"
      LEFT JOIN appointment_review_states ars
        ON ars."appointmentID" = a."appointmentID"
      LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [appointmentID],
  );
  return result.rows[0] ? toAppointmentResponseRow(result.rows[0]) : null;
};

const isEmptyProgressChecklist = (checklist) =>
  !Array.isArray(checklist) ||
  checklist.length === 0 ||
  checklist.every((step) => !Array.isArray(step?.tasks) || step.tasks.filter((task) => String(task?.label || task || "").trim()).length === 0);

const fetchProgressTemplateStepsForChecklist = async (templateID, dbClient = { query }) => {
  const result = await dbClient.query(
    `
      SELECT title, tasks, "stepOrder"
      FROM progress_template_steps
      WHERE "templateID" = $1
        AND "isActive" = TRUE
      ORDER BY "stepOrder" ASC, "stepID" ASC
    `,
    [templateID],
  );
  return result.rows;
};

const resolveSpecialProgramBaseSacramentName = (programName) => {
  const normalized = String(programName || "").trim().toLowerCase();
  if (!normalized) return "";
  if (
    normalized.includes("kasalan") ||
    normalized.includes("kasal") ||
    normalized.includes("wedding") ||
    normalized.includes("marriage")
  ) {
    return "Marriage";
  }
  if (
    normalized.includes("binyagan") ||
    normalized.includes("binyag") ||
    normalized.includes("baptism") ||
    normalized.includes("christening")
  ) {
    return "Baptism";
  }
  return "";
};

const findSacramentTemplateIdByName = async (sacramentName, dbClient = { query }) => {
  const aliases =
    String(sacramentName || "").trim().toLowerCase() === "baptism"
      ? ["baptism", "christening"]
      : [String(sacramentName || "").trim().toLowerCase()];
  const sacramentResult = await dbClient.query(
    `
      SELECT "sacramentID"
      FROM sacraments
      WHERE LOWER(TRIM("sacramentName")) = ANY($1::text[])
      ORDER BY "sacramentID" ASC
      LIMIT 1
    `,
    [aliases],
  );
  const sacramentID = Number(sacramentResult.rows[0]?.sacramentID);
  if (!Number.isInteger(sacramentID) || sacramentID <= 0) return null;
  const templateResult = await dbClient.query(
    `
      SELECT "templateID"
      FROM progress_templates
      WHERE scope = 'sacrament'
        AND "sacramentID" = $1
        AND "isActive" = TRUE
      ORDER BY "templateID" DESC
      LIMIT 1
    `,
    [sacramentID],
  );
  return templateResult.rows[0] ? Number(templateResult.rows[0].templateID) : null;
};

const resolveAppointmentProgressTemplate = async (
  { sacramentID, s_sacramentID, specialSacramentName },
  dbClient = { query },
) => {
  const specialID = Number(s_sacramentID);
  const isSpecialSacrament = Number.isInteger(specialID) && specialID > 0;

  if (isSpecialSacrament) {
    let normalizedSpecialName = String(specialSacramentName || "").trim();
    if (!normalizedSpecialName) {
      const programResult = await dbClient.query(
        `
          SELECT "s_sacramentName"
          FROM special_sacraments
          WHERE "s_sacramentID" = $1
          LIMIT 1
        `,
        [specialID],
      );
      normalizedSpecialName = String(programResult.rows[0]?.s_sacramentName || "").trim();
    }
    if (!normalizedSpecialName) return null;

    const aliasedSacramentName = resolveSpecialProgramBaseSacramentName(normalizedSpecialName);
    if (aliasedSacramentName) {
      const aliasedTemplateID = await findSacramentTemplateIdByName(aliasedSacramentName, dbClient);
      if (aliasedTemplateID) return aliasedTemplateID;
    }

    const specialSchema = await findSpecialSacramentSchemaByName(normalizedSpecialName, dbClient);
    const schemaID = Number(specialSchema?.schemaID);
    if (!Number.isInteger(schemaID) || schemaID <= 0) return null;

    await ensureSpecialSchemaProgressTemplate(schemaID, dbClient);
    const specialTemplateResult = await dbClient.query(
      `
        SELECT "templateID"
        FROM progress_templates
        WHERE scope = 'special_sacrament'
          AND "isActive" = TRUE
          AND "schemaID" = $1
        ORDER BY "templateID" DESC
        LIMIT 1
      `,
      [schemaID],
    );
    return specialTemplateResult.rows[0] ? Number(specialTemplateResult.rows[0].templateID) : null;
  }

  const regularSacramentID = Number(sacramentID);
  if (Number.isInteger(regularSacramentID) && regularSacramentID > 0) {
    const sacramentTemplateResult = await dbClient.query(
      `
        SELECT "templateID"
        FROM progress_templates
        WHERE scope = 'sacrament'
          AND "sacramentID" = $1
          AND "isActive" = TRUE
        ORDER BY "templateID" DESC
        LIMIT 1
      `,
      [regularSacramentID],
    );
    if (sacramentTemplateResult.rows[0]) {
      return Number(sacramentTemplateResult.rows[0].templateID);
    }
  }

  return null;
};

const attachResolvedProgressTemplate = async ({ appointment, progress }, dbClient = { query }) => {
  const currentTemplateID = Number(progress?.templateID) || null;
  const currentChecklist = Array.isArray(progress?.checklist_data) ? progress.checklist_data : [];
  const resolvedTemplateID = await resolveAppointmentProgressTemplate(
    {
      sacramentID: Number(appointment?.sacramentID) || null,
      s_sacramentID: Number(appointment?.s_sacramentID) || null,
      specialSacramentName: appointment?.specialSacramentName,
    },
    dbClient,
  );

  if (!resolvedTemplateID) {
    return {
      templateID: currentTemplateID > 0 ? currentTemplateID : null,
      checklist_data: currentChecklist,
    };
  }

  const stepRows = await fetchProgressTemplateStepsForChecklist(resolvedTemplateID, dbClient);
  const mergedChecklist = mergeStoredChecklistWithTemplate(currentChecklist, stepRows);
  const nextChecklist = mergedChecklist.length ? mergedChecklist : currentChecklist;
  const checklistChanged = JSON.stringify(nextChecklist) !== JSON.stringify(currentChecklist);

  const progressID = Number(progress?.progressID);
  const appointmentID = Number(appointment?.appointmentID || progress?.appointmentID);
  const templateChanged = currentTemplateID !== resolvedTemplateID;
  if (Number.isInteger(progressID) && progressID > 0 && (templateChanged || checklistChanged)) {
    await dbClient.query(
      `
        UPDATE progress_tracker
        SET "templateID" = $2,
            checklist_data = $3::jsonb,
            "updatedAt" = NOW()
        WHERE "progressID" = $1
      `,
      [progressID, resolvedTemplateID, JSON.stringify(nextChecklist)],
    );
  } else if (
    (!Number.isInteger(progressID) || progressID <= 0) &&
    Number.isInteger(appointmentID) &&
    appointmentID > 0
  ) {
    await dbClient.query(
      `
        INSERT INTO progress_tracker ("appointmentID", "templateID", checklist_data)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT ("appointmentID") DO UPDATE
        SET "templateID" = EXCLUDED."templateID",
            checklist_data = EXCLUDED.checklist_data,
            "updatedAt" = NOW()
      `,
      [appointmentID, resolvedTemplateID, JSON.stringify(nextChecklist)],
    );
  }

  return {
    templateID: resolvedTemplateID,
    checklist_data: nextChecklist,
  };
};

const resolveProgressConductedPriestID = async (appointmentID, appointment, rawFinalDetails = null) => {
  const fromPayload = Number(rawFinalDetails?.conductedPriestID);
  if (Number.isInteger(fromPayload) && fromPayload > 0) return fromPayload;

  const fromAppointment = Number(appointment?.priestID);
  if (Number.isInteger(fromAppointment) && fromAppointment > 0) return fromAppointment;

  const calendarResult = await query(
    `
      SELECT ce."priestID"
      FROM calendar_entries ce
      WHERE ce."appointmentID" = $1
        AND ce."priestID" IS NOT NULL
      ORDER BY ce."calendarID" DESC
      LIMIT 1
    `,
    [Number(appointmentID)],
  );
  const fromCalendar = Number(calendarResult.rows[0]?.priestID);
  if (Number.isInteger(fromCalendar) && fromCalendar > 0) return fromCalendar;

  return null;
};

const createAppointmentRequest = async (req, res, { createdByAdmin = false } = {}) => {
  try {
    const userID = toOptionalPositiveInteger(req.body?.userID);
    const sacramentID = toOptionalPositiveInteger(req.body?.sacramentID);
    const specialSacramentID = toOptionalPositiveInteger(req.body?.s_sacramentID);
    const specialSacramentName = String(req.body?.s_sacramentName || "").trim();
    const specialProgramDate = String(req.body?.specialProgramDate || "").trim();
    const requesterFullName = String(req.body?.requesterFullName || "").trim().slice(0, 255);
    const note = String(req.body?.note || "").trim();
    const parsedCredentials = parseAppointmentCredentialsInput(req.body?.credentials);

    if (Number.isNaN(userID)) {
      await removeUploadedAppointmentFiles(req.files);
      return res.status(400).json({ message: "userID must be a positive whole number when provided." });
    }
    if (Number.isNaN(sacramentID)) {
      await removeUploadedAppointmentFiles(req.files);
      return res.status(400).json({ message: "sacramentID must be a positive whole number when provided." });
    }
    if (Number.isNaN(specialSacramentID)) {
      await removeUploadedAppointmentFiles(req.files);
      return res.status(400).json({ message: "s_sacramentID must be a positive whole number when provided." });
    }
    if (!createdByAdmin && !userID) {
      await removeUploadedAppointmentFiles(req.files);
      return res.status(400).json({ message: "A valid userID is required." });
    }
    if (!requesterFullName) {
      await removeUploadedAppointmentFiles(req.files);
      return res.status(400).json({ message: "Requester full name is required." });
    }
    if (parsedCredentials === null) {
      await removeUploadedAppointmentFiles(req.files);
      return res.status(400).json({ message: "credentials must be valid JSON." });
    }

    if (userID) {
      const userResult = await query(
        `
          SELECT "userID"
          FROM users
          WHERE "userID" = $1
          LIMIT 1
        `,
        [userID],
      );
      if (userResult.rows.length === 0) {
        await removeUploadedAppointmentFiles(req.files);
        return res.status(404).json({ message: "User account not found." });
      }
    }

    let resolvedSacramentID = sacramentID;
    let resolvedSpecialSacramentID = specialSacramentID;
    let resolvedSacramentName = "";
    let resolvedSpecialSacramentName = specialSacramentName;

    if (resolvedSacramentID) {
      const sacramentResult = await query(
        `
          SELECT "sacramentID", "sacramentName", COALESCE("isArchived", FALSE) AS "isArchived"
          FROM sacraments
          WHERE "sacramentID" = $1
          LIMIT 1
        `,
        [resolvedSacramentID],
      );
      if (sacramentResult.rows.length === 0) {
        await removeUploadedAppointmentFiles(req.files);
        return res.status(404).json({ message: "Sacrament not found." });
      }
      if (sacramentResult.rows[0].isArchived) {
        await removeUploadedAppointmentFiles(req.files);
        return res.status(400).json({ message: "This sacrament is no longer available." });
      }
      resolvedSacramentName = String(sacramentResult.rows[0].sacramentName || "").trim();
    }

    const isSpecialProgramRequest = Boolean(resolvedSpecialSacramentID || resolvedSpecialSacramentName);
    if (isSpecialProgramRequest) {
      const specialResult = resolvedSpecialSacramentID
        ? await query(
            `
              SELECT "s_sacramentID", "s_sacramentName", "maxSlots", "currentAppliedCount", "isUnlimitedSlots"
              FROM special_sacraments
              WHERE "s_sacramentID" = $1
              LIMIT 1
            `,
            [resolvedSpecialSacramentID],
          )
        : await query(
            `
              SELECT "s_sacramentID", "s_sacramentName", "maxSlots", "currentAppliedCount", "isUnlimitedSlots"
              FROM special_sacraments
              WHERE LOWER(TRIM("s_sacramentName")) = LOWER(TRIM($1))
                AND (
                  $2::date IS NULL
                  OR ("timeDate" AT TIME ZONE 'Asia/Manila')::date = $2::date
                  OR "timeDate"::date = $2::date
                )
              ORDER BY "timeDate" DESC, "s_sacramentID" DESC
              LIMIT 1
            `,
            [resolvedSpecialSacramentName, DATE_ONLY_REGEX.test(specialProgramDate) ? specialProgramDate : null],
          );

      if (specialResult.rows.length === 0) {
        await removeUploadedAppointmentFiles(req.files);
        return res.status(404).json({ message: "Special sacramental program not found." });
      }

      const specialProgram = specialResult.rows[0];
      resolvedSpecialSacramentID = Number(specialProgram.s_sacramentID);
      resolvedSpecialSacramentName = String(specialProgram.s_sacramentName || "").trim();
      resolvedSacramentID = null;

      if (!createdByAdmin && userID) {
        const existingApplication = await query(
          `
            SELECT "appointmentID"
            FROM appointments
            WHERE "userID" = $1
              AND "s_sacramentID" = $2
              AND "isArchived" = FALSE
            LIMIT 1
          `,
          [userID, resolvedSpecialSacramentID],
        );
        if (existingApplication.rows.length > 0) {
          await removeUploadedAppointmentFiles(req.files);
          return res.status(409).json({
            message: "You already applied for this special program. Each account can apply only once.",
          });
        }
      }

      const isUnlimited = Boolean(specialProgram.isUnlimitedSlots);
      const maxSlots = Number(specialProgram.maxSlots);
      if (!isUnlimited && Number.isInteger(maxSlots) && maxSlots > 0) {
        const appliedCountResult = await query(
          `
            SELECT COUNT(*)::INT AS count
            FROM appointments
            WHERE "s_sacramentID" = $1
              AND status <> 'CANCELLED'
              AND "isArchived" = FALSE
          `,
          [resolvedSpecialSacramentID],
        );
        const appliedCount = Number(appliedCountResult.rows[0]?.count || 0);
        if (appliedCount >= maxSlots) {
          await removeUploadedAppointmentFiles(req.files);
          return res.status(409).json({ message: "This special sacramental program is already full." });
        }
      }
    }

    if (!resolvedSacramentID && !resolvedSpecialSacramentID) {
      await removeUploadedAppointmentFiles(req.files);
      return res.status(400).json({ message: "A valid sacrament or special sacramental program is required." });
    }

    const requestType = resolvedSpecialSacramentID ? "Special Sacrament Program" : "Appointment";

    let fieldSchema = [];
    if (resolvedSpecialSacramentID) {
      const specialSchema = await getSpecialSacramentSchemaByName(resolvedSpecialSacramentName);
      fieldSchema = Array.isArray(specialSchema?.fields) ? specialSchema.fields : [];
    } else {
      const sacramentSchemaConfig = await getStoredSacramentFormSchemaConfig();
      fieldSchema = getSacramentFieldSchemaByName(sacramentSchemaConfig, resolvedSacramentName);
    }

    const credentials = attachAppointmentDocumentFiles(
      sanitizeAppointmentCredentialsRecord(parsedCredentials, fieldSchema, {
        schemaKeysOnly: Boolean(resolvedSpecialSacramentID),
      }),
      req.files,
    );

    const credentialValidationError = validateCredentialsAgainstFieldSchema(credentials, fieldSchema);
    if (credentialValidationError) {
      await removeUploadedAppointmentFiles(req.files);
      return res.status(400).json({ message: credentialValidationError });
    }

    const storedRequesterFullName =
      createdByAdmin && !userID
        ? getWalkInRequesterName({
            credentials,
            sacramentName: resolvedSpecialSacramentName || resolvedSacramentName,
            requestType,
          }) || requesterFullName
        : requesterFullName;

    const status = createdByAdmin ? "CONFIRMED" : "PENDING";
    const client = await pool.connect();
    let createdAppointmentID = null;
    try {
      await client.query("BEGIN");
      const insertResult = await client.query(
        `
          INSERT INTO appointments (
            "userID",
            "sacramentID",
            "s_sacramentID",
            status,
            "requesterFullName",
            credentials,
            note
          )
          VALUES (
            $1,
            $2,
            $3,
            $4::appointment_status,
            $5,
            $6::jsonb,
            $7
          )
          RETURNING "appointmentID"
        `,
        [
          userID,
          resolvedSacramentID,
          resolvedSpecialSacramentID,
          status,
          storedRequesterFullName.slice(0, 255),
          JSON.stringify(credentials),
          note || null,
        ],
      );
      createdAppointmentID = Number(insertResult.rows[0].appointmentID);
      await placeAppointmentUploads(req.files, {
        sacramentID: resolvedSacramentID,
        sacramentName: resolvedSacramentName,
        specialSacramentID: resolvedSpecialSacramentID,
        specialSacramentName: resolvedSpecialSacramentName,
        appointmentID: createdAppointmentID,
      });
      const storedCredentials = attachAppointmentDocumentFiles(
        sanitizeAppointmentCredentialsRecord(parsedCredentials, fieldSchema, {
          schemaKeysOnly: Boolean(resolvedSpecialSacramentID),
        }),
        req.files,
      );
      await client.query(
        `UPDATE appointments SET credentials = $1::jsonb WHERE "appointmentID" = $2`,
        [JSON.stringify(storedCredentials), createdAppointmentID],
      );

      const templateID = await resolveAppointmentProgressTemplate(
        {
          sacramentID: resolvedSacramentID,
          s_sacramentID: resolvedSpecialSacramentID,
          specialSacramentName: resolvedSpecialSacramentName,
        },
        client,
      );
      let checklistData = [];
      if (templateID) {
        const stepsResult = await client.query(
          `
            SELECT title, tasks, "stepOrder"
            FROM progress_template_steps
            WHERE "templateID" = $1
              AND "isActive" = TRUE
            ORDER BY "stepOrder" ASC, "stepID" ASC
          `,
          [templateID],
        );
        checklistData = buildChecklistFromTemplateSteps(stepsResult.rows);
      }

      const progressResult = await client.query(
        `
          INSERT INTO progress_tracker ("appointmentID", "templateID", checklist_data)
          VALUES ($1, $2, $3::jsonb)
          RETURNING "progressID"
        `,
        [createdAppointmentID, templateID, JSON.stringify(checklistData)],
      );
      const progressID = Number(progressResult.rows[0].progressID);
      await client.query(
        `
          UPDATE appointments
          SET "progressID" = $1
          WHERE "appointmentID" = $2
        `,
        [progressID, createdAppointmentID],
      );

      if (resolvedSpecialSacramentID) {
        const programSchedule = await resolveSpecialProgramEventSchedule(resolvedSpecialSacramentID, client);
        if (programSchedule?.scheduledEventDateTime) {
          await applySpecialProgramScheduleToAppointment(createdAppointmentID, programSchedule, client);
        }
        await refreshSpecialSacramentAppliedCounts(client);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    if (resolvedSpecialSacramentID && createdAppointmentID) {
      const programSchedule = await resolveSpecialProgramEventSchedule(resolvedSpecialSacramentID);
      if (programSchedule?.scheduledEventDateTime) {
        await persistAppointmentCredentialSchedule(createdAppointmentID, programSchedule.scheduledEventDateTime);
        await removeAppointmentCalendarEntry(createdAppointmentID);
      }
    }

    const createdAppointment = await fetchAppointmentResponseById(createdAppointmentID);
    if (!createdByAdmin) {
      try {
        const isSpecialProgram = Boolean(resolvedSpecialSacramentID);
        const sacramentLabel =
          createdAppointment?.resolvedSacramentName || resolvedSpecialSacramentName || resolvedSacramentName || "sacrament";
        await createAdminNotification({
          adminID: 1,
          type: isSpecialProgram ? "special_sacrament_program" : "appointment_request",
          title: isSpecialProgram ? "New special sacrament program application" : "New appointment request",
          body: isSpecialProgram
            ? `${requesterFullName} applied for the ${sacramentLabel} special sacrament program.`
            : `${requesterFullName} submitted a ${sacramentLabel} appointment request.`,
          severity: "info",
          metadata: {
            path: "/admin/appointment-requests",
            appointmentID: createdAppointmentID,
            s_sacramentID: isSpecialProgram ? resolvedSpecialSacramentID : null,
          },
        });
      } catch (notificationError) {
        console.error("Appointment request notification error:", notificationError);
      }
    }

    return res.status(201).json(createdAppointment);
  } catch (error) {
    await removeUploadedAppointmentFiles(req.files);
    console.error("Appointment create error:", error);
    return res.status(500).json({ message: "Unable to create appointment." });
  }
};

app.post("/appointments/admin", handleAppointmentDocumentUpload, (req, res) =>
  createAppointmentRequest(req, res, { createdByAdmin: true }),
);
app.post("/appointments", handleAppointmentDocumentUpload, (req, res) =>
  createAppointmentRequest(req, res, { createdByAdmin: false }),
);

app.get("/appointments", async (req, res) => {
  try {
    await promoteDueAppointmentsToHistory();
    const statusInput = String(req.query?.status || "").trim().toUpperCase();
    const hasStatus = Boolean(statusInput);
    if (hasStatus && !APPOINTMENT_ALLOWED_STATUSES.has(statusInput)) {
      return res.status(400).json({ message: "status must be one of PENDING, CONFIRMED, or CANCELLED." });
    }

    const result = await query(
      `
        SELECT
          a."appointmentID",
          a."userID",
          a."priestID",
          a."progressID",
          a."sacramentID",
          a."s_sacramentID",
          a.status::text AS status,
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
          a."requesterFullName",
          a.credentials,
        a.note,
        a."createdAt",
        a."finishedAt",
        s."sacramentName",
        ss."s_sacramentName" AS "specialSacramentName",
        p."fullName" AS "priestName",
        ars."viewedAt" AS "reviewViewedAt",
        ars."underReviewAt" AS "reviewUnderReviewAt",
        pt."eventDone",
        pt.checklist_data,
        (pt."progressID" IS NOT NULL) AS "hasProgressTracker"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN priests p ON p."priestID" = a."priestID"
      LEFT JOIN appointment_review_states ars
        ON ars."appointmentID" = a."appointmentID"
      LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
      WHERE a."isArchived" = FALSE
        AND ($1::text IS NULL OR a.status::text = $1)
      ORDER BY a."createdAt" DESC, a."appointmentID" DESC
      `,
      [hasStatus ? statusInput : null],
    );

    return res.json(result.rows.map(toAppointmentResponseRow));
  } catch (error) {
    console.error("Appointments fetch error:", error);
    return res.status(500).json({ message: "Unable to load appointments." });
  }
});

const REPORT_STATUS_FILTERS = new Set(["all", "ongoing", "completed", "cancelled", "finished"]);
const REPORT_PAYMENT_FILTERS = new Set(["all", "paid", "unpaid", "free"]);
const REPORT_SORT_FILTERS = new Set(["newest", "oldest"]);
const REPORT_REQUEST_TYPE_FILTERS = new Set(["all", "appointment", "special_program", "certificate"]);
const REPORT_DEFAULT_APPOINTMENT_TYPES = ["Baptism", "Marriage", "Funeral Mass", "Blessing"];
const REPORT_DEFAULT_SPECIAL_PROGRAM_TYPES = ["Kasalan Ng Bayan", "Binyagan Ng Bayan"];
const REPORT_DEFAULT_CERTIFICATE_TYPES = [
  "Marriage Certificate",
  "Baptismal Certificate",
  "Confirmation Certificate",
];

const readReportCredentialText = (credentials, keys) => {
  const source = credentials && typeof credentials === "object" ? credentials : {};
  for (const key of keys) {
    const value = String(source?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const joinReportPersonName = (credentials, firstKeys, lastKeys, fullKeys) => {
  const firstName = readReportCredentialText(credentials, firstKeys);
  const lastName = readReportCredentialText(credentials, lastKeys);
  const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
  return composed || readReportCredentialText(credentials, fullKeys);
};

const getReportSacramentalPersonName = (appointment) => {
  const credentials = appointment?.credentials && typeof appointment.credentials === "object" ? appointment.credentials : {};
  const sacramentName = String(appointment?.resolvedSacramentName || appointment?.specialSacramentName || appointment?.sacramentName || "")
    .trim()
    .toLowerCase();
  const requestType = String(appointment?.requestType || "").trim().toLowerCase();
  const isMarriage = sacramentName.includes("marriage") || sacramentName.includes("kasalan");
  const isBaptism = sacramentName.includes("baptism") || sacramentName.includes("christening") || sacramentName.includes("binyagan");
  const isFuneral = sacramentName.includes("funeral") || sacramentName.includes("death");
  const isBlessing = sacramentName.includes("blessing");

  if (isBlessing) return "Blessings";
  if (isMarriage) {
    const groomName = joinReportPersonName(
      credentials,
      ["groomFirstName", "groomGivenName"],
      ["groomLastName", "groomSurname"],
      ["groomFullName", "groomName"],
    );
    const brideName = joinReportPersonName(
      credentials,
      ["brideFirstName", "brideGivenName"],
      ["brideLastName", "brideSurname"],
      ["brideFullName", "brideName"],
    );
    if (groomName && brideName) return `${groomName} & ${brideName}`;
    return groomName || brideName;
  }
  if (isBaptism) {
    return (
      joinReportPersonName(
        credentials,
        ["childFirstName", "childGivenName"],
        ["childLastName", "childSurname", "childFamilyName"],
        ["childFullName", "fullName"],
      ) || resolveChildDisplayName(credentials)
    );
  }
  if (isFuneral) {
    return joinReportPersonName(
      credentials,
      ["deceasedFirstName"],
      ["deceasedLastName"],
      ["deceasedFullName", "deceasedName"],
    );
  }
  if (requestType === "certificate") {
    return joinReportPersonName(credentials, ["firstName"], ["lastName"], ["fullName", "name"]);
  }
  return "";
};

const REPORT_NON_SUBJECT_NAME_KEYS = new Set([
  "fathername",
  "mothername",
  "familycontactname",
  "contactname",
  "contactpersonname",
  "requestername",
  "requesterfullname",
]);

const collectReportSubjectNames = (credentials = {}) =>
  collectCertificateCredentialNames(
    Object.fromEntries(
      Object.entries(credentials && typeof credentials === "object" ? credentials : {}).filter(
        ([key]) => !REPORT_NON_SUBJECT_NAME_KEYS.has(String(key || "").trim().toLowerCase()),
      ),
    ),
  );

const resolveReportPersonName = (record, fallbackNames = []) => {
  const fromCredentials =
    getReportSacramentalPersonName(record) || collectReportSubjectNames(record?.credentials).join(" & ");
  if (fromCredentials) return fromCredentials;
  for (const fallback of fallbackNames) {
    const text = String(fallback || "").trim();
    if (text) return text;
  }
  return "Unknown person";
};

const getWalkInRequesterName = ({ credentials, sacramentName, requestType }) =>
  readReportCredentialText(credentials, ["requesterFullName", "requesterName", "familyContactName", "contactPersonName"]) ||
  getReportSacramentalPersonName({ credentials, sacramentName, requestType }) ||
  collectReportSubjectNames(credentials)[0] ||
  readReportCredentialText(credentials, ["fatherName", "motherName"]);

const formatCertificateTypeLabel = (value, fallback = "Certificate Request") => {
  const label = String(value || "").trim() || fallback;
  if (/certificate/i.test(label)) return label;
  return `${label} Certificate`;
};

const getCertificateInvoiceNumber = (credentials = {}) =>
  String(credentials?.invoiceNumber || credentials?.receiptNumber || "").trim();

const isCertificatePersonNameKey = (key) => {
  const normalized = String(key || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("phone") || normalized.includes("contact") || normalized.includes("number")) return false;
  return normalized === "name" || normalized.endsWith("name") || normalized.includes("fullname");
};

const readCertificateCredentialText = (credentials, keys) => {
  const source = credentials && typeof credentials === "object" ? credentials : {};
  for (const key of keys) {
    const text = String(source[key] || "").trim();
    if (text) return text;
  }
  return "";
};

const resolveCertificateSubjectName = (certificateType, credentials = {}) => {
  const type = String(certificateType || "").trim().toLowerCase();
  if (type.includes("marriage")) {
    const groom = readCertificateCredentialText(credentials, ["groomFullName", "groomName"]);
    const bride = readCertificateCredentialText(credentials, ["brideFullName", "brideName"]);
    return [groom, bride].filter(Boolean).join(" & ");
  }
  if (type.includes("baptism")) {
    return readCertificateCredentialText(credentials, ["childFullName", "childName", "fullName", "name"]);
  }
  if (type.includes("confirmation")) {
    return readCertificateCredentialText(credentials, ["fullName", "name", "confirmandName", "candidateName", "childFullName"]);
  }
  return collectCertificateCredentialNames(credentials).join(" & ");
};

const collectCertificateCredentialNames = (credentials = {}) => {
  const source = credentials && typeof credentials === "object" ? credentials : {};
  const names = [];
  const seen = new Set();
  const add = (value) => {
    const text = String(value || "").trim();
    if (!text || /\.(png|jpe?g|pdf|webp|docx?)$/i.test(text)) return;
    const marker = text.toLowerCase();
    if (seen.has(marker)) return;
    seen.add(marker);
    names.push(text);
  };
  add(resolveChildDisplayName(source));
  for (const key of ["childFullName", "fullName", "name", "brideFullName", "groomFullName"]) {
    if (isCertificatePersonNameKey(key)) add(source[key]);
  }
  for (const [key, value] of Object.entries(source)) {
    if (!isCertificatePersonNameKey(key) || isFamilyOrPartNameCredentialKey(key)) continue;
    add(value);
  }
  return names;
};

const resolveCertificatePaymentStatus = ({ credentials } = {}) =>
  getCertificateInvoiceNumber(credentials) ? "paid" : "unpaid";

const resolveCertificateReportStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "completed") return "Completed";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";
  return "Ongoing";
};

const getReportAppointmentTypeLabel = (appointment) => {
  const sacramentName = String(
    appointment?.resolvedSacramentName || appointment?.specialSacramentName || appointment?.sacramentName || "",
  ).trim();
  const requestType =
    Number(appointment?.s_sacramentID) > 0 ? "Special Program" : String(appointment?.requestType || "").trim();
  if (sacramentName && requestType && !/^(appointment|special program)$/i.test(requestType)) return `${sacramentName} (${requestType})`;
  return sacramentName || requestType || "Appointment";
};

const getReportAppointmentStatusLabel = (appointment) => {
  const normalizedStatus = String(appointment?.status || "").trim().toUpperCase();
  if (normalizedStatus === "CANCELLED" || normalizedStatus === "CANCELED") return "Cancelled";
  const paymentLabel = getReportPaymentStatusLabel(appointment);
  const paymentSatisfied = paymentLabel === "Paid" || paymentLabel === "Free";
  const hasSchedule = Boolean(appointment?.scheduledEventDateTime);
  if (appointment?.finishedAt) return "Completed";
  const eventDone = Boolean(appointment?.eventDone);
  if (eventDone && paymentSatisfied && hasSchedule && isScheduledEventDateTimePast(appointment.scheduledEventDateTime)) {
    return "Completed";
  }
  return "Ongoing";
};

const getReportPaymentStatusLabel = (appointment) => {
  if (isSpecialSacramentRecord(appointment) || String(appointment?.paymentStatus || "").trim().toLowerCase() === "free") {
    return "Free";
  }
  const normalizedStatus = String(appointment?.paymentStatus || "").trim().toLowerCase();
  if (normalizedStatus === "paid") return "Paid";
  if (hasRecordedProgressPayment(appointment?.paymentRecords)) return "Paid";
  const recordsTotal = sumProgressPaymentAmount(appointment?.paymentRecords);
  return recordsTotal > 0 ? "Paid" : "Unpaid";
};

app.get("/reports/records", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const startDate = String(req.query?.start || "").trim();
    const endDate = String(req.query?.end || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: "start and end must be YYYY-MM-DD dates." });
    }

    const appointmentType = String(req.query?.appointmentType || req.query?.type || "all").trim();
    const requestType = String(req.query?.requestType || "all").trim().toLowerCase();
    const appointmentStatusRaw = String(req.query?.appointmentStatus || "all").trim().toLowerCase();
    const appointmentStatus = appointmentStatusRaw === "finished" ? "completed" : appointmentStatusRaw;
    const paymentStatus = String(req.query?.paymentStatus || "all").trim().toLowerCase();
    const sort = String(req.query?.sort || "newest").trim().toLowerCase();

    if (!REPORT_REQUEST_TYPE_FILTERS.has(requestType)) {
      return res.status(400).json({ message: "requestType must be all, appointment, special_program, or certificate." });
    }
    if (!REPORT_STATUS_FILTERS.has(appointmentStatusRaw)) {
      return res.status(400).json({ message: "appointmentStatus must be all, ongoing, completed, or cancelled." });
    }
    if (!REPORT_PAYMENT_FILTERS.has(paymentStatus)) {
      return res.status(400).json({ message: "paymentStatus must be all, paid, unpaid, or free." });
    }
    if (!REPORT_SORT_FILTERS.has(sort)) {
      return res.status(400).json({ message: "sort must be newest or oldest." });
    }

    const typeFilter = appointmentType.toLowerCase() === "all" ? "" : appointmentType;
    const sortDirection = sort === "oldest" ? "ASC" : "DESC";

    const typesResult = await query(
      `
        SELECT DISTINCT
          TRIM(COALESCE(ss."s_sacramentName", s."sacramentName")) AS "appointmentType",
          (COALESCE(a."s_sacramentID", 0) > 0) AS "isSpecialProgram"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        WHERE a."isArchived" = FALSE
          AND TRIM(COALESCE(ss."s_sacramentName", s."sacramentName")) <> ''
        ORDER BY 1 ASC
      `,
    );

    const certificateTypesResult = await query(
      `
        SELECT DISTINCT TRIM(COALESCE(ct."formSchema"->>'label', 'Certificate Request')) AS "certificateType"
        FROM cert_request cr
        LEFT JOIN certificate_type ct ON ct."certificateTypeID" = cr."certificateTypeID"
        WHERE TRIM(COALESCE(ct."formSchema"->>'label', 'Certificate Request')) <> ''
        ORDER BY 1 ASC
      `,
    );

    const managedSacramentTypesResult = await query(
      `SELECT "sacramentName" FROM sacraments WHERE COALESCE("isArchived", FALSE) = FALSE ORDER BY "sacramentName" ASC`,
    );
    const appointmentTypeOptions = Array.from(
      new Set([
        ...managedSacramentTypesResult.rows.map((row) => String(row.sacramentName || "").trim()),
        ...typesResult.rows
          .filter((row) => !row.isSpecialProgram)
          .map((row) => String(row.appointmentType || "").trim())
          .filter((typeName) => typeName && !/certificate/i.test(typeName)),
      ]),
    ).filter(Boolean).sort((left, right) => left.localeCompare(right));
    const listedSpecialPrograms = await query(
      `
        SELECT DISTINCT TRIM(name) AS "programName"
        FROM (
          SELECT ce.title AS name
          FROM calendar_entries_resolved ce
          WHERE ce."s_sacramentID" IS NOT NULL
            AND ce."eventDate" >= (NOW() AT TIME ZONE 'Asia/Manila')::date
          UNION
          SELECT ss."s_sacramentName" AS name
          FROM appointments a
          LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
          WHERE COALESCE(a."s_sacramentID", 0) > 0
            AND a."isArchived" = FALSE
        ) programs
        WHERE LENGTH(TRIM(COALESCE(name, ''))) > 0
        ORDER BY 1 ASC
      `,
    );
    const specialProgramTypeOptions = listedSpecialPrograms.rows
      .map((row) => String(row.programName || "").trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const certificateTypeOptions = Array.from(
      new Set([
        ...REPORT_DEFAULT_CERTIFICATE_TYPES,
        ...certificateTypesResult.rows.map((row) => formatCertificateTypeLabel(row.certificateType)).filter(Boolean),
      ]),
    ).sort((left, right) => left.localeCompare(right));
    const appointmentTypes = [...appointmentTypeOptions, ...specialProgramTypeOptions, ...certificateTypeOptions];

    const usersForReport = await query(`SELECT "userID", ${sqlPersonFullName()} AS "fullName" FROM users`);
    const reportUserIdByName = new Map(
      usersForReport.rows
        .map((userRow) => [String(userRow.fullName || "").trim().toLowerCase(), Number(userRow.userID)])
        .filter(([name, userID]) => name && Number.isInteger(userID) && userID > 0),
    );
    const resolveReportUserID = (personName, requesterName, fallbackUserID) => {
      const personKey = String(personName || "").trim().toLowerCase();
      const requesterKey = String(requesterName || "").trim().toLowerCase();
      return reportUserIdByName.get(personKey) || reportUserIdByName.get(requesterKey) || (fallbackUserID || null);
    };

    const records = [];
    if (requestType !== "certificate") {
    const result = await query(
      `
        SELECT
          a."appointmentID",
          a."userID",
          a."priestID",
          COALESCE(priest."fullName", program_priest."fullName") AS "priestName",
          a."progressID",
          a."sacramentID",
          a."s_sacramentID",
          a.status::text AS status,
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
          a."requesterFullName",
          a.credentials,
          a.note,
          a."createdAt",
          a."finishedAt",
          s."sacramentName",
          ss."s_sacramentName" AS "specialSacramentName",
          ars."viewedAt" AS "reviewViewedAt",
          ars."underReviewAt" AS "reviewUnderReviewAt",
          pt."eventDone",
          pt.checklist_data,
          pt."scheduledEventDateTime",
          ${sqlPersonFullName("u")} AS "userFullName"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN appointment_review_states ars
          ON ars."appointmentID" = a."appointmentID"
        LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
        LEFT JOIN users u ON u."userID" = a."userID"
        LEFT JOIN priests priest ON priest."priestID" = a."priestID"
        LEFT JOIN priests program_priest ON program_priest."priestID" = ss."priestID"
        WHERE a."isArchived" = FALSE
          AND a."createdAt"::date >= $1::date
          AND a."createdAt"::date <= $2::date
          AND (
            $6 = 'all'
            OR ($6 = 'appointment' AND COALESCE(a."s_sacramentID", 0) = 0)
            OR ($6 = 'special_program' AND COALESCE(a."s_sacramentID", 0) > 0)
          )
          AND (
            $3 = ''
            OR LOWER(TRIM(COALESCE(ss."s_sacramentName", s."sacramentName"))) = LOWER($3)
          )
          AND (
            $4 = 'all'
            OR (
              $4 = 'cancelled'
              AND a.status = 'CANCELLED'
            )
            OR (
              $4 = 'completed'
              AND a.status <> 'CANCELLED'
              AND a."finishedAt" IS NOT NULL
            )
            OR (
              $4 = 'ongoing'
              AND a.status <> 'CANCELLED'
              AND a."finishedAt" IS NULL
            )
          )
          AND (
            $5 = 'all'
            OR ($5 = 'free' AND a."s_sacramentID" IS NOT NULL)
            OR ($5 = 'paid' AND a."s_sacramentID" IS NULL AND ${REPORT_PAYMENT_SATISFIED_SQL})
            OR ($5 = 'unpaid' AND a."s_sacramentID" IS NULL AND NOT ${REPORT_PAYMENT_SATISFIED_SQL})
          )
        ORDER BY a."createdAt" ${sortDirection}, a."appointmentID" ${sortDirection}
      `,
      [startDate, endDate, typeFilter, appointmentStatus, paymentStatus, requestType],
    );

    records.push(
      ...result.rows.map((row) => {
        const appointment = {
          ...toAppointmentResponseRow(row),
          eventDone: Boolean(row.eventDone),
          scheduledEventDateTime: toScheduledEventDateTimeOrNull(row.scheduledEventDateTime),
          paymentRecords: readPaymentRecordsFromSources(row),
        };
        return {
          ...appointment,
          recordKey: `appointment-${appointment.appointmentID}`,
          isCertificateRequest: false,
          requesterFullName:
            String(appointment.requesterFullName || "").trim() ||
            String(row.userFullName || "").trim() ||
            "Unknown requester",
          sacramentalPersonName: resolveReportPersonName(appointment, []),
          userID: appointment.userID === null || appointment.userID === undefined ? null : Number(appointment.userID) || null,
          appointmentType: getReportAppointmentTypeLabel(appointment),
          appointmentStatus: getReportAppointmentStatusLabel(appointment),
          paymentStatus: getReportPaymentStatusLabel(appointment),
          cancellationReason: String(appointment.note || "").trim(),
        };
      }),
    );
    }

    if (requestType === "all" || requestType === "certificate") {
    const certificateResult = await query(
      `
        SELECT
          cr."certID",
          cr."userID",
          cr.status::text AS status,
          cr.credentials,
          cr."createdAt",
          cr."updatedAt",
          COALESCE(cr."claimedAt", cr."updatedAt") AS "finishedAt",
          cr."pickupDate",
          cr."pickupTime",
          cr."claimedAt",
          COALESCE(ct."formSchema"->>'label', 'Certificate Request') AS "certificateType",
          ${sqlPersonFullName("u")} AS "userFullName"
        FROM cert_request cr
        LEFT JOIN certificate_type ct ON ct."certificateTypeID" = cr."certificateTypeID"
        LEFT JOIN users u ON u."userID" = cr."userID"
        WHERE (
            CASE
              WHEN cr.status IN ('Completed'::certificate_request_status, 'Approved'::certificate_request_status)
                THEN COALESCE(cr."claimedAt", cr."updatedAt", cr."createdAt")
              WHEN cr.status = 'Cancelled'::certificate_request_status
                THEN COALESCE(cr."updatedAt", cr."createdAt")
              ELSE cr."createdAt"
            END
          )::date >= $1::date
          AND (
            CASE
              WHEN cr.status IN ('Completed'::certificate_request_status, 'Approved'::certificate_request_status)
                THEN COALESCE(cr."claimedAt", cr."updatedAt", cr."createdAt")
              WHEN cr.status = 'Cancelled'::certificate_request_status
                THEN COALESCE(cr."updatedAt", cr."createdAt")
              ELSE cr."createdAt"
            END
          )::date <= $2::date
          AND (
            $3 = ''
            OR LOWER(TRIM(COALESCE(ct."formSchema"->>'label', 'Certificate Request'))) = LOWER($3)
          )
          AND (
            $4 = 'all'
            OR ($4 = 'cancelled' AND cr.status = 'Cancelled')
            OR ($4 = 'completed' AND cr.status = 'Completed')
            OR ($4 = 'ongoing' AND cr.status IN ('Pending', 'Approved'))
          )
          AND (
            $5 = 'all'
            OR ($5 = 'free' AND FALSE)
            OR (
              $5 = 'paid'
              AND NULLIF(BTRIM(COALESCE(cr.credentials->>'receiptNumber', cr.credentials->>'invoiceNumber', '')), '') IS NOT NULL
            )
            OR (
              $5 = 'unpaid'
              AND NULLIF(BTRIM(COALESCE(cr.credentials->>'receiptNumber', cr.credentials->>'invoiceNumber', '')), '') IS NULL
            )
          )
        ORDER BY cr."createdAt" ${sortDirection}, cr."certID" ${sortDirection}
      `,
      [startDate, endDate, typeFilter, appointmentStatus, paymentStatus],
    );

    for (const row of certificateResult.rows) {
      const credentials = row.credentials && typeof row.credentials === "object" ? row.credentials : {};
      const certificateType = formatCertificateTypeLabel(row.certificateType);
      const invoiceNumber = getCertificateInvoiceNumber(credentials);
      const resolvedPaymentStatus = resolveCertificatePaymentStatus({ credentials });
      const appointmentStatusLabel = resolveCertificateReportStatus(row.status);
      const requesterFullName =
        String(row.userFullName || "").trim() ||
        getWalkInRequesterName({ credentials, sacramentName: certificateType, requestType: "Certificate" }) ||
        "Unknown requester";
      const pickupSchedule = formatCertificatePickupLabel(row.pickupDate, row.pickupTime) || null;
      records.push({
        recordKey: `certificate-${row.certID}`,
        appointmentID: Number(row.certID),
        certID: Number(row.certID),
        userID: row.userID === null ? null : Number(row.userID),
        requestType: "Certificate",
        status: String(row.status || "").trim().toUpperCase(),
        sacramentName: certificateType,
        resolvedSacramentName: certificateType,
        requesterFullName,
        credentials,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
        finishedAt: row.status === "Completed" ? row.finishedAt || row.claimedAt || null : null,
        claimedAt: row.claimedAt || null,
        pickupDate: row.pickupDate || null,
        pickupTime: row.pickupTime || null,
        pickupEndTime: getCertificatePickupEndTime(row.pickupTime),
        pickupSchedule,
        receiptNumber: invoiceNumber || null,
        invoiceNumber: invoiceNumber || null,
        isCertificateRequest: true,
        sacramentalPersonName: resolveReportPersonName(
          { credentials, sacramentName: certificateType, requestType: "Certificate" },
          [],
        ),
        userID: row.userID === null || row.userID === undefined ? null : Number(row.userID) || null,
        appointmentType: `${certificateType} (Certificate Request)`,
        appointmentStatus: appointmentStatusLabel,
        paymentStatus: resolvedPaymentStatus === "paid" ? "Paid" : "Unpaid",
        cancellationReason: String(credentials.declineReason || "").trim(),
        note: "",
        giftAmount: 0,
      });
    }
    }

    records.sort((left, right) => {
      const timeA = new Date(left.finishedAt || left.updatedAt || left.createdAt || "").getTime();
      const timeB = new Date(right.finishedAt || right.updatedAt || right.createdAt || "").getTime();
      const fallbackA = Number(left.appointmentID) || 0;
      const fallbackB = Number(right.appointmentID) || 0;
      if (Number.isNaN(timeA) && Number.isNaN(timeB)) return sort === "oldest" ? fallbackA - fallbackB : fallbackB - fallbackA;
      if (Number.isNaN(timeA)) return 1;
      if (Number.isNaN(timeB)) return -1;
      return sort === "oldest" ? timeA - timeB : timeB - timeA;
    });

    return res.json({
      records,
      appointmentTypes,
      appointmentTypeOptions,
      specialProgramTypeOptions,
      certificateTypeOptions,
    });
  } catch (error) {
    console.error("Report records fetch error:", error);
    return res.status(500).json({ message: "Unable to load report records." });
  }
});

app.get("/appointments/requests", async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          a."appointmentID",
          a."userID",
          a."priestID",
          a."progressID",
          a."sacramentID",
          a."s_sacramentID",
          a.status::text AS status,
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
          a."requesterFullName",
          ${sqlPersonFullName("u")} AS "accountFullName",
          a.credentials,
          a.note,
          a."createdAt",
          a."finishedAt",
          s."sacramentName",
          ss."s_sacramentName" AS "specialSacramentName",
          ars."viewedAt" AS "reviewViewedAt",
          ars."underReviewAt" AS "reviewUnderReviewAt"
        FROM appointments a
        LEFT JOIN users u ON u."userID" = a."userID"
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN appointment_review_states ars
          ON ars."appointmentID" = a."appointmentID"
        WHERE a."isArchived" = FALSE
          AND a.status = 'PENDING'
        ORDER BY a."createdAt" DESC, a."appointmentID" DESC
      `,
    );

    return res.json(
      result.rows.map((row) => {
        const appointment = toAppointmentResponseRow(row);
        const cardName = resolveAppointmentCardName(appointment);
        return {
          ...(cardName ? { ...appointment, requesterFullName: cardName } : appointment),
          accountUserID: Number(row.userID) > 0 ? Number(row.userID) : null,
          accountFullName: String(row.accountFullName || "").trim(),
        };
      }),
    );
  } catch (error) {
    console.error("Pending appointments fetch error:", error);
    return res.status(500).json({ message: "Unable to load appointment requests." });
  }
});

const applyAppointmentStatusUpdate = async ({ appointmentID, status, declineReason = "" }) => {
  const existingResult = await query(
    `
      SELECT status::text AS status
      FROM appointments
      WHERE "appointmentID" = $1
      LIMIT 1
    `,
    [appointmentID],
  );
  if (existingResult.rows.length === 0) return null;
  const previousStatus = String(existingResult.rows[0]?.status || "").trim().toUpperCase();
  const isRestore = previousStatus === "CANCELLED" && (status === "CONFIRMED" || status === "PENDING");

  const updateResult = await query(
    `
      UPDATE appointments
      SET status = $1::appointment_status,
          note = CASE
            WHEN $1::appointment_status = 'CANCELLED' THEN NULLIF($2, '')
            WHEN $4::boolean THEN NULL
            ELSE note
          END,
          "finishedAt" = CASE
            WHEN $1::appointment_status = 'CANCELLED' THEN NOW()
            WHEN $4::boolean THEN NULL
            ELSE "finishedAt"
          END
      WHERE "appointmentID" = $3
      RETURNING "appointmentID", status::text AS status, note, "finishedAt"
    `,
    [status, declineReason, appointmentID, isRestore],
  );
  if (updateResult.rows.length === 0) return null;

  if (status === "CANCELLED") {
    await query(
      `
        UPDATE appointments a
        SET "priestID" = picked."priestID"
        FROM (
          SELECT ce."priestID"
          FROM calendar_entries ce
          WHERE ce."appointmentID" = $1
            AND ce."priestID" IS NOT NULL
          ORDER BY ce."updatedAt" DESC NULLS LAST, ce."calendarID" DESC
          LIMIT 1
        ) picked
        WHERE a."appointmentID" = $1
          AND a."priestID" IS NULL
      `,
      [appointmentID],
    );
    await query(`DELETE FROM calendar_entries WHERE "appointmentID" = $1`, [appointmentID]);
  }

  if (isRestore && status === "CONFIRMED") {
    try {
      await restoreAppointmentCalendarEntry(appointmentID);
    } catch (calendarError) {
      console.error("Restored appointment calendar recreate error:", calendarError);
    }
  }

  return { row: updateResult.rows[0], previousStatus, isRestore };
};

const APPOINTMENT_CHANGE_REQUEST_TYPES = new Set(["cancel", "restore"]);

const closePendingAppointmentChangeRequests = async (appointmentID) => {
  await query(
    `
      UPDATE appointment_change_requests
      SET status = 'closed',
          "adminResponse" = COALESCE("adminResponse", 'Handled directly by the parish office.'),
          "reviewedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "appointmentID" = $1
        AND status = 'pending'
    `,
    [appointmentID],
  );
};

const loadAppointmentChangeContext = async (appointmentID) => {
  const result = await query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        a."priestID",
        a.status::text AS status,
        a."finishedAt",
        a."isArchived",
        a."requesterFullName",
        a.note,
        COALESCE(ss."s_sacramentName", s."sacramentName", 'Appointment') AS "serviceName",
        pt."progressID",
        pt."scheduledEventDateTime",
        p."fullName" AS "priestName",
        EXISTS (
          SELECT 1
          FROM appointment_change_requests acr
          WHERE acr."appointmentID" = a."appointmentID"
            AND acr."requestType" = 'cancel'
            AND acr.status = 'approved'
        ) AS "wasCancelledByRequest"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
      LEFT JOIN priests p ON p."priestID" = a."priestID"
      WHERE a."appointmentID" = $1
      LIMIT 1
    `,
    [appointmentID],
  );
  return result.rows[0] || null;
};

const isAppointmentSchedulePast = (context) => {
  const scheduledMs = new Date(context?.scheduledEventDateTime || "").getTime();
  return Number.isFinite(scheduledMs) && scheduledMs <= Date.now();
};

// Admin-declined requests are also stored as CANCELLED; only appointments that were
// actually under way (or cancelled through a user request) count as cancelled appointments.
const isRestorableCancelledAppointment = (context) =>
  String(context?.status || "").toUpperCase() === "CANCELLED" &&
  !context?.isArchived &&
  (Boolean(context?.wasCancelledByRequest) || Boolean(context?.progressID));

const formatChangeRequestScheduleLabel = (value) => {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const mapAppointmentChangeRequestRow = (row) => ({
  requestID: Number(row.requestID),
  appointmentID: Number(row.appointmentID),
  userID: Number(row.userID),
  adminID: Number(row.adminID),
  requestType: row.requestType === "restore" ? "restore" : "cancel",
  reason: String(row.reason || "").trim(),
  previousStatus: String(row.previousStatus || "").trim().toUpperCase() || null,
  status: String(row.status || "pending").trim().toLowerCase(),
  adminResponse: String(row.adminResponse || "").trim(),
  reviewedAt: row.reviewedAt || null,
  createdAt: row.createdAt || null,
  serviceName: String(row.serviceName || "").trim() || "Appointment",
  requesterFullName: String(row.requesterFullName || "").trim() || "Unknown requester",
  appointmentStatus: String(row.appointmentStatus || "").trim().toUpperCase(),
  scheduledEventDateTime: row.scheduledEventDateTime || null,
  priestName: String(row.priestName || "").trim(),
});

const APPOINTMENT_CHANGE_REQUEST_SELECT_SQL = `
  SELECT
    acr."requestID",
    acr."appointmentID",
    acr."userID",
    acr."adminID",
    acr."requestType",
    acr.reason,
    acr."previousStatus",
    acr.status,
    acr."adminResponse",
    acr."reviewedAt",
    acr."createdAt",
    a.status::text AS "appointmentStatus",
    COALESCE(NULLIF(BTRIM(a."requesterFullName"), ''), ${sqlPersonFullName("u")}) AS "requesterFullName",
    COALESCE(ss."s_sacramentName", s."sacramentName", 'Appointment') AS "serviceName",
    pt."scheduledEventDateTime",
    p."fullName" AS "priestName"
  FROM appointment_change_requests acr
  JOIN appointments a ON a."appointmentID" = acr."appointmentID"
  LEFT JOIN users u ON u."userID" = a."userID"
  LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
  LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
  LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
  LEFT JOIN priests p ON p."priestID" = a."priestID"
`;

const createAppointmentChangeRequest = async (req, res, requestType) => {
  const appointmentID = Number(req.params.id);
  const userID = Number(req.body?.userID || req.query?.userID);
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
    return res.status(400).json({ message: "Invalid appointment ID." });
  }
  if (!Number.isInteger(userID) || userID <= 0) {
    return res.status(400).json({ message: "A valid userID is required." });
  }
  if (requestType === "cancel" && reason.length < 3) {
    return res.status(400).json({ message: "Please tell the parish office why you want to cancel." });
  }

  const context = await loadAppointmentChangeContext(appointmentID);
  if (!context) return res.status(404).json({ message: "Appointment not found." });
  if (Number(context.userID) !== userID) {
    return res.status(403).json({ message: "You can only change your own appointment." });
  }
  const currentStatus = String(context.status || "").toUpperCase();
  if (requestType === "cancel") {
    if (context.isArchived || context.finishedAt || !["PENDING", "CONFIRMED"].includes(currentStatus)) {
      return res.status(409).json({ message: "This appointment can no longer be cancelled." });
    }
  } else if (!isRestorableCancelledAppointment(context)) {
    return res.status(409).json({ message: "Only cancelled appointments can be restored." });
  }
  if (isAppointmentSchedulePast(context)) {
    return res.status(409).json({ message: "The schedule of this appointment has already passed." });
  }

  const adminID = await resolveAppointmentAdminID(context);
  let previousStatus = currentStatus;
  if (requestType === "restore") {
    const lastCancel = await query(
      `
        SELECT "previousStatus"
        FROM appointment_change_requests
        WHERE "appointmentID" = $1 AND "requestType" = 'cancel' AND status = 'approved'
        ORDER BY "reviewedAt" DESC NULLS LAST, "requestID" DESC
        LIMIT 1
      `,
      [appointmentID],
    );
    previousStatus = String(lastCancel.rows[0]?.previousStatus || "CONFIRMED").toUpperCase();
  }

  let insertResult;
  try {
    insertResult = await query(
      `
        INSERT INTO appointment_change_requests
          ("appointmentID", "userID", "adminID", "requestType", reason, "previousStatus")
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING "requestID"
      `,
      [
        appointmentID,
        userID,
        adminID,
        requestType,
        reason || "Requested to restore this appointment.",
        previousStatus,
      ],
    );
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "You already have a request waiting for the parish office on this appointment." });
    }
    throw error;
  }
  const requestID = Number(insertResult.rows[0]?.requestID);

  const serviceName = String(context.serviceName || "appointment").trim();
  const requesterName = String(context.requesterFullName || "").trim() || "A parishioner";
  const scheduleLabel = formatChangeRequestScheduleLabel(context.scheduledEventDateTime);
  try {
    await createAdminNotification({
      adminID,
      type: requestType === "cancel" ? "appointment_cancel_request" : "appointment_restore_request",
      title: requestType === "cancel" ? "Cancellation request" : "Restore request",
      body:
        requestType === "cancel"
          ? `${requesterName} asked to cancel their ${serviceName} appointment${scheduleLabel ? ` on ${scheduleLabel}` : ""}. Reason: ${reason}`
          : `${requesterName} asked to restore their cancelled ${serviceName} appointment${reason ? `. Reason: ${reason}` : "."}`,
      severity: "warning",
      metadata: { path: "/admin/progress-tracker/cancellation-requests", appointmentID, requestID, requestType },
    });
  } catch (notificationError) {
    console.error("Appointment change request admin notification error:", notificationError);
  }

  const saved = await query(`${APPOINTMENT_CHANGE_REQUEST_SELECT_SQL} WHERE acr."requestID" = $1`, [requestID]);
  return res.status(201).json({
    message:
      requestType === "cancel"
        ? "Your cancellation request was sent to the parish office for approval."
        : "Your restore request was sent to the parish office for approval.",
    request: saved.rows[0] ? mapAppointmentChangeRequestRow(saved.rows[0]) : null,
  });
};

app.post("/appointments/:id/cancel-request", async (req, res) => {
  try {
    return await createAppointmentChangeRequest(req, res, "cancel");
  } catch (error) {
    console.error("Appointment cancel request error:", error);
    return res.status(500).json({ message: "Unable to send your cancellation request." });
  }
});

app.post("/appointments/:id/restore-request", async (req, res) => {
  try {
    return await createAppointmentChangeRequest(req, res, "restore");
  } catch (error) {
    console.error("Appointment restore request error:", error);
    return res.status(500).json({ message: "Unable to send your restore request." });
  }
});

app.get("/appointments/:id/change-request", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    const userID = Number(req.query?.userID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0 || !Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "A valid appointment and userID are required." });
    }
    const context = await loadAppointmentChangeContext(appointmentID);
    if (!context) return res.status(404).json({ message: "Appointment not found." });
    if (Number(context.userID) !== userID) {
      return res.status(403).json({ message: "You can only view your own appointment." });
    }
    const pendingResult = await query(
      `
        SELECT "requestType", reason, "createdAt"
        FROM appointment_change_requests
        WHERE "appointmentID" = $1 AND status = 'pending'
        ORDER BY "requestID" DESC
        LIMIT 1
      `,
      [appointmentID],
    );
    const pending = pendingResult.rows[0] || null;
    const status = String(context.status || "").toUpperCase();
    const isSchedulePast = isAppointmentSchedulePast(context);
    return res.json({
      status,
      isSchedulePast,
      canCancel:
        !context.isArchived && !context.finishedAt && ["PENDING", "CONFIRMED"].includes(status) && !isSchedulePast,
      pendingChangeRequest: pending
        ? {
            requestType: pending.requestType === "restore" ? "restore" : "cancel",
            reason: String(pending.reason || "").trim(),
            createdAt: pending.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Appointment change request lookup error:", error);
    return res.status(500).json({ message: "Unable to load the cancellation status." });
  }
});

app.delete("/appointments/:id/change-request", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    const userID = Number(req.query?.userID || req.body?.userID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0 || !Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "A valid appointment and userID are required." });
    }
    const result = await query(
      `
        DELETE FROM appointment_change_requests
        WHERE "appointmentID" = $1 AND "userID" = $2 AND status = 'pending'
        RETURNING "requestID"
      `,
      [appointmentID, userID],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "There is no waiting request to withdraw." });
    }
    return res.json({ message: "Your request was withdrawn." });
  } catch (error) {
    console.error("Appointment change request withdraw error:", error);
    return res.status(500).json({ message: "Unable to withdraw your request." });
  }
});

app.get("/users/:userID/cancelled-appointments", async (req, res) => {
  try {
    const userID = Number(req.params.userID);
    if (!Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "A valid userID is required." });
    }
    const result = await query(
      `
        SELECT
          a."appointmentID",
          a.note,
          COALESCE(a."finishedAt", approved_cancel."reviewedAt", approved_cancel."createdAt") AS "cancelledAt",
          a."createdAt",
          COALESCE(ss."s_sacramentName", s."sacramentName", 'Appointment') AS "serviceName",
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
          pt."progressID",
          pt."scheduledEventDateTime",
          p."fullName" AS "priestName",
          approved_cancel."requestID" AS "approvedCancelRequestID",
          approved_cancel.reason AS "approvedCancelReason",
          pending_request."requestType" AS "pendingRequestType",
          pending_request."createdAt" AS "pendingRequestAt",
          last_restore.status AS "lastRestoreStatus",
          last_restore."adminResponse" AS "lastRestoreResponse"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
        LEFT JOIN priests p ON p."priestID" = a."priestID"
        LEFT JOIN LATERAL (
          SELECT acr."requestID", acr.reason, acr."createdAt", acr."reviewedAt"
          FROM appointment_change_requests acr
          WHERE acr."appointmentID" = a."appointmentID" AND acr."requestType" = 'cancel' AND acr.status = 'approved'
          ORDER BY acr."reviewedAt" DESC NULLS LAST, acr."requestID" DESC
          LIMIT 1
        ) approved_cancel ON TRUE
        LEFT JOIN LATERAL (
          SELECT acr."requestType", acr."createdAt"
          FROM appointment_change_requests acr
          WHERE acr."appointmentID" = a."appointmentID" AND acr.status = 'pending'
          ORDER BY acr."createdAt" DESC NULLS LAST, acr."requestID" DESC
          LIMIT 1
        ) pending_request ON TRUE
        LEFT JOIN LATERAL (
          SELECT acr.status, acr."adminResponse"
          FROM appointment_change_requests acr
          WHERE acr."appointmentID" = a."appointmentID"
            AND acr."requestType" = 'restore'
            AND acr.status IN ('approved', 'declined')
          ORDER BY acr."reviewedAt" DESC NULLS LAST, acr."requestID" DESC
          LIMIT 1
        ) last_restore ON TRUE
        WHERE a."userID" = $1
          AND a."isArchived" = FALSE
          AND a.status = 'CANCELLED'
        ORDER BY COALESCE(a."finishedAt", approved_cancel."reviewedAt", approved_cancel."createdAt") DESC NULLS LAST,
          a."appointmentID" DESC
      `,
      [userID],
    );
    const items = result.rows.map((row) => {
      const isPast = isAppointmentSchedulePast(row);
      const pendingRequestType = row.pendingRequestType === "restore" ? "restore" : row.pendingRequestType ? "cancel" : null;
      return {
        appointmentID: Number(row.appointmentID),
        serviceName: String(row.serviceName || "").trim() || "Appointment",
        requestType: String(row.requestType || "Appointment"),
        cancelReason:
          String(row.approvedCancelReason || "").trim() ||
          String(row.note || "").replace(/^Cancelled at the requester's request\.\s*Reason:\s*/i, "").trim(),
        cancelledAt: row.cancelledAt || null,
        createdAt: row.createdAt || null,
        scheduledEventDateTime: row.scheduledEventDateTime || null,
        priestName: String(row.priestName || "").trim(),
        cancelledBy: row.approvedCancelRequestID ? "you" : "parish",
        pendingRequestType,
        pendingRequestAt: row.pendingRequestAt || null,
        lastRestoreStatus: row.lastRestoreStatus || null,
        lastRestoreResponse: String(row.lastRestoreResponse || "").trim(),
        isSchedulePast: isPast,
        canRequestRestore: !pendingRequestType && !isPast,
      };
    });
    return res.json({ items });
  } catch (error) {
    console.error("Cancelled appointments fetch error:", error);
    return res.status(500).json({ message: "Unable to load your cancelled appointments." });
  }
});

app.get("/appointment-change-requests", async (req, res) => {
  try {
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    const statusFilter = String(req.query?.status || "pending").trim().toLowerCase();
    const result = await query(
      `
        ${APPOINTMENT_CHANGE_REQUEST_SELECT_SQL}
        WHERE acr."adminID" = $1
          AND ($2 = 'all' OR acr.status = $2)
        ORDER BY acr."createdAt" DESC, acr."requestID" DESC
        LIMIT 200
      `,
      [adminID, statusFilter],
    );
    return res.json({ requests: result.rows.map(mapAppointmentChangeRequestRow) });
  } catch (error) {
    console.error("Appointment change requests fetch error:", error);
    return res.status(500).json({ message: "Unable to load cancellation requests." });
  }
});

app.patch("/appointment-change-requests/:requestID", async (req, res) => {
  try {
    const requestID = Number(req.params.requestID);
    const adminID = Number(req.body?.adminID || req.query?.adminID);
    const decision = String(req.body?.decision || "").trim().toLowerCase();
    const adminResponse = String(req.body?.response || "").trim().slice(0, 500);
    if (!Number.isInteger(requestID) || requestID <= 0) {
      return res.status(400).json({ message: "Invalid request ID." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }
    if (decision !== "approve" && decision !== "decline") {
      return res.status(400).json({ message: "decision must be approve or decline." });
    }
    if (decision === "decline" && adminResponse.length < 3) {
      return res.status(400).json({ message: "Please give the parishioner a reason for declining." });
    }

    const requestResult = await query(
      `${APPOINTMENT_CHANGE_REQUEST_SELECT_SQL} WHERE acr."requestID" = $1 AND acr."adminID" = $2 LIMIT 1`,
      [requestID, adminID],
    );
    const changeRequest = requestResult.rows[0] ? mapAppointmentChangeRequestRow(requestResult.rows[0]) : null;
    if (!changeRequest) return res.status(404).json({ message: "Request not found." });
    if (changeRequest.status !== "pending") {
      return res.status(409).json({ message: "This request was already handled." });
    }

    const { appointmentID, requestType, serviceName } = changeRequest;
    const context = await loadAppointmentChangeContext(appointmentID);
    if (!context) return res.status(404).json({ message: "Appointment not found." });

    if (decision === "approve") {
      const currentStatus = String(context.status || "").toUpperCase();
      if (requestType === "cancel" && !["PENDING", "CONFIRMED"].includes(currentStatus)) {
        return res.status(409).json({ message: "This appointment is no longer active, so it cannot be cancelled." });
      }
      if (requestType === "restore") {
        if (currentStatus !== "CANCELLED") {
          return res.status(409).json({ message: "This appointment is already active." });
        }
        if (isAppointmentSchedulePast(context)) {
          return res.status(409).json({ message: "The schedule of this appointment has already passed, so it cannot be restored." });
        }
      }
      const targetStatus =
        requestType === "cancel" ? "CANCELLED" : changeRequest.previousStatus === "PENDING" ? "PENDING" : "CONFIRMED";
      const note =
        requestType === "cancel"
          ? `Cancelled at the requester's request. Reason: ${changeRequest.reason}`
          : "";
      await applyAppointmentStatusUpdate({ appointmentID, status: targetStatus, declineReason: note });
    }

    await query(
      `
        UPDATE appointment_change_requests
        SET status = $2,
            "adminResponse" = NULLIF($3, ''),
            "reviewedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE "requestID" = $1
      `,
      [requestID, decision === "approve" ? "approved" : "declined", adminResponse],
    );

    const isApproved = decision === "approve";
    const scheduleLabel = formatChangeRequestScheduleLabel(context.scheduledEventDateTime);
    const userMessages = {
      cancel: isApproved
        ? `Your request to cancel your ${serviceName} appointment was approved. It is now cancelled and saved in your History.`
        : `Your request to cancel your ${serviceName} appointment was declined, so the appointment stays active.${adminResponse ? ` Reason: ${adminResponse}` : ""}`,
      restore: isApproved
        ? `Your request to restore your ${serviceName} appointment was approved. You can continue it on your Status page.`
        : `Your request to restore your ${serviceName} appointment was declined, so it stays cancelled.${adminResponse ? ` Reason: ${adminResponse}` : ""}`,
    };
    try {
      await createUserNotification({
        userID: changeRequest.userID,
        type: `appointment_${requestType}_request_${isApproved ? "approved" : "declined"}`,
        title: `${requestType === "cancel" ? "Cancellation" : "Restore"} request ${isApproved ? "approved" : "declined"}`,
        body: userMessages[requestType],
        severity: isApproved ? "success" : "warning",
        metadata: {
          path:
            isApproved && requestType === "cancel"
              ? "/dashboard/history"
              : !isApproved && requestType === "restore"
                ? "/dashboard/status/cancelled"
                : `/dashboard/status/${appointmentID}`,
          appointmentID,
          requestID,
        },
      });
    } catch (notificationError) {
      console.error("Appointment change request user notification error:", notificationError);
    }
    const priestID = Number(context.priestID);
    if (isApproved && Number.isInteger(priestID) && priestID > 0 && context.progressID) {
      try {
        await createPriestNotification({
          priestID,
          type: requestType === "cancel" ? "appointment_cancelled" : "appointment_restored",
          title: requestType === "cancel" ? "Appointment cancelled" : "Appointment restored",
          body:
            requestType === "cancel"
              ? `The ${serviceName} appointment of ${changeRequest.requesterFullName}${scheduleLabel ? ` on ${scheduleLabel}` : ""} was cancelled at the requester's request.`
              : `The ${serviceName} appointment of ${changeRequest.requesterFullName}${scheduleLabel ? ` on ${scheduleLabel}` : ""} was restored.`,
          severity: requestType === "cancel" ? "warning" : "info",
          metadata: { path: requestType === "cancel" ? "/priest/history" : "/priest/assigned-appointments", appointmentID },
        });
      } catch (notificationError) {
        console.error("Appointment change request priest notification error:", notificationError);
      }
    }
    broadcastUserRealtimeEvent({ resource: "appointments", appointmentID });

    return res.json({
      message: isApproved
        ? requestType === "cancel"
          ? "Cancellation approved. The appointment is now cancelled."
          : "Restore approved. The appointment is active again."
        : "Request declined. The parishioner was notified.",
    });
  } catch (error) {
    console.error("Appointment change request review error:", error);
    return res.status(500).json({ message: "Unable to update this request." });
  }
});

app.patch("/appointments/:id/archive", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    const adminID = Number(req.body?.adminID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    const existing = await query(
      `SELECT status::text AS status, "isArchived" FROM appointments WHERE "appointmentID" = $1 LIMIT 1`,
      [appointmentID],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Appointment request not found." });
    }
    if (String(existing.rows[0].status || "").toUpperCase() !== "CANCELLED") {
      return res.status(400).json({ message: "Only a declined request can be removed from this list." });
    }
    await query(`UPDATE appointments SET "isArchived" = TRUE WHERE "appointmentID" = $1`, [appointmentID]);
    return res.json({ message: "Declined request removed." });
  } catch (error) {
    console.error("Archive declined appointment error:", error);
    return res.status(500).json({ message: "Unable to remove this declined request." });
  }
});

app.patch("/appointments/:id/status", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    const status = String(req.body?.status || "").trim().toUpperCase();
    const declineReason = String(req.body?.declineReason || "").trim();

    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }
    if (!APPOINTMENT_ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ message: "status must be one of PENDING, CONFIRMED, or CANCELLED." });
    }
    if (status === "CANCELLED" && declineReason.length < 3) {
      return res.status(400).json({ message: "A cancellation reason is required." });
    }

    const statusUpdate = await applyAppointmentStatusUpdate({ appointmentID, status, declineReason });
    if (!statusUpdate) {
      return res.status(404).json({ message: "Appointment request not found." });
    }
    const { previousStatus, isRestore, row: updatedRow } = statusUpdate;
    if (previousStatus !== status) {
      await closePendingAppointmentChangeRequests(appointmentID);
    }

    try {
      if (isRestore) {
        await notifyAppointmentRequester({
          appointmentID,
          action: status === "CONFIRMED" ? "restored" : "under_review",
        });
      } else if (status === "CONFIRMED") {
        await notifyAppointmentRequester({ appointmentID, action: "approved" });
      } else if (status === "CANCELLED") {
        await notifyAppointmentRequester({
          appointmentID,
          action: previousStatus === "PENDING" ? "declined" : "cancelled",
          declineReason,
        });
      }
    } catch (notificationError) {
      console.error("Appointment requester notification error:", notificationError);
    }

    return res.json(updatedRow);
  } catch (error) {
    console.error("Appointment status update error:", error);
    return res.status(500).json({ message: "Unable to update appointment request." });
  }
});

app.patch("/appointments/:id/review-state", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    const adminID = Number(req.body?.adminID);
    const markViewed = Boolean(req.body?.markViewed);
    const markUnderReview = Boolean(req.body?.markUnderReview);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const appointmentExistsResult = await query(
      `
        SELECT "appointmentID"
        FROM appointments
        WHERE "appointmentID" = $1
        LIMIT 1
      `,
      [appointmentID],
    );
    if (appointmentExistsResult.rows.length === 0) {
      return res.status(404).json({ message: "Appointment request not found." });
    }

    const previousReviewState = await query(
      `
        SELECT "underReviewAt"
        FROM appointment_review_states
        WHERE "appointmentID" = $1
          AND "adminID" = $2
        LIMIT 1
      `,
      [appointmentID, adminID],
    );
    const wasAlreadyUnderReview = Boolean(previousReviewState.rows[0]?.underReviewAt);

    await query(
      `
        INSERT INTO appointment_review_states ("appointmentID", "adminID", "viewedAt", "underReviewAt")
        VALUES (
          $1,
          $2,
          CASE WHEN $3::BOOLEAN THEN NOW() ELSE NULL END,
          CASE WHEN $4::BOOLEAN THEN NOW() ELSE NULL END
        )
        ON CONFLICT ("appointmentID", "adminID")
        DO UPDATE SET
          "viewedAt" = CASE
            WHEN $3::BOOLEAN THEN COALESCE(appointment_review_states."viewedAt", NOW())
            ELSE appointment_review_states."viewedAt"
          END,
          "underReviewAt" = CASE
            WHEN $4::BOOLEAN THEN NOW()
            ELSE appointment_review_states."underReviewAt"
          END,
          "updatedAt" = NOW()
      `,
      [appointmentID, adminID, markViewed, markUnderReview],
    );

    const stateResult = await query(
      `
        SELECT "viewedAt", "underReviewAt"
        FROM appointment_review_states
        WHERE "appointmentID" = $1
          AND "adminID" = $2
        LIMIT 1
      `,
      [appointmentID, adminID],
    );

    const state = stateResult.rows[0] || {};
    if (markUnderReview && !wasAlreadyUnderReview) {
      try {
        await notifyAppointmentRequester({ appointmentID, action: "under_review" });
      } catch (notificationError) {
        console.error("Appointment under-review notification error:", notificationError);
      }
    }
    return res.json({
      reviewViewedAt: state.viewedAt || null,
      reviewUnderReviewAt: state.underReviewAt || null,
    });
  } catch (error) {
    console.error("Appointment review state update error:", error);
    return res.status(500).json({ message: "Unable to update review state." });
  }
});

app.get("/progress-templates", async (_req, res) => {
  try {
    const templatesResult = await query(
      `
        SELECT
          t."templateID",
          t.scope,
          t."sacramentID",
          t."schemaID",
          t."templateName",
          t."isActive",
          s."sacramentName",
          sfs."specialSacramentName"
        FROM progress_templates t
        LEFT JOIN sacraments s ON s."sacramentID" = t."sacramentID"
        LEFT JOIN special_sacraments_form_schemas sfs ON sfs."schemaID" = t."schemaID"
        ORDER BY
          CASE t.scope WHEN 'sacrament' THEN 0 ELSE 1 END,
          COALESCE(s."sacramentName", sfs."specialSacramentName", t."templateName") ASC,
          t."templateID" ASC
      `,
    );

    const templates = await Promise.all(
      templatesResult.rows.map(async (row) => {
        const steps = await fetchProgressTemplateSteps(Number(row.templateID));
        return mapProgressTemplateResponse(row, steps);
      }),
    );

    return res.json(templates);
  } catch (error) {
    console.error("Progress templates fetch error:", error);
    return res.status(500).json({ message: "Unable to load progress templates." });
  }
});

app.post("/progress-templates", async (req, res) => {
  const client = await pool.connect();
  try {
    const payload = parseProgressTemplatePayload(req.body, { requireSteps: false });
    await client.query("BEGIN");

    const insertResult = await client.query(
      `
        INSERT INTO progress_templates (
          scope,
          "sacramentID",
          "schemaID",
          "templateName",
          "isActive",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING "templateID"
      `,
      [payload.scope, payload.sacramentID, payload.schemaID, payload.templateName, payload.isActive],
    );
    const templateID = Number(insertResult.rows[0]?.templateID);
    if (Array.isArray(payload.steps)) {
      await replaceProgressTemplateSteps(templateID, payload.steps, client);
    }
    await client.query("COMMIT");

    const templateRow = await fetchProgressTemplateById(templateID, client);
    const steps = await fetchProgressTemplateSteps(templateID, client);
    broadcastAdminRealtimeEvent({ resource: "progress_templates" });
    return res.status(201).json(mapProgressTemplateResponse(templateRow, steps));
  } catch (error) {
    await client.query("ROLLBACK");
    if (String(error?.code || "") === "23505") {
      return res.status(409).json({ message: "An active template already exists for this sacrament or special program." });
    }
    console.error("Progress template create error:", error);
    return res.status(400).json({ message: error.message || "Unable to create template." });
  } finally {
    client.release();
  }
});

app.patch("/progress-templates/:id", async (req, res) => {
  try {
    const templateID = Number(req.params.id);
    if (!Number.isInteger(templateID) || templateID <= 0) {
      return res.status(400).json({ message: "Invalid template ID." });
    }

    const existing = await fetchProgressTemplateById(templateID);
    if (!existing) {
      return res.status(404).json({ message: "Template not found." });
    }

    const payload = parseProgressTemplatePayload(
      {
        scope: req.body?.scope ?? existing.scope,
        sacramentID: req.body?.sacramentID ?? existing.sacramentID,
        schemaID: req.body?.schemaID ?? existing.schemaID,
        templateName: req.body?.templateName ?? existing.templateName,
        isActive: req.body?.isActive ?? existing.isActive,
      },
      { requireSteps: false },
    );

    await query(
      `
        UPDATE progress_templates
        SET scope = $2,
            "sacramentID" = $3,
            "schemaID" = $4,
            "templateName" = $5,
            "isActive" = $6,
            "updatedAt" = NOW()
        WHERE "templateID" = $1
      `,
      [
        templateID,
        payload.scope,
        payload.sacramentID,
        payload.schemaID,
        payload.templateName,
        payload.isActive,
      ],
    );

    const templateRow = await fetchProgressTemplateById(templateID);
    const steps = await fetchProgressTemplateSteps(templateID);
    broadcastAdminRealtimeEvent({ resource: "progress_templates" });
    return res.json(mapProgressTemplateResponse(templateRow, steps));
  } catch (error) {
    if (String(error?.code || "") === "23505") {
      return res.status(409).json({ message: "An active template already exists for this sacrament or special program." });
    }
    console.error("Progress template update error:", error);
    return res.status(400).json({ message: error.message || "Unable to update template." });
  }
});

app.put("/progress-templates/:id/steps", async (req, res) => {
  const client = await pool.connect();
  try {
    const templateID = Number(req.params.id);
    if (!Number.isInteger(templateID) || templateID <= 0) {
      return res.status(400).json({ message: "Invalid template ID." });
    }

    const existing = await fetchProgressTemplateById(templateID, client);
    if (!existing) {
      return res.status(404).json({ message: "Template not found." });
    }

    const steps = normalizeProgressTemplateStepsInput(req.body?.steps);

    await client.query("BEGIN");
    await replaceProgressTemplateSteps(templateID, steps, client);
    await client.query("COMMIT");

    const templateRow = await fetchProgressTemplateById(templateID, client);
    const savedSteps = await fetchProgressTemplateSteps(templateID, client);
    broadcastAdminRealtimeEvent({ resource: "progress_templates" });
    return res.json(mapProgressTemplateResponse(templateRow, savedSteps));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Progress template steps update error:", error);
    return res.status(400).json({ message: error.message || "Unable to update template steps." });
  } finally {
    client.release();
  }
});

app.delete("/progress-templates/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const templateID = Number(req.params.id);
    if (!Number.isInteger(templateID) || templateID <= 0) {
      return res.status(400).json({ message: "Invalid template ID." });
    }

    const existing = await fetchProgressTemplateById(templateID, client);
    if (!existing) {
      return res.status(404).json({ message: "Template not found." });
    }

    await client.query("BEGIN");
    await client.query(`DELETE FROM progress_template_steps WHERE "templateID" = $1`, [templateID]);
    await client.query(`DELETE FROM progress_templates WHERE "templateID" = $1`, [templateID]);
    await client.query("COMMIT");
    broadcastAdminRealtimeEvent({ resource: "progress_templates" });
    return res.json({ message: "Template removed.", templateID });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Progress template delete error:", error);
    return res.status(500).json({ message: "Unable to remove template." });
  } finally {
    client.release();
  }
});

app.get("/appointments/:id/progress", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }
    await promoteDueAppointmentsToHistory({ appointmentID });
    const result = await query(
      `
        SELECT
          pt."progressID",
          pt."templateID",
          pt.checklist_data,
          pt."scheduledEventDateTime",
          pt."eventDone",
          pt."priestComments",
          pt."secretaryRemarks",
          pt."updatedAt" AS "updatedAt",
          a.credentials,
          a.status::text AS "appointmentStatus",
          a."finishedAt",
          a."priestID",
          p."fullName" AS "priestName",
          a."sacramentID",
          a."s_sacramentID",
          ss."s_sacramentName" AS "specialSacramentName",
          s."sacramentName"
        FROM appointments a
        LEFT JOIN progress_tracker pt
          ON pt."appointmentID" = a."appointmentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN priests p ON p."priestID" = a."priestID"
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        WHERE a."appointmentID" = $1
        LIMIT 1
      `,
      [appointmentID],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    const row = result.rows[0];
    const specialSacramentID = Number(row.s_sacramentID);
    if (Number.isInteger(specialSacramentID) && specialSacramentID > 0) {
      const programSchedule = await resolveSpecialProgramEventSchedule(specialSacramentID);
      if (programSchedule?.scheduledEventDateTime) {
        await applySpecialProgramScheduleToAppointment(appointmentID, programSchedule);
        row.scheduledEventDateTime = programSchedule.scheduledEventDateTime;
      }
      if (programSchedule?.priestID) {
        row.priestID = programSchedule.priestID;
        row.priestName = programSchedule.priestName || row.priestName;
      }
      row.programEventDate = programSchedule?.eventDate || "";
      row.programStartTime = programSchedule?.startTime || "";
      row.programEndTime = programSchedule?.endTime || "";
      row.programTimeSlots = programSchedule?.timeSlots || [];
      row.paymentStatus = SPECIAL_PROGRAM_PAYMENT_STATUS;
    }
    const attached = await attachResolvedProgressTemplate({
      appointment: {
        appointmentID,
        sacramentID: row.sacramentID,
        s_sacramentID: row.s_sacramentID,
        specialSacramentName: row.specialSacramentName,
      },
      progress: row,
    });
    const scheduleMinAdvanceDays = await resolveAppointmentScheduleAdvanceDays(row.adminID, row);
    return res.json(await buildProgressResponse(appointmentID, { ...row, ...attached, scheduleMinAdvanceDays }));
  } catch (error) {
    console.error("Appointment progress fetch error:", error);
    return res.status(500).json({ message: "Unable to load checklist progress." });
  }
});

app.patch("/appointments/:id/progress", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const appointmentResult = await query(
      `
        SELECT
          a."appointmentID",
          a."priestID",
          a."sacramentID",
          a."s_sacramentID",
          a.status::text AS "appointmentStatus",
          a."finishedAt",
          a.credentials,
          ss."s_sacramentName" AS "specialSacramentName",
          s."sacramentName"
        FROM appointments a
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        WHERE a."appointmentID" = $1
        LIMIT 1
      `,
      [appointmentID],
    );
    if (appointmentResult.rows.length === 0) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    const appointment = appointmentResult.rows[0];
    appointment.adminID = await resolveAppointmentAdminID(appointment, req);
    const hasChecklist = Object.prototype.hasOwnProperty.call(req.body || {}, "checklist");
    const hasFinalDetails = Object.prototype.hasOwnProperty.call(req.body || {}, "finalDetails");
    const isParishStaffWrite = String(req.headers["x-faithflow-write-source"] || "").trim().toLowerCase() === "admin";
    if ((hasChecklist || hasFinalDetails) && !isParishStaffWrite) {
      return res.status(403).json({ message: "Progress checklist updates are restricted to parish staff." });
    }
    const normalizedChecklist = hasChecklist ? normalizeProgressChecklistPayload(req.body.checklist) : null;
    if (hasChecklist && normalizedChecklist === null) {
      return res.status(400).json({ message: "checklist must be an array." });
    }

    const existingProgress = await query(
      `
        SELECT
          "progressID",
          "templateID",
          checklist_data,
          "scheduledEventDateTime",
          "eventDone",
          "priestComments",
          "secretaryRemarks"
        FROM progress_tracker
        WHERE "appointmentID" = $1
        LIMIT 1
      `,
      [appointmentID],
    );
    const current = existingProgress.rows[0] || {};
    const previousChecklist = Array.isArray(current.checklist_data) ? current.checklist_data : [];
    const previousScheduledEventDateTime = current.scheduledEventDateTime || null;
    const previousPriestID = Number(appointment.priestID) || null;
    let nextChecklist = normalizedChecklist || previousChecklist;
    const rawTaskUncheck =
      req.body?.taskUncheck && typeof req.body.taskUncheck === "object" && !Array.isArray(req.body.taskUncheck)
        ? req.body.taskUncheck
        : null;
    const taskUncheckReason = rawTaskUncheck ? String(rawTaskUncheck.reason || "").trim() : "";
    const uncheckedTasks = hasChecklist ? findProgressTaskUnchecks(previousChecklist, nextChecklist) : [];

    if (uncheckedTasks.length > 0) {
      if (taskUncheckReason.length < 3) {
        return res.status(400).json({ message: "A reason is required when unchecking a task." });
      }

      const resolvedUncheckTarget = uncheckedTasks.find(
        (entry) =>
          Number(rawTaskUncheck?.stepIndex) === entry.stepIndex && Number(rawTaskUncheck?.taskIndex) === entry.taskIndex,
      ) ||
        uncheckedTasks[0] || {
          stepIndex: Number(rawTaskUncheck?.stepIndex),
          taskIndex: Number(rawTaskUncheck?.taskIndex),
          stepTitle: String(rawTaskUncheck?.stepTitle || "").trim(),
          taskLabel: String(rawTaskUncheck?.taskLabel || "").trim() || "A checklist task",
        };

      nextChecklist = applyTaskUncheckMetadata(nextChecklist, {
        stepIndex: resolvedUncheckTarget.stepIndex,
        taskIndex: resolvedUncheckTarget.taskIndex,
        reason: taskUncheckReason,
      });
    } else if (rawTaskUncheck && taskUncheckReason.length >= 3) {
      nextChecklist = applyTaskUncheckMetadata(nextChecklist, {
        ...rawTaskUncheck,
        reason: taskUncheckReason,
      });
    }

    let templateID = Number(current.templateID) || null;
    if (!Number.isInteger(templateID) || templateID <= 0) {
      templateID = await resolveAppointmentProgressTemplate({
        sacramentID: Number(appointment.sacramentID) || null,
        s_sacramentID: Number(appointment.s_sacramentID) || null,
        specialSacramentName: appointment.specialSacramentName,
      });
    }

    const rawFinalDetails =
      req.body?.finalDetails && typeof req.body.finalDetails === "object" ? req.body.finalDetails : null;
    let nextConductedPriestID = Number(appointment.priestID) || null;
    let priestExplicitlyCleared = false;
    if (hasFinalDetails && rawFinalDetails) {
      const hasExplicitPriestField = Object.prototype.hasOwnProperty.call(rawFinalDetails, "conductedPriestID");
      if (hasExplicitPriestField) {
        const explicitPriestID = Number(rawFinalDetails.conductedPriestID);
        if (Number.isInteger(explicitPriestID) && explicitPriestID > 0) {
          nextConductedPriestID = explicitPriestID;
        } else if (rawFinalDetails.conductedPriestID === null || rawFinalDetails.conductedPriestID === "") {
          nextConductedPriestID = null;
          priestExplicitlyCleared = true;
        }
      }
      if (!priestExplicitlyCleared && (!Number.isInteger(nextConductedPriestID) || nextConductedPriestID <= 0)) {
        nextConductedPriestID = await resolveProgressConductedPriestID(appointmentID, appointment, rawFinalDetails);
      }
      if (Number.isInteger(nextConductedPriestID) && nextConductedPriestID > 0) {
        if (!(await assertPriestAvailableForAdmin(nextConductedPriestID, Number(appointment.adminID)))) {
          return res.status(400).json({ message: "Selected priest is not available for this parish." });
        }
        await query(
          `
            UPDATE appointments
            SET "priestID" = $1
            WHERE "appointmentID" = $2
          `,
          [nextConductedPriestID, appointmentID],
        );
      } else if (priestExplicitlyCleared) {
        await query(
          `
            UPDATE appointments
            SET "priestID" = NULL
            WHERE "appointmentID" = $1
          `,
          [appointmentID],
        );
      }
    }
    const nextEventDone = Boolean(req.body?.finalizeAppointment)
      ? true
      : rawFinalDetails
        ? Boolean(rawFinalDetails.eventDone) || Boolean(current.eventDone)
        : Boolean(current.eventDone);
    const currentScheduledEventDateTime = toScheduledEventDateTimeOrNull(current.scheduledEventDateTime) || null;
    const incomingScheduledEventDateTime =
      hasFinalDetails && rawFinalDetails && Object.prototype.hasOwnProperty.call(rawFinalDetails, "scheduledEventDateTime")
        ? toScheduledEventDateTimeOrNull(rawFinalDetails.scheduledEventDateTime)
        : undefined;
    let nextScheduledEventDateTime =
      incomingScheduledEventDateTime === undefined ? currentScheduledEventDateTime : incomingScheduledEventDateTime;
    if (priestExplicitlyCleared && incomingScheduledEventDateTime === undefined) {
      nextScheduledEventDateTime = null;
    }
    const specialSacramentID = Number(appointment.s_sacramentID);
    const isSpecialProgramAppointment = Number.isInteger(specialSacramentID) && specialSacramentID > 0;
    let specialProgramSchedule = null;
    if (isSpecialProgramAppointment) {
      specialProgramSchedule = await resolveSpecialProgramEventSchedule(specialSacramentID);
      if (specialProgramSchedule?.scheduledEventDateTime) {
        nextScheduledEventDateTime = specialProgramSchedule.scheduledEventDateTime;
      }
      if (specialProgramSchedule?.priestID) {
        nextConductedPriestID = specialProgramSchedule.priestID;
        priestExplicitlyCleared = false;
      }
    }
    if (rawFinalDetails && nextScheduledEventDateTime && !isSpecialProgramAppointment) {
      const scheduleDateKey = extractDateKeyFromDateTimeValue(nextScheduledEventDateTime);
      const advanceDays = await resolveAppointmentScheduleAdvanceDays(appointment.adminID, appointment);
      const scheduleDateCheck = assertProgressScheduleDateAllowed(scheduleDateKey, advanceDays);
      if (!scheduleDateCheck.ok) {
        return res.status(400).json({ message: scheduleDateCheck.message });
      }
      const scheduleSlot = getManilaOneHourSlot(nextScheduledEventDateTime);
      if (scheduleSlot) {
        const { startTime, endTime } = scheduleSlot;
        const slotCheck = assertScheduleTimeSlotAllowed(startTime, endTime);
        if (!slotCheck.ok) {
          return res.status(400).json({ message: slotCheck.message });
        }
        const closureMessage = await findParishClosureConflict({
          adminID: appointment.adminID || 1,
          dateKey: scheduleDateKey,
          startTime,
          endTime,
        });
        if (closureMessage) {
          return res.status(400).json({ message: closureMessage });
        }
        if (isScheduleSlotInThePast(scheduleDateKey, startTime)) {
          return res.status(400).json({
            message: "That time has already passed. Choose a later date or a later time slot.",
          });
        }
      }
    }
    const nextPriestComments = rawFinalDetails
      ? String(rawFinalDetails.priestComments || "")
      : current.priestComments || "";
    const nextSecretaryRemarks = rawFinalDetails
      ? String(rawFinalDetails.secretaryRemarks || "")
      : current.secretaryRemarks || "";
    const nextPaymentRecords = readPaymentRecordsFromSources({ credentials: appointment.credentials });
    const resolvedGiftAmount = sumProgressPaymentAmount(nextPaymentRecords);
    const resolvedPaymentStatus = resolveAppointmentPaymentStatus({
      ...appointment,
      paymentRecords: nextPaymentRecords,
    });
    const isChangingEventSchedule =
      Boolean(nextScheduledEventDateTime) &&
      String(nextScheduledEventDateTime) !== String(currentScheduledEventDateTime || "");
    if (
      isChangingEventSchedule &&
      !isSpecialProgramAppointment &&
      resolvedPaymentStatus !== "paid"
    ) {
      return res.status(400).json({
        message: "Record payment first. Date and time can be set after this appointment is marked paid.",
      });
    }

    const wantsFinalizeAppointment =
      Boolean(req.body?.finalizeAppointment) && hasFinalDetails && rawFinalDetails && nextEventDone && !appointment.finishedAt;
    if (wantsFinalizeAppointment) {
      if (!Number.isInteger(nextConductedPriestID) || nextConductedPriestID <= 0) {
        nextConductedPriestID = await resolveProgressConductedPriestID(appointmentID, appointment, rawFinalDetails);
      }
      if (!isSpecialProgramAppointment && resolvedPaymentStatus !== "paid") {
        return res.status(400).json({
          message: "Payment must be recorded and marked as paid before saving the final step.",
        });
      }
      if (!nextScheduledEventDateTime) {
        return res.status(400).json({ message: "Event schedule must be set before saving the final step." });
      }
      if (!Number.isInteger(nextConductedPriestID) || nextConductedPriestID <= 0) {
        return res.status(400).json({ message: "A conducting priest must be assigned before saving the final step." });
      }
      if (!(await assertPriestAvailableForAdmin(nextConductedPriestID, Number(appointment.adminID)))) {
        return res.status(400).json({ message: "Selected priest is not available for this parish." });
      }
      await query(
        `
          UPDATE appointments
          SET "priestID" = $1
          WHERE "appointmentID" = $2
            AND ("priestID" IS DISTINCT FROM $1)
        `,
        [nextConductedPriestID, appointmentID],
      );
    }

    const upsertResult = await query(
      `
        INSERT INTO progress_tracker (
          "appointmentID",
          "templateID",
          checklist_data,
          "scheduledEventDateTime",
          "eventDone",
          "priestComments",
          "secretaryRemarks",
          "updatedAt"
        )
        VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5, $6, $7, NOW())
        ON CONFLICT ("appointmentID") DO UPDATE
        SET
          "templateID" = COALESCE(EXCLUDED."templateID", progress_tracker."templateID"),
          checklist_data = EXCLUDED.checklist_data,
          "scheduledEventDateTime" = EXCLUDED."scheduledEventDateTime",
          "eventDone" = EXCLUDED."eventDone",
          "priestComments" = EXCLUDED."priestComments",
          "secretaryRemarks" = EXCLUDED."secretaryRemarks",
          "updatedAt" = NOW()
        RETURNING
          "progressID",
          "templateID",
          checklist_data,
          "scheduledEventDateTime",
          "eventDone",
          "priestComments",
          "secretaryRemarks",
          "updatedAt"
      `,
      [
        appointmentID,
        Number.isInteger(templateID) && templateID > 0 ? templateID : null,
        JSON.stringify(nextChecklist),
        nextScheduledEventDateTime,
        nextEventDone,
        nextPriestComments,
        nextSecretaryRemarks,
      ],
    );

    const saved = upsertResult.rows[0];
    if (saved?.progressID) {
      await query(
        `
          UPDATE appointments
          SET "progressID" = $1
          WHERE "appointmentID" = $2
            AND ("progressID" IS DISTINCT FROM $1)
        `,
        [saved.progressID, appointmentID],
      );
    }

    if (uncheckedTasks.length > 0 && taskUncheckReason) {
      const notifyTarget =
        uncheckedTasks.find(
          (entry) =>
            Number(rawTaskUncheck?.stepIndex) === entry.stepIndex && Number(rawTaskUncheck?.taskIndex) === entry.taskIndex,
        ) || uncheckedTasks[0];
      await notifyProgressTaskUnchecked({
        appointmentID,
        taskLabel: String(rawTaskUncheck?.taskLabel || notifyTarget.taskLabel || "").trim() || "A checklist task",
        stepTitle: String(rawTaskUncheck?.stepTitle || notifyTarget.stepTitle || "").trim(),
        stepIndex: notifyTarget.stepIndex,
        taskIndex: notifyTarget.taskIndex,
        reason: taskUncheckReason,
      });
    }

    const checkedTasks = hasChecklist ? findProgressTaskChecks(previousChecklist, nextChecklist) : [];
    if (checkedTasks.length > 0) {
      try {
        const markAllStepIndex = Number(req.body?.markAllStepIndex);
        await notifyProgressTasksChecked({
          appointmentID,
          checkedTasks,
          previousChecklist,
          nextChecklist,
          markAllStepIndex: Number.isInteger(markAllStepIndex) && markAllStepIndex >= 0 ? markAllStepIndex : null,
        });
      } catch (notificationError) {
        console.error("Progress checklist notification error:", notificationError);
      }
    }

    if (hasFinalDetails && rawFinalDetails) {
      await persistAppointmentCredentialSchedule(appointmentID, nextScheduledEventDateTime);
      const hasAssignedPriest = Number.isInteger(Number(nextConductedPriestID)) && Number(nextConductedPriestID) > 0;
      if (isSpecialProgramAppointment) {
        await removeAppointmentCalendarEntry(appointmentID);
      } else if (nextScheduledEventDateTime && hasAssignedPriest) {
        await restoreAppointmentCalendarEntry(appointmentID);
      } else {
        await removeAppointmentCalendarEntry(appointmentID);
      }
      await notifyProgressScheduleUpdated({
        appointmentID,
        previousSchedule: previousScheduledEventDateTime,
        nextSchedule: nextScheduledEventDateTime,
        previousPriestID,
        nextPriestID: nextConductedPriestID,
      });
      try {
        await sendProgressScheduleSms({
          appointmentID,
          previousSchedule: previousScheduledEventDateTime,
          nextSchedule: nextScheduledEventDateTime,
          previousPriestID,
          nextPriestID: nextConductedPriestID,
        });
      } catch (smsError) {
        console.error("Event schedule SMS error:", smsError);
      }
      await notifyPriestAppointmentAssignment({
        appointmentID,
        previousPriestID,
        nextPriestID: nextConductedPriestID,
        scheduledEventDateTime: nextScheduledEventDateTime,
      });
    }

    let responseFinishedAt = appointment.finishedAt || null;
    const nextHistoryState = computeProgressHistoryState({
      finishedAt: responseFinishedAt,
      scheduledEventDateTime: nextScheduledEventDateTime,
      priestID: nextConductedPriestID,
      paymentStatus: resolvedPaymentStatus,
      checklist: nextChecklist,
      s_sacramentID: appointment.s_sacramentID,
    });

    if (!responseFinishedAt && nextHistoryState.isReadyForHistory) {
      await promoteDueAppointmentsToHistory({ appointmentID });
      const refreshedAppointmentResult = await query(
        `
          SELECT "finishedAt"
          FROM appointments
          WHERE "appointmentID" = $1
          LIMIT 1
        `,
        [appointmentID],
      );
      responseFinishedAt = refreshedAppointmentResult.rows[0]?.finishedAt || null;
    }

    const responsePendingHistory =
      !responseFinishedAt &&
      computeProgressHistoryState({
        finishedAt: responseFinishedAt,
        scheduledEventDateTime: nextScheduledEventDateTime,
        priestID: nextConductedPriestID,
        paymentStatus: resolvedPaymentStatus,
        checklist: nextChecklist,
        s_sacramentID: appointment.s_sacramentID,
      }).pendingHistory;

    return res.json(
      await buildProgressResponse(appointmentID, {
        ...saved,
        priestID: nextConductedPriestID,
        priestName: await fetchPriestDisplayName(nextConductedPriestID),
        appointmentStatus: appointment.appointmentStatus,
        finishedAt: responseFinishedAt,
        pendingHistory: responsePendingHistory,
        historyEligibleAt: responsePendingHistory ? nextScheduledEventDateTime : null,
      }),
    );
  } catch (error) {
    console.error("Appointment progress save error:", error);
    return res.status(500).json({ message: "Unable to save checklist." });
  }
});

const mapAppointmentScheduleRemark = (row = {}) => ({
  remarkID: Number(row.remarkID),
  appointmentID: Number(row.appointmentID),
  userID: Number(row.userID),
  decision: String(row.decision || "").trim(),
  message: String(row.message || "").trim(),
  preferredDate: (() => {
    const raw = row.preferredDate;
    if (!raw) return "";
    const isoMatch = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    return extractDateKeyFromDateTimeValue(raw);
  })(),
  preferredTime: normalizeTimeToHHMM(row.preferredTime) || "",
  preferredPriestID: Number(row.preferredPriestID) > 0 ? Number(row.preferredPriestID) : null,
  preferredPriestName: String(row.preferredPriestName || "").trim(),
  currentScheduledEventDateTime: row.currentScheduledEventDateTime || null,
  currentPriestID: Number(row.currentPriestID) > 0 ? Number(row.currentPriestID) : null,
  status: String(row.status || "pending").trim(),
  adminDecision: String(row.adminDecision || "").trim(),
  reviewedByAdminID: Number(row.reviewedByAdminID) > 0 ? Number(row.reviewedByAdminID) : null,
  reviewedAt: row.reviewedAt || null,
  createdAt: row.createdAt || null,
  updatedAt: row.updatedAt || null,
});

const fetchAppointmentCalendarEntryID = async (appointmentID) => {
  const result = await query(
    `
      SELECT "calendarID" AS id
      FROM calendar_entries
      WHERE "appointmentID" = $1
      LIMIT 1
    `,
    [appointmentID],
  );
  const entryID = Number(result.rows[0]?.id);
  return Number.isInteger(entryID) && entryID > 0 ? entryID : null;
};

const fetchAppointmentScheduleRemarkContext = async (appointmentID) => {
  const result = await query(
    `
      SELECT
        a."appointmentID",
        a."userID",
        a."priestID",
        a."s_sacramentID",
        a.status::text AS status,
        a."finishedAt",
        a.credentials,
        COALESCE(s."sacramentName", ss."s_sacramentName", 'appointment') AS "serviceName",
        a."requesterFullName",
        pt.checklist_data,
        pt."scheduledEventDateTime",
        pt."eventDone"
      FROM appointments a
      LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
      LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
      LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
      WHERE a."appointmentID" = $1
        AND a."isArchived" = FALSE
      LIMIT 1
    `,
    [appointmentID],
  );
  const appointment = result.rows[0] || null;
  if (appointment) appointment.adminID = await resolveAppointmentAdminID(appointment);
  return appointment;
};

const fetchAppointmentScheduleRemarks = async (appointmentID) => {
  const result = await query(
    `
      SELECT
        r."remarkID",
        r."appointmentID",
        r."userID",
        r.decision,
        r.message,
        to_char(r."preferredDate", 'YYYY-MM-DD') AS "preferredDate",
        r."preferredTime",
        r."preferredPriestID",
        p."fullName" AS "preferredPriestName",
        r."currentScheduledEventDateTime",
        r."currentPriestID",
        r.status,
        r."adminDecision",
        r."reviewedByAdminID",
        r."reviewedAt",
        r."createdAt",
        r."updatedAt"
      FROM appointment_schedule_remarks r
      LEFT JOIN priests p ON p."priestID" = r."preferredPriestID"
      WHERE r."appointmentID" = $1
      ORDER BY r."createdAt" DESC, r."remarkID" DESC
    `,
    [appointmentID],
  );
  return result.rows.map(mapAppointmentScheduleRemark);
};

const fetchParishPriestsForRemarks = async (adminID) => {
  const result = await query(
    `
      SELECT "priestID", "fullName"
      FROM priests
      WHERE "adminID" = $1
        AND COALESCE("isActive", TRUE) = TRUE
      ORDER BY LOWER(TRIM(COALESCE("fullName", ''))) ASC, "priestID" ASC
    `,
    [adminID],
  );
  return result.rows.map((row) => ({
    priestID: Number(row.priestID),
    fullName: String(row.fullName || "").trim(),
  }));
};

const buildScheduleRemarkEligibility = (appointment) => {
  const paymentStatus = resolveAppointmentPaymentStatus(appointment);
  const historyState = computeProgressHistoryState({
    finishedAt: appointment?.finishedAt,
    scheduledEventDateTime: appointment?.scheduledEventDateTime,
    priestID: appointment?.priestID,
    paymentStatus,
    checklist: appointment?.checklist_data,
    s_sacramentID: appointment?.s_sacramentID,
  });
  const isSpecialProgram = Number(appointment?.s_sacramentID) > 0;
  return {
    paymentStatus,
    canRemark:
      !appointment?.finishedAt &&
      String(appointment?.status || "").trim().toUpperCase() === "CONFIRMED" &&
      Boolean(appointment?.scheduledEventDateTime) &&
      Number(appointment?.priestID) > 0 &&
      isProgressPaymentSatisfied(paymentStatus, appointment) &&
      isChecklistFullyComplete(appointment?.checklist_data),
    canRequestPreferred: !isSpecialProgram,
    pendingHistory: historyState.pendingHistory,
    historyEligibleAt: historyState.historyEligibleAt,
    isSpecialProgram,
  };
};

const applyAppointmentScheduleChange = async ({
  appointmentID,
  appointment,
  nextScheduledEventDateTime,
  nextPriestID,
}) => {
  const previousSchedule = appointment?.scheduledEventDateTime || null;
  const previousPriestID = Number(appointment?.priestID) || null;
  const resolvedPriestID = Number(nextPriestID);
  if (!Number.isInteger(resolvedPriestID) || resolvedPriestID <= 0) {
    throw Object.assign(new Error("A conducting priest must be assigned."), { status: 400 });
  }
  if (!nextScheduledEventDateTime) {
    throw Object.assign(new Error("Event schedule must be set."), { status: 400 });
  }
  if (!(await assertPriestAvailableForAdmin(resolvedPriestID, Number(appointment.adminID)))) {
    throw Object.assign(new Error("Selected priest is not available for this parish."), { status: 400 });
  }
  const parsedSchedule = new Date(nextScheduledEventDateTime);
  if (Number.isNaN(parsedSchedule.getTime())) {
    throw Object.assign(new Error("Invalid preferred date and time."), { status: 400 });
  }
  const scheduleDateKey = getLocalDateKey(parsedSchedule);
  const advanceDays = await resolveAppointmentScheduleAdvanceDays(appointment.adminID, appointment);
  const scheduleDateCheck = assertProgressScheduleDateAllowed(scheduleDateKey, advanceDays);
  if (!scheduleDateCheck.ok) {
    throw Object.assign(new Error(scheduleDateCheck.message), { status: 400 });
  }
  const startMinutes = getManilaMinutesNow(parsedSchedule);
  const endMinutes = startMinutes + 60;
  const startTime = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  const slotCheck = assertScheduleTimeSlotAllowed(startTime, endTime);
  if (!slotCheck.ok) {
    throw Object.assign(new Error(slotCheck.message), { status: 400 });
  }
  if (isScheduleSlotInThePast(scheduleDateKey, startTime)) {
    throw Object.assign(new Error("That time has already passed. Choose a later date or a later time slot."), {
      status: 400,
    });
  }
  const excludeCalendarEntryID = await fetchAppointmentCalendarEntryID(appointmentID);
  const availability = await getPriestDayAvailability({
    priestID: resolvedPriestID,
    adminID: appointment.adminID,
    dateKey: scheduleDateKey,
    excludeCalendarEntryID,
    advanceDays,
  });
  const selectedSlot = (availability.slots || []).find(
    (slot) => slot.startTime === startTime && slot.endTime === endTime,
  );
  if (!selectedSlot?.available) {
    throw Object.assign(new Error("That preferred date and time is no longer available."), { status: 409 });
  }

  await query(
    `
      UPDATE appointments
      SET "priestID" = $1
      WHERE "appointmentID" = $2
    `,
    [resolvedPriestID, appointmentID],
  );
  await query(
    `
      UPDATE progress_tracker
      SET
        "scheduledEventDateTime" = $1::timestamptz,
        "updatedAt" = NOW()
      WHERE "appointmentID" = $2
    `,
    [nextScheduledEventDateTime, appointmentID],
  );
  await persistAppointmentCredentialSchedule(appointmentID, nextScheduledEventDateTime);
  await restoreAppointmentCalendarEntry(appointmentID);
  await notifyProgressScheduleUpdated({
    appointmentID,
    previousSchedule,
    nextSchedule: nextScheduledEventDateTime,
    previousPriestID,
    nextPriestID: resolvedPriestID,
  });
  await notifyPriestAppointmentAssignment({
    appointmentID,
    previousPriestID,
    nextPriestID: resolvedPriestID,
    scheduledEventDateTime: nextScheduledEventDateTime,
  });
};

app.get("/appointments/:id/schedule-remarks", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }
    const appointment = await fetchAppointmentScheduleRemarkContext(appointmentID);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }
    const eligibility = buildScheduleRemarkEligibility(appointment);
    const remarks = await fetchAppointmentScheduleRemarks(appointmentID);
    const preferredRequest = remarks.find((item) => item.decision === "preferred") || null;
    const canRequestPreferred = eligibility.canRequestPreferred && !preferredRequest;
    const priests = canRequestPreferred
      ? await fetchParishPriestsForRemarks(appointment.adminID)
      : [];
    return res.json({
      appointmentID,
      canRemark: eligibility.canRemark,
      canRequestPreferred,
      preferredRequestUsed: Boolean(preferredRequest),
      preferredRequest,
      pendingHistory: eligibility.pendingHistory,
      historyEligibleAt: eligibility.historyEligibleAt,
      currentSchedule: {
        scheduledEventDateTime: appointment.scheduledEventDateTime || null,
        priestID: Number(appointment.priestID) > 0 ? Number(appointment.priestID) : null,
        priestName: await fetchPriestDisplayName(appointment.priestID),
      },
      latestRemark: remarks[0] || null,
      pendingRemark: remarks.find((item) => item.status === "pending") || null,
      remarks,
      priests,
    });
  } catch (error) {
    console.error("Appointment schedule remarks fetch error:", error);
    return res.status(500).json({ message: "Unable to load schedule remarks." });
  }
});

app.get("/appointments/:id/preferred-slots", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    const priestID = Number(req.query?.priestID);
    const dateKey = String(req.query?.date || "").trim();
    const monthKey = String(req.query?.month || "").trim();
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }
    const appointment = await fetchAppointmentScheduleRemarkContext(appointmentID);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }
    if (Number(appointment.s_sacramentID) > 0) {
      return res.status(400).json({ message: "Special sacrament programs use the program schedule." });
    }
    const excludeCalendarEntryID = await fetchAppointmentCalendarEntryID(appointmentID);
    const advanceDays = await resolveAppointmentScheduleAdvanceDays(appointment.adminID, appointment);
    if (dateKey) {
      const availability = await getPriestDayAvailability({
        priestID,
        adminID: appointment.adminID,
        dateKey,
        excludeCalendarEntryID,
        advanceDays,
      });
      return res.json(availability);
    }
    if (monthKey) {
      const monthAvailability = await getPriestMonthAvailability({
        priestID,
        adminID: appointment.adminID,
        monthKey,
        excludeCalendarEntryID,
        advanceDays,
      });
      return res.json(monthAvailability);
    }
    const window = await getPriestOpenScheduleWindow({
      priestID,
      adminID: appointment.adminID,
      excludeCalendarEntryID,
      advanceDays,
    });
    return res.json(window);
  } catch (error) {
    const status = Number(error?.status);
    if (!Number.isInteger(status) || status < 400 || status >= 500) {
      console.error("Preferred slots fetch error:", error);
      return res.status(500).json({ message: "Unable to load available schedule dates." });
    }
    return res.status(status).json({ message: error.message || "Unable to load available schedule dates." });
  }
});

app.post("/appointments/:id/schedule-remarks", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    const userID = Number(req.body?.userID || req.query?.userID);
    const decision = String(req.body?.decision || "").trim().toLowerCase();
    const message = String(req.body?.message || "").trim();
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }
    if (!Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "A valid userID is required." });
    }
    if (decision !== "accepted" && decision !== "preferred") {
      return res.status(400).json({ message: "Decision must be accepted or preferred." });
    }

    const appointment = await fetchAppointmentScheduleRemarkContext(appointmentID);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }
    if (Number(appointment.userID) !== userID) {
      return res.status(403).json({ message: "You can only remark on your own appointment." });
    }
    const eligibility = buildScheduleRemarkEligibility(appointment);
    if (!eligibility.canRemark) {
      return res.status(400).json({
        message: "Schedule remarks are available after payment, checklist completion, and the parish sets a date, time, and priest.",
      });
    }

    const existingRemarks = await fetchAppointmentScheduleRemarks(appointmentID);
    const existingPreferredRequest = existingRemarks.find((item) => item.decision === "preferred") || null;
    if (decision === "preferred" && existingPreferredRequest) {
      return res.status(409).json({
        message: "You already used your one preferred schedule request for this appointment.",
      });
    }
    if (decision === "accepted" && existingPreferredRequest?.status === "pending") {
      return res.status(409).json({
        message: "Your preferred schedule request is still being reviewed by the parish office.",
      });
    }

    let preferredDate = "";
    let preferredTime = "";
    let preferredPriestID = null;
    if (decision === "preferred") {
      if (!eligibility.canRequestPreferred) {
        return res.status(400).json({ message: "This program schedule is set by the parish office." });
      }
      preferredDate = String(req.body?.preferredDate || "").trim().slice(0, 10);
      preferredTime = normalizeTimeToHHMM(req.body?.preferredTime);
      preferredPriestID = Number(req.body?.preferredPriestID);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || !preferredTime) {
        return res.status(400).json({ message: "Choose a preferred date and an available 1-hour time slot." });
      }
      if (!Number.isInteger(preferredPriestID) || preferredPriestID <= 0) {
        return res.status(400).json({ message: "Choose a preferred priest." });
      }
      const preferredDateTime = toManilaScheduledEventDateTime(preferredDate, preferredTime);
      if (!preferredDateTime) {
        return res.status(400).json({ message: "The preferred date and time is invalid." });
      }
      const excludeCalendarEntryID = await fetchAppointmentCalendarEntryID(appointmentID);
      const availability = await getPriestDayAvailability({
        priestID: preferredPriestID,
        adminID: appointment.adminID,
        dateKey: preferredDate,
        excludeCalendarEntryID,
        advanceDays: await resolveAppointmentScheduleAdvanceDays(appointment.adminID, appointment),
      });
      const endTime = getManilaOneHourSlot(preferredDateTime)?.endTime;
      const selectedSlot = (availability.slots || []).find(
        (slot) => slot.startTime === preferredTime && slot.endTime === endTime,
      );
      if (!selectedSlot?.available) {
        return res.status(409).json({
          message: "That date and time conflicts with an existing schedule. Please choose another open slot.",
        });
      }
    }

    const remarkMessage =
      message ||
      (decision === "accepted" ? "I'm okay with that scheduled." : "Please consider my preferred date, time, and priest.");

    const savedResult = await query(
      `
        INSERT INTO appointment_schedule_remarks (
          "appointmentID",
          "userID",
          decision,
          message,
          "preferredDate",
          "preferredTime",
          "preferredPriestID",
          "currentScheduledEventDateTime",
          "currentPriestID",
          status
        )
        VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8::timestamptz, $9, 'pending')
        ON CONFLICT ("appointmentID") WHERE status = 'pending'
        DO UPDATE SET
          decision = EXCLUDED.decision,
          message = EXCLUDED.message,
          "preferredDate" = EXCLUDED."preferredDate",
          "preferredTime" = EXCLUDED."preferredTime",
          "preferredPriestID" = EXCLUDED."preferredPriestID",
          "currentScheduledEventDateTime" = EXCLUDED."currentScheduledEventDateTime",
          "currentPriestID" = EXCLUDED."currentPriestID",
          "updatedAt" = NOW()
        RETURNING
          "remarkID",
          "appointmentID",
          "userID",
          decision,
          message,
          "preferredDate",
          "preferredTime",
          "preferredPriestID",
          "currentScheduledEventDateTime",
          "currentPriestID",
          status,
          "adminDecision",
          "reviewedByAdminID",
          "reviewedAt",
          "createdAt",
          "updatedAt"
      `,
      [
        appointmentID,
        userID,
        decision,
        remarkMessage,
        preferredDate || null,
        preferredTime || null,
        preferredPriestID,
        appointment.scheduledEventDateTime || null,
        Number(appointment.priestID) > 0 ? Number(appointment.priestID) : null,
      ],
    );

    const saved = mapAppointmentScheduleRemark({
      ...savedResult.rows[0],
      preferredPriestName: preferredPriestID ? await fetchPriestDisplayName(preferredPriestID) : "",
    });
    const requesterName = String(appointment.requesterFullName || "A requester").trim() || "A requester";
    const serviceName = String(appointment.serviceName || "appointment").trim() || "appointment";
    const wasUpdate = Boolean(saved.updatedAt && saved.createdAt && saved.updatedAt !== saved.createdAt);
    await createAdminNotification({
      adminID: appointment.adminID,
      type: "user_schedule_remark",
      title: decision === "accepted" ? "Requester confirmed the schedule" : "Requester sent a preferred schedule",
      body:
        decision === "accepted"
          ? `${requesterName} confirmed the ${serviceName} schedule.`
          : `${requesterName} requested a different ${serviceName} date, time, or priest.`,
      severity: "info",
      metadata: {
        path: `/admin/progress-tracker/${appointmentID}?remarkID=${saved.remarkID}`,
        appointmentID,
        remarkID: saved.remarkID,
        decision,
      },
    });
    if (decision === "preferred") {
      await notifyPriestsPreferredScheduleRequested({
        appointmentID,
        currentPriestID: Number(appointment.priestID) > 0 ? Number(appointment.priestID) : null,
        preferredPriestID,
        requesterName,
        serviceName,
        preferredDate,
        preferredTime,
      });
    }

    const updatedRemarks = await fetchAppointmentScheduleRemarks(appointmentID);
    const savedPreferredRequest = updatedRemarks.find((item) => item.decision === "preferred") || null;
    return res.status(wasUpdate ? 200 : 201).json({
      remark: saved,
      remarks: updatedRemarks,
      canRequestPreferred: eligibility.canRequestPreferred && !savedPreferredRequest,
      preferredRequestUsed: Boolean(savedPreferredRequest),
      preferredRequest: savedPreferredRequest,
    });
  } catch (error) {
    console.error("Appointment schedule remark save error:", error);
    return res.status(500).json({ message: "Unable to save schedule remarks." });
  }
});

app.patch("/appointments/:id/schedule-remarks/:remarkID/review", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    const remarkID = Number(req.params.remarkID);
    const adminID = Number(req.body?.adminID || req.query?.adminID);
    const applyPreferred = Boolean(req.body?.applyPreferred);
    const adminDecision = String(req.body?.adminDecision || "").trim().toLowerCase();
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }
    if (!Number.isInteger(remarkID) || remarkID <= 0) {
      return res.status(400).json({ message: "A valid remarkID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const appointment = await fetchAppointmentScheduleRemarkContext(appointmentID);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }
    if (Number(appointment.adminID) !== adminID) {
      return res.status(403).json({ message: "This appointment belongs to another parish office." });
    }

    const remarkResult = await query(
      `
        SELECT
          r.*,
          p."fullName" AS "preferredPriestName"
        FROM appointment_schedule_remarks r
        LEFT JOIN priests p ON p."priestID" = r."preferredPriestID"
        WHERE r."remarkID" = $1
          AND r."appointmentID" = $2
        LIMIT 1
      `,
      [remarkID, appointmentID],
    );
    if (remarkResult.rows.length === 0) {
      return res.status(404).json({ message: "Schedule remark not found." });
    }
    const remark = mapAppointmentScheduleRemark(remarkResult.rows[0]);
    let resolvedAdminDecision = adminDecision === "updated" ? "updated" : adminDecision === "kept" ? "kept" : "";
    if (applyPreferred) {
      if (remark.status !== "pending") {
        return res.status(409).json({ message: "This preferred schedule request has already been reviewed." });
      }
      if (remark.decision !== "preferred" || !remark.preferredDate || !remark.preferredTime || !remark.preferredPriestID) {
        return res.status(400).json({ message: "This remark does not include a preferred schedule to apply." });
      }
      const nextScheduledEventDateTime = toManilaScheduledEventDateTime(remark.preferredDate, remark.preferredTime);
      await applyAppointmentScheduleChange({
        appointmentID,
        appointment,
        nextScheduledEventDateTime,
        nextPriestID: remark.preferredPriestID,
      });
      resolvedAdminDecision = "updated";
      try {
        // Same SMS as "Set Next Event Schedule" -> Confirm, to the requester and the (preferred) priest.
        await sendProgressScheduleSms({
          appointmentID,
          previousSchedule: appointment.scheduledEventDateTime,
          nextSchedule: nextScheduledEventDateTime,
          previousPriestID: appointment.priestID,
          nextPriestID: remark.preferredPriestID,
        });
      } catch (smsError) {
        console.error("Preferred schedule SMS error:", smsError);
      }
    } else if (!resolvedAdminDecision) {
      resolvedAdminDecision = remark.decision === "accepted" ? "kept" : "kept";
    }

    const updateResult = await query(
      `
        UPDATE appointment_schedule_remarks
        SET
          status = 'reviewed',
          "reviewedByAdminID" = $3,
          "reviewedAt" = NOW(),
          "adminDecision" = $4,
          "updatedAt" = NOW()
        WHERE "remarkID" = $1
          AND "appointmentID" = $2
        RETURNING
          "remarkID",
          "appointmentID",
          "userID",
          decision,
          message,
          "preferredDate",
          "preferredTime",
          "preferredPriestID",
          "currentScheduledEventDateTime",
          "currentPriestID",
          status,
          "adminDecision",
          "reviewedByAdminID",
          "reviewedAt",
          "createdAt",
          "updatedAt"
      `,
      [remarkID, appointmentID, adminID, resolvedAdminDecision],
    );

    const reviewed = mapAppointmentScheduleRemark({
      ...updateResult.rows[0],
      preferredPriestName: remark.preferredPriestName,
    });
    await createUserNotification({
      userID: Number(appointment.userID),
      type: "user_schedule_remark_reviewed",
      title:
        resolvedAdminDecision === "updated"
          ? "Parish office updated your schedule"
          : "Parish office reviewed your schedule remarks",
      body:
        resolvedAdminDecision === "updated"
          ? "The parish office applied your preferred date, time, or priest. Please review the updated schedule."
          : remark.decision === "accepted"
            ? "The parish office noted that you confirmed the scheduled date, time, and priest."
            : "The parish office reviewed your preferred schedule request and kept the original schedule.",
      severity: "info",
      metadata: {
        path: `/dashboard/status/${appointmentID}`,
        appointmentID,
        remarkID,
        adminDecision: resolvedAdminDecision,
      },
    });

    return res.json({
      remark: reviewed,
      remarks: await fetchAppointmentScheduleRemarks(appointmentID),
    });
  } catch (error) {
    const status = Number(error?.status);
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      return res.status(status).json({ message: error.message });
    }
    console.error("Appointment schedule remark review error:", error);
    return res.status(500).json({ message: "Unable to review schedule remarks." });
  }
});

app.post("/appointments/:id/progress/payment-records", (req, res, next) => {
  progressPaymentUpload.single("receiptFile")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Receipt file size must be 10MB or smaller." });
    }
    return res.status(400).json({ message: error.message || "Unable to upload payment receipt." });
  });
}, async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    const invoiceNumber = String(req.body?.invoiceNumber || req.body?.invoiceReceiptNumber || "").trim();
    const paymentDate = String(req.body?.paymentDate || "").trim();
    const stepIndex = Number(req.body?.stepIndex);
    const adminID = Number(req.body?.adminID);

    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }
    if (!invoiceNumber) {
      return res.status(400).json({ message: "Invoice or receipt number is required." });
    }
    const parsedPaymentDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ? new Date(`${paymentDate}T00:00:00`) : null;
    if (!parsedPaymentDate || Number.isNaN(parsedPaymentDate.getTime())) {
      return res.status(400).json({ message: "Date of payment is required." });
    }
    const todayManilaKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    if (paymentDate > todayManilaKey) {
      return res.status(400).json({ message: "Date of payment cannot be in the future." });
    }
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 4) {
      return res.status(400).json({ message: "Payment can only be recorded for steps 1 to 5." });
    }

    const appointmentResult = await query(
      `
        SELECT
          a."appointmentID",
          a."priestID",
          p."fullName" AS "priestName",
          a."sacramentID",
          a."s_sacramentID",
          a.status::text AS "appointmentStatus",
          a."finishedAt",
          a.credentials,
          ss."s_sacramentName" AS "specialSacramentName"
        FROM appointments a
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN priests p ON p."priestID" = a."priestID"
        WHERE a."appointmentID" = $1
        LIMIT 1
      `,
      [appointmentID],
    );
    if (appointmentResult.rows.length === 0) {
      return res.status(404).json({ message: "Appointment not found." });
    }
    const appointment = appointmentResult.rows[0];

    const existingProgress = await query(
      `
        SELECT
          "progressID",
          "templateID",
          checklist_data,
          "scheduledEventDateTime",
          "eventDone",
          "priestComments",
          "secretaryRemarks"
        FROM progress_tracker
        WHERE "appointmentID" = $1
        LIMIT 1
      `,
      [appointmentID],
    );
    const current = existingProgress.rows[0] || {};
    const currentRecords = readPaymentRecordsFromSources({
      credentials: appointment.credentials,
    });
    const editExisting = String(req.body?.editExisting || "").trim().toLowerCase() === "true";
    const uploadedReceiptFileName = req.file ? path.basename(String(req.file.filename || req.file.path || "").trim()) : "";
    const receiptFileUrl = uploadedReceiptFileName
      ? `${progressPaymentPublicBasePath}/${appointmentID}/${uploadedReceiptFileName}`
      : null;
    const newRecord = {
      recordID: `payment-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      invoiceNumber,
      paymentDate,
      receiptFileUrl,
      receiptFileName: req.file
        ? String(req.file.originalname || uploadedReceiptFileName || "receipt").trim()
        : null,
      recordedAt: new Date().toISOString(),
      recordedAtStep: stepIndex + 1,
      recordedByAdminID: Number.isInteger(adminID) && adminID > 0 ? adminID : null,
      isArchived: false,
      archivedAt: null,
    };
    const lastActiveIndex = currentRecords.reduce((foundIndex, record, index) => (record.isArchived ? foundIndex : index), -1);
    const nextPaymentRecords =
      editExisting && lastActiveIndex >= 0
        ? currentRecords.map((record, index) => {
            if (index !== lastActiveIndex) return record;
            return {
              ...record,
              invoiceNumber,
              paymentDate,
              receiptFileUrl: receiptFileUrl || record.receiptFileUrl || null,
              receiptFileName: req.file
                ? String(req.file.originalname || uploadedReceiptFileName || record.receiptFileName || "receipt").trim()
                : record.receiptFileName,
              recordedAtStep: stepIndex + 1,
              recordedByAdminID: Number.isInteger(adminID) && adminID > 0 ? adminID : record.recordedByAdminID,
              isArchived: false,
              archivedAt: null,
            };
          })
        : [...currentRecords, newRecord];
    const nextCredentials = mergeCredentialsPaymentRecords(appointment.credentials, nextPaymentRecords);

    let templateID = Number(current.templateID) || null;
    if (!Number.isInteger(templateID) || templateID <= 0) {
      templateID = await resolveAppointmentProgressTemplate({
        sacramentID: Number(appointment.sacramentID) || null,
        s_sacramentID: Number(appointment.s_sacramentID) || null,
        specialSacramentName: appointment.specialSacramentName,
      });
    }

    const nextChecklist = Array.isArray(current.checklist_data) ? current.checklist_data : [];
    const client = await pool.connect();
    let saved;
    try {
      await client.query("BEGIN");
      await client.query(
        `
          UPDATE appointments
          SET credentials = $2::jsonb
          WHERE "appointmentID" = $1
        `,
        [appointmentID, JSON.stringify(nextCredentials)],
      );
      const upsertResult = await client.query(
        `
          INSERT INTO progress_tracker (
            "appointmentID",
            "templateID",
            checklist_data,
            "scheduledEventDateTime",
            "eventDone",
            "priestComments",
            "secretaryRemarks",
            "updatedAt"
          )
          VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5, $6, $7, NOW())
          ON CONFLICT ("appointmentID") DO UPDATE
          SET
            "templateID" = COALESCE(EXCLUDED."templateID", progress_tracker."templateID"),
            checklist_data = COALESCE(EXCLUDED.checklist_data, progress_tracker.checklist_data),
            "scheduledEventDateTime" = COALESCE(EXCLUDED."scheduledEventDateTime", progress_tracker."scheduledEventDateTime"),
            "eventDone" = COALESCE(EXCLUDED."eventDone", progress_tracker."eventDone"),
            "priestComments" = COALESCE(EXCLUDED."priestComments", progress_tracker."priestComments"),
            "secretaryRemarks" = COALESCE(EXCLUDED."secretaryRemarks", progress_tracker."secretaryRemarks"),
            "updatedAt" = NOW()
          RETURNING
            "progressID",
            "templateID",
            checklist_data,
            "scheduledEventDateTime",
            "eventDone",
            "priestComments",
            "secretaryRemarks",
            "updatedAt"
        `,
        [
          appointmentID,
          Number.isInteger(templateID) && templateID > 0 ? templateID : null,
          JSON.stringify(nextChecklist),
          current.scheduledEventDateTime || null,
          Boolean(current.eventDone),
          current.priestComments || "",
          current.secretaryRemarks || "",
        ],
      );
      saved = upsertResult.rows[0];
      if (saved?.progressID) {
        await client.query(
          `
            UPDATE appointments
            SET "progressID" = $1
            WHERE "appointmentID" = $2
              AND ("progressID" IS DISTINCT FROM $1)
          `,
          [saved.progressID, appointmentID],
        );
      }
      await client.query("COMMIT");
    } catch (transactionError) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        /* ignore rollback errors */
      }
      throw transactionError;
    } finally {
      client.release();
    }

    try {
      await notifyProgressPaymentRecorded({
        appointmentID,
        invoiceNumber,
        isEdit: editExisting && lastActiveIndex >= 0,
      });
    } catch (notificationError) {
      console.error("Progress payment notification error:", notificationError);
    }

    try {
      const hadCalendarEntry = Boolean(await fetchAppointmentCalendarEntryID(appointmentID));
      const restoredEntry = await restoreAppointmentCalendarEntry(appointmentID);
      if (restoredEntry && !hadCalendarEntry) {
        await notifyPriestCalendarRestored({ appointmentID });
      }
    } catch (calendarError) {
      console.error("Paid appointment calendar restore error:", calendarError);
    }

    return res.status(201).json(
      await buildProgressResponse(appointmentID, {
        ...saved,
        credentials: nextCredentials,
        paymentRecords: nextPaymentRecords,
        priestID: appointment.priestID,
        priestName: appointment.priestName,
        appointmentStatus: appointment.appointmentStatus,
        finishedAt: appointment.finishedAt,
      }),
    );
  } catch (error) {
    console.error("Progress payment record save error:", error);
    return res.status(500).json({ message: "Unable to record payment." });
  }
});

app.delete("/appointments/:id/progress/payment-records", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const appointmentResult = await query(
      `
        SELECT
          a."appointmentID",
          a."priestID",
          p."fullName" AS "priestName",
          a."sacramentID",
          a."s_sacramentID",
          a.status::text AS "appointmentStatus",
          a."finishedAt",
          a.credentials,
          ss."s_sacramentName" AS "specialSacramentName"
        FROM appointments a
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN priests p ON p."priestID" = a."priestID"
        WHERE a."appointmentID" = $1
        LIMIT 1
      `,
      [appointmentID],
    );
    if (appointmentResult.rows.length === 0) {
      return res.status(404).json({ message: "Appointment not found." });
    }
    const appointment = appointmentResult.rows[0];

    const existingProgress = await query(
      `
        SELECT
          "progressID",
          "templateID",
          checklist_data,
          "scheduledEventDateTime",
          "eventDone",
          "priestComments",
          "secretaryRemarks"
        FROM progress_tracker
        WHERE "appointmentID" = $1
        LIMIT 1
      `,
      [appointmentID],
    );
    const current = existingProgress.rows[0];
    if (!current) {
      return res.status(404).json({ message: "No recorded payment found for this appointment." });
    }

    const currentRecords = readPaymentRecordsFromSources({
      credentials: appointment.credentials,
    });
    const previousAmount = sumProgressPaymentAmount(currentRecords);
    const isCurrentlyPaid = hasRecordedProgressPayment(currentRecords) || previousAmount > 0;
    if (!isCurrentlyPaid) {
      return res.status(400).json({ message: "This appointment has no payment to undo." });
    }

    const archivedAt = new Date().toISOString();
    const nextPaymentRecords = currentRecords.map((record) =>
      record.isArchived
        ? record
        : {
            ...record,
            isArchived: true,
            archivedAt,
          },
    );
    const nextCredentials = mergeCredentialsPaymentRecords(appointment.credentials, nextPaymentRecords);
    await query(
      `
        UPDATE appointments
        SET credentials = $2::jsonb
        WHERE "appointmentID" = $1
      `,
      [appointmentID, JSON.stringify(nextCredentials)],
    );

    try {
      const removedCalendar = await removeAppointmentCalendarEntry(appointmentID);
      if (removedCalendar) {
        await notifyPriestCalendarHold({ appointmentID });
      }
    } catch (calendarError) {
      console.error("Unpaid appointment calendar remove error:", calendarError);
    }

    const saved = current;
    try {
      await notifyProgressPaymentUndone({
        appointmentID,
        previousAmount,
      });
    } catch (notificationError) {
      console.error("Progress payment undo notification error:", notificationError);
    }

    return res.json(
      await buildProgressResponse(appointmentID, {
        ...saved,
        credentials: nextCredentials,
        paymentRecords: nextPaymentRecords,
        priestID: appointment.priestID,
        priestName: appointment.priestName,
        appointmentStatus: appointment.appointmentStatus,
        finishedAt: appointment.finishedAt,
      }),
    );
  } catch (error) {
    console.error("Progress payment undo error:", error);
    return res.status(500).json({ message: "Unable to undo payment." });
  }
});

app.get("/certificate-requests", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT
          cr."certID",
          cr."userID",
          cr."certificateTypeID",
          cr.status::text AS status,
          cr.credentials,
          cr."pickupDate",
          cr."pickupTime",
          cr."claimedAt",
          cr."requestSource",
          cr."createdAt",
          cr."updatedAt",
          COALESCE(ct."formSchema"->>'label', 'Certificate Request') AS "certificateType",
          ${sqlPersonFullName("u")} AS "userFullName",
          u."contactNumber" AS "userContactNumber",
          u.address AS "userAddress"
        FROM cert_request cr
        LEFT JOIN certificate_type ct ON ct."certificateTypeID" = cr."certificateTypeID"
        LEFT JOIN users u ON u."userID" = cr."userID"
        ORDER BY cr."createdAt" DESC, cr."certID" DESC
      `,
    );

    const payload = result.rows.map((row) => {
      const credentials = row.credentials && typeof row.credentials === "object" ? row.credentials : {};
      const certificateType = formatCertificateTypeLabel(row.certificateType);
      const fullName = resolveCertificateSubjectName(certificateType, credentials);
      const submittedByName = String(row.userFullName || "").trim() || (String(row.requestSource || "").trim().toLowerCase() === "onsite" ? "Onsite" : "Not linked");
      const contactNumber = String(
        row.userContactNumber ||
          credentials.groomPhoneNumber ||
          credentials.bridePhoneNumber ||
          credentials.phoneNumber ||
          credentials.contactNumber ||
          "",
      ).trim();

      const details = {
        fullName: fullName || null,
        contactNumber: contactNumber || null,
        ...credentials,
        address: credentials.address || row.userAddress || null,
      };

      return {
        id: Number(row.certID),
        userID: row.userID === null ? null : Number(row.userID),
        certificateTypeID: row.certificateTypeID === null ? null : Number(row.certificateTypeID),
        certificateType,
        fullName: fullName || "Unknown Requester",
        submittedByName,
        contactNumber: contactNumber || "Not provided",
        status: row.status || "Pending",
        pickupDate: row.pickupDate || null,
        pickupTime: row.pickupTime || null,
        pickupEndTime: getCertificatePickupEndTime(row.pickupTime),
        pickupSchedule: formatCertificatePickupLabel(row.pickupDate, row.pickupTime) || null,
        claimedAt: row.claimedAt || null,
        declineReason: credentials.declineReason || null,
        receiptNumber: credentials.receiptNumber || credentials.invoiceNumber || null,
        invoiceNumber: credentials.invoiceNumber || credentials.receiptNumber || null,
        paymentStatus: resolveCertificatePaymentStatus({ credentials }),
        requestSource: String(row.requestSource || "online").trim().toLowerCase() === "onsite" ? "onsite" : "online",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        details,
      };
    });

    return res.json(payload);
  } catch (error) {
    console.error("Certificate requests fetch error:", error);
    return res.status(500).json({ message: "Unable to load certificate requests." });
  }
});

app.post("/certificate-requests", async (req, res) => {
  try {
    const requestSource = String(req.body?.requestSource || "online").trim().toLowerCase() === "onsite" ? "onsite" : "online";
    const userID = Number(req.body?.userID);
    const certificateTypeID = Number(req.body?.certificateTypeID);
    const rawCredentials = req.body?.credentials && typeof req.body.credentials === "object" && !Array.isArray(req.body.credentials)
      ? req.body.credentials
      : {};

    if (requestSource !== "onsite" && (!Number.isInteger(userID) || userID <= 0)) {
      return res.status(400).json({ message: "A valid userID is required." });
    }
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) {
      return res.status(400).json({ message: "A valid certificate type is required." });
    }

    const certificateType = await findCertificateTypeById(certificateTypeID);
    if (!certificateType) {
      return res.status(404).json({ message: "Certificate type not found." });
    }

    let requesterAccountName = "";
    if (requestSource !== "onsite") {
      const userResult = await query(
        `SELECT "userID", ${sqlPersonFullName()} AS "fullName" FROM users WHERE "userID" = $1 LIMIT 1`,
        [userID],
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }
      requesterAccountName = String(userResult.rows[0]?.fullName || "").trim();
    }

    const credentials = {};
    for (const field of certificateType.formSchema.fields) {
      const key = String(field.key || "").trim();
      if (!key) continue;
      const rawValue = rawCredentials[key];
      const value = rawValue === undefined || rawValue === null ? "" : String(rawValue).trim();
      if (!value && field.required !== false) {
        return res.status(400).json({ message: `${field.label || key} is required.` });
      }
      if (value) {
        credentials[key] = value;
      }
    }

    const inserted = await query(
      `
        INSERT INTO cert_request ("userID", "certificateTypeID", status, credentials, "requestSource")
        VALUES ($1, $2, $3::certificate_request_status, $4::jsonb, $5)
        RETURNING
          "certID",
          "userID",
          "certificateTypeID",
          status::text AS status,
          credentials,
          "requestSource",
          "pickupDate",
          "pickupTime",
          "createdAt",
          "updatedAt"
      `,
      [
        requestSource === "onsite" ? null : userID,
        certificateTypeID,
        requestSource === "onsite" ? "Approved" : "Pending",
        JSON.stringify(credentials),
        requestSource,
      ],
    );

    const createdRequest = inserted.rows[0];
    const certID = Number(createdRequest?.certID);
    const requesterName =
      String(
        requesterAccountName ||
          credentials.groomFullName ||
          credentials.brideFullName ||
          credentials.childFullName ||
          credentials.fullName ||
          "A parishioner",
      ).trim() || "A parishioner";
    const certificateLabel = String(certificateType.label || "certificate").trim() || "certificate";

    if (requestSource !== "onsite") {
      try {
        await createAdminNotification({
          adminID: 1,
          type: "certificate_request",
          title: "New certificate request",
          body: `${requesterName} submitted a ${certificateLabel} request.`,
          severity: "info",
          metadata: {
            path: Number.isInteger(certID) && certID > 0
              ? `/admin/certificate-requests?certID=${certID}`
              : "/admin/certificate-requests",
            certID: Number.isInteger(certID) && certID > 0 ? certID : null,
            certificateTypeID,
          },
        });
      } catch (notificationError) {
        console.error("Certificate request notification error:", notificationError);
      }
    }

    return res.status(201).json({
      item: {
        ...createdRequest,
        certificateType: certificateType.label,
        formSchema: certificateType.formSchema,
      },
    });
  } catch (error) {
    console.error("Certificate request create error:", error);
    return res.status(500).json({ message: "Unable to submit certificate request." });
  }
});

app.patch("/certificate-requests/:id/status", async (req, res) => {
  try {
    const certID = Number(req.params.id);
    const statusInput = String(req.body?.status || "").trim().toLowerCase();
    const pickupDate = req.body?.pickupDate || null;
    const pickupTime = req.body?.pickupTime || null;
    const declineReason = String(req.body?.declineReason || "").trim();
    const receiptNumber = String(req.body?.receiptNumber || "").trim();

    if (!Number.isInteger(certID) || certID <= 0) {
      return res.status(400).json({ message: "Invalid certificate request ID." });
    }

    const statusMap = {
      pending: "Pending",
      approved: "Approved",
      completed: "Completed",
      cancelled: "Cancelled",
      canceled: "Cancelled",
      declined: "Cancelled",
    };
    const resolvedStatus = statusMap[statusInput];
    if (!resolvedStatus) {
      return res.status(400).json({ message: "Invalid certificate request status." });
    }
    if (resolvedStatus === "Completed" && !receiptNumber) {
      return res.status(400).json({ message: "Invoice or receipt number is required." });
    }

    const existingResult = await query(
      `
        SELECT status::text AS status, "requestSource"
        FROM cert_request
        WHERE "certID" = $1
        LIMIT 1
      `,
      [certID],
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: "Certificate request not found." });
    }
    const currentStatus = String(existingResult.rows[0]?.status || "").trim().toLowerCase();
    const requestSource = String(existingResult.rows[0]?.requestSource || "online").trim().toLowerCase();
    if (requestSource === "onsite" && resolvedStatus !== "Completed") {
      return res.status(400).json({ message: "Onsite certificate requests can only be marked as done." });
    }
    if (resolvedStatus === "Pending" && currentStatus !== "cancelled" && currentStatus !== "canceled") {
      return res.status(400).json({ message: "Only declined certificate requests can be restored to pending." });
    }

    let resolvedPickupDate = pickupDate ? String(pickupDate).slice(0, 10) : null;
    let resolvedPickupSlot = null;
    if (resolvedStatus === "Approved") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(resolvedPickupDate || ""))) {
        return res.status(400).json({ message: "Pickup date is required." });
      }
      const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
      if (resolvedPickupDate < todayKey) {
        return res.status(400).json({ message: "Pickup date cannot be in the past." });
      }
      const dayOffCheck = await assertCertificatePickupDateNotOfficeDayOff(resolvedPickupDate, 1);
      if (!dayOffCheck.ok) {
        return res.status(400).json({ message: dayOffCheck.message });
      }
      resolvedPickupSlot = resolveCertificatePickupSlot(pickupTime);
      if (!resolvedPickupSlot) {
        return res.status(400).json({ message: "Choose a pickup time slot from 8:00 AM to 5:00 PM." });
      }
    }

    const paymentDate = resolvedStatus === "Completed"
      ? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
      : "";

    const updateResult = await query(
      `
        UPDATE cert_request
        SET status = $1::certificate_request_status,
            "pickupDate" = CASE
              WHEN $1::certificate_request_status = 'Approved' THEN $2::date
              WHEN $1::certificate_request_status = 'Pending' THEN NULL
              ELSE "pickupDate"
            END,
            "pickupTime" = CASE
              WHEN $1::certificate_request_status = 'Approved' THEN $3::time
              WHEN $1::certificate_request_status = 'Pending' THEN NULL
              ELSE "pickupTime"
            END,
            "claimedAt" = CASE
              WHEN $1::certificate_request_status = 'Completed' THEN COALESCE("claimedAt", NOW())
              WHEN $1::certificate_request_status = 'Pending' THEN NULL
              ELSE "claimedAt"
            END,
            credentials = CASE
              WHEN $1::certificate_request_status = 'Pending'
                THEN (((COALESCE(credentials, '{}'::jsonb) - 'declineReason') - 'receiptNumber' - 'invoiceNumber') - 'paymentDate')
              WHEN $1::certificate_request_status = 'Cancelled' AND NULLIF($4, '') IS NOT NULL
                THEN COALESCE(credentials, '{}'::jsonb) || jsonb_build_object('declineReason', $4)
              WHEN $1::certificate_request_status = 'Completed' AND NULLIF($5, '') IS NOT NULL
                THEN COALESCE(credentials, '{}'::jsonb) || jsonb_build_object('receiptNumber', $5, 'invoiceNumber', $5, 'paymentDate', $7::text)
              ELSE credentials
            END,
            "updatedAt" = NOW()
        WHERE "certID" = $6
        RETURNING "certID", "userID", status::text AS status, "pickupDate", "pickupTime", "claimedAt", credentials, "updatedAt"
      `,
      [
        resolvedStatus,
        resolvedPickupDate,
        resolvedPickupSlot?.startTime || null,
        declineReason,
        receiptNumber,
        certID,
        paymentDate,
      ],
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Certificate request not found." });
    }
    const updated = updateResult.rows[0];
    const credentials = updated.credentials && typeof updated.credentials === "object" ? updated.credentials : {};
    const notificationAction =
      resolvedStatus === "Approved"
        ? "approved"
        : resolvedStatus === "Cancelled"
          ? "declined"
          : resolvedStatus === "Completed"
            ? "completed"
            : resolvedStatus === "Pending"
              ? "pending"
              : "";

    try {
      if (notificationAction) {
        await notifyCertificateRequester({
          certID,
          action: notificationAction,
          declineReason,
          pickupDate: updated.pickupDate || resolvedPickupDate,
          pickupTime: updated.pickupTime || resolvedPickupSlot?.startTime || pickupTime,
        });
      }
    } catch (notificationError) {
      console.error("Certificate requester notification error:", notificationError);
    }

    const requesterUserID = Number(updated.userID);
    if (Number.isInteger(requesterUserID) && requesterUserID > 0) {
      pushNotificationStreamEvent("user", requesterUserID, {
        action: "realtime_update",
        resource: "certificate_requests",
        certID,
        status: resolvedStatus,
      });
    }
    broadcastAdminRealtimeEvent({
      resource: "certificate_requests",
      certID,
      status: resolvedStatus,
    });

    return res.json({
      ...updated,
      pickupSchedule: formatCertificatePickupLabel(updated.pickupDate, updated.pickupTime) || null,
      pickupEndTime: getCertificatePickupEndTime(updated.pickupTime || resolvedPickupSlot?.startTime || pickupTime),
      declineReason: credentials.declineReason || null,
      receiptNumber: credentials.receiptNumber || credentials.invoiceNumber || receiptNumber || null,
      invoiceNumber: credentials.invoiceNumber || credentials.receiptNumber || receiptNumber || null,
      paymentStatus: resolveCertificatePaymentStatus({ credentials }),
    });
  } catch (error) {
    console.error("Certificate request status update error:", error);
    return res.status(500).json({ message: "Unable to update certificate request." });
  }
});

app.get("/sacraments", async (req, res) => {
  try {
    const archivedFilter = String(req.query?.archived || "").trim().toLowerCase();
    const whereClause =
      archivedFilter === "false"
        ? `WHERE COALESCE("isArchived", FALSE) = FALSE`
        : archivedFilter === "true"
          ? `WHERE COALESCE("isArchived", FALSE) = TRUE`
          : "";
    const result = await query(
      `
        SELECT
          "sacramentID",
          "sacramentName",
          "formSchema",
          requirements,
          "schemaAliases",
          "isArchived",
          "residentFee"::float8 AS "residentFee",
          "nonResidentFee"::float8 AS "nonResidentFee"
        FROM sacraments
        ${whereClause}
        ORDER BY "sacramentName" ASC
      `,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Sacraments fetch error:", error);
    return res.status(500).json({ message: "Unable to load sacraments." });
  }
});

app.get("/sacraments/archived", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT "sacramentID", "sacramentName", "formSchema", requirements, "schemaAliases", "isArchived"
        FROM sacraments
        WHERE COALESCE("isArchived", FALSE) = TRUE
        ORDER BY "sacramentName" ASC
      `,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Archived sacraments fetch error:", error);
    return res.status(500).json({ message: "Unable to load archived sacrament types." });
  }
});

const normalizeCertificateFormSchema = (rawSchema, fallbackLabel = "Certificate") => {
  const source = rawSchema && typeof rawSchema === "object" ? rawSchema : {};
  const label = formatCertificateTypeLabel(source.label || fallbackLabel, fallbackLabel);
  const fields = Array.isArray(source.fields)
    ? source.fields.map((field, index) => sanitizeSchemaField(field, index))
    : [];
  return { label, fields };
};

const mapCertificateTypeRow = (row) => {
  const formSchema = normalizeCertificateFormSchema(row.formSchema || row.formSchema);
  const certTypeName = String(row.certTypeName || "").trim();
  return {
    certificateTypeID: Number(row.certificateTypeID),
    certTypeName,
    isArchived: row.isArchived === true,
    label: certTypeName || formSchema.label,
    formSchema,
    fee: row.fee === null || row.fee === undefined ? null : Number(row.fee),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const listCertificateTypes = async ({ archived = false } = {}) => {
  const result = await query(
    `
      SELECT "certificateTypeID", "certTypeName", "isArchived", "formSchema", "fee", "createdAt", "updatedAt"
      FROM certificate_type
      WHERE COALESCE("isArchived", FALSE) = ${archived ? "TRUE" : "FALSE"}
      ORDER BY "certificateTypeID" ASC
    `,
  );
  return result.rows.map(mapCertificateTypeRow);
};

const countArchivedCertificateTypes = async () => {
  const result = await query(`
    SELECT COUNT(*)::int AS count
    FROM certificate_type
    WHERE COALESCE("isArchived", FALSE) = TRUE
  `);
  return Number(result.rows[0]?.count || 0);
};

const findCertificateTypeById = async (certificateTypeID) => {
  const result = await query(
    `
      SELECT "certificateTypeID", "certTypeName", "isArchived", "formSchema", "fee", "createdAt", "updatedAt"
      FROM certificate_type
      WHERE "certificateTypeID" = $1
      LIMIT 1
    `,
    [certificateTypeID],
  );
  return result.rows[0] ? mapCertificateTypeRow(result.rows[0]) : null;
};

const certificateTypeLabelExists = async (label, excludeId = null) => {
  const params = [label];
  let excludeClause = "";
  if (Number.isInteger(excludeId) && excludeId > 0) {
    excludeClause = `AND "certificateTypeID" <> $2`;
    params.push(excludeId);
  }
  const result = await query(
    `
      SELECT "certificateTypeID"
      FROM certificate_type
      WHERE COALESCE("isArchived", FALSE) = FALSE
        AND LOWER(TRIM(COALESCE("certTypeName", "formSchema"->>'label', ''))) = LOWER(TRIM($1))
        ${excludeClause}
      LIMIT 1
    `,
    params,
  );
  return result.rows.length > 0;
};

const persistCertificateTypeSchema = async (certificateTypeID, formSchema) => {
  const result = await query(
    `
      UPDATE certificate_type
      SET "formSchema" = $1::jsonb,
          "certTypeName" = $2,
          "updatedAt" = NOW()
      WHERE "certificateTypeID" = $3
      RETURNING "certificateTypeID", "certTypeName", "formSchema", "fee", "createdAt", "updatedAt"
    `,
    [JSON.stringify(formSchema), formSchema.label, certificateTypeID],
  );
  return result.rows[0] ? mapCertificateTypeRow(result.rows[0]) : null;
};

app.get("/certificate-types", async (_req, res) => {
  try {
    const items = await listCertificateTypes();
    return res.json({ items, archivedCount: await countArchivedCertificateTypes() });
  } catch (error) {
    console.error("Certificate types fetch error:", error);
    return res.status(500).json({ message: "Unable to load certificate types." });
  }
});

const parseCertificateTypeFee = (rawFee) => {
  if (rawFee === null || rawFee === undefined || String(rawFee).trim() === "") {
    return { fee: null };
  }
  const fee = Number(rawFee);
  if (!Number.isFinite(fee) || fee < 0 || fee > 99999999.99) {
    return { error: "Fee must be a valid amount of 0 or more." };
  }
  return { fee: Math.round(fee * 100) / 100 };
};

app.post("/certificate-types", async (req, res) => {
  try {
    const certTypeName = String(req.body?.certTypeName || req.body?.label || "").trim().replace(/\s+/g, " ");
    if (!certTypeName) {
      return res.status(400).json({ message: "A certificate type name is required." });
    }
    const { fee, error: feeError } = parseCertificateTypeFee(req.body?.fee);
    if (feeError) {
      return res.status(400).json({ message: feeError });
    }
    if (await certificateTypeLabelExists(certTypeName)) {
      return res.status(409).json({ message: "A certificate type with this name already exists." });
    }

    const formSchema = {
      ...normalizeCertificateFormSchema({ label: certTypeName, fields: [] }),
      label: certTypeName,
    };
    const inserted = await query(
      `
        INSERT INTO certificate_type ("certTypeName", "formSchema", "fee")
        VALUES ($1, $2::jsonb, $3)
        RETURNING "certificateTypeID", "certTypeName", "formSchema", "fee", "createdAt", "updatedAt"
      `,
      [certTypeName, JSON.stringify(formSchema), fee],
    );

    return res.status(201).json({
      item: mapCertificateTypeRow(inserted.rows[0]),
      items: await listCertificateTypes(),
    });
  } catch (error) {
    console.error("Certificate type create error:", error);
    return res.status(500).json({ message: "Unable to create certificate type." });
  }
});

app.patch("/certificate-types/:id/name", async (req, res) => {
  try {
    const certificateTypeID = Number(req.params.id);
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) {
      return res.status(400).json({ message: "Invalid certificate type ID." });
    }

    const existing = await findCertificateTypeById(certificateTypeID);
    if (!existing) {
      return res.status(404).json({ message: "Certificate type not found." });
    }

    const label = String(req.body?.label || "").trim().replace(/\s+/g, " ");
    if (!label) {
      return res.status(400).json({ message: "A certificate type name is required." });
    }
    if (await certificateTypeLabelExists(label, certificateTypeID)) {
      return res.status(409).json({ message: "A certificate type with this name already exists." });
    }

    const item = await persistCertificateTypeSchema(certificateTypeID, {
      ...existing.formSchema,
      label,
    });
    return res.json({ item, items: await listCertificateTypes() });
  } catch (error) {
    console.error("Certificate type name update error:", error);
    return res.status(500).json({ message: "Unable to update certificate type name." });
  }
});

app.patch("/certificate-types/:id/fee", async (req, res) => {
  try {
    const certificateTypeID = Number(req.params.id);
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) {
      return res.status(400).json({ message: "Invalid certificate type ID." });
    }

    const { fee, error: feeError } = parseCertificateTypeFee(req.body?.fee);
    if (feeError) {
      return res.status(400).json({ message: feeError });
    }

    const result = await query(
      `
        UPDATE certificate_type
        SET "fee" = $1,
            "updatedAt" = NOW()
        WHERE "certificateTypeID" = $2
        RETURNING "certificateTypeID", "certTypeName", "formSchema", "fee", "createdAt", "updatedAt"
      `,
      [fee, certificateTypeID],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ message: "Certificate type not found." });
    }
    return res.json({ item: mapCertificateTypeRow(result.rows[0]), items: await listCertificateTypes() });
  } catch (error) {
    console.error("Certificate type fee update error:", error);
    return res.status(500).json({ message: "Unable to update certificate type fee." });
  }
});

app.post("/certificate-types/:id/fields", async (req, res) => {
  try {
    const certificateTypeID = Number(req.params.id);
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) {
      return res.status(400).json({ message: "Invalid certificate type ID." });
    }

    const existing = await findCertificateTypeById(certificateTypeID);
    if (!existing) {
      return res.status(404).json({ message: "Certificate type not found." });
    }
    if (!req.body?.field || typeof req.body.field !== "object") {
      return res.status(400).json({ message: "A field definition is required." });
    }

    const existingFields = existing.formSchema.fields;
    const nextField = parseIncomingSchemaField(req.body.field, existingFields.length);
    if (!String(nextField.label || "").trim() || !String(nextField.key || "").trim()) {
      return res.status(400).json({ message: "Field name is required." });
    }
    const duplicateKey = existingFields.some(
      (field) => String(field.key || "").trim().toLowerCase() === String(nextField.key).trim().toLowerCase(),
    );
    if (duplicateKey) {
      return res.status(409).json({ message: "A field with this name already exists." });
    }

    const item = await persistCertificateTypeSchema(certificateTypeID, {
      ...existing.formSchema,
      fields: [...existingFields, nextField],
    });
    return res.status(201).json({ item, items: await listCertificateTypes() });
  } catch (error) {
    console.error("Certificate type field create error:", error);
    return res.status(500).json({ message: "Unable to add field." });
  }
});

app.put("/certificate-types/:id/fields", async (req, res) => {
  try {
    const certificateTypeID = Number(req.params.id);
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) {
      return res.status(400).json({ message: "Invalid certificate type ID." });
    }

    const existing = await findCertificateTypeById(certificateTypeID);
    if (!existing) {
      return res.status(404).json({ message: "Certificate type not found." });
    }
    if (!Array.isArray(req.body?.fields)) {
      return res.status(400).json({ message: "A fields array is required." });
    }

    const nextFields = req.body.fields.map((field, index) => parseIncomingSchemaField(field, index));
    const seenKeys = new Set();
    for (const field of nextFields) {
      const fieldKey = String(field.key || "").trim().toLowerCase();
      if (!fieldKey) {
        return res.status(400).json({ message: "Each field must have a name." });
      }
      if (seenKeys.has(fieldKey)) {
        return res.status(409).json({ message: "Field names must be unique." });
      }
      seenKeys.add(fieldKey);
    }

    const item = await persistCertificateTypeSchema(certificateTypeID, {
      ...existing.formSchema,
      fields: nextFields,
    });
    return res.json({ item, items: await listCertificateTypes() });
  } catch (error) {
    console.error("Certificate type fields update error:", error);
    return res.status(500).json({ message: "Unable to save field changes." });
  }
});

app.get("/certificate-types/archived", async (_req, res) => {
  try {
    const items = await listCertificateTypes({ archived: true });
    return res.json({ items });
  } catch (error) {
    console.error("Archived certificate types fetch error:", error);
    return res.status(500).json({ message: "Unable to load archived certificate types." });
  }
});

app.post("/certificate-types/:id/restore", async (req, res) => {
  try {
    const certificateTypeID = Number(req.params.id);
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) {
      return res.status(400).json({ message: "Invalid certificate type ID." });
    }
    const existing = await findCertificateTypeById(certificateTypeID);
    if (!existing) {
      return res.status(404).json({ message: "Certificate type not found." });
    }
    const certTypeName = String(existing.certTypeName || existing.label || "").trim();
    if (certTypeName && (await certificateTypeLabelExists(certTypeName, certificateTypeID))) {
      return res.status(409).json({ message: "An active certificate type with this name already exists." });
    }
    await query(
      `
        UPDATE certificate_type
        SET "isArchived" = FALSE,
            "updatedAt" = NOW()
        WHERE "certificateTypeID" = $1
      `,
      [certificateTypeID],
    );
    return res.json({ items: await listCertificateTypes({ archived: true }) });
  } catch (error) {
    console.error("Certificate type restore error:", error);
    return res.status(500).json({ message: "Unable to restore certificate type." });
  }
});

app.delete("/certificate-types/:id/permanent", async (req, res) => {
  try {
    const certificateTypeID = Number(req.params.id);
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) {
      return res.status(400).json({ message: "Invalid certificate type ID." });
    }
    const existing = await findCertificateTypeById(certificateTypeID);
    if (!existing) {
      return res.status(404).json({ message: "Certificate type not found." });
    }
    if (!existing.isArchived) {
      return res.status(409).json({ message: "Archive this certificate type before removing it." });
    }
    try {
      await query(`DELETE FROM certificate_type WHERE "certificateTypeID" = $1`, [certificateTypeID]);
    } catch (deleteError) {
      if (deleteError?.code === "23503") {
        return res.status(409).json({ message: "This certificate type is used by existing requests and cannot be removed." });
      }
      throw deleteError;
    }
    return res.json({ items: await listCertificateTypes({ archived: true }) });
  } catch (error) {
    console.error("Certificate type permanent remove error:", error);
    return res.status(500).json({ message: "Unable to remove certificate type." });
  }
});

app.delete("/certificate-types/:id", async (req, res) => {
  try {
    const certificateTypeID = Number(req.params.id);
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) {
      return res.status(400).json({ message: "Invalid certificate type ID." });
    }

    const existing = await findCertificateTypeById(certificateTypeID);
    if (!existing) {
      return res.status(404).json({ message: "Certificate type not found." });
    }

    await query(
      `
        UPDATE certificate_type
        SET "isArchived" = TRUE,
            "updatedAt" = NOW()
        WHERE "certificateTypeID" = $1
      `,
      [certificateTypeID],
    );
    return res.json({ items: await listCertificateTypes(), archivedCount: await countArchivedCertificateTypes() });
  } catch (error) {
    console.error("Certificate type delete error:", error);
    return res.status(500).json({ message: "Unable to delete certificate type." });
  }
});

app.get("/sacrament-form-schemas", async (_req, res) => {
  try {
    const config = await getSacramentFormSchemaConfigFromSacramentsTable();
    return res.json(config);
  } catch (error) {
    console.error("Sacrament form schemas fetch error:", error);
    return res.status(500).json({ message: "Unable to load sacrament form schemas." });
  }
});

app.post("/sacrament-form-schemas", async (req, res) => {
  try {
    const sacramentName = String(req.body?.sacramentName || req.body?.label || "").trim().replace(/\s+/g, " ");
    if (!sacramentName) {
      return res.status(400).json({ message: "A sacrament name is required." });
    }
    const schemaKey = schemaKeyForSacramentName(sacramentName);
    if (!schemaKey || schemaKey === "default") {
      return res.status(400).json({ message: "Provide a valid sacrament name." });
    }

    const duplicateResult = await query(
      `
        SELECT "sacramentID"
        FROM sacraments
        WHERE LOWER(TRIM("sacramentName")) = LOWER(TRIM($1))
        LIMIT 1
      `,
      [sacramentName],
    );
    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({ message: "A sacrament type with this name already exists." });
    }

    const inserted = await query(
      `
        INSERT INTO sacraments ("sacramentName", "formSchema", requirements, "schemaAliases", "isArchived")
        VALUES ($1, '[]'::jsonb, '{"documents":[],"nonDocuments":[]}'::jsonb, $2::jsonb, FALSE)
        RETURNING "sacramentID", "sacramentName"
      `,
      [sacramentName, JSON.stringify([normalizeSchemaName(sacramentName)])],
    );
    const sacramentID = Number(inserted.rows[0]?.sacramentID);
    const templateResult = await query(
      `
        INSERT INTO progress_templates (scope, "sacramentID", "schemaID", "templateName", "isActive")
        VALUES ('sacrament', $1, NULL, $2, TRUE)
        RETURNING "templateID", "templateName", "sacramentID"
      `,
      [sacramentID, sacramentName],
    );
    const config = await getSacramentFormSchemaConfigFromSacramentsTable();
    return res.status(201).json({
      config,
      schemaKey,
      syncedProgressTemplate: {
        templateID: Number(templateResult.rows[0]?.templateID) || null,
        sacramentName,
        sacramentID,
      },
    });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "A sacrament type with this name already exists." });
    }
    console.error("Sacrament type create error:", error);
    return res.status(500).json({ message: "Unable to create sacrament type." });
  }
});

app.post("/sacrament-form-schemas/:schemaKey/fields", async (req, res) => {
  try {
    const row = await findSacramentRowBySchemaKey(req.params?.schemaKey);
    if (!row) {
      return res.status(404).json({ message: "Sacrament type not found." });
    }
    if (row.isArchived) {
      return res.status(400).json({ message: "Restore this sacrament type before editing its fields." });
    }
    if (!req.body?.field || typeof req.body.field !== "object") {
      return res.status(400).json({ message: "A field definition is required." });
    }

    const existingFields = Array.isArray(row.formSchema) ? row.formSchema.map((field, index) => sanitizeSchemaField(field, index)) : [];
    const nextField = parseIncomingSchemaField(req.body.field, existingFields.length);
    if (!String(nextField.label || "").trim() || !String(nextField.key || "").trim()) {
      return res.status(400).json({ message: "Field name is required." });
    }
    const duplicateKey = existingFields.some(
      (field) => String(field.key || "").trim().toLowerCase() === String(nextField.key).trim().toLowerCase(),
    );
    if (duplicateKey) {
      return res.status(409).json({ message: "A field with this name already exists." });
    }

    const nextFields = [...existingFields, nextField];
    await updateSacramentFormSchemaFields(row.sacramentID, nextFields);
    const config = await getSacramentFormSchemaConfigFromSacramentsTable();
    return res.status(201).json({ config, schemaKey: row.schemaKey });
  } catch (error) {
    console.error("Sacrament form schema field create error:", error);
    return res.status(500).json({ message: "Unable to add field." });
  }
});

app.put("/sacrament-form-schemas/:schemaKey/fields", async (req, res) => {
  try {
    const row = await findSacramentRowBySchemaKey(req.params?.schemaKey);
    if (!row) {
      return res.status(404).json({ message: "Sacrament type not found." });
    }
    if (row.isArchived) {
      return res.status(400).json({ message: "Restore this sacrament type before editing its fields." });
    }
    if (!Array.isArray(req.body?.fields)) {
      return res.status(400).json({ message: "A fields array is required." });
    }

    const nextFields = req.body.fields.map((field, index) => parseIncomingSchemaField(field, index));
    const seenKeys = new Set();
    for (const field of nextFields) {
      const fieldKey = String(field.key || "").trim().toLowerCase();
      if (!fieldKey) {
        return res.status(400).json({ message: "Each field must have a name." });
      }
      if (seenKeys.has(fieldKey)) {
        return res.status(409).json({ message: "Field names must be unique." });
      }
      seenKeys.add(fieldKey);
    }

    await updateSacramentFormSchemaFields(row.sacramentID, nextFields);
    const config = await getSacramentFormSchemaConfigFromSacramentsTable();
    return res.json({ config, schemaKey: row.schemaKey });
  } catch (error) {
    console.error("Sacrament form schema fields update error:", error);
    return res.status(500).json({ message: "Unable to save field changes." });
  }
});

const toUniqueRequirementList = (rawList) => {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set();
  return rawList
    .map((item) => String(item || "").trim().replace(/\s+/g, " "))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const parseSacramentFeeInput = (rawValue) => {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") return { value: null };
  const amount = Number(rawValue);
  if (!Number.isFinite(amount) || amount < 0 || amount > 99999999.99) {
    return { error: "Fees must be a number from 0 to 99,999,999.99." };
  }
  return { value: Math.round(amount * 100) / 100 };
};

app.put("/sacrament-form-schemas/:schemaKey/requirements", async (req, res) => {
  try {
    const row = await findSacramentRowBySchemaKey(req.params?.schemaKey);
    if (!row) {
      return res.status(404).json({ message: "Sacrament type not found." });
    }
    if (row.isArchived) {
      return res.status(400).json({ message: "Restore this sacrament type before editing its requirements." });
    }

    const nextRequirements = {
      documents: toUniqueRequirementList(req.body?.documents),
      nonDocuments: toUniqueRequirementList(req.body?.nonDocuments),
    };
    const hasFeeUpdate =
      Object.prototype.hasOwnProperty.call(req.body || {}, "residentFee") ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "nonResidentFee");
    const residentFee = parseSacramentFeeInput(req.body?.residentFee);
    const nonResidentFee = parseSacramentFeeInput(req.body?.nonResidentFee);
    if (hasFeeUpdate && (residentFee.error || nonResidentFee.error)) {
      return res.status(400).json({ message: residentFee.error || nonResidentFee.error });
    }

    const updated = await query(
      `
        UPDATE sacraments
        SET requirements = $2::jsonb,
            "residentFee" = CASE WHEN $3::boolean THEN $4::numeric ELSE "residentFee" END,
            "nonResidentFee" = CASE WHEN $3::boolean THEN $5::numeric ELSE "nonResidentFee" END
        WHERE "sacramentID" = $1
        RETURNING "residentFee"::float8 AS "residentFee", "nonResidentFee"::float8 AS "nonResidentFee"
      `,
      [row.sacramentID, JSON.stringify(nextRequirements), hasFeeUpdate, residentFee.value, nonResidentFee.value],
    );
    const config = await getSacramentFormSchemaConfigFromSacramentsTable();
    return res.json({
      config,
      schemaKey: row.schemaKey,
      sacramentID: row.sacramentID,
      residentFee: updated.rows[0]?.residentFee ?? null,
      nonResidentFee: updated.rows[0]?.nonResidentFee ?? null,
    });
  } catch (error) {
    console.error("Sacrament requirements update error:", error);
    return res.status(500).json({ message: "Unable to save requirements." });
  }
});

app.patch("/sacrament-form-schemas/:schemaKey/name", async (req, res) => {
  try {
    const row = await findSacramentRowBySchemaKey(req.params?.schemaKey);
    if (!row) {
      return res.status(404).json({ message: "Sacrament type not found." });
    }
    if (row.isArchived) {
      return res.status(400).json({ message: "Restore this sacrament type before renaming it." });
    }

    const nextName = String(req.body?.sacramentName || "").trim().replace(/\s+/g, " ");
    if (!nextName) {
      return res.status(400).json({ message: "A sacrament name is required." });
    }

    const duplicateResult = await query(
      `
        SELECT "sacramentID"
        FROM sacraments
        WHERE LOWER("sacramentName") = LOWER($1)
          AND "sacramentID" <> $2
        LIMIT 1
      `,
      [nextName, row.sacramentID],
    );
    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({ message: "A sacrament type with this name already exists." });
    }

    const existingAliases = Array.isArray(row.schemaAliases)
      ? row.schemaAliases.map((item) => normalizeSchemaName(item)).filter(Boolean)
      : [];
    const nextAliases = [...new Set([...existingAliases, normalizeSchemaName(row.sacramentName), normalizeSchemaName(nextName)])];

    await query(
      `
        UPDATE sacraments
        SET "sacramentName" = $1,
            "schemaAliases" = $2::jsonb
        WHERE "sacramentID" = $3
      `,
      [nextName, JSON.stringify(nextAliases), row.sacramentID],
    );

    await query(
      `
        UPDATE progress_templates
        SET "templateName" = REPLACE("templateName", $1, $2),
            "updatedAt" = NOW()
        WHERE "sacramentID" = $3
          AND scope = 'sacrament'
      `,
      [String(row.sacramentName || ""), nextName, row.sacramentID],
    );

    const config = await getSacramentFormSchemaConfigFromSacramentsTable();
    return res.json({ config, schemaKey: schemaKeyForSacramentName(nextName) });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "A sacrament type with this name already exists." });
    }
    console.error("Sacrament form schema name update error:", error);
    return res.status(500).json({ message: "Unable to update sacrament name." });
  }
});

app.post("/sacrament-form-schemas/:schemaKey/archive", async (req, res) => {
  try {
    const result = await moveSacramentSchemaArchiveState(req.params?.schemaKey, true, { sacramentID: req.body?.sacramentID });
    if (result.status !== 200) {
      return res.status(result.status).json({ message: result.message });
    }
    return res.json({ config: result.config, schemaKey: result.schemaKey || toSchemaKeyFromName(req.params?.schemaKey) });
  } catch (error) {
    console.error("Sacrament form schema archive error:", error);
    return res.status(500).json({ message: "Unable to archive sacrament type." });
  }
});

app.post("/sacrament-form-schemas/:schemaKey/restore", async (req, res) => {
  try {
    const result = await moveSacramentSchemaArchiveState(req.params?.schemaKey, false, { sacramentID: req.body?.sacramentID });
    if (result.status !== 200) {
      return res.status(result.status).json({ message: result.message });
    }
    return res.json({ config: result.config, schemaKey: result.schemaKey || toSchemaKeyFromName(req.params?.schemaKey) });
  } catch (error) {
    console.error("Sacrament form schema restore error:", error);
    return res.status(500).json({ message: "Unable to restore sacrament type." });
  }
});

app.delete("/sacrament-form-schemas/:schemaKey", async (req, res) => {
  try {
    const result = await deleteArchivedSacramentSchema(req.params?.schemaKey, {
      sacramentID: req.body?.sacramentID ?? req.query?.sacramentID,
    });
    if (result.status !== 200) {
      return res.status(result.status).json({ message: result.message });
    }
    return res.json({ config: result.config, schemaKey: result.schemaKey || toSchemaKeyFromName(req.params?.schemaKey) });
  } catch (error) {
    console.error("Sacrament form schema delete error:", error);
    return res.status(500).json({ message: "Unable to delete sacrament type." });
  }
});

app.get("/special-sacraments", async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT
          ss."s_sacramentID",
          ss."s_sacramentName",
          ss."maxSlots",
          ss."timeDate",
          ss."currentAppliedCount",
          ss."isUnlimitedSlots",
          ss."priestID",
          ss."durationHours",
          ss."occupiedSlots",
          to_char(ss."deadline", 'YYYY-MM-DD') AS deadline,
          p."fullName" AS "priestName",
          sfs."formSchema"
        FROM special_sacraments ss
        LEFT JOIN priests p ON p."priestID" = ss."priestID"
        LEFT JOIN special_sacraments_form_schemas sfs
          ON LOWER(TRIM(sfs."specialSacramentName")) = LOWER(TRIM(ss."s_sacramentName"))
        ORDER BY ss."s_sacramentName" ASC
      `,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Special sacraments fetch error:", error);
    return res.status(500).json({ message: "Unable to load special sacraments." });
  }
});

const addHoursHHMM = (value, hours = 1) => {
  const minutes = toMinutes(value);
  const duration = Number(hours);
  if (minutes === null || !Number.isInteger(duration) || duration <= 0) return null;
  const next = minutes + duration * 60;
  const nextHours = Math.floor(next / 60) % 24;
  const mins = next % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const addOneHourHHMM = (value) => addHoursHHMM(value, 1);

const mapSpecialProgramEntry = (calendarRow, sacramentRow = {}) => {
  const sSacramentID = Number(sacramentRow.s_sacramentID || calendarRow?.sSacramentID || calendarRow?.s_sacramentID) || null;
  const fromTimeDate = parseTimestampPartsInManila(sacramentRow.timeDate);
  const eventDate = String(calendarRow?.eventDate || fromTimeDate.eventDate || "").trim() || null;
  const startTime = normalizeTimeToHHMM(calendarRow?.startTime) || fromTimeDate.startTime || null;
  const occupiedSlots = normalizeOccupiedSlots(
    sacramentRow.occupiedSlots || calendarRow?.occupiedSlots,
    startTime,
    calendarRow?.endTime,
  );
  const durationHours = occupiedSlots.length || normalizeSpecialProgramDurationHours(sacramentRow.durationHours);
  const endTime =
    occupiedSlots[occupiedSlots.length - 1]?.endTime ||
    normalizeTimeToHHMM(calendarRow?.endTime) ||
    addHoursHHMM(startTime, durationHours);
  const priestID = Number.isInteger(Number(sacramentRow.priestID ?? calendarRow?.priestID)) && Number(sacramentRow.priestID ?? calendarRow?.priestID) > 0
    ? Number(sacramentRow.priestID ?? calendarRow?.priestID)
    : null;
  return {
    ...calendarRow,
    title: sacramentRow.s_sacramentName || calendarRow?.title || null,
    eventDate,
    startTime: occupiedSlots[0]?.startTime || startTime,
    endTime,
    occupiedSlots,
    location: null,
    notes: null,
    sSacramentID,
    s_sacramentID: sSacramentID,
    s_sacramentName: sacramentRow.s_sacramentName || calendarRow?.title || null,
    maxSlots: sacramentRow.maxSlots ?? null,
    currentAppliedCount: Number(sacramentRow.currentAppliedCount) || 0,
    isUnlimitedSlots: Boolean(sacramentRow.isUnlimitedSlots),
    durationHours,
    priestID,
    deadline: normalizeSubmissionDeadline(sacramentRow.deadline || calendarRow?.deadline),
    formSchema: sacramentRow.formSchema || sacramentRow.form_schema || null,
  };
};

const normalizeSubmissionDeadline = (value) => {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

const loadResolvedCalendarEntry = async (entryID, dbClient = null) => {
  const normalizedID = Number(entryID);
  if (!Number.isInteger(normalizedID) || normalizedID <= 0) return null;
  const runQuery = (text, values) => (dbClient ? dbClient.query(text, values) : query(text, values));
  const result = await runQuery(
    `
      SELECT
        "calendarID" AS id,
        title,
        "scheduleType" AS "scheduleType",
        "eventDate"::text AS "eventDate",
        "startTime" AS "startTime",
        "endTime" AS "endTime",
        occupied_slots AS "occupiedSlots",
        location,
        notes,
        "s_sacramentID" AS "sSacramentID",
        "s_sacramentID",
        "priestID",
        "adminID",
        "createdAt",
        "updatedAt"
      FROM calendar_entries_resolved
      WHERE "calendarID" = $1
      LIMIT 1
    `,
    [normalizedID],
  );
  return result.rows[0] || null;
};

const DEFAULT_PARISH_ADMIN_ID = 1;

const toPositiveAdminID = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const resolveAppointmentAdminID = async (appointment, req) => {
  const direct = toPositiveAdminID(appointment?.adminID);
  if (direct) return direct;
  const fromRequest = toPositiveAdminID(req?.body?.adminID) || toPositiveAdminID(req?.query?.adminID);
  if (fromRequest) return fromRequest;
  const priestID = toPositiveAdminID(appointment?.priestID);
  if (priestID) {
    const priestResult = await query(`SELECT "adminID" FROM priests WHERE "priestID" = $1 LIMIT 1`, [priestID]);
    const fromPriest = toPositiveAdminID(priestResult.rows[0]?.adminID);
    if (fromPriest) return fromPriest;
  }
  return DEFAULT_PARISH_ADMIN_ID;
};

const assertPriestAvailableForAdmin = async (priestID, rawAdminID) => {
  const adminID = toPositiveAdminID(rawAdminID) || DEFAULT_PARISH_ADMIN_ID;
  const priestResult = await query(
    `
      SELECT "priestID"
      FROM priests
      WHERE "priestID" = $1
        AND "adminID" = $2
        AND COALESCE("isActive", TRUE) = TRUE
      LIMIT 1
    `,
    [priestID, adminID],
  );
  return priestResult.rows.length > 0;
};

const assertPriestHasOpenScheduleSlot = async ({
  adminID,
  priestID,
  eventDate,
  startTime,
  endTime,
  excludeCalendarEntryID = null,
  allowLockedDate = false,
  slotKind = "appointment",
  durationHours = 1,
  occupiedSlots = [],
}) => {
  const normalizedOccupiedSlots = normalizeOccupiedSlots(occupiedSlots, startTime, endTime);
  const slotCheck =
    slotKind === "special_program"
      ? assertSpecialProgramTimeSlotAllowed(startTime, endTime, durationHours, normalizedOccupiedSlots)
      : assertScheduleTimeSlotAllowed(startTime, endTime);
  if (!slotCheck.ok) {
    const error = new Error(slotCheck.message);
    error.status = 400;
    throw error;
  }
  const closureMessage = await findParishClosureConflict({ adminID, dateKey: eventDate, startTime, endTime });
  if (closureMessage) {
    const error = new Error(closureMessage);
    error.status = 400;
    throw error;
  }
  if (!allowLockedDate) {
    const advanceDays =
      slotKind === "special_program" ? 0 : await resolveScheduleMinAdvanceDays(adminID);
    const dateCheck = assertProgressScheduleDateAllowed(eventDate, advanceDays);
    if (!dateCheck.ok) {
      const error = new Error(dateCheck.message);
      error.status = 400;
      throw error;
    }
  }

  const proposedSlots =
    slotKind === "special_program"
      ? slotCheck.occupiedSlots || normalizedOccupiedSlots
      : [{ startTime: normalizeTimeToHHMM(startTime), endTime: normalizeTimeToHHMM(endTime) }];
  const excludeID = Number(excludeCalendarEntryID);
  const overlapResult = await query(
    `
      SELECT ce."calendarID", ce.title, ce."startTime", ce."endTime", ce.occupied_slots
      FROM calendar_entries_resolved ce
      WHERE ce."adminID" = $1
        AND ce."priestID" = $2
        AND ce."eventDate" = $3::date
        AND ${calendarEntryHasActivePriestSql()}
        AND ($4::INT IS NULL OR "calendarID" <> $4)
      ORDER BY "calendarID" ASC
    `,
    [adminID, priestID, eventDate, Number.isInteger(excludeID) && excludeID > 0 ? excludeID : null],
  );
  const conflict = findProposedSlotsConflict(proposedSlots, overlapResult.rows);
  if (conflict.conflict) {
    const error = new Error("This priest already has another appointment or schedule at that time.");
    error.status = 409;
    throw error;
  }
};

const resolveSpecialProgramSchedule = (reqBody) => {
  const eventDate = String(reqBody?.eventDate || "").trim();
  const occupiedSlots = normalizeOccupiedSlots(reqBody?.occupiedSlots, reqBody?.startTime, reqBody?.endTime);
  const slotCheck = assertSpecialProgramOccupiedSlotsAllowed(occupiedSlots);
  return {
    eventDate,
    startTime: slotCheck.startTime || "",
    endTime: slotCheck.endTime || "",
    durationHours: slotCheck.durationHours || occupiedSlots.length,
    occupiedSlots,
    slotCheck,
  };
};

app.post("/special-sacraments", async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const title = String(req.body?.calendarTitle || req.body?.s_sacramentName || req.body?.title || "").trim();
    const { eventDate, startTime, endTime, durationHours, occupiedSlots, slotCheck } = resolveSpecialProgramSchedule(req.body);
    const notes = req.body?.notes === null || req.body?.notes === undefined ? null : String(req.body.notes).trim() || null;
    const location = req.body?.location === null || req.body?.location === undefined ? null : String(req.body.location).trim() || null;
    const adminID = Number(req.body?.adminID);
    const priestIDRaw = Number(req.body?.priestID);
    const priestID = Number.isInteger(priestIDRaw) && priestIDRaw > 0 ? priestIDRaw : null;
    const isUnlimitedSlots = req.body?.isUnlimitedSlots === true || String(req.body?.slotLimitType || "").trim().toLowerCase() === "unlimited";
    const maxSlotsRaw = Number(req.body?.maxSlots);
    const maxSlots = isUnlimitedSlots ? null : Number.isInteger(maxSlotsRaw) && maxSlotsRaw > 0 ? maxSlotsRaw : null;

    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }
    if (!title) {
      return res.status(400).json({ message: "Special program name is required." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return res.status(400).json({ message: "Choose a date for when this special program will be held." });
    }
    if (!slotCheck.ok) {
      return res.status(400).json({ message: slotCheck.message });
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ message: "Choose at least one available 1-hour time slot for this special program." });
    }
    if (!isUnlimitedSlots && !maxSlots) {
      return res.status(400).json({ message: "Maximum slots must be a positive whole number." });
    }
    if (!Number.isInteger(priestID)) {
      return res.status(400).json({ message: "Please select a priest for this special program." });
    }
    const deadline = normalizeSubmissionDeadline(req.body?.deadline);
    if (!deadline) {
      return res.status(400).json({ message: "Deadline for submission is required." });
    }
    if (!(await assertPriestAvailableForAdmin(priestID, adminID))) {
      return res.status(400).json({ message: "Selected priest is not available for this parish." });
    }
    await assertPriestHasOpenScheduleSlot({
      adminID,
      priestID,
      eventDate,
      startTime,
      endTime,
      slotKind: "special_program",
      durationHours,
      occupiedSlots,
    });

    const formSchema = await getSpecialSacramentSchemaByName(title);
    const timeDate = `${eventDate}T${startTime}:00`;

    await dbClient.query("BEGIN");
    const sacramentResult = await dbClient.query(
      `
        INSERT INTO special_sacraments (
          "s_sacramentName",
          "maxSlots",
          "timeDate",
          "currentAppliedCount",
          "isUnlimitedSlots",
          "priestID",
          "durationHours",
          "occupiedSlots",
          "deadline"
        )
        VALUES ($1, $2, $3::timestamp, 0, $4, $5, $6, $7::jsonb, $8::date)
        RETURNING
          "s_sacramentID",
          "s_sacramentName",
          "maxSlots",
          "timeDate",
          "currentAppliedCount",
          "isUnlimitedSlots",
          "priestID",
          "durationHours",
          "occupiedSlots",
          to_char("deadline", 'YYYY-MM-DD') AS deadline
      `,
      [title, maxSlots, timeDate, isUnlimitedSlots, priestID, durationHours, JSON.stringify(occupiedSlots), deadline],
    );
    const sacramentRow = { ...sacramentResult.rows[0], formSchema };
    const calendarResult = await dbClient.query(
      `
        INSERT INTO calendar_entries (
          title,
          "scheduleType",
          "eventDate",
          "startTime",
          "endTime",
          location,
          notes,
          "s_sacramentID",
          "priestID",
          "adminID"
        )
        VALUES (NULL, 'parish_event', NULL, NULL, NULL, NULL, NULL, $1, NULL, $2)
        RETURNING "calendarID" AS id
      `,
      [sacramentRow.s_sacramentID, adminID],
    );
    const resolvedCalendarRow = await loadResolvedCalendarEntry(calendarResult.rows[0]?.id, dbClient);
    const existingSchema = await findSpecialSacramentSchemaByName(title, dbClient);
    if (!existingSchema) {
      await upsertSpecialSacramentSchemaTemplate(
        {
          specialSacramentName: title,
          displayLabel: title,
          formSchema: EMPTY_SPECIAL_SACRAMENT_FORM_SCHEMA,
        },
        dbClient,
      );
    }
    await dbClient.query("COMMIT");

    const createdEntry = mapSpecialProgramEntry(resolvedCalendarRow, sacramentRow);
    await notifyPriestScheduleAssignment({
      adminID,
      priestID,
      calendarEntry: createdEntry,
      action: "assigned",
    });
    return res.status(201).json(createdEntry);
  } catch (error) {
    try {
      await dbClient.query("ROLLBACK");
    } catch {
      // The transaction may already be closed.
    }
    console.error("Special sacrament program create error:", error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Unable to save calendar entry." });
  } finally {
    dbClient.release();
  }
});

app.get("/special-sacrament-form-schemas", async (_req, res) => {
  try {
    const schemas = await listStoredSpecialSacramentSchemaTemplates();
    return res.json(schemas);
  } catch (error) {
    console.error("Special sacrament form schemas fetch error:", error);
    return res.status(500).json({ message: "Unable to load special sacrament schemas." });
  }
});

app.post("/special-sacrament-form-schemas", async (req, res) => {
  try {
    const requestedName = String(req.body?.specialSacramentName || req.body?.displayLabel || "").trim();
    if (!requestedName) {
      return res.status(400).json({ message: "Special sacrament name is required." });
    }
    const existing = await findSpecialSacramentSchemaByName(requestedName);
    if (existing) {
      return res.status(409).json({ message: "A special sacrament schema with this name already exists." });
    }
    const created = await upsertSpecialSacramentSchemaTemplate({
      specialSacramentName: requestedName,
      displayLabel: requestedName,
      formSchema: EMPTY_SPECIAL_SACRAMENT_FORM_SCHEMA,
    });
    const stored = await findSpecialSacramentSchemaByName(created.specialSacramentName);
    return res.status(201).json({
      specialSacrament: stored ? mapSpecialSacramentSchemaTemplate(stored) : created,
    });
  } catch (error) {
    console.error("Special sacrament schema create error:", error);
    return res.status(500).json({ message: "Unable to create special sacrament schema." });
  }
});

app.get("/special-sacrament-form-schemas/:specialSacramentName", async (req, res) => {
  try {
    const requestedName = String(req.params?.specialSacramentName || "").trim();
    if (!requestedName) {
      return res.status(400).json({ message: "Special sacrament name is required." });
    }
    const stored = await findSpecialSacramentSchemaByName(requestedName);
    if (!stored) {
      return res.status(404).json({ message: "Special sacrament schema not found." });
    }
    return res.json(mapSpecialSacramentSchemaTemplate(stored));
  } catch (error) {
    console.error("Special sacrament form schema fetch error:", error);
    return res.status(500).json({ message: "Unable to load special sacrament schema." });
  }
});

app.delete("/special-sacrament-form-schemas/:specialSacramentName", async (req, res) => {
  try {
    const requestedName = String(req.params?.specialSacramentName || "").trim();
    const normalizedName = normalizeSpecialSacramentName(requestedName);
    if (!requestedName) {
      return res.status(400).json({ message: "Special sacrament name is required." });
    }
    const protectedDefaultName = normalizeSpecialSacramentName(DEFAULT_SPECIAL_SACRAMENT_NAME);
    if (normalizedName.toLowerCase() === protectedDefaultName.toLowerCase()) {
      return res.status(400).json({ message: "The default special sacrament schema cannot be removed." });
    }
    const deletedResult = await query(
      `
        DELETE FROM special_sacraments_form_schemas
        WHERE LOWER(TRIM("specialSacramentName")) = LOWER(TRIM($1))
        RETURNING "schemaID"
      `,
      [requestedName],
    );
    if (deletedResult.rows.length === 0) {
      return res.status(404).json({ message: "Special sacrament schema not found." });
    }
    return res.json({ message: "Special sacrament schema removed." });
  } catch (error) {
    if (String(error?.code || "") === "23503") {
      return res.status(409).json({ message: "This special sacrament type is used by a progress template and cannot be removed." });
    }
    console.error("Special sacrament schema delete error:", error);
    return res.status(500).json({ message: "Unable to remove special sacrament schema." });
  }
});

app.get("/special-sacrament-form-schema-default", async (_req, res) => {
  try {
    const stored = await getStoredDefaultSpecialSacramentSchema();
    if (stored) return res.json(stored);
    return res.json({
      specialSacramentName: DEFAULT_SPECIAL_SACRAMENT_NAME,
      displayLabel: DEFAULT_SPECIAL_SACRAMENT_NAME,
      formSchema: normalizeSpecialSacramentFormSchema(DEFAULT_SPECIAL_SACRAMENT_FORM_SCHEMA),
    });
  } catch (error) {
    console.error("Default special sacrament form schema fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch default special sacrament form schema." });
  }
});

app.put("/special-sacrament-form-schema-default", async (req, res) => {
  try {
    const rawFormSchema =
      req.body && typeof req.body === "object" && Object.prototype.hasOwnProperty.call(req.body, "formSchema")
        ? req.body.formSchema
        : req.body;
    const saved = await upsertDefaultSpecialSacramentSchema({
      specialSacramentName: req.body?.specialSacramentName || DEFAULT_SPECIAL_SACRAMENT_NAME,
      displayLabel: req.body?.displayLabel,
      formSchema: rawFormSchema,
    });
    return res.json(saved);
  } catch (error) {
    console.error("Default special sacrament form schema update error:", error);
    return res.status(500).json({ message: "Unable to save default special sacrament form schema." });
  }
});

app.put("/special-sacraments/:id/form-schema", async (req, res) => {
  try {
    const schemaID = Number(req.params.id);
    if (!Number.isInteger(schemaID) || schemaID <= 0) {
      return res.status(400).json({ message: "Invalid special sacrament schema id." });
    }
    const requestedName = String(req.body?.specialSacramentName || req.body?.displayLabel || "").trim();
    const rawFormSchema =
      req.body && typeof req.body === "object" && Object.prototype.hasOwnProperty.call(req.body, "formSchema")
        ? req.body.formSchema
        : req.body;
    const normalizedFormSchema = normalizeSpecialSacramentFormSchema(rawFormSchema);
    const existingResult = await query(
      `
        SELECT "specialSacramentName", "formSchema"
        FROM special_sacraments_form_schemas
        WHERE "schemaID" = $1
        LIMIT 1
      `,
      [schemaID],
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: "Special sacrament schema not found." });
    }
    const existingSchema = existingResult.rows[0];
    const sacramentName = String(requestedName || existingSchema.specialSacramentName || "").trim();
    const renamedFieldKeys = collectRenamedSpecialSacramentFieldKeys(
      normalizeSpecialSacramentFormSchema(existingSchema.formSchema).fields,
      normalizedFormSchema.fields,
    );
    const updated = await query(
      `
        UPDATE special_sacraments_form_schemas
        SET "formSchema" = $2::jsonb,
            "specialSacramentName" = COALESCE(NULLIF($3, ''), "specialSacramentName"),
            "updatedAt" = NOW()
        WHERE "schemaID" = $1
        RETURNING "schemaID", "specialSacramentName", "formSchema"
      `,
      [schemaID, JSON.stringify(normalizedFormSchema), requestedName],
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ message: "Special sacrament schema not found." });
    }
    await rewriteSpecialSacramentCredentialKeys(
      String(updated.rows[0]?.specialSacramentName || sacramentName).trim(),
      renamedFieldKeys,
    );
    return res.json(mapSpecialSacramentSchemaTemplate(updated.rows[0]));
  } catch (error) {
    console.error("Special sacrament form schema update error:", error);
    return res.status(500).json({ message: "Unable to save special sacrament form schema." });
  }
});

app.patch("/special-sacraments/:id/name", async (req, res) => {
  try {
    const schemaID = Number(req.params.id);
    if (!Number.isInteger(schemaID) || schemaID <= 0) {
      return res.status(400).json({ message: "Invalid special sacrament schema id." });
    }
    const requestedName = String(req.body?.specialSacramentName || req.body?.displayLabel || "").trim();
    if (!requestedName) {
      return res.status(400).json({ message: "Special sacrament name is required." });
    }
    const existing = await findSpecialSacramentSchemaByName(requestedName);
    if (existing && Number(existing.schemaID) !== schemaID) {
      return res.status(409).json({ message: "A special sacrament schema with this name already exists." });
    }
    const updated = await query(
      `
        UPDATE special_sacraments_form_schemas
        SET "specialSacramentName" = $2,
            "updatedAt" = NOW()
        WHERE "schemaID" = $1
        RETURNING "schemaID", "specialSacramentName", "formSchema"
      `,
      [schemaID, requestedName],
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ message: "Special sacrament schema not found." });
    }
    return res.json(mapSpecialSacramentSchemaTemplate(updated.rows[0]));
  } catch (error) {
    console.error("Special sacrament schema name update error:", error);
    return res.status(500).json({ message: "Unable to save special sacrament name." });
  }
});

app.patch("/special-sacraments/:id", async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const sSacramentID = Number(req.params.id);
    const title = String(req.body?.calendarTitle || req.body?.s_sacramentName || req.body?.title || "").trim();
    const { eventDate, startTime, endTime, durationHours, occupiedSlots, slotCheck } = resolveSpecialProgramSchedule(req.body);
    const notes = req.body?.notes === null || req.body?.notes === undefined ? null : String(req.body.notes).trim() || null;
    const location = req.body?.location === null || req.body?.location === undefined ? null : String(req.body.location).trim() || null;
    const adminID = Number(req.body?.adminID);
    const calendarEntryId = Number(req.body?.calendarEntryId);
    const priestIDRaw = Number(req.body?.priestID);
    const priestID = Number.isInteger(priestIDRaw) && priestIDRaw > 0 ? priestIDRaw : null;
    const isUnlimitedSlots = req.body?.isUnlimitedSlots === true || String(req.body?.slotLimitType || "").trim().toLowerCase() === "unlimited";
    const maxSlotsRaw = Number(req.body?.maxSlots);
    const maxSlots = isUnlimitedSlots ? null : Number.isInteger(maxSlotsRaw) && maxSlotsRaw > 0 ? maxSlotsRaw : null;

    if (!Number.isInteger(sSacramentID) || sSacramentID <= 0) {
      return res.status(400).json({ message: "Invalid special sacrament id." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }
    if (!title) {
      return res.status(400).json({ message: "Special program name is required." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return res.status(400).json({ message: "Choose a date for when this special program will be held." });
    }
    if (!slotCheck.ok) {
      return res.status(400).json({ message: slotCheck.message });
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ message: "Choose at least one available 1-hour time slot for this special program." });
    }
    if (!isUnlimitedSlots && !maxSlots) {
      return res.status(400).json({ message: "Maximum slots must be a positive whole number." });
    }
    if (!Number.isInteger(priestID)) {
      return res.status(400).json({ message: "Please select a priest for this special program." });
    }
    const deadline = normalizeSubmissionDeadline(req.body?.deadline);
    if (!deadline) {
      return res.status(400).json({ message: "Deadline for submission is required." });
    }
    if (!(await assertPriestAvailableForAdmin(priestID, adminID))) {
      return res.status(400).json({ message: "Selected priest is not available for this parish." });
    }

    const existingCalendarResult = await query(
      `
        SELECT
          ce."calendarID" AS id,
          COALESCE(to_char(ss."timeDate", 'YYYY-MM-DD'), ce."eventDate"::text) AS "eventDate"
        FROM calendar_entries ce
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = ce."s_sacramentID"
        WHERE ce."adminID" = $1
          AND (
            ($2::INT IS NOT NULL AND ce."calendarID" = $2)
            OR ce."s_sacramentID" = $3
          )
        ORDER BY CASE WHEN $2::INT IS NOT NULL AND "calendarID" = $2 THEN 0 ELSE 1 END, "calendarID" ASC
        LIMIT 1
      `,
      [adminID, Number.isInteger(calendarEntryId) && calendarEntryId > 0 ? calendarEntryId : null, sSacramentID],
    );
    const existingCalendarID = Number(existingCalendarResult.rows[0]?.id) || null;
    const existingEventDate = String(existingCalendarResult.rows[0]?.eventDate || "").slice(0, 10);
    await assertPriestHasOpenScheduleSlot({
      adminID,
      priestID,
      eventDate,
      startTime,
      endTime,
      excludeCalendarEntryID: existingCalendarID,
      allowLockedDate: Boolean(existingEventDate && existingEventDate === eventDate),
      slotKind: "special_program",
      durationHours,
      occupiedSlots,
    });

    const formSchema = await getSpecialSacramentSchemaByName(title);
    const timeDate = `${eventDate}T${startTime}:00`;

    await dbClient.query("BEGIN");
    const sacramentResult = await dbClient.query(
      `
        UPDATE special_sacraments
        SET "s_sacramentName" = $2,
            "maxSlots" = $3,
            "timeDate" = $4::timestamp,
            "isUnlimitedSlots" = $5,
            "priestID" = $6,
            "durationHours" = $7,
            "occupiedSlots" = $8::jsonb,
            "deadline" = $9::date
        WHERE "s_sacramentID" = $1
        RETURNING
          "s_sacramentID",
          "s_sacramentName",
          "maxSlots",
          "timeDate",
          "currentAppliedCount",
          "isUnlimitedSlots",
          "priestID",
          "durationHours",
          "occupiedSlots",
          to_char("deadline", 'YYYY-MM-DD') AS deadline
      `,
      [sSacramentID, title, maxSlots, timeDate, isUnlimitedSlots, priestID, durationHours, JSON.stringify(occupiedSlots), deadline],
    );
    if (sacramentResult.rows.length === 0) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ message: "Special sacrament program not found." });
    }

    let calendarResult;
    if (Number.isInteger(calendarEntryId) && calendarEntryId > 0) {
      calendarResult = await dbClient.query(
        `
          UPDATE calendar_entries
          SET title = NULL,
              "scheduleType" = 'parish_event',
              "eventDate" = NULL,
              "startTime" = NULL,
              "endTime" = NULL,
              location = NULL,
              notes = NULL,
              "s_sacramentID" = $1,
              "priestID" = NULL,
              "updatedAt" = NOW()
          WHERE "calendarID" = $2
            AND "adminID" = $3
            AND COALESCE("appointmentID", 0) = 0
          RETURNING "calendarID" AS id
        `,
        [sSacramentID, calendarEntryId, adminID],
      );
    } else {
      calendarResult = await dbClient.query(
        `
          UPDATE calendar_entries
          SET title = NULL,
              "scheduleType" = 'parish_event',
              "eventDate" = NULL,
              "startTime" = NULL,
              "endTime" = NULL,
              location = NULL,
              notes = NULL,
              "priestID" = NULL,
              "updatedAt" = NOW()
          WHERE "s_sacramentID" = $1
            AND "adminID" = $2
            AND COALESCE("appointmentID", 0) = 0
          RETURNING "calendarID" AS id
        `,
        [sSacramentID, adminID],
      );
    }

    if (calendarResult.rows.length === 0) {
      calendarResult = await dbClient.query(
        `
          INSERT INTO calendar_entries (
            title,
            "scheduleType",
            "eventDate",
            "startTime",
            "endTime",
            location,
            notes,
            "s_sacramentID",
            "priestID",
            "adminID"
          )
          VALUES (NULL, 'parish_event', NULL, NULL, NULL, NULL, NULL, $1, NULL, $2)
          RETURNING "calendarID" AS id
        `,
        [sSacramentID, adminID],
      );
    }
    const resolvedCalendarRow = await loadResolvedCalendarEntry(calendarResult.rows[0]?.id, dbClient);
    await dbClient.query("COMMIT");

    const updatedEntry = mapSpecialProgramEntry(resolvedCalendarRow, { ...sacramentResult.rows[0], formSchema });
    await cascadeSpecialProgramScheduleToAppointments(sSacramentID, {
      scheduledEventDateTime: toManilaScheduledEventDateTime(eventDate, startTime),
      eventDate,
      startTime,
      priestID,
    });
    await notifyPriestScheduleAssignment({
      adminID,
      priestID,
      calendarEntry: updatedEntry,
      action: "updated",
    });
    return res.json(updatedEntry);
  } catch (error) {
    try {
      await dbClient.query("ROLLBACK");
    } catch {
      // The transaction may already be closed.
    }
    console.error("Special sacrament program update error:", error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Unable to save calendar entry." });
  } finally {
    dbClient.release();
  }
});

app.get("/history/admin", async (req, res) => {
  try {
    await promoteDueAppointmentsToHistory();
    const adminID = Number(req.query?.adminID);
    const page = Math.max(1, Number(req.query?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize) || 10));
    const sort = String(req.query?.sort || "date_desc").trim().toLowerCase();
    const statusFilter = String(req.query?.status || "all").trim().toLowerCase();
    const requestTypeFilter = String(req.query?.requestType || "all").trim().toLowerCase();
    const typeFilter = String(req.query?.type || "all").trim().toLowerCase();
    const searchInput = String(req.query?.search || "").trim().toLowerCase();

    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const appointmentsResult = await query(
      `
        SELECT
          a."appointmentID" AS "referenceId",
          a."s_sacramentID",
          a."requesterFullName" AS "requesterName",
          COALESCE(ss."s_sacramentName", s."sacramentName", 'Appointment') AS "sacramentName",
          a.status::text AS status,
          a."createdAt" AS "startAt",
          COALESCE(a."finishedAt", a."createdAt") AS "endAt",
          a."createdAt",
          COALESCE(a."finishedAt", a."createdAt") AS "resolvedAt",
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Program' ELSE 'Appointment' END AS "typeLabel",
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'special_program' ELSE 'appointment' END AS "requestTypeKey",
          (
            a.status = 'CANCELLED'
            AND (
              EXISTS (SELECT 1 FROM progress_tracker pt WHERE pt."appointmentID" = a."appointmentID")
              OR EXISTS (
                SELECT 1
                FROM appointment_change_requests acr
                WHERE acr."appointmentID" = a."appointmentID"
                  AND acr."requestType" = 'cancel'
                  AND acr.status = 'approved'
              )
            )
          ) AS "isCancelledAppointment"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        WHERE a."isArchived" = FALSE
          AND a.status IN ('CONFIRMED', 'CANCELLED')
          AND (a."finishedAt" IS NOT NULL OR a.status = 'CANCELLED')
      `,
    );

    const certificateResult = await query(
      `
        SELECT
          cr."certID" AS "referenceId",
          COALESCE(
            ${sqlPersonFullName("u")},
            cr.credentials->>'fullName',
            cr.credentials->>'groomFullName',
            cr.credentials->>'brideFullName',
            cr.credentials->>'childFullName',
            'Unknown requester'
          ) AS "requesterName",
          COALESCE(
            NULLIF(BTRIM(ct."certTypeName"), ''),
            NULLIF(BTRIM(ct."formSchema"->>'label'), ''),
            'Certificate Request'
          ) AS "sacramentName",
          cr.status::text AS status,
          cr."createdAt" AS "startAt",
          COALESCE(cr."claimedAt", cr."updatedAt", cr."createdAt") AS "endAt",
          cr."createdAt" AS "createdAt",
          COALESCE(cr."claimedAt", cr."updatedAt", cr."createdAt") AS "resolvedAt",
          'Certificate Request'::text AS "typeLabel",
          'certificate'::text AS "requestTypeKey"
        FROM cert_request cr
        LEFT JOIN users u ON u."userID" = cr."userID"
        LEFT JOIN certificate_type ct ON ct."certificateTypeID" = cr."certificateTypeID"
        WHERE cr.status IN ('Completed', 'Cancelled')
      `,
    );

    const mergedRows = [...appointmentsResult.rows, ...certificateResult.rows].map((row, index) => {
      const normalizedStatus = String(row.status || "").trim().toLowerCase();
      const status = normalizedStatus === "cancelled" || normalizedStatus === "canceled" ? "cancelled" : "completed";
      const startAt = row.startAt || row.createdAt || null;
      const endAt = row.endAt || row.resolvedAt || startAt || null;
      let durationSeconds = null;
      const startMs = new Date(startAt || "").getTime();
      const endMs = new Date(endAt || "").getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
        durationSeconds = Math.floor((endMs - startMs) / 1000);
      }
      return {
        id: `${row.requestTypeKey}-${row.referenceId}-${index}`,
        referenceId: Number(row.referenceId),
        sSacramentID: row.s_sacramentID === null || row.s_sacramentID === undefined ? null : Number(row.s_sacramentID),
        requesterName: String(row.requesterName || "").trim() || "Unknown requester",
        sacramentName:
          row.requestTypeKey === "certificate"
            ? formatCertificateTypeLabel(row.sacramentName)
            : String(row.sacramentName || "").trim() || "Unknown service",
        typeLabel: row.requestTypeKey === "certificate" ? "Certificate Request" : row.typeLabel,
        requestTypeKey: row.requestTypeKey,
        status,
        isCancelledAppointment: Boolean(row.isCancelledAppointment),
        startAt,
        endAt,
        durationSeconds,
        createdAt: row.createdAt || startAt,
        resolvedAt: row.resolvedAt || endAt,
      };
    });

    const historyRows = [];
    const specialProgramGroups = new Map();
    for (const row of mergedRows) {
      const programID = Number(row.sSacramentID);
      if (row.requestTypeKey !== "special_program" || !Number.isInteger(programID) || programID <= 0) {
        historyRows.push(row);
        continue;
      }
      const existing = specialProgramGroups.get(programID);
      if (!existing) {
        const groupedRow = {
          ...row,
          id: `special_program-${programID}`,
          requesterNames: [row.requesterName],
        };
        specialProgramGroups.set(programID, groupedRow);
        historyRows.push(groupedRow);
        continue;
      }
      if (!existing.requesterNames.includes(row.requesterName)) {
        existing.requesterNames.push(row.requesterName);
      }
      const existingStart = new Date(existing.startAt || "").getTime();
      const nextStart = new Date(row.startAt || "").getTime();
      if (!Number.isNaN(nextStart) && (Number.isNaN(existingStart) || nextStart < existingStart)) {
        existing.startAt = row.startAt;
        existing.createdAt = row.createdAt || row.startAt;
      }
      const existingEnd = new Date(existing.endAt || "").getTime();
      const nextEnd = new Date(row.endAt || "").getTime();
      if (!Number.isNaN(nextEnd) && (Number.isNaN(existingEnd) || nextEnd > existingEnd)) {
        existing.endAt = row.endAt;
        existing.resolvedAt = row.resolvedAt || row.endAt;
      }
      if (row.status !== "cancelled") existing.status = "completed";
    }
    for (const groupedRow of specialProgramGroups.values()) {
      groupedRow.requesterName = groupedRow.requesterNames.filter(Boolean).join(", ");
    }

    const typeFilteredRows = historyRows.filter((row) => {
      const matchesRequestType =
        requestTypeFilter === "all" ||
        String(row.requestTypeKey || "").trim().toLowerCase() === requestTypeFilter;
      const matchesSpecificType =
        typeFilter === "all" || String(row.sacramentName || "").trim().toLowerCase() === typeFilter;
      return matchesRequestType && matchesSpecificType;
    });

    const searchedRows = searchInput
      ? typeFilteredRows.filter((row) => {
          const searchableText = [
            row.requesterName,
            row.sacramentName,
            row.typeLabel,
            row.status,
            String(row.referenceId || ""),
          ]
            .join(" ")
            .toLowerCase();
          return searchableText.includes(searchInput);
        })
      : typeFilteredRows;

    const summary = searchedRows.reduce(
      (accumulator, row) => {
        accumulator.total += 1;
        if (row.status === "cancelled") {
          accumulator.cancelled += 1;
        } else {
          accumulator.completed += 1;
        }
        return accumulator;
      },
      { total: 0, completed: 0, cancelled: 0 },
    );

    const statusFilteredRows =
      statusFilter === "all"
        ? searchedRows
        : searchedRows.filter((row) => {
            if (statusFilter === "declined") return row.status === "cancelled";
            if (statusFilter === "completed") return row.status === "completed";
            return true;
          });

    const sortedRows = [...statusFilteredRows].sort((a, b) => {
      const dateA = new Date(a.endAt || a.resolvedAt || a.createdAt || "").getTime();
      const dateB = new Date(b.endAt || b.resolvedAt || b.createdAt || "").getTime();
      const fallbackA = Number(a.referenceId) || 0;
      const fallbackB = Number(b.referenceId) || 0;
      if (Number.isNaN(dateA) && Number.isNaN(dateB)) return fallbackB - fallbackA;
      if (Number.isNaN(dateA)) return 1;
      if (Number.isNaN(dateB)) return -1;
      return sort === "date_asc" ? dateA - dateB : dateB - dateA;
    });

    const totalItems = sortedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const offset = (normalizedPage - 1) * pageSize;
    const items = sortedRows.slice(offset, offset + pageSize);
    const managedSacramentTypesResult = await query(
      `SELECT "sacramentName" FROM sacraments WHERE COALESCE("isArchived", FALSE) = FALSE ORDER BY "sacramentName" ASC`,
    );
    const managedCertificateTypes = await listCertificateTypes();
    const appointmentTypeOptions = [...new Set([
      ...managedSacramentTypesResult.rows.map((row) => String(row.sacramentName || "").trim()),
      ...mergedRows
        .filter((row) => row.requestTypeKey === "appointment")
        .map((row) => String(row.sacramentName || "").trim()),
    ])]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const listedSpecialPrograms = await query(
      `
        SELECT DISTINCT TRIM(name) AS "programName"
        FROM (
          SELECT ce.title AS name
          FROM calendar_entries_resolved ce
          WHERE ce."s_sacramentID" IS NOT NULL
            AND ce."eventDate" >= (NOW() AT TIME ZONE 'Asia/Manila')::date
          UNION
          SELECT ss."s_sacramentName" AS name
          FROM appointments a
          LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
          WHERE COALESCE(a."s_sacramentID", 0) > 0
            AND a."isArchived" = FALSE
        ) programs
        WHERE LENGTH(TRIM(COALESCE(name, ''))) > 0
        ORDER BY 1 ASC
      `,
    );
    const specialProgramTypeOptions = listedSpecialPrograms.rows
      .map((row) => String(row.programName || "").trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const certificateTypeOptions = [...new Set([
      ...mergedRows
        .filter((row) => row.requestTypeKey === "certificate")
        .map((row) => String(row.sacramentName || "").trim()),
      ...managedCertificateTypes.map((type) =>
        formatCertificateTypeLabel(type.certTypeName || type.formSchema?.label),
      ),
    ])]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));

    return res.json({
      items,
      appointmentTypeOptions,
      specialProgramTypeOptions,
      certificateTypeOptions,
      pagination: {
        page: normalizedPage,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: normalizedPage > 1,
        hasNextPage: normalizedPage < totalPages,
      },
      summary,
    });
  } catch (error) {
    console.error("Admin history fetch error:", error);
    return res.status(500).json({ message: "Unable to load history records." });
  }
});

app.get("/status/user", async (req, res) => {
  try {
    await promoteDueAppointmentsToHistory();
    const userID = Number(req.query?.userID);
    const page = Math.max(1, Number(req.query?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize) || 10));
    const sort = String(req.query?.sort || "date_desc").trim().toLowerCase();
    const statusFilter = String(req.query?.status || "all").trim().toLowerCase();
    const requestCategoryFilter = String(req.query?.requestType || "all").trim().toLowerCase();
    const specificTypeFilter = String(req.query?.specificType || req.query?.sacramentalType || req.query?.certificateType || "all").trim();
    const searchInput = String(req.query?.search || "").trim().toLowerCase();

    if (!Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "userID must be a positive whole number." });
    }

    const appointmentsResult = await query(
      `
        SELECT
          a."appointmentID",
          a.status::text AS status,
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
          a."createdAt",
          a."finishedAt",
          a.note,
          a.credentials,
          COALESCE(ss."s_sacramentName", s."sacramentName", 'Appointment') AS "sacramentName",
          a."s_sacramentID",
          a."priestID",
          p."fullName" AS "priestName",
          pt.checklist_data,
          pt."eventDone"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN priests p ON p."priestID" = a."priestID"
        LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
        WHERE a."userID" = $1
          AND a."isArchived" = FALSE
          AND a.status IN ('PENDING', 'CONFIRMED')
          AND a."finishedAt" IS NULL
      `,
      [userID],
    );
    const pendingChangeResult = await query(
      `
        SELECT "appointmentID", "requestType", reason, "createdAt"
        FROM appointment_change_requests
        WHERE "userID" = $1 AND status = 'pending'
      `,
      [userID],
    );
    const pendingChangeByAppointment = new Map(
      pendingChangeResult.rows.map((row) => [
        Number(row.appointmentID),
        { requestType: row.requestType, reason: String(row.reason || "").trim(), createdAt: row.createdAt || null },
      ]),
    );

    const certificateResult = await query(
      `
        SELECT
          cr."certID",
          cr.status::text AS status,
          cr."createdAt",
          cr."pickupDate",
          cr."pickupTime",
          cr.credentials,
          COALESCE(
            NULLIF(BTRIM(ct."certTypeName"), ''),
            NULLIF(BTRIM(ct."formSchema"->>'label'), ''),
            'Certificate Request'
          ) AS "certificateType"
        FROM cert_request cr
        LEFT JOIN certificate_type ct ON ct."certificateTypeID" = cr."certificateTypeID"
        WHERE cr."userID" = $1
          AND cr.status IN ('Pending', 'Approved')
      `,
      [userID],
    );

    const appointmentItems = appointmentsResult.rows.map((row) => {
      const paymentRecords = readPaymentRecordsFromSources(row);
      const totalPaymentAmount = sumProgressPaymentAmount(paymentRecords);
      const paymentStatus = resolveAppointmentPaymentStatus({
        ...row,
        paymentRecords,
      });
      const checklistMetrics = computeChecklistProgressMetrics(row.checklist_data);
      const progressState = resolveUserFacingProgressState({
        status: row.status,
        isCertificateRequest: false,
        totalTasks: checklistMetrics.totalTasks,
        completedTasks: checklistMetrics.completedTasks,
        progressPercent: checklistMetrics.progressPercent,
        eventDone: Boolean(row.eventDone),
      });
      return {
        appointmentID: Number(row.appointmentID),
        priestID: row.priestID === null ? null : Number(row.priestID),
        priestName: String(row.priestName || "").trim(),
        sacramentalType: String(row.sacramentName || "").trim() || "Appointment",
        requestType: Number(row.s_sacramentID) > 0 ? "Special Program" : "Appointment",
        requestCategory: Number(row.s_sacramentID) > 0 ? "special_program" : "appointment",
        s_sacramentID: Number(row.s_sacramentID) > 0 ? Number(row.s_sacramentID) : null,
        progressState,
        progressPercent: progressState === "Pending" ? 0 : checklistMetrics.progressPercent,
        completedTasks: progressState === "Pending" ? 0 : checklistMetrics.completedTasks,
        totalTasks: progressState === "Pending" ? 0 : checklistMetrics.totalTasks,
        paymentStatus,
        totalPaymentAmount: Number.isFinite(totalPaymentAmount) ? Math.max(0, totalPaymentAmount) : 0,
        createdAt: row.createdAt || null,
        declineReason: String(row.note || "").trim() || "",
        isCertificateRequest: false,
        certificateType: null,
        pickupDate: null,
        pickupTime: null,
        pendingChangeRequest: pendingChangeByAppointment.get(Number(row.appointmentID)) || null,
      };
    });

    const fallbackParishAdminID = appointmentItems.find((item) => Number(item.adminID) > 0)?.adminID || null;
    const certificateItems = certificateResult.rows.map((row) => {
      const progressState = resolveUserFacingProgressState({
        status: row.status,
        isCertificateRequest: true,
      });
      const credentials = row.credentials && typeof row.credentials === "object" ? row.credentials : {};
      const certificateType = formatCertificateTypeLabel(row.certificateType);
      return {
        appointmentID: Number(row.certID),
        adminID: fallbackParishAdminID,
        sacramentalType: certificateType,
        requestType: "Certificate Request",
        requestCategory: "certificate",
        progressState,
        progressPercent: progressState === "Ongoing" ? 50 : 0,
        completedTasks: 0,
        totalTasks: 0,
        paymentStatus: resolveCertificatePaymentStatus({ credentials }),
        createdAt: row.createdAt || null,
        declineReason: String(credentials.declineReason || "").trim() || "",
        isCertificateRequest: true,
        certificateType,
        pickupDate: row.pickupDate || null,
        pickupTime: row.pickupTime || null,
        pickupEndTime: getCertificatePickupEndTime(row.pickupTime),
        pickupSchedule: formatCertificatePickupLabel(row.pickupDate, row.pickupTime) || null,
      };
    });

    const allItems = [...appointmentItems, ...certificateItems];
    const managedSacramentTypesResult = await query(
      `SELECT "sacramentName" FROM sacraments WHERE COALESCE("isArchived", FALSE) = FALSE ORDER BY "sacramentName" ASC`,
    );
    const listedSpecialPrograms = await query(
      `
        SELECT DISTINCT TRIM(name) AS "programName"
        FROM (
          SELECT ce.title AS name
          FROM calendar_entries_resolved ce
          WHERE ce."s_sacramentID" IS NOT NULL
            AND ce."eventDate" >= (NOW() AT TIME ZONE 'Asia/Manila')::date
          UNION
          SELECT ss."s_sacramentName" AS name
          FROM appointments a
          LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
          WHERE COALESCE(a."s_sacramentID", 0) > 0
            AND a."isArchived" = FALSE
            AND a."userID" = $1
        ) programs
        WHERE LENGTH(TRIM(COALESCE(name, ''))) > 0
        ORDER BY 1 ASC
      `,
      [userID],
    );
    const managedCertificateTypes = await listCertificateTypes();
    const appointmentTypeOptions = [...new Set([
      ...managedSacramentTypesResult.rows.map((row) => String(row.sacramentName || "").trim()),
      ...appointmentItems
        .filter((item) => item.requestCategory === "appointment")
        .map((item) => String(item.sacramentalType || "").trim()),
    ])].filter(Boolean).sort((left, right) => left.localeCompare(right));
    const specialProgramTypeOptions = [...new Set([
      ...listedSpecialPrograms.rows.map((row) => String(row.programName || "").trim()),
      ...appointmentItems
        .filter((item) => item.requestCategory === "special_program")
        .map((item) => String(item.sacramentalType || "").trim()),
    ])].filter(Boolean).sort((left, right) => left.localeCompare(right));
    const certificateTypeOptions = [...new Set([
      ...managedCertificateTypes.map((type) => formatCertificateTypeLabel(type.certTypeName || type.formSchema?.label)),
      ...certificateItems.map((item) => String(item.certificateType || "").trim()),
    ])].filter(Boolean).sort((left, right) => left.localeCompare(right));
    const normalizeSpecificType = (value) =>
      String(value || "")
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/^baptismal(?=\s|$)/, "baptism")
        .replace(/\s+certificate$/, "")
        .trim();
    const hasSpecificFilter = specificTypeFilter.toLowerCase() !== "all";
    const typeFiltered = allItems.filter((item) => {
      if (requestCategoryFilter === "appointment" && item.requestCategory !== "appointment") return false;
      if (requestCategoryFilter === "special_program" && item.requestCategory !== "special_program") return false;
      if (requestCategoryFilter === "certificate" && item.requestCategory !== "certificate") return false;
      if (!hasSpecificFilter) return true;
      return normalizeSpecificType(item.sacramentalType) === normalizeSpecificType(specificTypeFilter);
    });
    const searched = searchInput
      ? typeFiltered.filter((item) =>
          [
            item.sacramentalType,
            item.progressState,
            item.requestType,
            item.certificateType,
            String(item.appointmentID || ""),
          ]
            .join(" ")
            .toLowerCase()
            .includes(searchInput),
        )
      : typeFiltered;

    const summary = searched.reduce(
      (accumulator, item) => {
        accumulator.total += 1;
        if (String(item.progressState || "").trim().toLowerCase() === "pending") accumulator.pending += 1;
        if (String(item.progressState || "").trim().toLowerCase() === "ongoing") accumulator.scheduled += 1;
        return accumulator;
      },
      { total: 0, pending: 0, scheduled: 0 },
    );

    const statusFiltered =
      statusFilter === "all"
        ? searched
        : searched.filter(
            (item) => String(item.progressState || "").trim().toLowerCase() === statusFilter.toLowerCase(),
          );

    const sorted = [...statusFiltered].sort((a, b) => {
      if (sort === "progress_desc") return Number(b.progressPercent || 0) - Number(a.progressPercent || 0);
      const timeA = new Date(a.createdAt || "").getTime();
      const timeB = new Date(b.createdAt || "").getTime();
      if (Number.isNaN(timeA) && Number.isNaN(timeB)) return Number(b.appointmentID || 0) - Number(a.appointmentID || 0);
      if (Number.isNaN(timeA)) return 1;
      if (Number.isNaN(timeB)) return -1;
      if (sort === "date_asc") return timeA - timeB;
      return timeB - timeA;
    });

    const totalItems = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const offset = (normalizedPage - 1) * pageSize;
    const items = sorted.slice(offset, offset + pageSize);

    return res.json({
      items,
      appointmentTypeOptions,
      specialProgramTypeOptions,
      certificateTypeOptions,
      pagination: {
        page: normalizedPage,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: normalizedPage > 1,
        hasNextPage: normalizedPage < totalPages,
      },
      summary,
    });
  } catch (error) {
    console.error("User status fetch error:", error);
    return res.status(500).json({ message: "Unable to load status records." });
  }
});

app.get("/history/user", async (req, res) => {
  try {
    await promoteDueAppointmentsToHistory();
    const userID = Number(req.query?.userID);
    const page = Math.max(1, Number(req.query?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize) || 10));
    const sort = String(req.query?.sort || "date_desc").trim().toLowerCase();
    const statusFilter = String(req.query?.status || "all").trim().toUpperCase();
    const requestCategoryFilter = String(req.query?.requestType || "all").trim().toLowerCase();
    const specificTypeFilter = String(req.query?.specificType || req.query?.type || "all").trim();
    const searchInput = String(req.query?.search || "").trim().toLowerCase();

    if (!Number.isInteger(userID) || userID <= 0) {
      return res.status(400).json({ message: "userID must be a positive whole number." });
    }

    const appointmentsResult = await query(
      `
        SELECT
          a."appointmentID",
          a."priestID",
          a.status::text AS status,
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
          a."requesterFullName",
          a.credentials,
          a.note,
          a."createdAt",
          COALESCE(a."finishedAt", a."createdAt") AS "finishedAt",
          COALESCE(ss."s_sacramentName", s."sacramentName", 'Appointment') AS "sacramentName",
          a."s_sacramentID",
          p."fullName" AS "priestName",
          pt."scheduledEventDateTime" AS "finalEventSchedule",
          (
            a.status = 'CANCELLED'
            AND (
              pt."progressID" IS NOT NULL
              OR EXISTS (
                SELECT 1
                FROM appointment_change_requests acr
                WHERE acr."appointmentID" = a."appointmentID"
                  AND acr."requestType" = 'cancel'
                  AND acr.status = 'approved'
              )
            )
          ) AS "isCancelledAppointment"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN priests p ON p."priestID" = a."priestID"
        LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
        WHERE a."userID" = $1
          AND a."isArchived" = FALSE
          AND (a.status = 'CANCELLED' OR a."finishedAt" IS NOT NULL)
      `,
      [userID],
    );

    const certificatesResult = await query(
      `
        SELECT
          cr."certID",
          cr.status::text AS status,
          cr."createdAt" AS "createdAt",
          COALESCE(cr."claimedAt", cr."updatedAt", cr."createdAt") AS "finishedAt",
          cr."pickupDate",
          cr."pickupTime",
          cr."claimedAt",
          cr.credentials,
          COALESCE(
            ${sqlPersonFullName("u")},
            cr.credentials->>'fullName',
            cr.credentials->>'groomFullName',
            cr.credentials->>'brideFullName',
            cr.credentials->>'childFullName',
            'Unknown requester'
          ) AS "requesterFullName",
          COALESCE(ct."formSchema"->>'label', 'Certificate Request') AS "sacramentName"
        FROM cert_request cr
        LEFT JOIN users u ON u."userID" = cr."userID"
        LEFT JOIN certificate_type ct ON ct."certificateTypeID" = cr."certificateTypeID"
        WHERE cr."userID" = $1
          AND cr.status IN ('Completed', 'Cancelled')
      `,
      [userID],
    );

    const appointmentItems = appointmentsResult.rows.map((row, index) => {
      const status = String(row.status || "").trim().toUpperCase() === "CANCELLED" ? "CANCELLED" : "COMPLETED";
      const historyStartAt = row.createdAt || null;
      const historyEndAt = row.finishedAt || row.createdAt || null;
      let historyDurationSeconds = null;
      const startMs = new Date(historyStartAt || "").getTime();
      const endMs = new Date(historyEndAt || "").getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
        historyDurationSeconds = Math.floor((endMs - startMs) / 1000);
      }
      return {
        historyID: `appointment-${row.appointmentID}-${index}`,
        appointmentID: Number(row.appointmentID),
        priestID: row.priestID === null ? null : Number(row.priestID),
        priestName: String(row.priestName || "").trim(),
        requestType: Number(row.s_sacramentID) > 0 ? "Special Program" : "Appointment",
        requestCategory: Number(row.s_sacramentID) > 0 ? "special_program" : "appointment",
        status,
        sacramentName: String(row.sacramentName || "").trim() || "Appointment",
        requesterFullName: String(row.requesterFullName || "").trim() || "Unknown requester",
        credentials: row.credentials && typeof row.credentials === "object" ? row.credentials : {},
        note: String(row.note || "").trim(),
        createdAt: row.createdAt || null,
        finishedAt: row.finishedAt || null,
        historyStartAt,
        historyEndAt,
        historyDurationSeconds,
        finalEventSchedule: row.finalEventSchedule || null,
        pickupSchedule: null,
        declineReason: status === "CANCELLED" ? String(row.note || "").trim() : "",
        isCancelledAppointment: Boolean(row.isCancelledAppointment),
      };
    });

    const certificateItems = certificatesResult.rows.map((row, index) => {
      const normalizedStatus = String(row.status || "").trim().toLowerCase();
      const status = normalizedStatus === "cancelled" ? "CANCELLED" : "COMPLETED";
      const historyStartAt = row.createdAt || null;
      const historyEndAt = row.finishedAt || row.createdAt || null;
      let historyDurationSeconds = null;
      const startMs = new Date(historyStartAt || "").getTime();
      const endMs = new Date(historyEndAt || "").getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
        historyDurationSeconds = Math.floor((endMs - startMs) / 1000);
      }
      return {
        historyID: `certificate-${row.certID}-${index}`,
        appointmentID: Number(row.certID),
        adminID: null,
        priestID: null,
        priestName: "",
        requestType: "Certificate Request",
        requestCategory: "certificate",
        status,
        sacramentName: formatCertificateTypeLabel(row.sacramentName),
        requesterFullName: String(row.requesterFullName || "").trim() || "Unknown requester",
        credentials: row.credentials && typeof row.credentials === "object" ? row.credentials : {},
        note: "",
        createdAt: row.createdAt || null,
        finishedAt: row.finishedAt || null,
        historyStartAt,
        historyEndAt,
        historyDurationSeconds,
        finalEventSchedule: null,
        pickupSchedule: formatCertificatePickupLabel(row.pickupDate, row.pickupTime) || null,
        receiptNumber: String(row.credentials?.receiptNumber || "").trim() || null,
        declineReason: String(row.credentials?.declineReason || "").trim(),
      };
    });

    const combinedItems = [...appointmentItems, ...certificateItems];
    const managedSacramentTypesResult = await query(
      `SELECT "sacramentName" FROM sacraments WHERE COALESCE("isArchived", FALSE) = FALSE ORDER BY "sacramentName" ASC`,
    );
    const listedSpecialPrograms = await query(
      `
        SELECT DISTINCT TRIM(name) AS "programName"
        FROM (
          SELECT ce.title AS name
          FROM calendar_entries_resolved ce
          WHERE ce."s_sacramentID" IS NOT NULL
            AND ce."eventDate" >= (NOW() AT TIME ZONE 'Asia/Manila')::date
          UNION
          SELECT ss."s_sacramentName" AS name
          FROM appointments a
          LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
          WHERE COALESCE(a."s_sacramentID", 0) > 0
            AND a."isArchived" = FALSE
            AND a."userID" = $1
        ) programs
        WHERE LENGTH(TRIM(COALESCE(name, ''))) > 0
        ORDER BY 1 ASC
      `,
      [userID],
    );
    const managedCertificateTypes = await listCertificateTypes();
    const appointmentTypeOptions = [...new Set([
      ...managedSacramentTypesResult.rows.map((row) => String(row.sacramentName || "").trim()),
      ...appointmentItems.filter((item) => item.requestCategory === "appointment").map((item) => item.sacramentName),
    ])].filter(Boolean).sort((left, right) => left.localeCompare(right));
    const specialProgramTypeOptions = [...new Set([
      ...listedSpecialPrograms.rows.map((row) => String(row.programName || "").trim()),
      ...appointmentItems.filter((item) => item.requestCategory === "special_program").map((item) => item.sacramentName),
    ])].filter(Boolean).sort((left, right) => left.localeCompare(right));
    const certificateTypeOptions = [...new Set([
      ...managedCertificateTypes.map((type) => formatCertificateTypeLabel(type.certTypeName || type.formSchema?.label)),
      ...certificateItems.map((item) => item.sacramentName),
    ])].filter(Boolean).sort((left, right) => left.localeCompare(right));
    const hasSpecificFilter = specificTypeFilter.toLowerCase() !== "all";
    const typeFiltered = combinedItems.filter((item) => {
      if (requestCategoryFilter === "appointment" && item.requestCategory !== "appointment") return false;
      if (requestCategoryFilter === "special_program" && item.requestCategory !== "special_program") return false;
      if (requestCategoryFilter === "certificate" && item.requestCategory !== "certificate") return false;
      if (!hasSpecificFilter) return true;
      return String(item.sacramentName || "").trim().toLowerCase() === specificTypeFilter.toLowerCase();
    });
    const statusFiltered =
      statusFilter === "ALL"
        ? typeFiltered
        : typeFiltered.filter((item) => String(item.status || "").trim().toUpperCase() === statusFilter);
    const searched = searchInput
      ? statusFiltered.filter((item) =>
          [
            item.sacramentName,
            item.requestType,
            item.status,
            item.requesterFullName,
            String(item.appointmentID || ""),
          ]
            .join(" ")
            .toLowerCase()
            .includes(searchInput),
        )
      : statusFiltered;

    const sorted = [...searched].sort((a, b) => {
      if (sort === "service_asc") return String(a.sacramentName || "").localeCompare(String(b.sacramentName || ""));
      if (sort === "parish_asc") return 0;
      const timeA = new Date(a.historyEndAt || a.finishedAt || a.createdAt || "").getTime();
      const timeB = new Date(b.historyEndAt || b.finishedAt || b.createdAt || "").getTime();
      if (Number.isNaN(timeA) && Number.isNaN(timeB)) return Number(b.appointmentID || 0) - Number(a.appointmentID || 0);
      if (Number.isNaN(timeA)) return 1;
      if (Number.isNaN(timeB)) return -1;
      if (sort === "date_asc") return timeA - timeB;
      return timeB - timeA;
    });

    const summary = sorted.reduce(
      (accumulator, item) => {
        accumulator.total += 1;
        if (String(item.status || "").trim().toUpperCase() === "CANCELLED") accumulator.cancelled += 1;
        else accumulator.completed += 1;
        return accumulator;
      },
      { total: 0, completed: 0, cancelled: 0 },
    );

    const totalItems = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const offset = (normalizedPage - 1) * pageSize;
    const pageItems = sorted.slice(offset, offset + pageSize);

    return res.json({
      items: pageItems,
      appointmentTypeOptions,
      specialProgramTypeOptions,
      certificateTypeOptions,
      pagination: {
        page: normalizedPage,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: normalizedPage > 1,
        hasNextPage: normalizedPage < totalPages,
      },
      summary,
    });
  } catch (error) {
    console.error("User history fetch error:", error);
    return res.status(500).json({ message: "Unable to load your history records." });
  }
});

app.get("/appointments/:id/history-details", async (req, res) => {
  try {
    const appointmentID = Number(req.params.id);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const result = await query(
      `
        SELECT
          a."appointmentID",
          a."userID",
          a."sacramentID",
          a."s_sacramentID",
          a."progressID",
          a.status::text AS status,
          a."priestID",
          a."requesterFullName",
          CASE WHEN COALESCE(a."s_sacramentID", 0) > 0 THEN 'Special Sacrament Program' ELSE 'Appointment' END AS "requestType",
          a.credentials,
          a.note,
          a."createdAt",
          a."finishedAt",
          s."sacramentName",
          ss."s_sacramentName" AS "specialSacramentName",
          p."fullName" AS "priestName",
          pt."scheduledEventDateTime",
          pt."eventDone",
          pt."priestComments",
          pt."secretaryRemarks"
        FROM appointments a
        LEFT JOIN sacraments s ON s."sacramentID" = a."sacramentID"
        LEFT JOIN special_sacraments ss ON ss."s_sacramentID" = a."s_sacramentID"
        LEFT JOIN priests p ON p."priestID" = a."priestID"
        LEFT JOIN progress_tracker pt ON pt."appointmentID" = a."appointmentID"
        WHERE a."appointmentID" = $1
        LIMIT 1
      `,
      [appointmentID],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Appointment history details not found." });
    }

    const row = result.rows[0];
    let requesterFullName = String(row.requesterFullName || "").trim();
    const specialSacramentID = Number(row.s_sacramentID);
    if (Number.isInteger(specialSacramentID) && specialSacramentID > 0) {
      const applicantsResult = await query(
        `
          SELECT "requesterFullName"
          FROM appointments
          WHERE "s_sacramentID" = $1
            AND COALESCE("isArchived", FALSE) = FALSE
          ORDER BY "createdAt" ASC, "appointmentID" ASC
        `,
        [specialSacramentID],
      );
      const applicantNames = [];
      for (const applicant of applicantsResult.rows) {
        const name = String(applicant.requesterFullName || "").trim();
        if (name && !applicantNames.includes(name)) applicantNames.push(name);
      }
      if (applicantNames.length > 0) requesterFullName = applicantNames.join(", ");
    }
    const historyStartAt = row.createdAt || null;
    const historyEndAt = row.finishedAt || row.createdAt || null;
    let historyDurationSeconds = null;
    const startMs = new Date(historyStartAt || "").getTime();
    const endMs = new Date(historyEndAt || "").getTime();
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      historyDurationSeconds = Math.floor((endMs - startMs) / 1000);
    }

    return res.json({
      appointmentID: Number(row.appointmentID),
      userID: row.userID === null ? null : Number(row.userID),
      sacramentID: row.sacramentID === null ? null : Number(row.sacramentID),
      s_sacramentID: row.s_sacramentID === null ? null : Number(row.s_sacramentID),
      progressID: row.progressID === null ? null : Number(row.progressID),
      status: row.status,
      priestID: row.priestID === null ? null : Number(row.priestID),
      priestName: String(row.priestName || "").trim(),
      requesterFullName,
      requestType: String(row.requestType || "Appointment"),
      credentials: row.credentials && typeof row.credentials === "object" ? row.credentials : {},
      createdAt: row.createdAt || null,
      finishedAt: row.finishedAt || null,
      historyStartAt,
      historyEndAt,
      historyDurationSeconds,
      note: row.note || "",
      sacramentName: row.sacramentName || "",
      specialSacramentName: row.specialSacramentName || "",
      finalDetails: {
        scheduledEventDateTime: row.scheduledEventDateTime || null,
        eventDone: Boolean(row.eventDone),
        conductedPriestID: row.priestID === null ? null : Number(row.priestID),
        priestComments: String(row.priestComments || ""),
        secretaryRemarks: String(row.secretaryRemarks || ""),
      },
    });
  } catch (error) {
    console.error("Appointment history details fetch error:", error);
    return res.status(500).json({ message: "Unable to load appointment history details." });
  }
});

app.get("/certificate-requests/:id/history-details", async (req, res) => {
  try {
    const certificateRequestID = Number(req.params.id);
    const adminID = Number(req.query?.adminID);
    if (!Number.isInteger(certificateRequestID) || certificateRequestID <= 0) {
      return res.status(400).json({ message: "Invalid certificate request ID." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "adminID must be a positive whole number." });
    }

    const result = await query(
      `
        SELECT
          cr."certID",
          cr."userID",
          cr."certificateTypeID",
          cr.status::text AS status,
          cr.credentials,
          cr."pickupDate",
          cr."pickupTime",
          cr."claimedAt",
          cr."createdAt",
          cr."updatedAt",
          COALESCE(ct."formSchema"->>'label', 'Certificate Request') AS "certificateType",
          ${sqlPersonFullName("u")} AS "userFullName",
          u."contactNumber" AS "userContactNumber",
          u.address AS "userAddress"
        FROM cert_request cr
        LEFT JOIN users u ON u."userID" = cr."userID"
        LEFT JOIN certificate_type ct ON ct."certificateTypeID" = cr."certificateTypeID"
        WHERE cr."certID" = $1
        LIMIT 1
      `,
      [certificateRequestID],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Certificate request history details not found." });
    }

    const row = result.rows[0];
    const credentials = row.credentials && typeof row.credentials === "object" ? row.credentials : {};
    const certificateType = formatCertificateTypeLabel(row.certificateType);
    const isMarriage = certificateType.toLowerCase().includes("marriage");
    const fullName = isMarriage
      ? String(row.userFullName || credentials.groomFullName || credentials.brideFullName || "").trim()
      : String(row.userFullName || credentials.childFullName || "").trim();
    const contactNumber = isMarriage
      ? String(row.userContactNumber || credentials.groomPhoneNumber || credentials.bridePhoneNumber || "").trim()
      : String(row.userContactNumber || credentials.phoneNumber || "").trim();

    const historyStartAt = row.createdAt || null;
    const historyEndAt = row.claimedAt || row.updatedAt || row.createdAt || null;
    let historyDurationSeconds = null;
    const startMs = new Date(historyStartAt || "").getTime();
    const endMs = new Date(historyEndAt || "").getTime();
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      historyDurationSeconds = Math.floor((endMs - startMs) / 1000);
    }

    return res.json({
      id: Number(row.certID),
      userID: row.userID === null ? null : Number(row.userID),
      certificateTypeID: row.certificateTypeID === null ? null : Number(row.certificateTypeID),
      requestType: "Certificate",
      status: row.status || "Pending",
      certificateType,
      fullName: fullName || "Unknown requester",
      contactNumber: contactNumber || "Not provided",
      pickupDate: row.pickupDate || null,
      pickupTime: row.pickupTime || null,
      pickupEndTime: getCertificatePickupEndTime(row.pickupTime),
      pickupSchedule: formatCertificatePickupLabel(row.pickupDate, row.pickupTime) || null,
      claimedAt: row.claimedAt || null,
      declineReason: credentials.declineReason || null,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
      finishedAt: row.claimedAt || row.updatedAt || row.createdAt || null,
      historyStartAt,
      historyEndAt,
      historyDurationSeconds,
      credentials: {
        ...credentials,
        address: credentials.address || row.userAddress || null,
      },
    });
  } catch (error) {
    console.error("Certificate request history details fetch error:", error);
    return res.status(500).json({ message: "Unable to load certificate request history details." });
  }
});

app.post("/priests", async (req, res) => {
  let createdPriest = null;
  let client = null;
  try {
    client = await pool.connect();
    const personName = resolveStoredPersonName({
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      fullName: req.body?.fullName,
    });
    const fullName = personName.fullName;
    const identifiers = resolvePriestLoginIdentifiers({
      email: req.body?.email,
      phoneNumber: req.body?.phoneNumber,
    });
    const email = identifiers.email;
    const phoneNumber = identifiers.phoneNumber;
    const adminID = Number(req.body?.adminID);
    const clergyType = normalizePriestClergyType(req.body?.clergyType, { fallbackToDiocesan: true });
    const religiousOrderCodeInput = normalizeReligiousOrderCode(req.body?.religiousOrderCode);
    const religiousOrderCode = clergyType === PRIEST_CLERGY_TYPES.RELIGIOUS ? religiousOrderCodeInput : null;

    if (!personName.firstName || !personName.lastName) {
      return res.status(400).json({ message: "Enter the priest's first name and last name." });
    }
    const identifierError = getPriestLoginIdentifierError(identifiers);
    if (identifierError) {
      return res.status(400).json({ message: identifierError });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    if (!clergyType) {
      return res.status(400).json({ message: "Clergy type must be DIOCESAN or RELIGIOUS." });
    }
    if (clergyType === PRIEST_CLERGY_TYPES.RELIGIOUS && !religiousOrderCode) {
      return res.status(400).json({ message: "Please select a religious order for religious clergy." });
    }

    await assertLoginIdentifiersAvailable({ email, phoneNumber });

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    await client.query("BEGIN");
    const insertResult = await client.query(
      `
        INSERT INTO priests ("firstName", "lastName", "adminID", email, "phoneNumber", password, "clergyType", "religiousOrderCode", "isActive", photo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
        RETURNING "priestID", "firstName", "lastName", "fullName", "adminID", email, "phoneNumber", "clergyType", "religiousOrderCode", "isActive", photo
      `,
      [personName.firstName, personName.lastName, adminID, identifiers.storedEmail, identifiers.storedPhoneNumber, passwordHash, clergyType, religiousOrderCode, String(req.body?.photo || "").trim() || null],
    );
    createdPriest = insertResult.rows[0] || null;
    await client.query("COMMIT");

    let emailDeliveryError = "";
    let credentialsEmailed = false;
    if (identifiers.storedEmail) {
      try {
        await sendPriestWelcomeEmail({
          email,
          fullName,
          phoneNumber,
          temporaryPassword,
        });
        credentialsEmailed = true;
      } catch (error) {
        emailDeliveryError = String(error?.message || "Unable to send priest credentials email.");
      }
    }

    if (!identifiers.storedEmail) {
      return res.status(201).json({
        message: "Priest added successfully. Share the temporary password with the priest so they can log in with their phone number.",
        priest: createdPriest,
        temporaryPassword,
        credentialsEmailed: false,
      });
    }

    if (emailDeliveryError) {
      return res.status(201).json({
        message: "Priest added successfully, but credentials email was not sent. Share the temporary password manually.",
        priest: createdPriest,
        temporaryPassword,
        emailDeliveryError,
        credentialsEmailed: false,
      });
    }

    return res.status(201).json({
      message: identifiers.storedPhoneNumber
        ? "Priest added successfully. Login credentials were sent to the priest Gmail. The priest can log in with that Gmail or phone number."
        : "Priest added successfully. Login credentials were sent to the priest Gmail.",
      priest: createdPriest,
      credentialsEmailed: true,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction may not have started yet.
    }
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Priest Google account or phone number is already in use." });
    }
    console.error("Add priest error:", error);
    return res.status(500).json({ message: "Unable to add priest." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.patch("/priests/:id", async (req, res) => {
  let client = null;
  let transactionStarted = false;
  try {
    const priestID = Number(req.params.id);
    const adminID = Number(req.body?.adminID);
    const personName = resolveStoredPersonName({
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      fullName: req.body?.fullName,
    });
    const identifiers = resolvePriestLoginIdentifiers({
      email: req.body?.email,
      phoneNumber: req.body?.phoneNumber,
    });
    const email = identifiers.email;
    const phoneNumber = identifiers.phoneNumber;
    const clergyType = normalizePriestClergyType(req.body?.clergyType, { fallbackToDiocesan: true });
    const religiousOrderCodeInput = normalizeReligiousOrderCode(req.body?.religiousOrderCode);
    const religiousOrderCode = clergyType === PRIEST_CLERGY_TYPES.RELIGIOUS ? religiousOrderCodeInput : null;

    if (!Number.isInteger(priestID) || priestID <= 0) {
      return res.status(400).json({ message: "A valid priestID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    if (!personName.firstName || !personName.lastName) {
      return res.status(400).json({ message: "Enter the priest's first name and last name." });
    }
    const identifierError = getPriestLoginIdentifierError(identifiers);
    if (identifierError) {
      return res.status(400).json({ message: identifierError });
    }
    if (clergyType === PRIEST_CLERGY_TYPES.RELIGIOUS && !religiousOrderCode) {
      return res.status(400).json({ message: "Please select a religious order for religious clergy." });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const existingResult = await client.query(
      `
        SELECT "priestID", "firstName", "lastName", "fullName", email, "phoneNumber"
        FROM priests
        WHERE "priestID" = $1 AND "adminID" = $2
        LIMIT 1
        FOR UPDATE
      `,
      [priestID, adminID],
    );
    const existingPriest = existingResult.rows[0];
    if (!existingPriest) {
      throw Object.assign(new Error("Priest not found."), { status: 404 });
    }

    const linkedUser = await findUserLinkedToPriest(existingPriest, client);
    const emailChanged = normalizeEmail(email) !== normalizeEmail(existingPriest.email);
    const phoneChanged = normalizeLoginPhone(phoneNumber) !== normalizeLoginPhone(existingPriest.phoneNumber);
    if (emailChanged || phoneChanged) {
      await assertLoginIdentifiersAvailable(
        {
          email,
          phoneNumber,
          excludePriestID: priestID,
          excludeUserID: linkedUser?.userID || null,
        },
        client,
      );
    }

    const updateResult = await client.query(
      `
        UPDATE priests
        SET
          "firstName" = $1,
          "lastName" = $2,
          email = $3,
          "phoneNumber" = $4,
          "clergyType" = $5,
          "religiousOrderCode" = $6
        WHERE "priestID" = $7 AND "adminID" = $8
        RETURNING "priestID", "firstName", "lastName", "fullName", "adminID", email, "phoneNumber", "clergyType", "religiousOrderCode", "isActive", photo
      `,
      [personName.firstName, personName.lastName, identifiers.storedEmail, identifiers.storedPhoneNumber, clergyType, religiousOrderCode, priestID, adminID],
    );
    if (linkedUser) {
      await client.query(
        `
          UPDATE users
          SET
            "firstName" = $1,
            "lastName" = $2,
            email = $3,
            "contactNumber" = $4,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "userID" = $5
        `,
        [
          personName.firstName,
          personName.lastName,
          identifiers.storedEmail,
          identifiers.storedPhoneNumber,
          linkedUser.userID,
        ],
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      message: "Priest updated successfully.",
      priest: updateResult.rows[0],
    });
  } catch (error) {
    if (transactionStarted && client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Priest update rollback error:", rollbackError);
      }
    }
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Priest Google account or phone number is already in use." });
    }
    console.error("Update priest error:", error);
    return res.status(500).json({ message: "Unable to update priest." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.post("/priests/:id/password-reset", async (req, res) => {
  const priestID = Number(req.params.id);
  const adminID = Number(req.body?.adminID);
  const deliveryMethod = String(req.body?.deliveryMethod || "").trim().toLowerCase();
  let requestLockAcquired = false;
  try {
    if (!Number.isInteger(priestID) || priestID <= 0) {
      return res.status(400).json({ message: "A valid priestID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }
    if (deliveryMethod !== "email" && deliveryMethod !== "sms") {
      return res.status(400).json({ message: "Choose email or SMS to receive the new password." });
    }

    const priestResult = await query(
      `
        SELECT "priestID", "fullName", email, "phoneNumber", "isActive"
        FROM priests
        WHERE "priestID" = $1 AND "adminID" = $2
        LIMIT 1
      `,
      [priestID, adminID],
    );
    const priest = priestResult.rows[0];
    if (!priest) {
      return res.status(404).json({ message: "Priest not found." });
    }
    if (priest.isActive === false) {
      return res.status(403).json({ message: "Activate this priest account before generating a new password." });
    }

    const email = normalizeEmail(priest.email);
    const phoneNumber = String(priest.phoneNumber || "").trim();
    if (deliveryMethod === "email" && (!EMAIL_INPUT_REGEX.test(email) || !isGmailAddress(email))) {
      return res.status(400).json({ message: "This priest does not have a valid Gmail address on file." });
    }
    if (deliveryMethod === "sms" && !normalizeLoginPhone(phoneNumber)) {
      return res.status(400).json({ message: "This priest does not have a valid phone number on file." });
    }

    const resetKey = email || normalizeLoginPhone(phoneNumber);
    await assertForgotPasswordLimit({
      email: resetKey,
      accountType: "priest",
      accountID: priestID,
    });
    requestLockAcquired = true;

    const temporaryPassword = generateTemporaryPassword();
    await sendFaithflowPasswordReset({
      email,
      fullName: String(priest.fullName || "").trim(),
      accountType: "priest",
      temporaryPassword,
      loginHint: email || phoneNumber,
      phoneNumber,
      deliveryMethod,
    });
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const updateResult = await query(
      `UPDATE priests SET password = $1 WHERE "priestID" = $2 AND "adminID" = $3`,
      [passwordHash, priestID, adminID],
    );
    if (updateResult.rowCount !== 1) {
      throw new Error("Priest account changed before the password could be updated.");
    }
    await recordForgotPasswordRequest({
      email: resetKey,
      accountType: "priest",
      accountID: priestID,
    });

    return res.json({
      message: deliveryMethod === "sms"
        ? "The SMS provider accepted the new password message for delivery."
        : "The new password was emailed to the priest's registered Gmail address.",
      deliveryMethod,
    });
  } catch (error) {
    const status = Number(error?.status);
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      return res.status(status).json({ message: error.message });
    }
    console.error("Admin priest password reset error:", error);
    return res.status(500).json({ message: error.message || "Unable to generate a new priest password." });
  } finally {
    if (requestLockAcquired) {
      releaseForgotPasswordLock("priest", priestID);
    }
  }
});

app.patch("/priests/:id/toggle-status", async (req, res) => {
  try {
    const priestID = Number(req.params.id);
    const adminID = Number(req.body?.adminID ?? req.query?.adminID);

    if (!Number.isInteger(priestID) || priestID <= 0) {
      return res.status(400).json({ message: "A valid priestID is required." });
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      return res.status(400).json({ message: "A valid adminID is required." });
    }

    const adminValidation = await assertAdminExistsInAdminService(adminID);
    if (!adminValidation.ok) {
      return res.status(adminValidation.status).json({ message: adminValidation.message });
    }

    const existingResult = await query(
      `
        SELECT
          "priestID",
          "fullName",
          "adminID",
          email,
          "phoneNumber",
          "clergyType",
          "religiousOrderCode",
          COALESCE("isActive", TRUE) AS "isActive",
          photo
        FROM priests
        WHERE "priestID" = $1 AND "adminID" = $2
        LIMIT 1
      `,
      [priestID, adminID],
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: "Priest not found." });
    }

    const nextIsActive = existingResult.rows[0].isActive === false;
    const updateResult = await query(
      `
        UPDATE priests
        SET "isActive" = $3
        WHERE "priestID" = $1 AND "adminID" = $2
        RETURNING
          "priestID",
          "fullName",
          "adminID",
          email,
          "phoneNumber",
          "clergyType",
          "religiousOrderCode",
          "isActive",
          photo
      `,
      [priestID, adminID, nextIsActive],
    );
    const priest = updateResult.rows[0];

    const calendarChange = nextIsActive
      ? await restorePriestAppointmentCalendarEntries(priestID)
      : { restoredMissing: 0 };

    return res.json({
      message: nextIsActive
        ? "Priest activated successfully. Their schedules are back on the calendar."
        : "Priest deactivated successfully. Their schedules are hidden from the calendar.",
      priest,
      calendar: calendarChange,
    });
  } catch (error) {
    console.error("Toggle priest status error:", error);
    return res.status(500).json({ message: "Unable to update priest status." });
  }
});

app.delete("/priests/:id", async (req, res) => {
  try {
    const priestID = Number(req.params.id);
    const adminID = Number(req.body?.adminID ?? req.query?.adminID);
    const deleted = await deletePriestAccountCompletely({ priestID, adminID });
    return res.json({
      message: `${deleted.priest.fullName} and the Gmail login used for that priest account were deleted.`,
      priestID: Number(deleted.priest.priestID),
      deletedEmails: deleted.deletedEmails,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Delete priest error:", error);
    return res.status(500).json({ message: "Unable to delete priest." });
  }
});

app.get("/profile", async (req, res) => {
  try {
    const accountType = String(req.query?.accountType || "")
      .trim()
      .toLowerCase();
    const accountID = Number(req.query?.accountID);
    if (!Number.isInteger(accountID) || accountID <= 0) {
      return res.status(400).json({ message: "A valid account ID is required." });
    }

    if (accountType === "priest") {
      const priest = await fetchPriestDetailsByID(accountID);
      if (!priest) {
        return res.status(404).json({ message: "Priest account not found." });
      }
      return res.json({
        accountType: "priest",
        user: sanitizePriestSession(priest),
      });
    }

    if (accountType !== "user") {
      return res.status(400).json({ message: "Main server only supports user and priest profiles. Use admin-server for admin profiles." });
    }

    const result = await query(
      `
        SELECT "userID", "firstName", "lastName", ${sqlPersonFullName()} AS "fullName", address, "contactNumber", birthdate, gender, email, "createdAt", "updatedAt", photo
        FROM users
        WHERE "userID" = $1
        LIMIT 1
      `,
      [accountID],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User account not found." });
    }
    const account = result.rows[0];
    const linkedPriest = await findPriestLinkedToUser(account);
    const userPayload = {
      ...sanitizeUser(account),
      ...(linkedPriest
        ? {
            priestID: Number(linkedPriest.priestID),
            priestAdminID: Number(linkedPriest.adminID),
            photo: linkedPriest.photo || account.photo || null,
          }
        : {}),
    };
    return res.json({
      accountType: linkedPriest ? "priest" : "user",
      user: userPayload,
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch profile." });
  }
});

app.patch("/profile", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "")
      .trim()
      .toLowerCase();
    const accountID = Number(req.body?.accountID);
    if (!Number.isInteger(accountID) || accountID <= 0) {
      return res.status(400).json({ message: "A valid account ID is required." });
    }

    const payload = req.body || {};

    if (accountType === "priest") {
      const existingPriestResult = await query(
        `
          SELECT "priestID", "firstName", "lastName", "fullName", email, "phoneNumber", photo
          FROM priests
          WHERE "priestID" = $1
          LIMIT 1
        `,
        [accountID],
      );
      if (existingPriestResult.rows.length === 0) {
        return res.status(404).json({ message: "Priest account not found." });
      }
      const existingPriest = existingPriestResult.rows[0];
      const linkedUser = await findUserLinkedToPriest(existingPriest);
      const nextPersonName = resolveStoredPersonName({
        firstName: Object.prototype.hasOwnProperty.call(payload, "firstName") ? payload.firstName : existingPriest.firstName,
        lastName: Object.prototype.hasOwnProperty.call(payload, "lastName") ? payload.lastName : existingPriest.lastName,
        fullName: Object.prototype.hasOwnProperty.call(payload, "fullName") ? payload.fullName : existingPriest.fullName,
      });
      const nextFullName = nextPersonName.fullName;
      const nextEmail = payloadHasEmailField(payload)
        ? resolveRequestEmail(payload)
        : normalizeEmail(existingPriest.email);
      const nextPhone = Object.prototype.hasOwnProperty.call(payload, "contactNumber")
        ? String(payload.contactNumber ?? "").trim()
        : String(existingPriest.phoneNumber || "").trim();

      const priestIdentifiers = resolvePriestLoginIdentifiers({
        email: nextEmail,
        phoneNumber: nextPhone,
      });
      if (!nextFullName) {
        return res.status(400).json({ message: "Priest full name is required." });
      }
      const priestIdentifierError = getPriestLoginIdentifierError(priestIdentifiers);
      if (priestIdentifierError) {
        return res.status(400).json({ message: priestIdentifierError });
      }

      const emailChanged = normalizeEmail(nextEmail) !== normalizeEmail(existingPriest.email);
      const phoneChanged = normalizeLoginPhone(nextPhone) !== normalizeLoginPhone(existingPriest.phoneNumber);
      if (emailChanged || phoneChanged) {
        await assertLoginIdentifiersAvailable({
          email: nextEmail,
          phoneNumber: nextPhone,
          excludePriestID: accountID,
          excludeUserID: linkedUser?.userID || null,
        });
      }

      const updateResult = await query(
        `
          UPDATE priests
          SET
            "firstName" = $1,
            "lastName" = $2,
            email = $3,
            "phoneNumber" = $4
          WHERE "priestID" = $5
          RETURNING "priestID", "firstName", "lastName", "fullName", "adminID", email, "phoneNumber", "clergyType", "religiousOrderCode", "isActive", photo
        `,
        [
          nextPersonName.firstName,
          nextPersonName.lastName,
          priestIdentifiers.storedEmail,
          priestIdentifiers.storedPhoneNumber,
          accountID,
        ],
      );

      if (
        linkedUser &&
        (Object.prototype.hasOwnProperty.call(payload, "fullName") ||
          Object.prototype.hasOwnProperty.call(payload, "firstName") ||
          Object.prototype.hasOwnProperty.call(payload, "lastName"))
      ) {
        await query(
          `
            UPDATE users
            SET "firstName" = $1, "lastName" = $2, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "userID" = $3
          `,
          [
            nextPersonName.firstName,
            nextPersonName.lastName,
            linkedUser.userID,
          ],
        );
      }
      if (linkedUser && (emailChanged || phoneChanged)) {
        await query(
          `
            UPDATE users
            SET
              email = CASE WHEN $3 THEN $1 ELSE email END,
              "contactNumber" = CASE WHEN $4 THEN $2 ELSE "contactNumber" END,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "userID" = $5
          `,
          [nextEmail, nextPhone, emailChanged, phoneChanged, linkedUser.userID],
        );
      }

      return res.json({
        message: "Profile updated successfully.",
        accountType: "priest",
        user: sanitizePriestSession(updateResult.rows[0]),
      });
    }

    if (accountType !== "user") {
      return res.status(400).json({ message: "Main server only supports user and priest profiles. Use admin-server for admin profiles." });
    }

    const allowedFields = ["fullName", "firstName", "lastName", "email", "userName", "username", "address", "contactNumber", "birthdate", "gender"];
    const updates = [];
    const values = [];

    const pushFieldUpdate = (columnName, rawValue) => {
      const normalized = String(rawValue ?? "").trim();
      if (!normalized) return;
      updates.push(`"${columnName}" = $${values.length + 1}`);
      values.push(normalized);
    };

    if (
      Object.prototype.hasOwnProperty.call(payload, "firstName") ||
      Object.prototype.hasOwnProperty.call(payload, "lastName") ||
      Object.prototype.hasOwnProperty.call(payload, "fullName")
    ) {
      const currentNameResult = await query(
        `SELECT "firstName", "lastName" FROM users WHERE "userID" = $1 LIMIT 1`,
        [accountID],
      );
      const currentName = currentNameResult.rows[0] || {};
      const personName = resolveStoredPersonName({
        firstName: Object.prototype.hasOwnProperty.call(payload, "firstName") ? payload.firstName : currentName.firstName,
        lastName: Object.prototype.hasOwnProperty.call(payload, "lastName") ? payload.lastName : currentName.lastName,
        fullName: payload.fullName,
      });
      if (!personName.firstName || !personName.lastName) {
        return res.status(400).json({ message: "First name and last name are required." });
      }
      pushFieldUpdate("firstName", personName.firstName);
      pushFieldUpdate("lastName", personName.lastName);
    }
    if (payloadHasEmailField(payload)) {
      const nextEmailValue = resolveRequestEmail(payload);
      if (!EMAIL_INPUT_REGEX.test(nextEmailValue) || !isGmailAddress(nextEmailValue)) {
        return res.status(400).json({ message: "Email must be a Gmail address (example@gmail.com)." });
      }
      pushFieldUpdate("email", nextEmailValue);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "address")) {
      pushFieldUpdate("address", payload.address);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "contactNumber")) {
      const normalizedContactNumber = String(payload.contactNumber ?? "").trim();
      if (normalizedContactNumber && !PHONE_INPUT_REGEX.test(normalizedContactNumber)) {
        return res.status(400).json({ message: "Contact number must be 11 digits and start with 09." });
      }
      pushFieldUpdate("contactNumber", normalizedContactNumber);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "birthdate")) {
      const normalizedBirthdate = String(payload.birthdate || "").trim();
      if (normalizedBirthdate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthdate)) {
          return res.status(400).json({ message: "Birthdate must be in YYYY-MM-DD format." });
        }
        updates.push(`birthdate = $${values.length + 1}`);
        values.push(normalizedBirthdate);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "gender")) {
      const normalizedGender = String(payload.gender || "")
        .trim()
        .toLowerCase();
      if (normalizedGender && !["male", "female"].includes(normalizedGender)) {
        return res.status(400).json({ message: "Gender must be male or female." });
      }
      updates.push(`gender = $${values.length + 1}`);
      values.push(normalizedGender);
    }

    const hasUnsupportedFields = Object.keys(payload)
      .filter((key) => key !== "accountType" && key !== "accountID")
      .some((key) => !allowedFields.includes(key));
    if (hasUnsupportedFields) {
      return res.status(400).json({ message: "Profile contains unsupported fields." });
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No profile fields to update." });
    }

    const existingAccountResult = await query(
      `
        SELECT "userID", ${sqlPersonFullName()} AS "fullName", email, "contactNumber"
        FROM users
        WHERE "userID" = $1
        LIMIT 1
      `,
      [accountID],
    );
    if (existingAccountResult.rows.length === 0) {
      return res.status(404).json({ message: "User account not found." });
    }
    const existingAccount = existingAccountResult.rows[0];
    const linkedPriest = await findPriestLinkedToUser(existingAccount);
    const nextEmail = payloadHasEmailField(payload)
      ? resolveRequestEmail(payload)
      : existingAccount.email;
    const nextPhone = Object.prototype.hasOwnProperty.call(payload, "contactNumber")
      ? String(payload.contactNumber ?? "").trim()
      : existingAccount.contactNumber;
    const contactDetailsChanged =
      normalizeEmail(nextEmail) !== normalizeEmail(existingAccount.email) ||
      normalizeLoginPhone(nextPhone) !== normalizeLoginPhone(existingAccount.contactNumber);
    if (contactDetailsChanged) {
      await assertLoginIdentifiersAvailable({
        email: nextEmail,
        phoneNumber: nextPhone,
        excludeUserID: accountID,
        excludePriestID: linkedPriest?.priestID || null,
      });
    }

    updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    values.push(accountID);

    const result = await query(
      `
        UPDATE users
        SET ${updates.join(", ")}
        WHERE "userID" = $${values.length}
        RETURNING "userID", "firstName", "lastName", ${sqlPersonFullName()} AS "fullName", address, "contactNumber", birthdate, gender, email, "createdAt", "updatedAt", photo
      `,
      values,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User account not found." });
    }
    await syncLinkedPriestIdentifiers(result.rows[0], {
      email: result.rows[0].email,
      phoneNumber: result.rows[0].contactNumber,
      fullName: result.rows[0].fullName,
    });
    return res.json({
      message: "Profile updated successfully.",
      accountType: "user",
      user: sanitizeUser(result.rows[0]),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error.code === "23505") {
      return res.status(409).json({ message: "This Google account or phone number is already in use." });
    }
    console.error("Profile update error:", error);
    return res.status(500).json({ message: "Unable to update profile." });
  }
});

app.patch("/profile/password", async (req, res) => {
  try {
    const accountType = String(req.body?.accountType || "")
      .trim()
      .toLowerCase();
    const accountID = Number(req.body?.accountID);
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!Number.isInteger(accountID) || accountID <= 0) {
      return res.status(400).json({ message: "A valid account ID is required." });
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

    if (accountType === "priest") {
      const priestResult = await query(
        `
          SELECT "priestID", password
          FROM priests
          WHERE "priestID" = $1
          LIMIT 1
        `,
        [accountID],
      );
      if (priestResult.rows.length === 0) {
        return res.status(404).json({ message: "Priest account not found." });
      }

      const foundPriest = priestResult.rows[0];
      const passwordVerification = await verifyPasswordWithAutoUpgrade(currentPassword, foundPriest.password);
      if (!passwordVerification.isValid) {
        return res.status(401).json({ message: "Current password is incorrect." });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await query(
        `
          UPDATE priests
          SET password = $1
          WHERE "priestID" = $2
        `,
        [newPasswordHash, accountID],
      );

      return res.json({
        message: "Password changed successfully.",
        accountType: "priest",
        priestID: accountID,
      });
    }

    if (accountType !== "user") {
      return res.status(400).json({ message: "Main server only supports user and priest profiles. Use admin-server for admin profiles." });
    }

    const accountResult = await query(
      `
        SELECT "userID", email, "contactNumber", password
        FROM users
        WHERE "userID" = $1
        LIMIT 1
      `,
      [accountID],
    );
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: "User account not found." });
    }

    const foundUser = accountResult.rows[0];
    const passwordVerification = await verifyPasswordWithAutoUpgrade(currentPassword, foundUser.password);
    if (!passwordVerification.isValid) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const updatePasswordResult = await query(
      `
        UPDATE users
        SET password = $1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userID" = $2
        RETURNING "userID", "updatedAt"
      `,
      [newPasswordHash, accountID],
    );
    const linkedPriest = await findPriestLinkedToUser(foundUser);
    if (linkedPriest) {
      await query(
        `
          UPDATE priests
          SET password = $1
          WHERE "priestID" = $2
        `,
        [newPasswordHash, linkedPriest.priestID],
      );
    }
    if (updatePasswordResult.rows.length === 0) {
      return res.status(404).json({ message: "User account not found." });
    }

    return res.json({
      message: "Password changed successfully.",
      accountType: "user",
      userID: updatePasswordResult.rows[0].userID,
      updatedAt: updatePasswordResult.rows[0].updatedAt,
    });
  } catch (error) {
    console.error("Profile password update error:", error);
    return res.status(500).json({ message: "Unable to change password." });
  }
});

app.post("/profile/photo", (req, res, next) => {
  profilePhotoUpload.single("photo")(req, res, (error) => {
    if (!error) return next();
    if (error?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Image size must be 5MB or smaller." });
    }
    if (error?.message === "Only image uploads are allowed.") {
      return res.status(400).json({ message: error.message });
    }
    console.error("Profile photo upload error:", error);
    return res.status(500).json({ message: "Unable to upload profile photo." });
  });
}, async (req, res) => {
  const accountType = String(req.body?.accountType || "")
    .trim()
    .toLowerCase();
  const storedUploadPath = req.file
    ? `${getProfilePhotoPublicBasePath(accountType)}${req.file.filename}`
    : "";
  const cleanupUploadedPhotoIfPresent = async () => {
    if (!req.file?.filename) return;
    await deleteStoredProfilePhotoIfExists(storedUploadPath, accountType);
  };

  try {
    const accountID = Number(req.body?.accountID);
    if (accountType !== "user" && accountType !== "priest") {
      await cleanupUploadedPhotoIfPresent();
      return res.status(400).json({ message: "This endpoint only supports parishioner and priest profile photos." });
    }
    if (!Number.isInteger(accountID) || accountID <= 0) {
      await cleanupUploadedPhotoIfPresent();
      return res.status(400).json({ message: "A valid account ID is required." });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Photo file is required." });
    }

    if (accountType === "priest") {
      const existingPriestResult = await query(
        `
          SELECT "priestID", photo
          FROM priests
          WHERE "priestID" = $1
        `,
        [accountID],
      );
      if (existingPriestResult.rows.length === 0) {
        await cleanupUploadedPhotoIfPresent();
        return res.status(404).json({ message: "Priest account not found." });
      }

      const previousPhotoPath = existingPriestResult.rows[0].photo || null;
      const nextPhotoPath = await storeProfilePhoto(req.file, "priest");
      const updateResult = await query(
        `
          UPDATE priests
          SET photo = $1
          WHERE "priestID" = $2
          RETURNING "priestID", "fullName", "adminID", email, "phoneNumber", "clergyType", "religiousOrderCode", "isActive", photo
        `,
        [nextPhotoPath, accountID],
      );
      if (updateResult.rows.length === 0) {
        await cleanupUploadedPhotoIfPresent();
        return res.status(404).json({ message: "Priest account not found." });
      }
      if (previousPhotoPath && getProfilePhotoFileName(previousPhotoPath) !== path.basename(nextPhotoPath)) {
        await deleteStoredProfilePhotoIfExists(previousPhotoPath, "priest");
      }

      return res.status(201).json({
        message: "Profile photo uploaded successfully.",
        accountType: "priest",
        photo: nextPhotoPath,
        user: sanitizePriestSession(updateResult.rows[0]),
      });
    }

    const existingAccountResult = await query(
      `
        SELECT "userID", photo
        FROM users
        WHERE "userID" = $1
      `,
      [accountID],
    );
    if (existingAccountResult.rows.length === 0) {
      await cleanupUploadedPhotoIfPresent();
      return res.status(404).json({ message: "User account not found." });
    }

    const previousPhotoPath = existingAccountResult.rows[0].photo || null;
    const nextPhotoPath = await storeProfilePhoto(req.file, "user");
    const updateResult = await query(
      `
        UPDATE users
        SET photo = $1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userID" = $2
        RETURNING "userID", "firstName", "lastName", ${sqlPersonFullName()} AS "fullName", address, "contactNumber", birthdate, gender, email, "createdAt", "updatedAt", photo
      `,
      [nextPhotoPath, accountID],
    );
    if (updateResult.rows.length === 0) {
      await cleanupUploadedPhotoIfPresent();
      return res.status(404).json({ message: "User account not found." });
    }
    if (previousPhotoPath && getProfilePhotoFileName(previousPhotoPath) !== path.basename(nextPhotoPath)) {
      await deleteStoredProfilePhotoIfExists(previousPhotoPath, "user");
    }

    return res.status(201).json({
      message: "Profile photo uploaded successfully.",
      accountType: "user",
      photo: nextPhotoPath,
      user: sanitizeUser(updateResult.rows[0]),
    });
  } catch (error) {
    if (error?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Image size must be 5MB or smaller." });
    }
    if (error?.message === "Only image uploads are allowed.") {
      return res.status(400).json({ message: error.message });
    }
    try {
      await cleanupUploadedPhotoIfPresent();
    } catch (cleanupError) {
      console.error("Profile photo cleanup error:", cleanupError);
    }
    console.error("Profile photo upload error:", error);
    return res.status(500).json({ message: "Unable to upload profile photo." });
  }
});

app.post("/mail/password-reset", async (req, res) => {
  try {
    if (!isTrustedLocalMailRequest(req)) {
      return res.status(403).json({ message: "This mail endpoint is only available to the parish servers." });
    }
    const email = normalizeEmail(req.body?.email || req.body?.to || "");
    const fullName = String(req.body?.fullName || "").trim();
    const accountType = String(req.body?.accountType || "admin").trim().toLowerCase();
    const temporaryPassword = String(req.body?.temporaryPassword || "").trim();
    const loginHint = String(req.body?.loginHint || "").trim();
    const phoneNumber = String(req.body?.phoneNumber || "").trim();
    const deliveryMethod = String(req.body?.deliveryMethod || "email").trim().toLowerCase();
    if (deliveryMethod === "email" && !isGmailAddress(email)) {
      return res.status(400).json({ message: "A Gmail address is required to send the new password." });
    }
    if (deliveryMethod === "sms" && !normalizeLoginPhone(phoneNumber)) {
      return res.status(400).json({ message: "A valid phone number is required to send the new password by SMS." });
    }
    if (temporaryPassword.length < 6) {
      return res.status(400).json({ message: "A generated password is required." });
    }
    const sentBy = await sendFaithflowPasswordReset({
      email,
      fullName,
      accountType,
      temporaryPassword,
      loginHint,
      phoneNumber,
      deliveryMethod,
    });
    return res.json({
      message: sentBy === "sms" ? "Password SMS accepted for delivery." : "Password email sent.",
      deliveryMethod: sentBy,
    });
  } catch (error) {
    console.error("Internal password reset email error:", error);
    return res.status(500).json({ message: error.message || "Unable to send the password email." });
  }
});

app.post("/forgot-password", async (req, res) => {
  try {
    const credential = String(req.body?.email || req.body?.userName || req.body?.username || "").trim();
    if (!credential) {
      return res.status(400).json({ message: "Enter the Gmail address or phone number used to create this account." });
    }
    const deliveryMethod = EMAIL_INPUT_REGEX.test(credential)
      ? "email"
      : normalizeLoginPhone(credential)
        ? "sms"
        : "email";

    const foundPriest = await findPriestByLoginCredential(credential);
    const foundUser = foundPriest ? null : await findUserByLoginCredential(credential);
    const foundAdminResult =
      !foundPriest && !foundUser && deliveryMethod === "email" && EMAIL_INPUT_REGEX.test(credential)
        ? await adminQuery(
            `
              SELECT "adminID", "fullName", email
              FROM admin
              WHERE "adminID" = 1 AND LOWER(email) = $1
              LIMIT 1
            `,
            [normalizeEmail(credential)],
          )
        : null;
    const foundAdmin = foundAdminResult?.rows[0] || null;
    const account = foundPriest
      ? {
          accountType: "priest",
          accountID: Number(foundPriest.priestID),
          fullName: foundPriest.fullName,
          email: normalizeEmail(foundPriest.email),
          phoneNumber: String(foundPriest.phoneNumber || "").trim(),
          loginHint: String(foundPriest.email || foundPriest.phoneNumber || credential).trim(),
          isActive: foundPriest.isActive !== false,
        }
      : foundUser
        ? {
            accountType: "user",
            accountID: Number(foundUser.userID),
            fullName: foundUser.fullName,
            email: normalizeEmail(foundUser.email),
            phoneNumber: String(foundUser.contactNumber || "").trim(),
            loginHint: String(foundUser.email || foundUser.contactNumber || credential).trim(),
            isActive: true,
          }
        : foundAdmin
          ? {
              accountType: "admin",
              accountID: Number(foundAdmin.adminID),
              fullName: foundAdmin.fullName,
              email: normalizeEmail(foundAdmin.email),
              phoneNumber: "",
              loginHint: normalizeEmail(foundAdmin.email),
              isActive: true,
            }
          : null;

    if (!account) {
      return res.status(404).json({ message: "No Faithflow account matches that Gmail address or phone number." });
    }
    if (account.accountType === "priest" && account.isActive === false) {
      return res.status(403).json({ message: "This priest account is inactive. Please contact the parish secretary." });
    }
    if (deliveryMethod === "email" && !isGmailAddress(account.email)) {
      return res.status(400).json({
        message: "This account does not have a Gmail address on file, so a new password cannot be emailed.",
      });
    }
    if (deliveryMethod === "sms" && !normalizeLoginPhone(account.phoneNumber)) {
      return res.status(400).json({
        message: "This account does not have a valid phone number on file, so a new password cannot be sent by SMS.",
      });
    }

    const resetKey = account.email || normalizeLoginPhone(account.phoneNumber);
    await assertForgotPasswordLimit({
      email: resetKey,
      accountType: account.accountType,
      accountID: account.accountID,
    });
    try {
      const temporaryPassword = generateTemporaryPassword(account.accountType === "admin" ? 20 : 10);
      await sendFaithflowPasswordReset({
        email: account.email,
        fullName: account.fullName,
        accountType: account.accountType,
        temporaryPassword,
        loginHint: account.loginHint,
        phoneNumber: account.phoneNumber,
        deliveryMethod,
      });
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      if (account.accountType === "priest") {
        await query(`UPDATE priests SET password = $1 WHERE "priestID" = $2`, [passwordHash, account.accountID]);
      } else if (account.accountType === "admin") {
        const updateResult = await adminQuery(`UPDATE admin SET password = $1 WHERE "adminID" = $2`, [
          passwordHash,
          account.accountID,
        ]);
        if (updateResult.rowCount !== 1) {
          throw new Error("Admin account not found; the password was not changed.");
        }
      } else {
        await query(`UPDATE users SET password = $1, "updatedAt" = NOW() WHERE "userID" = $2`, [
          passwordHash,
          account.accountID,
        ]);
      }
      await recordForgotPasswordRequest({
        email: resetKey,
        accountType: account.accountType,
        accountID: account.accountID,
      });
    } finally {
      releaseForgotPasswordLock(account.accountType, account.accountID);
    }
    return res.json({
      message: deliveryMethod === "sms"
        ? "The SMS service accepted your password message for delivery. Your carrier may take a little time to deliver it."
        : "Your new password was sent to your registered Gmail account.",
      deliveryMethod,
    });
  } catch (error) {
    const status = Number(error?.status);
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      return res.status(status).json({ message: error.message });
    }
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: error.message || "Unable to send a new password right now." });
  }
});

app.post("/login", async (req, res) => {
  try {
    const credential = String(req.body?.email || req.body?.userName || req.body?.username || "").trim();
    const passwordRaw = String(req.body?.password || "");

    if (!credential || !passwordRaw.trim()) {
      return res.status(400).json({ message: "Google account or phone number and password are required." });
    }

    let foundUser = await findUserByLoginCredential(credential);
    let linkedPriest = await findPriestByLoginCredential(credential);

    if (linkedPriest) {
      const passwordVerification = await verifyPasswordWithAutoUpgrade(passwordRaw, linkedPriest.password);
      if (!passwordVerification.isValid) {
        return res.status(401).json({ message: "Invalid username or password." });
      }
      if (passwordVerification.upgradedHash) {
        await query(
          `
            UPDATE priests
            SET password = $1
            WHERE "priestID" = $2
          `,
          [passwordVerification.upgradedHash, linkedPriest.priestID],
        );
        linkedPriest.password = passwordVerification.upgradedHash;
      }
      if (linkedPriest.isActive === false) {
        return res.status(403).json({ message: "Priest account is inactive. Please contact the parish secretary." });
      }

      const token = crypto.randomBytes(24).toString("hex");
      const userPayload = {
        ...sanitizePriestSession(linkedPriest),
        accountType: "priest",
      };
      return res.json({
        message: "Login successful.",
        token,
        accountType: "priest",
        user: userPayload,
      });
    }

    if (foundUser) {
      const passwordVerification = await verifyPasswordWithAutoUpgrade(passwordRaw, foundUser.password);
      if (!passwordVerification.isValid) {
        return res.status(401).json({ message: "Invalid username or password." });
      }
      if (passwordVerification.upgradedHash) {
        await query(
          `
            UPDATE users
            SET password = $1
            WHERE "userID" = $2
          `,
          [passwordVerification.upgradedHash, foundUser.userID],
        );
        foundUser.password = passwordVerification.upgradedHash;
      }
      if (!linkedPriest) {
        linkedPriest = await findPriestLinkedToUser(foundUser);
      }
    } else {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    if (!foundUser) {
      return res.status(401).json({ message: "Invalid username or password." });
    }
    if (linkedPriest && linkedPriest.isActive === false) {
      return res.status(403).json({ message: "Priest account is inactive. Please contact the parish secretary." });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const accountType = linkedPriest ? "priest" : "user";
    const userPayload = linkedPriest
      ? {
          ...sanitizeUser(foundUser),
          priestID: Number(linkedPriest.priestID),
          priestAdminID: Number(linkedPriest.adminID),
          priestEmail: String(linkedPriest.email || foundUser.email || "").trim() || null,
          photo: linkedPriest.photo || foundUser.photo || null,
          accountType: "priest",
        }
      : sanitizeUser(foundUser);
    return res.json({
      message: "Login successful.",
      token,
      accountType,
      user: userPayload,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Unable to log in right now." });
  }
});

const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Faithflow user server listening on http://localhost:${PORT}`);
    });
    startDueAppointmentHistorySweep();
  } catch (error) {
    console.error("Failed to start user server:", error);
    await pool.end();
    process.exit(1);
  }
};

startServer();