import { ALLOWED_COLOR_PRESET_IDS } from "./colorPresets";

export const SETTINGS_STORAGE_KEY = "faithflow_user_settings";
export const SETTINGS_UPDATED_EVENT = "faithflow:settings-updated";
export const THEME_SETTINGS_UPDATED_EVENT = "faithflow:theme-settings-updated";
export const GLOBAL_THEME_SETTINGS_KEY = "faithflow_global_theme_settings";

export const DEFAULT_USER_SETTINGS = {
  language: "en",
  appTheme: "system",
  timezone: "Asia/Manila",
  dateFormat: "MMMM D, YYYY",
  textStyle: "poppins",
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: true,
  requestStatusAlerts: true,
  weeklyDigest: false,
  appointmentReminderDays: "3",
  quietHours: "off",
  showProfilePhoto: true,
  showBirthdate: false,
  compactDashboardCards: false,
  primaryColor: "#6D1022",
  secondaryColor: "#FFFFFF",
  thirdColor: "#9C2B3E",
  backgroundColor: "#F8F5F4",
  containerColor: "#FFFFFF",
  backgroundStyle: "solid",
  designStyle: "classic",
  colorPreset: "maroon-white",
  pdfPrintStyle: "parish",
  pdfHeaderAlign: "left",
  pdfHeaderRule: "single",
  pdfDensity: "standard",
  pdfTableStyle: "open",
  pdfLogoShape: "square",
  pdfLogoBorder: "border",
  pdfChurchLogo: "",
  pdfReportTitle: "Faithflow Parish Report",
  pdfSubtitle: "Sacramental Services & Certificate Requests",
  pdfFooterNote: "Prepared through Faithflow",
  pdfShowLogo: true,
  pdfShowParishName: true,
  pdfShowAddress: true,
  pdfShowGenerated: true,
  pdfShowPeriod: true,
  pdfShowRecordCount: true,
  pdfShowType: true,
  pdfShowStatus: true,
  pdfShowPayment: true,
  pdfShowSort: true,
  pdfShowUserId: true,
  pdfShowPersonName: true,
  pdfShowAppointmentType: true,
  pdfShowAppointmentStatus: true,
  pdfShowPaymentStatus: true,
  pdfShowReceiptNumber: true,
  pdfShowPaymentDate: true,
  pdfShowFooter: true,
};

export const PDF_PRINT_STYLES = [
  {
    id: "parish",
    label: "Parish",
    description: "Official letterhead with the parish name and logo.",
  },
  {
    id: "classic",
    label: "Classic",
    description: "Centered black-and-white parish register.",
  },
  {
    id: "compact",
    label: "Compact",
    description: "Dense ledger so more records fit on each page.",
  },
];

