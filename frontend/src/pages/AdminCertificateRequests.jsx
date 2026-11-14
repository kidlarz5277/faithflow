import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Droplets, FileText, Handshake, Inbox, Pencil, Receipt, Search, X } from "lucide-react";
import PageGuide from "../components/PageGuide";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { pushUiNotice } from "../utils/uiNotice";
import {
  buildParishAppointmentScheduleSlots,
  formatCertificatePickupLabel,
  getManilaDateKey,
  getManilaMinutesNow,
  timeStringToMinutes,
  to12HourTime,
  toDateKey,
} from "../utils/parishSchedule";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";
import "./AdminCertificateRequests.css";

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

const STATUS_LABEL_BY_KEY = {
  pending: "Pending",
  approved: "Approved",
  cancelled: "Declined",
};

const STATUS_FILTERS = [
  { key: "pending", label: "Pending", className: "is-pending" },
  { key: "approved", label: "Approved", className: "is-completed" },
  { key: "cancelled", label: "Declined", className: "is-trash" },
];

const CERTIFICATE_PICKUP_SLOTS = buildParishAppointmentScheduleSlots();
const CERTIFICATE_CALENDAR_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getTodayDateKey = () => getManilaDateKey();

const isPickupSlotPassedToday = (dateKey, startTime) => {
  if (String(dateKey || "") !== getTodayDateKey()) return false;
  const slotMinutes = timeStringToMinutes(startTime);
  return slotMinutes !== null && slotMinutes <= getManilaMinutesNow();
};

const DECLINE_REASON_OPTIONS = [
  "Not met requirements",
  "Wrong file attached",
  "Incomplete information",
  "Duplicate request",
  "Other reason",
];

const getCertificateIcon = (certificateType) => {
  if (certificateType === "Marriage Certificate") return <Handshake size={20} />;
  if (certificateType === "Baptismal Certificate") return <Droplets size={20} />;
  return <FileText size={20} />;
};

const INTERNAL_DETAIL_KEYS = new Set(["userID", "adminID"]);
const HIDDEN_REQUESTER_DETAIL_KEYS = new Set(["address"]);

const shouldShowRequesterDetail = (rawKey) => {
  const normalizedKey = String(rawKey || "").trim().toLowerCase();
  if (!normalizedKey) return false;
  if (INTERNAL_DETAIL_KEYS.has(String(rawKey))) return false;
  if (HIDDEN_REQUESTER_DETAIL_KEYS.has(normalizedKey)) return false;
  if (normalizedKey === "fullname") return false;
  return true;
};

const toReadableLabel = (rawKey) =>
  String(rawKey || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const toTitleCaseValue = (rawValue) => {
  const normalized = String(rawValue || "").trim();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized;
  if (/^[\d\s()+\-./:]+$/.test(normalized)) return normalized;
  return normalized
    .toLowerCase()
    .replace(/\b([a-z])/g, (char) => char.toUpperCase());
};

const formatLongDate = (rawValue) => {
  const normalized = String(rawValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const [year, month, day] = normalized.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return normalized;
  }
  return parsedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatDetailValue = (key, value) => {
  if (value === undefined || value === null) return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => toTitleCaseValue(item)).join(", ") : "Not provided";
  }
  if (typeof value === "object") {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" ? serialized : "Not provided";
  }
  const normalized = String(value).trim();
  if (!normalized) return "Not provided";

  const normalizedKey = String(key || "").trim().toLowerCase();
  if (normalizedKey.includes("date")) {
    return formatLongDate(normalized);
  }

  return toTitleCaseValue(normalized);
};

const formatPickupSlotParts = (startTime, endTime) => {
  const startLabel = String(to12HourTime(startTime) || "").trim();
  const endLabel = String(to12HourTime(endTime) || "").trim();
  const startMatch = startLabel.match(/^(.+?)\s+(AM|PM)$/i);
  const endMatch = endLabel.match(/^(.+?)\s+(AM|PM)$/i);
  if (startMatch && endMatch && startMatch[2].toUpperCase() === endMatch[2].toUpperCase()) {
    return {
      primary: `${startMatch[1]} – ${endMatch[1]}`,
      period: endMatch[2].toUpperCase(),
    };
  }
  return {
    primary: startLabel && endLabel ? `${startLabel} – ${endLabel}` : startLabel || endLabel,
    period: "",
  };
};

const OFFICE_WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const getDateKeyWeekday = (dateKey) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return null;
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }
  return parsedDate.getDay();
};

const isOfficeDayOffDate = (dateKey, dayOffWeekday, dayOffSpecificDates) => {
  if (Array.isArray(dayOffSpecificDates) && dayOffSpecificDates.includes(dateKey)) return true;
  const weekday = getDateKeyWeekday(dateKey);
  return Number.isInteger(dayOffWeekday) && Number.isInteger(weekday) && dayOffWeekday === weekday;
};

const getNextOpenPickupDateKey = (fromDate, dayOffWeekday, dayOffSpecificDates) => {
  const cursor = fromDate instanceof Date ? new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()) : new Date();
  for (let offset = 0; offset < 21; offset += 1) {
    const dateKey = toDateKey(cursor);
    if (!isOfficeDayOffDate(dateKey, dayOffWeekday, dayOffSpecificDates)) return dateKey;
    cursor.setDate(cursor.getDate() + 1);
  }
  return toDateKey(fromDate instanceof Date ? fromDate : new Date());
};

const REQUESTS_PER_PAGE = 5;

