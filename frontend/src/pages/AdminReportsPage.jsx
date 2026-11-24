import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  FileSpreadsheet,
  FileText,
  Filter,
  Inbox,
  Printer,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import PageGuide from "../components/PageGuide";
import ViewModeToggle, { useViewMode } from "../components/ViewModeToggle";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { SETTINGS_UPDATED_EVENT, parseStoredSettings } from "../utils/appSettings";
import {
  MONTH_OPTIONS,
  REPORT_PERIOD_MODES,
  REPORT_STATUS_ORDER,
  buildExcelReportFile,
  buildReportPeriod,
  buildReportSummary,
  buildShortTypeLabels,
  downloadTextFile,
  splitReportTypeLabel,
} from "../utils/reportExport";
import { formatListForDisplay, isListCredentialValue } from "../utils/listField";
import { getManilaDateKey } from "../utils/parishSchedule";
import { getTrustedNow } from "../utils/parishClock";
import { describeCredentialFiles, isRedundantFileUrlKey } from "../utils/credentialFiles";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";
import "./PriestAppointmentsPages.css";
import "./UserHistoryPage.css";
import "./AdminReportsPage.css";

const SORT_OPTIONS = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
];

const APPOINTMENT_STATUS_FILTERS = [
  { id: "all", label: "All statuses" },
  { id: "ongoing", label: "Ongoing" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "declined", label: "Declined" },
];

const PAYMENT_STATUS_FILTERS = [
  { id: "all", label: "Payment" },
  { id: "paid", label: "Paid" },
  { id: "unpaid", label: "Unpaid" },
  { id: "free", label: "Free" },
];

const RECORDS_PER_PAGE = 10;

const DEFAULT_APPOINTMENT_TYPES = ["Baptism", "Marriage", "Funeral Mass", "Blessing"];
const DEFAULT_SPECIAL_PROGRAM_TYPES = ["Kasalan Ng Bayan", "Binyagan Ng Bayan"];
const DEFAULT_CERTIFICATE_TYPES = ["Marriage Certificate", "Baptismal Certificate", "Confirmation Certificate"];

const formatCertificateTypeOption = (value) => {
  const label = String(value || "").trim();
  if (!label) return "";
  return /certificate/i.test(label) ? label : `${label} Certificate`;
};

const getReportStatusKey = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "declined") return "declined";
  if (normalized === "completed") return "completed";
  return "ongoing";
};

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateTime = (dateValue) => {
  if (!dateValue) return "Not available";
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "Not available";
  return parsedDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const toLabel = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const parseCredentialJson = (value) => {
  if (typeof value !== "string") return value;
  const trimmedValue = value.trim();
  if (!(trimmedValue.startsWith("{") || trimmedValue.startsWith("["))) return value;
  try {
    return JSON.parse(trimmedValue);
  } catch {
    return value;
  }
};

const formatPrintScheduleWords = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
};

const formatPrintCredentialValue = (credentials, key) => {
  const source = credentials && typeof credentials === "object" ? credentials : {};
  const raw = parseCredentialJson(source[key]);
  if (key === "scheduledEventDateTime" || /DateTime$/i.test(key)) {
    return formatPrintScheduleWords(raw) || "—";
  }
  if (key === "paymentRecords" && Array.isArray(raw)) {
    const latest = raw.filter((entry) => entry && typeof entry === "object" && !entry.isArchived).at(-1);
    return String(latest?.invoiceNumber || latest?.invoiceNo || "").trim() || "—";
  }
  if (isRedundantFileUrlKey(key, source)) return "—";
  const files = describeCredentialFiles(raw, source, key);
  if (files.length > 0) return "Submitted";
  if (Array.isArray(raw)) {
    const text = raw
      .map((item) => {
        if (item && typeof item === "object") {
          const name = String(item.name || item.fullName || "").trim();
          const phone = String(item.phone || item.contactNumber || "").trim();
          return [name, phone].filter(Boolean).join(" · ");
        }
        return String(item || "").trim();
      })
      .filter(Boolean)
      .join(", ");
    return text || "—";
  }
  if (raw && typeof raw === "object") {
    return String(raw.name || raw.fullName || "").trim() || "—";
  }
  const text = String(raw ?? "").trim();
  if (!text) return "—";
  if (/\/uploads\//i.test(text) || /\.(png|jpe?g|webp|gif|bmp|svg|avif|pdf|docx?)(\?|#|$)/i.test(text)) return "Submitted";
  return text;
};

const buildCredentialPrintColumns = (rows) => {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const keys = [];
  const seen = new Set();
  sourceRows.forEach((row) => {
    const credentials = row?.credentials && typeof row.credentials === "object" ? row.credentials : {};
    Object.keys(credentials).forEach((key) => {
      if (!key || seen.has(key) || isRedundantFileUrlKey(key, credentials)) return;
      if (key === "invoiceNumber" || key === "receiptNumber" || key === "paymentDate" || key === "removedFromCalendar") return;
      seen.add(key);
      keys.push(key);
    });
  });
  const credentialLabel = (key) => {
    if (key === "paymentRecords") return "Payment records";
    const isFileNameKey = /Name$/i.test(key) && !/(First|Last|Full|Middle)Name$/i.test(key);
    const base = key.replace(/Name$/i, "");
    const hasFileSibling = sourceRows.some((row) => {
      const credentials = row?.credentials && typeof row.credentials === "object" ? row.credentials : {};
      return Boolean(credentials[`${base}Url`] || credentials[`${base}FileUrl`] || credentials[`${base}File`]);
    });
    const labelKey = isFileNameKey && (hasFileSibling || /FileName$/i.test(key)) ? base : key;
    return toLabel(labelKey).replace(/\s+(Url|File Url|File Name)$/i, "");
  };
  return keys.map((key) => ({
    key: `credential:${key}`,
    label: credentialLabel(key),
    value: (row) => formatPrintCredentialValue(row?.credentials, key),
  }));
};

const flattenCredentialDetails = (value, prefix = "") => {
  const parsedValue = parseCredentialJson(value);
  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) return [];
  return Object.entries(parsedValue).flatMap(([key, rawValue]) => {
    if (!prefix && isRedundantFileUrlKey(key, parsedValue)) return [];
    const label = prefix ? `${prefix} - ${toLabel(key)}` : toLabel(key);
    const entryValue = parseCredentialJson(rawValue);
    const files = describeCredentialFiles(entryValue, parsedValue, key);
    if (files.length > 0) {
      return [{ label: label.replace(/\s+(Url|File Url|File Name|Name)$/i, ""), value: files.map((file) => file.name).join(", "), files }];
    }
    if (isListCredentialValue(entryValue)) {
      return [{ label, value: formatListForDisplay(entryValue), wide: true }];
    }
    if (entryValue && typeof entryValue === "object" && !Array.isArray(entryValue)) {
      return flattenCredentialDetails(entryValue, label);
    }
    if (Array.isArray(entryValue)) {
      const text = entryValue
        .map((item) => {
          if (item && typeof item === "object") {
            const name = String(item.name || item.fullName || "").trim();
            const phone = String(item.phone || item.contactNumber || "").trim();
            return [name, phone].filter(Boolean).join(" · ");
          }
          return String(item || "").trim();
        })
        .filter(Boolean);
      return [{ label, value: text.length ? text.map((item, index) => `${index + 1}. ${item}`).join("\n") : "Not provided", wide: true }];
    }
    if (typeof entryValue === "boolean") {
      return [{ label, value: entryValue ? "Yes" : "No" }];
    }
    return [{ label, value: String(entryValue || "").trim() || "Not provided" }];
  });
};