const ALLOWED_LANGUAGES = new Set(["en", "fil", "ceb"]);
const ALLOWED_THEMES = new Set(["system", "light", "dark"]);
const ALLOWED_TIMEZONES = new Set(["Asia/Manila", "UTC", "America/New_York"]);
const ALLOWED_DATE_FORMATS = new Set(["MMMM D, YYYY", "DD/MM/YYYY", "MM/DD/YYYY"]);
const ALLOWED_TEXT_STYLES = new Set([
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

export const TEXT_STYLE_OPTIONS = [
  { id: "poppins", label: "Default", fontFamily: '"Poppins", Arial, sans-serif' },
  { id: "inter", label: "Inter", fontFamily: '"Inter", Arial, sans-serif' },
  { id: "nunito", label: "Nunito", fontFamily: '"Nunito", Arial, sans-serif' },
  { id: "lato", label: "Lato", fontFamily: '"Lato", Arial, sans-serif' },
  { id: "montserrat", label: "Montserrat", fontFamily: '"Montserrat", Arial, sans-serif' },
  { id: "georgia", label: "Georgia", fontFamily: 'Georgia, "Times New Roman", serif' },
  { id: "merriweather", label: "Merriweather", fontFamily: '"Merriweather", Georgia, serif' },
  { id: "lora", label: "Lora", fontFamily: '"Lora", Georgia, serif' },
  { id: "source-serif", label: "Source Serif", fontFamily: '"Source Serif 4", Georgia, serif' },
  { id: "cinzel", label: "Cinzel", fontFamily: '"Cinzel", Georgia, serif' },
];

const textStyleFontFamily = (textStyle) =>
  TEXT_STYLE_OPTIONS.find((option) => option.id === textStyle)?.fontFamily || TEXT_STYLE_OPTIONS[0].fontFamily;
const ALLOWED_REMINDER_DAYS = new Set(["1", "3", "7"]);
const ALLOWED_QUIET_HOURS = new Set(["off", "9pm-6am", "10pm-7am"]);
const ALLOWED_BACKGROUND_STYLES = new Set(["solid", "gradient", "soft-pattern"]);
const ALLOWED_DESIGN_STYLES = new Set(["classic", "modern", "soft"]);
const ALLOWED_COLOR_PRESETS = ALLOWED_COLOR_PRESET_IDS;
const ALLOWED_PDF_PRINT_STYLES = new Set(PDF_PRINT_STYLES.map((style) => style.id));
const ALLOWED_PDF_HEADER_ALIGNS = new Set(["left", "center"]);
const ALLOWED_PDF_HEADER_RULES = new Set(["single", "double"]);
const ALLOWED_PDF_DENSITIES = new Set(["standard", "compact"]);
const ALLOWED_PDF_TABLE_STYLES = new Set(["open", "grid"]);
const ALLOWED_PDF_LOGO_SHAPES = new Set(["square", "oval"]);
const ALLOWED_PDF_LOGO_BORDERS = new Set(["border", "none"]);

const legacyPdfLayout = (style) => {
  if (style === "classic") {
    return { pdfHeaderAlign: "center", pdfHeaderRule: "double", pdfDensity: "standard", pdfTableStyle: "grid" };
  }
  if (style === "compact") {
    return { pdfHeaderAlign: "left", pdfHeaderRule: "single", pdfDensity: "compact", pdfTableStyle: "open" };
  }
  return { pdfHeaderAlign: "left", pdfHeaderRule: "single", pdfDensity: "standard", pdfTableStyle: "open" };
};

const pickPdfChoice = (value, allowed, fallback) => (allowed.has(String(value)) ? String(value) : fallback);

const THEME_SETTING_KEYS = [
  "appTheme",
  "colorPreset",
  "primaryColor",
  "secondaryColor",
  "thirdColor",
  "backgroundColor",
  "containerColor",
  "backgroundStyle",
  "designStyle",
];

const isValidHexColor = (value) => /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());

const sanitizePdfText = (value, fallback, maxLength) => {
  if (value === undefined || value === null) return fallback;
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
};

const sanitizePdfLogo = (value) => {
  const normalized = String(value || "").trim();
  if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(normalized)) return "";
  if (normalized.length > 500000) return "";
  return normalized;
};

const readPdfFlag = (value) => value !== false;