function AdminCertificateRequests() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");
  const [managedCertificateTypes, setManagedCertificateTypes] = useState([]);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("pending");
  const [sortByDate, setSortByDate] = useState("newest");
  const [selectedRequestForDetails, setSelectedRequestForDetails] = useState(null);
  const [actionStateByRequestId, setActionStateByRequestId] = useState({});
  const [approveModalState, setApproveModalState] = useState({
    isOpen: false,
    request: null,
    pickupDate: "",
    pickupTime: "",
    pickupEndTime: "",
    calendarMonth: new Date(),
    error: "",
  });
  const [declineModalState, setDeclineModalState] = useState({
    isOpen: false,
    request: null,
    selectedReason: DECLINE_REASON_OPTIONS[0],
    customReason: "",
    error: "",
  });
  const [claimModalState, setClaimModalState] = useState({
    isOpen: false,
    request: null,
    receiptNumber: "",
    error: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRestoreRequest, setSelectedRestoreRequest] = useState(null);
  const [dayOffWeekday, setDayOffWeekday] = useState(null);
  const [dayOffSpecificDates, setDayOffSpecificDates] = useState([]);

  const authRaw =
    typeof window !== "undefined"
      ? localStorage.getItem("faithflow_auth") || sessionStorage.getItem("faithflow_auth")
      : null;
  const authData = useMemo(() => {
    if (!authRaw) return null;
    try {
      return JSON.parse(authRaw);
    } catch {
      return null;
    }
  }, [authRaw]);

  const user = authData?.user;
  const accountType = authData?.accountType;
  const adminID = Number(user?.adminID);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const selectedStatusLabel = STATUS_LABEL_BY_KEY[selectedStatusFilter] || "Certificate";

  useEffect(() => {
    document.title = "Faithflow - Certificate Requests";
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const certID = Number(params.get("certID") || params.get("id"));
    const nextFilter = String(location.state?.statusFilter || params.get("status") || "").trim().toLowerCase();
    const hasCertDeepLink = Number.isInteger(certID) && certID > 0;
    if (STATUS_LABEL_BY_KEY[nextFilter]) {
      setSelectedStatusFilter(nextFilter);
    }
    if (hasCertDeepLink) {
      if (requests.length === 0) return;
      const match = requests.find((item) => Number(item.id) === certID);
      if (match) {
        const statusKey = String(match.status || "").trim().toLowerCase();
        if (STATUS_LABEL_BY_KEY[statusKey]) {
          setSelectedStatusFilter(statusKey);
        }
        setSelectedTypeFilter("all");
        setSelectedRequestForDetails(match);
      }
    }
    if (!hasCertDeepLink && !STATUS_LABEL_BY_KEY[nextFilter]) return;
    if (hasCertDeepLink && requests.length === 0) return;
    if (location.search || location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate, requests]);

  useEffect(() => {
    if (!STATUS_LABEL_BY_KEY[selectedStatusFilter]) {
      setSelectedStatusFilter("pending");
    }
  }, [selectedStatusFilter]);

  useEffect(() => {
    if (!authData) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, authData, accountType]);

  const loadCertificateRequests = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoadingRequests(true);
    }
    setRequestsError("");
    try {
      const response = await fetch("/admin-api/certificate-requests");
      const responseData = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load certificate requests.");
      }

      const rows = Array.isArray(responseData) ? responseData : [];
      const normalizedRows = rows.map((item) => ({
        ...item,
        certificateType: String(item?.certificateType || "").trim() || "Certificate Request",
        status: String(item?.status || "Pending").trim(),
        details:
          item?.details && typeof item.details === "object" && !Array.isArray(item.details) ? item.details : {},
      })).filter((item) => String(item.status || "").trim().toLowerCase() !== "completed");

      setRequests(normalizedRows);
    } catch (error) {
      if (!silent) {
        setRequests([]);
      }
      setRequestsError(error.message || "Unable to load certificate requests.");
    } finally {
      if (!silent) {
        setIsLoadingRequests(false);
      }
    }
  }, []);

  const loadOfficeDayOffs = useCallback(async () => {
    const resolvedAdminID = Number.isInteger(adminID) && adminID > 0 ? adminID : 1;
    try {
      const response = await fetch(`/admin-api/day-offs?adminID=${resolvedAdminID}`);
      const responseData = await response.json().catch(() => null);
      if (!response.ok) return;
      const weekdayRaw = responseData?.weekday;
      const parsedWeekday =
        weekdayRaw === null || weekdayRaw === undefined || weekdayRaw === "" ? null : Number(weekdayRaw);
      setDayOffWeekday(Number.isInteger(parsedWeekday) && parsedWeekday >= 0 && parsedWeekday <= 6 ? parsedWeekday : null);
      setDayOffSpecificDates(
        Array.isArray(responseData?.specificDates)
          ? responseData.specificDates
              .map((item) => String(item?.date || "").trim())
              .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
          : [],
      );
    } catch {
      setDayOffWeekday(null);
      setDayOffSpecificDates([]);
    }
  }, [adminID]);

  useEffect(() => {
    if (accountType !== "admin") return;
    loadCertificateRequests();
    void loadOfficeDayOffs();
  }, [accountType, loadCertificateRequests, loadOfficeDayOffs]);

  useEffect(() => {
    if (accountType !== "admin") return undefined;

    const pollInterval = window.setInterval(() => {
      if (document.hidden) return;
      loadCertificateRequests({ silent: true });
    }, 60000);

    const handleFocusRefresh = () => {
      loadCertificateRequests({ silent: true });
      void loadOfficeDayOffs();
    };
    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        loadCertificateRequests({ silent: true });
        void loadOfficeDayOffs();
      }
    };

    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    return () => {
      window.clearInterval(pollInterval);
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [accountType, loadCertificateRequests, loadOfficeDayOffs]);

  useEffect(() => {
    if (!approveModalState.isOpen) return;
    if (!isOfficeDayOffDate(approveModalState.pickupDate, dayOffWeekday, dayOffSpecificDates)) return;
    const nextOpenDateKey = getNextOpenPickupDateKey(new Date(), dayOffWeekday, dayOffSpecificDates);
    const [year, month] = nextOpenDateKey.split("-").map(Number);
    setApproveModalState((current) => ({
      ...current,
      pickupDate: nextOpenDateKey,
      pickupTime: "",
      pickupEndTime: "",
      calendarMonth: new Date(year, month - 1, 1),
    }));
  }, [approveModalState.isOpen, approveModalState.pickupDate, dayOffSpecificDates, dayOffWeekday]);

  useEffect(() => {
    if (accountType !== "admin") return undefined;
    let cancelled = false;
    const loadManagedTypes = async () => {
      try {
        const response = await fetch("/admin-api/certificate-types");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        const labels = (Array.isArray(payload?.items) ? payload.items : [])
          .map((item) => String(item?.label || item?.certTypeName || "").trim())
          .filter(Boolean);
        setManagedCertificateTypes([...new Set(labels)]);
      } catch {
        if (!cancelled) setManagedCertificateTypes([]);
      }
    };
    void loadManagedTypes();
    return () => {
      cancelled = true;
    };
  }, [accountType]);

  const typeFilterOptions = useMemo(() => {
    const requestTypes = requests.map((item) => String(item.certificateType || "").trim()).filter(Boolean);
    return [...new Set([...managedCertificateTypes, ...requestTypes])].sort((left, right) => left.localeCompare(right));
  }, [managedCertificateTypes, requests]);

  const statusCounts = useMemo(
    () =>
      requests.reduce(
        (accumulator, item) => {
          const status = String(item.status || "").trim().toLowerCase();
          if (status === "pending") accumulator.pending += 1;
          else if (status === "approved") accumulator.approved += 1;
          else if (status === "cancelled" || status === "canceled") accumulator.cancelled += 1;
          return accumulator;
        },
        { pending: 0, approved: 0, cancelled: 0 },
      ),
    [requests],
  );

  const formatStatusBadgeCount = (count) => (count > 99 ? "99+" : String(count));

  const requestsForCurrentStatus = useMemo(
    () => requests.filter((item) => String(item.status || "").trim().toLowerCase() === selectedStatusFilter),
    [requests, selectedStatusFilter],
  );

  const filteredRequests = useMemo(() => {
    const matching = requestsForCurrentStatus.filter((item) => {
      if (selectedTypeFilter !== "all" && item.certificateType !== selectedTypeFilter) return false;
      if (!normalizedSearch) return true;
      const searchableText = [
        item.fullName,
        item.contactNumber,
        item.certificateType,
        item.status,
      ]
        .join(" ")
        .toLowerCase();
      return searchableText.includes(normalizedSearch);
    });

    return matching.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (Number.isNaN(timeA) && Number.isNaN(timeB)) return 0;
      if (Number.isNaN(timeA)) return 1;
      if (Number.isNaN(timeB)) return -1;
      return sortByDate === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [requestsForCurrentStatus, selectedTypeFilter, normalizedSearch, sortByDate]);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRequests.length / REQUESTS_PER_PAGE)),
    [filteredRequests.length],
  );
  const pagedFilteredRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * REQUESTS_PER_PAGE;
    return filteredRequests.slice(startIndex, startIndex + REQUESTS_PER_PAGE);
  }, [filteredRequests, currentPage]);

  useEffect(() => {
    if (selectedTypeFilter === "all") return;
    if (!typeFilterOptions.includes(selectedTypeFilter)) {
      setSelectedTypeFilter("all");
    }
  }, [typeFilterOptions, selectedTypeFilter]);
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatusFilter, selectedTypeFilter, searchQuery, sortByDate]);
  useEffect(() => {
    if (!selectedRequestForDetails) return;
    const index = filteredRequests.findIndex((item) => Number(item.id) === Number(selectedRequestForDetails.id));
    if (index < 0) return;
    setCurrentPage(Math.floor(index / REQUESTS_PER_PAGE) + 1);
  }, [filteredRequests, selectedRequestForDetails]);
  useEffect(() => {
    setCurrentPage((activePage) => Math.min(activePage, totalPages));
  }, [totalPages]);

  if (!user || accountType !== "admin") return null;

  const pickupCalendarMonth =
    approveModalState.calendarMonth instanceof Date ? approveModalState.calendarMonth : new Date();
  const pickupCalendarMonthLabel = pickupCalendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const pickupCalendarFirstDayIndex = new Date(
    pickupCalendarMonth.getFullYear(),
    pickupCalendarMonth.getMonth(),
    1,
  ).getDay();
  const pickupCalendarDaysInMonth = new Date(
    pickupCalendarMonth.getFullYear(),
    pickupCalendarMonth.getMonth() + 1,
    0,
  ).getDate();
  const todayDateKey = getTodayDateKey();
  const pickupCalendarToday = new Date();
  const canGoToPreviousPickupMonth =
    pickupCalendarMonth.getFullYear() > pickupCalendarToday.getFullYear() ||
    (pickupCalendarMonth.getFullYear() === pickupCalendarToday.getFullYear() &&
      pickupCalendarMonth.getMonth() > pickupCalendarToday.getMonth());
  const selectedPickupLabel = formatCertificatePickupLabel(
    approveModalState.pickupDate,
    approveModalState.pickupTime,
    approveModalState.pickupEndTime,
  );
  const pickupRequest = approveModalState.request;
  const pickupRequesterName = toTitleCaseValue(pickupRequest?.fullName || "Unknown requester");
  const pickupCertificateType = String(pickupRequest?.certificateType || "Certificate").trim() || "Certificate";
  const canSubmitPickup = Boolean(
    approveModalState.pickupDate &&
      approveModalState.pickupTime &&
      approveModalState.pickupEndTime &&
      !isOfficeDayOffDate(approveModalState.pickupDate, dayOffWeekday, dayOffSpecificDates),
  );
  const isApprovingPickup = actionStateByRequestId[Number(pickupRequest?.id)] === "approve";
  const officeDayOffLabel = Number.isInteger(dayOffWeekday) ? OFFICE_WEEKDAY_LABELS[dayOffWeekday] : "";
  const isSelectedPickupDayOff = isOfficeDayOffDate(
    approveModalState.pickupDate,
    dayOffWeekday,
    dayOffSpecificDates,
  );

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleApprove = async (requestId, { pickupDate, pickupTime, pickupEndTime } = {}) => {
    const response = await fetch(`/admin-api/certificate-requests/${requestId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "approved",
        pickupDate,
        pickupTime,
        pickupEndTime,
      }),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseData.message || "Unable to approve certificate request.");
    }
    await loadCertificateRequests();
  };

  const handleDecline = async (request, { declineReason } = {}) => {
    const response = await fetch(`/admin-api/certificate-requests/${request.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "cancelled",
        declineReason,
      }),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseData.message || "Unable to decline certificate request.");
    }
    await loadCertificateRequests();
  };

  const handleRestore = async (request) => {
    const response = await fetch(`/admin-api/certificate-requests/${request.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "pending",
        confirmRestore: true,
      }),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseData.message || "Unable to restore certificate request.");
    }
    await loadCertificateRequests();
  };

  const handleClaimCompleted = async (request, { receiptNumber } = {}) => {
    const response = await fetch(`/admin-api/certificate-requests/${request.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "completed",
        receiptNumber,
      }),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseData.message || "Unable to mark certificate request as claimed.");
    }
    await loadCertificateRequests();
  };

  const runRequestAction = async (request, actionType, options = {}) => {
    const requestId = Number(request?.id);
    if (!Number.isInteger(requestId) || requestId <= 0) return false;
    setRequestsError("");
    setActionStateByRequestId((current) => ({
      ...current,
      [requestId]: actionType,
    }));
    try {
      if (actionType === "approve") {
        await handleApprove(requestId, options);
      } else if (actionType === "claim") {
        await handleClaimCompleted(request, options);
      } else if (actionType === "restore") {
        await handleRestore(request);
      } else {
        await handleDecline(request, options);
      }
      pushUiNotice(
        actionType === "approve"
          ? "Certificate request approved."
            : actionType === "claim"
              ? "Certificate pickup recorded. It was moved to Reports and History."
            : actionType === "restore"
              ? "Certificate request restored to pending."
              : "Certificate request declined.",
      );
      return true;
    } catch (error) {
      const message = error.message || "Unable to update certificate request.";
      setRequestsError(message);
      if (actionType === "approve") {
        setApproveModalState((current) => ({ ...current, error: message }));
      }
      return false;
    } finally {
      setActionStateByRequestId((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
    }
  };

  const openApproveModal = (request) => {
    const today = new Date();
    const nextOpenDateKey = getNextOpenPickupDateKey(today, dayOffWeekday, dayOffSpecificDates);
    const [year, month] = nextOpenDateKey.split("-").map(Number);
    void loadOfficeDayOffs();
    setApproveModalState({
      isOpen: true,
      request,
      pickupDate: nextOpenDateKey,
      pickupTime: "",
      pickupEndTime: "",
      calendarMonth: new Date(year, month - 1, 1),
      error: "",
    });
  };

  const closeApproveModal = () => {
    setApproveModalState({
      isOpen: false,
      request: null,
      pickupDate: "",
      pickupTime: "",
      pickupEndTime: "",
      calendarMonth: new Date(),
      error: "",
    });
  };

  const submitApproveModal = async () => {
    const request = approveModalState.request;
    const requestId = Number(request?.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      setApproveModalState((current) => ({
        ...current,
        error: "Invalid certificate request.",
      }));
      return;
    }
    const pickupDate = String(approveModalState.pickupDate || "").trim();
    const pickupTime = String(approveModalState.pickupTime || "").trim();
    const pickupEndTime = String(approveModalState.pickupEndTime || "").trim();
    if (!pickupDate) {
      setApproveModalState((current) => ({
        ...current,
        error: "Choose a pickup date from the calendar.",
      }));
      return;
    }
    if (isOfficeDayOffDate(pickupDate, dayOffWeekday, dayOffSpecificDates)) {
      setApproveModalState((current) => ({
        ...current,
        error: Number.isInteger(dayOffWeekday)
          ? `Office is closed on ${OFFICE_WEEKDAY_LABELS[dayOffWeekday]}s. Choose another pickup day.`
          : "Office is closed on that date. Choose another pickup day.",
      }));
      return;
    }
    if (!pickupTime || !pickupEndTime) {
      setApproveModalState((current) => ({
        ...current,
        error: "Choose a pickup time slot.",
      }));
      return;
    }
    const didApprove = await runRequestAction(request, "approve", { pickupDate, pickupTime, pickupEndTime });
    if (didApprove) {
      closeApproveModal();
    }
  };
  const openDeclineModal = (request) => {
    setDeclineModalState({
      isOpen: true,
      request,
      selectedReason: DECLINE_REASON_OPTIONS[0],
      customReason: "",
      error: "",
    });
  };
  const closeDeclineModal = () => {
    setDeclineModalState({
      isOpen: false,
      request: null,
      selectedReason: DECLINE_REASON_OPTIONS[0],
      customReason: "",
      error: "",
    });
  };
  const submitDeclineModal = async () => {
    const request = declineModalState.request;
    const requestId = Number(request?.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      setDeclineModalState((current) => ({
        ...current,
        error: "Invalid certificate request.",
      }));
      return;
    }
    const selectedReason = String(declineModalState.selectedReason || "").trim();
    const customReason = String(declineModalState.customReason || "").trim();
    if (!selectedReason) {
      setDeclineModalState((current) => ({
        ...current,
        error: "Please select a reason for declining.",
      }));
      return;
    }
    if (selectedReason === "Other reason" && !customReason) {
      setDeclineModalState((current) => ({
        ...current,
        error: "Please enter the specific reason.",
      }));
      return;
    }
    const declineReason = selectedReason === "Other reason" ? customReason : selectedReason;
    const didDecline = await runRequestAction(request, "decline", { declineReason });
    if (didDecline) {
      closeDeclineModal();
    }
  };

  const openClaimModal = (request) => {
    setClaimModalState({
      isOpen: true,
      request,
      receiptNumber: "",
      error: "",
    });
  };

  const closeClaimModal = () => {
    setClaimModalState({
      isOpen: false,
      request: null,
      receiptNumber: "",
      error: "",
    });
  };

  const submitClaimModal = async () => {
    const request = claimModalState.request;
    const requestId = Number(request?.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      setClaimModalState((current) => ({
        ...current,
        error: "Invalid certificate request.",
      }));
      return;
    }
    const receiptNumber = String(claimModalState.receiptNumber || "").trim();
    if (!receiptNumber) {
      setClaimModalState((current) => ({
        ...current,
        error: "Invoice or receipt number is required.",
      }));
      return;
    }
    const didClaim = await runRequestAction(request, "claim", { receiptNumber });
    if (didClaim) {
      closeClaimModal();
      setSelectedRequestForDetails(null);
      setSelectedStatusFilter("approved");
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
          <section className="dashboard-panel dashboard-hero admin-list-hero">
            <div className="certificate-hero-row">
              <div className="certificate-hero-copy">
                <h2>{selectedStatusLabel} Certificate Requests <PageGuide pageKey="certificate-requests" /></h2>
              </div>
              <button
                type="button"
                className="certificate-hero-action"
                onClick={() => navigate("/admin/certificate-types")}
              >
                <Pencil size={16} aria-hidden="true" />
                Edit Certificate Types
              </button>
            </div>
          </section>

          <section className="dashboard-panel appointment-requests-panel certificate-requests-panel">
            <div className="certificate-status-toolbar" aria-label="Request status filters" role="tablist">
              <span className="certificate-status-toolbar-label">Status</span>
              <div className="certificate-status-actions">
                {STATUS_FILTERS.map((filter) => {
                  const isSelected = selectedStatusFilter === filter.key;
                  const count = Number(statusCounts[filter.key] || 0);
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      role="tab"
                      className={`certificate-header-action ${filter.className} ${isSelected ? "is-active" : ""}`.trim()}
                      onClick={() => setSelectedStatusFilter(filter.key)}
                      aria-selected={isSelected}
                      aria-pressed={isSelected}
                      aria-label={count > 0 ? `${filter.label}, ${count} requests` : filter.label}
                    >
                      {filter.label}
                      {count > 0 ? (
                        <span className="certificate-status-badge" aria-hidden="true">
                          {formatStatusBadgeCount(count)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="appointment-search-row" aria-label="Search and sort certificate requests">
              <label className="appointment-filter-field certificate-search-field">
                <span className="sr-only">Search certificate requests</span>
                <span className="certificate-search-icon" aria-hidden="true">
                  <Search size={16} />
                </span>
                <input
                  type="search"
                  className="appointment-search-input"
                  placeholder="Search requester, certificate type, or status"
                  aria-label="Search certificate requests"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <label className="appointment-filter-field appointment-sort-field">
                <span className="sr-only">Filter by type</span>
                <select
                  className="appointment-filter-select"
                  value={selectedTypeFilter}
                  onChange={(event) => setSelectedTypeFilter(event.target.value)}
                >
                  <option value="all">Types</option>
                  {typeFilterOptions.map((typeLabel) => (
                    <option key={typeLabel} value={typeLabel}>
                      {typeLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="appointment-filter-field appointment-sort-field">
                <span className="sr-only">Sort by date</span>
                <select
                  className="appointment-filter-select"
                  value={sortByDate}
                  onChange={(event) => setSortByDate(event.target.value)}
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </label>
            </div>

            {requestsError ? (
              <p className="appointment-requests-empty">{requestsError}</p>
            ) : isLoadingRequests ? (
              <p className="appointment-requests-empty">Loading certificate requests...</p>
            ) : requestsForCurrentStatus.length === 0 ? (
              <div className="appointment-requests-empty-state" role="status">
                <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">
                  {selectedStatusFilter === "approved"
                    ? "No approved certificate requests yet"
                    : selectedStatusFilter === "cancelled"
                      ? "No declined certificate requests yet"
                      : "No certificate requests yet"}
                </h3>
                <p className="appointment-requests-empty-state-text">
                  {selectedStatusFilter === "approved"
                    ? "Accepted and onsite requests stay here until the certificate is released, then they move to Reports and History."
                    : selectedStatusFilter === "cancelled"
                      ? "Declined certificate requests will appear here. You can restore them back to pending."
                      : "Certificate requests will appear here once they are submitted."}
                </p>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="appointment-requests-empty-state appointment-requests-empty-state--search" role="status">
                <div className="appointment-requests-empty-state-icon appointment-requests-empty-state-icon--muted" aria-hidden="true">
                  <Search size={34} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No matching requests</h3>
                <p className="appointment-requests-empty-state-text">Try a different search term or filter.</p>
              </div>
            ) : (
              <>
                <ul className="appointment-request-list">
                  {pagedFilteredRequests.map((request) => (
                  <li
                    key={`certificate-request-${request.id}`}
                    className={`appointment-request-item is-certificate${Number(selectedRequestForDetails?.id) === Number(request.id) ? " is-selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedRequestForDetails(request)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedRequestForDetails(request);
                      }
                    }}
                  >
                    <span className="appointment-request-icon certificate-card-block">
                      <span className="certificate-card-block-glyph">{getCertificateIcon(request.certificateType)}</span>
                      {(() => {
                        const blockDate = request.createdAt ? new Date(request.createdAt) : null;
                        if (!blockDate || Number.isNaN(blockDate.getTime())) return null;
                        return (
                          <span className="certificate-card-block-date" aria-hidden="true">
                            <span>{blockDate.toLocaleString("en-US", { month: "short" })}</span>
                            <strong>{blockDate.getDate()}</strong>
                            <small>{blockDate.getFullYear()}</small>
                          </span>
                        );
                      })()}
                    </span>
                    <div className="appointment-request-details">
                      <div className="appointment-request-top">
                        <strong>{request.fullName || "Unknown Requester"}</strong>
                      </div>
                      <div className="appointment-request-badges">
                        <span className="appointment-badge appointment-type-badge">Certificate Request</span>
                        <span className="appointment-badge appointment-category-badge">{request.certificateType}</span>
                        {String(request.requestSource || "").trim().toLowerCase() === "onsite" ? (
                          <span className="appointment-badge appointment-category-badge">Onsite</span>
                        ) : null}
                      </div>
                      <p className="appointment-request-row">
                        <span>Submitted by:</span>{" "}
                        {request.submittedByName || "Not linked"}
                        {request.userID ? ` · User ID ${request.userID}` : ""}
                      </p>
                      <p className="appointment-request-row">
                        <span>Requested at:</span>{" "}
                        {(() => {
                          const requestedDate = request.createdAt ? new Date(request.createdAt) : null;
                          return requestedDate && !Number.isNaN(requestedDate.getTime())
                            ? requestedDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                            : formatDateTime(request.createdAt);
                        })()}
                      </p>
                      {String(request.status || "").trim().toLowerCase() === "cancelled" && request.declineReason ? (
                        <p className="appointment-request-row">
                          <span>Reason:</span> {request.declineReason}
                        </p>
                      ) : null}
                      {["approved", "completed"].includes(String(request.status || "").trim().toLowerCase()) &&
                      (request.pickupSchedule || request.pickupDate) ? (
                        <p className="appointment-request-row">
                          <span>Pickup:</span>{" "}
                          {request.pickupSchedule ||
                            formatCertificatePickupLabel(request.pickupDate, request.pickupTime, request.pickupEndTime)}
                        </p>
                      ) : null}
                    </div>
                    <div className="appointment-request-actions">
                      {(() => {
                        const requestId = Number(request.id);
                        const rowActionState = Number.isInteger(requestId) ? actionStateByRequestId[requestId] : "";
                        const isRowProcessing = Boolean(rowActionState);
                        const normalizedStatus = String(request.status || "").trim().toLowerCase();
                        const isPendingRequest = normalizedStatus === "pending";
                        const isOnsiteRequest = String(request.requestSource || "").trim().toLowerCase() === "onsite";
                        const isDeclinedRequest = normalizedStatus === "cancelled" || normalizedStatus === "canceled";
                        return (
                          <>
                            {isPendingRequest && !isOnsiteRequest ? (
                              <>
                                <button
                                  type="button"
                                  className="approve-button"
                                  disabled={isRowProcessing}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openApproveModal(request);
                                  }}
                                >
                                  {isRowProcessing && rowActionState === "approve" ? "Accepting..." : "Accept"}
                                </button>
                                <button
                                  type="button"
                                  className="decline-button"
                                  disabled={isRowProcessing}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openDeclineModal(request);
                                  }}
                                >
                                  {isRowProcessing && rowActionState === "decline" ? "Declining..." : "Decline"}
                                </button>
                              </>
                            ) : isDeclinedRequest ? (
                              <button
                                type="button"
                                className="restore-button"
                                disabled={isRowProcessing}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedRestoreRequest(request);
                                }}
                              >
                                {isRowProcessing && rowActionState === "restore" ? "Restoring..." : "Restore"}
                              </button>
                            ) : (
                              <span className="appointment-badge appointment-type-badge">
                                {STATUS_LABEL_BY_KEY[normalizedStatus] || "Processed"}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </li>
                  ))}
                </ul>
                {filteredRequests.length > 0 ? (
                  <div className="history-pagination" aria-label="Certificate requests pagination">
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
              </>
            )}
          </section>
        </section>
      </div>

      {selectedRequestForDetails ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={() => setSelectedRequestForDetails(null)}>
          <section
            className="appointment-confirm-modal appointment-details-modal certificate-details-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Certificate request details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="appointment-details-shell">
              <header className="certificate-details-bar">
                <div className="certificate-details-heading">
                  <p className="certificate-details-kicker">Certificate request</p>
                  <h3>Request Details</h3>
                </div>
                <div className="certificate-details-bar-side">
                  <span className="certificate-details-id">#{selectedRequestForDetails.id}</span>
                  <button
                    type="button"
                    className="certificate-pickup-modal-close"
                    aria-label="Close certificate request details"
                    onClick={() => setSelectedRequestForDetails(null)}
                  >
                    <X size={16} strokeWidth={2.2} />
                  </button>
                </div>
              </header>
              <div className="certificate-details-meta">
                <span className="certificate-details-chip">{selectedRequestForDetails.certificateType}</span>
                {String(selectedRequestForDetails.requestSource || "").trim().toLowerCase() === "onsite" ? (
                  <span className="certificate-details-chip is-onsite">Onsite</span>
                ) : (
                  <span className="certificate-details-chip is-online">Online</span>
                )}
              </div>
              <div className="appointment-details-content">
                <div className="appointment-details-grid">
                  <div className="appointment-detail-item">
                    <span className="appointment-detail-label">User ID</span>
                    <p className="appointment-detail-value">
                      {selectedRequestForDetails.userID ? String(selectedRequestForDetails.userID) : "Not linked"}
                    </p>
                  </div>
                  <div className="appointment-detail-item">
                    <span className="appointment-detail-label">Submitted by</span>
                    <p className="appointment-detail-value">
                      {toTitleCaseValue(selectedRequestForDetails.submittedByName || "Not linked")}
                    </p>
                  </div>
                  <div className="appointment-detail-item">
                    <span className="appointment-detail-label">Requester</span>
                    <p className="appointment-detail-value">
                      {toTitleCaseValue(selectedRequestForDetails.fullName || "Unknown Requester")}
                    </p>
                  </div>
                  <div className="appointment-detail-item">
                    <span className="appointment-detail-label">Contact Number</span>
                    <p className="appointment-detail-value">{selectedRequestForDetails.contactNumber || "Not provided"}</p>
                  </div>
                  <div className="appointment-detail-item">
                    <span className="appointment-detail-label">Status</span>
                    <p
                      className={`appointment-detail-value certificate-details-status is-${
                        ["cancelled", "canceled"].includes(String(selectedRequestForDetails.status || "").trim().toLowerCase())
                          ? "declined"
                          : String(selectedRequestForDetails.status || "pending").trim().toLowerCase()
                      }`}
                    >
                      {["cancelled", "canceled"].includes(String(selectedRequestForDetails.status || "").trim().toLowerCase())
                        ? "Declined"
                        : toTitleCaseValue(selectedRequestForDetails.status || "Pending")}
                    </p>
                  </div>
                  <div className="appointment-detail-item">
                    <span className="appointment-detail-label">Requested At</span>
                    <p className="appointment-detail-value">{formatDateTime(selectedRequestForDetails.createdAt)}</p>
                  </div>
                  {selectedRequestForDetails.pickupSchedule || selectedRequestForDetails.pickupDate ? (
                    <div className="appointment-detail-item">
                      <span className="appointment-detail-label">Pickup Schedule</span>
                      <p className="appointment-detail-value">
                        {selectedRequestForDetails.pickupSchedule ||
                          formatCertificatePickupLabel(
                            selectedRequestForDetails.pickupDate,
                            selectedRequestForDetails.pickupTime,
                            selectedRequestForDetails.pickupEndTime,
                          )}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="appointment-detail-item is-full-width">
                  <span className="appointment-detail-label">Requester Information</span>
                  <div className="appointment-details-grid">
                    {Object.entries(
                      selectedRequestForDetails?.details &&
                        typeof selectedRequestForDetails.details === "object" &&
                        !Array.isArray(selectedRequestForDetails.details)
                        ? selectedRequestForDetails.details
                        : {},
                    )
                      .filter(([key]) => shouldShowRequesterDetail(key))
                      .map(([key, value]) => (
                        <div key={`certificate-detail-${selectedRequestForDetails.id}-${key}`} className="appointment-detail-item">
                          <span className="appointment-detail-label">{toReadableLabel(key)}</span>
                          <p className="appointment-detail-value">{formatDetailValue(key, value)}</p>
                        </div>
                      ))}
                    {Object.entries(
                      selectedRequestForDetails?.details &&
                        typeof selectedRequestForDetails.details === "object" &&
                        !Array.isArray(selectedRequestForDetails.details)
                        ? selectedRequestForDetails.details
                        : {},
                    ).filter(([key]) => shouldShowRequesterDetail(key)).length === 0 ? (
                      <div className="appointment-detail-item is-full-width">
                        <span className="appointment-detail-label">Details</span>
                        <p className="appointment-detail-value">No additional requester details were provided.</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="appointment-details-actions appointment-confirm-actions">
                {String(selectedRequestForDetails?.status || "").trim().toUpperCase() === "APPROVED" ? (
                  <button
                    type="button"
                    className="approve-button"
                    onClick={() => openClaimModal(selectedRequestForDetails)}
                    disabled={
                      actionStateByRequestId[Number(selectedRequestForDetails?.id)] === "claim"
                    }
                  >
                    {actionStateByRequestId[Number(selectedRequestForDetails?.id)] === "claim" ? "Saving..." : "Mark as Done"}
                  </button>
                ) : null}
                {["cancelled", "canceled"].includes(String(selectedRequestForDetails?.status || "").trim().toLowerCase()) ? (
                  <button
                    type="button"
                    className="restore-button"
                    onClick={() => {
                      setSelectedRequestForDetails(null);
                      setSelectedRestoreRequest(selectedRequestForDetails);
                    }}
                    disabled={actionStateByRequestId[Number(selectedRequestForDetails?.id)] === "restore"}
                  >
                    {actionStateByRequestId[Number(selectedRequestForDetails?.id)] === "restore" ? "Restoring..." : "Restore to Pending"}
                  </button>
                ) : null}
                <button type="button" className="secondary" onClick={() => setSelectedRequestForDetails(null)}>
                  Close
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {approveModalState.isOpen ? (
        <div
          className="appointment-confirm-overlay"
          role="presentation"
          onClick={() => {
            if (isApprovingPickup) return;
            closeApproveModal();
          }}
        >
          <section
            className="appointment-confirm-modal certificate-pickup-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Set certificate pickup schedule"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="certificate-pickup-modal-bar">
              <div className="certificate-pickup-modal-heading">
                <p className="certificate-pickup-modal-kicker">Certificate request</p>
                <h3>Set Pickup Window</h3>
                <p>
                  {pickupRequesterName}
                  <span aria-hidden="true"> · </span>
                  {pickupCertificateType}
                </p>
              </div>
              <button
                type="button"
                className="certificate-pickup-modal-close"
                aria-label="Close pickup scheduler"
                disabled={isApprovingPickup}
                onClick={closeApproveModal}
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </header>
            <div className="certificate-pickup-modal-body">
              <section className="certificate-pickup-panel" aria-label="Pickup calendar">
                <div className="certificate-pickup-panel-head">
                  <span className="certificate-pickup-step-index" aria-hidden="true">
                    1
                  </span>
                  <div>
                    <h4>Choose a date</h4>
                    <p>
                      {officeDayOffLabel
                        ? `${officeDayOffLabel} is the office day off.`
                        : "Available from today onward."}
                    </p>
                  </div>
                </div>
                <div className="certificate-pickup-month">
                  <button
                    type="button"
                    className="certificate-pickup-month-nav"
                    aria-label="Previous month"
                    disabled={!canGoToPreviousPickupMonth || isApprovingPickup}
                    onClick={() =>
                      setApproveModalState((current) => ({
                        ...current,
                        calendarMonth: new Date(
                          current.calendarMonth.getFullYear(),
                          current.calendarMonth.getMonth() - 1,
                          1,
                        ),
                      }))
                    }
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <strong>{pickupCalendarMonthLabel}</strong>
                  <button
                    type="button"
                    className="certificate-pickup-month-nav"
                    aria-label="Next month"
                    disabled={isApprovingPickup}
                    onClick={() =>
                      setApproveModalState((current) => ({
                        ...current,
                        calendarMonth: new Date(
                          current.calendarMonth.getFullYear(),
                          current.calendarMonth.getMonth() + 1,
                          1,
                        ),
                      }))
                    }
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="certificate-pickup-calendar-grid">
                  {CERTIFICATE_CALENDAR_DAY_NAMES.map((dayName, index) => (
                    <span
                      key={`pickup-day-${dayName}`}
                      className={`certificate-pickup-day-name${dayOffWeekday === index ? " is-day-off" : ""}`}
                    >
                      {dayName}
                    </span>
                  ))}
                  {Array.from({ length: pickupCalendarFirstDayIndex }).map((_, index) => (
                    <span key={`pickup-empty-${index}`} className="certificate-pickup-date-cell is-empty" />
                  ))}
                  {Array.from({ length: pickupCalendarDaysInMonth }).map((_, index) => {
                    const dayNumber = index + 1;
                    const dateKey = `${pickupCalendarMonth.getFullYear()}-${String(pickupCalendarMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
                    const isPastDate = dateKey < todayDateKey;
                    const isUpcomingDayOff =
                      !isPastDate && isOfficeDayOffDate(dateKey, dayOffWeekday, dayOffSpecificDates);
                    const isUnavailableDate = isPastDate || isUpcomingDayOff;
                    const isSelected = !isUnavailableDate && approveModalState.pickupDate === dateKey;
                    const isToday = todayDateKey === dateKey;
                    return (
                      <button
                        key={`pickup-date-${dateKey}`}
                        type="button"
                        className={`certificate-pickup-date-cell${
                          isUpcomingDayOff ? " is-day-off" : isPastDate ? " is-past" : " is-open"
                        }${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                        disabled={isUnavailableDate || isApprovingPickup}
                        aria-pressed={isSelected}
                        aria-label={
                          isUpcomingDayOff
                            ? `${formatLongDate(dateKey)}, office day off`
                            : isPastDate
                              ? `${dayNumber}, unavailable`
                              : `${formatLongDate(dateKey)}${isToday ? ", today" : ""}${isSelected ? ", selected" : ""}`
                        }
                        onClick={() => {
                          if (isUnavailableDate) return;
                          setApproveModalState((current) => {
                            const stillValidSlot =
                              current.pickupTime && !isPickupSlotPassedToday(dateKey, current.pickupTime);
                            return {
                              ...current,
                              pickupDate: dateKey,
                              pickupTime: stillValidSlot ? current.pickupTime : "",
                              pickupEndTime: stillValidSlot ? current.pickupEndTime : "",
                              error: "",
                            };
                          });
                        }}
                      >
                        <span>{dayNumber}</span>
                        {isUpcomingDayOff ? <small>Off</small> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="certificate-pickup-legend" aria-hidden="true">
                  <span>
                    <i className="is-today" /> Today
                  </span>
                  <span>
                    <i className="is-selected" /> Selected
                  </span>
                  <span>
                    <i className="is-open" /> Open
                  </span>
                  <span>
                    <i className="is-day-off" /> Day off
                  </span>
                </div>
              </section>
              <section className="certificate-pickup-panel" aria-label="Pickup time slots">
                <div className="certificate-pickup-panel-head">
                  <span className="certificate-pickup-step-index" aria-hidden="true">
                    2
                  </span>
                  <div>
                    <h4>Choose a 1-hour window</h4>
                    <p>Parish hours are 8:00 AM to 5:00 PM.</p>
                  </div>
                </div>
                <p className="certificate-pickup-selected-date">
                  <Clock size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    {approveModalState.pickupDate
                      ? isSelectedPickupDayOff
                        ? `${formatLongDate(approveModalState.pickupDate)} is an office day off`
                        : formatLongDate(approveModalState.pickupDate)
                      : "Select a date first"}
                  </span>
                </p>
                <div className="certificate-pickup-slot-grid" role="listbox" aria-label="Pickup time slots">
                  {CERTIFICATE_PICKUP_SLOTS.map((slot) => {
                    const isUnavailable =
                      isSelectedPickupDayOff ||
                      !approveModalState.pickupDate ||
                      isPickupSlotPassedToday(approveModalState.pickupDate, slot.startTime);
                    const isSelected =
                      !isUnavailable &&
                      approveModalState.pickupTime === slot.startTime &&
                      approveModalState.pickupEndTime === slot.endTime;
                    const slotParts = formatPickupSlotParts(slot.startTime, slot.endTime);
                    return (
                      <button
                        key={`pickup-slot-${slot.startTime}-${slot.endTime}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={isUnavailable || isApprovingPickup || !approveModalState.pickupDate}
                        className={`certificate-pickup-slot-button${isSelected ? " is-selected" : ""}${
                          isUnavailable ? " is-unavailable" : ""
                        }`}
                        onClick={() => {
                          if (isUnavailable) return;
                          setApproveModalState((current) => ({
                            ...current,
                            pickupTime: slot.startTime,
                            pickupEndTime: slot.endTime,
                            error: "",
                          }));
                        }}
                      >
                        <span className="certificate-pickup-slot-time">{slotParts.primary}</span>
                        {slotParts.period ? (
                          <span className="certificate-pickup-slot-period">{slotParts.period}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className={`certificate-pickup-summary-card${selectedPickupLabel ? " is-ready" : ""}`}>
                  <CalendarClock size={16} strokeWidth={2.2} aria-hidden="true" />
                  <p>
                    {selectedPickupLabel ? (
                      <>
                        Pickup is set for <strong>{selectedPickupLabel}</strong>
                      </>
                    ) : (
                      "Pick a date and a 1-hour window to approve this request."
                    )}
                  </p>
                </div>
              </section>
            </div>
            {approveModalState.error ? <p className="appointment-decline-error">{approveModalState.error}</p> : null}
            <div className="certificate-pickup-modal-footer">
              <button type="button" className="secondary" disabled={isApprovingPickup} onClick={closeApproveModal}>
                Cancel
              </button>
              <button
                type="button"
                className="approve-button"
                disabled={!canSubmitPickup || isApprovingPickup}
                onClick={() => void submitApproveModal()}
              >
                {isApprovingPickup ? "Approving..." : "Approve Request"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {declineModalState.isOpen ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={closeDeclineModal}>
          <section
            className="appointment-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm decline certificate request"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Decline Request?</h3>
            <p>
              Are you sure you want to decline{" "}
              {declineModalState.request?.fullName ? `${declineModalState.request.fullName}'s` : "this"} request? This will
              move it to Trash.
            </p>
            <div className="appointment-decline-reason-block">
              <label htmlFor="certificate-decline-reason-select">Reason for decline</label>
              <select
                id="certificate-decline-reason-select"
                value={declineModalState.selectedReason}
                onChange={(event) =>
                  setDeclineModalState((current) => ({
                    ...current,
                    selectedReason: event.target.value,
                    error: "",
                  }))
                }
              >
                {DECLINE_REASON_OPTIONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
              {declineModalState.selectedReason === "Other reason" ? (
                <textarea
                  id="certificate-decline-reason"
                  rows={3}
                  placeholder="Enter other reason..."
                  value={declineModalState.customReason}
                  onChange={(event) =>
                    setDeclineModalState((current) => ({
                      ...current,
                      customReason: event.target.value,
                      error: "",
                    }))
                  }
                />
              ) : null}
            </div>
            {declineModalState.error ? <p className="appointment-decline-error">{declineModalState.error}</p> : null}
            <div className="appointment-confirm-actions">
              <button type="button" className="decline-button" onClick={() => void submitDeclineModal()}>
                Confirm
              </button>
              <button type="button" className="secondary" onClick={closeDeclineModal}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {claimModalState.isOpen ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={closeClaimModal}>
          <section
            className="appointment-confirm-modal certificate-approve-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Enter invoice or receipt number for this certificate request"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="certificate-approve-modal-header">
              <span className="certificate-approve-modal-icon" aria-hidden="true">
                <Receipt size={18} />
              </span>
              <div>
                <h3>Mark Certificate as Done</h3>
                <p>Enter the invoice or receipt number. This marks the request as paid on Reports and moves it to History.</p>
              </div>
            </header>
            <div className="certificate-approve-modal-body certificate-claim-modal-body">
              <label htmlFor="certificate-receipt-number" className="certificate-approve-field">
                <span>Invoice / Receipt Number</span>
                <input
                  id="certificate-receipt-number"
                  type="text"
                  autoComplete="off"
                  placeholder="Enter invoice or receipt number"
                  value={claimModalState.receiptNumber}
                  onChange={(event) =>
                    setClaimModalState((current) => ({
                      ...current,
                      receiptNumber: event.target.value,
                      error: "",
                    }))
                  }
                />
              </label>
            </div>
            {claimModalState.error ? <p className="appointment-decline-error">{claimModalState.error}</p> : null}
            <div className="appointment-confirm-actions">
              <button type="button" className="secondary" onClick={closeClaimModal}>
                Cancel
              </button>
              <button type="button" className="approve-button" onClick={() => void submitClaimModal()}>
                {actionStateByRequestId[Number(claimModalState.request?.id)] === "claim"
                  ? "Saving..."
                  : "Confirm Claim"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {selectedRestoreRequest ? (
        <div
          className="appointment-confirm-overlay"
          role="presentation"
          onClick={() => {
            if (actionStateByRequestId[Number(selectedRestoreRequest?.id)] === "restore") return;
            setSelectedRestoreRequest(null);
          }}
        >
          <section
            className="appointment-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm restore certificate request"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Restore Certificate Request</h3>
            <p>
              Restore {selectedRestoreRequest.fullName || "this requester"}&apos;s{" "}
              {selectedRestoreRequest.certificateType || "certificate"} request back to pending? The requester
              will see it as pending again on their Status page.
            </p>
            <div className="appointment-confirm-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setSelectedRestoreRequest(null)}
                disabled={actionStateByRequestId[Number(selectedRestoreRequest?.id)] === "restore"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="restore-button"
                onClick={async () => {
                  const restored = await runRequestAction(selectedRestoreRequest, "restore");
                  if (restored) {
                    setSelectedRestoreRequest(null);
                    setSelectedStatusFilter("pending");
                  }
                }}
                disabled={actionStateByRequestId[Number(selectedRestoreRequest?.id)] === "restore"}
              >
                {actionStateByRequestId[Number(selectedRestoreRequest?.id)] === "restore"
                  ? "Restoring..."
                  : "Yes, Restore"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminCertificateRequests;
