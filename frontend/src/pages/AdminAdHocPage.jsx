import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { buildExcelReportFile, downloadTextFile } from "../utils/reportExport";
import { SETTINGS_UPDATED_EVENT, parseStoredSettings } from "../utils/appSettings";
import { getManilaDateKey } from "../utils/parishSchedule";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminReportsPage.css";

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const APPOINTMENT_RECORD_FIELDS = [
  { key: "userID", label: "User ID" },
  { key: "requesterFullName", label: "Requester name" },
  { key: "requestType", label: "Request type" },
  { key: "appointmentStatus", label: "Status" },
  { key: "priestName", label: "Priest" },
  { key: "createdAt", label: "Date requested" },
  { key: "finishedAt", label: "Date finished" },
  { key: "note", label: "Note" },
  { key: "paymentRecords", label: "Payment records" },
];

const CERTIFICATE_RECORD_FIELDS = [
  { key: "userID", label: "User ID" },
  { key: "requesterFullName", label: "Requester name" },
  { key: "certificateTypeName", label: "Certificate type" },
  { key: "appointmentStatus", label: "Status" },
  { key: "createdAt", label: "Date requested" },
  { key: "pickupDate", label: "Pickup date" },
  { key: "pickupTime", label: "Pickup time" },
  { key: "claimedAt", label: "Date claimed" },
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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
  const parts = String(parishName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "P";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
};

const formatPeriodDate = (value) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? String(value || "")
    : parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const PILL_KEYS = new Set(["appointmentStatus", "paymentStatus"]);

const schemaFields = (formSchema) => {
  const fields = Array.isArray(formSchema)
    ? formSchema
    : Array.isArray(formSchema?.fields)
      ? formSchema.fields
      : [];
  const seen = new Set();
  return fields
    .map((field) => ({
      key: String(field?.key || "").trim(),
      label: String(field?.label || field?.key || "").trim(),
    }))
    .filter((field) => {
      if (!field.key || !field.label || seen.has(field.key)) return false;
      seen.add(field.key);
      return true;
    });
};

const sameName = (left, right) => String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();

function AdHocDateField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : new Date();
  const [cursor, setCursor] = useState(selected);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const labelText = selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="adhoc-date">
      <span>{label}</span>
      <button type="button" className="adhoc-date-trigger" onClick={() => setOpen((current) => !current)}>
        {value ? labelText : "Choose a date"}
      </button>
      {open ? (
        <div className="adhoc-calendar" role="dialog" aria-label={`${label} calendar`}>
          <div className="adhoc-calendar-head">
            <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">‹</button>
            <strong>{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
            <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">›</button>
          </div>
          <div className="adhoc-calendar-week">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="adhoc-calendar-grid">
            {cells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} />;
              const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              return (
                <button
                  key={dateKey}
                  type="button"
                  className={dateKey === value ? "is-selected" : ""}
                  onClick={() => {
                    onChange(dateKey);
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const FIELD_ALIASES = {
  brideName: ["brideFullName"],
  groomName: ["groomFullName"],
  bridePhoneNumber: ["bridePhone", "brideContactNumber"],
  groomPhoneNumber: ["groomPhone", "groomContactNumber"],
  childFullName: ["childName"],
  phoneNumber: ["contactNumber", "phone"],
  deceasedName: ["deceasedFullName"],
};

const readFieldValue = (record, key) => {
  if (["createdAt", "finishedAt", "claimedAt", "pickupDate", "updatedAt"].includes(key) && record?.[key]) {
    const parsed = new Date(record[key]);
    return Number.isNaN(parsed.getTime()) ? String(record[key]).trim() : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  if (key === "certificateTypeName") {
    const name = String(record?.sacramentName || record?.resolvedSacramentName || "").trim();
    if (name) return name;
    const label = String(record?.appointmentType || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (label) return label;
    const certificateTypeID = Number(record?.certificateTypeID);
    return Number.isInteger(certificateTypeID) && certificateTypeID > 0 ? String(certificateTypeID) : "";
  }
  if (key === "sacramentName") {
    const name = String(record?.sacramentName || "").trim();
    if (name) return name;
    const label = String(record?.appointmentType || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (label) return label;
    const sacramentID = Number(record?.sacramentID);
    return Number.isInteger(sacramentID) && sacramentID > 0 ? String(sacramentID) : "";
  }
  if (key === "specialSacramentName") {
    const name = String(record?.specialSacramentName || record?.s_sacramentName || record?.sacramentName || "").trim();
    if (name) return name;
    const sacramentID = Number(record?.s_sacramentID);
    return Number.isInteger(sacramentID) && sacramentID > 0 ? String(sacramentID) : "";
  }
  if (key === "pickupTime" && record?.pickupTime) {
    const raw = String(record.pickupTime).trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return raw;
    const hour = Number(match[1]);
    const suffix = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${match[2]} ${suffix}`;
  }
  if (key === "paymentRecords") {
    const credentials = record?.credentials && typeof record.credentials === "object" ? record.credentials : {};
    const payments = Array.isArray(record?.paymentRecords)
      ? record.paymentRecords
      : Array.isArray(credentials.paymentRecords)
        ? credentials.paymentRecords
        : [];
    const activePayments = payments.filter((entry) => entry && typeof entry === "object" && !entry.isArchived);
    const latest = activePayments[activePayments.length - 1];
    return latest ? String(latest.invoiceNumber || latest.invoiceNo || "").trim() : "";
  }
  const credentials = record?.credentials && typeof record.credentials === "object" ? record.credentials : {};
  const fileBase = String(key || "").replace(/File$/i, "");
  const keys = [
    ...(fileBase && fileBase !== key ? [`${fileBase}FileName`, `${fileBase}Name`, `${fileBase}FileUrl`, `${fileBase}Url`] : []),
    `${key}FileName`,
    `${key}Name`,
    `${key}FileUrl`,
    `${key}Url`,
    key,
    ...(FIELD_ALIASES[key] || []),
  ];
  let raw;
  let matchedKey = "";
  for (const candidate of keys) {
    const direct = record?.[candidate];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
      raw = direct;
      matchedKey = candidate;
      break;
    }
    const stored = credentials[candidate];
    if (stored !== undefined && stored !== null && String(stored).trim() !== "") {
      raw = stored;
      matchedKey = candidate;
      break;
    }
  }
  if (raw === undefined || raw === null) return "";
  if (/(?:File)?(?:Name|Url)$/i.test(matchedKey) && matchedKey !== key) return "Submitted";
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (entry && typeof entry === "object" ? entry.name || entry.fullName || "" : entry))
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .join(", ");
  }
  if (typeof raw === "object") {
    return String(raw.name || raw.fullName || "").trim();
  }
  const text = String(raw).trim();
  if (/\/uploads\//i.test(text) || /\.(png|jpe?g|webp|gif|bmp|svg|avif|pdf|docx?)(\?|#|$)/i.test(text)) return "Submitted";
  return text;
};

function AdminAdHocPage() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [startDate, setStartDate] = useState(() => `${getManilaDateKey().slice(0, 4)}-01-01`);
  const [endDate, setEndDate] = useState(() => getManilaDateKey());
  const [searchText, setSearchText] = useState("");
  const [requestType, setRequestType] = useState("appointment");
  const [specificType, setSpecificType] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [appointmentTypes, setAppointmentTypes] = useState(["Marriage", "Funeral Mass", "Baptism", "Blessing"]);
  const [specialProgramTypes, setSpecialProgramTypes] = useState(["Kasalan Ng Bayan", "Binyagan Ng Bayan"]);
  const [certificateTypes, setCertificateTypes] = useState(["Marriage Certificate", "Baptismal Certificate", "Confirmation Certificate"]);
  const [checkedKeys, setCheckedKeys] = useState(["requesterFullName", "appointmentStatus"]);
  const [formSources, setFormSources] = useState({ appointments: [], programs: [], certificates: [] });
  const [records, setRecords] = useState([]);
  const [hasViewed, setHasViewed] = useState(false);
  const [searchedFilters, setSearchedFilters] = useState({ requestType: "appointment", specificType: "all", start: "", end: "" });
  const [pdfSettings, setPdfSettings] = useState(parseStoredSettings);
  const [parishBrand, setParishBrand] = useState({ parishName: "", photo: "", address: "", secretaryName: "" });
  const [isParishLogoBroken, setIsParishLogoBroken] = useState(false);
  const [printRequestId, setPrintRequestId] = useState(0);
  const printReadyRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const authData = useMemo(() => {
    const raw = localStorage.getItem("faithflow_auth") || sessionStorage.getItem("faithflow_auth");
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
  useEffect(() => {
    if (requestType !== "appointment") return;
    if (specificType !== "all" && appointmentTypes.includes(specificType)) return;
    if (appointmentTypes[0]) setSpecificType(appointmentTypes[0]);
  }, [appointmentTypes, requestType, specificType]);
  const specificTypeOptions = requestType === "appointment"
    ? appointmentTypes
    : requestType === "special_program"
      ? specialProgramTypes
      : requestType === "certificate"
        ? certificateTypes
        : [...new Set([...appointmentTypes, ...specialProgramTypes, ...certificateTypes])].sort((left, right) => left.localeCompare(right));
  const specificTypeLabel = requestType === "appointment"
    ? "Appointment"
    : requestType === "special_program"
      ? "Special Program"
      : requestType === "certificate"
        ? "Certificate Request"
        : "Service";
  useEffect(() => {
    const syncPdfSettings = () => setPdfSettings(parseStoredSettings());
    window.addEventListener(SETTINGS_UPDATED_EVENT, syncPdfSettings);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, syncPdfSettings);
  }, []);

  useEffect(() => {
    if (!Number.isInteger(adminID) || adminID <= 0) return undefined;
    let cancelled = false;
    const loadParishBrand = async () => {
      try {
        const response = await fetch(`/admin-api/profile?accountType=admin&accountID=${adminID}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        const nextUser = payload?.user || {};
        setParishBrand({
          parishName: String(nextUser.parishName || "").trim(),
          photo: String(nextUser.photo || "").trim(),
          address: String(nextUser.address || "").trim(),
          secretaryName: String(nextUser.fullName || "").trim(),
        });
      } catch {
        // The signed-in account still supplies the parish name when the profile cannot load.
      }
    };
    void loadParishBrand();
    return () => {
      cancelled = true;
    };
  }, [adminID]);

  useEffect(() => {
    if (!printRequestId) return undefined;
    let cancelled = false;
    const run = async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      if (cancelled || !printReadyRef.current) return;
      const previousTitle = document.title;
      document.title = " ";
      document.body.classList.add("adhoc-printing");
      const logoImage = document.querySelector(".adhoc-print-sheet .reports-print-brand-logo");
      if (logoImage && typeof logoImage.decode === "function") {
        try {
          await logoImage.decode();
        } catch {
          // Continue printing when the parish logo cannot decode.
        }
      }
      if (cancelled) return;
      const restoreTitle = () => {
        document.title = previousTitle;
        document.body.classList.remove("adhoc-printing");
        window.removeEventListener("afterprint", restoreTitle);
        printReadyRef.current = false;
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
    let cancelled = false;
    const loadForms = async () => {
      try {
        const [sacramentResponse, programResponse, certificateResponse] = await Promise.all([
          fetch("/admin-api/sacraments?archived=false"),
          fetch("/admin-api/special-sacrament-form-schemas"),
          fetch("/admin-api/certificate-types"),
        ]);
        const sacraments = await sacramentResponse.json().catch(() => []);
        const programs = await programResponse.json().catch(() => []);
        const certificates = await certificateResponse.json().catch(() => ({}));
        if (cancelled) return;
        setFormSources({
          appointments: (Array.isArray(sacraments) ? sacraments : [])
            .filter((item) => item?.isArchived !== true)
            .map((item) => ({ name: item.sacramentName, fields: schemaFields(item.formSchema) })),
          programs: (Array.isArray(programs) ? programs : [])
            .map((item) => ({ name: item.specialSacramentName || item.displayLabel, fields: schemaFields(item.formSchema) })),
          certificates: (Array.isArray(certificates?.items) ? certificates.items : [])
            .map((item) => ({ name: item.certTypeName || item.formSchema?.label, fields: schemaFields(item.formSchema) })),
        });
      } catch {
        if (!cancelled) setFormSources({ appointments: [], programs: [], certificates: [] });
      }
    };
    void loadForms();
    return () => {
      cancelled = true;
    };
  }, []);
  const activeGroups = useMemo(() => {
    if (!hasViewed) return [];
    const selectedName = searchedFilters.specificType === "all" ? "" : searchedFilters.specificType;
    const include = (kind) => searchedFilters.requestType === "all" || searchedFilters.requestType === kind;
    const pick = (items) => items.filter((item) => item.name && item.fields.length && (!selectedName || sameName(item.name, selectedName)));
    const groups = [
      ...(include("appointment") ? pick(formSources.appointments) : []),
      ...(include("special_program") ? pick(formSources.programs) : []),
      ...(include("certificate") ? pick(formSources.certificates) : []),
    ].map((item) => ({ title: item.name, fields: item.fields }));
    const appointmentFields = searchedFilters.requestType === "special_program"
      ? [
          ...APPOINTMENT_RECORD_FIELDS.slice(0, 3),
          { key: "specialSacramentName", label: "Special sacrament" },
          ...APPOINTMENT_RECORD_FIELDS.slice(3),
        ]
      : [
          ...APPOINTMENT_RECORD_FIELDS.slice(0, 3),
          { key: "sacramentName", label: "Sacrament" },
          ...APPOINTMENT_RECORD_FIELDS.slice(3),
        ];
    const recordFields = searchedFilters.requestType === "certificate" ? CERTIFICATE_RECORD_FIELDS : appointmentFields;
    return [{ title: "Record", fields: recordFields }, ...groups];
  }, [formSources, hasViewed, searchedFilters]);
  const availableFields = activeGroups.flatMap((group) => group.fields);
  const selectedFields = checkedKeys
    .map((key) => availableFields.find((field) => field.key === key))
    .filter(Boolean);

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const toggleField = (key) => {
    setCheckedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const displayColumns = useMemo(() => {
    const columns = [];
    const indexByLabel = new Map();
    selectedFields.forEach((field) => {
      const labelKey = String(field.label || "").trim().toLowerCase();
      const existingIndex = indexByLabel.get(labelKey);
      if (existingIndex === undefined) {
        indexByLabel.set(labelKey, columns.length);
        columns.push({ id: field.key, label: field.label, keys: [field.key], file: String(field.type || "").toLowerCase() === "file" });
        return;
      }
      const column = columns[existingIndex];
      const conflicts = records.some((record) => {
        const currentValues = [...new Set(column.keys.map((key) => readFieldValue(record, key)).filter(Boolean))];
        const nextValue = readFieldValue(record, field.key);
        if (!nextValue || !currentValues.length) return false;
        return currentValues.some((value) => value !== nextValue);
      });
      if (conflicts) {
        columns.push({ id: `${field.key}-${columns.length}`, label: field.label, keys: [field.key], file: String(field.type || "").toLowerCase() === "file" });
        return;
      }
      if (!column.keys.includes(field.key)) column.keys.push(field.key);
      if (String(field.type || "").toLowerCase() === "file") column.file = true;
    });
    return columns;
  }, [records, selectedFields]);

  const readColumnValue = (record, column) => {
    for (const key of column.keys) {
      const value = readFieldValue(record, key);
      if (!value) continue;
      if (column.file) return "Submitted";
      return value;
    }
    return "";
  };

  const visibleRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!selectedFields.length) return [];
    return records.filter((record) => {
      if (!query) return true;
      const values = displayColumns.map((column) => readColumnValue(record, column));
      return values.join(" ").toLowerCase().includes(query);
    });
  }, [displayColumns, records, searchText, selectedFields]);
  const exportRows = () => visibleRows.map((record) => displayColumns.map((column) => readColumnValue(record, column) || "—"));

  const exportExcel = () => {
    if (!displayColumns.length) return;
    const workbook = buildExcelReportFile({
      summaryLines: ["Ad Hoc Report", `Records: ${visibleRows.length}`],
      headers: displayColumns.map((column) => column.label),
      rows: exportRows(),
      sheetName: "Ad Hoc",
    });
    downloadTextFile("Ad-Hoc-Report.xls", workbook, "application/vnd.ms-excel;charset=utf-8");
  };

  const printPdf = () => {
    if (!displayColumns.length || !visibleRows.length) return;
    printReadyRef.current = true;
    setPrintRequestId((currentId) => currentId + 1);
  };

  const viewReport = async (event) => {
    event.preventDefault();
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setError("Unable to detect the admin account.");
      return;
    }
    if (!startDate || !endDate || endDate < startDate) {
      setError("Choose a start date and an end date.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        adminID: String(adminID),
        start: startDate,
        end: endDate,
        requestType,
        appointmentType: specificType === "all" ? "all" : specificType,
        appointmentStatus: "all",
        paymentStatus: "all",
        sort: sortOrder,
      });
      const response = await fetch(`/admin-api/reports/records?${query.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Unable to load this report.");
      const nextAppointmentTypes = Array.isArray(payload?.appointmentTypeOptions)
        ? payload.appointmentTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
        : [];
      const nextSpecialProgramTypes = Array.isArray(payload?.specialProgramTypeOptions)
        ? payload.specialProgramTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
        : [];
      const nextCertificateTypes = Array.isArray(payload?.certificateTypeOptions)
        ? payload.certificateTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
        : [];
      if (nextAppointmentTypes.length) setAppointmentTypes(nextAppointmentTypes);
      if (nextSpecialProgramTypes.length) setSpecialProgramTypes(nextSpecialProgramTypes);
      if (nextCertificateTypes.length) setCertificateTypes(nextCertificateTypes);
      setRecords(Array.isArray(payload?.records) ? payload.records : []);
      setSearchedFilters({ requestType, specificType, start: startDate, end: endDate });
      const essentialKeys = requestType === "special_program"
        ? ["requesterFullName", "requestType", "specialSacramentName", "appointmentStatus", "priestName", "paymentRecords"]
        : requestType === "appointment"
          ? ["requesterFullName", "requestType", "sacramentName", "appointmentStatus", "priestName", "paymentRecords"]
          : requestType === "certificate"
            ? ["requesterFullName", "certificateTypeName", "appointmentStatus", "createdAt"]
            : [];
      if (essentialKeys.length) {
        setCheckedKeys((current) => {
          const next = [...current];
          essentialKeys.forEach((key) => {
            if (!next.includes(key)) next.push(key);
          });
          return next;
        });
      }
      setHasViewed(true);
    } catch (loadError) {
      setError(loadError.message || "Unable to load this report.");
    } finally {
      setIsLoading(false);
    }
  };

  const parishName = parishBrand.parishName || String(user?.parishName || "Parish").trim() || "Parish";
  const parishAddress = parishBrand.address || String(user?.address || "").trim();
  const parishSecretaryName = parishBrand.secretaryName || String(user?.fullName || "").trim();
  const pdfLogoSource = pdfSettings.pdfChurchLogo || resolveParishPhotoSource(parishBrand.photo || user?.photo);
  const shouldShowPdfLogo = pdfSettings.pdfShowLogo !== false && Boolean(pdfLogoSource) && !isParishLogoBroken;
  const pdfHeaderAlign = pdfSettings.pdfHeaderAlign === "center" ? "center" : "left";
  const pdfHeaderRule = pdfSettings.pdfHeaderRule === "double" ? "double" : "single";
  const pdfDensity = pdfSettings.pdfDensity === "compact" ? "compact" : "standard";
  const pdfTableStyle = pdfSettings.pdfTableStyle === "grid" ? "grid" : "open";
  const pdfLogoShape = pdfSettings.pdfLogoShape === "oval" ? "oval" : "square";
  const pdfLogoBorder = pdfSettings.pdfLogoBorder === "none" ? "plain" : "border";
  const printRecordTitle = (() => {
    const category = searchedFilters.requestType === "special_program"
      ? "Special Program"
      : searchedFilters.requestType === "certificate"
        ? "Certificate Request"
        : "Appointment";
    if (searchedFilters.specificType && searchedFilters.specificType !== "all") {
      return `${searchedFilters.specificType} · ${category}`;
    }
    return category;
  })();
  const printPeriodLabel = searchedFilters.start && searchedFilters.end
    ? `${formatPeriodDate(searchedFilters.start)} – ${formatPeriodDate(searchedFilters.end)}`
    : "";

  if (!user || accountType !== "admin") return null;

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
          <section className="dashboard-panel dashboard-hero reports-hero admin-list-hero adhoc-hero">
            <div>
              <h2>Ad Hoc Report</h2>
            </div>
            <div className="view-mode-hero-actions">
              <button type="button" className="reports-secondary-button reports-hero-print" onClick={() => navigate("/admin/reports")}>
                Back
              </button>
            </div>
          </section>
          <section className="dashboard-panel reports-panel">
            <form onSubmit={viewReport}>
              <div className="adhoc-filters">
                <div className="adhoc-filter-row">
                  <AdHocDateField label="From" value={startDate} onChange={setStartDate} />
                  <AdHocDateField label="To" value={endDate} onChange={setEndDate} />
                  <label>
                    Type
                    <select
                      value={requestType}
                      onChange={(event) => {
                        setRequestType(event.target.value);
                        setSpecificType("all");
                      }}
                    >
                      <option value="appointment">Appointment</option>
                      <option value="special_program">Special Program</option>
                      <option value="certificate">Certificate Request</option>
                    </select>
                  </label>
                  <label>
                    {specificTypeLabel}
                    <select value={specificType} onChange={(event) => setSpecificType(event.target.value)}>
                      {requestType === "appointment" ? null : <option value="all">All</option>}
                      {specificTypeOptions.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sort By
                    <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                    </select>
                  </label>
                </div>
                <div className="adhoc-filter-row">
                  <label className="adhoc-search">
                    Search
                    <input
                      type="search"
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="Search requester, sacrament, type, status, or ID"
                    />
                  </label>
                  <button type="submit" className="reports-primary-button adhoc-search-button" disabled={isLoading}>
                    {isLoading ? "Searching..." : "Search"}
                  </button>
                </div>
              </div>
              {activeGroups.length ? (
                <div className="adhoc-groups">
                  {activeGroups.map((group) => (
                    <fieldset key={group.title} className="adhoc-group">
                      <legend>{group.title}</legend>
                      {group.fields.map((field) => (
                        <label key={field.key} className="adhoc-check">
                          <input type="checkbox" checked={checkedKeys.includes(field.key)} onChange={() => toggleField(field.key)} />
                          <span>{field.label}</span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              ) : null}
            </form>
            {error ? <p className="reports-empty-state">{error}</p> : null}
            {hasViewed ? (
              <>
              <div className="reports-table-wrap">
                <table className="reports-preview-table reports-records-table adhoc-records-table">
                  <thead>
                    <tr>
                      {displayColumns.map((column) => (
                        <th key={column.id} scope="col">{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length ? (
                      visibleRows.map((record, index) => (
                        <tr key={`${record.recordKey || record.appointmentID || "row"}-${index}`}>
                          {displayColumns.map((column) => {
                            const value = readColumnValue(record, column) || "—";
                            const usePill = column.keys.some((key) => PILL_KEYS.has(key)) && value !== "—";
                            return (
                              <td key={column.id}>
                                {usePill ? (
                                  <span className={`reports-status-pill is-${value.toLowerCase().replace(/\s+/g, "-")}`}>{value}</span>
                                ) : value}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={Math.max(displayColumns.length, 1)}>No records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {visibleRows.length > 0 ? (
                <div className="adhoc-export-actions">
                  <button type="button" className="reports-secondary-button" onClick={exportExcel}>Export to Excel</button>
                  <button type="button" className="reports-primary-button" onClick={printPdf}>Print PDF</button>
                </div>
              ) : null}
              </>
            ) : (
              <div className="reports-empty-state">
                <div className="reports-empty-icon" aria-hidden="true">
                  <Search size={34} strokeWidth={1.5} />
                </div>
                <h3>Set the filters, then press Search.</h3>
                <p>The fields and records for the selected type will appear here.</p>
              </div>
            )}
          </section>
          <section className="reports-print-sheet adhoc-print-sheet" aria-hidden="true">
            <section className={`reports-print-document is-align-${pdfHeaderAlign} is-rule-${pdfHeaderRule} is-density-${pdfDensity} is-table-${pdfTableStyle} is-logo-${pdfLogoShape} is-logo-${pdfLogoBorder}`}>
              <table className="reports-print-layout" role="presentation">
                <thead>
                  <tr>
                    <td><div className="reports-print-layout-space is-top" /></td>
                  </tr>
                </thead>
                <tfoot>
                  <tr>
                    <td><div className="reports-print-layout-space is-bottom" /></td>
                  </tr>
                </tfoot>
                <tbody>
                  <tr>
                    <td className="reports-print-layout-body">
                      <header className="reports-print-brand">
                        {pdfSettings.pdfShowLogo !== false ? (
                          <div className="reports-print-brand-mark">
                            {shouldShowPdfLogo ? (
                              <img className="reports-print-brand-logo" src={pdfLogoSource} alt="" onError={() => setIsParishLogoBroken(true)} />
                            ) : (
                              <span className="reports-print-brand-fallback">{getParishInitials(parishName)}</span>
                            )}
                          </div>
                        ) : null}
                        <div className="reports-print-brand-copy">
                          {pdfSettings.pdfReportTitle ? <p className="reports-print-kicker">{pdfSettings.pdfReportTitle}</p> : null}
                          {pdfSettings.pdfShowParishName !== false ? <h3>{parishName}</h3> : null}
                          {pdfSettings.pdfShowAddress !== false && parishAddress ? <p className="reports-print-address">{parishAddress}</p> : null}
                          {printPeriodLabel ? <p className="reports-print-subtitle">{printPeriodLabel}</p> : null}
                        </div>
                      </header>
                      <h4 className="reports-print-summary-title is-records">{printRecordTitle}</h4>
                      <table className="reports-preview-table reports-records-table reports-print-table adhoc-records-table">
                        <thead>
                          <tr>
                            {displayColumns.map((column) => (
                              <th key={column.id} scope="col">{column.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((record, index) => (
                            <tr key={`print-${record.recordKey || record.appointmentID || index}`}>
                              {displayColumns.map((column) => {
                                const value = readColumnValue(record, column) || "—";
                                const usePill = column.keys.some((key) => PILL_KEYS.has(key)) && value !== "—";
                                return (
                                  <td key={column.id}>
                                    {usePill ? <span className={`reports-status-pill is-${value.toLowerCase().replace(/\s+/g, "-")}`}>{value}</span> : value}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="reports-print-total-line">Total: {visibleRows.length} {visibleRows.length === 1 ? "record" : "records"}</p>
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
          </section>
        </section>
      </div>
    </main>
  );
}

export default AdminAdHocPage;