const hexToRgbChannels = (value, fallback = "110, 20, 35") => {
  const normalized = String(value || "").trim().replace("#", "");
  if (normalized.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `${red}, ${green}, ${blue}`;
};

const sanitizeColor = (value, fallback) => {
  const normalized = String(value || "").trim();
  return isValidHexColor(normalized) ? normalized : fallback;
};

const parseJsonSafely = (rawValue) => {
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
};

export const parseStoredSettings = () => {
  const rawValue = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!rawValue) {
    return { ...DEFAULT_USER_SETTINGS };
  }
  try {
    const parsed = JSON.parse(rawValue);
    return {
      language: ALLOWED_LANGUAGES.has(String(parsed?.language)) ? String(parsed.language) : DEFAULT_USER_SETTINGS.language,
      appTheme: ALLOWED_THEMES.has(String(parsed?.appTheme)) ? String(parsed.appTheme) : DEFAULT_USER_SETTINGS.appTheme,
      timezone: ALLOWED_TIMEZONES.has(String(parsed?.timezone)) ? String(parsed.timezone) : DEFAULT_USER_SETTINGS.timezone,
      dateFormat: ALLOWED_DATE_FORMATS.has(String(parsed?.dateFormat)) ? String(parsed.dateFormat) : DEFAULT_USER_SETTINGS.dateFormat,
      textStyle: ALLOWED_TEXT_STYLES.has(String(parsed?.textStyle)) ? String(parsed.textStyle) : DEFAULT_USER_SETTINGS.textStyle,
      emailNotifications: Boolean(parsed?.emailNotifications),
      smsNotifications: Boolean(parsed?.smsNotifications),
      pushNotifications: parsed?.pushNotifications !== false,
      requestStatusAlerts: parsed?.requestStatusAlerts !== false,
      weeklyDigest: Boolean(parsed?.weeklyDigest),
      appointmentReminderDays: ALLOWED_REMINDER_DAYS.has(String(parsed?.appointmentReminderDays))
        ? String(parsed.appointmentReminderDays)
        : DEFAULT_USER_SETTINGS.appointmentReminderDays,
      quietHours: ALLOWED_QUIET_HOURS.has(String(parsed?.quietHours)) ? String(parsed.quietHours) : DEFAULT_USER_SETTINGS.quietHours,
      showProfilePhoto: parsed?.showProfilePhoto !== false,
      showBirthdate: Boolean(parsed?.showBirthdate),
      compactDashboardCards: Boolean(parsed?.compactDashboardCards),
      primaryColor: sanitizeColor(parsed?.primaryColor, DEFAULT_USER_SETTINGS.primaryColor),
      secondaryColor: sanitizeColor(parsed?.secondaryColor, DEFAULT_USER_SETTINGS.secondaryColor),
      thirdColor: sanitizeColor(parsed?.thirdColor, DEFAULT_USER_SETTINGS.thirdColor),
      backgroundColor: sanitizeColor(parsed?.backgroundColor, DEFAULT_USER_SETTINGS.backgroundColor),
      containerColor: sanitizeColor(parsed?.containerColor, DEFAULT_USER_SETTINGS.containerColor),
      backgroundStyle: ALLOWED_BACKGROUND_STYLES.has(String(parsed?.backgroundStyle))
        ? String(parsed.backgroundStyle)
        : DEFAULT_USER_SETTINGS.backgroundStyle,
      designStyle: ALLOWED_DESIGN_STYLES.has(String(parsed?.designStyle))
        ? String(parsed.designStyle)
        : DEFAULT_USER_SETTINGS.designStyle,
      colorPreset: ALLOWED_COLOR_PRESETS.has(String(parsed?.colorPreset))
        ? String(parsed.colorPreset)
        : DEFAULT_USER_SETTINGS.colorPreset,
      pdfPrintStyle: ALLOWED_PDF_PRINT_STYLES.has(String(parsed?.pdfPrintStyle))
        ? String(parsed.pdfPrintStyle)
        : DEFAULT_USER_SETTINGS.pdfPrintStyle,
      pdfHeaderAlign: pickPdfChoice(
        parsed?.pdfHeaderAlign,
        ALLOWED_PDF_HEADER_ALIGNS,
        legacyPdfLayout(
          ALLOWED_PDF_PRINT_STYLES.has(String(parsed?.pdfPrintStyle)) ? String(parsed.pdfPrintStyle) : DEFAULT_USER_SETTINGS.pdfPrintStyle,
        ).pdfHeaderAlign,
      ),
      pdfHeaderRule: pickPdfChoice(
        parsed?.pdfHeaderRule,
        ALLOWED_PDF_HEADER_RULES,
        legacyPdfLayout(
          ALLOWED_PDF_PRINT_STYLES.has(String(parsed?.pdfPrintStyle)) ? String(parsed.pdfPrintStyle) : DEFAULT_USER_SETTINGS.pdfPrintStyle,
        ).pdfHeaderRule,
      ),
      pdfDensity: pickPdfChoice(
        parsed?.pdfDensity,
        ALLOWED_PDF_DENSITIES,
        legacyPdfLayout(
          ALLOWED_PDF_PRINT_STYLES.has(String(parsed?.pdfPrintStyle)) ? String(parsed.pdfPrintStyle) : DEFAULT_USER_SETTINGS.pdfPrintStyle,
        ).pdfDensity,
      ),
      pdfTableStyle: pickPdfChoice(
        parsed?.pdfTableStyle,
        ALLOWED_PDF_TABLE_STYLES,
        legacyPdfLayout(
          ALLOWED_PDF_PRINT_STYLES.has(String(parsed?.pdfPrintStyle)) ? String(parsed.pdfPrintStyle) : DEFAULT_USER_SETTINGS.pdfPrintStyle,
        ).pdfTableStyle,
      ),
      pdfLogoShape: pickPdfChoice(parsed?.pdfLogoShape, ALLOWED_PDF_LOGO_SHAPES, DEFAULT_USER_SETTINGS.pdfLogoShape),
      pdfLogoBorder: pickPdfChoice(parsed?.pdfLogoBorder, ALLOWED_PDF_LOGO_BORDERS, DEFAULT_USER_SETTINGS.pdfLogoBorder),
      pdfChurchLogo: sanitizePdfLogo(parsed?.pdfChurchLogo),
      pdfReportTitle: sanitizePdfText(parsed?.pdfReportTitle, DEFAULT_USER_SETTINGS.pdfReportTitle, 80),
      pdfSubtitle: sanitizePdfText(parsed?.pdfSubtitle, DEFAULT_USER_SETTINGS.pdfSubtitle, 120),
      pdfFooterNote: sanitizePdfText(parsed?.pdfFooterNote, DEFAULT_USER_SETTINGS.pdfFooterNote, 120),
      pdfShowLogo: readPdfFlag(parsed?.pdfShowLogo),
      pdfShowParishName: readPdfFlag(parsed?.pdfShowParishName),
      pdfShowAddress: readPdfFlag(parsed?.pdfShowAddress),
      pdfShowGenerated: readPdfFlag(parsed?.pdfShowGenerated),
      pdfShowPeriod: readPdfFlag(parsed?.pdfShowPeriod),
      pdfShowRecordCount: readPdfFlag(parsed?.pdfShowRecordCount),
      pdfShowType: readPdfFlag(parsed?.pdfShowType),
      pdfShowStatus: readPdfFlag(parsed?.pdfShowStatus),
      pdfShowPayment: readPdfFlag(parsed?.pdfShowPayment),
      pdfShowSort: readPdfFlag(parsed?.pdfShowSort),
      pdfShowUserId: readPdfFlag(parsed?.pdfShowUserId),
      pdfShowPersonName: readPdfFlag(parsed?.pdfShowPersonName),
      pdfShowAppointmentType: readPdfFlag(parsed?.pdfShowAppointmentType),
      pdfShowAppointmentStatus: readPdfFlag(parsed?.pdfShowAppointmentStatus),
      pdfShowPaymentStatus: readPdfFlag(parsed?.pdfShowPaymentStatus),
      pdfShowReceiptNumber: readPdfFlag(parsed?.pdfShowReceiptNumber),
      pdfShowPaymentDate: readPdfFlag(parsed?.pdfShowPaymentDate),
      pdfShowFooter: readPdfFlag(parsed?.pdfShowFooter),
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
};

export const extractThemeSettings = (settingsInput) => {
  const settings = settingsInput || {};
  return {
    appTheme: ALLOWED_THEMES.has(String(settings.appTheme)) ? String(settings.appTheme) : DEFAULT_USER_SETTINGS.appTheme,
    colorPreset: ALLOWED_COLOR_PRESETS.has(String(settings.colorPreset)) ? String(settings.colorPreset) : DEFAULT_USER_SETTINGS.colorPreset,
    primaryColor: sanitizeColor(settings.primaryColor, DEFAULT_USER_SETTINGS.primaryColor),
    secondaryColor: sanitizeColor(settings.secondaryColor, DEFAULT_USER_SETTINGS.secondaryColor),
    thirdColor: sanitizeColor(settings.thirdColor, DEFAULT_USER_SETTINGS.thirdColor),
    backgroundColor: sanitizeColor(settings.backgroundColor, DEFAULT_USER_SETTINGS.backgroundColor),
    containerColor: sanitizeColor(settings.containerColor, DEFAULT_USER_SETTINGS.containerColor),
    backgroundStyle: ALLOWED_BACKGROUND_STYLES.has(String(settings.backgroundStyle))
      ? String(settings.backgroundStyle)
      : DEFAULT_USER_SETTINGS.backgroundStyle,
    designStyle: ALLOWED_DESIGN_STYLES.has(String(settings.designStyle))
      ? String(settings.designStyle)
      : DEFAULT_USER_SETTINGS.designStyle,
  };
};

export const withThemeSettings = (settingsInput, themeSettingsInput) => ({
  ...(settingsInput || {}),
  ...extractThemeSettings(themeSettingsInput),
});

export const clearThemeSettingsFromObject = (settingsInput) => {
  const nextSettings = { ...(settingsInput || {}) };
  for (const key of THEME_SETTING_KEYS) {
    delete nextSettings[key];
  }
  return nextSettings;
};

export const getStoredGlobalThemeSettings = () => {
  const rawValue = localStorage.getItem(GLOBAL_THEME_SETTINGS_KEY);
  if (!rawValue) return extractThemeSettings(DEFAULT_USER_SETTINGS);
  return extractThemeSettings(parseJsonSafely(rawValue) || {});
};

export const setStoredGlobalThemeSettings = (themeSettingsInput) => {
  const sanitizedTheme = extractThemeSettings(themeSettingsInput);
  localStorage.setItem(GLOBAL_THEME_SETTINGS_KEY, JSON.stringify(sanitizedTheme));
  window.dispatchEvent(
    new CustomEvent(THEME_SETTINGS_UPDATED_EVENT, {
      detail: { themeSettings: sanitizedTheme },
    }),
  );
  return sanitizedTheme;
};

export const fetchGlobalThemeSettings = async () => {
  const response = await fetch("/api/settings/theme", { cache: "no-store" });
  const responseData = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseData?.message || "Unable to load global theme settings.");
  }
  return extractThemeSettings(responseData?.themeSettings || {});
};

