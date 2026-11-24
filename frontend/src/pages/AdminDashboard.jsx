import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Cross,
  Droplets,
  FileText,
  Home,
  Inbox,
  Image as ImageIcon,
  Info,
  Megaphone,
  MessageSquareText,
  Pencil,
  Plus,
  Printer,
  Quote,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import PageGuide from "../components/PageGuide";
import PaymentPreview, { formatPeso, toFeeAmount } from "../components/PaymentPreview";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import DashboardWelcomeHeader from "../components/DashboardWelcomeHeader";
import ParishActivityMediaCarousel from "../components/ParishActivityMediaCarousel";
import CalendarDayAgenda from "../components/CalendarDayAgenda";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { addPendingRequest } from "../utils/appointmentRequestStorage";
import { pushUiNotice } from "../utils/uiNotice";
import { compareParishActivitiesNewestFirst } from "../utils/parishActivityOrder";
import {
  DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG,
  getRequirementItems,
  getSacramentSchemaByName,
  normalizeSacramentFormSchemaConfig,
} from "../utils/sacramentFormSchemas";
import ListInput, { createDefaultListValue } from "../components/ListInput";
import {
  formatListForDisplay,
  parseListFieldConfig,
  sanitizeListForSubmission,
  validateListValue,
} from "../utils/listField";
import "../components/ListInput.css";
import "../components/Header.css";
import "../components/Sidebar.css";
import { subscribeNotificationStream } from "../utils/notificationStream";
import { resolveParishAdminID } from "../utils/parishContext";
import {
  expandScheduleBusyRanges,
  formatCalendarWeekday,
  formatEventDateTimeLabel,
  formatLongDate,
  formatOccupiedSlotsLabel,
  formatPriestHonorificName,
  getCalendarDateColorClass,
  getCalendarEntryDisplayTitle,
  getCalendarEntryLocationLabel,
  getManilaDateKey,
  getParishHourSlotKey,
  getScheduleSlotsForDay,
  isAppointmentCalendarEntry,
  isPriestAssignedCalendarEntry,
  isScheduleDateLocked,
  normalizeScheduleMinAdvanceDays,
  occupiedSlotsToFormTimes,
  PRIEST_BLOCK_OTHER_REASON,
  PRIEST_BLOCK_REASONS,
  shiftDateKey,
  sortCalendarEntriesByStartTime,
  to12HourTime,
  toEventDateKey,
  toggleOccupiedHourSlot,
} from "../utils/parishSchedule";
import { getTrustedNow } from "../utils/parishClock";
import { AdminDayNotesPanel } from "../components/PriestScheduleNotes";
import { ParishDateField } from "../components/ParishDateField";
import "./Dashboard.css";
import "./AdminDashboard.css";
import "./AdminAppointmentRequests.css";
import "./AdminProgressDetails.css";

const THEME_VERSE_LIBRARY = {
  hope: [
    { text: "For I know the plans I have for you, says the Lord, plans for your welfare and not for harm, to give you a future with hope.", reference: "Jeremiah 29:11" },
    { text: "We know that all things work together for good for those who love God.", reference: "Romans 8:28" },
    { text: "Faith is the assurance of things hoped for, the conviction of things not seen.", reference: "Hebrews 11:1" },
    { text: "They are new every morning; great is your faithfulness.", reference: "Lamentations 3:23" },
  ],
  peace: [
    { text: "Be still, and know that I am God.", reference: "Psalm 46:10" },
    { text: "Blessed are the peacemakers, for they will be called children of God.", reference: "Matthew 5:9" },
    { text: "God is our refuge and strength, a very present help in trouble.", reference: "Psalm 46:1" },
    { text: "Come to me, all you that are weary and are carrying heavy burdens, and I will give you rest.", reference: "Matthew 11:28" },
  ],
  love: [
    { text: "Love one another as I have loved you.", reference: "John 13:34" },
    { text: "Let all that you do be done in love.", reference: "1 Corinthians 16:14" },
    { text: "Be kind to one another, tenderhearted, forgiving one another.", reference: "Ephesians 4:32" },
    { text: "The steadfast love of the Lord never ceases; his mercies never come to an end.", reference: "Lamentations 3:22" },
  ],
  gratitude: [
    { text: "This is the day that the Lord has made; let us rejoice and be glad in it.", reference: "Psalm 118:24" },
    { text: "Rejoice always, pray without ceasing, give thanks in all circumstances.", reference: "1 Thessalonians 5:16-18" },
    { text: "The joy of the Lord is your strength.", reference: "Nehemiah 8:10" },
    { text: "The Lord is my shepherd, I shall not want.", reference: "Psalm 23:1" },
  ],
  strength: [
    { text: "I can do all things through him who strengthens me.", reference: "Philippians 4:13" },
    { text: "Be strong and courageous; do not be frightened, for the Lord your God is with you wherever you go.", reference: "Joshua 1:9" },
    { text: "With God all things are possible.", reference: "Matthew 19:26" },
    { text: "If God is for us, who is against us?", reference: "Romans 8:31" },
  ],
  guidance: [
    { text: "Trust in the Lord with all your heart, and do not rely on your own insight.", reference: "Proverbs 3:5" },
    { text: "In all your ways acknowledge him, and he will make straight your paths.", reference: "Proverbs 3:6" },
    { text: "Your word is a lamp to my feet and a light to my path.", reference: "Psalm 119:105" },
    { text: "Ask, and it will be given you; search, and you will find; knock, and the door will be opened for you.", reference: "Matthew 7:7" },
  ],
  renewal: [
    { text: "Create in me a clean heart, O God, and put a new and right spirit within me.", reference: "Psalm 51:10" },
    { text: "Set your minds on things that are above, not on things that are on earth.", reference: "Colossians 3:2" },
    { text: "Do not be overcome by evil, but overcome evil with good.", reference: "Romans 12:21" },
    { text: "The Lord is near to the brokenhearted, and saves the crushed in spirit.", reference: "Psalm 34:18" },
  ],
  justice: [
    { text: "He has told you, O mortal, what is good: do justice, love kindness, and walk humbly with your God.", reference: "Micah 6:8" },
    { text: "Blessed are those who hunger and thirst for righteousness, for they will be filled.", reference: "Matthew 5:6" },
    { text: "Act justly and to love mercy and to walk humbly with your God.", reference: "Micah 6:8" },
    { text: "Speak up and judge fairly; defend the rights of the poor and needy.", reference: "Proverbs 31:9" },
  ],
};

const SPECIAL_DAY_THEMES = {
  "01-01": "hope",
  "02-14": "love",
  "03-08": "justice",
  "04-22": "renewal",
  "05-01": "justice",
  "06-05": "renewal",
  "09-21": "peace",
  "11-01": "hope",
  "12-24": "hope",
  "12-25": "love",
  "12-31": "gratitude",
};

const MONTH_DEFAULT_THEMES = {
  0: "hope",
  1: "love",
  2: "renewal",
  3: "guidance",
  4: "justice",
  5: "strength",
  6: "guidance",
  7: "strength",
  8: "peace",
  9: "gratitude",
  10: "gratitude",
  11: "hope",
};

const getThemeForDate = (dateValue) => {
  const date = new Date(dateValue);
  const monthDay = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (SPECIAL_DAY_THEMES[monthDay]) return SPECIAL_DAY_THEMES[monthDay];

  const weekday = date.getDay();
  if (weekday === 0) return "peace";
  if (weekday === 6) return "gratitude";

  return MONTH_DEFAULT_THEMES[date.getMonth()] || "hope";
};

const HARDCODED_YEAR_VERSES = Array.from({ length: 365 }, (_, index) => {
  const referenceDate = new Date(2025, 0, 1 + index);
  const theme = getThemeForDate(referenceDate);
  const themePool = THEME_VERSE_LIBRARY[theme] || THEME_VERSE_LIBRARY.hope;
  return themePool[index % themePool.length];
});

const getDayOfYearIndex = (dateValue) => {
  const date = new Date(dateValue);
  const start = new Date(date.getFullYear(), 0, 1);
  const diffMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - start.getTime();
  const dayIndex = Math.floor(diffMs / 86400000);
  return Math.max(0, Math.min(dayIndex, 364));
};
const BIBLE_VERSE_API_URL = "/api/verse-of-day";
const WLDEH_BIBLE_API_BASE_URL = "https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles";
const WLDEH_BIBLE_VERSION = "en-kjv";
const WLDEH_VERSE_OF_DAY_POOL = [
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
const getFallbackVerseForDate = (dateValue) => HARDCODED_YEAR_VERSES[getDayOfYearIndex(dateValue)];
const getWldehVerseSelectionForDate = (dateValue) => {
  const dayIndex = getDayOfYearIndex(dateValue);
  const poolSize = WLDEH_VERSE_OF_DAY_POOL.length || 1;
  return WLDEH_VERSE_OF_DAY_POOL[dayIndex % poolSize];
};
const cleanWldehVerseText = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/^¶+\s*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\d+\.\d+\s+for:.*$/i, "")
    .trim();
const fetchWldehVerseOfDay = async (signal) => {
  const selectedVerse = getWldehVerseSelectionForDate(new Date());
  const response = await fetch(
    `${WLDEH_BIBLE_API_BASE_URL}/${WLDEH_BIBLE_VERSION}/books/${selectedVerse.book}/chapters/${selectedVerse.chapter}/verses/${selectedVerse.verse}.json`,
    { signal },
  );
  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Unable to fetch verse from Bible API.");
  }
  const text = cleanWldehVerseText(responseData?.text);
  if (!text) throw new Error("Bible API returned an empty verse.");
  return { text, reference: selectedVerse.reference };
};

const getSchemaBySacramentName = (config, sacramentName) =>
  getSacramentSchemaByName(config, sacramentName)?.fields || [];
const DEFAULT_SPECIAL_PROGRAM_FIELDS = [
  { key: "address", label: "Address", type: "text", required: true, placeholder: "Enter complete address", options: [] },
  { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number", options: [] },
];
const normalizeSpecialProgramFields = (rawSchema) => {
  const fieldSource = Array.isArray(rawSchema?.fields) && rawSchema.fields.length > 0 ? rawSchema.fields : DEFAULT_SPECIAL_PROGRAM_FIELDS;
  return fieldSource.map((field, index) => {
    const key = String(field?.key || "").trim() || `field_${index + 1}`;
    return {
      key,
      label: String(field?.label || key || `Field ${index + 1}`).trim() || `Field ${index + 1}`,
      type: String(field?.type || "text").trim().toLowerCase() || "text",
      required: field?.required !== false,
      placeholder: String(field?.placeholder || "").trim(),
      accept: String(field?.accept || "").trim(),
      options: Array.isArray(field?.options) ? field.options.map((item) => String(item || "").trim()).filter(Boolean) : [],
    };
  });
};
const normalizeRequirementLines = (items) =>
  Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];

const findSpecialSacramentSchemaByProgramName = (schemas, programName) => {
  const normalized = String(programName || "").trim().toLowerCase();
  if (!normalized) return null;
  return (Array.isArray(schemas) ? schemas : []).find((schema) => {
    const schemaName = String(schema?.specialSacramentName || schema?.s_sacramentName || "").trim().toLowerCase();
    return schemaName === normalized;
  }) || null;
};

const PHONE_NUMBER_REGEX = /^09\d{9}$/;
const isPhoneFieldKey = (fieldOrKey) => {
  const key = String(typeof fieldOrKey === "object" && fieldOrKey !== null ? fieldOrKey.key : fieldOrKey || "")
    .trim()
    .toLowerCase();
  const label = String(typeof fieldOrKey === "object" && fieldOrKey !== null ? fieldOrKey.label : "")
    .trim()
    .toLowerCase();
  const type = String(typeof fieldOrKey === "object" && fieldOrKey !== null ? fieldOrKey.type : "")
    .trim()
    .toLowerCase();
  if (type === "tel") return true;
  if (key.includes("phone")) return true;
  if (key.includes("contactnumber") || key.includes("contact_number")) return true;
  if (label.includes("phone number") || label.includes("contact number")) return true;
  return false;
};
const isAddressFieldKey = (fieldOrKey) => {
  const key = String(typeof fieldOrKey === "object" && fieldOrKey !== null ? fieldOrKey.key : fieldOrKey || "")
    .trim()
    .toLowerCase();
  const label = String(typeof fieldOrKey === "object" && fieldOrKey !== null ? fieldOrKey.label : "")
    .trim()
    .toLowerCase();
  if (key.includes("address")) return true;
  if (label.includes("address")) return true;
  return false;
};
const normalizeMobileInput = (rawValue) => {
  const digitsOnly = String(rawValue || "").replace(/\D/g, "").slice(0, 11);
  if (!digitsOnly) return "";
  if (digitsOnly[0] !== "0") return "";
  if (digitsOnly.length === 1) return "0";
  if (digitsOnly[1] !== "9") return "0";
  return digitsOnly;
};

const getRequestTypeBySacrament = (sacramentName) => {
  const normalized = String(sacramentName || "").trim().toLowerCase();
  if (normalized.includes("kasalan ng bayan") || normalized.includes("binyagan ng bayan")) return "Special Sacrament";
  if (normalized.includes("certificate")) return "Certificate Request";
  return "Appointment";
};

const normalizeSacramentKey = (value) => String(value || "").trim().toLowerCase();

const CERTIFICATE_TYPE_LABELS = {
  marriage: "Marriage Certificate",
  baptismal: "Baptismal Certificate",
};

const getCertificateTypeCategory = (label) => {
  const normalized = String(label || "").trim().toLowerCase();
  if (normalized.includes("marriage")) return "marriage";
  if (normalized.includes("baptism")) return "baptismal";
  return "other";
};

const toCertificateRequestFields = (formSchema) => {
  const fields = Array.isArray(formSchema?.fields) ? formSchema.fields : [];
  return fields
    .map((field, index) => {
      const label = String(field?.label || "").trim() || `Field ${index + 1}`;
      const type = String(field?.type || "text").trim().toLowerCase() || "text";
      return {
        key: String(field?.key || "").trim(),
        label,
        type,
        placeholder: String(field?.placeholder || "").trim() || (type === "list" ? "" : `Enter ${label}`),
        options: Array.isArray(field?.options) ? field.options : [],
        required: field?.required !== false,
      };
    })
    .filter((field) => field.key);
};

const isDeathMassSacramentKey = (key) => key === "funeral mass" || key === "funeral-mass";

const isBaptismChristeningSacramentKey = (key) => key === "baptism" || key === "christening";
const FUNERAL_DECEASED_ADDRESS_FIELD = {
  key: "deceasedAddress",
  label: "Deceased Address",
  type: "text",
  required: true,
  placeholder: "Enter deceased address",
};
const FUNERAL_REQUIRED_FIELDS = [
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
  if (fieldKey && (fieldKey === requiredKey || (requiredField?.aliases || []).some((alias) => normalizeComparableFieldToken(alias) === fieldKey))) {
    return true;
  }
  const fieldLabel = normalizeComparableFieldToken(field?.label);
  const requiredLabel = normalizeComparableFieldToken(requiredField?.label);
  return Boolean(fieldLabel && requiredLabel && fieldLabel === requiredLabel);
};
const readCredentialAliasValue = (credentials, keys) => {
  for (const key of keys) {
    const value = String(credentials?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};
const ensureFuneralMassRequiredFields = (fields, sacramentName) => {
  if (!isDeathMassSacramentKey(normalizeSacramentKey(sacramentName))) return Array.isArray(fields) ? fields : [];
  const keyOf = (field) => String(field?.key || "").trim();
  const nextFields = (Array.isArray(fields) ? fields : []).map((field) => ({ ...(field || {}) }));
  const addressIndex = nextFields.findIndex((field) => normalizeComparableFieldToken(keyOf(field)) === "address");
  const deceasedAddressIndex = nextFields.findIndex((field) => normalizeComparableFieldToken(keyOf(field)) === "deceasedaddress");

  if (addressIndex > -1 && deceasedAddressIndex === -1) {
    nextFields[addressIndex] = {
      ...FUNERAL_DECEASED_ADDRESS_FIELD,
      ...nextFields[addressIndex],
      ...FUNERAL_DECEASED_ADDRESS_FIELD,
    };
  } else if (addressIndex > -1 && deceasedAddressIndex > -1) {
    nextFields.splice(addressIndex, 1);
  }

  for (const requiredField of FUNERAL_REQUIRED_FIELDS) {
    const hasField = nextFields.some((field) => fieldMatchesFuneralRequirement(field, requiredField));
    if (!hasField) {
      const { aliases: _aliases, ...fieldToAdd } = requiredField;
      nextFields.push({ ...fieldToAdd });
    }
  }

  return nextFields;
};

const ensureSacramentRequiredFields = (fields, sacramentName) =>
  ensureFuneralMassRequiredFields(fields, sacramentName);

const toComparableName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

const findMarriageDuplicateNameError = (fields, credentials) => {
  const brideName = toComparableName(credentials?.brideName);
  const groomName = toComparableName(credentials?.groomName);
  if (brideName && groomName && brideName === groomName) {
    return "The bride and groom cannot have the same name.";
  }

  const seenSponsors = new Map();
  for (const field of fields) {
    if (field.type !== "list") continue;
    const entries = Array.isArray(credentials?.[field.key]) ? credentials[field.key] : [];
    for (const entry of entries) {
      const rawName = String(entry?.name || "").trim();
      const name = toComparableName(rawName);
      if (!name) continue;
      if (name === brideName || name === groomName) {
        return `${rawName} is already entered as the ${name === brideName ? "bride" : "groom"} and cannot also be a sponsor.`;
      }
      const firstField = seenSponsors.get(name);
      if (firstField) {
        return firstField === field.label
          ? `${field.label}: "${rawName}" is entered more than once. Each sponsor must have a different name.`
          : `"${rawName}" is entered in both ${firstField} and ${field.label}. Each sponsor must have a different name.`;
      }
      seenSponsors.set(name, field.label);
    }
  }
  return "";
};

const buildTakenSponsorNames = (fields, credentials, currentFieldKey) => {
  const taken = new Map();
  const brideName = toComparableName(credentials?.brideName);
  const groomName = toComparableName(credentials?.groomName);
  if (brideName) taken.set(brideName, "the bride");
  if (groomName && !taken.has(groomName)) taken.set(groomName, "the groom");
  for (const field of fields) {
    if (field.type !== "list" || field.key === currentFieldKey) continue;
    const entries = Array.isArray(credentials?.[field.key]) ? credentials[field.key] : [];
    for (const entry of entries) {
      const name = toComparableName(entry?.name);
      if (name && !taken.has(name)) taken.set(name, `a ${String(field.label || "sponsor").toLowerCase()}`);
    }
  }
  return taken;
};

const getMarriageAccountRoleByGender = (genderValue) => {
  const normalized = String(genderValue || "").trim().toLowerCase();
  if (normalized === "female") return "bride";
  if (normalized === "male") return "groom";
  return null;
};
const calculateAgeFromBirthdate = (birthdateValue) => {
  const rawBirthdate = String(birthdateValue || "").trim();
  if (!rawBirthdate) return "";
  const normalizedBirthdate = /^\d{4}-\d{2}-\d{2}/.test(rawBirthdate) ? rawBirthdate.slice(0, 10) : rawBirthdate;
  const birthdate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthdate)
    ? new Date(`${normalizedBirthdate}T00:00:00`)
    : new Date(normalizedBirthdate);
  if (Number.isNaN(birthdate.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDiff = today.getMonth() - birthdate.getMonth();
  const dayDiff = today.getDate() - birthdate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age > 0 ? String(age) : "";
};

const getTodayIsoDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const PARISH_ACTIVITY_MAX_VIDEO_DURATION_SECONDS = 300;
const PARISH_ACTIVITY_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const PARISH_ACTIVITY_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const isEmbeddedImageData = (value) => String(value || "").trim().startsWith("data:image/");
const isLocalPreviewUrl = (value) => String(value || "").trim().startsWith("blob:");
const isUploadedParishActivityPath = (value) => {
  const normalized = String(value || "").trim();
  return normalized.startsWith("/uploads/parish-activities/") || normalized.startsWith("/uploads/");
};
const isParishActivityAssetPath = (value) => String(value || "").trim().startsWith("/assets/parish-activity-media/");
const resolveParishActivityMediaSrc = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (isEmbeddedImageData(normalized) || isLocalPreviewUrl(normalized) || /^https?:\/\//i.test(normalized)) return normalized;
  if (isParishActivityAssetPath(normalized)) {
    const fileName = normalized.split("/").pop();
    return fileName ? `/api/uploads/parish-activities/${fileName}` : normalized;
  }
  if (isUploadedParishActivityPath(normalized)) return `/api${normalized}`;
  return normalized;
};
const getParishActivityMediaReference = (item) => String(item?.filePath || item?.url || "").trim();

const isParishActivityVideoFile = (file) => {
  const mimeType = String(file?.type || "").toLowerCase();
  const fileName = String(file?.name || "").toLowerCase();
  return mimeType.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(fileName);
};

const isLikelyParishActivityMediaFile = (file) => {
  const mimeType = String(file?.type || "").toLowerCase();
  const fileName = String(file?.name || "").toLowerCase();
  if (mimeType === "image/gif") return false;
  if (mimeType.startsWith("image/")) return true;
  if (mimeType.startsWith("video/")) return true;
  return /\.(jpe?g|png|webp|mp4|webm|mov|m4v)$/i.test(fileName);
};

const readVideoDurationSeconds = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(Number(video.duration) || 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read the selected video."));
    };
    video.src = objectUrl;
  });

const normalizeParishActivityMediaForForm = (entry) => {
  if (Array.isArray(entry?.media) && entry.media.length > 0) {
    return entry.media
      .map((item) => {
        const filePath = String(item?.filePath || item?.url || "").trim();
        return {
          type: item?.type === "video" ? "video" : "image",
          filePath,
          url: filePath,
          fileName: String(item?.fileName || "").trim(),
          summary: String(item?.summary || item?.description || item?.caption || "").trim(),
        };
      })
      .filter((item) => item.filePath);
  }
  const legacyImagePath = String(entry?.imageUrl || "").trim();
  return legacyImagePath
    ? [{ type: "image", filePath: legacyImagePath, url: legacyImagePath, fileName: "", summary: "" }]
    : [];
};

const getParishActivityCoverMedia = (entry) => {
  const media = normalizeParishActivityMediaForForm(entry);
  if (media.length > 0) return media[0];
  const legacyImagePath = String(entry?.imageUrl || "").trim();
  return legacyImagePath ? { type: "image", url: legacyImagePath, filePath: legacyImagePath, fileName: "" } : null;
};

const normalizeParishActivityMediaForDisplay = (entry) => {
  if (Array.isArray(entry?.media) && entry.media.length > 0) {
    return entry.media
      .map((item) => {
        const filePath = getParishActivityMediaReference(item);
        return {
          type: item?.type === "video" ? "video" : "image",
          filePath,
          url: filePath,
          summary: String(item?.summary || item?.description || item?.caption || "").trim(),
        };
      })
      .filter((item) => item.filePath);
  }
  const legacyImagePath = String(entry?.imageUrl || "").trim();
  return legacyImagePath ? [{ type: "image", filePath: legacyImagePath, url: legacyImagePath, summary: "" }] : [];
};

const uploadParishActivityMediaFile = async (file) => {
  const endpoints = ["/api/parish-activities/upload-image", "/admin-api/parish-activities/upload-image"];
  let lastError = new Error("Unable to upload parish activity media.");
  for (const endpoint of endpoints) {
    try {
      const formData = new FormData();
      formData.append("photo", file, file.name || (isParishActivityVideoFile(file) ? "parish-activity-video.mp4" : "parish-activity-photo.jpg"));
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(responseData?.message || "Unable to upload parish activity media.");
        continue;
      }
      const filePath = String(responseData?.filePath ?? responseData?.url ?? responseData?.imageUrl ?? "").trim();
      if (!filePath) {
        lastError = new Error("The server did not return a media path.");
        continue;
      }
      const mediaType = String(responseData?.mediaType || (isParishActivityVideoFile(file) ? "video" : "image")).trim();
      return {
        type: mediaType === "video" ? "video" : "image",
        filePath,
        url: filePath,
        fileName: String(responseData?.fileName || file.name || "").trim(),
        summary: "",
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unable to upload parish activity media.");
    }
  }
  throw lastError;
};

const deleteParishActivityMediaFromServer = async ({ filePath, adminID, activityID }) => {
  const endpoints = ["/admin-api/parish-activities/delete-media", "/api/parish-activities/delete-media"];
  let lastError = new Error("Unable to remove parish activity media.");
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminID,
          filePath,
          ...(Number.isInteger(activityID) && activityID > 0 ? { activityID } : {}),
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(responseData?.message || "Unable to remove parish activity media.");
        continue;
      }
      return responseData;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unable to remove parish activity media.");
    }
  }
  throw lastError;
};

const renderParishActivityMediaPreview = (item, altText = "Parish activity media") => {
  const mediaReference = getParishActivityMediaReference(item);
  if (!mediaReference) return null;
  if (item.type === "video") {
    return (
      <video
        src={resolveParishActivityMediaSrc(mediaReference)}
        controls
        playsInline
        preload="metadata"
        aria-label={altText}
      />
    );
  }
  return <img src={resolveParishActivityMediaSrc(mediaReference)} alt={altText} />;
};

const renderParishActivityCardCover = (entry) => {
  const coverMedia = getParishActivityCoverMedia(entry);
  const mediaReference = getParishActivityMediaReference(coverMedia);
  if (!mediaReference) {
    return <div className="admin-parish-activity-media-empty">No media available</div>;
  }
  if (coverMedia.type === "video") {
    return (
      <video
        src={resolveParishActivityMediaSrc(mediaReference)}
        muted
        playsInline
        preload="metadata"
        aria-label={entry?.title || "Parish activity"}
      />
    );
  }
  const src = resolveParishActivityMediaSrc(mediaReference);
  return (
    <>
      <img className="admin-parish-activity-media-backdrop" src={src} alt="" aria-hidden="true" />
      <img className="admin-parish-activity-media-main" src={src} alt={entry?.title || "Parish activity"} />
    </>
  );
};

const compressImageElementToDataUrl = (image, { maxWidth = 1400, quality = 0.76 } = {}) => {
  const scale = Math.min(1, maxWidth / Math.max(image.width || 1, 1));
  const width = Math.max(1, Math.round((image.width || 1) * scale));
  const height = Math.max(1, Math.round((image.height || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
};

const compressImageFileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const compressed = compressImageElementToDataUrl(image);
        resolve(compressed || String(reader.result || ""));
      };
      image.onerror = () => reject(new Error("Unable to process selected image."));
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });

const compressEmbeddedImageIfNeeded = (value) =>
  new Promise((resolve) => {
    const normalized = String(value || "").trim();
    if (!isEmbeddedImageData(normalized) || normalized.length < 280000) {
      resolve(normalized);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(compressImageElementToDataUrl(image) || normalized);
    image.onerror = () => resolve(normalized);
    image.src = normalized;
  });

const isoToUsDate = (iso) => {
  const normalized = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  return `${normalized.slice(5, 7)}/${normalized.slice(8, 10)}/${normalized.slice(0, 4)}`;
};

const maskUsDate = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  let masked = digits.slice(0, 2);
  if (digits.length > 2) masked += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) masked += `/${digits.slice(4, 8)}`;
  return masked;
};

const usDateToIso = (value) => {
  const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }
  return `${match[3]}-${match[1]}-${match[2]}`;
};

const buildEmptyParishActivityForm = () => {
  const activityDate = getTodayIsoDate();
  return {
    title: "",
    activityDate,
    activityDateDisplay: isoToUsDate(activityDate),
    expiresOn: "",
    expiresOnDisplay: "",
    summary: "",
    media: [],
  };
};

