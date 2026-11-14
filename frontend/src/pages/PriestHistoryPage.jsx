import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Printer, X } from "lucide-react";
import PageGuide from "../components/PageGuide";
import ViewModeToggle, { useViewMode } from "../components/ViewModeToggle";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { SETTINGS_UPDATED_EVENT, parseStoredSettings } from "../utils/appSettings";
import { MONTH_OPTIONS, buildExcelReportFile, buildPrintPeriodRange, downloadTextFile } from "../utils/reportExport";
import { getManilaDateKey } from "../utils/parishSchedule";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";
import "./PriestAppointmentsPages.css";
import "./AdminReportsPage.css";
import "./PriestHistoryPrint.css";

const HISTORY_STATUS_OPTIONS = [
  { id: "COMPLETED", label: "Completed" },
  { id: "CANCELLED", label: "Cancelled" },
];

const HISTORY_SORT_OPTIONS = [
  { id: "latest", label: "Latest" },
  { id: "oldest", label: "Oldest" },
];

const PRINT_PERIOD_OPTIONS = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
  { id: "all", label: "All time" },
];

const getRecordEventDate = (entry) => entry?.scheduledEventDateTime || entry?.createdAt || null;

const getRecordSortTime = (entry) => {
  const time = new Date(getRecordEventDate(entry) || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const sortHistoryRecords = (items, sortMode) =>
  [...items].sort((a, b) => {
    const direction = sortMode === "oldest" ? 1 : -1;
    const timeDifference = getRecordSortTime(a) - getRecordSortTime(b);
    if (timeDifference !== 0) return timeDifference * direction;
    return (Number(a?.appointmentID || 0) - Number(b?.appointmentID || 0)) * direction;
  });

const toLocalDateKey = (value) => {
  const parsedDate = value ? new Date(value) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return "";
  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

const PRINT_COLUMNS = [
  { key: "number", label: "No.", value: (row) => `#${row.appointmentID}` },
  { key: "date", label: "Scheduled", value: (row) => formatDateTimeLabel(row.scheduledEventDateTime || row.createdAt) },
  { key: "sacrament", label: "Sacrament", value: (row) => row.sacramentName || "Sacramental Activity" },
  { key: "requester", label: "Requester", value: (row) => row.requesterFullName || "Unknown requester" },
  { key: "status", label: "Status", value: (row) => formatStatusLabel(row.status), pill: true },
  { key: "comments", label: "Priest Comments", value: (row) => String(row.priestComments || "").trim() || "—" },
];

const formatDateTimeLabel = (value) => {
  if (!value) return "N/A";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "N/A";
  return parsedDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getDateBlockParts = (value) => {
  const parsedDate = value ? new Date(value) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null;
  return {
    month: parsedDate.toLocaleString("en-US", { month: "short" }),
    day: parsedDate.getDate(),
    year: parsedDate.getFullYear(),
  };
};

const toStatusClassName = (status) => String(status || "").trim().toLowerCase();
const formatStatusLabel = (status) => {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "COMPLETED") return "Completed";
  if (normalized === "CANCELLED") return "Cancelled";
  return toLabel(status) || "Recorded";
};
const toLabel = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const HIDDEN_CREDENTIAL_KEYS = new Set([
  "paymentrecords",
  "scheduledeventdatetime",
  "paymentstatus",
  "receiptfileurl",
  "isarchived",
  "archivedat",
  "recordid",
  "recordedat",
  "recordedatstep",
]);

const formatCredentialValue = (rawValue) => {
  const text = String(rawValue ?? "").trim();
  if (!text) return "Not provided";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return formatDateTimeLabel(text);
  return text;
};

const flattenCredentialDetails = (value, prefix = "") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const hasSplitMarriageAddress = Boolean(
    String(value.brideAddress || "").trim() || String(value.groomAddress || "").trim(),
  );
  const hasDeceasedAddress = Boolean(String(value.deceasedAddress || "").trim());
  return Object.entries(value).flatMap(([key, entryValue]) => {
    if (HIDDEN_CREDENTIAL_KEYS.has(String(key || "").toLowerCase())) return [];
    if (!prefix && (hasSplitMarriageAddress || hasDeceasedAddress) && key === "address") return [];
    const label = prefix ? `${prefix} - ${toLabel(key)}` : toLabel(key);
    if (entryValue && typeof entryValue === "object" && !Array.isArray(entryValue)) {
      return flattenCredentialDetails(entryValue, label);
    }
    if (Array.isArray(entryValue)) {
      return [{ label, value: entryValue.filter(Boolean).join(", ") || "Not provided" }];
    }
    if (typeof entryValue === "boolean") {
      return [{ label, value: entryValue ? "Yes" : "No" }];
    }
    return [{ label, value: formatCredentialValue(entryValue) }];
  });
};

const HISTORY_PAGE_SIZE = 10;

function PriestHistoryPage() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [viewMode, setViewMode] = useViewMode("priest-history");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequestCategory, setSelectedRequestCategory] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [appointmentTypeOptions, setAppointmentTypeOptions] = useState(["Marriage", "Baptism", "Funeral Mass", "Blessing"]);
  const [specialProgramTypeOptions, setSpecialProgramTypeOptions] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedSort, setSelectedSort] = useState("latest");
  const [currentPage, setCurrentPage] = useState(1);
  const [parishAdminID, setParishAdminID] = useState(null);
  const [parishBrand, setParishBrand] = useState({ parishName: "", photo: "", address: "" });
  const [isParishLogoBroken, setIsParishLogoBroken] = useState(false);
  const today = useMemo(() => new Date(), []);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState("all");
  const [printStatus, setPrintStatus] = useState("all");
  const [printSort, setPrintSort] = useState("latest");
  const [printPeriodMode, setPrintPeriodMode] = useState("monthly");
  const [printYear, setPrintYear] = useState(today.getFullYear());
  const [printMonth, setPrintMonth] = useState(today.getMonth() + 1);
  const [printFormat, setPrintFormat] = useState("pdf");
  const [pdfSettings, setPdfSettings] = useState(parseStoredSettings);
  const [printModalError, setPrintModalError] = useState("");
  const [printSnapshot, setPrintSnapshot] = useState(null);
  const [printRequestId, setPrintRequestId] = useState(0);
  const printSnapshotRef = useRef(null);
  printSnapshotRef.current = printSnapshot;

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
  const priestID = Number(user?.priestID);

  useEffect(() => {
    document.title = "Faithflow - Priest History";
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType === "admin") {
      navigate("/admin/dashboard", { replace: true });
      return;
    }
    if (accountType !== "priest") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user, accountType]);

  const loadHistory = async () => {
    if (!Number.isInteger(priestID) || priestID <= 0) return;
    setIsLoading(true);
    setErrorMessage("");
    try {
      const [response, sacramentResponse, programResponse] = await Promise.all([
        fetch(`/api/priest/me/dashboard?priestID=${priestID}`),
        fetch("/api/sacraments?archived=false"),
        fetch("/api/special-sacraments"),
      ]);
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load priest history.");
      }
      const resolvedAdminID = Number(responseData?.priest?.adminID);
      if (Number.isInteger(resolvedAdminID) && resolvedAdminID > 0) setParishAdminID(resolvedAdminID);
      const allRecords = Array.isArray(responseData?.records) ? responseData.records : [];
      const pastEvents = allRecords.filter(
        (entry) =>
          entry?.status === "COMPLETED" ||
          entry?.status === "CANCELLED" ||
          Boolean(entry?.finishedAt),
      );
      const sacramentPayload = await sacramentResponse.json().catch(() => []);
      const programPayload = await programResponse.json().catch(() => []);
      const todayKey = getManilaDateKey();
      const managedAppointments = (Array.isArray(sacramentPayload) ? sacramentPayload : [])
        .map((item) => String(item?.sacramentName || "").trim())
        .filter(Boolean);
      const ongoingPrograms = (Array.isArray(programPayload) ? programPayload : [])
        .filter((item) => {
          const eventKey = new Date(item?.timeDate || "").toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
          return /^\d{4}-\d{2}-\d{2}$/.test(eventKey) && eventKey >= todayKey;
        })
        .map((item) => String(item?.s_sacramentName || "").trim())
        .filter(Boolean);
      const hiddenSpecialProgramNames = new Set(["ohh", "ohhh", "yes", "yess", "yesir", "yessir"]);
      const isListedSpecialProgram = (name) => !hiddenSpecialProgramNames.has(String(name || "").trim().toLowerCase());
      const isSpecialRecord = (entry) => Number(entry?.s_sacramentID) > 0 || entry?.requestCategory === "special_program";
      setAppointmentTypeOptions(
        [...new Set([
          ...managedAppointments,
          ...pastEvents.filter((entry) => !isSpecialRecord(entry)).map((entry) => String(entry?.sacramentName || "").trim()),
        ])].filter(Boolean).sort((left, right) => left.localeCompare(right)),
      );
      setSpecialProgramTypeOptions(
        [...new Set([
          ...ongoingPrograms,
          ...pastEvents.filter((entry) => isSpecialRecord(entry)).map((entry) => String(entry?.sacramentName || "").trim()),
        ])].filter((name) => name && isListedSpecialProgram(name)).sort((left, right) => left.localeCompare(right)),
      );
      setRecords(pastEvents);
    } catch (error) {
      setRecords([]);
      setErrorMessage(error.message || "Unable to load priest history.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [priestID]);

  useEffect(() => {
    const syncPdfSettings = () => setPdfSettings(parseStoredSettings());
    window.addEventListener(SETTINGS_UPDATED_EVENT, syncPdfSettings);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, syncPdfSettings);
  }, []);

  useEffect(() => {
    if (!Number.isInteger(parishAdminID) || parishAdminID <= 0) return undefined;
    let cancelled = false;
    const loadParishBrand = async () => {
      try {
        const response = await fetch(`/admin-api/profile?accountType=admin&accountID=${parishAdminID}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        const parish = payload?.user || {};
        setParishBrand({
          parishName: String(parish.parishName || "").trim(),
          photo: String(parish.photo || "").trim(),
          address: String(parish.address || "").trim(),
        });
      } catch {
        // The printout falls back to the default parish name when the profile is unavailable.
      }
    };
    void loadParishBrand();
    return () => {
      cancelled = true;
    };
  }, [parishAdminID]);

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
      const logoImage = document.querySelector(".priest-history-print-sheet .reports-print-brand-logo");
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

  const openDetails = async (appointmentID) => {
    if (!Number.isInteger(Number(appointmentID)) || Number(appointmentID) <= 0) return;
    setDetailsError("");
    setIsLoadingDetails(true);
    try {
      const response = await fetch(`/api/priest/me/appointments/${appointmentID}/details?priestID=${priestID}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Unable to load appointment details.");
      }
      setSelectedDetails(payload);
    } catch (error) {
      setSelectedDetails(null);
      setDetailsError(error.message || "Unable to load appointment details.");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const sacramentOptions = useMemo(() => {
    const uniqueTypes = [...new Set(records.map((entry) => String(entry?.sacramentName || "").trim()).filter(Boolean))];
    return uniqueTypes.sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const nextItems = records.filter((entry) => {
      const sacramentName = String(entry?.sacramentName || "").trim();
      const requester = String(entry?.requesterFullName || "").trim();
      const status = String(entry?.status || "").trim();
      const idLabel = String(entry?.appointmentID || "").trim();
      const matchesSearch =
        !normalizedSearch ||
        sacramentName.toLowerCase().includes(normalizedSearch) ||
        requester.toLowerCase().includes(normalizedSearch) ||
        status.toLowerCase().includes(normalizedSearch) ||
        idLabel.includes(normalizedSearch);
      const isSpecial = Number(entry?.s_sacramentID) > 0 || entry?.requestCategory === "special_program";
      const matchesCategory =
        selectedRequestCategory === "all" ||
        (selectedRequestCategory === "special_program" ? isSpecial : !isSpecial);
      const matchesType = selectedType === "all" || sacramentName === selectedType;
      const matchesStatus = selectedStatus === "all" || status.toUpperCase() === selectedStatus;
      return matchesSearch && matchesCategory && matchesType && matchesStatus;
    });
    return sortHistoryRecords(nextItems, selectedSort);
  }, [records, searchQuery, selectedRequestCategory, selectedSort, selectedStatus, selectedType]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedSort, selectedStatus, selectedType]);

  const printYearOptions = useMemo(() => {
    const currentYear = today.getFullYear();
    const years = new Set(Array.from({ length: 8 }, (_, index) => currentYear - index));
    records.forEach((entry) => {
      const parsedDate = new Date(getRecordEventDate(entry) || "");
      if (!Number.isNaN(parsedDate.getTime())) years.add(parsedDate.getFullYear());
    });
    return [...years].sort((a, b) => b - a);
  }, [records, today]);

  const parishName = parishBrand.parishName || "Our Lady of Guadalupe Parish";
  const pdfLogoSource = pdfSettings.pdfChurchLogo || resolveParishPhotoSource(parishBrand.photo);

  useEffect(() => {
    setIsParishLogoBroken(false);
  }, [pdfLogoSource]);

  const selectedDetailRows = useMemo(() => {
    if (!selectedDetails) return [];
    return [
      { label: "Appointment ID", value: `#${selectedDetails.appointmentID || "N/A"}` },
      { label: "Requester", value: selectedDetails.requesterFullName || "Unknown requester" },
      { label: "Service", value: selectedDetails.sacramentName || "N/A" },
      { label: "Status", value: formatStatusLabel(selectedDetails.status) },
      { label: "Request Type", value: selectedDetails.requestType || "Appointment" },
      { label: "Scheduled Event", value: formatDateTimeLabel(selectedDetails.scheduledEventDateTime) },
      { label: "Submitted", value: formatDateTimeLabel(selectedDetails.createdAt) },
      { label: "Finished", value: formatDateTimeLabel(selectedDetails.finishedAt) },
      { label: "Priest Comments", value: String(selectedDetails?.finalDetails?.priestComments || "").trim() || "N/A" },
      { label: "Secretary Remarks", value: String(selectedDetails?.finalDetails?.secretaryRemarks || "").trim() || "N/A" },
      { label: "Secretary Note", value: selectedDetails.note || "N/A" },
      ...flattenCredentialDetails(selectedDetails.credentials),
    ];
  }, [selectedDetails]);

  if (!user || accountType !== "priest") return null;

  const completedCount = records.filter((entry) => entry?.status === "COMPLETED").length;
  const cancelledCount = records.filter((entry) => entry?.status === "CANCELLED").length;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const priestName = String(user?.fullName || "").trim();
  const shouldShowPdfLogo = pdfSettings.pdfShowLogo !== false && Boolean(pdfLogoSource) && !isParishLogoBroken;
  const pdfHeaderAlign = pdfSettings.pdfHeaderAlign === "center" ? "center" : "left";
  const pdfHeaderRule = pdfSettings.pdfHeaderRule === "double" ? "double" : "single";
  const pdfDensity = pdfSettings.pdfDensity === "compact" ? "compact" : "standard";
  const pdfTableStyle = pdfSettings.pdfTableStyle === "grid" ? "grid" : "open";
  const pdfLogoShape = pdfSettings.pdfLogoShape === "oval" ? "oval" : "square";
  const pdfLogoBorder = pdfSettings.pdfLogoBorder === "none" ? "plain" : "border";

  const printMonthLabel = MONTH_OPTIONS.find((option) => option.id === printMonth)?.label || "January";
  const printPeriodLabel =
    printPeriodMode === "all"
      ? "All time"
      : printPeriodMode === "yearly"
        ? String(printYear)
        : `${printMonthLabel} ${printYear}`;
  const printTypeLabel = printType === "all" ? "All types" : printType;
  const printStatusLabel =
    printStatus === "all"
      ? "All statuses"
      : HISTORY_STATUS_OPTIONS.find((option) => option.id === printStatus)?.label || "All statuses";
  const printSortLabel = HISTORY_SORT_OPTIONS.find((option) => option.id === printSort)?.label || "Latest";

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / HISTORY_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedItems = filteredItems.slice(
    (safeCurrentPage - 1) * HISTORY_PAGE_SIZE,
    safeCurrentPage * HISTORY_PAGE_SIZE,
  );

  const openPrintModal = () => {
    setPrintType(selectedType);
    setPrintStatus(selectedStatus);
    setPrintSort(selectedSort);
    setPrintModalError("");
    setIsPrintModalOpen(true);
  };

  const closePrintModal = () => {
    setIsPrintModalOpen(false);
    setPrintModalError("");
  };

  const handleConfirmPrint = () => {
    const range = printPeriodMode === "all" ? null : buildPrintPeriodRange(printPeriodMode, printYear, printMonth);
    const rows = sortHistoryRecords(
      records.filter((entry) => {
        const sacramentName = String(entry?.sacramentName || "").trim();
        const status = String(entry?.status || "").trim().toUpperCase();
        if (printType !== "all" && sacramentName !== printType) return false;
        if (printStatus !== "all" && status !== printStatus) return false;
        if (!range) return true;
        const dateKey = toLocalDateKey(getRecordEventDate(entry));
        return Boolean(dateKey) && dateKey >= range.start && dateKey <= range.end;
      }),
      printSort,
    );
    if (rows.length === 0) {
      setPrintModalError("No history records match these choices. Try another period, type, or status.");
      return;
    }
    const generatedAt = new Date().toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    if (printFormat === "excel") {
      const safeName = (priestName || parishName).replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "Priest";
      const periodFileLabel =
        printPeriodMode === "all"
          ? "All-Time"
          : printPeriodMode === "yearly"
            ? String(printYear)
            : `${printYear}-${String(printMonth).padStart(2, "0")}`;
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue("--ff-primary").trim();
      const workbook = buildExcelReportFile({
        summaryLines: [
          parishName,
          "Priest Sacramental History",
          ...(priestName ? [`Priest: ${priestName}`] : []),
          `Period: ${printPeriodLabel}`,
          `Type: ${printTypeLabel}`,
          `Status: ${printStatusLabel}`,
          `Sort: ${printSortLabel}`,
          `Generated: ${generatedAt}`,
          `Records: ${rows.length}`,
        ],
        headers: PRINT_COLUMNS.map((column) => column.label),
        rows: rows.map((row) => PRINT_COLUMNS.map((column) => column.value(row) || "")),
        headerColor: /^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : undefined,
        sheetName: "History",
      });
      downloadTextFile(
        `${safeName}-History-${periodFileLabel}.xls`,
        workbook,
        "application/vnd.ms-excel;charset=utf-8",
      );
      setIsPrintModalOpen(false);
      return;
    }
    setPdfSettings(parseStoredSettings());
    setPrintSnapshot({
      rows,
      periodLabel: printPeriodLabel,
      filterLabel: `${printTypeLabel} · ${printStatusLabel}`,
      generatedAt,
    });
    setPrintRequestId((currentId) => currentId + 1);
    setIsPrintModalOpen(false);
  };

  return (
    <main className="dashboard-layout">
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onSettings={() => navigate("/priest/settings")}
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="priest" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero reports-hero admin-list-hero priest-history-hero">
            <h2>Priest History <PageGuide pageKey="priest-history" /></h2>
          </section>

          <section className="dashboard-panel priest-history-panel">
            <div className="priest-page-toolbar priest-history-toolbar priest-history-toolbar--split" aria-label="Priest history filters">
              <label className="appointment-filter-field">
                <span>Search</span>
                <input
                  type="search"
                  className="appointment-search-input"
                  value={searchQuery}
                  placeholder="Search requester, sacrament, status, or ID"
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <label className="appointment-filter-field">
                <span>Request</span>
                <select
                  className="appointment-filter-select"
                  value={selectedRequestCategory}
                  onChange={(event) => {
                    setSelectedRequestCategory(event.target.value);
                    setSelectedType("all");
                  }}
                >
                  <option value="all">All</option>
                  <option value="appointment">Appointment</option>
                  <option value="special_program">Special Program</option>
                </select>
              </label>
              <label className="appointment-filter-field">
                <span>{selectedRequestCategory === "special_program" ? "Special Program" : selectedRequestCategory === "appointment" ? "Appointment" : "Type"}</span>
                <select
                  className="appointment-filter-select"
                  value={selectedType}
                  onChange={(event) => setSelectedType(event.target.value)}
                >
                  <option value="all">All</option>
                  {(selectedRequestCategory === "appointment"
                    ? appointmentTypeOptions
                    : selectedRequestCategory === "special_program"
                      ? specialProgramTypeOptions
                      : [...new Set([...appointmentTypeOptions, ...specialProgramTypeOptions])].sort((left, right) => left.localeCompare(right))
                  ).map((option) => (
                    <option key={`history-type-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="appointment-filter-field">
                <span>Sort By</span>
                <select
                  className="appointment-filter-select"
                  value={selectedSort}
                  onChange={(event) => setSelectedSort(event.target.value)}
                >
                  {HISTORY_SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="priest-history-summary" role="group" aria-label="Filter history by status">
              <button
                type="button"
                className={selectedStatus === "all" ? "is-active" : ""}
                aria-pressed={selectedStatus === "all"}
                onClick={() => setSelectedStatus("all")}
              >
                <span>All Records</span>
                <strong>{records.length}</strong>
              </button>
              <button
                type="button"
                className={`is-completed${selectedStatus === "COMPLETED" ? " is-active" : ""}`}
                aria-pressed={selectedStatus === "COMPLETED"}
                onClick={() => setSelectedStatus("COMPLETED")}
              >
                <span>Completed</span>
                <strong>{completedCount}</strong>
              </button>
              <button
                type="button"
                className={`is-cancelled${selectedStatus === "CANCELLED" ? " is-active" : ""}`}
                aria-pressed={selectedStatus === "CANCELLED"}
                onClick={() => setSelectedStatus("CANCELLED")}
              >
                <span>Cancelled</span>
                <strong>{cancelledCount}</strong>
              </button>
            </div>

            <div className="view-mode-content-bar">
              {!isLoading && !errorMessage ? (
                <p className="priest-history-result-count">
                  Showing {filteredItems.length} of {records.length} record{records.length === 1 ? "" : "s"}
                </p>
              ) : null}
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>

            {errorMessage ? <p className="priest-dashboard-error">{errorMessage}</p> : null}
            {isLoading ? <p className="priest-page-empty">Loading priest history...</p> : null}
            {!isLoading && !errorMessage && filteredItems.length === 0 ? (
              <p className="priest-history-empty">No historical sacramental records found for the selected filters.</p>
            ) : null}
            {!isLoading && !errorMessage && filteredItems.length > 0 ? (
              <ul className={`priest-history-list${viewMode === "grid" ? " is-grid" : ""}`}>
                {pagedItems.map((entry) => {
                  const dateParts = getDateBlockParts(getRecordEventDate(entry));
                  return (
                    <li
                      key={`history-${entry.appointmentID}`}
                      className={`priest-history-card is-${toStatusClassName(entry.status)}`}
                    >
                      <div className="priest-history-date" aria-hidden="true">
                        {dateParts ? (
                          <>
                            <span>{dateParts.month}</span>
                            <strong>{dateParts.day}</strong>
                            <small>{dateParts.year}</small>
                          </>
                        ) : (
                          <CalendarDays size={22} />
                        )}
                      </div>
                      <div className="priest-history-content">
                        <div className="priest-history-card-head">
                          <div className="priest-history-card-title">
                            <strong>{entry.sacramentName || "Sacramental Activity"}</strong>
                            <small>Appointment No. {entry.appointmentID}</small>
                          </div>
                          <span className={`priest-history-status is-${toStatusClassName(entry.status)}`}>
                            {formatStatusLabel(entry.status)}
                          </span>
                        </div>
                        <div className="priest-history-facts">
                          <p>
                            <span>Requester</span>
                            <strong>{entry.requesterFullName || "Unknown requester"}</strong>
                          </p>
                          <p>
                            <span>Scheduled</span>
                            <strong>{formatDateTimeLabel(entry.scheduledEventDateTime)}</strong>
                          </p>
                          <p>
                            <span>Submitted</span>
                            <strong>{formatDateTimeLabel(entry.createdAt)}</strong>
                          </p>
                        </div>
                        <div className="priest-history-footer">
                          <div className="priest-history-notes">
                            <p>
                              <span>Priest Comments</span>
                              <strong>{entry.priestComments || "None"}</strong>
                            </p>
                            <p>
                              <span>Secretary Note</span>
                              <strong>{entry.note || "None"}</strong>
                            </p>
                          </div>
                          <button
                            type="button"
                            className="priest-history-view"
                            onClick={() => void openDetails(Number(entry.appointmentID))}
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {!isLoading && !errorMessage && filteredItems.length > HISTORY_PAGE_SIZE ? (
              <div className="history-pagination" aria-label="History pagination">
                <button
                  type="button"
                  className="history-pagination-button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
                >
                  Previous
                </button>
                <span className="history-pagination-label">
                  Page {safeCurrentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="history-pagination-button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}
                >
                  Next
                </button>
              </div>
            ) : null}
          </section>

          {printSnapshot ? (
            <section className="reports-preview-panel priest-history-print-panel" aria-hidden="true">
              <article className="reports-print-sheet priest-history-print-sheet">
                <section
                  className={`reports-print-document is-align-${pdfHeaderAlign} is-rule-${pdfHeaderRule} is-density-${pdfDensity} is-table-${pdfTableStyle} is-logo-${pdfLogoShape} is-logo-${pdfLogoBorder}`}
                >
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
                      {pdfSettings.pdfShowAddress !== false && parishBrand.address ? (
                        <p className="reports-print-address">{parishBrand.address}</p>
                      ) : null}
                      <p className="reports-print-subtitle">
                        Sacramental History{priestName ? ` of ${priestName}` : ""} · {printSnapshot.periodLabel}
                      </p>
                    </div>
                  </header>
                  <div className="reports-print-meta">
                    <span>
                      <strong>Filters</strong> {printSnapshot.filterLabel}
                    </span>
                    <span>
                      <strong>Generated</strong> {printSnapshot.generatedAt}
                    </span>
                  </div>
                  <table className="reports-preview-table reports-records-table reports-print-table priest-history-print-table">
                    <thead>
                      <tr>
                        {PRINT_COLUMNS.map((column) => (
                          <th key={column.key} scope="col" className={`is-${column.key}`}>
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {printSnapshot.rows.map((row) => (
                        <tr key={`print-${row.appointmentID}`}>
                          {PRINT_COLUMNS.map((column) => {
                            const cellValue = column.value(row);
                            return (
                              <td key={column.key} className={`is-${column.key}`}>
                                {column.pill ? (
                                  <span className={`reports-status-pill is-${String(cellValue || "").toLowerCase()}`}>
                                    {cellValue}
                                  </span>
                                ) : (
                                  cellValue
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="reports-print-total">
                        <td colSpan={PRINT_COLUMNS.length}>
                          Total: {printSnapshot.rows.length} {printSnapshot.rows.length === 1 ? "record" : "records"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {pdfSettings.pdfShowFooter !== false ? (
                    <footer className="reports-print-footer">
                      <span>
                        {pdfSettings.pdfFooterNote || "Prepared through Faithflow"}
                        {priestName ? ` • ${priestName}` : ""}
                      </span>
                      {pdfSettings.pdfShowParishName !== false ? <span>{parishName}</span> : null}
                    </footer>
                  ) : null}
                </section>
              </article>
            </section>
          ) : null}
        </section>
      </div>
      {isPrintModalOpen ? (
        <div className="priest-details-modal-overlay priest-print-overlay" role="presentation" onClick={closePrintModal}>
          <section
            className="priest-details-modal priest-print-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="priest-print-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="priest-details-modal-header">
              <div>
                <h3 id="priest-print-title">Print history</h3>
                <p>Choose the records and the file to create.</p>
              </div>
              <button
                type="button"
                className="priest-details-modal-close"
                onClick={closePrintModal}
                aria-label="Close print options"
              >
                <X size={18} />
              </button>
            </header>
            <div className="priest-print-body">
              <div className="priest-print-form">
                <label className="priest-print-field is-wide">
                  <span>Sacramental type</span>
                  <select value={printType} onChange={(event) => setPrintType(event.target.value)}>
                    <option value="all">All types</option>
                    {sacramentOptions.map((option) => (
                      <option key={`print-type-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="priest-print-field">
                  <span>Status</span>
                  <select value={printStatus} onChange={(event) => setPrintStatus(event.target.value)}>
                    <option value="all">All statuses</option>
                    {HISTORY_STATUS_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="priest-print-field">
                  <span>Period</span>
                  <select value={printPeriodMode} onChange={(event) => setPrintPeriodMode(event.target.value)}>
                    {PRINT_PERIOD_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {printPeriodMode !== "all" ? (
                  <label className="priest-print-field">
                    <span>Year</span>
                    <select value={printYear} onChange={(event) => setPrintYear(Number(event.target.value))}>
                      {printYearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {printPeriodMode === "monthly" ? (
                  <label className="priest-print-field">
                    <span>Month</span>
                    <select value={printMonth} onChange={(event) => setPrintMonth(Number(event.target.value))}>
                      {MONTH_OPTIONS.map((month) => (
                        <option key={month.id} value={month.id}>
                          {month.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className={`priest-print-field${printPeriodMode === "monthly" ? "" : " is-wide"}`}>
                  <span>Sort</span>
                  <select value={printSort} onChange={(event) => setPrintSort(event.target.value)}>
                    {HISTORY_SORT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="reports-print-file-type">
                  <legend>File type</legend>
                  <div className="reports-print-file-type-options">
                    <label className={`reports-print-radio${printFormat === "pdf" ? " is-active" : ""}`}>
                      <input
                        type="radio"
                        name="priest-history-file-type"
                        value="pdf"
                        checked={printFormat === "pdf"}
                        onChange={() => setPrintFormat("pdf")}
                      />
                      PDF
                    </label>
                    <label className={`reports-print-radio${printFormat === "excel" ? " is-active" : ""}`}>
                      <input
                        type="radio"
                        name="priest-history-file-type"
                        value="excel"
                        checked={printFormat === "excel"}
                        onChange={() => setPrintFormat("excel")}
                      />
                      Excel
                    </label>
                  </div>
                </fieldset>
              </div>
              <p className="priest-print-summary">
                {printFormat === "excel" ? "Excel" : "PDF"} · {printTypeLabel} · {printStatusLabel} · {printPeriodLabel}
              </p>
              {printModalError ? (
                <p className="priest-print-error" role="alert">
                  {printModalError}
                </p>
              ) : null}
            </div>
            <div className="priest-print-footer">
              <button type="button" className="priest-print-secondary" onClick={closePrintModal}>
                Cancel
              </button>
              <button type="button" className="priest-print-primary" onClick={handleConfirmPrint}>
                <Printer size={16} aria-hidden="true" />
                {printFormat === "excel" ? "Download Excel" : "Print PDF"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isLoadingDetails ? (
        <div className="priest-details-modal-overlay" role="presentation">
          <section className="priest-details-modal priest-details-modal--message" role="dialog" aria-modal="true" aria-label="Loading appointment details">
            <p className="priest-page-empty">Loading appointment details...</p>
          </section>
        </div>
      ) : null}
      {detailsError ? (
        <div className="priest-details-modal-overlay" role="presentation" onClick={() => setDetailsError("")}>
          <section className="priest-details-modal priest-details-modal--message" role="dialog" aria-modal="true" aria-label="Appointment details error" onClick={(event) => event.stopPropagation()}>
            <p className="priest-dashboard-error">{detailsError}</p>
            <div className="priest-page-actions">
              <button type="button" className="priest-page-view-button" onClick={() => setDetailsError("")}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {selectedDetails ? (
        <div className="priest-details-modal-overlay" role="presentation" onClick={() => setSelectedDetails(null)}>
          <section className="priest-details-modal" role="dialog" aria-modal="true" aria-label="Priest history details" onClick={(event) => event.stopPropagation()}>
            <header className="priest-details-modal-header">
              <div>
                <h3>Sacramental Event Details</h3>
                <p>Appointment ID #{selectedDetails.appointmentID}</p>
              </div>
              <button
                type="button"
                className="priest-details-modal-close"
                onClick={() => setSelectedDetails(null)}
                aria-label="Close details"
              >
                <X size={18} />
              </button>
            </header>
            <div className="priest-details-modal-grid">
              {selectedDetailRows.map((detail) => (
                <p key={`${detail.label}-${detail.value}`}>
                  <span>{detail.label}</span>
                  <strong>{detail.value}</strong>
                </p>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default PriestHistoryPage;