export const saveGlobalThemeSettings = async (themeSettingsInput, options = {}) => {
  const sanitizedTheme = extractThemeSettings(themeSettingsInput);
  const response = await fetch("/api/settings/theme", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adminID: options?.adminID ?? null,
      themeSettings: sanitizedTheme,
    }),
  });
  const responseData = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseData?.message || "Unable to save global theme settings.");
  }
  return extractThemeSettings(responseData?.themeSettings || sanitizedTheme);
};

const resolveThemeMode = (appTheme) => {
  if (appTheme === "dark") return "dark";
  if (appTheme === "light") return "light";
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
};

export const applyAppSettings = (settingsInput) => {
  const settings = {
    ...DEFAULT_USER_SETTINGS,
    ...(settingsInput || {}),
  };
  const root = document.documentElement;
  const body = document.body;
  const resolvedTheme = resolveThemeMode(settings.appTheme);

  root.lang = settings.language || "en";
  root.dataset.faithflowTheme = resolvedTheme;
  root.dataset.faithflowAppTheme = settings.appTheme;
  root.dataset.faithflowBackground = settings.backgroundStyle;
  root.dataset.faithflowDesign = settings.designStyle;
  root.style.colorScheme = resolvedTheme;

  root.style.setProperty("--ff-primary", settings.primaryColor);
  root.style.setProperty("--ff-secondary", settings.secondaryColor);
  root.style.setProperty("--ff-third", settings.thirdColor);
  root.style.setProperty("--ff-primary-rgb", hexToRgbChannels(settings.primaryColor, "110, 20, 35"));
  root.style.setProperty("--ff-secondary-rgb", hexToRgbChannels(settings.secondaryColor, "247, 241, 232"));
  root.style.setProperty("--ff-third-rgb", hexToRgbChannels(settings.thirdColor, "184, 149, 106"));
  // Inline values would beat the :root[data-faithflow-theme="dark"] palette in index.css.
  if (resolvedTheme === "dark") {
    root.style.removeProperty("--ff-background");
    root.style.removeProperty("--ff-container");
    root.style.removeProperty("--ff-container-rgb");
  } else {
    root.style.setProperty("--ff-background", settings.backgroundColor);
    root.style.setProperty("--ff-container", settings.containerColor);
    root.style.setProperty("--ff-container-rgb", hexToRgbChannels(settings.containerColor, "255, 248, 241"));
  }
  root.dataset.faithflowColorPreset = settings.colorPreset || DEFAULT_USER_SETTINGS.colorPreset;
  root.dataset.faithflowTextStyle = settings.textStyle || DEFAULT_USER_SETTINGS.textStyle;
  root.style.setProperty("--ff-font-family", textStyleFontFamily(settings.textStyle));

  if (body) {
    body.dataset.faithflowTheme = resolvedTheme;
    body.dataset.faithflowAppTheme = settings.appTheme;
    body.dataset.faithflowBackground = settings.backgroundStyle;
    body.dataset.faithflowDesign = settings.designStyle;
  }
};