const readCredentialText = (credentials, keys) => {
  const source = credentials && typeof credentials === "object" ? credentials : {};
  for (const key of keys) {
    const value = String(source?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const joinPersonName = (credentials, firstKeys, lastKeys, fullKeys) => {
  const firstName = readCredentialText(credentials, firstKeys);
  const lastName = readCredentialText(credentials, lastKeys);
  const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
  return composed || readCredentialText(credentials, fullKeys);
};

const getSacramentalPersonName = (appointment) => {
  const credentials = appointment?.credentials && typeof appointment.credentials === "object" ? appointment.credentials : {};
  const sacramentName = String(
    appointment?.resolvedSacramentName || appointment?.specialSacramentName || appointment?.sacramentName || "",
  )
    .trim()
    .toLowerCase();
  const requestType = String(appointment?.requestType || "").trim().toLowerCase();
  const isMarriage = sacramentName.includes("marriage") || sacramentName.includes("kasalan");
  const isBaptism = sacramentName.includes("baptism") || sacramentName.includes("christening") || sacramentName.includes("binyagan");
  const isFuneral = sacramentName.includes("funeral") || sacramentName.includes("death");
  const isBlessing = sacramentName.includes("blessing");

  if (isBlessing) return "Blessings";
  if (isMarriage) {
    const groomName = joinPersonName(credentials, ["groomFirstName", "groomGivenName"], ["groomLastName", "groomSurname"], ["groomFullName", "groomName"]);
    const brideName = joinPersonName(credentials, ["brideFirstName", "brideGivenName"], ["brideLastName", "brideSurname"], ["brideFullName", "brideName"]);
    if (groomName && brideName) return `${groomName} & ${brideName}`;
    return groomName || brideName || "—";
  }
  if (isBaptism) {
    return joinPersonName(credentials, ["childFirstName", "childGivenName"], ["childLastName", "childSurname", "childFamilyName"], ["childFullName", "fullName"]) || "—";
  }
  if (isFuneral) {
    return joinPersonName(credentials, ["deceasedFirstName"], ["deceasedLastName"], ["deceasedFullName", "deceasedName"]) || "—";
  }
  if (requestType === "certificate") {
    return joinPersonName(credentials, ["firstName"], ["lastName"], ["fullName", "name"]) || "—";
  }
  return "";
};

const getAppointmentTypeLabel = (appointment) => {
  const sacramentName = String(
    appointment?.resolvedSacramentName || appointment?.specialSacramentName || appointment?.sacramentName || "",
  ).trim();
  const isSpecialProgram = Number(appointment?.s_sacramentID) > 0;
  const requestType = isSpecialProgram ? "Special Program" : String(appointment?.requestType || "").trim();
  if (sacramentName && requestType && !/^(appointment|special program)$/i.test(requestType)) return `${sacramentName} (${requestType})`;
  return sacramentName || requestType || "Appointment";
};

const getAppointmentStatusLabel = (appointment) => {
  const normalizedStatus = String(appointment?.status || "").trim().toUpperCase();
  if (normalizedStatus === "CANCELLED" || normalizedStatus === "CANCELED") return "Cancelled";
  if (normalizedStatus === "DECLINED") return "Declined";
  const paymentStatus = String(appointment?.paymentStatus || "").trim().toLowerCase();
  const specialID = Number(appointment?.s_sacramentID);
  const isPaymentSatisfied =
    paymentStatus === "paid" ||
    paymentStatus === "free" ||
    (Number.isInteger(specialID) && specialID > 0) ||
    (Number.isFinite(Number(appointment?.giftAmount)) && Number(appointment.giftAmount) > 0);
  const hasSchedule = Boolean(appointment?.scheduledEventDateTime);
  if (Boolean(appointment?.eventDone) && isPaymentSatisfied && hasSchedule) return "Completed";
  return "Ongoing";
};

const getPaymentStatus = (appointment) => {
  const specialID = Number(appointment?.s_sacramentID);
  const normalizedStatus = String(appointment?.paymentStatus || "").trim().toLowerCase();
  if (Number.isInteger(specialID) && specialID > 0) return "Free";
  if (normalizedStatus === "free") return "Free";
  if (normalizedStatus === "paid") return "Paid";
  if (normalizedStatus === "unpaid") return "Unpaid";
  const amount = Number(appointment?.giftAmount);
  return Number.isFinite(amount) && amount > 0 ? "Paid" : "Unpaid";
};

const getActiveReportPaymentRecords = (row) => {
  const credentials = row?.credentials && typeof row.credentials === "object" ? row.credentials : {};
  const records = Array.isArray(row?.paymentRecords)
    ? row.paymentRecords
    : Array.isArray(credentials.paymentRecords)
      ? credentials.paymentRecords
      : [];
  return records.filter((record) => record && !record.isArchived && String(record.invoiceNumber || record.invoiceNo || "").trim());
};

const formatReportPaymentDate = (value) => {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const getReportReceiptNumbers = (row) => {
  const credentials = row?.credentials && typeof row.credentials === "object" ? row.credentials : {};
  if (row?.isCertificateRequest) {
    return String(row?.invoiceNumber || row?.receiptNumber || credentials.invoiceNumber || credentials.receiptNumber || "").trim();
  }
  const latest = getActiveReportPaymentRecords(row).at(-1);
  return String(latest?.invoiceNumber || latest?.invoiceNo || "").trim();
};

const getReportPaymentDates = (row) => {
  if (row?.isCertificateRequest) return formatReportPaymentDate(row?.credentials?.paymentDate);
  const latest = getActiveReportPaymentRecords(row).at(-1);
  return formatReportPaymentDate(latest?.paymentDate);
};

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "None recorded";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
};

const toKebabCase = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const stripRequestTypeSuffix = (value) =>
  String(value || "")
    .replace(/\s*\((Certificate Request|Appointment)\)\s*$/i, "")
    .trim();

const resolveParishPhotoSource = (photoValue) => {
  const normalized = String(photoValue || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("data:")) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const adminAssetMatch = normalized.match(/^(?:\/?(?:src\/)?assets\/)?admin-photos\/(.+)$/i);
  if (adminAssetMatch) return `/api/uploads/admin-photos/${adminAssetMatch[1]}`;
  if (normalized.startsWith("/uploads/")) return `/api${normalized}`;
  return normalized;
};

const getParishInitials = (parishName) => {
  const parts = String(parishName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "P";
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
};

function AdminReportsPage() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [viewMode, setViewMode] = useViewMode("admin-reports");
  const [selectedSort, setSelectedSort] = useState("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequestTypeFilter, setSelectedRequestTypeFilter] = useState("all");
  const [selectedSpecificTypeFilter, setSelectedSpecificTypeFilter] = useState("all");
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState("all");
  const [appointments, setAppointments] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [appointmentTypeOptions, setAppointmentTypeOptions] = useState(DEFAULT_APPOINTMENT_TYPES);
  const [specialProgramTypeOptions, setSpecialProgramTypeOptions] = useState(DEFAULT_SPECIAL_PROGRAM_TYPES);
  const [certificateTypeOptions, setCertificateTypeOptions] = useState(DEFAULT_CERTIFICATE_TYPES);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [cancelStep, setCancelStep] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [isCancellingAppointment, setIsCancellingAppointment] = useState(false);
  const [parishBrand, setParishBrand] = useState({
    parishName: "",
    photo: "",
    address: "",
    secretaryName: "",
  });
  const [isParishLogoBroken, setIsParishLogoBroken] = useState(false);
  const today = useMemo(() => getTrustedNow(), []);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState("all");
  const [printRequestType, setPrintRequestType] = useState("all");
  const [printAppointmentStatus, setPrintAppointmentStatus] = useState("all");
  const [printPaymentStatus, setPrintPaymentStatus] = useState("all");
  const [printPriestID, setPrintPriestID] = useState("all");
  const [printPriests, setPrintPriests] = useState([]);
  const [printSort, setPrintSort] = useState("newest");
  const [printPeriodMode, setPrintPeriodMode] = useState("range");
  const [printYear, setPrintYear] = useState(today.getFullYear());
  const [printFromMonth, setPrintFromMonth] = useState(today.getMonth() + 1);
  const [printToMonth, setPrintToMonth] = useState(today.getMonth() + 1);
  const [printDay, setPrintDay] = useState(() => toDateInputValue(today));
  const [printPreview, setPrintPreview] = useState({ isLoading: false, summary: null, error: "" });
  const [printFormat, setPrintFormat] = useState("pdf");
  const [pdfSettings, setPdfSettings] = useState(parseStoredSettings);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printModalError, setPrintModalError] = useState("");
  const [printSnapshot, setPrintSnapshot] = useState(null);
  const [printRequestId, setPrintRequestId] = useState(0);
  const printSnapshotRef = useRef(null);
  const parishNameRef = useRef("");

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
  const accountType = authData?.accountType;
  const adminID = Number(user?.adminID);
  const specificTypeOptions =
    selectedRequestTypeFilter === "special_program"
      ? specialProgramTypeOptions
      : selectedRequestTypeFilter === "appointment"
        ? appointmentTypeOptions
        : selectedRequestTypeFilter === "certificate"
          ? certificateTypeOptions
          : [...new Set([...appointmentTypeOptions, ...specialProgramTypeOptions, ...certificateTypeOptions])].sort(
              (left, right) => left.localeCompare(right),
            );
  const specificTypeLabel =
    selectedRequestTypeFilter === "special_program"
      ? "Special Program"
      : selectedRequestTypeFilter === "appointment"
        ? "Appointment"
        : selectedRequestTypeFilter === "certificate"
          ? "Certificate Request"
          : "";
  const printSpecificTypeOptions =
    printRequestType === "special_program"
      ? specialProgramTypeOptions
      : printRequestType === "appointment"
        ? appointmentTypeOptions
        : printRequestType === "certificate"
          ? certificateTypeOptions
          : [...new Set([...appointmentTypeOptions, ...specialProgramTypeOptions, ...certificateTypeOptions])].sort(
              (left, right) => left.localeCompare(right),
            );
  const parishName = parishBrand.parishName || user?.parishName || "Our Lady of Guadalupe Parish";
  printSnapshotRef.current = printSnapshot;
  parishNameRef.current = parishName;
  const parishAddress = parishBrand.address || user?.address || "";
  const parishSecretaryName = parishBrand.secretaryName || user?.fullName || "";
  const parishPhotoSource = resolveParishPhotoSource(parishBrand.photo || user?.photo);
  const pdfLogoSource = pdfSettings.pdfChurchLogo || parishPhotoSource;
  const shouldShowPdfLogo = pdfSettings.pdfShowLogo !== false && Boolean(pdfLogoSource) && !isParishLogoBroken;
  const pdfHeaderAlign = pdfSettings.pdfHeaderAlign === "center" ? "center" : "left";
  const pdfHeaderRule = pdfSettings.pdfHeaderRule === "double" ? "double" : "single";
  const pdfDensity = pdfSettings.pdfDensity === "compact" ? "compact" : "standard";
  const pdfTableStyle = pdfSettings.pdfTableStyle === "grid" ? "grid" : "open";
  const pdfLogoShape = pdfSettings.pdfLogoShape === "oval" ? "oval" : "square";
  const pdfLogoBorder = pdfSettings.pdfLogoBorder === "none" ? "plain" : "border";
  const pdfTableColumns = [
    { key: "userId", label: "User ID", value: (row) => row.userID || "—" },
    {
      key: "person",
      label: "Requested for",
      value: (row) => row.sacramentalPersonName,
    },
    {
      key: "priest",
      label: "Priest",
      value: (row) => {
        const isCertificate =
          Boolean(row.isCertificateRequest) || String(row.requestType || "").toLowerCase().includes("certificate");
        if (isCertificate) return "—";
        return String(row.priestName || "").trim() || "—";
      },
    },
    {
      key: "type",
      label: "Type",
      value: (row) => String(row.appointmentType || "").replace(/\s*\((Appointment|Special Program)\)\s*$/i, "").trim() || "—",
    },
    {
      key: "status",
      label: "Status",
      value: (row) => row.appointmentStatus,
      pill: true,
    },
    {
      key: "payment",
      label: "Payment",
      value: (row) => row.paymentStatus,
      pill: true,
    },
    {
      key: "receipt",
      label: "Receipt No.",
      value: (row) => getReportReceiptNumbers(row) || "—",
    },
    {
      key: "paymentDate",
      label: "Date of Payment",
      value: (row) => getReportPaymentDates(row) || "—",
    },
  ];
  const visiblePdfColumns = [
    ...pdfTableColumns,
    ...(printType !== "all" ? buildCredentialPrintColumns(printSnapshot?.rows || []) : []),
  ];

  useEffect(() => {
    document.title = "Faithflow - Reports";
  }, []);

  useEffect(() => {
    const syncPdfSettings = () => setPdfSettings(parseStoredSettings());
    window.addEventListener(SETTINGS_UPDATED_EVENT, syncPdfSettings);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, syncPdfSettings);
  }, []);

  useEffect(() => {
    setIsParishLogoBroken(false);
  }, [pdfLogoSource]);

  useEffect(() => {
    if (!printRequestId) return undefined;
    let cancelled = false;
    const run = async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      if (cancelled || !printSnapshotRef.current) return;
      const previousTitle = document.title;
      document.title = " ";
      const logoImage = document.querySelector(".reports-print-brand-logo");
      if (logoImage && typeof logoImage.decode === "function") {
        try {
          await logoImage.decode();
        } catch {
          // Continue printing even if the parish photo cannot decode.
        }
      }
      if (cancelled) return;
      const restoreTitle = () => {
        document.title = previousTitle;
        window.removeEventListener("afterprint", restoreTitle);
        setPrintSnapshot(null);
      };
      window.addEventListener("afterprint", restoreTitle);
      window.print();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [printRequestId]);

  useEffect(() => {
    if (!Number.isInteger(adminID) || adminID <= 0) return undefined;
    let cancelled = false;
    const loadParishBrand = async () => {
      try {
        const response = await fetch(`/admin-api/profile?accountType=admin&accountID=${adminID}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const nextUser = payload?.user || {};
        if (cancelled) return;
        setParishBrand({
          parishName: String(nextUser.parishName || "").trim(),
          photo: String(nextUser.photo || "").trim(),
          address: String(nextUser.address || "").trim(),
          secretaryName: String(nextUser.fullName || "").trim(),
        });
      } catch {
        // Keep the values already available from the signed-in admin account.
      }
    };
    void loadParishBrand();
    return () => {
      cancelled = true;
    };
  }, [adminID]);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [accountType, navigate, user]);

  const periodRange = useMemo(
    () => ({ start: "2000-01-01", end: getManilaDateKey() }),
    [],
  );
  const printYearOptions = useMemo(() => {
    const currentYear = today.getFullYear();
    return Array.from({ length: 8 }, (_, index) => currentYear - index);
  }, [today]);

  useEffect(() => {
    if (!user || accountType !== "admin") return;
    if (!Number.isInteger(adminID) || adminID <= 0) return;

    const loadReportRecords = async () => {
      setIsLoadingAppointments(true);
      setAppointmentsError("");
      try {
        const query = new URLSearchParams({
          adminID: String(adminID),
          start: periodRange.start,
          end: periodRange.end,
          requestType: selectedRequestTypeFilter,
          appointmentType: selectedSpecificTypeFilter,
          appointmentStatus: "all",
          paymentStatus: "all",
          sort: selectedSort,
        });
        const response = await fetch(`/admin-api/reports/records?${query.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to load appointment records.");
        }
        const rows = Array.isArray(payload?.records) ? payload.records : [];
        const nextAppointmentTypes = Array.isArray(payload?.appointmentTypeOptions)
          ? payload.appointmentTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        const nextSpecialProgramTypes = Array.isArray(payload?.specialProgramTypeOptions)
          ? payload.specialProgramTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        const nextCertificateTypes = Array.isArray(payload?.certificateTypeOptions)
          ? payload.certificateTypeOptions.map(formatCertificateTypeOption).filter(Boolean)
          : [];
        setAppointments(rows);
        setAppointmentTypeOptions(nextAppointmentTypes.length > 0 ? nextAppointmentTypes : DEFAULT_APPOINTMENT_TYPES);
        setSpecialProgramTypeOptions(
          nextSpecialProgramTypes.length > 0 ? nextSpecialProgramTypes : DEFAULT_SPECIAL_PROGRAM_TYPES,
        );
        setCertificateTypeOptions(nextCertificateTypes.length > 0 ? nextCertificateTypes : DEFAULT_CERTIFICATE_TYPES);
      } catch (error) {
        setAppointments([]);
        setAppointmentsError(error.message || "Unable to load appointment records.");
      } finally {
        setIsLoadingAppointments(false);
      }
    };

    void loadReportRecords();
  }, [
    accountType,
    adminID,
    periodRange.end,
    periodRange.start,
    selectedRequestTypeFilter,
    selectedSort,
    selectedSpecificTypeFilter,
    user,
  ]);

  const normalizedAppointments = useMemo(
    () =>
      appointments.map((appointment) => ({
        ...appointment,
        userID: Number.isInteger(Number(appointment?.userID)) ? Number(appointment.userID) : null,
        sacramentalPersonName: getSacramentalPersonName(appointment) || appointment?.sacramentalPersonName || "—",
        appointmentType: appointment?.appointmentType || getAppointmentTypeLabel(appointment),
        appointmentStatus: appointment?.appointmentStatus || getAppointmentStatusLabel(appointment),
        paymentStatus: appointment?.paymentStatus || getPaymentStatus(appointment),
      })),
    [appointments],
  );
  const searchedAppointments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return normalizedAppointments;
    return normalizedAppointments.filter((row) => {
      const searchableText = [
        row.sacramentalPersonName,
        row.requesterFullName,
        row.appointmentType,
        row.appointmentStatus,
        row.paymentStatus,
        row.requestType,
        row.sacramentName,
        row.userID,
        row.appointmentID,
        row.certID,
      ]
        .join(" ")
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [normalizedAppointments, searchQuery]);
  const summaryCounts = useMemo(
    () =>
      searchedAppointments.reduce(
        (accumulator, row) => {
          accumulator.total += 1;
          const statusKey = getReportStatusKey(row.appointmentStatus);
          accumulator[statusKey] += 1;
          return accumulator;
        },
        { total: 0, ongoing: 0, completed: 0, cancelled: 0, declined: 0 },
      ),
    [searchedAppointments],
  );
  const tableRows = useMemo(() => {
    const filtered = appointmentStatusFilter === "all"
      ? searchedAppointments
      : searchedAppointments.filter((row) => getReportStatusKey(row.appointmentStatus) === appointmentStatusFilter);
    return [...filtered].sort((left, right) => {
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      const timeCompare = (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
      if (timeCompare !== 0) return selectedSort === "oldest" ? timeCompare : -timeCompare;
      return Number(right.appointmentID || 0) - Number(left.appointmentID || 0);
    });
  }, [appointmentStatusFilter, searchedAppointments, selectedSort]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(tableRows.length / RECORDS_PER_PAGE)),
    [tableRows.length],
  );
  const appointmentNumberByKey = useMemo(() => {
    const groups = new Map();
    normalizedAppointments.forEach((row) => {
      const userKey = row.userID || "none";
      const bucket = groups.get(userKey) || [];
      bucket.push(row);
      groups.set(userKey, bucket);
    });
    const numbers = new Map();
    groups.forEach((rows) => {
      [...rows]
        .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())
        .forEach((row, index) => {
          numbers.set(row.recordKey || `${row.requestType || "record"}-${row.appointmentID}`, index + 1);
        });
    });
    return numbers;
  }, [normalizedAppointments]);
  const pagedTableRows = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return tableRows.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [currentPage, tableRows]);
  const formatRequestDate = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [appointmentStatusFilter, searchQuery, selectedRequestTypeFilter, selectedSort, selectedSpecificTypeFilter]);

  useEffect(() => {
    setCurrentPage((activePage) => Math.min(activePage, totalPages));
  }, [totalPages]);

  const printPeriod = useMemo(
    () =>
      buildReportPeriod({
        mode: printPeriodMode,
        year: printYear,
        fromMonth: printFromMonth,
        toMonth: printToMonth,
        day: printDay,
      }),
    [printDay, printFromMonth, printPeriodMode, printToMonth, printYear],
  );

  const fetchPrintRows = async (signal) => {
    const query = new URLSearchParams({
      adminID: String(adminID),
      start: printPeriod.start,
      end: printPeriod.end,
      requestType: printRequestType,
      appointmentType: printType,
      appointmentStatus: printAppointmentStatus,
      paymentStatus: printPaymentStatus,
      sort: printSort,
    });
    const response = await fetch(`/admin-api/reports/records?${query.toString()}`, { signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || "Unable to prepare this report.");
    }
    const rows = (Array.isArray(payload?.records) ? payload.records : []).map((appointment) => ({
      ...appointment,
      userID: Number.isInteger(Number(appointment?.userID)) ? Number(appointment.userID) : null,
      sacramentalPersonName: getSacramentalPersonName(appointment) || appointment?.sacramentalPersonName || "—",
      appointmentType: appointment?.appointmentType || getAppointmentTypeLabel(appointment),
      appointmentStatus: appointment?.appointmentStatus || getAppointmentStatusLabel(appointment),
      paymentStatus: appointment?.paymentStatus || getPaymentStatus(appointment),
    }));
    if (printPriestID === "all") return rows;
    const selectedPriestID = Number(printPriestID);
    return rows.filter((row) => Number(row.priestID) === selectedPriestID);
  };

  useEffect(() => {
    if (!isPrintModalOpen || !Number.isInteger(adminID) || adminID <= 0) return undefined;
    let cancelled = false;
    const loadPrintPriests = async () => {
      try {
        const response = await fetch(`/admin-api/priests?adminID=${adminID}&includeInactive=true`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        const priests = Array.isArray(payload?.priests) ? payload.priests : Array.isArray(payload) ? payload : [];
        setPrintPriests(
          priests
            .map((priest) => ({
              priestID: Number(priest.priestID),
              fullName: String(priest.fullName || "").trim() || "Unnamed priest",
              isActive: priest.isActive !== false,
            }))
            .filter((priest) => Number.isInteger(priest.priestID) && priest.priestID > 0)
            .sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.fullName.localeCompare(right.fullName)),
        );
      } catch {
        if (!cancelled) setPrintPriests([]);
      }
    };
    void loadPrintPriests();
    return () => {
      cancelled = true;
    };
  }, [adminID, isPrintModalOpen]);

  useEffect(() => {
    if (!isPrintModalOpen || !Number.isInteger(adminID) || adminID <= 0) return undefined;
    const controller = new AbortController();
    setPrintPreview((current) => ({ ...current, isLoading: true, error: "" }));
    const timer = window.setTimeout(async () => {
      try {
        const rows = await fetchPrintRows(controller.signal);
        setPrintPreview({ isLoading: false, summary: buildReportSummary(rows, printPeriod), error: "" });
      } catch (error) {
        if (error?.name === "AbortError") return;
        setPrintPreview({ isLoading: false, summary: null, error: error.message || "Unable to count records." });
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [adminID, isPrintModalOpen, printAppointmentStatus, printPaymentStatus, printPeriod, printPriestID, printRequestType, printSort, printType]);

  const selectedRecordDetailView = useMemo(() => {
    if (!selectedRecord) {
      return { kicker: "Report Record", title: "Record Details", subtitle: "", chips: [], sections: [] };
    }
    const isCertificateRequest =
      Boolean(selectedRecord.isCertificateRequest) ||
      String(selectedRecord.requestType || "").trim().toLowerCase().includes("certificate");
    const requesterName = String(selectedRecord.requesterFullName || "").trim() || "Unknown requester";
    const statusLabel = selectedRecord.appointmentStatus || "Unknown";
    const formRows = flattenCredentialDetails(selectedRecord.credentials);
    const recordId = isCertificateRequest
      ? selectedRecord.certID || selectedRecord.appointmentID
      : selectedRecord.appointmentID;
    const userIdValue = selectedRecord.userID ? String(selectedRecord.userID) : "Not linked";

    if (isCertificateRequest) {
      const invoiceNumber = String(selectedRecord.invoiceNumber || selectedRecord.receiptNumber || "").trim();
      const isCompleted = String(statusLabel).trim().toLowerCase() === "completed";
      const certificateType =
        stripRequestTypeSuffix(selectedRecord.sacramentName || selectedRecord.appointmentType) || "Certificate Request";
      const normalizedStatus = String(statusLabel).trim().toLowerCase();
      const sections = [
        {
          title: "Request",
          rows: [
            { label: "Request ID", value: `#${recordId || "N/A"}` },
            { label: "Requester", value: requesterName },
            { label: "Certificate Type", value: certificateType },
            { label: "User ID", value: userIdValue },
          ],
        },
        {
          title: "Status & Payment",
          rows: [
            { label: "Status", value: statusLabel },
            { label: "Payment Status", value: selectedRecord.paymentStatus || "Unpaid" },
            { label: "Invoice / Receipt Number", value: invoiceNumber || "Not recorded" },
            { label: "Pickup Schedule", value: selectedRecord.pickupSchedule || "Not set" },
          ],
        },
        {
          title: "Timeline",
          rows: [
            { label: "Submitted", value: formatDateTime(selectedRecord.createdAt) },
            {
              label: isCompleted ? "Picked Up" : "Marked Done",
              value: isCompleted ? formatDateTime(selectedRecord.claimedAt || selectedRecord.finishedAt) : "Not yet",
            },
          ],
        },
      ];
      if (normalizedStatus === "cancelled" || normalizedStatus === "declined") {
        sections.push({
          title: "Notes",
          rows: [
            {
              label: "Reason",
              value: String(selectedRecord.cancellationReason || selectedRecord.note || "").trim() || "No reason provided.",
              wide: true,
            },
          ],
        });
      }
      if (formRows.length > 0) sections.push({ title: "Request Form", rows: formRows });
      return {
        kicker: "Report Record",
        title: "Certificate Request Details",
        subtitle: `Record #${recordId || "N/A"} | ${requesterName}`,
        chips: ["Certificate", certificateType, statusLabel],
        sections,
      };
    }

    const serviceLabel =
      stripRequestTypeSuffix(
        selectedRecord.sacramentName || selectedRecord.specialSacramentName || selectedRecord.appointmentType,
      ) || "Appointment";
    const receiptNumbers = getReportReceiptNumbers(selectedRecord);
    const paymentDates = getReportPaymentDates(selectedRecord);
    const sections = [
      {
        title: "Request",
        rows: [
          { label: "Appointment ID", value: `#${recordId || "N/A"}` },
          { label: "Requester", value: requesterName },
          { label: "Requested for", value: selectedRecord.sacramentalPersonName || "—" },
          { label: "Service", value: serviceLabel },
          { label: "User ID", value: userIdValue },
          { label: "Status", value: statusLabel },
        ],
      },
      {
        title: "Payment",
        rows: [
          { label: "Payment Status", value: selectedRecord.paymentStatus || "Unpaid" },
          { label: "Payment Amount", value: formatCurrency(selectedRecord.giftAmount) },
          ...(receiptNumbers ? [{ label: "Invoice / Receipt Number", value: receiptNumbers }] : []),
          ...(paymentDates ? [{ label: "Payment Date", value: paymentDates }] : []),
        ],
      },
      {
        title: "Timeline",
        rows: [
          { label: "Submitted", value: formatDateTime(selectedRecord.createdAt) },
          { label: "Finished", value: formatDateTime(selectedRecord.finishedAt) },
          { label: "Event Schedule", value: formatDateTime(selectedRecord.scheduledEventDateTime) },
        ],
      },
    ];
    if (formRows.length > 0) sections.push({ title: "Request Form", rows: formRows });
    sections.push({
      title: "Notes",
      rows: [
        statusLabel === "Cancelled" || statusLabel === "Declined"
          ? {
              label: statusLabel === "Declined" ? "Decline Reason" : "Cancellation Reason",
              value:
                String(selectedRecord.cancellationReason || selectedRecord.note || "").trim() || "No reason provided.",
              wide: true,
            }
          : {
              label: "Note",
              value: String(selectedRecord.note || "").trim() || "No note provided.",
              wide: true,
            },
      ],
    });
    return {
      kicker: "Report Record",
      title: "Appointment Details",
      subtitle: `Record #${recordId || "N/A"} | ${requesterName}`,
      chips: [String(selectedRecord.requestType || "Appointment").trim() || "Appointment", serviceLabel, statusLabel],
      sections,
    };
  }, [selectedRecord]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const openPrintModal = () => {
    setPrintRequestType(selectedRequestTypeFilter);
    setPrintType(selectedSpecificTypeFilter);
    setPrintAppointmentStatus(appointmentStatusFilter);
    setPrintPaymentStatus("all");
    setPrintSort(selectedSort);
    setPrintModalError("");
    setIsPrintModalOpen(true);
  };

  const closePrintModal = () => {
    if (isPreparingPrint) return;
    setIsPrintModalOpen(false);
    setPrintModalError("");
  };

  const printPeriodLabel = printPeriod.label;
  const printTypeLabel =
    printType !== "all"
      ? printType
      : printRequestType === "appointment"
        ? "Appointments"
        : printRequestType === "special_program"
          ? "Special programs"
          : printRequestType === "certificate"
            ? "Certificate requests"
            : "All types";
  const printStatusLabel =
    printAppointmentStatus === "all"
      ? "All statuses"
      : APPOINTMENT_STATUS_FILTERS.find((option) => option.id === printAppointmentStatus)?.label || "All statuses";
  const printPaymentLabel =
    printPaymentStatus === "all"
      ? "All payments"
      : PAYMENT_STATUS_FILTERS.find((option) => option.id === printPaymentStatus)?.label || "All payments";
  const handleConfirmPrint = async () => {
    if (isPreparingPrint) return;
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setPrintModalError("Unable to detect the admin account for this report.");
      return;
    }
    setIsPreparingPrint(true);
    setPrintModalError("");
    try {
      const rows = await fetchPrintRows();
      const summary = buildReportSummary(rows, printPeriod);
      const generatedAt = new Date().toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      if (printFormat === "excel") {
        const safeParishName = parishName.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "Parish";
        const periodFileLabel = printPeriod.fileLabel;
        const summaryTables = [
          {
            title: "Summary by Sacramental Type",
            headers: ["Sacramental Type", ...REPORT_STATUS_ORDER, "Total", "Share"],
            rows: [
              ...summary.byType.map((item) => [
                item.label,
                ...REPORT_STATUS_ORDER.map((status) => item.statusCounts?.[status] || 0),
                item.count,
                `${item.percent}%`,
              ]),
              [
                "Total",
                ...REPORT_STATUS_ORDER.map(
                  (status) => summary.byStatus.find((item) => item.label === status)?.count || 0,
                ),
                summary.total,
                summary.total > 0 ? "100%" : "0%",
              ],
            ],
          },
          {
            title: "Summary by Appointment Status",
            headers: ["Appointment Status", "Total", "Share"],
            rows: summary.byStatus.map((item) => [item.label, item.count, `${item.percent}%`]),
          },
        ];
        if (summary.byMonth.length > 0) {
          summaryTables.push({
            title: "Monthly Breakdown",
            headers: ["Month", ...buildShortTypeLabels(summary.byType.map((item) => item.label)), "Total"],
            rows: summary.byMonth.map((month) => [
              month.label,
              ...summary.byType.map((item) => month.counts[item.label] || 0),
              month.total,
            ]),
          });
          summaryTables.push({
            title: "Monthly Status",
            headers: ["Month", ...REPORT_STATUS_ORDER, "Total"],
            rows: summary.byMonth.map((month) => [
              month.label,
              ...REPORT_STATUS_ORDER.map((status) => month.statusCounts?.[status] || 0),
              month.total,
            ]),
          });
        }
        const exportColumns = [
          ...pdfTableColumns,
          ...(printType !== "all" ? buildCredentialPrintColumns(rows) : []),
        ];
        const workbook = buildExcelReportFile({
          summaryTables,
          summaryLines: [
            parishName,
            "Sacramental Services & Certificate Requests",
            `Period: ${printPeriodLabel}`,
            `Type: ${printTypeLabel}`,
            `Appointment status: ${printStatusLabel}`,
            `Payment status: ${printPaymentLabel}`,
            `Generated: ${generatedAt}`,
            `Records: ${rows.length}`,
          ],
          headers: exportColumns.map((column) => column.label),
          rows: rows.map((row) =>
            exportColumns.map((column) => {
              const value = column.value(row) || "";
              if (column.key === "payment" && String(value).trim().toLowerCase() === "unpaid") return "—";
              return value;
            }),
          ),
        });
        downloadTextFile(
          `${safeParishName}-Reports-${periodFileLabel}.xls`,
          workbook,
          "application/vnd.ms-excel;charset=utf-8",
        );
        setIsPrintModalOpen(false);
        return;
      }
      setPdfSettings(parseStoredSettings());
      setPrintSnapshot({
        rows,
        summary,
        periodLabel: printPeriodLabel,
      });
      setPrintRequestId((currentId) => currentId + 1);
      setIsPrintModalOpen(false);
    } catch (error) {
      setPrintModalError(error.message || "Unable to prepare this report.");
    } finally {
      setIsPreparingPrint(false);
    }
  };

  const printableRows = printSnapshot?.rows || tableRows;
  const printRecordGroups = useMemo(() => {
    const kindOf = (row) => {
      const requestType = String(row?.requestType || "").toLowerCase();
      if (row?.isCertificateRequest || requestType.includes("certificate")) return 2;
      if (Number(row?.s_sacramentID) > 0 || requestType.includes("special")) return 1;
      return 0;
    };
    const titleFor = (rows) => {
      if (printType !== "all") return `${printType} records`;
      return `${String(rows[0]?.appointmentType || "Records").replace(/\s*\((Appointment|Special Program)\)\s*$/i, "").trim() || "Records"} records`;
    };
    if (printType !== "all") {
      return printableRows.length
        ? [{ key: "selected", title: titleFor(printableRows), rows: printableRows, columns: visiblePdfColumns }]
        : [];
    }
    const groups = new Map();
    printableRows.forEach((row) => {
      const label = String(row?.appointmentType || row?.sacramentName || "Records").replace(/\s*\((Appointment|Special Program)\)\s*$/i, "").trim() || "Records";
      const bucket = groups.get(label) || [];
      bucket.push(row);
      groups.set(label, bucket);
    });
    return [...groups.entries()]
      .sort((left, right) => {
        const kindCompare = kindOf(left[1][0]) - kindOf(right[1][0]);
        if (kindCompare !== 0) return kindCompare;
        return left[0].localeCompare(right[0]);
      })
      .map(([label, rows]) => ({
        key: label,
        title: `${label} records`,
        rows,
        columns: [...pdfTableColumns, ...buildCredentialPrintColumns(rows)],
      }));
  }, [pdfTableColumns, printType, printableRows, visiblePdfColumns]);

  const printRecordSections = useMemo(() => {
    const columnsPerPage = 8;
    return printRecordGroups.flatMap((group) => {
      if (printType !== "all" || group.columns.length <= columnsPerPage) {
        return [{ ...group, showTotal: true }];
      }
      const lead = group.columns.slice(0, 2);
      const rest = group.columns.slice(2);
      const room = columnsPerPage - lead.length;
      const sections = [];
      const partCount = Math.ceil(rest.length / room);
      for (let index = 0; index < rest.length; index += room) {
        const part = Math.floor(index / room) + 1;
        sections.push({
          ...group,
          key: `${group.key}-part-${part}`,
          title: part === 1 ? group.title : `${group.title}, continued`,
          columns: [...lead, ...rest.slice(index, index + room)],
          continued: part > 1,
          showTotal: part === partCount,
        });
      }
      return sections;
    });
  }, [printRecordGroups, printType]);

  const isSelectedCertificate =
    Boolean(selectedRecord?.isCertificateRequest) ||
    String(selectedRecord?.requestType || "").trim().toLowerCase().includes("certificate");
  const canOpenProgress =
    !isSelectedCertificate && String(selectedRecord?.status || "").trim().toUpperCase() === "CONFIRMED";

  const closeCancelAppointmentFlow = () => {
    if (isCancellingAppointment) return;
    setCancelStep(null);
    setCancelReason("");
    setCancelError("");
  };

  const handleConfirmCancelAppointment = async () => {
    const appointmentID = Number(selectedRecord?.appointmentID);
    const resolvedAdminID = Number(adminID);
    const reason = String(cancelReason || "").trim();
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;
    if (!Number.isInteger(resolvedAdminID) || resolvedAdminID <= 0) {
      setCancelError("Unable to detect admin account.");
      return;
    }
    if (reason.length < 3) {
      setCancelError("Please enter a cancellation reason.");
      return;
    }
    setIsCancellingAppointment(true);
    setCancelError("");
    try {
      const response = await fetch(`/admin-api/appointments/${appointmentID}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminID: resolvedAdminID,
          status: "CANCELLED",
          declineReason: reason,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to cancel this appointment.");
      }
      const nextRecord = {
        ...selectedRecord,
        status: "CANCELLED",
        appointmentStatus: "Cancelled",
        note: reason,
        cancellationReason: reason,
        finishedAt: payload?.finishedAt || new Date().toISOString(),
      };
      setAppointments((current) =>
        current.map((row) => (Number(row.appointmentID) === appointmentID ? { ...row, ...nextRecord } : row)),
      );
      setSelectedRecord(nextRecord);
      setCancelStep(null);
      setCancelReason("");
    } catch (error) {
      setCancelError(error.message || "Unable to cancel this appointment.");
    } finally {
      setIsCancellingAppointment(false);
    }
  };

  return (
    <main className="dashboard-layout">
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="admin" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero reports-hero admin-list-hero">
            <div>
              <h2>Reports <PageGuide pageKey="reports" /></h2>
            </div>
            <div className="view-mode-hero-actions">
              <button type="button" className="reports-secondary-button reports-hero-print" onClick={openPrintModal}>
                <Printer size={16} aria-hidden="true" />
                Print
              </button>
            </div>
          </section>

          <section className="dashboard-panel priest-history-panel reports-panel" aria-label="Report filters">
            <div className="priest-page-toolbar priest-history-toolbar" aria-label="Report filters">
              <label className="appointment-filter-field">
                <span>Search</span>
                <input
                  type="search"
                  className="appointment-search-input"
                  placeholder="Search requester, sacrament, type, status, or ID"
                  aria-label="Search report records"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <label className="appointment-filter-field">
                <span>Type</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Filter by report type"
                  value={selectedRequestTypeFilter}
                  onChange={(event) => {
                    setSelectedRequestTypeFilter(event.target.value);
                    setSelectedSpecificTypeFilter("all");
                  }}
                >
                  <option value="all">All</option>
                  <option value="appointment">Appointment</option>
                  <option value="special_program">Special Program</option>
                  <option value="certificate">Certificate Request</option>
                </select>
              </label>
              <label className="appointment-filter-field">
                {specificTypeLabel ? <span>{specificTypeLabel}</span> : null}
                <select
                  className="appointment-filter-select"
                  aria-label={specificTypeLabel ? `Filter by ${specificTypeLabel.toLowerCase()} type` : "Filter by specific type"}
                  value={selectedSpecificTypeFilter}
                  onChange={(event) => setSelectedSpecificTypeFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  {specificTypeOptions.map((type) => (
                    <option key={`report-specific-type-${type}`} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="appointment-filter-field">
                <span>Sort By</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Sort report records"
                  value={selectedSort}
                  onChange={(event) => setSelectedSort(event.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="priest-history-summary reports-status-summary" role="group" aria-label="Filter reports by status">
              <button
                type="button"
                className={appointmentStatusFilter === "all" ? "is-active" : ""}
                onClick={() => setAppointmentStatusFilter("all")}
                aria-pressed={appointmentStatusFilter === "all"}
              >
                <span>All Records</span>
                <strong>{summaryCounts.total}</strong>
              </button>
              <button
                type="button"
                className={`is-ongoing${appointmentStatusFilter === "ongoing" ? " is-active" : ""}`}
                onClick={() => setAppointmentStatusFilter("ongoing")}
                aria-pressed={appointmentStatusFilter === "ongoing"}
              >
                <span>Ongoing</span>
                <strong>{summaryCounts.ongoing}</strong>
              </button>
              <button
                type="button"
                className={`is-completed${appointmentStatusFilter === "completed" ? " is-active" : ""}`}
                onClick={() => setAppointmentStatusFilter("completed")}
                aria-pressed={appointmentStatusFilter === "completed"}
              >
                <span>Completed</span>
                <strong>{summaryCounts.completed}</strong>
              </button>
              <button
                type="button"
                className={`is-cancelled${appointmentStatusFilter === "cancelled" ? " is-active" : ""}`}
                onClick={() => setAppointmentStatusFilter("cancelled")}
                aria-pressed={appointmentStatusFilter === "cancelled"}
              >
                <span>Cancelled</span>
                <strong>{summaryCounts.cancelled}</strong>
              </button>
              <button
                type="button"
                className={`is-declined${appointmentStatusFilter === "declined" ? " is-active" : ""}`}
                onClick={() => setAppointmentStatusFilter("declined")}
                aria-pressed={appointmentStatusFilter === "declined"}
              >
                <span>Declined</span>
                <strong>{summaryCounts.declined}</strong>
              </button>
            </div>

            <div className="view-mode-content-bar">
              {!isLoadingAppointments && !appointmentsError ? (
                <p className="priest-history-result-count">
                  Showing {pagedTableRows.length} of {tableRows.length} record{tableRows.length === 1 ? "" : "s"}
                </p>
              ) : null}
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
          </section>

          <section className="dashboard-panel reports-preview-panel" aria-label="Report records table">
            <article className="reports-print-sheet">
              <section
                className={`reports-print-document is-align-${pdfHeaderAlign} is-rule-${pdfHeaderRule} is-density-${pdfDensity} is-table-${pdfTableStyle} is-logo-${pdfLogoShape} is-logo-${pdfLogoBorder}`}
                aria-hidden="true"
              >
                <table className="reports-print-layout" role="presentation">
                  <thead>
                    <tr>
                      <td>
                        <div className="reports-print-layout-space is-top" />
                      </td>
                    </tr>
                  </thead>
                  <tfoot>
                    <tr>
                      <td>
                        <div className="reports-print-layout-space is-bottom" />
                      </td>
                    </tr>
                  </tfoot>
                  <tbody>
                    <tr>
                      <td className="reports-print-layout-body">
                <header className="reports-print-brand">
                  {pdfSettings.pdfShowLogo !== false ? (
                    <div className="reports-print-brand-mark">
                      {shouldShowPdfLogo ? (
                        <img
                          className="reports-print-brand-logo"
                          src={pdfLogoSource}
                          alt={`${parishName} logo`}
                          onError={() => setIsParishLogoBroken(true)}
                        />
                      ) : (
                        <span className="reports-print-brand-fallback">{getParishInitials(parishName)}</span>
                      )}
                    </div>
                  ) : null}
                  <div className="reports-print-brand-copy">
                    {pdfSettings.pdfReportTitle ? <p className="reports-print-kicker">{pdfSettings.pdfReportTitle}</p> : null}
                    {pdfSettings.pdfShowParishName !== false ? <h3>{parishName}</h3> : null}
                    {pdfSettings.pdfShowAddress !== false && parishAddress ? (
                      <p className="reports-print-address">{parishAddress}</p>
                    ) : null}
                    {printSnapshot?.periodLabel ? <p className="reports-print-subtitle">{printSnapshot.periodLabel}</p> : null}
                  </div>
                </header>
                {printSnapshot?.summary && printSnapshot.summary.total > 0 ? (
                  <section className="reports-print-summary" aria-label="Report summary">
                    <div className="reports-print-block">
                    <h4 className="reports-print-summary-title">Summary</h4>
                    <div className="reports-print-summary-stats">
                      <p className="reports-print-summary-stat is-total">
                        <span>Total records</span>
                        <strong>{printSnapshot.summary.total}</strong>
                      </p>
                      {printSnapshot.summary.byStatus.map((item) => (
                        <p key={item.label} className="reports-print-summary-stat">
                          <span>{item.label}</span>
                          <strong>{item.count}</strong>
                        </p>
                      ))}
                    </div>
                    <table className="reports-print-summary-table">
                      <thead>
                        <tr>
                          <th scope="col">Sacramental type</th>
                          {REPORT_STATUS_ORDER.map((status) => (
                            <th key={status} scope="col" className={`is-status-${status.toLowerCase()}`}>
                              {status}
                            </th>
                          ))}
                          <th scope="col">Total</th>
                          <th scope="col">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printSnapshot.summary.byType.map((item) => (
                          <tr key={item.label}>
                            <td>{item.label}</td>
                            {REPORT_STATUS_ORDER.map((status) => (
                              <td key={status} className={`is-status-${status.toLowerCase()}`}>
                                {item.statusCounts?.[status] || 0}
                              </td>
                            ))}
                            <td className="is-total">{item.count}</td>
                            <td>{item.percent}%</td>
                          </tr>
                        ))}
                        <tr className="is-total-row">
                          <td>Total</td>
                          {REPORT_STATUS_ORDER.map((status) => (
                            <td key={status}>
                              {printSnapshot.summary.byStatus.find((item) => item.label === status)?.count || 0}
                            </td>
                          ))}
                          <td>{printSnapshot.summary.total}</td>
                          <td>100%</td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                    {printSnapshot.summary.byMonth.length > 0 ? (
                      <>
                        <div className="reports-print-block">
                        <h4 className="reports-print-summary-title">Monthly breakdown</h4>
                        <table className="reports-print-summary-table is-monthly">
                          <thead>
                            <tr>
                              <th scope="col">Month</th>
                              {buildShortTypeLabels(printSnapshot.summary.byType.map((item) => item.label)).map(
                                (shortLabel, index) => (
                                  <th key={printSnapshot.summary.byType[index].label} scope="col">
                                    {shortLabel}
                                  </th>
                                ),
                              )}
                              <th scope="col">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {printSnapshot.summary.byMonth.map((month) => (
                              <tr key={month.label}>
                                <td>{month.label}</td>
                                {printSnapshot.summary.byType.map((item) => (
                                  <td key={item.label}>{month.counts[item.label] || 0}</td>
                                ))}
                                <td>{month.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                        <div className="reports-print-block">
                        <h4 className="reports-print-summary-title">Monthly status</h4>
                        <table className="reports-print-summary-table is-monthly is-monthly-status">
                          <thead>
                            <tr>
                              <th scope="col">Month</th>
                              {REPORT_STATUS_ORDER.map((status) => (
                                <th key={status} scope="col" className={`is-status-${status.toLowerCase()}`}>
                                  {status}
                                </th>
                              ))}
                              <th scope="col">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {printSnapshot.summary.byMonth.map((month) => (
                              <tr key={month.label}>
                                <td>{month.label}</td>
                                {REPORT_STATUS_ORDER.map((status) => (
                                  <td key={status} className={`is-status-${status.toLowerCase()}`}>
                                    {month.statusCounts?.[status] || 0}
                                  </td>
                                ))}
                                <td>{month.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </>
                    ) : null}
                  </section>
                ) : null}
                {printableRows.length === 0 ? (
                  <p className="reports-print-empty">No records found for the selected filters.</p>
                ) : (
                  printRecordSections.map((group) => (
                    <section key={group.key} className={`reports-print-type-section${group.continued ? " is-continued" : ""}`}>
                      <h4 className="reports-print-summary-title is-records">{group.title}</h4>
                      <table className="reports-preview-table reports-records-table reports-print-table adhoc-records-table">
                        <thead>
                          <tr>
                            {group.columns.map((column) => (
                              <th key={column.key} scope="col" className={`is-${column.key}`}>
                                <span className="reports-print-cell">{column.label}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr key={`print-${row.recordKey || `${row.requestType || "record"}-${row.appointmentID}`}`}>
                              {group.columns.map((column) => {
                                const cellValue = column.value(row);
                                return (
                                  <td key={column.key} className={`is-${column.key}`}>
                                    <span className="reports-print-cell">
                                      {column.pill ? (
                                        <span className={`reports-status-pill is-${String(cellValue || "").toLowerCase().replace(/\s+/g, "-")}`}>
                                          {cellValue}
                                        </span>
                                      ) : (
                                        cellValue
                                      )}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {group.showTotal !== false ? (
                      <p className="reports-print-total-line">
                        Total: {group.rows.length} {group.rows.length === 1 ? "record" : "records"}
                      </p>
                      ) : null}
                    </section>
                  ))
                )}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {pdfSettings.pdfShowFooter !== false ? (
                  <footer className="reports-print-footer">
                    <span>
                      {pdfSettings.pdfFooterNote || "Prepared through Faithflow"}
                      {parishSecretaryName ? ` • ${parishSecretaryName}` : ""}
                    </span>
                    {pdfSettings.pdfShowParishName !== false ? <span>{parishName}</span> : null}
                  </footer>
                ) : null}
              </section>
              {appointmentsError ? (
                <p className="reports-table-feedback" role="alert">
                  {appointmentsError}
                </p>
              ) : isLoadingAppointments ? (
                <p className="reports-table-feedback">Loading report records...</p>
              ) : tableRows.length === 0 && summaryCounts.total === 0 && !searchQuery.trim() ? (
                <div className="reports-empty-state">
                  <div className="reports-empty-icon" aria-hidden="true">
                    <Inbox size={34} strokeWidth={1.5} />
                  </div>
                  <h3>No records found</h3>
                  <p>Appointment and certificate records will appear here for report generation.</p>
                </div>
              ) : tableRows.length === 0 ? (
                <div className="reports-empty-state">
                  <div className="reports-empty-icon" aria-hidden="true">
                    <Search size={34} strokeWidth={1.5} />
                  </div>
                  <h3>No matching records</h3>
                  <p>Try a different search term or filter.</p>
                </div>
              ) : viewMode === "grid" ? (
                <ul className="reports-grid">
                  {pagedTableRows.map((row) => {
                    const statusClass = String(row.appointmentStatus || "").toLowerCase().replace(/\s+/g, "-");
                    const paymentClass = String(row.paymentStatus || "").toLowerCase().replace(/\s+/g, "-");
                    return (
                      <li
                        key={`grid-${row.recordKey || `${row.requestType || "record"}-${row.appointmentID}`}`}
                        className={`reports-grid-card is-${statusClass}`}
                      >
                        <div className="reports-grid-card-head">
                          <span className="reports-grid-card-icon" aria-hidden="true">
                            {row.isCertificateRequest ||
                            String(row.requestType || "").trim().toLowerCase().includes("certificate") ? (
                              <FileText size={20} />
                            ) : (
                              <CalendarDays size={20} />
                            )}
                          </span>
                          <span className="reports-grid-card-id">User ID {row.userID || "—"}</span>
                        </div>
                        <strong className="reports-grid-card-name">{row.sacramentalPersonName}</strong>
                        <p className="reports-grid-card-type">{row.appointmentType}</p>
                        <div className="reports-grid-card-pills">
                          <span className={`reports-status-pill is-${statusClass}`}>{row.appointmentStatus}</span>
                          <span className={`reports-status-pill is-${paymentClass}`}>{row.paymentStatus}</span>
                        </div>
                        <button
                          type="button"
                          className="reports-view-more-button reports-grid-card-button"
                          onClick={() => setSelectedRecord(row)}
                        >
                          View more
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="reports-table-wrap">
                  <table className="reports-preview-table reports-records-table">
                    <thead>
                      <tr>
                        <th scope="col">User ID</th>
                        <th scope="col">Appointment no.</th>
                        <th scope="col">Request date</th>
                        <th scope="col">Requested for</th>
                        <th scope="col">Priest</th>
                        <th scope="col">Appointment type</th>
                        <th scope="col">Appointment status</th>
                        <th scope="col">Payment status</th>
                        <th scope="col" className="reports-col-actions">
                          View more
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTableRows.map((row) => {
                        const rowKey = row.recordKey || `${row.requestType || "record"}-${row.appointmentID}`;
                        return (
                        <tr key={rowKey}>
                          <td>{row.userID || "—"}</td>
                          <td>{appointmentNumberByKey.get(rowKey) || "—"}</td>
                          <td>{formatRequestDate(row.createdAt)}</td>
                          <td>{row.sacramentalPersonName}</td>
                          <td>
                            {Boolean(row.isCertificateRequest) || String(row.requestType || "").toLowerCase().includes("certificate")
                              ? "—"
                              : String(row.priestName || "").trim() || "—"}
                          </td>
                          <td>{row.appointmentType}</td>
                          <td>
                            <span className={`reports-status-pill is-${String(row.appointmentStatus || "").toLowerCase().replace(/\s+/g, "-")}`}>
                              {row.appointmentStatus}
                            </span>
                          </td>
                          <td>
                            <span className={`reports-status-pill is-${String(row.paymentStatus || "").toLowerCase().replace(/\s+/g, "-")}`}>
                              {row.paymentStatus}
                            </span>
                          </td>
                          <td className="reports-col-actions">
                            <button
                              type="button"
                              className="reports-view-more-button"
                              onClick={() => setSelectedRecord(row)}
                            >
                              View more
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!appointmentsError && !isLoadingAppointments && tableRows.length > 0 ? (
                <div className="history-pagination" aria-label="Report records pagination">
                  <button
                    type="button"
                    className="history-pagination-button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                  >
                    Previous
                  </button>
                  <span className="history-pagination-label">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="history-pagination-button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </article>
          </section>
        </section>
      </div>

      {selectedRecord ? (
        <div className="user-history-modal-overlay" role="presentation" onClick={() => { setSelectedRecord(null); setPreviewFile(null); }}>
          <section
            className="user-history-modal admin-history-detail-modal reports-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Report record details"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="user-history-modal-header">
              <div>
                <span className="admin-history-detail-kicker">{selectedRecordDetailView.kicker}</span>
                <h3>{selectedRecordDetailView.title}</h3>
                <p>{selectedRecordDetailView.subtitle}</p>
              </div>
              <button
                type="button"
                className="user-history-modal-close"
                onClick={() => { setSelectedRecord(null); setPreviewFile(null); }}
                aria-label="Close request details"
              >
                <X size={18} />
              </button>
            </header>
            {selectedRecordDetailView.chips.length > 0 ? (
              <div className="user-history-modal-chips">
                {selectedRecordDetailView.chips.map((chip, index) => (
                  <span
                    key={`${chip}-${index}`}
                    className={`user-history-modal-chip${index === 2 ? ` is-status is-${toKebabCase(chip)}` : ""}`}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="user-history-modal-body">
              {previewFile ? (
                <section className="appointment-file-viewer" aria-label={previewFile.name}>
                  <div className="appointment-file-viewer-bar">
                    <strong>{previewFile.name}</strong>
                    <button type="button" className="appointment-file-link" onClick={() => setPreviewFile(null)}>
                      Back to details
                    </button>
                  </div>
                  {previewFile.kind === "image" ? (
                    <img className="appointment-file-viewer-image" src={previewFile.url} alt={previewFile.name} />
                  ) : (
                    <iframe className="appointment-file-viewer-frame" title={previewFile.name} src={previewFile.url} />
                  )}
                </section>
              ) : (
                selectedRecordDetailView.sections.map((section) => (
                  <section key={section.title} className="user-history-modal-section">
                    <h4>{section.title}</h4>
                    <div className="user-history-modal-grid">
                      {section.rows.map((detail) => (
                        <p
                          key={`${section.title}-${detail.label}`}
                          className={detail.wide ? "is-wide" : undefined}
                        >
                          <span>{detail.label}</span>
                          {Array.isArray(detail.files) && detail.files.length > 0 ? (
                            <strong className="history-file-links">
                              {detail.files.map((file) => (
                                <button
                                  key={`${file.url}-${file.name}`}
                                  type="button"
                                  className="appointment-file-link"
                                  onClick={() => setPreviewFile(file)}
                                >
                                  {file.name}
                                </button>
                              ))}
                            </strong>
                          ) : (
                            <strong>{detail.value}</strong>
                          )}
                        </p>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
            {canOpenProgress ? (
              <div className="reports-detail-modal-footer">
                <button
                  type="button"
                  className="user-history-view-button"
                  onClick={() =>
                    navigate(`/admin/progress-tracker/${selectedRecord.appointmentID}`, {
                      state: { progressItem: selectedRecord },
                    })
                  }
                >
                  Open progress tracker
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
      {cancelStep === "confirm" ? (
        <div className="header-logout-overlay" role="presentation" onClick={closeCancelAppointmentFlow}>
          <section
            className="header-logout-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Cancel appointment confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="header-logout-modal-body">
              <span className="header-logout-modal-icon" aria-hidden="true">
                <CalendarX2 size={24} strokeWidth={2.1} />
              </span>
              <h3>Are you sure you want to cancel the appointment?</h3>
              <p>This record will be marked Cancelled and the requester will be notified.</p>
            </div>
            <div className="header-logout-modal-actions">
              <button type="button" className="secondary" onClick={closeCancelAppointmentFlow}>
                No
              </button>
              <button type="button" className="primary" onClick={() => setCancelStep("reason")}>
                Yes
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {cancelStep === "reason" ? (
        <div className="header-logout-overlay" role="presentation" onClick={closeCancelAppointmentFlow}>
          <section
            className="header-logout-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Cancellation reason"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="header-logout-modal-body">
              <span className="header-logout-modal-icon" aria-hidden="true">
                <CalendarX2 size={24} strokeWidth={2.1} />
              </span>
              <h3>Reason for cancellation</h3>
              <p>Enter the reason the requester will see in their notification.</p>
              <label className="reports-cancel-reason-field">
                <span>Cancellation reason</span>
                <textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Enter the reason for cancelling this appointment"
                />
              </label>
              {cancelError ? <p className="reports-cancel-error">{cancelError}</p> : null}
            </div>
            <div className="header-logout-modal-actions">
              <button type="button" className="secondary" onClick={closeCancelAppointmentFlow} disabled={isCancellingAppointment}>
                Back
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void handleConfirmCancelAppointment()}
                disabled={isCancellingAppointment}
              >
                {isCancellingAppointment ? "Cancelling..." : "Cancel Appointment"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isPrintModalOpen ? (
        <div className="user-history-modal-overlay reports-print-options-overlay" role="presentation" onClick={closePrintModal}>
          <section
            className="user-history-modal reports-print-options-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reports-print-options-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="user-history-modal-header">
              <div>
                <h3 id="reports-print-options-title">Print report</h3>
                <p>Choose the records and the file to create.</p>
              </div>
              <button
                type="button"
                className="user-history-modal-close"
                onClick={closePrintModal}
                aria-label="Close print options"
                disabled={isPreparingPrint}
              >
                <X size={18} />
              </button>
            </header>
            <div className="reports-print-options-body">
              <div className="reports-print-options-filters">
              <section className="reports-print-group" aria-labelledby="reports-print-group-records">
                <h4 id="reports-print-group-records" className="reports-print-group-title">
                  <Filter size={15} aria-hidden="true" />
                  Records
                </h4>
              <div className="reports-print-form">
                <label className="reports-sort-field">
                  <span>Type</span>
                  <select
                    className="reports-sort-select"
                    value={printRequestType}
                    onChange={(event) => {
                      setPrintRequestType(event.target.value);
                      setPrintType("all");
                    }}
                    disabled={isPreparingPrint}
                  >
                    <option value="all">All</option>
                    <option value="appointment">Appointment</option>
                    <option value="special_program">Special Program</option>
                    <option value="certificate">Certificate Request</option>
                  </select>
                </label>
                <label className="reports-sort-field reports-print-field-wide">
                  {printRequestType !== "all" ? (
                    <span>
                      {printRequestType === "appointment"
                        ? "Appointment"
                        : printRequestType === "special_program"
                          ? "Special Program"
                          : "Certificate Request"}
                    </span>
                  ) : null}
                  <select
                    className="reports-sort-select"
                    value={printType}
                    onChange={(event) => setPrintType(event.target.value)}
                    disabled={isPreparingPrint}
                  >
                    <option value="all">All</option>
                    {printSpecificTypeOptions.map((typeName) => (
                      <option key={`print-type-${typeName}`} value={typeName}>
                        {typeName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="reports-sort-field reports-print-field-wide">
                  <span>Priest</span>
                  <select
                    className="reports-sort-select"
                    value={printPriestID}
                    onChange={(event) => setPrintPriestID(event.target.value)}
                    disabled={isPreparingPrint}
                  >
                    <option value="all">All priests</option>
                    {printPriests.filter((priest) => priest.isActive).length ? (
                      <optgroup label="Active">
                        {printPriests
                          .filter((priest) => priest.isActive)
                          .map((priest) => (
                            <option key={`print-priest-${priest.priestID}`} value={String(priest.priestID)}>
                              {priest.fullName}
                            </option>
                          ))}
                      </optgroup>
                    ) : null}
                    {printPriests.filter((priest) => !priest.isActive).length ? (
                      <optgroup label="Inactive">
                        {printPriests
                          .filter((priest) => !priest.isActive)
                          .map((priest) => (
                            <option key={`print-priest-${priest.priestID}`} value={String(priest.priestID)}>
                              {priest.fullName}
                            </option>
                          ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
                <label className="reports-sort-field">
                  <span>Appointment status</span>
                  <select
                    className="reports-sort-select"
                    value={printAppointmentStatus}
                    onChange={(event) => setPrintAppointmentStatus(event.target.value)}
                    disabled={isPreparingPrint}
                  >
                    <option value="all">All statuses</option>
                    {APPOINTMENT_STATUS_FILTERS.filter((option) => option.id !== "all").map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="reports-sort-field">
                  <span>Payment status</span>
                  <select
                    className="reports-sort-select"
                    value={printPaymentStatus}
                    onChange={(event) => setPrintPaymentStatus(event.target.value)}
                    disabled={isPreparingPrint}
                  >
                    <option value="all">All payments</option>
                    {PAYMENT_STATUS_FILTERS.filter((option) => option.id !== "all").map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              </section>
              <section className="reports-print-group" aria-labelledby="reports-print-group-period">
                <h4 id="reports-print-group-period" className="reports-print-group-title">
                  <CalendarRange size={15} aria-hidden="true" />
                  Period
                </h4>
              <div className="reports-print-form">
                <label className="reports-sort-field">
                  <span>Period</span>
                  <select
                    className="reports-sort-select"
                    value={printPeriodMode}
                    onChange={(event) => setPrintPeriodMode(event.target.value)}
                    disabled={isPreparingPrint}
                  >
                    {REPORT_PERIOD_MODES.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {printPeriodMode === "daily" ? (
                  <label className="reports-sort-field">
                    <span>Date</span>
                    <input
                      type="date"
                      className="reports-sort-select"
                      value={printDay}
                      max={toDateInputValue(today)}
                      onChange={(event) => setPrintDay(event.target.value)}
                      disabled={isPreparingPrint}
                    />
                  </label>
                ) : (
                  <label className="reports-sort-field">
                    <span>Year</span>
                    <select
                      className="reports-sort-select"
                      value={printYear}
                      onChange={(event) => setPrintYear(Number(event.target.value))}
                      disabled={isPreparingPrint}
                    >
                      {printYearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {printPeriodMode === "range" ? (
                  <>
                    <label className="reports-sort-field">
                      <span>From month</span>
                      <select
                        className="reports-sort-select"
                        value={printFromMonth}
                        onChange={(event) => {
                          const nextMonth = Number(event.target.value);
                          setPrintFromMonth(nextMonth);
                          setPrintToMonth((current) => Math.max(current, nextMonth));
                        }}
                        disabled={isPreparingPrint}
                      >
                        {MONTH_OPTIONS.map((month) => (
                          <option key={month.id} value={month.id}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="reports-sort-field">
                      <span>To month</span>
                      <select
                        className="reports-sort-select"
                        value={printToMonth}
                        onChange={(event) => setPrintToMonth(Number(event.target.value))}
                        disabled={isPreparingPrint}
                      >
                        {MONTH_OPTIONS.filter((month) => month.id >= printFromMonth).map((month) => (
                          <option key={month.id} value={month.id}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
              </div>
              </section>
              <section className="reports-print-group" aria-label="File type">
                <fieldset className="reports-print-file-type">
                  <legend>File type</legend>
                  <div className="reports-print-file-type-options">
                    <label className={`reports-print-radio${printFormat === "pdf" ? " is-active" : ""}`}>
                      <input
                        type="radio"
                        name="report-file-type"
                        value="pdf"
                        checked={printFormat === "pdf"}
                        onChange={() => setPrintFormat("pdf")}
                        disabled={isPreparingPrint}
                      />
                      <FileText size={17} aria-hidden="true" />
                      PDF
                    </label>
                    <label className={`reports-print-radio${printFormat === "excel" ? " is-active" : ""}`}>
                      <input
                        type="radio"
                        name="report-file-type"
                        value="excel"
                        checked={printFormat === "excel"}
                        onChange={() => setPrintFormat("excel")}
                        disabled={isPreparingPrint}
                      />
                      <FileSpreadsheet size={17} aria-hidden="true" />
                      Excel
                    </label>
                  </div>
                </fieldset>
              </section>
              </div>
              <section className="reports-print-preview" aria-live="polite" aria-label="Report totals preview">
                <div className="reports-print-preview-head">
                  <span>Total records</span>
                  <strong>{printPreview.isLoading && !printPreview.summary ? "…" : printPreview.summary?.total ?? 0}</strong>
                  <p>{printPeriodLabel}</p>
                </div>
                <ul className="reports-print-preview-chips" aria-label="Selected filters">
                  <li>{printTypeLabel}</li>
                  <li>{printStatusLabel}</li>
                  <li>{printPaymentLabel}</li>
                  <li>{printFormat === "excel" ? "Excel" : "PDF"}</li>
                </ul>
                {printPreview.summary?.total > 0 ? (
                  <ul className="reports-print-preview-status">
                    {printPreview.summary.byStatus.map((item) => (
                      <li key={item.label} className={`is-${item.label.toLowerCase()}`}>
                        <strong>{item.count}</strong>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <h4 className="reports-print-group-title">
                  <BarChart3 size={15} aria-hidden="true" />
                  By sacramental type
                </h4>
                {printPreview.error ? (
                  <p className="reports-print-preview-empty">{printPreview.error}</p>
                ) : printPreview.isLoading && !printPreview.summary ? (
                  <p className="reports-print-preview-empty">Counting records...</p>
                ) : printPreview.summary?.total > 0 ? (
                  <ul className={`reports-print-preview-list${printPreview.isLoading ? " is-loading" : ""}`}>
                    {printPreview.summary.byType.map((item) => {
                      const { name, kind } = splitReportTypeLabel(item.label);
                      return (
                        <li key={item.label}>
                          <div className="reports-print-preview-row">
                            <div className="reports-print-preview-name">
                              <span title={item.label}>{name}</span>
                              {kind ? <small>{kind}</small> : null}
                            </div>
                            <div className="reports-print-preview-count">
                              <strong>{item.count}</strong>
                              <small>{item.percent}%</small>
                            </div>
                          </div>
                          <div className="reports-print-preview-bar" aria-hidden="true">
                            <i style={{ width: `${Math.max(item.percent, 3)}%` }} />
                          </div>
                          <p className="reports-print-preview-statusline">
                            {REPORT_STATUS_ORDER.map((status) => (
                              <span key={status} className={`is-${status.toLowerCase()}`}>
                                {item.statusCounts?.[status] || 0} {status.toLowerCase()}
                              </span>
                            ))}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="reports-print-preview-empty">No records match these filters.</p>
                )}
              </section>
            </div>
            {printModalError ? (
              <p className="reports-cancel-error reports-print-options-error" role="alert">
                {printModalError}
              </p>
            ) : null}
            <div className="reports-print-options-footer">
              {printFormat === "pdf" ? (
                <button
                  type="button"
                  className="reports-secondary-button reports-pdf-editor-button"
                  onClick={() => navigate("/admin/settings?section=pdf")}
                  disabled={isPreparingPrint}
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  PDF Editor
                </button>
              ) : null}
              <button type="button" className="reports-secondary-button" onClick={closePrintModal} disabled={isPreparingPrint}>
                Cancel
              </button>
              <button
                type="button"
                className="reports-primary-button"
                onClick={() => void handleConfirmPrint()}
                disabled={isPreparingPrint}
              >
                {isPreparingPrint ? "Preparing..." : printFormat === "excel" ? "Download Excel" : "Print PDF"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminReportsPage;