function AdminDashboard({ isReadOnly = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { parishId } = useParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [calendarEntries, setCalendarEntries] = useState([]);
  const [priests, setPriests] = useState([]);
  const [priestFullName, setPriestFullName] = useState("");
  const [isSavingPriest, setIsSavingPriest] = useState(false);
  const [priestFeedback, setPriestFeedback] = useState("");
  const [isAddPriestOpen, setIsAddPriestOpen] = useState(false);
  const [dayOffWeekday, setDayOffWeekday] = useState(null);
  const [dayOffSpecificDates, setDayOffSpecificDates] = useState([]);
  const [halfDaySetting, setHalfDaySetting] = useState(null);
  const [calendarForm, setCalendarForm] = useState({
    title: "",
    scheduleType: "parish_event",
    isSpecialProgram: false,
    sSacramentID: "",
    slotLimitType: "maximum",
    maxSlots: "",
    dayOffMode: "weekday",
    dayOffWeekday: "0",
    dayOffSpecificDate: "",
    eventDate: "",
    startTime: "",
    endTime: "",
    durationHours: 1,
    occupiedSlots: [],
    location: "",
    notes: "",
    priestID: "",
    deadline: "",
  });
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [priestBlockReasonChoice, setPriestBlockReasonChoice] = useState("");
  const [priestScheduleNotes, setPriestScheduleNotes] = useState([]);
  const [busyPriestNoteId, setBusyPriestNoteId] = useState(null);
  const [blockingPriestNoteId, setBlockingPriestNoteId] = useState(null);
  const [blockingNoteDates, setBlockingNoteDates] = useState([]);
  const [excludedPackageDates, setExcludedPackageDates] = useState([]);
  const [calendarError, setCalendarError] = useState("");
  const [calendarNotice, setCalendarNotice] = useState("");
  const [isSavingCalendarEntry, setIsSavingCalendarEntry] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [priestCalendarMonth, setPriestCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [scheduleMinAdvanceDays, setScheduleMinAdvanceDays] = useState(5);
  const [remoteDayAvailability, setRemoteDayAvailability] = useState(null);
  const [isLoadingScheduleSlots, setIsLoadingScheduleSlots] = useState(false);
  const [editingOriginalEventDate, setEditingOriginalEventDate] = useState("");
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isCertificateTypeModalOpen, setIsCertificateTypeModalOpen] = useState(false);
  const [isCertificateRequestModalOpen, setIsCertificateRequestModalOpen] = useState(false);
  const [certificateRequestStep, setCertificateRequestStep] = useState("details");
  const [useMarriageCertificateAccountDetails, setUseMarriageCertificateAccountDetails] = useState(false);
  const [useCertificateAccountPhoneNumber, setUseCertificateAccountPhoneNumber] = useState({});
  const [selectedCertificateType, setSelectedCertificateType] = useState("");
  const [selectedCertificateTypeId, setSelectedCertificateTypeId] = useState(null);
  const [selectedCertificateTypeLabel, setSelectedCertificateTypeLabel] = useState("");
  const [certificateTypeOptions, setCertificateTypeOptions] = useState([]);
  const [isLoadingCertificateTypes, setIsLoadingCertificateTypes] = useState(false);
  const [certificateTypesError, setCertificateTypesError] = useState("");
  const [certificateRequestValues, setCertificateRequestValues] = useState({});
  const [certificateRequestError, setCertificateRequestError] = useState("");
  const [isSubmittingCertificateRequest, setIsSubmittingCertificateRequest] = useState(false);
  const [isCertificateSubmitConfirmOpen, setIsCertificateSubmitConfirmOpen] = useState(false);
  const [appointmentStep, setAppointmentStep] = useState("pick");
  const [selectedSacrament, setSelectedSacrament] = useState(null);
  const [appointmentCredentials, setAppointmentCredentials] = useState({});
  const [appointmentNote, setAppointmentNote] = useState("");
  const [useMarriageAccountDetails, setUseMarriageAccountDetails] = useState(false);
  const [useAccountPhoneNumber, setUseAccountPhoneNumber] = useState({});
  const [resolvedUserGender, setResolvedUserGender] = useState("");
  const [resolvedUserBirthdate, setResolvedUserBirthdate] = useState("");
  const [appointmentFormError, setAppointmentFormError] = useState("");
  const [isSpecialProgramOnceNoticeOpen, setIsSpecialProgramOnceNoticeOpen] = useState(false);
  const [isSubmittingAppointment, setIsSubmittingAppointment] = useState(false);
  const [isAppointmentSubmitConfirmOpen, setIsAppointmentSubmitConfirmOpen] = useState(false);
  const [sacraments, setSacraments] = useState([]);
  const [isLoadingSacraments, setIsLoadingSacraments] = useState(false);
  const [sacramentsError, setSacramentsError] = useState("");
  const [sacramentFormSchemaConfig, setSacramentFormSchemaConfig] = useState(() =>
    normalizeSacramentFormSchemaConfig(DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG),
  );
  const [specialSacramentFormSchemas, setSpecialSacramentFormSchemas] = useState([]);
  const [isAnnouncementsModalOpen, setIsAnnouncementsModalOpen] = useState(false);
  const [isDateSchedulesModalOpen, setIsDateSchedulesModalOpen] = useState(false);
  const [dateScheduleSlideStep, setDateScheduleSlideStep] = useState(0);
  const [editingDayOffTarget, setEditingDayOffTarget] = useState(null);
  const [isDayOffDeleteConfirmOpen, setIsDayOffDeleteConfirmOpen] = useState(false);
  const [isEntryDeleteConfirmOpen, setIsEntryDeleteConfirmOpen] = useState(false);
  const [isPrintMonthConfirmOpen, setIsPrintMonthConfirmOpen] = useState(false);
  const [printMonthPriestID, setPrintMonthPriestID] = useState("");
  const [dashboardStats, setDashboardStats] = useState({
    pendingAppointments: 0,
    approvedToday: 0,
    ongoingAppointments: 0,
    certificateRequests: 0,
  });
  const [isLoadingDashboardStats, setIsLoadingDashboardStats] = useState(false);
  const [officeStatus, setOfficeStatus] = useState({
    timezone: "Asia/Manila",
    now: {
      dateISO: "",
      dateLabel: "",
      timeLabel: "",
    },
    office: {
      isOpen: false,
      statusLabel: "Closed",
      reason: "Loading office schedule...",
      activeSchedule: null,
      nextOpening: null,
    },
    generatedAt: "",
  });
  const [readOnlyParishName, setReadOnlyParishName] = useState("");
  const [, setIsLoadingOfficeStatus] = useState(false);
  const [phNowLabel, setPhNowLabel] = useState("");
  const [calendarNow, setCalendarNow] = useState(() => getTrustedNow());
  const [isPrintingCalendarMonth, setIsPrintingCalendarMonth] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [verseOfTheDay, setVerseOfTheDay] = useState(() => getFallbackVerseForDate(new Date()));
  const [isVerseLoading, setIsVerseLoading] = useState(true);
  const [parishActivities, setParishActivities] = useState([]);
  const [isLoadingParishActivities, setIsLoadingParishActivities] = useState(false);
  const [parishActivitiesError, setParishActivitiesError] = useState("");
  const [isParishActivityModalOpen, setIsParishActivityModalOpen] = useState(false);
  const [editingParishActivityId, setEditingParishActivityId] = useState(null);
  const [isSavingParishActivity, setIsSavingParishActivity] = useState(false);
  const [isDeletingParishActivity, setIsDeletingParishActivity] = useState(false);
  const [parishActivityForm, setParishActivityForm] = useState(buildEmptyParishActivityForm);
  const [parishActivityCoverFileLabel, setParishActivityCoverFileLabel] = useState("");
  const [parishActivityImageBusyKey, setParishActivityImageBusyKey] = useState("");
  const [parishActivityMediaRemovingIndex, setParishActivityMediaRemovingIndex] = useState(null);
  const [parishActivitySlideIndex, setParishActivitySlideIndex] = useState(0);
  const [isParishActivityDetailsModalOpen, setIsParishActivityDetailsModalOpen] = useState(false);
  const [selectedParishActivity, setSelectedParishActivity] = useState(null);
  const isAppointmentModalOpenRef = useRef(false);
  const lastDashboardFetchRef = useRef(0);

  useEffect(() => {
    isAppointmentModalOpenRef.current = isAppointmentModalOpen;
  }, [isAppointmentModalOpen]);

  const authData = useMemo(() => {
    const localValue = localStorage.getItem("faithflow_auth");
    const sessionValue = sessionStorage.getItem("faithflow_auth");
    const raw = localValue || sessionValue;

    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const user = authData?.user;
  const accountType = String(authData?.accountType || "")
    .trim()
    .toLowerCase();
  const canManageParishActivities = !isReadOnly && accountType === "admin";
  const selectedParish = location.state?.selectedParish || null;
  const resolvedReadOnlyAdminID = resolveParishAdminID(parishId);
  const resolvedDayOffAdminID = isReadOnly ? resolvedReadOnlyAdminID : Number(user?.adminID);
  const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  useEffect(() => {
    if (!isReadOnly) return undefined;
    let isActive = true;
    const loadReadOnlyParishName = async () => {
      try {
        const response = await fetch(
          `/admin-api/profile?accountType=admin&accountID=${resolvedReadOnlyAdminID}`,
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || "Unable to load parish profile.");
        if (isActive) {
          setReadOnlyParishName(
            String(payload?.user?.parishName || user?.parishName || "Our Lady of Guadalupe Parish - Villanueva").trim(),
          );
        }
      } catch {
        if (isActive) {
          setReadOnlyParishName(
            String(user?.parishName || "Our Lady of Guadalupe Parish - Villanueva").trim(),
          );
        }
      }
    };
    void loadReadOnlyParishName();
    return () => {
      isActive = false;
    };
  }, [isReadOnly, resolvedReadOnlyAdminID, user?.parishName]);

  const getManilaNowContext = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(getTrustedNow());
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
    const dateLabel = getTrustedNow().toLocaleDateString("en-US", {
      timeZone: "Asia/Manila",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return {
      weekday,
      dateISO,
      nowMinutes: Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null,
      dateLabel,
    };
  };

  const formatTimeTo12Hour = (timeValue) => {
    if (!timeValue || typeof timeValue !== "string") return "";
    const [hoursRaw, minutesRaw] = timeValue.split(":");
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "";

    const normalizedHours = ((hours % 24) + 24) % 24;
    const period = normalizedHours >= 12 ? "PM" : "AM";
    const twelveHour = normalizedHours % 12 || 12;
    return `${twelveHour}:${String(minutes).padStart(2, "0")} ${period}`;
  };

  const formatTimeRange = (startTime, endTime) => {
    const formattedStart = formatTimeTo12Hour(startTime);
    const formattedEnd = formatTimeTo12Hour(endTime);
    if (formattedStart && formattedEnd) return `${formattedStart} - ${formattedEnd}`;
    return formattedStart || formattedEnd || "Time not set";
  };

  const parseTimeToMinutes = (timeValue) => {
    const raw = String(timeValue || "").trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  };

  const formatDateToLong = (dateValue) => {
    const normalizedDate = String(dateValue || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return "Date not set";
    }
    return new Date(`${normalizedDate}T00:00:00`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };
  const buildLocalOfficeStatusFallback = useCallback(() => {
    const nowContext = getManilaNowContext();
    const todayISO = nowContext.dateISO;
    const weekday = nowContext.weekday;
    const isSpecificDateDayOff = Boolean(todayISO && dayOffSpecificDates.includes(todayISO));
    const isRecurringDayOff = Number.isInteger(weekday) && Number.isInteger(dayOffWeekday) && Number(dayOffWeekday) === weekday;
    const isDayOff = isSpecificDateDayOff || isRecurringDayOff;
    const todaySchedules = (Array.isArray(calendarEntries) ? calendarEntries : []).filter(
      (entry) =>
        String(entry?.eventDate || "").trim() === todayISO &&
        ["parish_event", "priest_schedule"].includes(String(entry?.scheduleType || "").trim()),
    );
    const scheduleWindows = todaySchedules
      .map((entry) => {
        const startMinutes = parseTimeToMinutes(entry?.startTime);
        const endMinutes = parseTimeToMinutes(entry?.endTime);
        return {
          ...entry,
          startMinutes,
          endMinutes,
        };
      })
      .filter(
        (entry) =>
          Number.isInteger(entry.startMinutes) &&
          Number.isInteger(entry.endMinutes) &&
          entry.endMinutes > entry.startMinutes,
      );
    const activeWindow = scheduleWindows.find(
      (entry) => Number.isInteger(nowContext.nowMinutes) && nowContext.nowMinutes >= entry.startMinutes && nowContext.nowMinutes < entry.endMinutes,
    );
    const nextWindow = scheduleWindows.find((entry) => Number.isInteger(nowContext.nowMinutes) && entry.startMinutes > nowContext.nowMinutes) || null;
    const reason = isDayOff
      ? isSpecificDateDayOff
        ? "Office is closed today due to a specific day-off date."
        : `Office is closed today. Recurring day-off is ${weekdayLabels[dayOffWeekday] || "configured day-off"}.`
      : activeWindow
      ? `Office is open now until ${formatTimeTo12Hour(activeWindow.endTime)}.`
      : nextWindow
      ? `Office is open today. Next parish schedule starts at ${formatTimeTo12Hour(nextWindow.startTime)}.`
      : "Office is open today.";
    return {
      timezone: "Asia/Manila",
      now: {
        dateISO: todayISO,
        dateLabel: nowContext.dateLabel,
        timeLabel: "",
      },
      office: {
        isOpen: !isDayOff,
        statusLabel: !isDayOff ? "Open" : "Closed",
        reason,
        activeSchedule: null,
        nextOpening: null,
      },
      generatedAt: new Date().toISOString(),
    };
  }, [calendarEntries, dayOffSpecificDates, dayOffWeekday]);
  const buildLocalOfficeStatusFallbackRef = useRef(buildLocalOfficeStatusFallback);
  buildLocalOfficeStatusFallbackRef.current = buildLocalOfficeStatusFallback;
  const parishActivitiesCountRef = useRef(0);
  parishActivitiesCountRef.current = Array.isArray(parishActivities) ? parishActivities.length : 0;
  const getSacramentColorClass = (sacramentName) => {
    const normalized = normalizeSacramentKey(sacramentName).replace(/\s+/g, "-");
    if (normalized === "marriage") return "is-marriage";
    if (normalized === "baptism" || normalized === "christening") return "is-baptism";
    if (normalized === "funeral-mass" || normalized === "funeral-mass") return "is-funeral-mass";
    if (normalized === "blessing" || normalized === "blessings") return "is-blessing";
    return "is-generic";
  };
  const getAppointmentTypeCardClass = () => {
    return "is-theme-current";
  };
  const getSacramentDisplayLabel = (sacramentName) => String(sacramentName || "").trim();
  const getSacramentTypeIcon = (sacramentName) => {
    const normalized = normalizeSacramentKey(sacramentName);
    if (normalized === "marriage") return <Users size={20} />;
    if (normalized === "funeral mass") return <Cross size={20} />;
    if (normalized === "baptism" || normalized === "christening") return <Droplets size={20} />;
    if (normalized === "blessing" || normalized === "blessings") return <Home size={20} />;
    return <FileText size={20} />;
  };
  const getSacramentIconToneClass = (sacramentName) => {
    const normalized = normalizeSacramentKey(sacramentName);
    if (normalized === "marriage") return "is-marriage";
    if (normalized === "funeral mass" || normalized === "funeral-mass") return "is-funeral-mass";
    if (normalized === "baptism" || normalized === "christening") return "is-baptism";
    if (normalized === "blessing" || normalized === "blessings") return "is-blessing";
    return "is-generic";
  };
  const appointmentTypeCards = useMemo(() => {
    const preferredOrder = ["marriage", "funeral mass", "funeral-mass", "baptism", "christening", "blessing", "blessings"];
    const orderMap = new Map(preferredOrder.map((key, index) => [key, index]));
    const activeSacraments = sacraments.filter((item) => item?.is_archived !== true && item?.isArchived !== true);
    const sorted = [...activeSacraments].sort((a, b) => {
      const keyA = normalizeSacramentKey(a?.sacramentName);
      const keyB = normalizeSacramentKey(b?.sacramentName);
      const rankA = orderMap.has(keyA) ? orderMap.get(keyA) : 1000;
      const rankB = orderMap.has(keyB) ? orderMap.get(keyB) : 1000;
      if (rankA !== rankB) return rankA - rankB;
      return String(a?.sacramentName || "").localeCompare(String(b?.sacramentName || ""));
    });

    const uniqueByLabel = [];
    const seen = new Set();
    for (const item of sorted) {
      const label = getSacramentDisplayLabel(item?.sacramentName);
      const dedupeKey = normalizeSacramentKey(label);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      uniqueByLabel.push(item);
    }
    return uniqueByLabel;
  }, [sacraments]);

  useEffect(() => {
    document.title = isReadOnly ? "Faithflow - User Dashboard" : "Faithflow - Admin Dashboard";
  }, [isReadOnly]);

  useEffect(() => {
    if (!calendarNotice) return undefined;
    const timeoutId = window.setTimeout(() => {
      setCalendarNotice("");
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [calendarNotice]);

  useEffect(() => {
    if (isAppointmentModalOpen) return undefined;
    const updatePhClock = () => {
      const now = getTrustedNow();
      setCalendarNow(now);
      const nowInManila = now.toLocaleString("en-US", {
        timeZone: "Asia/Manila",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      setPhNowLabel((currentLabel) => (currentLabel === nowInManila ? currentLabel : nowInManila));
    };
    updatePhClock();
    const intervalId = window.setInterval(updatePhClock, 30000);
    return () => window.clearInterval(intervalId);
  }, [isAppointmentModalOpen]);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    const loadVerseOfTheDay = async () => {
      setIsVerseLoading(true);
      try {
        const response = await fetch(BIBLE_VERSE_API_URL, { signal: controller.signal });
        const responseData = await response.json().catch(() => ({}));
        const text = String(responseData?.text || responseData?.verse?.details?.text || "").trim();
        const reference = String(responseData?.reference || responseData?.verse?.details?.reference || "").trim();
        if (response.ok && text && reference) {
          if (isActive) setVerseOfTheDay({ text, reference });
          return;
        }
        throw new Error("Unable to fetch verse of the day.");
      } catch (error) {
        if (error?.name === "AbortError") return;
        try {
          const remoteVerse = await fetchWldehVerseOfDay(controller.signal);
          if (isActive) setVerseOfTheDay(remoteVerse);
        } catch (remoteError) {
          if (remoteError?.name !== "AbortError" && isActive) {
            setVerseOfTheDay(getFallbackVerseForDate(new Date()));
          }
        }
      } finally {
        if (isActive) {
          setIsVerseLoading(false);
        }
      }
    };

    loadVerseOfTheDay();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (!isReadOnly && accountType !== "admin") {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (isReadOnly && accountType === "admin") {
      navigate("/admin/dashboard", { replace: true });
      return;
    }
    if (isReadOnly && accountType === "priest") {
      navigate("/priest/dashboard", { replace: true });
    }
  }, [navigate, user, accountType, isReadOnly]);

  if (!user || (!isReadOnly && accountType !== "admin") || (isReadOnly && ["admin", "priest"].includes(accountType))) return null;

  const loadCalendarEntries = async () => {
    try {
      const resolvedAdminID = isReadOnly ? resolvedReadOnlyAdminID : Number(user?.adminID);
      if (!Number.isInteger(resolvedAdminID) || resolvedAdminID <= 0) {
        setCalendarEntries([]);
        if (isReadOnly) {
          setCalendarError("Unable to detect parish calendar.");
        }
        return;
      }
      const [calendarResponse, priestsResponse] = await Promise.all([
        fetch(`/api/calendar-entries?adminID=${resolvedAdminID}`),
        fetch(`/api/priests?adminID=${resolvedAdminID}&includeInactive=true`),
      ]);
      const responseData = await calendarResponse.json().catch(() => []);
      if (!calendarResponse.ok) {
        throw new Error("Unable to load calendar entries.");
      }
      const allPriests = await priestsResponse.json().catch(() => []);
      if (!isReadOnly && priestsResponse.ok && Array.isArray(allPriests)) {
        // Same list loadPriests() fetches; reuse it instead of requesting /api/priests twice.
        setPriests(allPriests.filter((priest) => priest && priest.isActive !== false));
      }
      const disabledPriestIdSet = new Set(
        (Array.isArray(allPriests) ? allPriests : [])
          .filter((priest) => priest && priest.isActive === false)
          .map((priest) => Number(priest.priestID))
          .filter((priestID) => Number.isInteger(priestID) && priestID > 0),
      );
      const priestNameById = new Map(
        (Array.isArray(allPriests) ? allPriests : []).map((priest) => [
          Number(priest.priestID),
          String(priest.fullName || "").trim(),
        ]),
      );
      const normalizedEntries = (Array.isArray(responseData) ? responseData : []).map((entry) => {
        const assignedPriestID = Number(entry?.priestID);
        const resolvedPriestName =
          String(entry?.priestName || "").trim() ||
          (Number.isInteger(assignedPriestID) && assignedPriestID > 0 ? priestNameById.get(assignedPriestID) || "" : "");
        const appointmentID = Number(entry?.appointmentID);
        const matchedPriest = (Array.isArray(allPriests) ? allPriests : []).find(
          (priest) => Number(priest?.priestID) === assignedPriestID,
        );
        return {
          ...entry,
          priestName: resolvedPriestName || null,
          clergyType: String(entry?.clergyType || matchedPriest?.clergyType || "").trim() || null,
          religiousOrderCode: String(entry?.religiousOrderCode || matchedPriest?.religiousOrderCode || "").trim() || null,
          appointmentID: Number.isInteger(appointmentID) && appointmentID > 0 ? appointmentID : null,
        };
      });
      const visibleEntries = normalizedEntries.filter((entry) => {
        if (isAppointmentCalendarEntry(entry)) return true;
        if (!["priest_schedule", "priest_activity"].includes(String(entry?.scheduleType || "").trim())) return true;
        const assignedPriestID = Number(entry?.priestID);
        if (!Number.isInteger(assignedPriestID) || assignedPriestID <= 0) return false;
        return !disabledPriestIdSet.has(assignedPriestID);
      });
      setCalendarEntries(visibleEntries);
    } catch (error) {
      setCalendarError(error.message || "Unable to load calendar entries.");
    }
  };

  const loadPriests = async () => {
    try {
      const adminID = Number(user?.adminID);
      if (!Number.isInteger(adminID) || adminID <= 0) {
        setPriests([]);
        return;
      }

      const response = await fetch(`/api/priests?adminID=${adminID}&includeInactive=true`);
      const responseData = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error("Unable to load priests.");
      }
      const normalizedPriests = Array.isArray(responseData) ? responseData : [];
      setPriests(normalizedPriests.filter((priest) => priest && priest.isActive !== false));
    } catch (error) {
      setCalendarError(error.message || "Unable to load priests.");
    }
  };

  const loadParishActivities = useCallback(async ({ silent = false } = {}) => {
    const resolvedAdminID = isReadOnly ? resolvedReadOnlyAdminID : Number(user?.adminID);
    if (!Number.isInteger(resolvedAdminID) || resolvedAdminID <= 0) {
      setParishActivities([]);
      setParishActivitiesError(isReadOnly ? "Unable to detect parish activity feed." : "");
      return;
    }

    // Read the count through a ref so this callback keeps one identity. Depending on
    // parishActivities.length re-ran every effect that lists this callback (and refetched the
    // whole dashboard) as soon as the activities arrived.
    const shouldShowLoading = !silent && parishActivitiesCountRef.current === 0;
    if (shouldShowLoading) {
      setIsLoadingParishActivities(true);
    }
    if (!silent) {
      setParishActivitiesError("");
    }
    try {
      const parishActivitiesPath = isReadOnly
        ? `/api/public/parish-activities?adminID=${resolvedAdminID}`
        : `/api/parish-activities?adminID=${resolvedAdminID}`;
      const response = await fetch(parishActivitiesPath);
      const responseData = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(responseData?.message || "Unable to load recent parish activities.");
      }
      setParishActivities(Array.isArray(responseData) ? responseData : []);
      setParishActivitiesError("");
    } catch (error) {
      if (parishActivitiesCountRef.current === 0) {
        setParishActivities([]);
      }
      setParishActivitiesError(error.message || "Unable to load recent parish activities.");
    } finally {
      if (shouldShowLoading) {
        setIsLoadingParishActivities(false);
      }
    }
  }, [isReadOnly, resolvedReadOnlyAdminID, user?.adminID]);

  const loadSacraments = async () => {
    setIsLoadingSacraments(true);
    setSacramentsError("");
    try {
      const response = await fetch("/api/sacraments?archived=false");
      const responseData = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error("Unable to load sacraments.");
      }
      setSacraments(Array.isArray(responseData) ? responseData : []);
    } catch (error) {
      setSacraments([]);
      setSacramentsError(error.message || "Unable to load sacraments.");
    } finally {
      setIsLoadingSacraments(false);
    }
  };

  const loadSacramentFormSchemas = async () => {
    try {
      const response = await fetch("/api/sacrament-form-schemas");
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load sacrament form schema settings.");
      }
      setSacramentFormSchemaConfig(normalizeSacramentFormSchemaConfig(responseData, { includeDefaults: false }));
    } catch {
      setSacramentFormSchemaConfig(normalizeSacramentFormSchemaConfig(DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG));
    }
  };

  const loadSpecialSacramentFormSchemas = async () => {
    try {
      const response = await fetch("/api/special-sacrament-form-schemas");
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load special sacrament form schemas.");
      }
      setSpecialSacramentFormSchemas(Array.isArray(payload) ? payload : []);
    } catch {
      setSpecialSacramentFormSchemas([]);
    }
  };

  const handleAddPriest = async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setPriestFeedback("");

    const adminID = Number(user?.adminID);
    const fullName = priestFullName.trim();
    if (!fullName) {
      setPriestFeedback("Please enter priest full name.");
      return;
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setPriestFeedback("Unable to detect admin account.");
      return;
    }

    setIsSavingPriest(true);
    try {
      const response = await fetch("/admin-api/priests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, adminID }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to add priest.");
      }

      setPriestFullName("");
      setPriestFeedback("Priest added successfully.");
      setCalendarNotice("Priest added successfully.");
      setCalendarForm((current) => ({
        ...current,
        priestID: String(responseData.priestID || ""),
      }));
      setIsAddPriestOpen(false);
      await loadPriests();
    } catch (error) {
      setPriestFeedback(error.message || "Unable to add priest.");
    } finally {
      setIsSavingPriest(false);
    }
  };

  const loadDayOffSettings = async () => {
    try {
      if (!Number.isInteger(resolvedDayOffAdminID) || resolvedDayOffAdminID <= 0) {
        setDayOffWeekday(null);
        setDayOffSpecificDates([]);
        setHalfDaySetting(null);
        return;
      }
      const response = await fetch(`/api/day-offs?adminID=${resolvedDayOffAdminID}`);
      const responseData = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error("Unable to load day-off settings.");
      }
      const weekdayRaw = responseData?.weekday;
      const parsedWeekday = weekdayRaw === null || weekdayRaw === undefined || weekdayRaw === "" ? null : Number(weekdayRaw);
      setDayOffWeekday(Number.isInteger(parsedWeekday) && parsedWeekday >= 0 && parsedWeekday <= 6 ? parsedWeekday : null);
      const dates = Array.isArray(responseData?.specificDates)
        ? responseData.specificDates
            .map((item) => String(item?.date || "").trim())
            .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        : [];
      setDayOffSpecificDates(dates);
      const halfDayRaw = responseData?.halfDay;
      const halfDayWeekday = Number(halfDayRaw?.weekday);
      setHalfDaySetting(
        halfDayRaw && Number.isInteger(halfDayWeekday) && halfDayRaw.startTime && halfDayRaw.endTime
          ? { weekday: halfDayWeekday, startTime: String(halfDayRaw.startTime), endTime: String(halfDayRaw.endTime) }
          : null,
      );
      setScheduleMinAdvanceDays(normalizeScheduleMinAdvanceDays(responseData?.minAdvanceDays));
    } catch (error) {
      setCalendarError(error.message || "Unable to load day-off settings.");
    }
  };

  const loadDashboardStats = useCallback(
    async ({ silent = false } = {}) => {
      if (isReadOnly) return;
      if (!silent) {
        setIsLoadingDashboardStats(true);
      }
      try {
        const statsAdminId = Number(user?.adminID);
        if (!Number.isInteger(statsAdminId) || statsAdminId <= 0) {
          throw new Error("Unable to detect admin account.");
        }
        const statsResponse = await fetch(`/api/dashboard/stats?adminID=${statsAdminId}`);
        const statsData = await statsResponse.json().catch(() => null);

        if (!statsResponse.ok) {
          throw new Error(statsData?.message || "Unable to load appointment stats.");
        }

        const pendingAppointments = Number(statsData?.pendingAppointments) || 0;
        const approvedToday = Number(statsData?.approvedToday) || 0;
        const ongoingAppointments = Number(statsData?.ongoingAppointments) || 0;
        const certificateRequests = Number(statsData?.certificateRequests) || 0;

        setDashboardStats({
          pendingAppointments,
          approvedToday,
          ongoingAppointments,
          certificateRequests,
        });
      } catch (error) {
        if (!silent) {
          setDashboardStats({
            pendingAppointments: 0,
            approvedToday: 0,
            ongoingAppointments: 0,
            certificateRequests: 0,
          });
          setCalendarError(error.message || "Unable to load dashboard stats.");
        }
      } finally {
        if (!silent) {
          setIsLoadingDashboardStats(false);
        }
      }
    },
    [isReadOnly, user?.adminID],
  );

  const loadOfficeStatus = useCallback(
    async ({ silent = false } = {}) => {
      const officeAdminID = isReadOnly ? resolvedReadOnlyAdminID : Number(user?.adminID);
      if (!Number.isInteger(officeAdminID) || officeAdminID <= 0) {
        setOfficeStatus((current) => ({
          ...current,
          office: {
            ...current.office,
            isOpen: false,
            statusLabel: "Closed",
            reason: "Unable to detect office account.",
            activeSchedule: null,
            nextOpening: null,
          },
        }));
        return;
      }
      if (!silent) {
        setIsLoadingOfficeStatus(true);
      }
      try {
        const response = await fetch(`/api/dashboard/office-status?adminID=${officeAdminID}`);
        const responseData = await response.json().catch(() => null);
        if (!response.ok || !responseData) {
          throw new Error(responseData?.message || "Unable to load office status.");
        }
        setOfficeStatus({
          timezone: String(responseData?.timezone || "Asia/Manila"),
          now: {
            dateISO: String(responseData?.now?.dateISO || "").trim(),
            dateLabel: String(responseData?.now?.dateLabel || "").trim(),
            timeLabel: String(responseData?.now?.timeLabel || "").trim(),
          },
          office: {
            isOpen: Boolean(responseData?.office?.isOpen),
            statusLabel: String(responseData?.office?.statusLabel || "").trim() || "Closed",
            reason: String(responseData?.office?.reason || "").trim() || "No office schedule available.",
            activeSchedule: responseData?.office?.activeSchedule || null,
            nextOpening: responseData?.office?.nextOpening || null,
          },
          generatedAt: String(responseData?.generatedAt || "").trim(),
        });
      } catch (error) {
        setOfficeStatus(buildLocalOfficeStatusFallbackRef.current());
        if (!silent) setCalendarError(error.message || "Unable to load office status.");
      } finally {
        if (!silent) {
          setIsLoadingOfficeStatus(false);
        }
      }
    },
    // The fallback builder changes whenever calendar entries or day-off settings load. It is read
    // through a ref so that those loads don't trigger another /dashboard/office-status request.
    [isReadOnly, resolvedReadOnlyAdminID, user?.adminID],
  );

  useEffect(() => {
    lastDashboardFetchRef.current = Date.now();
    loadCalendarEntries();
    loadParishActivities();
    loadDayOffSettings();
    if (!isReadOnly) {
      loadDashboardStats();
      loadPriestScheduleNotes();
    }
  }, [user?.adminID, isReadOnly, resolvedReadOnlyAdminID, loadDashboardStats, loadParishActivities]);

  useEffect(() => {
    loadOfficeStatus();
  }, [loadOfficeStatus]);

  useEffect(() => {
    if (isReadOnly) return;
    const requestedDate = new URLSearchParams(location.search).get("date") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return;
    const [year, month] = requestedDate.split("-").map(Number);
    setCalendarMonth(new Date(year, month - 1, 1));
    setSelectedDate(requestedDate);
    setIsDateSchedulesModalOpen(true);
    navigate(location.pathname, { replace: true });
  }, [isReadOnly, location.search, location.pathname, navigate]);

  useEffect(() => {
    const refreshDashboardData = () => {
      if (isAppointmentModalOpen || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastDashboardFetchRef.current < 20000) return;
      lastDashboardFetchRef.current = now;
      loadCalendarEntries();
      loadParishActivities({ silent: true });
      loadDayOffSettings();
      loadOfficeStatus({ silent: true });
      if (!isReadOnly) {
        loadDashboardStats({ silent: true });
        loadPriestScheduleNotes();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshDashboardData();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshDashboardData);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshDashboardData);
    };
  }, [
    isAppointmentModalOpen,
    isReadOnly,
    resolvedReadOnlyAdminID,
    resolvedDayOffAdminID,
    user?.adminID,
    loadDashboardStats,
    loadOfficeStatus,
    loadParishActivities,
  ]);

  const isPriestActivityForm = calendarForm.scheduleType === "priest_activity";
  const usesPriestSchedulePicker =
    isCalendarModalOpen &&
    (calendarForm.scheduleType === "parish_event" || calendarForm.scheduleType === "priest_schedule" || isPriestActivityForm);
  const selectedCalendarPriestID = Number(calendarForm.priestID);
  const selectedCalendarPriestEntries = useMemo(
    () =>
      (Array.isArray(calendarEntries) ? calendarEntries : []).filter((entry) =>
        isPriestAssignedCalendarEntry(entry, selectedCalendarPriestID),
      ),
    [calendarEntries, selectedCalendarPriestID],
  );
  const selectedCalendarDayEntries = useMemo(
    () => selectedCalendarPriestEntries.filter((entry) => toEventDateKey(entry?.eventDate) === String(calendarForm.eventDate || "").trim()),
    [calendarForm.eventDate, selectedCalendarPriestEntries],
  );
  const isEditingOriginalScheduleDate =
    Boolean(editingEntryId) &&
    /^\d{4}-\d{2}-\d{2}$/.test(editingOriginalEventDate) &&
    String(calendarForm.eventDate || "").trim() === editingOriginalEventDate;
  const calendarSlotOptions = useMemo(() => {
    if (
      remoteDayAvailability &&
      remoteDayAvailability.date === calendarForm.eventDate &&
      Number(remoteDayAvailability.priestID) === selectedCalendarPriestID &&
      Array.isArray(remoteDayAvailability.slots)
    ) {
      if (remoteDayAvailability.isLocked && isEditingOriginalScheduleDate) {
        return remoteDayAvailability.slots.map((slot) => ({
          ...slot,
          available: !remoteDayAvailability.isDayOff && !slot.conflictTitle,
        }));
      }
      return remoteDayAvailability.slots;
    }
    const isDayOff =
      dayOffSpecificDates.includes(calendarForm.eventDate) ||
      (Number.isInteger(dayOffWeekday) &&
        calendarForm.eventDate &&
        dayOffWeekday === new Date(`${calendarForm.eventDate}T00:00:00`).getDay());
    return getScheduleSlotsForDay(selectedCalendarDayEntries, editingEntryId, {
      isDayOff,
    });
  }, [
    calendarForm.eventDate,
    calendarForm.isSpecialProgram,
    dayOffSpecificDates,
    dayOffWeekday,
    editingEntryId,
    isEditingOriginalScheduleDate,
    remoteDayAvailability,
    selectedCalendarDayEntries,
    selectedCalendarPriestID,
  ]);
  const calendarDayExistingEntries = selectedCalendarDayEntries.filter(
    (entry) => !editingEntryId || Number(entry?.id) !== Number(editingEntryId),
  );
  const isMultiSlotCalendarForm = Boolean(calendarForm.isSpecialProgram) || isPriestActivityForm;
  const selectedCalendarSlots = Array.isArray(calendarForm.occupiedSlots) ? calendarForm.occupiedSlots : [];
  const priestActivityConflictEntry =
    isPriestActivityForm && selectedCalendarSlots.length
      ? calendarDayExistingEntries.find((entry) =>
          expandScheduleBusyRanges(entry).some((range) =>
            selectedCalendarSlots.some((slot) => {
              const slotStart = parseTimeToMinutes(slot.startTime);
              const slotEnd = parseTimeToMinutes(slot.endTime);
              return range.start < slotEnd && slotStart < range.end;
            }),
          ),
        ) || null
      : null;
  const selectedCalendarPriestName =
    priests.find((priest) => Number(priest.priestID) === selectedCalendarPriestID)?.fullName ||
    remoteDayAvailability?.priestName ||
    "Selected priest";
  const priestCalendarMonthLabel = priestCalendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const priestCalendarFirstDayIndex = new Date(priestCalendarMonth.getFullYear(), priestCalendarMonth.getMonth(), 1).getDay();
  const priestCalendarDaysInMonth = new Date(priestCalendarMonth.getFullYear(), priestCalendarMonth.getMonth() + 1, 0).getDate();
  const priestCalendarTodayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  const priestCalendarEntriesByDate = selectedCalendarPriestEntries.reduce((accumulator, entry) => {
    const dateKey = toEventDateKey(entry?.eventDate);
    if (!dateKey) return accumulator;
    accumulator[dateKey] = accumulator[dateKey] || [];
    accumulator[dateKey].push(entry);
    return accumulator;
  }, {});
  const isCalendarDayOff =
    Boolean(remoteDayAvailability?.date === calendarForm.eventDate && remoteDayAvailability.isDayOff) ||
    dayOffSpecificDates.includes(calendarForm.eventDate) ||
    (Number.isInteger(dayOffWeekday) &&
      calendarForm.eventDate &&
      dayOffWeekday === new Date(`${calendarForm.eventDate}T00:00:00`).getDay());
  const isCalendarDayLocked = Boolean(
    remoteDayAvailability?.date === calendarForm.eventDate &&
      remoteDayAvailability.isLocked &&
      !isEditingOriginalScheduleDate,
  );

  useEffect(() => {
    if (!usesPriestSchedulePicker) return undefined;
    if (!Number.isInteger(selectedCalendarPriestID) || selectedCalendarPriestID <= 0) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(calendarForm.eventDate || "").trim())) return undefined;
    if (!Number.isInteger(resolvedDayOffAdminID) || resolvedDayOffAdminID <= 0) return undefined;

    let isCancelled = false;
    const loadSlots = async () => {
      setIsLoadingScheduleSlots(true);
      try {
        const excludeQuery = editingEntryId ? `&excludeCalendarEntryID=${editingEntryId}` : "";
        const response = await fetch(
          `/admin-api/priests/${selectedCalendarPriestID}/available-slots?adminID=${resolvedDayOffAdminID}&date=${calendarForm.eventDate}${excludeQuery}&durationHours=1&minAdvanceDays=0`,
        );
        const payload = await response.json().catch(() => null);
        if (isCancelled) return;
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to load available time slots.");
        }
        setRemoteDayAvailability(payload);
      } catch (error) {
        if (!isCancelled) {
          setRemoteDayAvailability(null);
          setCalendarError(error.message || "Unable to load available time slots.");
        }
      } finally {
        if (!isCancelled) setIsLoadingScheduleSlots(false);
      }
    };
    void loadSlots();
    return () => {
      isCancelled = true;
    };
  }, [
    calendarForm.eventDate,
    calendarForm.isSpecialProgram,
    editingEntryId,
    resolvedDayOffAdminID,
    selectedCalendarPriestID,
    usesPriestSchedulePicker,
  ]);

  useEffect(() => {
    if (!isAppointmentModalOpen || !selectedSacrament) return;
    const selectedSacramentId = Number(selectedSacrament?.sacramentID);
    const selectedName = String(selectedSacrament?.sacramentName || "").trim().toLowerCase();
    if (selectedSacramentId <= 0 && !selectedName) return;
    const matchedSacrament = sacraments.find((candidate) => {
      const candidateId = Number(candidate?.sacramentID);
      if (selectedSacramentId > 0 && candidateId > 0) {
        return candidateId === selectedSacramentId;
      }
      return String(candidate?.sacramentName || "").trim().toLowerCase() === selectedName;
    });
    if (matchedSacrament) {
      setSelectedSacrament(matchedSacrament);
    }
  }, [isAppointmentModalOpen, sacraments, selectedSacrament]);

  useEffect(() => {
    const streamAccountType = accountType === "admin" ? "admin" : accountType === "user" ? "user" : null;
    const streamAccountID = streamAccountType === "admin" ? Number(user?.adminID) : Number(user?.userID);
    if (!streamAccountType || !Number.isInteger(streamAccountID) || streamAccountID <= 0) return undefined;

    const streamPath =
      streamAccountType === "admin"
        ? `/api/notifications/stream?accountType=admin&adminID=${streamAccountID}`
        : `/api/notifications/stream?accountType=user&userID=${streamAccountID}`;

    const refreshDashboardData = ({ includeSacramentData = false, includeScheduleData = true } = {}) => {
      if (isAppointmentModalOpenRef.current || document.hidden) return;
      const now = Date.now();
      if (now - lastDashboardFetchRef.current < 45000) return;
      lastDashboardFetchRef.current = now;
      if (includeScheduleData) {
        loadCalendarEntries();
        loadParishActivities({ silent: true });
        loadDayOffSettings();
        loadOfficeStatus({ silent: true });
        if (!isReadOnly) {
          loadDashboardStats({ silent: true });
          loadPriestScheduleNotes();
        }
      }
      if (includeSacramentData) {
        loadSacraments();
        loadSacramentFormSchemas();
        loadSpecialSacramentFormSchemas();
      }
    };

    const handleNotification = (event) => {
      try {
        const payload = JSON.parse(String(event?.data || "{}"));
        if (payload?.action && payload.action !== "realtime_update") return;
        const resource = String(payload?.resource || "").trim().toLowerCase();
        if (
          resource === "sacrament_form_schemas" ||
          resource === "sacraments" ||
          resource === "special_sacrament_form_schemas"
        ) {
          refreshDashboardData({ includeSacramentData: true, includeScheduleData: false });
          return;
        }
        if (
          resource &&
          resource !== "appointments" &&
          resource !== "calendar" &&
          resource !== "calendar_entries" &&
          resource !== "special_sacraments"
        ) {
          return;
        }
        refreshDashboardData();
      } catch {
        // Ignore malformed stream payloads.
      }
    };

    return subscribeNotificationStream(streamPath, { onNotification: handleNotification });
  }, [
    accountType,
    isReadOnly,
    loadOfficeStatus,
    loadDashboardStats,
    loadParishActivities,
    user?.adminID,
    user?.userID,
  ]);

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const openAppointmentModal = () => {
    setIsAppointmentModalOpen(true);
    setAppointmentStep("pick");
    setSelectedSacrament(null);
    setAppointmentCredentials({});
    setAppointmentNote("");
    setUseMarriageAccountDetails(false);
    setUseAccountPhoneNumber({});
    setAppointmentFormError("");
    loadSacraments();
    loadSacramentFormSchemas();
    loadSpecialSacramentFormSchemas();
  };

  const closeAppointmentModal = () => {
    setIsAppointmentModalOpen(false);
    setIsAppointmentSubmitConfirmOpen(false);
    setAppointmentStep("pick");
    setSelectedSacrament(null);
    setAppointmentCredentials({});
    setAppointmentNote("");
    setUseMarriageAccountDetails(false);
    setUseAccountPhoneNumber({});
    setAppointmentFormError("");
    setIsSubmittingAppointment(false);
  };

  const loadCertificateTypes = async () => {
    setIsLoadingCertificateTypes(true);
    setCertificateTypesError("");
    try {
      const response = await fetch("/api/certificate-types");
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load certificate types.");
      }
      const items = Array.isArray(responseData.items) ? responseData.items : [];
      setCertificateTypeOptions(items.filter((item) => item?.isArchived !== true && item?.is_archived !== true));
    } catch (error) {
      setCertificateTypeOptions([]);
      setCertificateTypesError(error.message || "Unable to load certificate types.");
    } finally {
      setIsLoadingCertificateTypes(false);
    }
  };

  const openCertificateTypeModal = () => {
    setIsCertificateTypeModalOpen(true);
    void loadCertificateTypes();
  };

  const closeCertificateTypeModal = () => {
    setIsCertificateTypeModalOpen(false);
  };

  const closeCertificateRequestModal = () => {
    setIsCertificateRequestModalOpen(false);
    setIsCertificateSubmitConfirmOpen(false);
    setCertificateRequestStep("details");
    setUseMarriageCertificateAccountDetails(false);
    setUseCertificateAccountPhoneNumber({});
    setSelectedCertificateType("");
    setSelectedCertificateTypeId(null);
    setSelectedCertificateTypeLabel("");
    setCertificateRequestValues({});
    setCertificateRequestError("");
    setIsSubmittingCertificateRequest(false);
  };

  const openAddParishActivityModal = () => {
    if (!canManageParishActivities) return;
    setEditingParishActivityId(null);
    setParishActivityForm(buildEmptyParishActivityForm());
    setParishActivityCoverFileLabel("");
    setParishActivityImageBusyKey("");
    setParishActivityMediaRemovingIndex(null);
    setParishActivitiesError("");
    setIsParishActivityModalOpen(true);
  };

  const openEditParishActivityModal = (entry) => {
    if (!canManageParishActivities) return;
    setEditingParishActivityId(Number(entry?.id) || null);
    const nextMedia = normalizeParishActivityMediaForForm(entry);
    const legacySummary = String(entry?.summary || "").trim();
    if (legacySummary && nextMedia.length > 0 && !nextMedia.some((item) => item.summary)) {
      nextMedia[0] = { ...nextMedia[0], summary: legacySummary };
    }
    setParishActivityForm({
      title: String(entry?.title || "").trim(),
      activityDate: String(entry?.activityDate || "").trim() || getTodayIsoDate(),
      activityDateDisplay: isoToUsDate(String(entry?.activityDate || "").trim() || getTodayIsoDate()),
      expiresOn: String(entry?.expiresOn || "").trim(),
      expiresOnDisplay: isoToUsDate(String(entry?.expiresOn || "").trim()),
      summary: "",
      media: nextMedia,
    });
    const mediaCount = nextMedia.length;
    setParishActivityCoverFileLabel(mediaCount > 0 ? `${mediaCount} file(s) attached` : "");
    setParishActivityImageBusyKey("");
    setParishActivitiesError("");
    setIsParishActivityModalOpen(true);
  };

  const closeParishActivityModal = () => {
    setIsParishActivityModalOpen(false);
    setIsSavingParishActivity(false);
    setIsDeletingParishActivity(false);
    setEditingParishActivityId(null);
    setParishActivityCoverFileLabel("");
    setParishActivityImageBusyKey("");
    setParishActivityMediaRemovingIndex(null);
    setParishActivityForm(buildEmptyParishActivityForm());
  };

  const openParishActivityDetailsModal = (entry) => {
    setSelectedParishActivity(entry || null);
    setIsParishActivityDetailsModalOpen(true);
  };

  const closeParishActivityDetailsModal = () => {
    setIsParishActivityDetailsModalOpen(false);
    setSelectedParishActivity(null);
  };

  const handleParishActivityInputChange = (event) => {
    const { name, value } = event.target;
    setParishActivityForm((current) => ({
      ...current,
      [name]: value,
    }));
    setParishActivitiesError("");
  };

  const handleParishActivityMediaFileChange = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    for (const file of selectedFiles) {
      if (!isLikelyParishActivityMediaFile(file)) {
        setParishActivitiesError("Only image and video files are allowed (JPG, PNG, WEBP, MP4, WEBM, MOV).");
        return;
      }
      if (isParishActivityVideoFile(file)) {
        if (file.size > PARISH_ACTIVITY_VIDEO_MAX_BYTES) {
          setParishActivitiesError("Each video must be 100MB or smaller.");
          return;
        }
        try {
          const durationSeconds = await readVideoDurationSeconds(file);
          if (durationSeconds > PARISH_ACTIVITY_MAX_VIDEO_DURATION_SECONDS) {
            setParishActivitiesError("Each video must be shorter than 5 minutes.");
            return;
          }
        } catch (error) {
          setParishActivitiesError(error.message || "Unable to validate the selected video.");
          return;
        }
      } else if (file.size > PARISH_ACTIVITY_IMAGE_MAX_BYTES) {
        setParishActivitiesError("Each image must be 8MB or smaller.");
        return;
      }
    }

    setParishActivityImageBusyKey("cover");
    setParishActivitiesError("");
    try {
      const uploadedMedia = [];
      for (const file of selectedFiles) {
        uploadedMedia.push(await uploadParishActivityMediaFile(file));
      }
      setParishActivityForm((current) => {
        const nextMedia = [...(Array.isArray(current?.media) ? current.media : []), ...uploadedMedia];
        setParishActivityCoverFileLabel(nextMedia.length > 0 ? `${nextMedia.length} file(s) attached` : "No files chosen");
        return {
          ...current,
          media: nextMedia,
        };
      });
    } catch (error) {
      setParishActivitiesError(error.message || "Unable to upload parish activity media.");
    } finally {
      setParishActivityImageBusyKey("");
      event.target.value = "";
    }
  };

  const removeParishActivityMediaItem = async (index) => {
    const currentMedia = Array.isArray(parishActivityForm.media) ? parishActivityForm.media : [];
    const item = currentMedia[index];
    if (!item) return;

    const filePath = String(item?.filePath || item?.url || "").trim();
    const resolvedAdminID = isReadOnly ? resolvedReadOnlyAdminID : Number(user?.adminID);

    if (filePath && !isLocalPreviewUrl(filePath)) {
      if (!Number.isInteger(resolvedAdminID) || resolvedAdminID <= 0) {
        setParishActivitiesError("Unable to detect parish account for this activity.");
        return;
      }
      setParishActivityMediaRemovingIndex(index);
      setParishActivitiesError("");
      try {
        await deleteParishActivityMediaFromServer({
          filePath,
          adminID: resolvedAdminID,
          activityID: Number.isInteger(editingParishActivityId) && editingParishActivityId > 0 ? editingParishActivityId : undefined,
        });
        if (Number.isInteger(editingParishActivityId) && editingParishActivityId > 0) {
          await loadParishActivities();
        }
      } catch (error) {
        setParishActivitiesError(error.message || "Unable to remove parish activity media.");
        setParishActivityMediaRemovingIndex(null);
        return;
      } finally {
        setParishActivityMediaRemovingIndex(null);
      }
    }

    setParishActivityForm((current) => {
      const nextMedia = [...(Array.isArray(current?.media) ? current.media : [])];
      if (index < 0 || index >= nextMedia.length) return current;
      nextMedia.splice(index, 1);
      setParishActivityCoverFileLabel(nextMedia.length > 0 ? `${nextMedia.length} file(s) attached` : "No files chosen");
      return {
        ...current,
        media: nextMedia,
      };
    });
    setParishActivitiesError("");
  };

  const handleParishActivityMediaFieldChange = (index, field, value) => {
    setParishActivityForm((current) => {
      const nextMedia = [...(Array.isArray(current?.media) ? current.media : [])];
      if (!nextMedia[index]) return current;
      nextMedia[index] = {
        ...nextMedia[index],
        [field]: value,
      };
      return {
        ...current,
        media: nextMedia,
      };
    });
  };

  const handleSaveParishActivity = async (event) => {
    event.preventDefault();
    if (!canManageParishActivities) {
      setParishActivitiesError("Only the parish secretary can manage parish activities.");
      return;
    }
    const resolvedAdminID = isReadOnly ? resolvedReadOnlyAdminID : Number(user?.adminID);
    if (!Number.isInteger(resolvedAdminID) || resolvedAdminID <= 0) {
      setParishActivitiesError("Unable to detect parish account for this activity.");
      return;
    }

    const normalizedMedia = (Array.isArray(parishActivityForm.media) ? parishActivityForm.media : [])
      .map((item) => {
        const filePath = String(item?.filePath || item?.url || "").trim();
        return {
          type: item?.type === "video" ? "video" : "image",
          filePath,
          url: filePath,
          fileName: String(item?.fileName || "").trim(),
          summary: String(item?.summary || "").trim(),
        };
      })
      .filter((item) => item.filePath && !isLocalPreviewUrl(item.filePath));
    const firstImage = normalizedMedia.find((item) => item.type === "image");

    const payload = {
      adminID: resolvedAdminID,
      title: String(parishActivityForm.title || "").trim(),
      activityDate: String(parishActivityForm.activityDate || "").trim(),
      expiresOn: String(parishActivityForm.expiresOn || "").trim(),
      imageUrl: String(firstImage?.filePath || "").trim(),
      media: normalizedMedia,
      summary: "",
      details: "",
      slides: [],
    };

    if (!payload.title || !payload.activityDate) {
      setParishActivitiesError("Please fill in the activity title and date.");
      return;
    }
    if (String(parishActivityForm.expiresOnDisplay || "").trim() && !payload.expiresOn) {
      setParishActivitiesError("Enter a complete expiration date, or leave it blank.");
      return;
    }
    if (payload.expiresOn && payload.expiresOn < payload.activityDate) {
      setParishActivitiesError("Expiration date cannot be earlier than the activity date.");
      return;
    }
    if (parishActivityImageBusyKey || parishActivityMediaRemovingIndex !== null) {
      setParishActivitiesError("Please wait for the media upload or removal to finish.");
      return;
    }

    setIsSavingParishActivity(true);
    setParishActivitiesError("");
    try {
      const isEditing = Number.isInteger(editingParishActivityId) && editingParishActivityId > 0;
      const endpoint = isEditing ? `/admin-api/parish-activities/${editingParishActivityId}` : "/admin-api/parish-activities";
      const response = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData?.message || "Unable to save parish activity.");
      }

      await loadParishActivities();
      closeParishActivityModal();
      setCalendarNotice(isEditing ? "Parish activity updated successfully." : "Parish activity added successfully.");
    } catch (error) {
      setParishActivitiesError(error.message || "Unable to save parish activity.");
    } finally {
      setIsSavingParishActivity(false);
    }
  };

  const handleDeleteParishActivity = async () => {
    if (!canManageParishActivities) {
      setParishActivitiesError("Only the parish secretary can manage parish activities.");
      return;
    }
    if (!Number.isInteger(editingParishActivityId) || editingParishActivityId <= 0) {
      setParishActivitiesError("Please select a valid parish activity to delete.");
      return;
    }
    const resolvedAdminID = isReadOnly ? resolvedReadOnlyAdminID : Number(user?.adminID);
    if (!Number.isInteger(resolvedAdminID) || resolvedAdminID <= 0) {
      setParishActivitiesError("Unable to detect parish account for this activity.");
      return;
    }

    const shouldDelete = window.confirm("Delete this parish activity permanently?");
    if (!shouldDelete) return;

    setIsDeletingParishActivity(true);
    setParishActivitiesError("");
    try {
      const response = await fetch(
        `/admin-api/parish-activities/${editingParishActivityId}?adminID=${resolvedAdminID}`,
        { method: "DELETE" },
      );
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData?.message || "Unable to delete parish activity.");
      }

      setParishActivities((current) => current.filter((entry) => Number(entry?.id) !== editingParishActivityId));
      closeParishActivityModal();
      setCalendarNotice("Parish activity deleted successfully.");
    } catch (error) {
      setParishActivitiesError(error.message || "Unable to delete parish activity.");
    } finally {
      setIsDeletingParishActivity(false);
    }
  };

  const certificateRequestSchema = useMemo(() => {
    const selectedType = certificateTypeOptions.find((item) => item.certificateTypeID === selectedCertificateTypeId);
    return toCertificateRequestFields(selectedType?.formSchema);
  }, [certificateTypeOptions, selectedCertificateTypeId]);

  const selectedCertificateTypeFee = useMemo(() => {
    const selectedType = certificateTypeOptions.find((item) => item.certificateTypeID === selectedCertificateTypeId);
    return selectedType?.fee ?? null;
  }, [certificateTypeOptions, selectedCertificateTypeId]);

  const initializeCertificateRequestValues = (formSchema) => {
    const schema = toCertificateRequestFields(formSchema);
    return schema.reduce((accumulator, field) => {
      accumulator[field.key] = field.type === "select" ? String(field.options?.[0] || "") : "";
      return accumulator;
    }, {});
  };

  const handleSelectCertificateType = (certificate) => {
    const typeId = Number(certificate?.certificateTypeID);
    if (!Number.isInteger(typeId) || typeId <= 0) return;
    const label = String(certificate?.certTypeName || "").trim();
    setIsCertificateTypeModalOpen(false);
    setCertificateRequestStep("details");
    setUseMarriageCertificateAccountDetails(false);
    setUseCertificateAccountPhoneNumber({});
    setSelectedCertificateTypeId(typeId);
    setSelectedCertificateTypeLabel(label);
    setSelectedCertificateType(getCertificateTypeCategory(label));
    setCertificateRequestValues(initializeCertificateRequestValues(certificate?.formSchema));
    setCertificateRequestError("");
    setIsSubmittingCertificateRequest(false);
    setIsCertificateRequestModalOpen(true);
  };

  const handleCertificateRequestFieldChange = (event) => {
    const { name, value } = event.target;
    if (isReadOnly && name === "fullName") {
      return;
    }
    const normalizedValue = isPhoneFieldKey(name) ? normalizeMobileInput(value) : value;
    setCertificateRequestValues((current) => ({
      ...current,
      [name]: normalizedValue,
    }));
    setCertificateRequestError("");
  };

  const handleUseCertificateAccountPhoneNumberToggle = (fieldKey, isChecked) => {
    if (!isReadOnly || !fieldKey) return;
    if (!isChecked) {
      setUseCertificateAccountPhoneNumber((current) => ({ ...current, [fieldKey]: false }));
      setCertificateRequestValues((current) => ({
        ...current,
        [fieldKey]: "",
      }));
      setCertificateRequestError("");
      return;
    }

    const accountPhoneNumber = normalizeMobileInput(String(user?.contactNumber || "").trim());
    if (!PHONE_NUMBER_REGEX.test(accountPhoneNumber)) {
      setUseCertificateAccountPhoneNumber((current) => ({ ...current, [fieldKey]: false }));
      setCertificateRequestError("Please set a valid contact number in your Profile first.");
      return;
    }

    setUseCertificateAccountPhoneNumber((current) => ({ ...current, [fieldKey]: true }));
    setCertificateRequestError("");
    setCertificateRequestValues((current) => ({
      ...current,
      [fieldKey]: accountPhoneNumber,
    }));
  };

  const isMarriageCertificateDetailsStep = selectedCertificateType === "marriage" && certificateRequestStep === "details";
  const marriageCertificateAccountRole = getMarriageAccountRoleByGender(
    String(resolvedUserGender || user?.gender || "").trim().toLowerCase(),
  );
  const marriageCertificateAccountTargetFieldKey = marriageCertificateAccountRole ? `${marriageCertificateAccountRole}FullName` : null;
  const marriageCertificateAccountTargetPhoneFieldKey = marriageCertificateAccountRole
    ? `${marriageCertificateAccountRole}PhoneNumber`
    : null;
  const marriageCertificateAccountTargetAgeFieldKey = marriageCertificateAccountRole ? `${marriageCertificateAccountRole}Age` : null;

  const applyMarriageCertificateAccountDetails = (
    roleOverride = marriageCertificateAccountRole,
    birthdateOverride = String(resolvedUserBirthdate || user?.birthdate || "").trim(),
  ) => {
    if (!isMarriageCertificateDetailsStep) return;
    if (!roleOverride) return;
    const targetNameFieldKey = `${roleOverride}FullName`;
    const targetPhoneFieldKey = `${roleOverride}PhoneNumber`;
    const targetAgeFieldKey = `${roleOverride}Age`;

    const accountFullName =
      String(user?.fullName || "").trim() ||
      String(user?.userName || "").trim() ||
      String(user?.email || "").trim();
    const accountPhoneNumber = String(user?.contactNumber || "")
      .replace(/\D/g, "")
      .slice(0, 11);
    const accountBirthdate = String(birthdateOverride || "").trim();
    const computedAge = calculateAgeFromBirthdate(accountBirthdate);

    if (!accountFullName && !accountPhoneNumber && !computedAge) return;

    setCertificateRequestValues((current) => ({
      ...current,
      ...(accountFullName ? { [targetNameFieldKey]: accountFullName } : {}),
      ...(accountPhoneNumber ? { [targetPhoneFieldKey]: accountPhoneNumber } : {}),
      ...(computedAge ? { [targetAgeFieldKey]: computedAge } : {}),
    }));
  };

  const handleMarriageCertificateAccountDetailsToggle = async (isChecked) => {
    if (!isMarriageCertificateDetailsStep) return;
    if (!isChecked) {
      setUseMarriageCertificateAccountDetails(false);
      setCertificateRequestValues((current) => {
        const next = { ...current };
        const clearRoleFields = (role) => {
          next[`${role}FullName`] = "";
          next[`${role}PhoneNumber`] = "";
          next[`${role}Age`] = "";
        };
        if (marriageCertificateAccountRole) {
          clearRoleFields(marriageCertificateAccountRole);
        } else {
          clearRoleFields("bride");
          clearRoleFields("groom");
        }
        return next;
      });
      setCertificateRequestError("");
      return;
    }

    let targetRole = marriageCertificateAccountRole;
    let targetBirthdate = String(resolvedUserBirthdate || user?.birthdate || "").trim();
    if (!targetRole) {
      try {
        const latestProfile = await fetchLatestUserProfile();
        targetRole = getMarriageAccountRoleByGender(latestProfile?.gender);
        targetBirthdate = String(latestProfile?.birthdate || targetBirthdate).trim();
      } catch (error) {
        setCertificateRequestError(error.message || "Unable to load account details.");
        return;
      }
    }
    if (!targetBirthdate) {
      try {
        const latestProfile = await fetchLatestUserProfile();
        targetBirthdate = String(latestProfile?.birthdate || "").trim();
        if (!targetRole) {
          targetRole = getMarriageAccountRoleByGender(latestProfile?.gender);
        }
      } catch (error) {
        setCertificateRequestError(error.message || "Unable to load account details.");
        return;
      }
    }
    if (!targetRole) {
      setCertificateRequestError("Please set your gender in Profile first so we can map your account details to bride or groom.");
      return;
    }

    setUseMarriageCertificateAccountDetails(true);
    setCertificateRequestError("");
    applyMarriageCertificateAccountDetails(targetRole, targetBirthdate);
  };

  useEffect(() => {
    if (!useMarriageCertificateAccountDetails) return;
    applyMarriageCertificateAccountDetails();
  }, [
    useMarriageCertificateAccountDetails,
    isMarriageCertificateDetailsStep,
    marriageCertificateAccountRole,
    marriageCertificateAccountTargetFieldKey,
    marriageCertificateAccountTargetPhoneFieldKey,
    marriageCertificateAccountTargetAgeFieldKey,
    resolvedUserBirthdate,
    user?.birthdate,
    user?.fullName,
    user?.userName,
    user?.email,
    user?.contactNumber,
  ]);

  const validateCertificateRequestForm = () => {
    if (!selectedCertificateTypeId) {
      return "Please select a certificate type first.";
    }
    if (!certificateRequestSchema.length) {
      return "This certificate type has no form fields yet.";
    }

    for (const field of certificateRequestSchema) {
      const value = String(certificateRequestValues[field.key] || "").trim();
      if (!value) {
        if (field.required === false) continue;
        return `${field.label} is required.`;
      }
      if (isPhoneFieldKey(field.key) && value && !PHONE_NUMBER_REGEX.test(value)) {
        return "Contact number must be 11 digits and start with 09.";
      }
    }

    return "";
  };

  const handleProceedToCertificateReview = (event) => {
    event.preventDefault();
    const validationMessage = validateCertificateRequestForm();
    if (validationMessage) {
      setCertificateRequestError(validationMessage);
      return;
    }
    setCertificateRequestError("");
    setCertificateRequestStep("review");
  };

  const handleBackToCertificateDetails = () => {
    setCertificateRequestStep("details");
    setCertificateRequestError("");
  };

  const handleBackToCertificateTypes = () => {
    closeCertificateRequestModal();
    setIsCertificateTypeModalOpen(true);
  };

  const handleSubmitCertificateRequest = async () => {
    const validationMessage = validateCertificateRequestForm();
    if (validationMessage) {
      setCertificateRequestError(validationMessage);
      setCertificateRequestStep("details");
      return;
    }
    const isOnsiteRecord = !isReadOnly;
    const normalizedUserId = Number(user?.userID);
    if (!isOnsiteRecord && (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0)) {
      setCertificateRequestError("Please sign in again before submitting a certificate request.");
      return;
    }
    setIsSubmittingCertificateRequest(true);
    setCertificateRequestError("");
    try {
      const credentials = certificateRequestSchema.reduce((accumulator, field) => {
        accumulator[field.key] = String(certificateRequestValues[field.key] || "").trim();
        return accumulator;
      }, {});
      const response = await fetch("/api/certificate-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isOnsiteRecord ? { requestSource: "onsite" } : { userID: normalizedUserId }),
          certificateTypeID: selectedCertificateTypeId,
          credentials,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(responseData?.message || "").trim() || "Unable to submit certificate request.");
      }

      setIsCertificateSubmitConfirmOpen(false);
      closeCertificateRequestModal();
      if (isOnsiteRecord) {
        pushUiNotice("Onsite certificate request recorded. Mark it done after the certificate is released.");
        navigate("/admin/certificate-requests?status=approved");
        return;
      }
      const resolvedParishDashboardPath = parishId ? `/dashboard/parish/${parishId}` : "/dashboard";
      pushUiNotice("Certificate request sent successfully.");
      navigate(resolvedParishDashboardPath, {
        replace: true,
        state: selectedParish ? { selectedParish } : null,
      });
    } catch (error) {
      setCertificateRequestError(error.message || "Unable to submit certificate request.");
    } finally {
      setIsSubmittingCertificateRequest(false);
    }
  };

  const handleOpenCertificateSubmitConfirm = () => {
    const validationMessage = validateCertificateRequestForm();
    if (validationMessage) {
      setCertificateRequestError(validationMessage);
      setCertificateRequestStep("details");
      return;
    }
    setCertificateRequestError("");
    setIsCertificateSubmitConfirmOpen(true);
  };

  const confirmSubmitCertificateRequest = async () => {
    await handleSubmitCertificateRequest();
  };

  const selectedSacramentSchemaFields = useMemo(() => {
    if (!selectedSacrament) return [];
    if (selectedSacrament.isSpecialProgram) {
      const matchedSchema = findSpecialSacramentSchemaByProgramName(
        specialSacramentFormSchemas,
        selectedSacrament.sacramentName,
      );
      return Array.isArray(matchedSchema?.formSchema?.fields) ? matchedSchema.formSchema.fields : [];
    }
    return getSchemaBySacramentName(
      sacramentFormSchemaConfig,
      selectedSacrament.sacramentName || selectedSacrament.name || "",
    );
  }, [selectedSacrament, sacramentFormSchemaConfig, specialSacramentFormSchemas]);
  const appointmentFields = useMemo(() => {
    const sacramentName = selectedSacrament?.sacramentName || selectedSacrament?.name || "";
    if (selectedSacrament?.isSpecialProgram) {
      const matchedSchema = findSpecialSacramentSchemaByProgramName(
        specialSacramentFormSchemas,
        selectedSacrament?.sacramentName,
      );
      return normalizeSpecialProgramFields(matchedSchema?.formSchema);
    }
    const schemaFields = getSchemaBySacramentName(sacramentFormSchemaConfig, sacramentName);
    return ensureSacramentRequiredFields(schemaFields, sacramentName);
  }, [selectedSacrament, sacramentFormSchemaConfig, specialSacramentFormSchemas]);
  const regularAppointmentFields = useMemo(
    () => appointmentFields.filter((field) => String(field?.type || "").trim().toLowerCase() !== "list"),
    [appointmentFields],
  );
  const listAppointmentFields = useMemo(
    () => appointmentFields.filter((field) => String(field?.type || "").trim().toLowerCase() === "list"),
    [appointmentFields],
  );
  const marriageRequiredDocumentItems = useMemo(
    () => getRequirementItems(sacramentFormSchemaConfig, "marriage", "documents"),
    [sacramentFormSchemaConfig],
  );
  const marriageNonDocumentItems = useMemo(
    () => getRequirementItems(sacramentFormSchemaConfig, "marriage", "nonDocuments"),
    [sacramentFormSchemaConfig],
  );
  const deathMassRequiredDocumentItems = useMemo(
    () => getRequirementItems(sacramentFormSchemaConfig, "death_mass", "documents"),
    [sacramentFormSchemaConfig],
  );
  const baptismRequiredDocumentItems = useMemo(
    () => getRequirementItems(sacramentFormSchemaConfig, "baptism", "documents"),
    [sacramentFormSchemaConfig],
  );
  const baptismNonDocumentItems = useMemo(
    () => getRequirementItems(sacramentFormSchemaConfig, "baptism", "nonDocuments"),
    [sacramentFormSchemaConfig],
  );
  const matchedSpecialProgramFormSchema = useMemo(() => {
    if (!selectedSacrament?.isSpecialProgram) return null;
    return findSpecialSacramentSchemaByProgramName(specialSacramentFormSchemas, selectedSacrament?.sacramentName)?.formSchema || null;
  }, [selectedSacrament, specialSacramentFormSchemas]);
  const specialProgramRequiredDocumentItems = useMemo(
    () => normalizeRequirementLines(matchedSpecialProgramFormSchema?.requirements?.documents),
    [matchedSpecialProgramFormSchema],
  );
  const specialProgramNonDocumentItems = useMemo(
    () => normalizeRequirementLines(matchedSpecialProgramFormSchema?.requirements?.nonDocuments),
    [matchedSpecialProgramFormSchema],
  );

  const handleSelectSacrament = (sacrament) => {
    const fields = ensureSacramentRequiredFields(
      getSchemaBySacramentName(sacramentFormSchemaConfig, sacrament?.sacramentName || ""),
      sacrament?.sacramentName || "",
    );
    const nextCredentials = fields.reduce((accumulator, field) => {
      if (field.type === "list") {
        accumulator[field.key] = createDefaultListValue(parseListFieldConfig(field).minEntries);
      } else if (field.type === "select") {
        accumulator[field.key] = String(field.options?.[0] || "");
      } else if (field.type === "file") {
        accumulator[field.key] = null;
      } else {
        accumulator[field.key] = "";
      }
      return accumulator;
    }, {});
    setSelectedSacrament(sacrament);
    setAppointmentCredentials(nextCredentials);
    setAppointmentNote("");
    setUseMarriageAccountDetails(false);
    setUseAccountPhoneNumber({});
    setAppointmentFormError("");
    const sacramentKey = normalizeSacramentKey(sacrament?.sacramentName);
    if (isReadOnly && sacrament?.isSpecialProgram) {
      setAppointmentStep("special_program_docs");
    } else if (isReadOnly && sacramentKey === "marriage") {
      setAppointmentStep("marriage_docs");
    } else if (isReadOnly && isDeathMassSacramentKey(sacramentKey)) {
      setAppointmentStep("death_mass_docs");
    } else if (isReadOnly && isBaptismChristeningSacramentKey(sacramentKey)) {
      setAppointmentStep("baptism_docs");
    } else {
      setAppointmentStep("details");
    }
  };

  useEffect(() => {
    if (!selectedSacrament || !isAppointmentModalOpen) return;
    setAppointmentCredentials((current) => {
      const nextCredentials = {};
      for (const field of appointmentFields) {
        if (field.type === "list") {
          nextCredentials[field.key] = Array.isArray(current[field.key])
            ? current[field.key]
            : createDefaultListValue(parseListFieldConfig(field).minEntries);
          continue;
        }
        if (field.type === "file") {
          nextCredentials[field.key] = current[field.key] instanceof File ? current[field.key] : null;
          continue;
        }
        if (field.type === "select") {
          const options = Array.isArray(field.options) ? field.options : [];
          const currentValue = String(current[field.key] || "");
          nextCredentials[field.key] = options.includes(currentValue) ? currentValue : String(options[0] || "");
          continue;
        }
        nextCredentials[field.key] = String(current[field.key] || "");
      }
      return nextCredentials;
    });
  }, [appointmentFields, isAppointmentModalOpen, selectedSacrament]);

  const handleContinueFromAppointmentPrerequisite = async () => {
    if (appointmentStep === "special_program_docs" && isReadOnly) {
      const programID = Number(selectedSacrament?.s_sacramentID);
      const userID = Number(user?.userID);
      if (Number.isInteger(programID) && programID > 0 && Number.isInteger(userID) && userID > 0) {
        try {
          const response = await fetch("/api/appointments", { cache: "no-store" });
          const rows = await response.json().catch(() => []);
          const alreadyApplied = Array.isArray(rows) && rows.some((item) =>
            Number(item?.userID) === userID &&
            Number(item?.s_sacramentID) === programID &&
            item?.isArchived !== true,
          );
          if (alreadyApplied) {
            setIsSpecialProgramOnceNoticeOpen(true);
            return;
          }
        } catch {
          setAppointmentFormError("");
        }
      }
    }
    setAppointmentFormError("");
    setAppointmentStep("details");
  };

  const handleAppointmentCredentialChange = (event) => {
    const { name, value } = event.target;
    const normalizedValue = isPhoneFieldKey(name) ? normalizeMobileInput(value) : value;
    setAppointmentCredentials((current) => ({
      ...current,
      [name]: normalizedValue,
    }));
    setAppointmentFormError("");
  };

  const handleUseAccountPhoneNumberToggle = (fieldKey, isChecked) => {
    if (!isReadOnly || !fieldKey) return;

    if (!isChecked) {
      setUseAccountPhoneNumber((current) => ({ ...current, [fieldKey]: false }));
      setAppointmentCredentials((current) => ({
        ...current,
        [fieldKey]: "",
      }));
      setAppointmentFormError("");
      return;
    }

    const accountPhoneNumber = normalizeMobileInput(String(user?.contactNumber || "").trim());
    if (!PHONE_NUMBER_REGEX.test(accountPhoneNumber)) {
      setUseAccountPhoneNumber((current) => ({ ...current, [fieldKey]: false }));
      setAppointmentFormError("Please set a valid contact number in your Profile first.");
      return;
    }

    setUseAccountPhoneNumber((current) => ({ ...current, [fieldKey]: true }));
    setAppointmentCredentials((current) => ({
      ...current,
      [fieldKey]: accountPhoneNumber,
    }));
    setAppointmentFormError("");
  };

  const isAllowedAppointmentDocument = (file) => {
    if (!(file instanceof File)) return false;
    const normalizedType = String(file.type || "").toLowerCase();
    const normalizedName = String(file.name || "").toLowerCase();
    const isPdf = normalizedType === "application/pdf" || normalizedName.endsWith(".pdf");
    const isDocx =
      normalizedType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      normalizedName.endsWith(".docx");
    const isGif = normalizedType === "image/gif" || normalizedName.endsWith(".gif");
    const isImage = normalizedType.startsWith("image/");
    return isPdf || isDocx || (isImage && !isGif);
  };

  const handleAppointmentFileChange = (event) => {
    const { name, files } = event.target;
    const selectedFile = files && files[0] ? files[0] : null;
    if (selectedFile && !isAllowedAppointmentDocument(selectedFile)) {
      event.target.value = "";
      setAppointmentCredentials((current) => ({
        ...current,
        [name]: null,
      }));
      setAppointmentFormError("Only PDF, DOCX, and non-GIF image files are allowed.");
      return;
    }
    setAppointmentCredentials((current) => ({
      ...current,
      [name]: selectedFile,
    }));
    setAppointmentFormError("");
  };

  const normalizedSelectedSacramentName = normalizeSacramentKey(selectedSacrament?.sacramentName || selectedSacrament?.name || "");
  const isMarriageDetailsStep = appointmentStep === "details" && normalizedSelectedSacramentName === "marriage";
  const isUserDashboardMarriageFlow = isReadOnly && isMarriageDetailsStep;
  const normalizedUserGender = String(resolvedUserGender || user?.gender || "").trim().toLowerCase();
  const marriageAccountRole = getMarriageAccountRoleByGender(normalizedUserGender);
  const marriageAccountTargetFieldKey = marriageAccountRole ? `${marriageAccountRole}Name` : null;
  const marriageAccountTargetPhoneFieldKey = marriageAccountRole ? `${marriageAccountRole}PhoneNumber` : null;
  const marriageAccountTargetAgeFieldKey = marriageAccountRole ? `${marriageAccountRole}Age` : null;
  const marriageAccountTargetAddressFieldKey = marriageAccountRole ? `${marriageAccountRole}Address` : null;

  useEffect(() => {
    setResolvedUserGender(String(user?.gender || "").trim().toLowerCase());
    setResolvedUserBirthdate(String(user?.birthdate || "").trim());
  }, [user?.gender, user?.birthdate]);

  const applyMarriageAccountDetails = (
    roleOverride = marriageAccountRole,
    birthdateOverride = String(resolvedUserBirthdate || user?.birthdate || "").trim(),
  ) => {
    if (!isUserDashboardMarriageFlow) return;
    if (!roleOverride) return;
    const targetNameFieldKey = `${roleOverride}Name`;
    const targetPhoneFieldKey = `${roleOverride}PhoneNumber`;

    const accountFullName =
      String(user?.fullName || "").trim() ||
      String(user?.userName || "").trim() ||
      String(user?.email || "").trim();
    const accountPhoneNumber = String(user?.contactNumber || "")
      .replace(/\D/g, "")
      .slice(0, 11);
    const accountAddress = String(user?.address || "").trim();
    const accountBirthdate = String(birthdateOverride || "").trim();
    const computedAge = calculateAgeFromBirthdate(accountBirthdate);

    if (!accountFullName && !accountPhoneNumber && !accountAddress && !computedAge) return;

    setAppointmentCredentials((current) => ({
      ...current,
      ...(accountFullName ? { [targetNameFieldKey]: accountFullName } : {}),
      ...(accountPhoneNumber ? { [targetPhoneFieldKey]: accountPhoneNumber } : {}),
      ...(accountAddress ? { [`${roleOverride}Address`]: accountAddress } : {}),
      ...(computedAge && marriageAccountTargetAgeFieldKey ? { [marriageAccountTargetAgeFieldKey]: computedAge } : {}),
    }));
  };

  const fetchLatestUserProfile = async () => {
    if (!isReadOnly) return "";
    const accountId = Number(user?.userID);
    if (!Number.isInteger(accountId) || accountId <= 0) return "";
    const response = await fetch(`/api/profile?accountType=user&accountID=${accountId}`);
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseData.message || "Unable to fetch latest profile details.");
    }
    const latestGender = String(responseData?.user?.gender || "").trim().toLowerCase();
    const latestBirthdate = String(responseData?.user?.birthdate || "").trim();
    if (latestGender) {
      setResolvedUserGender(latestGender);
    }
    if (latestBirthdate) {
      setResolvedUserBirthdate(latestBirthdate);
    }
    return {
      gender: latestGender,
      birthdate: latestBirthdate,
    };
  };

  const handleMarriageAccountDetailsToggle = async (isChecked) => {
    if (!isUserDashboardMarriageFlow) return;
    if (!isChecked) {
      setUseMarriageAccountDetails(false);
      setAppointmentCredentials((current) => {
        const next = { ...current };
        const clearRoleFields = (role) => {
          next[`${role}Name`] = "";
          next[`${role}PhoneNumber`] = "";
          next[`${role}Age`] = "";
          next[`${role}Address`] = "";
        };
        if (marriageAccountRole) {
          clearRoleFields(marriageAccountRole);
        } else {
          clearRoleFields("bride");
          clearRoleFields("groom");
        }
        return next;
      });
      setAppointmentFormError("");
      return;
    }

    let targetRole = marriageAccountRole;
    let targetBirthdate = String(resolvedUserBirthdate || user?.birthdate || "").trim();
    if (!targetRole) {
      try {
        const latestProfile = await fetchLatestUserProfile();
        targetRole = getMarriageAccountRoleByGender(latestProfile?.gender);
        targetBirthdate = String(latestProfile?.birthdate || targetBirthdate).trim();
      } catch (error) {
        setAppointmentFormError(error.message || "Unable to load account details.");
        return;
      }
    }
    if (!targetBirthdate) {
      try {
        const latestProfile = await fetchLatestUserProfile();
        targetBirthdate = String(latestProfile?.birthdate || "").trim();
        if (!targetRole) {
          targetRole = getMarriageAccountRoleByGender(latestProfile?.gender);
        }
      } catch (error) {
        setAppointmentFormError(error.message || "Unable to load account details.");
        return;
      }
    }
    if (!targetRole) {
      setAppointmentFormError("Please set your gender in Profile first so we can map your account details to bride or groom.");
      return;
    }

    setUseMarriageAccountDetails(true);
    setAppointmentFormError("");
    applyMarriageAccountDetails(targetRole, targetBirthdate);
  };

  useEffect(() => {
    if (!useMarriageAccountDetails) return;
    applyMarriageAccountDetails();
  }, [
    useMarriageAccountDetails,
    isMarriageDetailsStep,
    marriageAccountRole,
    marriageAccountTargetFieldKey,
    marriageAccountTargetPhoneFieldKey,
    marriageAccountTargetAgeFieldKey,
    marriageAccountTargetAddressFieldKey,
    user?.fullName,
    user?.userName,
    user?.email,
    user?.contactNumber,
    user?.address,
    user?.birthdate,
    resolvedUserBirthdate,
  ]);

  const validateAppointmentCredentials = () => {
    if (!selectedSacrament) return "Please select a sacrament type.";

    for (const field of appointmentFields) {
      if (field.type === "list") {
        const listValue = appointmentCredentials[field.key];
        const hasListValue = Array.isArray(listValue)
          ? listValue.some((entry) => String(entry?.name || entry || "").trim())
          : Boolean(listValue);
        if (field.required === false && !hasListValue) continue;
        const listError = validateListValue(listValue, {
          minEntries: parseListFieldConfig(field).minEntries,
          phoneRegex: PHONE_NUMBER_REGEX,
          fieldLabel: field.label,
        });
        if (listError) return listError;
        continue;
      }
      if (field.type === "file") {
        const selectedFile = appointmentCredentials[field.key];
        if (!(selectedFile instanceof File)) {
          if (field.required === false) continue;
          return `${field.label} is required.`;
        }
        if (!isAllowedAppointmentDocument(selectedFile)) {
          return `${field.label} must be a PDF, DOCX, or non-GIF image file.`;
        }
        continue;
      }

      const value = String(appointmentCredentials[field.key] || "").trim();
      if (!value) {
        if (field.required === false) continue;
        return `${field.label} is required.`;
      }

      if (field.type === "number") {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue) || numberValue <= 0) {
          return `${field.label} must be a valid number.`;
        }
      }

      if (isPhoneFieldKey(field) && !PHONE_NUMBER_REGEX.test(value)) {
        return `${field.label} must be 11 digits and start with 09.`;
      }
    }
    if (normalizedSelectedSacramentName === "marriage") {
      const duplicateNameError = findMarriageDuplicateNameError(appointmentFields, appointmentCredentials);
      if (duplicateNameError) return duplicateNameError;
    }
    if (isDeathMassSacramentKey(normalizedSelectedSacramentName)) {
      const deceasedName = readCredentialAliasValue(appointmentCredentials, ["deceasedName", "deceasedFullName"]);
      if (!deceasedName) {
        return "Deceased Full Name is required.";
      }
      const dateOfDeath = readCredentialAliasValue(appointmentCredentials, ["dateOfDeath"]);
      if (!dateOfDeath) {
        return "Date of Death is required.";
      }
      const familyContactName = readCredentialAliasValue(appointmentCredentials, ["familyContactName"]);
      if (!familyContactName) {
        return "Family Contact Name is required.";
      }
      const relationToDeceased = readCredentialAliasValue(appointmentCredentials, ["relationToDeceased", "relationshipToDeceased"]);
      if (!relationToDeceased) {
        return "Relationship to Deceased is required.";
      }
      const deceasedAddress = readCredentialAliasValue(appointmentCredentials, ["deceasedAddress", "address"]);
      if (!deceasedAddress) {
        return "Deceased Address is required.";
      }
    }

    return "";
  };

  const handleProceedToAppointmentReview = () => {
    const validationError = validateAppointmentCredentials();
    if (validationError) {
      setAppointmentFormError(validationError);
      return;
    }
    setAppointmentFormError("");
    setAppointmentStep("review");
  };

  const handleAppointmentHeaderBack = () => {
    if (
      appointmentStep === "marriage_docs" ||
      appointmentStep === "death_mass_docs" ||
      appointmentStep === "baptism_docs" ||
      appointmentStep === "special_program_docs"
    ) {
      setAppointmentStep("pick");
      setSelectedSacrament(null);
      setAppointmentCredentials({});
      setAppointmentNote("");
      setUseMarriageAccountDetails(false);
      setAppointmentFormError("");
      return;
    }
    if (appointmentStep === "details") {
      const detailKey = normalizeSacramentKey(selectedSacrament?.sacramentName || selectedSacrament?.name);
      if (isReadOnly && selectedSacrament?.isSpecialProgram) {
        setAppointmentStep("special_program_docs");
        return;
      }
      if (isReadOnly && detailKey === "marriage") {
        setAppointmentStep("marriage_docs");
        return;
      }
      if (isReadOnly && isDeathMassSacramentKey(detailKey)) {
        setAppointmentStep("death_mass_docs");
        return;
      }
      if (isReadOnly && isBaptismChristeningSacramentKey(detailKey)) {
        setAppointmentStep("baptism_docs");
        return;
      }
      setAppointmentStep("pick");
      return;
    }
    if (appointmentStep === "review") {
      setAppointmentStep("details");
    }
  };

  const handleSubmitAppointmentRequest = async () => {
    const validationError = validateAppointmentCredentials();
    if (validationError) {
      setAppointmentFormError(validationError);
      setAppointmentStep("details");
      return;
    }

    const sacramentName = String(selectedSacrament?.sacramentName || "").trim();
    const requestType = getRequestTypeBySacrament(sacramentName);
    const normalizedSpecialSacramentName = String(selectedSacrament?.sacramentName || "").trim();
    const normalizedSpecialProgramEventDate = String(selectedSacrament?.eventDate || "").trim();
    const isSpecialProgramRequest = Boolean(selectedSacrament?.isSpecialProgram) || requestType === "Special Sacrament";
    const requesterFullName =
      String(user?.fullName || "").trim() ||
      String(user?.username || "").trim() ||
      String(user?.email || "").trim();
    const normalizedAppointmentNote = String(appointmentNote || "").trim();
    const uploadedDocumentFiles = appointmentFields.flatMap((field) => {
      if (field.type !== "file") return [];
      const selectedFile = appointmentCredentials?.[field.key];
      return selectedFile instanceof File ? [{ key: field.key, file: selectedFile }] : [];
    });
    const hasAnyDocumentFile = uploadedDocumentFiles.length > 0;
    const schemaCredentials = Object.fromEntries(
      appointmentFields.flatMap((field) => {
        if (field.type === "list") {
          return [[field.key, sanitizeListForSubmission(appointmentCredentials[field.key], parseListFieldConfig(field).minEntries)]];
        }
        if (field.type === "file") {
          const selectedFile = appointmentCredentials[field.key];
          if (selectedFile instanceof File) {
            return [[`${field.key}Name`, selectedFile.name]];
          }
          return [];
        }
        const value = appointmentCredentials[field.key];
        if (value === undefined || value === null || String(value).trim() === "") return [];
        return [[field.key, value]];
      }),
    );
    const credentialsForSubmission = isSpecialProgramRequest
      ? schemaCredentials
      : {
          ...appointmentCredentials,
          ...schemaCredentials,
          ...(isDeathMassSacramentKey(normalizeSacramentKey(sacramentName))
            ? {
                deceasedName: readCredentialAliasValue(appointmentCredentials, ["deceasedName", "deceasedFullName"]),
                deceasedFullName: readCredentialAliasValue(appointmentCredentials, ["deceasedFullName", "deceasedName"]),
                dateOfDeath: readCredentialAliasValue(appointmentCredentials, ["dateOfDeath"]),
                deceasedAddress: readCredentialAliasValue(appointmentCredentials, ["deceasedAddress", "address"]),
                familyContactName: readCredentialAliasValue(appointmentCredentials, ["familyContactName"]),
                relationToDeceased: readCredentialAliasValue(appointmentCredentials, [
                  "relationToDeceased",
                  "relationshipToDeceased",
                ]),
              }
            : {}),
        };
    appointmentFields.forEach((field) => {
      if (field.type === "file") delete credentialsForSubmission[field.key];
    });
    const buildAppointmentRequestConfig = (payload) => {
      if (!hasAnyDocumentFile) {
        return {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        };
      }
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (key === "credentials") {
          formData.append(key, JSON.stringify(value));
          return;
        }
        formData.append(key, String(value));
      });
      uploadedDocumentFiles.forEach(({ key, file }) => {
        formData.append(key, file);
      });
      return { body: formData };
    };

    setIsSubmittingAppointment(true);
    try {
      if (!isReadOnly && accountType === "admin") {
        const normalizedAdminId = Number(user?.adminID);
        if (!Number.isInteger(normalizedAdminId) || normalizedAdminId <= 0) {
          throw new Error("Unable to detect admin account.");
        }
        const normalizedSacramentId = Number(selectedSacrament?.sacramentID);
        const hasNormalSacrament = Number.isInteger(normalizedSacramentId) && normalizedSacramentId > 0;
        if (!hasNormalSacrament && !isSpecialProgramRequest) {
          throw new Error("Invalid sacrament selection.");
        }

        const response = await fetch("/api/appointments/admin", {
          method: "POST",
          ...buildAppointmentRequestConfig({
            adminID: normalizedAdminId,
            sacramentID: hasNormalSacrament ? normalizedSacramentId : null,
            s_sacramentID: isSpecialProgramRequest
              ? Number.isInteger(Number(selectedSacrament?.s_sacramentID)) && Number(selectedSacrament.s_sacramentID) > 0
                ? Number(selectedSacrament.s_sacramentID)
                : null
              : null,
            s_sacramentName: isSpecialProgramRequest ? normalizedSpecialSacramentName : null,
            specialProgramDate: isSpecialProgramRequest ? normalizedSpecialProgramEventDate || null : null,
            requesterFullName,
            requestType: isSpecialProgramRequest
              ? "Special Sacrament Program"
              : requestType === "Certificate Request"
                ? "Certificate"
                : "Appointment",
            status: "CONFIRMED",
            credentials: credentialsForSubmission,
            note: normalizedAppointmentNote || null,
          }),
        });
        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(responseData.message || "Unable to create appointment.");
        }

        addPendingRequest({
          appointmentID: responseData?.appointmentID,
          requesterFullName: String(responseData?.requesterFullName || "").trim() || requesterFullName,
          sacramentName,
          requestType: isSpecialProgramRequest ? "Special Sacrament Program" : "Appointment",
          s_sacramentID: responseData?.s_sacramentID ?? null,
          status: "CONFIRMED",
          note: normalizedAppointmentNote || null,
          credentials: credentialsForSubmission,
        });
        void loadDashboardStats({ silent: true });
        closeAppointmentModal();
        pushUiNotice("Appointment created and confirmed.");
        navigate("/admin/progress-tracker");
        return;
      }

      const normalizedUserId = Number(user?.userID);
      if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
        throw new Error("Unable to detect user account.");
      }
      const normalizedSacramentId = Number(selectedSacrament?.sacramentID);
      const hasNormalSacrament = Number.isInteger(normalizedSacramentId) && normalizedSacramentId > 0;
      if (!hasNormalSacrament && !isSpecialProgramRequest) {
        throw new Error("Invalid sacrament selection.");
      }

      const response = await fetch("/api/appointments", {
        method: "POST",
        ...buildAppointmentRequestConfig({
          userID: normalizedUserId,
          sacramentID: hasNormalSacrament ? normalizedSacramentId : null,
          s_sacramentID: isSpecialProgramRequest
            ? Number.isInteger(Number(selectedSacrament?.s_sacramentID)) && Number(selectedSacrament.s_sacramentID) > 0
              ? Number(selectedSacrament.s_sacramentID)
              : null
            : null,
          s_sacramentName: isSpecialProgramRequest ? normalizedSpecialSacramentName : null,
          specialProgramDate: isSpecialProgramRequest ? normalizedSpecialProgramEventDate || null : null,
          requesterFullName,
          requestType: isSpecialProgramRequest ? "Special Sacrament Program" : "Appointment",
          status: "PENDING",
          credentials: credentialsForSubmission,
          note: normalizedAppointmentNote || null,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to submit appointment request.");
      }

      closeAppointmentModal();
      const resolvedParishDashboardPath = parishId ? `/dashboard/parish/${parishId}` : "/dashboard";
      pushUiNotice("Appointment request sent successfully.");
      if (selectedParish) {
        navigate(resolvedParishDashboardPath, { state: { selectedParish } });
      } else {
        navigate(resolvedParishDashboardPath);
      }
    } catch (error) {
      setAppointmentFormError(error.message || "Unable to submit appointment request.");
      setAppointmentStep("review");
    } finally {
      setIsSubmittingAppointment(false);
    }
  };

  const handleOpenAppointmentSubmitConfirm = () => {
    const validationError = validateAppointmentCredentials();
    if (validationError) {
      setAppointmentFormError(validationError);
      setAppointmentStep("details");
      return;
    }
    setAppointmentFormError("");
    setIsAppointmentSubmitConfirmOpen(true);
  };

  const confirmSubmitAppointmentRequest = async () => {
    setIsAppointmentSubmitConfirmOpen(false);
    await handleSubmitAppointmentRequest();
  };

  const handleCalendarInputChange = (event) => {
    const { name, value } = event.target;
    if (name === "scheduleType") {
      if (value !== "priest_schedule") {
        setIsAddPriestOpen(false);
        setPriestFeedback("");
        setPriestFullName("");
      }
      if (value === "half_day") {
        setEditingDayOffTarget(halfDaySetting ? { type: "half_day", value: halfDaySetting.weekday } : null);
        setCalendarForm((current) => ({
          ...current,
          scheduleType: "day_off",
          dayOffMode: "half_day",
          dayOffWeekday: halfDaySetting ? String(halfDaySetting.weekday) : current.dayOffWeekday,
          halfDayStartTime: halfDaySetting?.startTime || current.halfDayStartTime || "08:00",
          halfDayEndTime: halfDaySetting?.endTime || current.halfDayEndTime || "12:00",
          isSpecialProgram: false,
          sSacramentID: "",
          slotLimitType: "maximum",
          location: "",
        }));
        return;
      }
      if (editingDayOffTarget?.type === "half_day") {
        setEditingDayOffTarget(null);
      }
      if ((calendarForm.scheduleType === "priest_activity") !== (value === "priest_activity")) {
        setPriestBlockReasonChoice("");
      }
      setCalendarForm((current) => {
        const isSwitchingActivityMode = (current.scheduleType === "priest_activity") !== (value === "priest_activity");
        return {
          ...current,
          title: isSwitchingActivityMode ? "" : current.title,
          scheduleType: value,
          dayOffMode: current.dayOffMode === "half_day" ? "weekday" : current.dayOffMode,
          isSpecialProgram: value === "parish_event" ? current.isSpecialProgram : false,
          sSacramentID: value === "parish_event" ? current.sSacramentID : "",
          slotLimitType: value === "parish_event" ? current.slotLimitType : "maximum",
          location: value === "priest_schedule" || value === "priest_activity" ? current.location : "",
          startTime: isSwitchingActivityMode ? "" : current.startTime,
          endTime: isSwitchingActivityMode ? "" : current.endTime,
          occupiedSlots: isSwitchingActivityMode ? [] : current.occupiedSlots,
        };
      });
      return;
    }
    if (name === "slotLimitType") {
      setCalendarForm((current) => ({
        ...current,
        slotLimitType: value === "unlimited" ? "unlimited" : "maximum",
        maxSlots: value === "unlimited" ? "" : current.maxSlots || "1",
      }));
      return;
    }
    if (name === "priestID") {
      setRemoteDayAvailability(null);
      setCalendarForm((current) => ({
        ...current,
        priestID: value,
        eventDate: "",
        startTime: "",
        endTime: "",
        occupiedSlots: [],
        durationHours: 1,
      }));
      return;
    }
    setCalendarForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const loadPriestScheduleNotes = async () => {
    const adminID = Number(user?.adminID);
    if (isReadOnly || !Number.isInteger(adminID) || adminID <= 0) return;
    try {
      const response = await fetch(`/api/schedule-notes?adminID=${adminID}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseData.message || "Unable to load priest schedule notes.");
      setPriestScheduleNotes(Array.isArray(responseData?.notes) ? responseData.notes : []);
    } catch (error) {
      setCalendarError(error.message || "Unable to load priest schedule notes.");
    }
  };

  const markPriestScheduleNoteHandled = async (noteID, calendarEntryID = null) => {
    const adminID = Number(user?.adminID);
    const response = await fetch(`/api/schedule-notes/${noteID}/review?adminID=${adminID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminID, calendarEntryID }),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseData.message || "Unable to update this note.");
    await loadPriestScheduleNotes();
    return responseData;
  };

  const handleMarkPriestNoteReviewed = async (note) => {
    setBusyPriestNoteId(note.noteID);
    try {
      const responseData = await markPriestScheduleNoteHandled(note.noteID);
      pushUiNotice(responseData.message || "Note marked as reviewed.");
    } catch (error) {
      pushUiNotice(error.message || "Unable to update this note.", "error");
    } finally {
      setBusyPriestNoteId(null);
    }
  };

  const handleBlockPriestNoteHours = (note) => {
    resetCalendarForm();
    const reason = String(note.reason || "").trim();
    setPriestBlockReasonChoice(PRIEST_BLOCK_REASONS.includes(reason) ? reason : PRIEST_BLOCK_OTHER_REASON);
    setCalendarForm((current) => ({
      ...current,
      scheduleType: "priest_activity",
      title: reason,
      priestID: String(note.priestID),
      eventDate: note.noteDate,
      notes: note.message || "",
      ...occupiedSlotsToFormTimes(note.occupiedSlots),
    }));
    const [year, month] = String(note.noteDate).split("-").map(Number);
    if (year && month) setPriestCalendarMonth(new Date(year, month - 1, 1));
    const packageDates = Array.isArray(note.coverageDates) && note.coverageDates.length
      ? note.coverageDates
      : [String(note.noteDate || "").slice(0, 10)].filter(Boolean);
    setBlockingNoteDates(packageDates);
    setBlockingPriestNoteId(note.noteID);
    setIsDateSchedulesModalOpen(false);
    setIsCalendarModalOpen(true);
  };

  const resetCalendarForm = () => {
    setPriestBlockReasonChoice("");
    setBlockingPriestNoteId(null);
    setBlockingNoteDates([]);
    setExcludedPackageDates([]);
    setCalendarForm({
      title: "",
      scheduleType: "parish_event",
      isSpecialProgram: false,
      sSacramentID: "",
      slotLimitType: "maximum",
      maxSlots: "",
      dayOffMode: "weekday",
      dayOffWeekday: "0",
      dayOffSpecificDate: "",
      eventDate: "",
      startTime: "",
      endTime: "",
      durationHours: 1,
      occupiedSlots: [],
      location: "",
      notes: "",
      priestID: "",
      deadline: "",
    });
    setEditingEntryId(null);
    setCalendarError("");
    setIsAddPriestOpen(false);
    setPriestFeedback("");
    setPriestFullName("");
    setEditingDayOffTarget(null);
    setIsDayOffDeleteConfirmOpen(false);
    setIsEntryDeleteConfirmOpen(false);
    setRemoteDayAvailability(null);
    setIsLoadingScheduleSlots(false);
    setEditingOriginalEventDate("");
    setPriestCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  };

  const handleEditDayOff = (dateString) => {
    const selectedDayOfWeek = new Date(`${dateString}T00:00:00`).getDay();
    const isSpecificDateDayOff = dayOffSpecificDates.includes(dateString);
    const isRecurringDayOff = dayOffWeekday === selectedDayOfWeek;

    setEditingEntryId(null);
    setCalendarError("");
    setIsAddPriestOpen(false);
    setPriestFeedback("");
    setPriestFullName("");
    setIsCalendarModalOpen(true);

    if (isSpecificDateDayOff) {
      setEditingDayOffTarget({ type: "specific_date", value: dateString });
      setCalendarForm({
        title: "",
        scheduleType: "day_off",
        isSpecialProgram: false,
        sSacramentID: "",
        slotLimitType: "maximum",
        maxSlots: "",
        dayOffMode: "specific_date",
        dayOffWeekday: String(selectedDayOfWeek),
        dayOffSpecificDate: dateString,
        eventDate: "",
        startTime: "",
        endTime: "",
        durationHours: 1,
        occupiedSlots: [],
        location: "",
        notes: "",
        priestID: "",
      });
      return;
    }

    if (!isRecurringDayOff && halfDaySetting && halfDaySetting.weekday === selectedDayOfWeek) {
      setEditingDayOffTarget({ type: "half_day", value: halfDaySetting.weekday });
      setCalendarForm({
        title: "",
        scheduleType: "day_off",
        isSpecialProgram: false,
        sSacramentID: "",
        slotLimitType: "maximum",
        maxSlots: "",
        dayOffMode: "half_day",
        dayOffWeekday: String(halfDaySetting.weekday),
        dayOffSpecificDate: "",
        halfDayStartTime: halfDaySetting.startTime,
        halfDayEndTime: halfDaySetting.endTime,
        eventDate: "",
        startTime: "",
        endTime: "",
        durationHours: 1,
        occupiedSlots: [],
        location: "",
        notes: "",
        priestID: "",
      });
      return;
    }

    if (isRecurringDayOff) {
      setEditingDayOffTarget({ type: "weekday", value: dayOffWeekday });
      setCalendarForm({
        title: "",
        scheduleType: "day_off",
        isSpecialProgram: false,
        sSacramentID: "",
        slotLimitType: "maximum",
        maxSlots: "",
        dayOffMode: "weekday",
        dayOffWeekday: String(dayOffWeekday ?? selectedDayOfWeek),
        dayOffSpecificDate: "",
        eventDate: "",
        startTime: "",
        endTime: "",
        durationHours: 1,
        occupiedSlots: [],
        location: "",
        notes: "",
        priestID: "",
      });
    }
  };

  const handleDeleteDayOffTarget = async () => {
    if (!editingDayOffTarget) return;
    setIsDayOffDeleteConfirmOpen(true);
  };

  const confirmDeleteDayOffTarget = async () => {
    if (!editingDayOffTarget) return;
    setIsDayOffDeleteConfirmOpen(false);
    setCalendarError("");
    setIsSavingCalendarEntry(true);
    try {
      const endpoint =
        editingDayOffTarget.type === "specific_date"
          ? `/admin-api/day-offs/date/${encodeURIComponent(editingDayOffTarget.value)}?adminID=${resolvedDayOffAdminID}`
          : editingDayOffTarget.type === "half_day"
            ? `/admin-api/day-offs/half-day?adminID=${resolvedDayOffAdminID}`
            : `/admin-api/day-offs/weekday?adminID=${resolvedDayOffAdminID}`;

      const response = await fetch(endpoint, { method: "DELETE" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to remove day-off setting.");
      }

      await loadDayOffSettings();
      setIsCalendarModalOpen(false);
      resetCalendarForm();
      setCalendarNotice("Day-off setting removed successfully.");
    } catch (error) {
      setCalendarError(error.message || "Unable to remove day-off setting.");
    } finally {
      setIsSavingCalendarEntry(false);
    }
  };


  const handleDeleteCalendarEntry = async () => {
    if (!editingEntryId) return;
    setIsEntryDeleteConfirmOpen(true);
  };

  const handlePrintCalendarMonth = () => {
    if (isPrintingCalendarMonth) return;
    setPrintMonthPriestID("");
    setIsPrintMonthConfirmOpen(true);
  };

  const confirmPrintCalendarMonth = async () => {
    setIsPrintMonthConfirmOpen(false);
    setCalendarError("");
    setCalendarNotice("");
    setIsPrintingCalendarMonth(true);
    try {
      const normalizedAdminID = Number(user?.adminID);
      if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) {
        throw new Error("Unable to detect admin account.");
      }
      const selectedMonth = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}`;
      const normalizedPriestID = String(printMonthPriestID || "").trim();
      const hasPriestFilter = normalizedPriestID.length > 0;
      if (hasPriestFilter) {
        const parsedPriestID = Number(normalizedPriestID);
        if (!Number.isInteger(parsedPriestID) || parsedPriestID <= 0) {
          throw new Error("Please select a valid priest or choose all schedules.");
        }
      }
      let resolvedParishName = String(user?.parishName || "").trim();
      const profileResponse = await fetch(`/admin-api/profile?accountType=admin&accountID=${normalizedAdminID}`);
      if (profileResponse.ok) {
        const profileData = await profileResponse.json().catch(() => ({}));
        const profileParishName = String(profileData?.user?.parishName || "").trim();
        if (profileParishName) {
          resolvedParishName = profileParishName;
        }
      }
      const queryParams = new URLSearchParams({
        adminID: String(normalizedAdminID),
        month: selectedMonth,
        parishName: resolvedParishName,
      });
      if (hasPriestFilter) {
        queryParams.set("priestID", normalizedPriestID);
      }
      const response = await fetch(`/admin-api/calendar-entries/print/month?${queryParams.toString()}`);
      if (!response.ok) {
        const responseData = await response.json().catch(() => ({}));
        throw new Error(responseData.message || "Unable to load monthly calendar entries.");
      }

      const pdfBlob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      const selectedPriest = hasPriestFilter
        ? priests.find((priest) => String(priest?.priestID || "") === normalizedPriestID)
        : null;
      const priestFilenameSuffix = selectedPriest
        ? String(selectedPriest.fullName || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
        : "";
      anchor.download = priestFilenameSuffix
        ? `faithflow-calendar-${selectedMonth}-${priestFilenameSuffix}.pdf`
        : `faithflow-calendar-${selectedMonth}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
      const priestNoticeLabel = selectedPriest ? ` for ${selectedPriest.fullName}` : "";
      setCalendarNotice(`Monthly calendar PDF downloaded for ${monthLabel}${priestNoticeLabel}.`);
    } catch (error) {
      setCalendarError(error.message || "Unable to print monthly calendar entries.");
    } finally {
      setIsPrintingCalendarMonth(false);
    }
  };

  const confirmDeleteCalendarEntry = async () => {
    if (!editingEntryId) return;
    setIsEntryDeleteConfirmOpen(false);
    setCalendarError("");
    setIsSavingCalendarEntry(true);
    try {
      const normalizedAdminID = Number(user?.adminID);
      if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) {
        throw new Error("Unable to detect admin account.");
      }
      const response = await fetch(`/admin-api/calendar-entries/${editingEntryId}?adminID=${normalizedAdminID}`, { method: "DELETE" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to remove calendar entry.");
      }

      await loadCalendarEntries();
      setIsCalendarModalOpen(false);
      resetCalendarForm();
      setCalendarNotice("Calendar entry removed successfully.");
    } catch (error) {
      setCalendarError(error.message || "Unable to remove calendar entry.");
    } finally {
      setIsSavingCalendarEntry(false);
    }
  };

  const handleApplySpecialProgram = async (entry) => {
    if (!isReadOnly) return;
    const normalizedSpecialSacramentID = Number(entry?.s_sacramentID);
    if (!Number.isInteger(normalizedSpecialSacramentID) || normalizedSpecialSacramentID <= 0) return;
    const specialProgramName = String(entry?.s_sacramentName || entry?.title || "Special Sacrament Program").trim();
    await loadSpecialSacramentFormSchemas();
    openAppointmentModal();
    setSelectedSacrament({
      sacramentID: null,
      s_sacramentID: normalizedSpecialSacramentID,
      sacramentName: specialProgramName || "Special Sacrament Program",
      isSpecialProgram: true,
      eventDate: String(entry?.eventDate || "").trim() || null,
    });
    setAppointmentCredentials({});
    setAppointmentNote("");
    setUseMarriageAccountDetails(false);
    setUseAccountPhoneNumber({});
    setAppointmentFormError("");
    setAppointmentStep("special_program_docs");
  };

  const handleCalendarSubmit = async (event) => {
    event.preventDefault();
    setCalendarError("");
    setIsSavingCalendarEntry(true);

    try {
      if (!Number.isInteger(resolvedDayOffAdminID) || resolvedDayOffAdminID <= 0) {
        throw new Error("Unable to detect admin account.");
      }
      if (calendarForm.scheduleType === "day_off") {
        const isEditingDayOff = Boolean(editingDayOffTarget);
        const isWeekdayMode = calendarForm.dayOffMode === "weekday";
        const isHalfDayMode = calendarForm.dayOffMode === "half_day";
        if (editingDayOffTarget) {
          if (editingDayOffTarget.type === "half_day" && !isHalfDayMode) {
            const removeResponse = await fetch(`/admin-api/day-offs/half-day?adminID=${resolvedDayOffAdminID}`, { method: "DELETE" });
            if (!removeResponse.ok && removeResponse.status !== 404) {
              const removePayload = await removeResponse.json().catch(() => ({}));
              throw new Error(removePayload.message || "Unable to update half day.");
            }
          } else if (editingDayOffTarget.type === "specific_date") {
            const nextSpecificDate = String(calendarForm.dayOffSpecificDate || "").trim();
            const isSameSpecificDate =
              calendarForm.dayOffMode === "specific_date" &&
              nextSpecificDate === String(editingDayOffTarget.value || "").trim();
            if (!isSameSpecificDate) {
              const removeResponse = await fetch(
                `/admin-api/day-offs/date/${encodeURIComponent(editingDayOffTarget.value)}?adminID=${resolvedDayOffAdminID}`,
                { method: "DELETE" },
              );
              if (!removeResponse.ok && removeResponse.status !== 404) {
                const removePayload = await removeResponse.json().catch(() => ({}));
                throw new Error(removePayload.message || "Unable to update day-off setting.");
              }
            }
          } else if (editingDayOffTarget.type === "weekday" && !isWeekdayMode) {
            const removeResponse = await fetch(`/admin-api/day-offs/weekday?adminID=${resolvedDayOffAdminID}`, { method: "DELETE" });
            if (!removeResponse.ok && removeResponse.status !== 404) {
              const removePayload = await removeResponse.json().catch(() => ({}));
              throw new Error(removePayload.message || "Unable to update day-off setting.");
            }
          }
        }

        const response = await fetch("/admin-api/day-offs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            isHalfDayMode
              ? {
                  mode: "half_day",
                  weekday: Number(calendarForm.dayOffWeekday),
                  startTime: calendarForm.halfDayStartTime || "08:00",
                  endTime: calendarForm.halfDayEndTime || "12:00",
                  adminID: resolvedDayOffAdminID,
                }
              : isWeekdayMode
                ? { mode: "weekday", weekday: Number(calendarForm.dayOffWeekday), adminID: resolvedDayOffAdminID }
                : { mode: "specific_date", date: calendarForm.dayOffSpecificDate, adminID: resolvedDayOffAdminID },
          ),
        });
        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(responseData.message || "Unable to save day-off setting.");
        }
        await loadDayOffSettings();
        resetCalendarForm();
        setIsCalendarModalOpen(false);
        setCalendarNotice(
          isHalfDayMode
            ? editingDayOffTarget?.type === "half_day"
              ? "Half day updated successfully."
              : "Half day saved successfully."
            : isEditingDayOff
              ? "Day-off setting updated successfully."
              : "Day-off setting added successfully.",
        );
        return;
      }

      const slotOverlapsEntry = (entry) =>
        expandScheduleBusyRanges(entry).some((range) =>
          (calendarForm.occupiedSlots || []).some((slot) => {
            const slotStart = parseTimeToMinutes(slot.startTime);
            const slotEnd = parseTimeToMinutes(slot.endTime);
            return range.start < slotEnd && slotStart < range.end;
          }),
        );
      const packageDates = (blockingNoteDates.length > 1 ? blockingNoteDates : [])
        .filter((dateKey) => dateKey && !excludedPackageDates.includes(dateKey))
        .filter((dateKey) => {
          const day = new Date(`${dateKey}T00:00:00`).getDay();
          const closed = dayOffSpecificDates.includes(dateKey) || (Number.isInteger(dayOffWeekday) && dayOffWeekday === day);
          if (closed) return false;
          return !(priestCalendarEntriesByDate[dateKey] || []).some((entry) => slotOverlapsEntry(entry));
        });
      if (blockingNoteDates.length > 1 && !packageDates.length) {
        throw new Error("Every day in this request is closed or already has a schedule. Click a conflicting day to leave it out.");
      }
      const primaryDate = packageDates[0] || calendarForm.eventDate;
      const extraPackageDates = packageDates.filter((dateKey) => dateKey !== primaryDate);

      const endpoint = editingEntryId ? `/admin-api/calendar-entries/${editingEntryId}` : "/admin-api/calendar-entries";
      const method = editingEntryId ? "PATCH" : "POST";
      const isCreatingSpecialProgram = !editingEntryId && calendarForm.isSpecialProgram;
      const isEditingSpecialProgram = Boolean(editingEntryId && calendarForm.isSpecialProgram && Number(calendarForm.sSacramentID));
      const normalizedAdminID = resolvedDayOffAdminID;
      if (!Number.isInteger(normalizedAdminID) || normalizedAdminID <= 0) {
        throw new Error("Unable to detect admin account.");
      }
      if (calendarForm.scheduleType === "parish_event" || calendarForm.scheduleType === "priest_schedule") {
        if (!Number(calendarForm.priestID)) {
          throw new Error("Please select a priest first.");
        }
        if (!calendarForm.eventDate) {
          throw new Error("Please choose a date from the priest calendar.");
        }
        if (!calendarForm.startTime || !calendarForm.endTime || (calendarForm.isSpecialProgram && !calendarForm.occupiedSlots?.length)) {
          throw new Error(
            calendarForm.isSpecialProgram
              ? "Choose at least one available 1-hour time slot. You can pick more than one hour as long as those hours are free."
              : "Please choose an available 1-hour time slot.",
          );
        }
        if (calendarForm.scheduleType === "priest_schedule" && !calendarForm.isSpecialProgram && !calendarForm.location.trim()) {
          throw new Error("Please enter the location. Priest schedules are held outside the parish.");
        }
      }
      if (calendarForm.scheduleType === "priest_activity") {
        if (!calendarForm.title.trim()) {
          throw new Error(
            priestBlockReasonChoice === PRIEST_BLOCK_OTHER_REASON
              ? "Please type the reason for the priest's unavailability."
              : "Please select a reason for the priest's unavailability.",
          );
        }
        if (!Number(calendarForm.priestID)) {
          throw new Error("Please select the priest whose schedule you want to block.");
        }
        if (!calendarForm.eventDate) {
          throw new Error("Please choose the date from the priest calendar.");
        }
        if (!calendarForm.occupiedSlots?.length) {
          throw new Error("Choose at least one time slot to block.");
        }
        const isPackageRequest = blockingNoteDates.length > 1;
        if (!isPackageRequest && priestActivityConflictEntry) {
          throw new Error(
            `${selectedCalendarPriestName} already has "${getCalendarEntryDisplayTitle(priestActivityConflictEntry)}" during this time. Choose a different time.`,
          );
        }
      }

      const response = isCreatingSpecialProgram
        ? await fetch("/admin-api/special-sacraments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              s_sacramentName: calendarForm.title.trim(),
              maxSlots: calendarForm.slotLimitType === "unlimited" ? null : Number(calendarForm.maxSlots),
              isUnlimitedSlots: calendarForm.slotLimitType === "unlimited",
              timeDate: `${calendarForm.eventDate}T${calendarForm.startTime}:00`,
              calendarTitle: calendarForm.title.trim(),
              eventDate: calendarForm.eventDate,
              startTime: calendarForm.startTime,
              endTime: calendarForm.endTime,
              durationHours: (calendarForm.occupiedSlots || []).length || calendarForm.durationHours || 1,
              occupiedSlots: calendarForm.occupiedSlots || [],
              priestID: Number(calendarForm.priestID) || null,
              deadline: calendarForm.deadline,
              adminID: normalizedAdminID,
            }),
          })
        : isEditingSpecialProgram
          ? await fetch(`/admin-api/special-sacraments/${Number(calendarForm.sSacramentID)}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                s_sacramentName: calendarForm.title.trim(),
                maxSlots: calendarForm.slotLimitType === "unlimited" ? null : Number(calendarForm.maxSlots),
                isUnlimitedSlots: calendarForm.slotLimitType === "unlimited",
                eventDate: calendarForm.eventDate,
                startTime: calendarForm.startTime,
                endTime: calendarForm.endTime,
              durationHours: (calendarForm.occupiedSlots || []).length || calendarForm.durationHours || 1,
              occupiedSlots: calendarForm.occupiedSlots || [],
                calendarTitle: calendarForm.title.trim(),
                calendarEntryId: editingEntryId,
                priestID: Number(calendarForm.priestID) || null,
                deadline: calendarForm.deadline,
                adminID: normalizedAdminID,
              }),
            })
        : await fetch(endpoint, {
            method,
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: calendarForm.title.trim(),
              scheduleType: calendarForm.scheduleType,
              eventDate: blockingNoteDates.length > 1 ? primaryDate : calendarForm.eventDate,
              startTime: calendarForm.startTime || null,
              endTime: calendarForm.endTime || null,
              ...(calendarForm.scheduleType === "priest_activity" ? { occupiedSlots: calendarForm.occupiedSlots || [] } : {}),
              location:
                calendarForm.scheduleType === "priest_schedule" || calendarForm.scheduleType === "priest_activity"
                  ? calendarForm.location.trim() || null
                  : null,
              notes: calendarForm.notes.trim() || null,
              priestID: ["priest_schedule", "parish_event", "priest_activity"].includes(calendarForm.scheduleType)
                ? Number(calendarForm.priestID) || null
                : null,
              priestFullName:
                calendarForm.scheduleType === "priest_schedule" && isAddPriestOpen ? priestFullName.trim() || null : null,
              adminID: normalizedAdminID,
            }),
          });

      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to save calendar entry.");
      }

      let skippedPackageDays = blockingNoteDates.length > 1 ? blockingNoteDates.length - packageDates.length : 0;
      if (!editingEntryId && calendarForm.scheduleType === "priest_activity" && extraPackageDates.length) {
        for (const eventDate of extraPackageDates) {
          const extraResponse = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: calendarForm.title.trim(),
              scheduleType: "priest_activity",
              eventDate,
              startTime: calendarForm.startTime || null,
              endTime: calendarForm.endTime || null,
              occupiedSlots: calendarForm.occupiedSlots || [],
              location: calendarForm.location.trim() || null,
              notes: calendarForm.notes.trim() || null,
              priestID: Number(calendarForm.priestID) || null,
              adminID: normalizedAdminID,
            }),
          });
          if (!extraResponse.ok) {
            const extraData = await extraResponse.json().catch(() => ({}));
            const message = String(extraData.message || "");
            if (/half day|day off|parish is closed|already/i.test(message)) {
              skippedPackageDays += 1;
              continue;
            }
            throw new Error(message || "Unable to save the rest of this unavailability request.");
          }
        }
      }

      await loadCalendarEntries();
      const isNewCalendarEntry = !editingEntryId;
      const handledNoteID =
        isNewCalendarEntry && calendarForm.scheduleType === "priest_activity" ? blockingPriestNoteId : null;
      resetCalendarForm();
      setIsCalendarModalOpen(false);
      if (handledNoteID) {
        try {
          await markPriestScheduleNoteHandled(handledNoteID, Number(responseData?.id) || null);
        } catch (noteError) {
          pushUiNotice(noteError.message || "Schedule saved, but the priest note could not be updated.", "error");
        }
      }
      setCalendarNotice(
        handledNoteID
          ? `Priest unavailability saved for the whole request${skippedPackageDays ? `. ${skippedPackageDays} closed or half day${skippedPackageDays === 1 ? "" : "s"} skipped.` : "."}`
          : isNewCalendarEntry
            ? "Calendar entry added successfully."
            : "Calendar entry updated successfully.",
      );
    } catch (error) {
      setCalendarError(error.message || "Unable to save calendar entry.");
    } finally {
      setIsSavingCalendarEntry(false);
    }
  };

  const handleRemovePastEntry = (entry) => {
    const entryId = Number(entry?.id || entry?.calendarEntryID);
    if (!Number.isInteger(entryId) || entryId <= 0) return;
    setEditingEntryId(entryId);
    setCalendarForm((current) => ({
      ...current,
      title: String(entry?.title || entry?.sacramentName || "").trim(),
    }));
    setCalendarError("");
    setIsEntryDeleteConfirmOpen(true);
  };

  const handleEditEntry = (entry) => {
    const isSpecialProgram = Number.isInteger(Number(entry?.s_sacramentID)) && Number(entry.s_sacramentID) > 0;
    const isPriestActivityEntry = String(entry?.scheduleType || "").trim() === "priest_activity";
    const times = occupiedSlotsToFormTimes(entry.occupiedSlots, entry.startTime, entry.endTime);
    const usesMultiSlots = isSpecialProgram || isPriestActivityEntry;
    const entryTitle = String(entry.title || "").trim();
    setPriestBlockReasonChoice(
      !isPriestActivityEntry || !entryTitle
        ? ""
        : PRIEST_BLOCK_REASONS.includes(entryTitle)
          ? entryTitle
          : PRIEST_BLOCK_OTHER_REASON,
    );
    setEditingEntryId(entry.id);
    setCalendarError("");
    setIsCalendarModalOpen(true);
    setCalendarForm({
      title: entry.title || "",
      scheduleType: entry.scheduleType || "parish_event",
      isSpecialProgram,
        sSacramentID: isSpecialProgram ? String(entry.s_sacramentID || "") : "",
      slotLimitType: isSpecialProgram && (Boolean(entry.isUnlimitedSlots) || Number(entry.maxSlots) <= 0) ? "unlimited" : "maximum",
      maxSlots:
        isSpecialProgram && !(Boolean(entry.isUnlimitedSlots) || Number(entry.maxSlots) <= 0) && Number(entry.maxSlots) > 0
          ? String(entry.maxSlots)
          : "",
      dayOffMode: "weekday",
      dayOffWeekday: "0",
      dayOffSpecificDate: "",
      eventDate: entry.eventDate || "",
      startTime: times.startTime || entry.startTime || "",
      endTime: times.endTime || entry.endTime || "",
      durationHours: usesMultiSlots ? times.durationHours : 1,
      occupiedSlots: usesMultiSlots ? times.occupiedSlots : [],
      location: entry.location || "",
      notes: entry.notes || "",
      priestID: entry.priestID ? String(entry.priestID) : "",
      deadline: isSpecialProgram ? String(entry.deadline || "").slice(0, 10) : "",
    });
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(entry.eventDate || ""))) {
      const [year, month] = String(entry.eventDate).split("-").map(Number);
      setPriestCalendarMonth(new Date(year, month - 1, 1));
      setEditingOriginalEventDate(String(entry.eventDate).slice(0, 10));
    } else {
      setEditingOriginalEventDate("");
    }
    setRemoteDayAvailability(null);
  };

  useEffect(() => {
    const editId = Number(searchParams.get("editCalendar"));
    if (!Number.isInteger(editId) || editId <= 0 || !calendarEntries.length) return;
    const entry = calendarEntries.find((item) => Number(item.id || item.calendarEntryID) === editId);
    if (!entry) return;
    handleEditEntry(entry);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("editCalendar");
    setSearchParams(nextParams, { replace: true });
  }, [calendarEntries, searchParams, setSearchParams]);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOffDeleteTargetLabel =
    editingDayOffTarget?.type === "specific_date"
      ? `day-off date (${formatDateToLong(editingDayOffTarget.value)})`
      : editingDayOffTarget?.type === "half_day"
        ? "weekly half day"
        : "weekly day-off";
  const entryDeleteTargetLabel = String(calendarForm.title || "").trim() || "calendar entry";
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstDayIndex = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const isSpecialProgramEntry = (entry) => Number.isInteger(Number(entry?.s_sacramentID)) && Number(entry.s_sacramentID) > 0;
  const getCalendarEventKindLabel = (entry) => {
    if (isSpecialProgramEntry(entry)) return "Special Sacramental Program";
    if (isAppointmentCalendarEntry(entry)) return "Appointment";
    if (String(entry?.scheduleType || "").trim() === "priest_schedule") return "Priest Schedule";
    if (String(entry?.scheduleType || "").trim() === "priest_activity") return "Priest Unavailability";
    return "Parish Event";
  };
  const getCalendarPriestName = (entry) => {
    const priestID = Number(entry?.priestID);
    const matchedPriest =
      Number.isInteger(priestID) && priestID > 0
        ? priests.find((priest) => Number(priest.priestID) === priestID)
        : null;
    return formatPriestHonorificName({
      priestName: entry?.priestName || matchedPriest?.fullName,
      clergyType: entry?.clergyType || matchedPriest?.clergyType,
      religiousOrderCode: entry?.religiousOrderCode || matchedPriest?.religiousOrderCode,
    });
  };
  const isTodayDayOff =
    dayOffSpecificDates.includes(todayString) || dayOffWeekday === new Date(`${todayString}T00:00:00`).getDay();
  const todaysSchedules = calendarEntries.filter((entry) => entry.eventDate === todayString);
  const todayAnnouncementItems = [
    ...(isTodayDayOff
      ? [
          {
            id: "today-day-off",
            title: "Day Off",
            detail: "Today is configured as a church day off.",
            subDetail: "No schedules should be booked today.",
          },
        ]
      : []),
    ...todaysSchedules.map((entry) => ({
      id: `today-schedule-${entry.id}`,
      title: getCalendarEntryDisplayTitle(entry),
      detail: `${getCalendarEventKindLabel(entry)}${
        getCalendarPriestName(entry) ? ` | ${getCalendarPriestName(entry)}` : ""
      }`,
      subDetail: isSpecialProgramEntry(entry)
        ? `Event: ${formatEventDateTimeLabel(entry.eventDate, entry.startTime, entry.endTime, entry.occupiedSlots)}`
        : `${formatTimeRange(entry.startTime, entry.endTime)}${
            ["priest_schedule", "priest_activity"].includes(String(entry?.scheduleType || "").trim()) &&
            String(entry?.location || "").trim()
              ? ` | ${entry.location}`
              : ""
          }`,
    })),
  ];
  const normalizedTodayAnnouncementItems =
    todayAnnouncementItems.length > 0
      ? todayAnnouncementItems
      : [
          {
            id: "today-empty-schedule",
            title: "No schedules for today",
            detail: `Add a parish event or priest schedule for ${formatDateToLong(todayString)}.`,
            subDetail: "",
          },
        ];
  const previewTodayAnnouncementItems = normalizedTodayAnnouncementItems.slice(0, 3);
  const hasMoreTodayAnnouncements = normalizedTodayAnnouncementItems.length > 3;
  const recentParishActivities = [...parishActivities]
    .filter((entry) => Number.isInteger(Number(entry?.id)) && Number(entry.id) > 0)
    .sort(compareParishActivitiesNewestFirst);
  const safeParishActivitySlideIndex =
    recentParishActivities.length > 0
      ? Math.max(0, Math.min(parishActivitySlideIndex, recentParishActivities.length - 1))
      : 0;

  useEffect(() => {
    if (recentParishActivities.length === 0 && parishActivitySlideIndex !== 0) {
      setParishActivitySlideIndex(0);
      return;
    }
    if (recentParishActivities.length > 0 && parishActivitySlideIndex > recentParishActivities.length - 1) {
      setParishActivitySlideIndex(recentParishActivities.length - 1);
    }
  }, [parishActivitySlideIndex, recentParishActivities.length]);

  useEffect(() => {
    if (recentParishActivities.length < 2 || isParishActivityDetailsModalOpen) return undefined;

    const timer = window.setTimeout(() => {
      setParishActivitySlideIndex((current) =>
        current >= recentParishActivities.length - 1 ? 0 : current + 1,
      );
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [
    isParishActivityDetailsModalOpen,
    parishActivitySlideIndex,
    recentParishActivities.length,
  ]);

  const entriesByDate = calendarEntries.reduce((acc, entry) => {
    if (!entry?.eventDate) return acc;
    acc[entry.eventDate] = acc[entry.eventDate] || [];
    acc[entry.eventDate].push(entry);
    return acc;
  }, {});

  const priestNotesByDate = priestScheduleNotes.reduce((acc, note) => {
    if (!note?.noteDate) return acc;
    acc[note.noteDate] = acc[note.noteDate] || [];
    acc[note.noteDate].push(note);
    return acc;
  }, {});
  const getPendingPriestNoteCount = (dateKey) =>
    (priestNotesByDate[dateKey] || []).filter((note) => note.status === "pending").length;
  const getSortedPriestNotes = (dateKey) =>
    [...(priestNotesByDate[dateKey] || [])].sort(
      (left, right) => Number(right.status === "pending") - Number(left.status === "pending"),
    );

  const selectedDateEntries = selectedDate
    ? sortCalendarEntriesByStartTime(calendarEntries.filter((entry) => entry.eventDate === selectedDate))
    : [];
  const specialProgramEntries = calendarEntries
    .filter((entry) => {
      if (!isSpecialProgramEntry(entry)) return false;
      const eventKey = String(entry?.eventDate || "").trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(eventKey) && eventKey < getManilaDateKey()) return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = `${a?.eventDate || ""}T${a?.startTime || "00:00"}:00`;
      const dateB = `${b?.eventDate || ""}T${b?.startTime || "00:00"}:00`;
      return dateA.localeCompare(dateB);
    });
  const selectedDateDayOfWeek = selectedDate ? new Date(`${selectedDate}T00:00:00`).getDay() : null;
  const isSelectedDateDayOff = selectedDate
    ? dayOffSpecificDates.includes(selectedDate) || dayOffWeekday === selectedDateDayOfWeek
    : false;
  const hasSelectedDateItems = selectedDateEntries.length > 0 || isSelectedDateDayOff;
  const selectedDateLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const visibleScheduleDate =
    dateScheduleSlideStep === 0 ? selectedDate : shiftDateKey(selectedDate, dateScheduleSlideStep);
  const visibleScheduleDateLabel = formatLongDate(visibleScheduleDate);
  const scheduleSlideDates = [-1, 0, 1].map((offset) => shiftDateKey(selectedDate, offset));
  const getScheduleDateMeta = (dateKey) => {
    const normalizedDate = String(dateKey || "").trim();
    const dayOfWeek = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)
      ? new Date(`${normalizedDate}T00:00:00`).getDay()
      : null;
    return {
      dateKey: normalizedDate,
      label: formatLongDate(normalizedDate),
      entries: sortCalendarEntriesByStartTime(
        calendarEntries.filter((entry) => entry.eventDate === normalizedDate),
      ),
      isDayOff:
        Boolean(normalizedDate) &&
        (dayOffSpecificDates.includes(normalizedDate) || dayOffWeekday === dayOfWeek),
      isSpecificDayOff: dayOffSpecificDates.includes(normalizedDate),
      isHalfDay:
        Boolean(normalizedDate) &&
        Boolean(halfDaySetting) &&
        halfDaySetting.weekday === dayOfWeek &&
        !dayOffSpecificDates.includes(normalizedDate) &&
        dayOffWeekday !== dayOfWeek,
    };
  };
  const applySelectedScheduleDate = (nextDate) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
    setSelectedDate(nextDate);
    const [year, month] = nextDate.split("-").map(Number);
    setCalendarMonth((current) => {
      if (current.getFullYear() === year && current.getMonth() === month - 1) return current;
      return new Date(year, month - 1, 1);
    });
  };
  const handleShiftSelectedScheduleDate = (days) => {
    const direction = days > 0 ? 1 : -1;
    const nextDate = shiftDateKey(selectedDate, direction);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || dateScheduleSlideStep !== 0) return;
    setDateScheduleSlideStep(direction);
  };
  const handleDateScheduleSlideEnd = (event) => {
    if (event.target !== event.currentTarget || dateScheduleSlideStep === 0) return;
    applySelectedScheduleDate(shiftDateKey(selectedDate, dateScheduleSlideStep));
    setDateScheduleSlideStep(0);
  };

  useEffect(() => {
    if (!isDateSchedulesModalOpen) {
      setDateScheduleSlideStep(0);
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleShiftSelectedScheduleDate(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleShiftSelectedScheduleDate(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDateSchedulesModalOpen, selectedDate, dateScheduleSlideStep]);

  const parishHeading = isReadOnly
    ? readOnlyParishName || user.parishName || "Our Lady of Guadalupe Parish - Villanueva"
    : user.parishName || user.fullName || user.userName || "Our Lady of Guadalupe Parish - Villanueva";

  const getDateCellClass = (dayNumber) => {
    const dateString = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    const dayOfWeek = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), dayNumber).getDay();
    const dayEntries = entriesByDate[dateString] || [];
    const isSpecificDayOff = dayOffSpecificDates.includes(dateString);

    // Day-off must have highest visual priority on the calendar.
    if (isSpecificDayOff || dayOffWeekday === dayOfWeek) return "is-day-off";
    const entryClass = getCalendarDateColorClass(dayEntries, dateString, calendarNow);
    if (halfDaySetting && halfDaySetting.weekday === dayOfWeek) {
      return [entryClass, "is-half-day"].filter(Boolean).join(" ");
    }
    return entryClass;
  };
  const halfDayHoursLabel = halfDaySetting
    ? `${formatTimeTo12Hour(halfDaySetting.startTime)} - ${formatTimeTo12Hour(halfDaySetting.endTime)}`
    : "";

  return (
    <main className="dashboard-layout">
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onSettings={isReadOnly ? () => navigate("/dashboard/settings") : undefined}
        onLogout={handleLogout}
      />
      {calendarNotice ? (
        <div className="admin-top-notice" role="status">
          {calendarNotice}
        </div>
      ) : null}
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant={isReadOnly ? "user" : "admin"} />
        <section className="dashboard-main">
          <DashboardWelcomeHeader
            parishName={parishHeading}
            timeLabel={phNowLabel}
            officeStatus={officeStatus.office}
          >
            {isReadOnly ? (
              <>
                <button type="button" className="admin-primary-action" onClick={openAppointmentModal}>
                  <Plus size={16} aria-hidden="true" />
                  Make Appointment
                </button>
                <button type="button" className="admin-primary-action" onClick={openCertificateTypeModal}>
                  <FileText size={16} aria-hidden="true" />
                  Request Certificate
                </button>
              </>
            ) : (
              <>
                <button type="button" className="admin-primary-action" onClick={openAppointmentModal}>
                  <Plus size={16} aria-hidden="true" />
                  Make Appointment
                </button>
                <button type="button" className="admin-primary-action" onClick={openCertificateTypeModal}>
                  <FileText size={16} aria-hidden="true" />
                  Certificate Request
                </button>
              </>
            )}
          </DashboardWelcomeHeader>

          {!isReadOnly ? (
            <section className="admin-stats-grid" aria-label="Admin overview metrics">
            <article
              className="admin-stat-card is-clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate("/admin/appointment-requests")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate("/admin/appointment-requests");
                }
              }}
            >
              <span className="admin-stat-icon is-pending">
                <Clock3 size={18} />
              </span>
              <div>
                <p className="admin-stat-label">Pending Appointments</p>
                <h3>{isLoadingDashboardStats ? "..." : dashboardStats.pendingAppointments}</h3>
              </div>
            </article>
            <article className="admin-stat-card">
              <span className="admin-stat-icon is-approved">
                <CheckCircle2 size={18} />
              </span>
              <div>
                <p className="admin-stat-label">Approved Today</p>
                <h3>{isLoadingDashboardStats ? "..." : dashboardStats.approvedToday}</h3>
              </div>
            </article>
            <article
              className="admin-stat-card is-clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate("/admin/progress-tracker")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate("/admin/progress-tracker");
                }
              }}
            >
              <span className="admin-stat-icon is-ongoing">
                <Users size={18} />
              </span>
              <div>
                <p className="admin-stat-label">Ongoing Appointments</p>
                <h3>{isLoadingDashboardStats ? "..." : dashboardStats.ongoingAppointments}</h3>
              </div>
            </article>
            <article
              className="admin-stat-card is-clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate("/admin/certificate-requests")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate("/admin/certificate-requests");
                }
              }}
            >
              <span className="admin-stat-icon is-certificate">
                <FileText size={18} />
              </span>
              <div>
                <p className="admin-stat-label">Certificate Requests</p>
                <h3>{isLoadingDashboardStats ? "..." : dashboardStats.certificateRequests}</h3>
              </div>
            </article>
            </section>
          ) : null}

          <section className={`admin-content-grid${isReadOnly ? " is-read-only-dashboard-grid" : ""}`}>
            <div className="admin-left-column">
              <article className="admin-content-card admin-announcements-card">
                <header className="admin-content-header">
                  <h3>
                    <Megaphone size={18} aria-hidden="true" />
                    Today&apos;s Schedules
                  </h3>
                  {hasMoreTodayAnnouncements ? (
                    <button type="button" onClick={() => setIsAnnouncementsModalOpen(true)}>
                      See more
                    </button>
                  ) : null}
                </header>
                <ul className="admin-compact-list admin-announcement-list">
                  {previewTodayAnnouncementItems.map((item) => (
                    <li key={item.id} className="admin-announcement-item">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      {item.subDetail ? <span>{item.subDetail}</span> : null}
                    </li>
                  ))}
                </ul>
              </article>

              {isReadOnly ? (
                <article className="admin-content-card admin-special-programs-card">
                  <header className="admin-content-header">
                    <h3>
                      <CalendarDays size={18} aria-hidden="true" />
                      Special Sacramental Programs
                      <PageGuide pageKey="dashboard-special-programs" />
                    </h3>
                  </header>
                  <ul className="admin-compact-list admin-special-program-list">
                    {specialProgramEntries.length > 0 ? (
                      specialProgramEntries.map((entry) => (
                        <li
                          key={`special-program-${entry.id}`}
                          className="admin-special-program-item admin-special-program-card-button is-clickable"
                          onClick={() => handleApplySpecialProgram(entry)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleApplySpecialProgram(entry);
                            }
                          }}
                          aria-label={`Apply for ${entry.s_sacramentName || entry.title}`}
                        >
                          <strong>{entry.s_sacramentName || entry.title}</strong>
                          <span>Event: {formatEventDateTimeLabel(entry.eventDate, entry.startTime, entry.endTime, entry.occupiedSlots)}</span>
                          <span>Deadline of Submission: {entry.deadline ? formatLongDate(entry.deadline) : "Not set"}</span>
                          <span>Slots: {Boolean(entry.isUnlimitedSlots) || Number(entry.maxSlots) <= 0 ? "Unlimited" : entry.maxSlots}</span>
                        </li>
                      ))
                    ) : (
                      <li>
                        <strong>No special programs yet</strong>
                        <span>Add upcoming sacramental programs here.</span>
                      </li>
                    )}
                  </ul>
                </article>
              ) : null}
            </div>
            <div className="admin-right-column">
              <article className="admin-content-card admin-verse-card">
                <header className="admin-content-header">
                  <h3>
                    <BookOpen size={18} aria-hidden="true" />
                    Verse of the Day
                  </h3>
                </header>
                <span className="admin-verse-sacred-art" aria-hidden="true">
                  <Sparkles className="admin-verse-sparkle admin-verse-sparkle-left" size={15} />
                  <Cross className="admin-verse-cross" size={38} strokeWidth={1.6} />
                  <Sparkles className="admin-verse-sparkle admin-verse-sparkle-right" size={12} />
                </span>
                <div className="admin-verse-content">
                  <div className="admin-verse-reading">
                    <span className="admin-verse-quote-icon" aria-hidden="true">
                      <Quote size={18} />
                    </span>
                    <div className="admin-verse-copy">
                      <p>&ldquo;{verseOfTheDay?.text || "Loading verse..."}&rdquo;</p>
                      <span>{isVerseLoading ? "Loading reference..." : verseOfTheDay?.reference || "Unknown reference"}</span>
                    </div>
                  </div>
                </div>
              </article>

              <article className="admin-content-card admin-calendar-card">
                <header className="admin-content-header">
                  <h3>
                    <CalendarDays size={18} aria-hidden="true" />
                    Calendar
                  </h3>
                  <div className="admin-calendar-controls">
                    <button
                      type="button"
                      className="admin-today-button"
                      onClick={() => {
                        setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                        setSelectedDate(todayString);
                      }}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="admin-icon-nav"
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <strong className="admin-month-label">{monthLabel}</strong>
                    <button
                      type="button"
                      className="admin-icon-nav"
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                    >
                      <ChevronRight size={20} />
                    </button>
                    {!isReadOnly ? (
                      <button
                        type="button"
                        className="admin-add-icon-button"
                        aria-label="Add calendar entry"
                        onClick={() => {
                          resetCalendarForm();
                          setIsCalendarModalOpen(true);
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    ) : null}
                  </div>
                </header>

                <div className="admin-calendar-grid">
                  {dayNames.map((day) => (
                    <span key={day} className="admin-calendar-day">
                      {day}
                    </span>
                  ))}
                  {Array.from({ length: firstDayIndex }).map((_, index) => (
                    <span key={`blank-${index}`} className="admin-calendar-date is-empty" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, index) => {
                    const dayNumber = index + 1;
                    const dateString = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
                    const cellClass = getDateCellClass(dayNumber);
                    const entryCount = (entriesByDate[dateString] || []).length;
                    const pendingNoteCount = isReadOnly ? 0 : getPendingPriestNoteCount(dateString);
                    return (
                      <button
                        key={`day-${dayNumber}`}
                        type="button"
                        className={`admin-calendar-date${cellClass ? ` ${cellClass}` : ""}${selectedDate === dateString ? " is-selected" : ""}${todayString === dateString ? " is-today" : ""}${pendingNoteCount > 0 ? " has-priest-note" : ""}`}
                        onClick={() => {
                          setSelectedDate(dateString);
                          setIsDateSchedulesModalOpen(true);
                        }}
                        aria-label={`View schedules for ${dateString}${pendingNoteCount > 0 ? `, ${pendingNoteCount} priest note${pendingNoteCount === 1 ? "" : "s"}` : ""}`}
                      >
                        <span className="admin-calendar-date-number">{dayNumber}</span>
                        {entryCount > 0 ? <span className="admin-calendar-entry-count">{entryCount}</span> : null}
                        {pendingNoteCount > 0 ? (
                          <span className="admin-calendar-note-count" title="Priest note waiting for review">
                            <MessageSquareText size={10} aria-hidden="true" />
                            {pendingNoteCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="admin-calendar-legend">
                  <span>
                    <i className="legend-dot is-day-off" /> Day Off
                  </span>
                  <span>
                    <i className="legend-dot is-church" /> Church Schedule
                  </span>
                  <span>
                    <i className="legend-dot is-priest" /> Priest Schedule
                  </span>
                  <span>
                    <i className="legend-dot is-activity" /> Priest Unavailability
                  </span>
                  <span>
                    <i className="legend-dot is-appointment" /> Appointment
                  </span>
                  <span>
                    <i className="legend-dot is-special" /> Special Sacrament
                  </span>
                </div>
              </article>
            </div>
          </section>

          <section className="admin-content-card admin-parish-activities-card">
            <header className="admin-content-header">
              <h3>
                <ImageIcon size={18} aria-hidden="true" />
                Recent Parish Activity
                <PageGuide pageKey="parish-activity" />
              </h3>
              {canManageParishActivities ? (
                <button
                  type="button"
                  className="admin-parish-activity-add-button"
                  onClick={openAddParishActivityModal}
                >
                  <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
                  Add Activity
                </button>
              ) : null}
            </header>

            {isLoadingParishActivities ? <p className="admin-selected-date-empty">Loading parish activities...</p> : null}
            {!isLoadingParishActivities && parishActivitiesError ? <p className="admin-calendar-error">{parishActivitiesError}</p> : null}
            {!isLoadingParishActivities && !parishActivitiesError ? (
              recentParishActivities.length > 0 ? (
                <div className="admin-parish-activity-slider">
                  <button
                    type="button"
                    className="admin-parish-activity-arrow"
                    aria-label="Previous parish activity"
                    onClick={() =>
                      setParishActivitySlideIndex((current) =>
                        recentParishActivities.length > 0
                          ? (current - 1 + recentParishActivities.length) % recentParishActivities.length
                          : 0,
                      )
                    }
                    disabled={recentParishActivities.length <= 1}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="admin-parish-activity-viewport">
                    <ul className="admin-parish-activity-list">
                      {recentParishActivities.map((entry, index) => (
                        <li
                          key={`parish-activity-${entry.id}`}
                          className={`admin-parish-activity-item${safeParishActivitySlideIndex === index ? " is-active" : ""}`}
                          role={safeParishActivitySlideIndex === index ? "button" : undefined}
                          tabIndex={safeParishActivitySlideIndex === index ? 0 : -1}
                          aria-hidden={safeParishActivitySlideIndex !== index}
                          onClick={() => openParishActivityDetailsModal(entry)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openParishActivityDetailsModal(entry);
                            }
                          }}
                          aria-label={`Open full details for ${entry.title || "parish activity"}`}
                        >
                          <div className="admin-parish-activity-media">
                            {renderParishActivityCardCover(entry)}
                            <div className="admin-parish-activity-overlay">
                              {canManageParishActivities ? (
                                <button
                                  type="button"
                                  className="admin-selected-date-edit admin-selected-date-edit--on-media"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openEditParishActivityModal(entry);
                                  }}
                                  aria-label={`Edit ${entry.title || "parish activity"}`}
                                >
                                  <Pencil size={14} />
                                </button>
                              ) : null}
                              <strong>{entry.title || "Parish Activity"}</strong>
                              <span>{entry.activityDate ? `Date: ${formatDateToLong(entry.activityDate)}` : "Date not set"}</span>
                              {entry.expiresOn ? <span>{`Expires: ${formatDateToLong(entry.expiresOn)}`}</span> : null}
                              <small className="admin-parish-activity-readmore">Tap to view full details</small>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    className="admin-parish-activity-arrow"
                    aria-label="Next parish activity"
                    onClick={() =>
                      setParishActivitySlideIndex((current) =>
                        recentParishActivities.length > 0 ? (current + 1) % recentParishActivities.length : 0,
                      )
                    }
                    disabled={recentParishActivities.length <= 1}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              ) : (
                <div className="admin-parish-activity-empty-card appointment-requests-empty-state" role="status">
                  <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                    <Megaphone size={36} strokeWidth={1.5} />
                  </div>
                  <h3 className="appointment-requests-empty-state-title">No parish activities yet</h3>
                  <p className="appointment-requests-empty-state-text">
                    {canManageParishActivities
                      ? "Add a parish activity to start your parish archive. Published activities will appear here for priests and parishioners."
                      : "Published parish activities will appear here once they are added."}
                  </p>
                </div>
              )
            ) : null}
            {!isLoadingParishActivities && !parishActivitiesError && recentParishActivities.length > 1 ? (
              <div className="admin-parish-activity-dots" role="tablist" aria-label="Parish activity slides">
                {recentParishActivities.map((entry, index) => (
                  <button
                    key={`parish-activity-dot-${entry.id}`}
                    type="button"
                    role="tab"
                    aria-selected={safeParishActivitySlideIndex === index}
                    className={`admin-parish-activity-dot${safeParishActivitySlideIndex === index ? " is-active" : ""}`}
                    onClick={() => setParishActivitySlideIndex(index)}
                    aria-label={`Show parish activity ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </section>

        </section>
      </div>

      {isParishActivityDetailsModalOpen && selectedParishActivity ? (
        <div
          className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered"
          role="presentation"
          onClick={closeParishActivityDetailsModal}
        >
          <section
            className="admin-calendar-modal admin-parish-activity-details-modal parish-activity-post"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedParishActivity.title || "Parish Activity"} details`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="parish-activity-post-header">
              <span className="parish-activity-post-avatar" aria-hidden="true">
                <ImageIcon size={16} />
              </span>
              <div className="parish-activity-post-identity">
                <strong>{selectedParishActivity.title || "Parish Activity"}</strong>
              </div>
              <div className="parish-activity-post-actions">
                {canManageParishActivities ? (
                  <button
                    type="button"
                    aria-label="Edit parish activity"
                    onClick={() => {
                      openEditParishActivityModal(selectedParishActivity);
                      closeParishActivityDetailsModal();
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                ) : null}
                <button type="button" aria-label="Close" onClick={closeParishActivityDetailsModal}>
                  <X size={18} />
                </button>
              </div>
            </header>
            <ParishActivityMediaCarousel
              items={normalizeParishActivityMediaForDisplay(selectedParishActivity)}
              resolveSrc={resolveParishActivityMediaSrc}
              activityTitle={selectedParishActivity.title || "Parish activity"}
              postedDate={
                /^\d{4}-\d{2}-\d{2}$/.test(String(selectedParishActivity.activityDate || "").trim())
                  ? formatDateToLong(selectedParishActivity.activityDate)
                  : ""
              }
              variant="post"
            />
          </section>
        </div>
      ) : null}

      {isParishActivityModalOpen ? (
        <div className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered" role="presentation" onClick={closeParishActivityModal}>
          <section
            className="admin-calendar-modal admin-calendar-modal--activity"
            role="dialog"
            aria-modal="true"
            aria-label={editingParishActivityId ? "Edit parish activity" : "Add parish activity"}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>{editingParishActivityId ? "Edit Parish Activity" : "Add Parish Activity"}</h3>
              <button type="button" onClick={closeParishActivityModal} disabled={isSavingParishActivity || isDeletingParishActivity}>
                Close
              </button>
            </header>
            <form className="admin-calendar-form" onSubmit={handleSaveParishActivity}>
              <input
                type="text"
                name="title"
                value={parishActivityForm.title}
                placeholder="Activity title"
                onChange={handleParishActivityInputChange}
                required
              />
              <label className="admin-parish-activity-expire-label">Activity date</label>
              <ParishDateField
                name="activityDate"
                value={parishActivityForm.activityDate}
                allowFuture
                onChange={(event) => {
                  const activityDate = event.target.value;
                  setParishActivityForm((current) => ({
                    ...current,
                    activityDate,
                    activityDateDisplay: isoToUsDate(activityDate),
                  }));
                  setParishActivitiesError("");
                }}
              />
              <label className="admin-parish-activity-expire-label">Expiration date (optional)</label>
              <ParishDateField
                name="expiresOn"
                value={parishActivityForm.expiresOn}
                allowFuture
                disablePast
                onChange={(event) => {
                  const expiresOn = event.target.value;
                  setParishActivityForm((current) => ({
                    ...current,
                    expiresOn,
                    expiresOnDisplay: isoToUsDate(expiresOn),
                  }));
                  setParishActivitiesError("");
                }}
              />
              <label className="admin-parish-activity-file-picker">
                <span className="admin-parish-activity-file-picker-button">
                  {parishActivityImageBusyKey === "cover" ? "Uploading..." : "Choose files"}
                </span>
                <span className="admin-parish-activity-file-picker-name">
                  {parishActivityCoverFileLabel || ((parishActivityForm.media || []).length > 0 ? `${parishActivityForm.media.length} file(s) attached` : "No files chosen")}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
                  multiple
                  onChange={handleParishActivityMediaFileChange}
                  disabled={Boolean(parishActivityImageBusyKey) || isSavingParishActivity}
                />
              </label>
              {(parishActivityForm.media || []).length > 0 ? (
                <div className="admin-parish-activity-form-media-list">
                  {(parishActivityForm.media || []).map((item, index) => (
                    <div className="admin-parish-activity-form-media-item" key={`parish-activity-form-media-${index}`}>
                      <div className="admin-parish-activity-form-preview">
                        {renderParishActivityMediaPreview(item, `Selected media ${index + 1}`)}
                        <button
                          type="button"
                          className="admin-parish-activity-form-media-remove"
                          aria-label={`Remove media ${index + 1}`}
                          onClick={() => removeParishActivityMediaItem(index)}
                          disabled={
                            isSavingParishActivity ||
                            isDeletingParishActivity ||
                            Boolean(parishActivityImageBusyKey) ||
                            parishActivityMediaRemovingIndex === index
                          }
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                      <label className="admin-parish-activity-form-media-label">
                        <span>{item.type === "video" ? "What's on this video (optional)" : "What's on this picture (optional)"}</span>
                        <input
                          type="text"
                          value={item.summary || ""}
                          placeholder={item.type === "video" ? "Describe this video" : "Describe this picture"}
                          onChange={(event) => handleParishActivityMediaFieldChange(index, "summary", event.target.value)}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="admin-parish-activity-media-hint">Images and videos only. Videos must be shorter than 5 minutes.</p>
              {parishActivitiesError ? <p className="admin-calendar-error">{parishActivitiesError}</p> : null}
              <div className="admin-calendar-form-actions">
                {Number.isInteger(editingParishActivityId) && editingParishActivityId > 0 ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={handleDeleteParishActivity}
                    disabled={isSavingParishActivity || isDeletingParishActivity}
                  >
                    {isDeletingParishActivity ? "Deleting..." : "Delete Activity"}
                  </button>
                ) : null}
                <button type="submit" disabled={isSavingParishActivity || isDeletingParishActivity || Boolean(parishActivityImageBusyKey) || parishActivityMediaRemovingIndex !== null}>
                  {isSavingParishActivity ? "Saving..." : editingParishActivityId ? "Save Changes" : "Add Activity"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={closeParishActivityModal}
                  disabled={isSavingParishActivity || isDeletingParishActivity}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isDateSchedulesModalOpen && selectedDate ? (
        <div
          className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered"
          role="presentation"
          onClick={() => setIsDateSchedulesModalOpen(false)}
        >
          <section
            className="admin-calendar-modal admin-date-schedules-modal"
            role="dialog"
            aria-modal="true"
            aria-label={visibleScheduleDateLabel}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header admin-date-schedules-hero">
              <div>
                <p className="admin-date-schedules-kicker">Parish day schedule</p>
                <h3>{formatCalendarWeekday(visibleScheduleDate) || "Day schedule"}</h3>
                <p className="admin-date-schedules-hero-date">{visibleScheduleDateLabel}</p>
              </div>
              <button
                type="button"
                className="admin-date-schedules-close"
                onClick={() => setIsDateSchedulesModalOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>
            <div className="admin-date-schedules-slider">
              <button
                type="button"
                className="admin-date-schedules-arrow"
                aria-label="Previous day"
                onClick={() => handleShiftSelectedScheduleDate(-1)}
                disabled={dateScheduleSlideStep !== 0}
              >
                <ChevronLeft size={18} />
              </button>
              <div className="admin-date-schedules-viewport">
                <div
                  className={`admin-date-schedules-track${dateScheduleSlideStep !== 0 ? " is-animating" : ""}${
                    dateScheduleSlideStep === 1 ? " is-next" : dateScheduleSlideStep === -1 ? " is-prev" : ""
                  }`}
                  onTransitionEnd={handleDateScheduleSlideEnd}
                >
                  {scheduleSlideDates.map((dateKey) => {
                    const panel = getScheduleDateMeta(dateKey);
                    return (
                      <div key={`schedule-slide-${dateKey}`} className="admin-date-schedules-slide">
                        <CalendarDayAgenda
                          dateKey={panel.dateKey}
                          dateLabel={panel.label}
                          entries={panel.entries}
                          isDayOff={panel.isDayOff}
                          isSpecificDayOff={panel.isSpecificDayOff}
                          isHalfDay={panel.isHalfDay}
                          halfDayHoursLabel={halfDayHoursLabel}
                          isReadOnly={isReadOnly}
                          onEditEntry={handleEditEntry}
                          onRemoveEntry={handleRemovePastEntry}
                          onEditDayOff={handleEditDayOff}
                          resolvePriestName={getCalendarPriestName}
                        >
                          {!isReadOnly ? (
                            <AdminDayNotesPanel
                              notes={getSortedPriestNotes(panel.dateKey)}
                              busyNoteId={busyPriestNoteId}
                              onBlockSchedule={handleBlockPriestNoteHours}
                              onMarkReviewed={handleMarkPriestNoteReviewed}
                            />
                          ) : null}
                        </CalendarDayAgenda>
                      </div>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                className="admin-date-schedules-arrow"
                aria-label="Next day"
                onClick={() => handleShiftSelectedScheduleDate(1)}
                disabled={dateScheduleSlideStep !== 0}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isAnnouncementsModalOpen ? (
        <div className="admin-calendar-modal-overlay" role="presentation" onClick={() => setIsAnnouncementsModalOpen(false)}>
          <section
            className="admin-calendar-modal"
            role="dialog"
            aria-modal="true"
            aria-label="All today's schedules"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>All Today&apos;s Schedules</h3>
              <button type="button" onClick={() => setIsAnnouncementsModalOpen(false)}>
                Close
              </button>
            </header>
            <ul className="admin-compact-list">
              {normalizedTodayAnnouncementItems.map((item) => (
                <li key={`modal-${item.id}`}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  {item.subDetail ? <span>{item.subDetail}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {isAppointmentModalOpen ? (
        <div
          className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered"
          role="presentation"
          onClick={closeAppointmentModal}
        >
          <section
            className={`admin-calendar-modal admin-appointment-modal admin-appointment-flow-modal ${
              appointmentStep === "pick"
                ? "is-type-step"
                : appointmentStep === "details"
                  ? "is-details-step"
                  : appointmentStep === "marriage_docs" ||
                      appointmentStep === "death_mass_docs" ||
                      appointmentStep === "baptism_docs" ||
                      appointmentStep === "special_program_docs"
                    ? "is-marriage-docs-step"
                    : "is-review-step"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Choose sacrament"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              {appointmentStep !== "pick" ? (
                <button
                  type="button"
                  className="admin-appointment-back-button"
                  onClick={handleAppointmentHeaderBack}
                  aria-label="Go back"
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>
              ) : null}
              <h3>
                {appointmentStep === "pick"
                  ? "Appointment Type"
                  : appointmentStep === "special_program_docs"
                    ? "Special Sacrament Requirements"
                  : appointmentStep === "marriage_docs" ||
                      appointmentStep === "death_mass_docs" ||
                      appointmentStep === "baptism_docs"
                    ? "Sacrament Requirements"
                    : appointmentStep === "details"
                      ? "Enter Appointment Details"
                      : "Review Appointment Request"}
              </h3>
              <button type="button" className="admin-appointment-close-button" onClick={closeAppointmentModal}>
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            {appointmentStep === "pick" ? (
              <>
                {!isReadOnly ? (
                  <div className="admin-sacrament-schema-shortcut-row">
                    <button
                      type="button"
                      className="admin-sacrament-schema-shortcut-button"
                      onClick={() => navigate("/admin/sacrament-form-schemas", { state: { fromDashboard: true } })}
                    >
                      Manage Sacraments
                    </button>
                  </div>
                ) : null}
                {isLoadingSacraments ? <p className="admin-selected-date-empty">Loading sacraments...</p> : null}
                {!isLoadingSacraments && sacramentsError ? <p className="admin-calendar-error">{sacramentsError}</p> : null}
                {!isLoadingSacraments && !sacramentsError ? (
                  appointmentTypeCards.length > 0 ? (
                    <div className="admin-sacraments-grid">
                      {appointmentTypeCards.map((sacrament, cardIndex) => (
                        <article
                          key={`sacrament-${sacrament.sacramentID}`}
                          className={`admin-sacrament-card ${getAppointmentTypeCardClass(sacrament.sacramentName, cardIndex)}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectSacrament(sacrament)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleSelectSacrament(sacrament);
                            }
                          }}
                        >
                          <div className="admin-sacrament-card-head">
                            <span
                              className={`admin-sacrament-icon-badge ${getSacramentIconToneClass(sacrament.sacramentName)}`}
                              aria-hidden="true"
                            >
                              {getSacramentTypeIcon(sacrament.sacramentName)}
                            </span>
                          </div>
                          <h4>{getSacramentDisplayLabel(sacrament.sacramentName)}</h4>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-selected-date-empty">No sacraments available yet.</p>
                  )
                ) : null}
              </>
            ) : null}

            {appointmentStep === "marriage_docs" && selectedSacrament ? (
              <div className="admin-marriage-docs-panel">
                <div className="admin-marriage-docs-intro">
                  <span className="admin-marriage-docs-badge">{selectedSacrament.sacramentName}</span>
                  <p className="admin-marriage-docs-lead">
                    Bring the documents below when you come onsite. Complete the non-document steps before your wedding date when applicable.
                  </p>
                </div>
                <div className="admin-marriage-docs-columns">
                  <article
                    className="admin-marriage-docs-card admin-marriage-docs-card--documents"
                    aria-labelledby="marriage-docs-heading"
                  >
                    <div className="admin-marriage-docs-card-head">
                      <span className="admin-marriage-docs-card-icon-wrap" aria-hidden="true">
                        <FileText size={22} strokeWidth={2} />
                      </span>
                      <div className="admin-marriage-docs-card-titles">
                        <h4 id="marriage-docs-heading">Required documents</h4>
                        <p className="admin-marriage-docs-note">* Pass requirement onsite</p>
                      </div>
                    </div>
                    <ul className="admin-marriage-docs-item-grid">
                      {marriageRequiredDocumentItems.map((label) => (
                        <li key={`marriage-doc-${label}`}>
                          <CheckCircle2 size={14} className="admin-marriage-docs-item-icon" aria-hidden="true" />
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                  <article
                    className="admin-marriage-docs-card admin-marriage-docs-card--steps"
                    aria-labelledby="marriage-nondoc-heading"
                  >
                    <div className="admin-marriage-docs-card-head">
                      <span className="admin-marriage-docs-card-icon-wrap admin-marriage-docs-card-icon-wrap--steps" aria-hidden="true">
                        <ClipboardList size={22} strokeWidth={2} />
                      </span>
                      <div className="admin-marriage-docs-card-titles">
                        <h4 id="marriage-nondoc-heading">Non-document requirements</h4>
                        <p className="admin-marriage-docs-note admin-marriage-docs-note--muted">Seminars and interviews</p>
                      </div>
                    </div>
                    <ul className="admin-marriage-docs-item-grid admin-marriage-docs-item-grid--steps">
                      {marriageNonDocumentItems.map((label) => (
                        <li key={`marriage-nondoc-${label}`}>
                          <CheckCircle2 size={14} className="admin-marriage-docs-item-icon" aria-hidden="true" />
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </div>
                <PaymentPreview
                  residentFee={selectedSacrament.residentFee}
                  nonResidentFee={selectedSacrament.nonResidentFee}
                />
                <div className="admin-marriage-docs-footer">
                  <div className="admin-appointment-flow-actions">
                    <button type="button" className="primary" onClick={handleContinueFromAppointmentPrerequisite}>
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {appointmentStep === "death_mass_docs" && selectedSacrament ? (
              <div className="admin-marriage-docs-panel admin-funeral-mass-docs-panel">
                <div className="admin-marriage-docs-intro">
                  <span className="admin-marriage-docs-badge">{selectedSacrament.sacramentName}</span>
                  <p className="admin-marriage-docs-lead">Bring the documents below when you come onsite.</p>
                </div>
                <div className="admin-funeral-mass-docs-single">
                  <article
                    className="admin-marriage-docs-card admin-marriage-docs-card--documents"
                    aria-labelledby="funeral-mass-docs-heading"
                  >
                    <div className="admin-marriage-docs-card-head">
                      <span className="admin-marriage-docs-card-icon-wrap" aria-hidden="true">
                        <FileText size={22} strokeWidth={2} />
                      </span>
                      <div className="admin-marriage-docs-card-titles">
                        <h4 id="funeral-mass-docs-heading">Required Documents</h4>
                        <p className="admin-marriage-docs-note">* Pass Requirement Onsite</p>
                      </div>
                    </div>
                    <ul className="admin-marriage-docs-item-grid admin-marriage-docs-item-grid--funeral-mass">
                      {deathMassRequiredDocumentItems.map((label) => (
                        <li key={`funeral-mass-doc-${label}`}>
                          <CheckCircle2 size={14} className="admin-marriage-docs-item-icon" aria-hidden="true" />
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </div>
                <PaymentPreview
                  residentFee={selectedSacrament.residentFee}
                  nonResidentFee={selectedSacrament.nonResidentFee}
                />
                <div className="admin-marriage-docs-footer">
                  <div className="admin-appointment-flow-actions">
                    <button type="button" className="primary" onClick={handleContinueFromAppointmentPrerequisite}>
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {appointmentStep === "baptism_docs" && selectedSacrament ? (
              <div className="admin-marriage-docs-panel">
                <div className="admin-marriage-docs-intro">
                  <span className="admin-marriage-docs-badge">{selectedSacrament.sacramentName}</span>
                  <p className="admin-marriage-docs-lead">
                    Bring the documents below when you come onsite. Complete the seminar requirements when your parish schedules them.
                  </p>
                </div>
                <div className="admin-marriage-docs-columns">
                  <article
                    className="admin-marriage-docs-card admin-marriage-docs-card--documents"
                    aria-labelledby="baptism-docs-heading"
                  >
                    <div className="admin-marriage-docs-card-head">
                      <span className="admin-marriage-docs-card-icon-wrap" aria-hidden="true">
                        <FileText size={22} strokeWidth={2} />
                      </span>
                      <div className="admin-marriage-docs-card-titles">
                        <h4 id="baptism-docs-heading">Required Documents</h4>
                        <p className="admin-marriage-docs-note">* Pass Requirement Onsite</p>
                      </div>
                    </div>
                    <ul className="admin-marriage-docs-item-grid">
                      {baptismRequiredDocumentItems.map((label) => (
                        <li key={`baptism-doc-${label}`}>
                          <CheckCircle2 size={14} className="admin-marriage-docs-item-icon" aria-hidden="true" />
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                  <article
                    className="admin-marriage-docs-card admin-marriage-docs-card--steps"
                    aria-labelledby="baptism-nondoc-heading"
                  >
                    <div className="admin-marriage-docs-card-head">
                      <span className="admin-marriage-docs-card-icon-wrap admin-marriage-docs-card-icon-wrap--steps" aria-hidden="true">
                        <ClipboardList size={22} strokeWidth={2} />
                      </span>
                      <div className="admin-marriage-docs-card-titles">
                        <h4 id="baptism-nondoc-heading">Non Documents Requirements</h4>
                        <p className="admin-marriage-docs-note admin-marriage-docs-note--muted">Seminars</p>
                      </div>
                    </div>
                    <ul className="admin-marriage-docs-item-grid admin-marriage-docs-item-grid--steps">
                      {baptismNonDocumentItems.map((label) => (
                        <li key={`baptism-nondoc-${label}`}>
                          <CheckCircle2 size={14} className="admin-marriage-docs-item-icon" aria-hidden="true" />
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </div>
                <PaymentPreview
                  residentFee={selectedSacrament.residentFee}
                  nonResidentFee={selectedSacrament.nonResidentFee}
                />
                <div className="admin-marriage-docs-footer">
                  <div className="admin-appointment-flow-actions">
                    <button type="button" className="primary" onClick={handleContinueFromAppointmentPrerequisite}>
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {appointmentStep === "special_program_docs" && selectedSacrament ? (
              <div className="admin-marriage-docs-panel">
                <div className="admin-marriage-docs-intro">
                  <span className="admin-marriage-docs-badge">{selectedSacrament.sacramentName}</span>
                  <p className="admin-marriage-docs-lead">
                    Review the requirements before proceeding to your special program appointment details.
                  </p>
                </div>
                <div className="admin-marriage-docs-columns">
                  <article className="admin-marriage-docs-card admin-marriage-docs-card--documents" aria-labelledby="special-program-docs-heading">
                    <div className="admin-marriage-docs-card-head">
                      <span className="admin-marriage-docs-card-icon-wrap" aria-hidden="true">
                        <FileText size={22} strokeWidth={2} />
                      </span>
                      <div className="admin-marriage-docs-card-titles">
                        <h4 id="special-program-docs-heading">Required Documents</h4>
                        <p className="admin-marriage-docs-note">* Pass requirement onsite</p>
                      </div>
                    </div>
                    <ul className="admin-marriage-docs-item-grid">
                      {specialProgramRequiredDocumentItems.length > 0 ? (
                        specialProgramRequiredDocumentItems.map((label) => (
                          <li key={`special-doc-${label}`}>
                            <CheckCircle2 size={14} className="admin-marriage-docs-item-icon" aria-hidden="true" />
                            <span>{label}</span>
                          </li>
                        ))
                      ) : (
                        <li>
                          <CheckCircle2 size={14} className="admin-marriage-docs-item-icon" aria-hidden="true" />
                          <span>No document requirements listed.</span>
                        </li>
                      )}
                    </ul>
                  </article>
                  <article className="admin-marriage-docs-card admin-marriage-docs-card--steps" aria-labelledby="special-program-nondoc-heading">
                    <div className="admin-marriage-docs-card-head">
                      <span className="admin-marriage-docs-card-icon-wrap admin-marriage-docs-card-icon-wrap--steps" aria-hidden="true">
                        <ClipboardList size={22} strokeWidth={2} />
                      </span>
                      <div className="admin-marriage-docs-card-titles">
                        <h4 id="special-program-nondoc-heading">Non-document requirements</h4>
                        <p className="admin-marriage-docs-note admin-marriage-docs-note--muted">Seminars, orientations, and related tasks</p>
                      </div>
                    </div>
                    <ul className="admin-marriage-docs-item-grid admin-marriage-docs-item-grid--steps">
                      {specialProgramNonDocumentItems.length > 0 ? (
                        specialProgramNonDocumentItems.map((label) => (
                          <li key={`special-nondoc-${label}`}>
                            <CheckCircle2 size={14} className="admin-marriage-docs-item-icon" aria-hidden="true" />
                            <span>{label}</span>
                          </li>
                        ))
                      ) : (
                        <li>
                          <CheckCircle2 size={14} className="admin-marriage-docs-item-icon" aria-hidden="true" />
                          <span>No non-document requirements listed.</span>
                        </li>
                      )}
                    </ul>
                  </article>
                </div>
                <PaymentPreview
                  residentFee={selectedSacrament.residentFee}
                  nonResidentFee={selectedSacrament.nonResidentFee}
                />
                <div className="admin-marriage-docs-footer">
                  <div className="admin-appointment-flow-actions">
                    <button type="button" className="primary" onClick={handleContinueFromAppointmentPrerequisite}>
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {appointmentStep === "details" && selectedSacrament && selectedSacramentSchemaFields.length === 0 ? (
              <div className="certificate-request-empty-state" role="status">
                <span className="certificate-request-empty-icon" aria-hidden="true">
                  <Inbox size={28} strokeWidth={1.6} />
                </span>
                <h4>No forms yet</h4>
                <p>This sacrament does not have an appointment form yet.</p>
              </div>
            ) : appointmentStep === "details" && selectedSacrament ? (
              <form
                className="admin-appointment-details-form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  handleProceedToAppointmentReview();
                }}
              >
                <p className="admin-appointment-selected-type">
                  Sacrament Type: <strong>{selectedSacrament.sacramentName}</strong>
                </p>
                {isUserDashboardMarriageFlow ? (
                  <label className="admin-appointment-account-toggle">
                    <input
                      type="checkbox"
                      checked={useMarriageAccountDetails}
                      onChange={(event) => handleMarriageAccountDetailsToggle(event.target.checked)}
                    />
                    <span>
                      Use Account details
                      {marriageAccountTargetFieldKey
                        ? ` (${marriageAccountRole === "bride" ? "Bride" : "Groom"} details from your profile)`
                        : " (set your gender in Profile to use this)"}
                    </span>
                  </label>
                ) : null}
                <div
                  className={`admin-appointment-fields-grid ${
                    normalizeSacramentKey(selectedSacrament?.sacramentName) === "marriage"
                      ? "is-marriage-layout"
                      : isDeathMassSacramentKey(normalizeSacramentKey(selectedSacrament?.sacramentName))
                        ? "is-funeral-layout"
                        : ""
                  }`}
                >
                  {regularAppointmentFields.map((field) => (
                    <label
                      key={`appointment-field-${field.key}`}
                      className={`admin-appointment-field appointment-field-${String(field.key).replace(/[^a-zA-Z0-9_-]/g, "")}`}
                    >
                      <span>
                        {field.label}
                        {field.required === false ? " (optional)" : ""}
                      </span>
                      {isReadOnly && isPhoneFieldKey(field) ? (
                        <label className="admin-appointment-phone-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(useAccountPhoneNumber[field.key])}
                            onChange={(event) => handleUseAccountPhoneNumberToggle(field.key, event.target.checked)}
                          />
                          <em className="admin-appointment-phone-toggle-text">Use Account&apos;s phone number</em>
                        </label>
                      ) : null}
                      {field.type === "select" ? (
                        <select
                          name={field.key}
                          value={appointmentCredentials[field.key] || ""}
                          onChange={handleAppointmentCredentialChange}
                        >
                          {(field.options || []).map((option) => (
                            <option key={`${field.key}-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "file" ? (
                        <div className="admin-appointment-file-picker">
                          <input
                            id={`appointment-file-${field.key}`}
                            className="admin-appointment-file-input"
                            type="file"
                            name={field.key}
                            accept={field.accept || ".pdf,.docx,image/*"}
                            onChange={handleAppointmentFileChange}
                          />
                          <label htmlFor={`appointment-file-${field.key}`} className="admin-appointment-file-trigger">
                            Attach File
                          </label>
                          <span
                            className={`admin-appointment-file-name ${
                              appointmentCredentials[field.key] instanceof File ? "is-selected" : ""
                            }`}
                          >
                            {appointmentCredentials[field.key] instanceof File
                              ? appointmentCredentials[field.key].name
                              : "No file selected"}
                          </span>
                          <small className="admin-appointment-file-hint">
                            Accepted: PDF, DOCX, and images except GIF (max 10MB each)
                          </small>
                        </div>
                      ) : field.type === "date" ? (
                        <ParishDateField
                          name={field.key}
                          value={appointmentCredentials[field.key] || ""}
                          onChange={handleAppointmentCredentialChange}
                        />
                      ) : (
                        <input
                          type={field.type || "text"}
                          name={field.key}
                          className={
                            isPhoneFieldKey(field.key) &&
                            String(appointmentCredentials[field.key] || "").length > 0 &&
                            !PHONE_NUMBER_REGEX.test(String(appointmentCredentials[field.key] || "").trim())
                              ? "invalid-phone"
                              : undefined
                          }
                          aria-invalid={
                            (isPhoneFieldKey(field.key) &&
                              String(appointmentCredentials[field.key] || "").length > 0 &&
                              !PHONE_NUMBER_REGEX.test(String(appointmentCredentials[field.key] || "").trim())) ||
                            undefined
                          }
                          value={appointmentCredentials[field.key] || ""}
                          placeholder={field.placeholder || ""}
                          onChange={handleAppointmentCredentialChange}
                          inputMode={isPhoneFieldKey(field.key) ? "numeric" : undefined}
                          pattern={isPhoneFieldKey(field.key) ? "09\\d{9}" : undefined}
                          minLength={isPhoneFieldKey(field.key) ? 11 : undefined}
                          maxLength={isPhoneFieldKey(field.key) ? 11 : undefined}
                          disabled={
                            (isUserDashboardMarriageFlow &&
                              useMarriageAccountDetails &&
                              isMarriageDetailsStep &&
                              Boolean(marriageAccountTargetFieldKey) &&
                              (field.key === marriageAccountTargetFieldKey ||
                                field.key === marriageAccountTargetPhoneFieldKey ||
                                field.key === marriageAccountTargetAgeFieldKey ||
                                field.key === marriageAccountTargetAddressFieldKey)) ||
                            (isReadOnly && Boolean(useAccountPhoneNumber[field.key]))
                          }
                        />
                      )}
                    </label>
                  ))}
                  {listAppointmentFields.map((field) => {
                    const listTone = `${field.key || ""} ${field.label || ""}`.toLowerCase();
                    const listToneClass = listTone.includes("ninong")
                      ? " is-ninong"
                      : listTone.includes("ninang")
                        ? " is-ninang"
                        : "";
                    return (
                    <section key={`list-field-${field.key}`} className={`admin-appointment-field admin-appointment-list-field${listToneClass}`}>
                      <span>
                        {field.label}
                        {field.required === false ? " (optional)" : ""}
                      </span>
                      <ListInput
                        field={field}
                        takenNames={
                          normalizedSelectedSacramentName === "marriage"
                            ? buildTakenSponsorNames(appointmentFields, appointmentCredentials, field.key)
                            : undefined
                        }
                        value={appointmentCredentials[field.key]}
                        onChange={(nextValue) => {
                          setAppointmentCredentials((current) => ({
                            ...current,
                            [field.key]: nextValue,
                          }));
                          setAppointmentFormError("");
                        }}
                      />
                    </section>
                    );
                  })}
                </div>
                <label className="admin-appointment-field admin-appointment-note-field">
                  <span>Note (Optional)</span>
                  <textarea
                    name="appointmentNote"
                    value={appointmentNote}
                    placeholder="Add any additional details for this request"
                    onChange={(event) => {
                      setAppointmentNote(event.target.value);
                      setAppointmentFormError("");
                    }}
                    maxLength={600}
                  />
                </label>
                {appointmentFormError ? <p className="admin-calendar-error">{appointmentFormError}</p> : null}
                <div className="admin-appointment-flow-actions">
                  <button type="submit" className="primary">
                    Submit
                  </button>
                </div>
              </form>
            ) : null}

            {appointmentStep === "review" && selectedSacrament ? (
              <section className="admin-appointment-review">
                <p className="admin-appointment-selected-type">
                  Please check your entered details before submitting.
                </p>
                <div className="admin-appointment-review-grid">
                  <div className="admin-appointment-review-summary">
                    <span>Sacrament Type</span>
                    <strong>{selectedSacrament.sacramentName}</strong>
                  </div>
                  <div className="admin-appointment-review-fields">
                    {appointmentFields.map((field) => (
                      <div key={`review-${field.key}`} className="admin-appointment-review-item">
                        <span className="admin-appointment-review-label">{field.label}</span>
                        <span className={`admin-appointment-review-value${field.type === "list" || isAddressFieldKey(field) ? " is-multiline" : ""}`}>
                          {field.type === "file"
                            ? appointmentCredentials[field.key]?.name ||
                              appointmentCredentials[`${field.key}Name`] ||
                              "Not provided"
                            : field.type === "list"
                              ? formatListForDisplay(appointmentCredentials[field.key])
                              : appointmentCredentials[field.key] || "Not provided"}
                        </span>
                      </div>
                    ))}
                    <div className="admin-appointment-review-item">
                      <span className="admin-appointment-review-label">Note</span>
                      <span className="admin-appointment-review-value">{appointmentNote.trim() || "Not provided"}</span>
                    </div>
                  </div>
                </div>
                {appointmentFormError ? <p className="admin-calendar-error">{appointmentFormError}</p> : null}
                <div className="admin-appointment-flow-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={handleOpenAppointmentSubmitConfirm}
                    disabled={isSubmittingAppointment}
                  >
                    {isSubmittingAppointment ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      ) : null}

      {isCertificateTypeModalOpen ? (
        <div
          className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered"
          role="presentation"
          onClick={closeCertificateTypeModal}
        >
          <section
            className="admin-calendar-modal admin-appointment-modal admin-appointment-flow-modal is-type-step"
            role="dialog"
            aria-modal="true"
            aria-label="Choose certificate type"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>Certificate Type</h3>
              <button type="button" className="admin-appointment-close-button" onClick={closeCertificateTypeModal}>
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className="admin-sacraments-grid">
              {isLoadingCertificateTypes ? (
                <p className="admin-calendar-error">Loading certificate types...</p>
              ) : certificateTypesError ? (
                <p className="admin-calendar-error">{certificateTypesError}</p>
              ) : certificateTypeOptions.length === 0 ? (
                <p className="admin-calendar-error">No certificate types available yet.</p>
              ) : (
                certificateTypeOptions.map((certificate) => {
                  const label = String(certificate.certTypeName || "").trim() || "Certificate";
                  const certificateFee = toFeeAmount(certificate.fee);
                  return (
                    <article
                      key={certificate.certificateTypeID}
                      className={`admin-sacrament-card ${getSacramentColorClass(label)}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectCertificateType(certificate)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelectCertificateType(certificate);
                        }
                      }}
                    >
                      <div className="admin-sacrament-card-head">
                        <span
                          className={`admin-sacrament-icon-badge ${getSacramentIconToneClass(label)}`}
                          aria-hidden="true"
                        >
                          {getSacramentTypeIcon(label)}
                        </span>
                        <span className="admin-certificate-fee-badge">
                          {certificateFee === null || certificateFee === 0 ? "Free" : formatPeso(certificateFee)}
                        </span>
                      </div>
                      <h4>{label}</h4>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      ) : null}
      {isAppointmentSubmitConfirmOpen ? (
        <div className="admin-calendar-modal-overlay" role="presentation" onClick={() => setIsAppointmentSubmitConfirmOpen(false)}>
          <section
            className="admin-calendar-modal admin-delete-confirm-modal is-success"
            role="dialog"
            aria-modal="true"
            aria-label="Submit appointment request confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>Submit Request</h3>
            </header>
            <div className="admin-delete-confirm-body">
              <span className="admin-delete-confirm-icon is-success" aria-hidden="true">
                <CheckCircle2 size={24} />
              </span>
              <p>Are you sure you want to submit this appointment request?</p>
            </div>
            <div className="admin-calendar-form-actions">
              <button type="button" onClick={confirmSubmitAppointmentRequest} disabled={isSubmittingAppointment}>
                {isSubmittingAppointment ? "Submitting..." : "Submit"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setIsAppointmentSubmitConfirmOpen(false)}
                disabled={isSubmittingAppointment}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isSpecialProgramOnceNoticeOpen ? (
        <div
          className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered special-program-once-overlay"
          role="presentation"
          onClick={() => setIsSpecialProgramOnceNoticeOpen(false)}
        >
          <section
            className="special-program-once-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Already applied"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="special-program-once-mark" aria-hidden="true">
              <Info size={22} />
            </div>
            <h3>Already applied</h3>
            <p className="special-program-once-name">{selectedSacrament?.sacramentName || "This special program"}</p>
            <p className="special-program-once-copy">
              This account already applied for this special program. Each program can be requested only once. You can still review the requirements.
            </p>
            <button type="button" className="special-program-once-ok" onClick={() => setIsSpecialProgramOnceNoticeOpen(false)}>
              Okay
            </button>
          </section>
        </div>
      ) : null}

      {isCertificateRequestModalOpen ? (
        <div
          className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered"
          role="presentation"
          onClick={closeCertificateRequestModal}
        >
          <section
            className={`admin-calendar-modal admin-appointment-modal admin-appointment-flow-modal ${
              certificateRequestStep === "review" ? "is-review-step" : "is-type-step"
            } certificate-request-modal`}
            role="dialog"
            aria-modal="true"
            aria-label="Certificate request form"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <button
                type="button"
                className="admin-appointment-back-button"
                onClick={certificateRequestStep === "review" ? handleBackToCertificateDetails : handleBackToCertificateTypes}
                aria-label="Go back"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <h3>{certificateRequestStep === "review" ? "Review Certificate Request" : selectedCertificateTypeLabel || CERTIFICATE_TYPE_LABELS[selectedCertificateType] || "Certificate Request"}</h3>
              <button type="button" className="admin-appointment-close-button" onClick={closeCertificateRequestModal}>
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            {certificateRequestStep === "details" && certificateRequestSchema.length === 0 ? (
              <div className="certificate-request-empty-state" role="status">
                <span className="certificate-request-empty-icon" aria-hidden="true">
                  <Inbox size={28} strokeWidth={1.6} />
                </span>
                <h4>No forms yet</h4>
                <p>This certificate does not have a request form yet.</p>
                {!isReadOnly && Number.isInteger(selectedCertificateTypeId) && selectedCertificateTypeId > 0 ? (
                  <button
                    type="button"
                    className="primary certificate-request-empty-action"
                    onClick={() => {
                      const typeId = selectedCertificateTypeId;
                      closeCertificateRequestModal();
                      navigate(`/admin/certificate-types?certificateTypeID=${typeId}`);
                    }}
                  >
                    Add forms
                  </button>
                ) : null}
              </div>
            ) : certificateRequestStep === "details" ? (
              <form className="admin-appointment-details-form" noValidate onSubmit={handleProceedToCertificateReview}>
                <p className="admin-appointment-selected-type">
                  {isReadOnly
                    ? "Fill in the required details, then continue to review before submitting."
                    : "Enter the requester name and the personal details for this onsite certificate. It is recorded as accepted, so you only mark it done after the certificate is released."}
                </p>
                {isReadOnly && selectedCertificateType === "marriage" ? (
                  <label className="admin-appointment-account-toggle">
                    <input
                      type="checkbox"
                      checked={useMarriageCertificateAccountDetails}
                      onChange={(event) => handleMarriageCertificateAccountDetailsToggle(event.target.checked)}
                    />
                    <span>
                      Use Account details
                      {marriageCertificateAccountTargetFieldKey
                        ? ` (${marriageCertificateAccountRole === "bride" ? "Bride" : "Groom"} details from your profile)`
                        : " (set your gender in Profile to use this)"}
                    </span>
                  </label>
                ) : null}
                <div className="admin-appointment-fields-grid">
                  {certificateRequestSchema.map((field) => (
                    <label
                      key={`certificate-field-${field.key}`}
                      className={`admin-appointment-field appointment-field-${String(field.key).replace(/[^a-zA-Z0-9_-]/g, "")}`}
                    >
                      <span>
                        {field.label}
                        {field.required === false ? " (optional)" : ""}
                      </span>
                      {isReadOnly && isPhoneFieldKey(field) ? (
                        <label className="admin-appointment-phone-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(useCertificateAccountPhoneNumber[field.key])}
                            onChange={(event) => handleUseCertificateAccountPhoneNumberToggle(field.key, event.target.checked)}
                          />
                          <em className="admin-appointment-phone-toggle-text">Use Account&apos;s phone number</em>
                        </label>
                      ) : null}
                      {field.type === "select" ? (
                        <select
                          name={field.key}
                          value={certificateRequestValues[field.key] || ""}
                          onChange={handleCertificateRequestFieldChange}
                        >
                          {(field.options || []).map((option) => (
                            <option key={`certificate-${field.key}-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "date" ? (
                        <ParishDateField
                          name={field.key}
                          value={certificateRequestValues[field.key] || ""}
                          onChange={handleCertificateRequestFieldChange}
                        />
                      ) : (
                        <input
                          type={field.type || "text"}
                          name={field.key}
                          value={certificateRequestValues[field.key] || ""}
                          placeholder={field.placeholder || ""}
                          onChange={handleCertificateRequestFieldChange}
                          aria-invalid={
                            (isPhoneFieldKey(field.key) &&
                              String(certificateRequestValues[field.key] || "").length > 0 &&
                              !PHONE_NUMBER_REGEX.test(String(certificateRequestValues[field.key] || "").trim())) ||
                            undefined
                          }
                          aria-readonly={(isReadOnly && field.key === "fullName") || undefined}
                          inputMode={isPhoneFieldKey(field.key) ? "numeric" : undefined}
                          pattern={isPhoneFieldKey(field.key) ? "09\\d{9}" : undefined}
                          minLength={isPhoneFieldKey(field.key) ? 11 : undefined}
                          maxLength={isPhoneFieldKey(field.key) ? 11 : undefined}
                          readOnly={isReadOnly && field.key === "fullName"}
                          disabled={
                            (selectedCertificateType === "marriage" &&
                              useMarriageCertificateAccountDetails &&
                              Boolean(marriageCertificateAccountTargetFieldKey) &&
                              (field.key === marriageCertificateAccountTargetFieldKey ||
                                field.key === marriageCertificateAccountTargetPhoneFieldKey ||
                                field.key === marriageCertificateAccountTargetAgeFieldKey)) ||
                            (isReadOnly && Boolean(useCertificateAccountPhoneNumber[field.key]))
                          }
                          className={[
                            isPhoneFieldKey(field.key) &&
                            String(certificateRequestValues[field.key] || "").length > 0 &&
                            !PHONE_NUMBER_REGEX.test(String(certificateRequestValues[field.key] || "").trim())
                              ? "invalid-phone"
                              : "",
                            isReadOnly && field.key === "fullName" ? "certificate-request-readonly" : "",
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined}
                        />
                      )}
                    </label>
                  ))}
                </div>
                {certificateRequestError ? <p className="admin-calendar-error">{certificateRequestError}</p> : null}
                <PaymentPreview fee={selectedCertificateTypeFee} />
                <div className="admin-appointment-flow-actions">
                  <button type="submit" className="primary">
                    Proceed
                  </button>
                </div>
              </form>
            ) : (
              <section className="admin-appointment-review">
                <p className="admin-appointment-selected-type">
                  Please check your certificate request details before submitting.
                </p>
                <div className="admin-appointment-review-grid">
                  <div className="admin-appointment-review-summary">
                    <span>Certificate Type</span>
                    <strong>{selectedCertificateTypeLabel || CERTIFICATE_TYPE_LABELS[selectedCertificateType] || "Certificate Request"}</strong>
                  </div>
                  <div className="admin-appointment-review-fields">
                    {certificateRequestSchema.map((field) => (
                      <div key={`certificate-review-${field.key}`} className="admin-appointment-review-item">
                        <span className="admin-appointment-review-label">{field.label}</span>
                        <span className="admin-appointment-review-value">
                          {String(certificateRequestValues[field.key] || "").trim() || "Not provided"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {certificateRequestError ? <p className="admin-calendar-error">{certificateRequestError}</p> : null}
                <div className="admin-appointment-flow-actions">
                  <button type="button" className="primary" onClick={handleOpenCertificateSubmitConfirm} disabled={isSubmittingCertificateRequest}>
                    {isSubmittingCertificateRequest
                      ? "Saving..."
                      : isReadOnly
                        ? "Submit Certificate Request"
                        : "Save Onsite Request"}
                  </button>
                </div>
              </section>
            )}
          </section>
        </div>
      ) : null}
      {isCertificateSubmitConfirmOpen ? (
        <div className="admin-calendar-modal-overlay" role="presentation" onClick={() => setIsCertificateSubmitConfirmOpen(false)}>
          <section
            className="admin-calendar-modal admin-delete-confirm-modal is-success"
            role="dialog"
            aria-modal="true"
            aria-label="Submit certificate request confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>Submit Certificate Request</h3>
            </header>
            <div className="admin-delete-confirm-body">
              <span className="admin-delete-confirm-icon is-success" aria-hidden="true">
                <CheckCircle2 size={24} />
              </span>
              <p>
                {isReadOnly
                  ? "Are you sure you want to submit this certificate request?"
                  : "Save this onsite certificate request? It will appear under Approved and can be marked done after release."}
              </p>
            </div>
            <div className="admin-calendar-form-actions">
              <button type="button" onClick={confirmSubmitCertificateRequest} disabled={isSubmittingCertificateRequest}>
                {isSubmittingCertificateRequest ? "Submitting..." : "Submit"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setIsCertificateSubmitConfirmOpen(false)}
                disabled={isSubmittingCertificateRequest}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {!isReadOnly && isCalendarModalOpen ? (
        <div
          className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered"
          role="presentation"
          onClick={() => {
            setIsCalendarModalOpen(false);
            resetCalendarForm();
          }}
        >
          <section
            className={`admin-calendar-modal${
              calendarForm.scheduleType === "parish_event" ||
              calendarForm.scheduleType === "priest_schedule" ||
              calendarForm.scheduleType === "priest_activity"
                ? " admin-calendar-modal--schedule"
                : ""
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={editingEntryId ? "Edit calendar entry" : "Add calendar entry"}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>
                {calendarForm.isSpecialProgram
                  ? editingEntryId
                    ? "Edit Special Sacrament Program"
                    : "Special Sacrament Program"
                  : editingEntryId
                    ? "Edit Calendar Entry"
                    : "Add Calendar Entry"}
              </h3>
              <button
                type="button"
                className="admin-calendar-modal-close"
                aria-label="Close"
                onClick={() => {
                  setIsCalendarModalOpen(false);
                  resetCalendarForm();
                }}
              >
                <X size={18} />
              </button>
            </header>

            <form className="admin-calendar-form" onSubmit={handleCalendarSubmit}>
              <select
                name="scheduleType"
                value={
                  calendarForm.scheduleType === "day_off" && calendarForm.dayOffMode === "half_day"
                    ? "half_day"
                    : calendarForm.scheduleType
                }
                onChange={handleCalendarInputChange}
                required
                disabled={calendarForm.isSpecialProgram}
              >
                <option value="parish_event">Parish Event</option>
                <option value="priest_schedule">Priest Schedule</option>
                <option value="priest_activity">Priest Unavailability</option>
                <option value="day_off">Day Off</option>
                <option value="half_day">Half Day</option>
              </select>
              {calendarForm.scheduleType === "day_off" ? (
                <>
                  {calendarForm.dayOffMode !== "half_day" ? (
                    <select name="dayOffMode" value={calendarForm.dayOffMode} onChange={handleCalendarInputChange} required>
                      <option value="weekday">Repeat every weekday</option>
                      <option value="specific_date">Specific date</option>
                    </select>
                  ) : null}

                  {calendarForm.dayOffMode === "half_day" ? (
                    <div className="admin-half-day-fields">
                      <label className="admin-calendar-field-label">
                        <span>Day</span>
                        <select
                          name="dayOffWeekday"
                          value={calendarForm.dayOffWeekday}
                          onChange={handleCalendarInputChange}
                          required
                        >
                          {weekdayLabels.map((day, index) => (
                            <option key={`half-day-${day}`} value={String(index)}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="admin-half-day-times">
                        <label className="admin-calendar-field-label">
                          <span>Opens at</span>
                          <input
                            name="halfDayStartTime"
                            min="04:00"
                            type="time"
                            value={calendarForm.halfDayStartTime || "08:00"}
                            onChange={handleCalendarInputChange}
                            required
                          />
                        </label>
                        <label className="admin-calendar-field-label">
                          <span>Closes at</span>
                          <input
                            name="halfDayEndTime"
                            min="04:00"
                            type="time"
                            value={calendarForm.halfDayEndTime || "12:00"}
                            onChange={handleCalendarInputChange}
                            required
                          />
                        </label>
                      </div>
                      <p className="admin-half-day-hint">Appointments can only be booked within these hours on this day.</p>
                    </div>
                  ) : calendarForm.dayOffMode === "weekday" ? (
                    <select
                      name="dayOffWeekday"
                      value={calendarForm.dayOffWeekday}
                      onChange={handleCalendarInputChange}
                      required
                    >
                      {weekdayLabels.map((day, index) => (
                        <option key={`weekday-${day}`} value={String(index)}>
                          {day}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name="dayOffSpecificDate"
                      type="date"
                      value={calendarForm.dayOffSpecificDate}
                      onChange={handleCalendarInputChange}
                      required
                    />
                  )}
                </>
              ) : (
                <>
                  {isPriestActivityForm ? (
                    <label className="admin-calendar-field-label">
                      <span>Reason</span>
                      <select
                        value={priestBlockReasonChoice}
                        onChange={(event) => {
                          const choice = event.target.value;
                          setPriestBlockReasonChoice(choice);
                          setCalendarForm((current) => ({
                            ...current,
                            title: choice === PRIEST_BLOCK_OTHER_REASON ? "" : choice,
                          }));
                        }}
                        required
                      >
                        <option value="" disabled>
                          Select a reason
                        </option>
                        {PRIEST_BLOCK_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                        <option value={PRIEST_BLOCK_OTHER_REASON}>Other (type the reason)</option>
                      </select>
                      {priestBlockReasonChoice === PRIEST_BLOCK_OTHER_REASON ? (
                        <input
                          name="title"
                          type="text"
                          placeholder="Type the reason (e.g. Retreat, Family emergency)"
                          value={calendarForm.title}
                          onChange={handleCalendarInputChange}
                          maxLength={120}
                          autoFocus
                          required
                        />
                      ) : null}
                    </label>
                  ) : !calendarForm.isSpecialProgram ? (
                    <input
                      name="title"
                      type="text"
                      placeholder="Schedule title"
                      value={calendarForm.title}
                      onChange={handleCalendarInputChange}
                      required
                    />
                  ) : null}
                  {calendarForm.isSpecialProgram ? (
                    <>
                      <label className="admin-calendar-field-label">
                        <span>Name of Special Program</span>
                        <input
                          name="title"
                          type="text"
                          placeholder="Enter special program name"
                          value={calendarForm.title}
                          onChange={handleCalendarInputChange}
                          required
                        />
                      </label>
                      <label className="admin-calendar-field-label">
                        <span>Total Entries</span>
                        <div className="admin-calendar-form-row admin-calendar-form-row--special-slots">
                          <select name="slotLimitType" value={calendarForm.slotLimitType} onChange={handleCalendarInputChange}>
                            <option value="maximum">Maximum Slots</option>
                            <option value="unlimited">Unlimited Slots</option>
                          </select>
                          {calendarForm.slotLimitType === "maximum" ? (
                            <input
                              name="maxSlots"
                              type="number"
                              min="1"
                              placeholder="Maximum entries"
                              value={calendarForm.maxSlots}
                              onChange={handleCalendarInputChange}
                              required
                            />
                          ) : null}
                        </div>
                      </label>
                      <label className="admin-calendar-field-label">
                        <span>Deadline for Submission</span>
                        <input
                          name="deadline"
                          type="date"
                          value={calendarForm.deadline || ""}
                          onChange={handleCalendarInputChange}
                          required
                        />
                      </label>
                    </>
                  ) : null}
                  {calendarForm.scheduleType === "priest_schedule" ||
                  calendarForm.scheduleType === "parish_event" ||
                  isPriestActivityForm ? (
                    <div className="admin-calendar-scheduling">
                      <label className="admin-calendar-field-label">
                        <span>Select Priest</span>
                        <select
                          name="priestID"
                          value={calendarForm.priestID}
                          onChange={handleCalendarInputChange}
                          required
                        >
                          <option value="">Select priest</option>
                          {priests
                            .filter((priest) => priest.isActive !== false || Number(priest.priestID) === Number(calendarForm.priestID))
                            .map((priest) => (
                              <option key={`priest-${priest.priestID}`} value={String(priest.priestID)}>
                                {priest.fullName}
                                {priest.isActive === false ? " (Disabled)" : ""}
                              </option>
                            ))}
                        </select>
                      </label>
                      <p className="admin-calendar-scheduling-copy">
                        {blockingNoteDates.length > 1
                          ? `This request covers ${formatLongDate(blockingNoteDates[0])} through ${formatLongDate(blockingNoteDates[blockingNoteDates.length - 1])}. Click a highlighted day to leave it out when that day already has a schedule. Saving applies the hours to the days that stay selected.`
                          : isPriestActivityForm
                          ? Number.isInteger(selectedCalendarPriestID) && selectedCalendarPriestID > 0
                            ? `Pick the date to block on ${selectedCalendarPriestName}'s schedule, then pick one or more 1-hour slots (4:00 AM to 5:00 PM). No appointments can be booked with this priest during those hours.`
                            : "Select the priest whose schedule you want to block. No appointments can be booked with this priest during the hours you pick."
                          : Number.isInteger(selectedCalendarPriestID) && selectedCalendarPriestID > 0
                          ? calendarForm.isSpecialProgram
                            ? `Choose a date from ${selectedCalendarPriestName}'s calendar, then pick one or more 1-hour slots for this special sacrament. You can pick hours like 9:00 AM - 10:00 AM and 1:00 PM - 2:00 PM as long as they are free for this priest.`
                            : calendarForm.scheduleType === "priest_schedule"
                            ? `Choose a date from ${selectedCalendarPriestName}'s calendar, then pick one available 1-hour slot (4:00 AM to 5:00 PM). Priest schedules are held outside the parish, so a location is required.`
                            : `Choose a date from ${selectedCalendarPriestName}'s calendar, then pick one available 1-hour slot (4:00 AM to 5:00 PM). Parish events are held at the current parish.`
                          : "Select a priest first. Then choose a date on that priest's calendar and pick one available 1-hour slot (4:00 AM to 5:00 PM)."}
                      </p>
                      <div className="progress-schedule-split-layout">
                        <div className="progress-schedule-split-panel">
                          <h4>Priest Calendar</h4>
                          <p className="progress-schedule-split-priest">
                            {Number.isInteger(selectedCalendarPriestID) && selectedCalendarPriestID > 0
                              ? selectedCalendarPriestName
                              : "Select a priest to load the calendar"}
                          </p>
                          {Number.isInteger(selectedCalendarPriestID) && selectedCalendarPriestID > 0 ? (
                            <>
                              <div className="progress-priest-calendar-month">
                                <button
                                  type="button"
                                  className="progress-calendar-month-nav"
                                  onClick={() =>
                                    setPriestCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                                  }
                                >
                                  <ChevronLeft size={14} aria-hidden="true" />
                                </button>
                                <strong>{priestCalendarMonthLabel}</strong>
                                <button
                                  type="button"
                                  className="progress-calendar-month-nav"
                                  onClick={() =>
                                    setPriestCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                                  }
                                >
                                  <ChevronRight size={14} aria-hidden="true" />
                                </button>
                              </div>
                              <div className="progress-priest-calendar-grid">
                                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                                  <span key={`calendar-head-${dayName}`} className="progress-priest-calendar-day-name">
                                    {dayName}
                                  </span>
                                ))}
                                {Array.from({ length: priestCalendarFirstDayIndex }).map((_, index) => (
                                  <span key={`calendar-empty-${index}`} className="progress-priest-calendar-date-cell is-empty" />
                                ))}
                                {Array.from({ length: priestCalendarDaysInMonth }).map((_, index) => {
                                  const dayNumber = index + 1;
                                  const dateKey = `${priestCalendarMonth.getFullYear()}-${String(priestCalendarMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
                                  const entryCount = (priestCalendarEntriesByDate[dateKey] || []).length;
                                  const dateDayOfWeek = new Date(
                                    priestCalendarMonth.getFullYear(),
                                    priestCalendarMonth.getMonth(),
                                    dayNumber,
                                  ).getDay();
                                  const isDayOff =
                                    dayOffSpecificDates.includes(dateKey) ||
                                    (Number.isInteger(dayOffWeekday) && dayOffWeekday === dateDayOfWeek);
                                  const isLockedDate =
                                    isScheduleDateLocked(dateKey, getManilaDateKey()) &&
                                    dateKey !== editingOriginalEventDate;
                                  const isHalfDay =
                                    !isDayOff && !isLockedDate && Boolean(halfDaySetting) && halfDaySetting.weekday === dateDayOfWeek;
                                  return (
                                    <button
                                      key={`calendar-date-${dateKey}`}
                                      type="button"
                                      className={`progress-priest-calendar-date-cell ${
                                        isLockedDate ? "is-locked" : isDayOff ? "is-day-off" : entryCount > 0 ? "is-busy" : "is-free"
                                      }${isHalfDay ? " is-half-day" : ""} ${!isLockedDate && (blockingNoteDates.length > 1 ? blockingNoteDates.includes(dateKey) && !excludedPackageDates.includes(dateKey) : calendarForm.eventDate === dateKey) ? "is-selected" : ""} ${
                                        blockingNoteDates.length > 1 && excludedPackageDates.includes(dateKey) ? "is-package-skipped" : ""
                                      } ${
                                        !isLockedDate && priestCalendarTodayKey === dateKey ? "is-today" : ""
                                      }`}
                                      onClick={() => {
                                        if (blockingNoteDates.length > 1) {
                                          if (!blockingNoteDates.includes(dateKey) || isLockedDate) return;
                                          setExcludedPackageDates((current) =>
                                            current.includes(dateKey) ? current.filter((item) => item !== dateKey) : [...current, dateKey],
                                          );
                                          setCalendarError("");
                                          return;
                                        }
                                        if (isDayOff || isLockedDate) return;
                                        setCalendarForm((current) => ({
                                          ...current,
                                          eventDate: dateKey,
                                          startTime: "",
                                          endTime: "",
                                          occupiedSlots: current.isSpecialProgram ? [] : current.occupiedSlots,
                                          durationHours: current.isSpecialProgram ? 1 : current.durationHours,
                                        }));
                                        setRemoteDayAvailability(null);
                                        setCalendarError("");
                                      }}
                                      disabled={isDayOff || isLockedDate}
                                    >
                                      <span>{dayNumber}</span>
                                      {isLockedDate ? (
                                        <small>Locked</small>
                                      ) : isDayOff ? (
                                        <small>Off</small>
                                      ) : isHalfDay ? (
                                        <small>Half</small>
                                      ) : entryCount > 0 ? (
                                        <small>{entryCount}</small>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="progress-priest-calendar-modal-legend">
                                <span><i className="is-free" /> Free day</span>
                                <span><i className="is-busy" /> With schedule</span>
                                <span><i className="is-day-off" /> Day off</span>
                                {halfDaySetting ? <span><i className="is-half-day" /> Half day</span> : null}
                                <span><i className="is-locked" /> Locked</span>
                              </div>
                            </>
                          ) : (
                            <p className="progress-schedule-slot-empty">Select a priest above to view available dates.</p>
                          )}
                        </div>
                        <div className="progress-schedule-split-panel">
                          <h4>{isPriestActivityForm ? "Time Slots to Block" : "Available Time Slots"}</h4>
                          <p className="progress-picked-date-label">
                            {blockingNoteDates.length > 1 ? "Applies to" : "Selected date"}:{" "}
                            <strong>
                              {blockingNoteDates.length > 1
                                ? `${formatLongDate(blockingNoteDates[0])} – ${formatLongDate(blockingNoteDates[blockingNoteDates.length - 1])} (${blockingNoteDates.length - excludedPackageDates.length} days kept)`
                                : calendarForm.eventDate
                                  ? formatLongDate(calendarForm.eventDate)
                                  : "Not set"}
                            </strong>
                          </p>
                          {calendarForm.isSpecialProgram ? (
                            <div className="special-program-duration">
                              <span>Event hours</span>
                              <p className="special-program-duration-hint">
                                Pick one or more 1-hour slots, even non-consecutive hours like 9:00 AM - 10:00 AM and 1:00 PM - 2:00 PM.
                                Only hours that are already booked for this priest are blocked.
                              </p>
                              {(calendarForm.occupiedSlots || []).length > 0 ? (
                                <p className="special-program-selected-hours">
                                  {(calendarForm.occupiedSlots || []).length} hour{(calendarForm.occupiedSlots || []).length === 1 ? "" : "s"} selected:{" "}
                                  {formatOccupiedSlotsLabel(calendarForm.occupiedSlots, calendarForm.startTime, calendarForm.endTime)}
                                </p>
                              ) : (
                                <p className="special-program-selected-hours">No hours selected yet.</p>
                              )}
                            </div>
                          ) : isPriestActivityForm && selectedCalendarPriestID > 0 && calendarForm.eventDate ? (
                            <div className="special-program-duration">
                              <span>Hours to block</span>
                              <p className="special-program-duration-hint">
                                {blockingNoteDates.length > 1
                                  ? `These hours are applied to every day in this request. Closed days and half days are left out.`
                                  : `Pick every hour to block on ${selectedCalendarPriestName}'s schedule. You can pick as many as needed, even non-consecutive hours like 9:00 AM - 10:00 AM and 11:00 AM - 12:00 PM. Click a selected hour again to remove it.`}
                              </p>
                              {selectedCalendarSlots.length > 0 ? (
                                <p className="special-program-selected-hours">
                                  {selectedCalendarSlots.length} hour{selectedCalendarSlots.length === 1 ? "" : "s"} blocked:{" "}
                                  {formatOccupiedSlotsLabel(selectedCalendarSlots, calendarForm.startTime, calendarForm.endTime)}
                                </p>
                              ) : (
                                <p className="special-program-selected-hours">No hours selected yet.</p>
                              )}
                            </div>
                          ) : null}
                          {remoteDayAvailability?.date === calendarForm.eventDate && remoteDayAvailability?.isHalfDay ? (
                            <p className="progress-half-day-notice">{remoteDayAvailability.halfDayMessage}</p>
                          ) : null}
                          {!Number.isInteger(selectedCalendarPriestID) || selectedCalendarPriestID <= 0 ? (
                            <p className="progress-schedule-slot-empty">
                              Select a priest first, then click a date to load available time slots.
                            </p>
                          ) : !calendarForm.eventDate ? (
                            <p className="progress-schedule-slot-empty">
                              Click a date on the priest calendar to load available time slots.
                            </p>
                          ) : isLoadingScheduleSlots ? (
                            <p className="progress-schedule-slot-empty">Checking this priest&apos;s availability...</p>
                          ) : isCalendarDayOff ? (
                            <p className="progress-schedule-slot-empty">This date is marked as day off.</p>
                          ) : isCalendarDayLocked ? (
                            <p className="progress-schedule-slot-empty">
                              {remoteDayAvailability?.lockedMessage || "This date is locked. Choose a later date."}
                            </p>
                          ) : (
                            <>
                              <div
                                className="progress-schedule-slot-grid"
                                role="listbox"
                                aria-multiselectable={isMultiSlotCalendarForm}
                                aria-label={isPriestActivityForm ? "Time slots to block" : "Available time slots"}
                              >
                                {calendarSlotOptions.map((slot) => {
                                  const isSelected = isMultiSlotCalendarForm
                                    ? (calendarForm.occupiedSlots || []).some(
                                        (item) =>
                                          getParishHourSlotKey(item.startTime, item.endTime) ===
                                          getParishHourSlotKey(slot.startTime, slot.endTime),
                                      )
                                    : slot.available &&
                                      calendarForm.startTime === slot.startTime &&
                                      calendarForm.endTime === slot.endTime;
                                  return (
                                    <button
                                      key={`${slot.startTime}-${slot.endTime}`}
                                      type="button"
                                      role="option"
                                      aria-selected={isSelected}
                                      disabled={!slot.available && !isSelected}
                                      title={slot.available || isSelected ? slot.label : slot.conflictTitle || "Unavailable"}
                                      className={`progress-schedule-slot-button${isSelected ? " is-selected" : ""}${
                                        slot.available || isSelected ? "" : " is-unavailable"
                                      }`}
                                      onClick={() => {
                                        if (!slot.available && !isSelected) return;
                                        setCalendarForm((current) => {
                                          if (!current.isSpecialProgram && current.scheduleType !== "priest_activity") {
                                            return {
                                              ...current,
                                              startTime: slot.startTime,
                                              endTime: slot.endTime,
                                            };
                                          }
                                          return {
                                            ...current,
                                            ...occupiedSlotsToFormTimes(toggleOccupiedHourSlot(current.occupiedSlots, slot)),
                                          };
                                        });
                                        setCalendarError("");
                                      }}
                                    >
                                      <span>{slot.label}</span>
                                      {!slot.available && !isSelected && slot.conflictTitle ? <small>{slot.conflictTitle}</small> : null}
                                    </button>
                                  );
                                })}
                              </div>
                              {blockingNoteDates.length <= 1 && calendarSlotOptions.filter((slot) => slot.available).length === 0 ? (
                                <p className="progress-schedule-slot-empty">
                                  No available 1-hour slots for this priest on the selected date.
                                </p>
                              ) : null}
                            </>
                          )}
                          {calendarForm.eventDate ? (
                            <div className="progress-priest-day-schedules">
                              <h4>Existing priest schedules on {formatLongDate(calendarForm.eventDate)}</h4>
                              {calendarDayExistingEntries.length > 0 ? (
                                <ul>
                                  {calendarDayExistingEntries.map((entry) => (
                                    <li key={`selected-day-schedule-${entry.id}`}>
                                      <strong>{getCalendarEntryDisplayTitle(entry)}</strong>
                                      <span>
                                        {formatOccupiedSlotsLabel(entry.occupiedSlots, entry.startTime, entry.endTime)}
                                        {getCalendarEntryLocationLabel(entry, { emptyLabel: "" })
                                          ? ` · ${getCalendarEntryLocationLabel(entry, { emptyLabel: "" })}`
                                          : ""}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p>No other priest schedule entries for this day.</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {isPriestActivityForm ? (
                    <label className="admin-calendar-field-label">
                      <span>Location (optional)</span>
                      <input
                        name="location"
                        type="text"
                        placeholder="Where the priest will be (if applicable)"
                        value={calendarForm.location}
                        onChange={handleCalendarInputChange}
                      />
                    </label>
                  ) : null}
                  {calendarForm.scheduleType === "priest_schedule" && !calendarForm.isSpecialProgram ? (
                    <label className="admin-calendar-field-label">
                      <span>Location (outside the parish)</span>
                      <input
                        name="location"
                        type="text"
                        placeholder="Enter where this priest schedule will be held"
                        value={calendarForm.location}
                        onChange={handleCalendarInputChange}
                        required
                      />
                    </label>
                  ) : null}
                  {!calendarForm.isSpecialProgram ? (
                    <textarea
                      name="notes"
                      rows={3}
                      placeholder="Notes"
                      value={calendarForm.notes}
                      onChange={handleCalendarInputChange}
                    />
                  ) : null}
                </>
              )}
              <div className="admin-calendar-form-actions">
                <button type="submit" disabled={isSavingCalendarEntry}>
                  {isSavingCalendarEntry
                    ? "Saving..."
                    : calendarForm.scheduleType === "day_off"
                      ? calendarForm.dayOffMode === "half_day"
                        ? "Save Half Day"
                        : "Save Day Off"
                      : editingEntryId
                        ? "Update Entry"
                        : "Add Entry"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setIsCalendarModalOpen(false);
                    resetCalendarForm();
                  }}
                >
                  Cancel
                </button>
                {calendarForm.scheduleType === "day_off" && editingDayOffTarget ? (
                  <button
                    type="button"
                    className="danger"
                    disabled={isSavingCalendarEntry}
                    onClick={handleDeleteDayOffTarget}
                  >
                    {editingDayOffTarget.type === "specific_date"
                      ? "Remove Day Off Date"
                      : editingDayOffTarget.type === "half_day"
                        ? "Remove Half Day"
                        : "Remove Weekly Day Off"}
                  </button>
                ) : null}
                {editingEntryId ? (
                  <button
                    type="button"
                    className="danger"
                    disabled={isSavingCalendarEntry}
                    onClick={handleDeleteCalendarEntry}
                  >
                    Remove Entry
                  </button>
                ) : null}
              </div>
            </form>
            {calendarError ? <p className="admin-calendar-error">{calendarError}</p> : null}
          </section>
        </div>
      ) : null}
      {isDayOffDeleteConfirmOpen ? (
        <div className="admin-calendar-modal-overlay" role="presentation" onClick={() => setIsDayOffDeleteConfirmOpen(false)}>
          <section
            className="admin-calendar-modal admin-delete-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete day off confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>Delete Day Off</h3>
            </header>
            <div className="admin-delete-confirm-body">
              <span className="admin-delete-confirm-icon" aria-hidden="true">
                !
              </span>
              <p>Are you sure you want to delete this {dayOffDeleteTargetLabel}?</p>
              <p>This action cannot be undone.</p>
            </div>
            <div className="admin-calendar-form-actions">
              <button type="button" className="danger" disabled={isSavingCalendarEntry} onClick={confirmDeleteDayOffTarget}>
                {isSavingCalendarEntry ? "Deleting..." : "Yes, Delete"}
              </button>
              <button type="button" className="secondary" disabled={isSavingCalendarEntry} onClick={() => setIsDayOffDeleteConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isEntryDeleteConfirmOpen ? (
        <div className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered" role="presentation" onClick={() => setIsEntryDeleteConfirmOpen(false)}>
          <section
            className="admin-calendar-modal admin-delete-confirm-modal is-calendar-only"
            role="dialog"
            aria-modal="true"
            aria-label="Remove from calendar"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-remove-header">
              <span className="admin-calendar-remove-mark" aria-hidden="true">
                <Trash2 size={18} />
              </span>
              <div>
                <p>Calendar only</p>
                <h3>Remove from calendar</h3>
              </div>
            </header>
            <div className="admin-calendar-remove-body">
              <p className="admin-calendar-remove-name">{entryDeleteTargetLabel}</p>
              <p className="admin-calendar-remove-copy">
                This leaves History and Report Generation, including printed records. Only the calendar row is removed.
              </p>
            </div>
            <div className="admin-calendar-remove-actions">
              <button type="button" className="secondary" disabled={isSavingCalendarEntry} onClick={() => setIsEntryDeleteConfirmOpen(false)}>
                Keep it
              </button>
              <button type="button" className="danger" disabled={isSavingCalendarEntry} onClick={confirmDeleteCalendarEntry}>
                {isSavingCalendarEntry ? "Removing..." : "Remove"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isPrintMonthConfirmOpen ? (
        <div className="admin-calendar-modal-overlay" role="presentation" onClick={() => setIsPrintMonthConfirmOpen(false)}>
          <section
            className="admin-calendar-modal admin-delete-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Print month confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>Print Month</h3>
            </header>
            <div className="admin-delete-confirm-body">
              <span className="admin-delete-confirm-icon" aria-hidden="true">
                !
              </span>
              <p>Are you sure you want to print the calendar for {monthLabel}?</p>
              <p>This will download a PDF file.</p>
              <div className="admin-print-month-filter">
                <label htmlFor="admin-print-month-priest-filter">Priest filter</label>
                <select
                  id="admin-print-month-priest-filter"
                  value={printMonthPriestID}
                  onChange={(event) => setPrintMonthPriestID(event.target.value)}
                  disabled={isPrintingCalendarMonth}
                >
                  <option value="">All schedules</option>
                  {priests.map((priest) => (
                    <option key={`print-filter-priest-${priest.priestID}`} value={String(priest.priestID)}>
                      {priest.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="admin-calendar-form-actions">
              <button type="button" onClick={confirmPrintCalendarMonth} disabled={isPrintingCalendarMonth}>
                {isPrintingCalendarMonth ? "Printing..." : "Confirm"}
              </button>
              <button type="button" className="secondary" onClick={() => setIsPrintMonthConfirmOpen(false)} disabled={isPrintingCalendarMonth}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminDashboard;