export const readSignedInTextStyleAccount = () => {
  const raw = localStorage.getItem("faithflow_auth") || sessionStorage.getItem("faithflow_auth");
  if (!raw) return null;
  try {
    const auth = JSON.parse(raw);
    const accountType = String(auth?.accountType || "").trim().toLowerCase();
    const accountID = Number(accountType === "priest" ? auth?.user?.priestID : auth?.user?.userID);
    if (!["user", "priest"].includes(accountType) || !Number.isInteger(accountID) || accountID <= 0) return null;
    return { accountType, accountID };
  } catch {
    return null;
  }
};

export const fetchAccountTextStyle = async (account) => {
  const params = new URLSearchParams({
    accountType: account.accountType,
    accountID: String(account.accountID),
  });
  const response = await fetch(`/api/settings/text-style?${params.toString()}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Unable to load text style.");
  }
  return ALLOWED_TEXT_STYLES.has(String(data?.textStyle)) ? String(data.textStyle) : "poppins";
};

export const saveAccountTextStyle = async (account, textStyle) => {
  const response = await fetch("/api/settings/text-style", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountType: account.accountType,
      accountID: account.accountID,
      textStyle,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Unable to save text style.");
  }
  return ALLOWED_TEXT_STYLES.has(String(data?.textStyle)) ? String(data.textStyle) : "poppins";
};

export const saveAppSettings = (nextSettings) => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  applyAppSettings(nextSettings);
  window.dispatchEvent(
    new CustomEvent(SETTINGS_UPDATED_EVENT, {
      detail: { settings: nextSettings },
    }),
  );
};

let removeSystemThemeSync = null;

export const initializeSystemThemeSync = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  if (typeof removeSystemThemeSync === "function") {
    removeSystemThemeSync();
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemThemeChange = () => {
    const currentSettings = parseStoredSettings();
    if (currentSettings.appTheme === "system") {
      applyAppSettings(currentSettings);
    }
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleSystemThemeChange);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(handleSystemThemeChange);
  }

  removeSystemThemeSync = () => {
    if (typeof mediaQuery.removeEventListener === "function") {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    } else if (typeof mediaQuery.removeListener === "function") {
      mediaQuery.removeListener(handleSystemThemeChange);
    }
    removeSystemThemeSync = null;
  };

  return removeSystemThemeSync;
};
