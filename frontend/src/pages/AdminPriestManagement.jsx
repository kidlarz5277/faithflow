import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronsUpDown, Clock, Copy, Inbox, KeyRound, MapPin, MessageSquare, Pencil, UserPlus, UserRound, Users, X } from "lucide-react";
import PageGuide from "../components/PageGuide";
import ViewModeToggle, { useViewMode } from "../components/ViewModeToggle";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import defaultPriestAvatar from "../assets/default-priest-avatar.svg";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import {
  formatOccupiedSlotsLabel,
  getCalendarEntryDisplayTitle,
  getCalendarEntryLocationLabel,
  getManilaDateKeyAndMinutes,
  isAppointmentCalendarEntry,
  isSpecialSacramentCalendarEntry,
  sanitizeScheduleNotes,
} from "../utils/parishSchedule";
import { isSpecialProgramAppointment } from "../utils/specialProgramProgress";
import { subscribeNotificationStream } from "../utils/notificationStream";
import { pushUiNotice } from "../utils/uiNotice";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";
import "./AdminPriestManagement.css";

const PRIEST_CLERGY_TYPES = {
  DIOCESAN: "DIOCESAN",
  RELIGIOUS: "RELIGIOUS",
};

const normalizePriestClergyType = (value) => {
  const normalizedValue = String(value || "").trim().toUpperCase();
  return normalizedValue === PRIEST_CLERGY_TYPES.RELIGIOUS ? PRIEST_CLERGY_TYPES.RELIGIOUS : PRIEST_CLERGY_TYPES.DIOCESAN;
};

const normalizeReligiousOrderCode = (value) => String(value || "").trim().toUpperCase();
const PRIEST_PARISH_ROLE_OPTIONS = [
  { value: "PARISH_PRIEST", label: "Parish Priest" },
  { value: "PAROCHIAL_VICAR", label: "Parochial Vicar" },
  { value: "GUEST_PRIEST", label: "Guest Priest" },
];
const normalizePriestParishRole = (value) => {
  const normalizedValue = String(value || "").trim().toUpperCase();
  return PRIEST_PARISH_ROLE_OPTIONS.some((option) => option.value === normalizedValue) ? normalizedValue : "";
};
const getPriestParishRoleLabel = (value) =>
  PRIEST_PARISH_ROLE_OPTIONS.find((option) => option.value === normalizePriestParishRole(value))?.label || "Not set";
const PriestParishRoleBadge = ({ parishRole }) => {
  const hasRole = Boolean(normalizePriestParishRole(parishRole));
  return (
    <span className={`priest-directory-role-badge${hasRole ? "" : " is-unset"}`}>
      {hasRole ? getPriestParishRoleLabel(parishRole) : "Role not set"}
    </span>
  );
};
const EMAIL_INPUT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_INPUT_REGEX = /^09\d{9}$/;
const isGmailAddress = (email) => String(email || "").trim().toLowerCase().endsWith("@gmail.com");
const splitPersonName = (fullName) => {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};
const joinPersonName = (firstName, lastName) =>
  [String(firstName || "").trim(), String(lastName || "").trim()].filter(Boolean).join(" ");
const getPriestLoginIdentifierError = (email, phoneNumber) => {
  const hasEmail = Boolean(email);
  const hasPhone = Boolean(phoneNumber);
  if (!hasEmail && !hasPhone) {
    return "Enter a Gmail address, a phone number, or both so the priest can log in.";
  }
  if (hasEmail && !EMAIL_INPUT_REGEX.test(email)) {
    return "Please enter a valid Gmail address (example@gmail.com).";
  }
  if (hasEmail && !isGmailAddress(email)) {
    return "Please use a Gmail address (example@gmail.com) for priest login.";
  }
  if (hasPhone && !PHONE_INPUT_REGEX.test(phoneNumber)) {
    return "Phone number must be 11 digits and start with 09.";
  }
  return "";
};
const normalizeMobileInput = (rawValue) => {
  const digitsOnly = String(rawValue || "").replace(/\D/g, "").slice(0, 11);
  if (!digitsOnly) return "";
  if (digitsOnly[0] !== "0") return "";
  if (digitsOnly.length === 1) return "0";
  if (digitsOnly[1] !== "9") return "0";
  return digitsOnly;
};

const getPriestPasswordDeliveryMethods = (priest) => {
  const email = String(priest?.email || "").trim().toLowerCase();
  const phoneNumber = String(priest?.phoneNumber || "").trim();
  return [
    EMAIL_INPUT_REGEX.test(email) && isGmailAddress(email)
      ? { value: "email", label: `Email (${email})`, destination: email }
      : null,
    PHONE_INPUT_REGEX.test(phoneNumber)
      ? { value: "sms", label: `SMS (${phoneNumber})`, destination: phoneNumber }
      : null,
  ].filter(Boolean);
};

const to12HourTime = (timeValue) => {
  if (!timeValue) return "Time not set";
  const [hoursRaw, minutesRaw] = String(timeValue).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "Time not set";
  const normalizedHours = ((hours % 24) + 24) % 24;
  const period = normalizedHours >= 12 ? "PM" : "AM";
  const twelveHour = normalizedHours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${period}`;
};

const formatLongDate = (dateValue) => {
  const normalizedDate = String(dateValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) return "Date not set";
  return new Date(`${normalizedDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

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

const formatCredentialFieldLabel = (fieldKey) =>
  String(fieldKey || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Field";

const formatCredentialFieldValue = (value) => {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "N/A";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const getNameInitials = (fullName) => {
  const nameParts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (nameParts.length === 0) return "PR";
  if (nameParts.length === 1) return nameParts[0].slice(0, 2).toUpperCase();
  return `${nameParts[0][0] || ""}${nameParts[1][0] || ""}`.toUpperCase();
};

const resolvePriestPhotoSource = (photoValue, versionValue) => {
  const normalized = String(photoValue || "").trim();
  if (!normalized) return "";
  const priestAssetMatch = normalized.match(/^(?:\/?(?:src\/)?assets\/)?priest-photos\/(.+)$/i);
  const resolvedPath = normalized.startsWith("data:")
    ? normalized
    : /^https?:\/\//i.test(normalized)
      ? normalized
      : normalized.startsWith("/uploads/")
        ? `/api${normalized}`
        : priestAssetMatch
          ? `/api/uploads/priest-photos/${priestAssetMatch[1]}`
          : normalized;
  if (resolvedPath.startsWith("data:")) return resolvedPath;
  const version = encodeURIComponent(String(versionValue || "").trim());
  if (!version) return resolvedPath;
  return `${resolvedPath}${resolvedPath.includes("?") ? "&" : "?"}v=${version}`;
};

const PRIEST_LIST_PAGE_SIZE = 7;

const isPriestUnavailabilityEntry = (entry) =>
  String(entry?.scheduleType || "").trim().toLowerCase() === "priest_activity";

const getScheduleStatus = (entryOrDate, todayKey) => {
  if (entryOrDate && typeof entryOrDate === "object") {
    const tone = String(entryOrDate.statusKey || "").trim();
    const status =
      tone === "today" || tone === "upcoming" || tone === "past" || tone === "unknown"
        ? { label: entryOrDate.statusLabel || (tone === "past" ? "Completed" : tone === "today" ? "Today" : "Upcoming"), tone }
        : getScheduleStatus(entryOrDate.eventDate, todayKey);
    return isPriestUnavailabilityEntry(entryOrDate) && status.tone === "past" ? { ...status, label: "Ended" } : status;
  }
  const normalizedDate = String(entryOrDate || "");
  if (!normalizedDate) return { label: "Date not set", tone: "unknown" };
  if (normalizedDate === todayKey) return { label: "Today", tone: "today" };
  if (normalizedDate > todayKey) return { label: "Upcoming", tone: "upcoming" };
  return { label: "Completed", tone: "past" };
};

// Consecutive unavailability days with the same details display as one card.
const addDaysToDateKey = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getDateRangeDayCount = (startDate, endDate) =>
  Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1;

const formatDateRangeLabel = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const startMonth = start.toLocaleDateString("en-US", { month: "long" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long" });
  if (start.getFullYear() !== end.getFullYear()) {
    return `${startMonth} ${start.getDate()}, ${start.getFullYear()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${startMonth} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
};

const formatScheduleDateLabel = (entry) =>
  entry?.rangeEndDate
    ? `${formatDateRangeLabel(entry.eventDate, entry.rangeEndDate)} (${getDateRangeDayCount(entry.eventDate, entry.rangeEndDate)} days)`
    : formatLongDate(entry?.eventDate);

const getScheduleMemberIds = (entry) => entry?.memberIds || [entry?.id];

const getUnavailabilitySignature = (entry) =>
  JSON.stringify([
    Number(entry.priestID),
    getCalendarEntryDisplayTitle(entry),
    sanitizeScheduleNotes(entry.notes),
    String(entry.location || "").trim(),
    formatOccupiedSlotsLabel(entry.occupiedSlots, entry.startTime, entry.endTime),
  ]);

const combineConsecutiveUnavailability = (entries, todayKey) => {
  const isDatedUnavailability = (entry) =>
    isPriestUnavailabilityEntry(entry) && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.eventDate || "").slice(0, 10));
  const otherEntries = entries.filter((entry) => !isDatedUnavailability(entry));
  const sortedUnavailability = entries
    .filter(isDatedUnavailability)
    .map((entry) => ({ ...entry, eventDate: String(entry.eventDate).slice(0, 10) }))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || Number(a.id) - Number(b.id));
  const openGroups = new Map();
  const groups = [];
  sortedUnavailability.forEach((entry) => {
    const signature = getUnavailabilitySignature(entry);
    const group = openGroups.get(signature);
    if (group && entry.eventDate <= addDaysToDateKey(group.endDate, 1)) {
      group.endDate = entry.eventDate;
      group.entries.push(entry);
      return;
    }
    const nextGroup = { endDate: entry.eventDate, entries: [entry] };
    openGroups.set(signature, nextGroup);
    groups.push(nextGroup);
  });
  const combinedEntries = groups.map(({ endDate, entries: groupEntries }) => {
    const first = groupEntries[0];
    if (endDate === first.eventDate) return first;
    const statusKey = endDate < todayKey ? "past" : first.eventDate <= todayKey ? "today" : "upcoming";
    return {
      ...first,
      rangeEndDate: endDate,
      memberIds: groupEntries.map((entry) => entry.id),
      statusKey,
      statusLabel: statusKey === "past" ? "Ended" : statusKey === "today" ? "Ongoing" : "Upcoming",
    };
  });
  return [...otherEntries, ...combinedEntries];
};

const formatFormalScheduleWhen = (entry) => {
  const dateLabel = formatLongDate(entry?.eventDate);
  const timeLabel = isPriestUnavailabilityEntry(entry)
    ? formatOccupiedSlotsLabel(entry?.occupiedSlots, entry?.startTime, entry?.endTime) || "Time not set"
    : `${to12HourTime(entry?.startTime)} – ${to12HourTime(entry?.endTime)}`;
  if (entry?.rangeEndDate) return `${formatScheduleDateLabel(entry)} · ${timeLabel}`;
  const normalized = String(entry?.eventDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return timeLabel;
  const weekday = new Date(`${normalized}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday}, ${dateLabel} · ${timeLabel}`;
};

const getScheduleDateParts = (value) => {
  const normalized = String(value || "").trim();
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T00:00:00`)
    : normalized
      ? new Date(normalized)
      : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null;
  return {
    month: parsedDate.toLocaleString("en-US", { month: "short" }),
    day: parsedDate.getDate(),
    year: parsedDate.getFullYear(),
  };
};

function ScheduleDateBlock({ value, endValue }) {
  const dateParts = getScheduleDateParts(value);
  const endParts = endValue ? getScheduleDateParts(endValue) : null;
  return (
    <div className={`priest-card-date${endParts ? " is-range" : ""}`} aria-hidden="true">
      {dateParts ? (
        <>
          <span>{endParts && endParts.month !== dateParts.month ? `${dateParts.month}–${endParts.month}` : dateParts.month}</span>
          <strong>{endParts ? `${dateParts.day}–${endParts.day}` : dateParts.day}</strong>
          <small>{endParts && endParts.year !== dateParts.year ? `${dateParts.year}–${endParts.year}` : dateParts.year}</small>
        </>
      ) : (
        <CalendarDays size={22} />
      )}
    </div>
  );
}

const getScheduleEventTheme = (entry) => {
  // Match the priest-schedule color family used in Admin Dashboard calendar.
  return { accent: "#93c89a", light: "#eef9ef", text: "#166534" };
};

const cleanScheduleNotes = sanitizeScheduleNotes;

const resolvePriestDetailViewFromSearch = (searchParams) => {
  const view = String(searchParams?.get?.("view") || "").trim().toLowerCase();
  const remarkFromUrl = Number(searchParams?.get?.("remarkID"));
  if (view === "remarks" || (Number.isInteger(remarkFromUrl) && remarkFromUrl > 0)) {
    return "remarks";
  }
  return "schedule";
};

const getScheduleKindLabel = (entry) => {
  const scheduleType = String(entry?.scheduleType || "").trim().toLowerCase();
  if (scheduleType === "parish_event") return "Parish Event";
  if (scheduleType === "priest_activity") return "Priest Unavailability";
  if (isAppointmentCalendarEntry(entry)) return "Appointment";
  return "Priest Event";
};

function AdminPriestManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAppliedRef = useRef("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [viewMode, setViewMode] = useViewMode("admin-priest-management");
  const [priests, setPriests] = useState([]);
  const [isLoadingPriests, setIsLoadingPriests] = useState(true);
  const [calendarEntries, setCalendarEntries] = useState([]);
  const [newPriestFirstName, setNewPriestFirstName] = useState("");
  const [newPriestLastName, setNewPriestLastName] = useState("");
  const [newPriestEmail, setNewPriestEmail] = useState("");
  const [newPriestPhoneNumber, setNewPriestPhoneNumber] = useState("");
  const [isSavingPriest, setIsSavingPriest] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [createdPriestResult, setCreatedPriestResult] = useState(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [selectedPriestId, setSelectedPriestId] = useState(() => {
    const priestFromUrl = Number(searchParams.get("priestID"));
    return Number.isInteger(priestFromUrl) && priestFromUrl > 0 ? priestFromUrl : null;
  });
  const [focusedRemarkId, setFocusedRemarkId] = useState(() => {
    const remarkFromUrl = Number(searchParams.get("remarkID"));
    return Number.isInteger(remarkFromUrl) && remarkFromUrl > 0 ? remarkFromUrl : null;
  });
  const [detailView, setDetailView] = useState(() => resolvePriestDetailViewFromSearch(searchParams));
  const [remarksListView, setRemarksListView] = useState("needs-review");
  const [scheduleListView, setScheduleListView] = useState("upcoming");
  const [schedulePage, setSchedulePage] = useState(1);
  const [remarksPage, setRemarksPage] = useState(1);
  const selectedPriestIdRef = useRef(selectedPriestId);
  const [isEditingPriestName, setIsEditingPriestName] = useState(false);
  const [editPriestFirstName, setEditPriestFirstName] = useState("");
  const [editPriestLastName, setEditPriestLastName] = useState("");
  const [editPriestEmail, setEditPriestEmail] = useState("");
  const [editPriestPhoneNumber, setEditPriestPhoneNumber] = useState("");
  const [newPriestClergyType, setNewPriestClergyType] = useState(PRIEST_CLERGY_TYPES.DIOCESAN);
  const [newPriestReligiousOrderCode, setNewPriestReligiousOrderCode] = useState("");
  const [newPriestParishRole, setNewPriestParishRole] = useState("");
  const [isAddPriestModalOpen, setIsAddPriestModalOpen] = useState(false);
  const [editPriestClergyType, setEditPriestClergyType] = useState(PRIEST_CLERGY_TYPES.DIOCESAN);
  const [editPriestReligiousOrderCode, setEditPriestReligiousOrderCode] = useState("");
  const [editPriestParishRole, setEditPriestParishRole] = useState("");
  const [religiousOrderOptions, setReligiousOrderOptions] = useState([]);
  const [isSavingPriestName, setIsSavingPriestName] = useState(false);
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [priestPasswordDeliveryMethod, setPriestPasswordDeliveryMethod] = useState("");
  const [isPriestPasswordResetConfirmOpen, setIsPriestPasswordResetConfirmOpen] = useState(false);
  const [isGeneratingPriestPassword, setIsGeneratingPriestPassword] = useState(false);
  const [priestPasswordResetError, setPriestPasswordResetError] = useState("");
  const [priestPasswordResetSuccess, setPriestPasswordResetSuccess] = useState("");
  const [statusTogglePriestId, setStatusTogglePriestId] = useState(null);
  const [statusConfirmTarget, setStatusConfirmTarget] = useState(null);
  const [isPriestPickerOpen, setIsPriestPickerOpen] = useState(false);
  const [selectedScheduleEntry, setSelectedScheduleEntry] = useState(null);
  const [isEditingScheduleTime, setIsEditingScheduleTime] = useState(false);
  const [scheduleEditDate, setScheduleEditDate] = useState("");
  const [scheduleEditStart, setScheduleEditStart] = useState("");
  const [scheduleEditEnd, setScheduleEditEnd] = useState("");
  const [isSavingScheduleTime, setIsSavingScheduleTime] = useState(false);
  const [scheduleEditError, setScheduleEditError] = useState("");
  const [selectedScheduleAppointments, setSelectedScheduleAppointments] = useState([]);
  const [isLoadingScheduleAppointments, setIsLoadingScheduleAppointments] = useState(false);
  const [scheduleAppointmentsError, setScheduleAppointmentsError] = useState("");
  const [priestScheduleRemarks, setPriestScheduleRemarks] = useState([]);
  const [priestRemarksSummary, setPriestRemarksSummary] = useState(null);
  const [isLoadingPriestScheduleRemarks, setIsLoadingPriestScheduleRemarks] = useState(false);
  const [priestScheduleRemarksError, setPriestScheduleRemarksError] = useState("");
  const [isMarkingRemarkReviewedById, setIsMarkingRemarkReviewedById] = useState({});

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

  useEffect(() => {
    document.title = "Faithflow - Priest Management";
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user, accountType]);

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const loadPriests = async () => {
    if (!Number.isInteger(adminID) || adminID <= 0) return;
    setIsLoadingPriests(true);
    try {
      const fetchPriests = async () => {
        const response = await fetch(`/admin-api/priests?adminID=${adminID}&includeInactive=true`);
        const responseData = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error("Unable to load priests.");
        }
        return Array.isArray(responseData) ? responseData : [];
      };

      const normalized = await fetchPriests();
      setPriests(normalized);
      setPriests(normalized);
      const currentPriestID = Number(selectedPriestIdRef.current);
      setSelectedPriestId(
        normalized.some((item) => Number(item.priestID) === currentPriestID) ? currentPriestID : null,
      );
    } catch (error) {
      setFeedbackMessage(error.message || "Unable to load priests.");
    } finally {
      setIsLoadingPriests(false);
    }
  };

  const loadCalendarEntries = async () => {
    if (!Number.isInteger(adminID) || adminID <= 0) return;
    try {
      const response = await fetch(`/admin-api/calendar-entries?adminID=${adminID}`);
      const responseData = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error("Unable to load schedule entries.");
      }
      setCalendarEntries(Array.isArray(responseData) ? responseData : []);
    } catch (error) {
      setFeedbackMessage(error.message || "Unable to load schedule entries.");
    }
  };

  const loadReligiousOrderOptions = async () => {
    if (!Number.isInteger(adminID) || adminID <= 0) return;
    try {
      const response = await fetch(`/admin-api/settings/religious-orders?adminID=${adminID}`);
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load religious order options.");
      }
      const options = Array.isArray(responseData?.religiousOrderOptions) ? responseData.religiousOrderOptions : [];
      setReligiousOrderOptions(options);
    } catch (error) {
      setFeedbackMessage(error.message || "Unable to load religious order options.");
    }
  };

  const loadScheduleAppointmentDetails = async (entry) => {
    if (!entry || !Number.isInteger(Number(entry.id)) || Number(entry.id) <= 0) {
      setSelectedScheduleAppointments([]);
      setScheduleAppointmentsError("");
      return;
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setSelectedScheduleAppointments([]);
      setScheduleAppointmentsError("Unable to detect admin account.");
      return;
    }
    setIsLoadingScheduleAppointments(true);
    setScheduleAppointmentsError("");
    try {
      const response = await fetch(`/admin-api/calendar-entries/${entry.id}/appointment-details?adminID=${adminID}`);
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load appointment details for this event.");
      }
      const relatedAppointments = Array.isArray(responseData?.relatedAppointments) ? responseData.relatedAppointments : [];
      setSelectedScheduleAppointments(relatedAppointments);
    } catch (error) {
      setSelectedScheduleAppointments([]);
      setScheduleAppointmentsError(error.message || "Unable to load appointment details for this event.");
    } finally {
      setIsLoadingScheduleAppointments(false);
    }
  };

  const loadPriestScheduleRemarks = async (targetPriestID) => {
    if (!Number.isInteger(adminID) || adminID <= 0) return;
    if (!Number.isInteger(Number(targetPriestID)) || Number(targetPriestID) <= 0) {
      setPriestScheduleRemarks([]);
      setPriestRemarksSummary(null);
      setPriestScheduleRemarksError("");
      return;
    }
    setIsLoadingPriestScheduleRemarks(true);
    setPriestScheduleRemarksError("");
    try {
      const response = await fetch(`/admin-api/priests/${targetPriestID}/schedule-remarks?adminID=${adminID}`);
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load priest remarks.");
      }
      setPriestScheduleRemarks(Array.isArray(responseData?.remarks) ? responseData.remarks : []);
      setPriestRemarksSummary(responseData?.summary && typeof responseData.summary === "object" ? responseData.summary : null);
    } catch (error) {
      setPriestScheduleRemarks([]);
      setPriestRemarksSummary(null);
      setPriestScheduleRemarksError(error.message || "Unable to load priest remarks.");
    } finally {
      setIsLoadingPriestScheduleRemarks(false);
    }
  };

  const handleOpenScheduleEntry = (entry) => {
    setSelectedScheduleEntry(entry);
    setSelectedScheduleAppointments([]);
    setScheduleAppointmentsError("");
    if (!isPriestUnavailabilityEntry(entry)) {
      void loadScheduleAppointmentDetails(entry);
    }
  };

  const handleMarkRemarkReviewed = async (remark) => {
    const normalizedRemarkID = Number(remark?.remarkID);
    const normalizedPriestID = Number(selectedPriestId);
    if (!Number.isInteger(normalizedRemarkID) || normalizedRemarkID <= 0) return;
    if (!Number.isInteger(normalizedPriestID) || normalizedPriestID <= 0) return;
    if (!Number.isInteger(adminID) || adminID <= 0) return;
    setPriestScheduleRemarksError("");
    setIsMarkingRemarkReviewedById((current) => ({ ...current, [normalizedRemarkID]: true }));
    try {
      const response = await fetch(
        `/admin-api/priests/${normalizedPriestID}/schedule-remarks/${normalizedRemarkID}/review?adminID=${adminID}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminID }),
        },
      );
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to mark priest remark as reviewed.");
      }
      setPriestScheduleRemarks((current) =>
        current.map((entry) =>
          Number(entry.remarkID) === normalizedRemarkID
            ? {
                ...entry,
                reviewedBySecretary: true,
                reviewedAt: responseData?.remark?.reviewedAt || new Date().toISOString(),
              }
            : entry,
        ),
      );
      setPriestRemarksSummary((current) =>
        current
          ? {
              ...current,
              unreviewedRemarks: Math.max(0, Number(current.unreviewedRemarks || 0) - 1),
            }
          : current,
      );
      setRemarksListView("reviewed");
      pushUiNotice("Priest remark marked as reviewed.");
    } catch (error) {
      setPriestScheduleRemarksError(error.message || "Unable to mark priest remark as reviewed.");
    } finally {
      setIsMarkingRemarkReviewedById((current) => ({ ...current, [normalizedRemarkID]: false }));
    }
  };

  const selectPriestById = (priestID) => {
    const nextPriestId = Number(priestID);
    setSelectedPriestId(Number.isInteger(nextPriestId) && nextPriestId > 0 ? nextPriestId : null);
    setIsEditingPriestName(false);
    setIsPriestPickerOpen(false);
    setScheduleListView("upcoming");
    setSchedulePage(1);
    setRemarksPage(1);
  };

  const handleBackToPriestDirectory = () => {
    setSelectedPriestId(null);
    setIsEditingPriestName(false);
    setIsPriestPickerOpen(false);
    setFocusedRemarkId(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("priestID");
    nextParams.delete("remarkID");
    nextParams.delete("scheduleID");
    nextParams.delete("view");
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (!isPriestPickerOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setIsPriestPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPriestPickerOpen]);

  useEffect(() => {
    if (!Number.isInteger(adminID) || adminID <= 0) return;
    loadPriests();
    loadCalendarEntries();
    loadReligiousOrderOptions();
  }, [adminID]);

  selectedPriestIdRef.current = selectedPriestId;

  useEffect(() => {
    const priestFromUrl = Number(searchParams.get("priestID"));
    if (Number.isInteger(priestFromUrl) && priestFromUrl > 0) {
      setSelectedPriestId(priestFromUrl);
    }
    const remarkFromUrl = Number(searchParams.get("remarkID"));
    if (Number.isInteger(remarkFromUrl) && remarkFromUrl > 0) {
      setFocusedRemarkId(remarkFromUrl);
    }
    setDetailView(resolvePriestDetailViewFromSearch(searchParams));
  }, [searchParams]);

  useEffect(() => {
    const remarkID = Number(searchParams.get("remarkID"));
    const view = String(searchParams.get("view") || "").trim().toLowerCase();
    const scheduleID = Number(searchParams.get("scheduleID"));
    const deepLinkKey = `${searchParams.get("priestID") || ""}-${scheduleID || ""}-${searchParams.get("remarkID") || ""}-${view}`;
    if (!Number.isInteger(scheduleID) || scheduleID <= 0) return;
    if (deepLinkAppliedRef.current === deepLinkKey) return;
    if (view === "remarks" || (Number.isInteger(remarkID) && remarkID > 0)) {
      deepLinkAppliedRef.current = deepLinkKey;
      return;
    }
    const entry = calendarEntries.find((item) => Number(item.id) === scheduleID);
    if (!entry) return;
    deepLinkAppliedRef.current = deepLinkKey;
    const node = document.querySelector(`[data-schedule-ids~="${scheduleID}"]`);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [calendarEntries, searchParams]);

  useEffect(() => {
    if (!Number.isInteger(Number(focusedRemarkId)) || Number(focusedRemarkId) <= 0) return;
    const matchedRemark = priestScheduleRemarks.find((item) => Number(item.remarkID) === Number(focusedRemarkId));
    if (matchedRemark) {
      setRemarksListView(matchedRemark.reviewedBySecretary ? "reviewed" : "needs-review");
    }
    if (detailView !== "remarks") return;
    const node = document.getElementById(`priest-remark-${focusedRemarkId}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [detailView, focusedRemarkId, priestScheduleRemarks]);

  useEffect(() => {
    const scheduleID = Number(searchParams.get("scheduleID"));
    if (detailView !== "schedule") return;
    if (!Number.isInteger(scheduleID) || scheduleID <= 0) return;
    const node = document.querySelector(`[data-schedule-ids~="${scheduleID}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [calendarEntries, detailView, searchParams]);

  useEffect(() => {
    if (!Number.isInteger(adminID) || adminID <= 0) return undefined;
    return subscribeNotificationStream(`/api/notifications/stream?accountType=admin&adminID=${adminID}`, {
      onNotification: () => {
        void loadCalendarEntries();
        const targetPriestID = Number(selectedPriestIdRef.current);
        if (Number.isInteger(targetPriestID) && targetPriestID > 0) {
          void loadPriestScheduleRemarks(targetPriestID);
        }
      },
    });
  }, [adminID]);

  useEffect(() => {
    if (!Number.isInteger(adminID) || adminID <= 0) return undefined;
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        void loadPriests();
        void loadCalendarEntries();
        if (Number.isInteger(Number(selectedPriestId)) && Number(selectedPriestId) > 0) {
          void loadPriestScheduleRemarks(Number(selectedPriestId));
        }
      }
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [adminID, selectedPriestId]);

  useEffect(() => {
    setSelectedScheduleEntry(null);
    setSelectedScheduleAppointments([]);
    setScheduleAppointmentsError("");
  }, [selectedPriestId]);

  useEffect(() => {
    if (!Number.isInteger(Number(selectedPriestId)) || Number(selectedPriestId) <= 0) {
      setPriestScheduleRemarks([]);
      setPriestRemarksSummary(null);
      setPriestScheduleRemarksError("");
      return;
    }
    void loadPriestScheduleRemarks(Number(selectedPriestId));
  }, [selectedPriestId, adminID]);

  if (!user || accountType !== "admin") return null;

  const activeReligiousOrderOptions = useMemo(
    () =>
      religiousOrderOptions
        .filter((option) => option && option.active !== false && String(option.code || "").trim())
        .sort((a, b) => String(a.label || a.code || "").localeCompare(String(b.label || b.code || ""))),
    [religiousOrderOptions],
  );
  const activePriests = priests
    .filter((priest) => priest.isActive !== false)
    .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
  const inactivePriests = priests
    .filter((priest) => priest.isActive === false)
    .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
  const chooserPriests = [...activePriests, ...inactivePriests];
  const priestSchedules = calendarEntries
    .filter((entry) => {
      const scheduleType = String(entry.scheduleType || "").trim().toLowerCase();
      if (!["priest_schedule", "parish_event", "priest_activity"].includes(scheduleType)) return false;
      if (!(Number(entry.priestID) > 0)) return false;
      const assignedPriest = priests.find((priest) => Number(priest.priestID) === Number(entry.priestID));
      return assignedPriest?.isActive !== false;
    })
    .sort((a, b) => {
      const dateTimeA = `${a.eventDate || ""}T${a.startTime || "00:00"}:00`;
      const dateTimeB = `${b.eventDate || ""}T${b.startTime || "00:00"}:00`;
      return dateTimeA.localeCompare(dateTimeB);
    });
  const schedulesByPriest = priestSchedules.reduce((accumulator, entry) => {
    const key = Number(entry.priestID);
    if (!accumulator[key]) accumulator[key] = [];
    accumulator[key].push(entry);
    return accumulator;
  }, {});
  const selectedPriest = priests.find((item) => item.priestID === selectedPriestId) || null;
  const selectedPriestPasswordMethods = getPriestPasswordDeliveryMethods(selectedPriest);
  const selectedPriestPasswordMethod =
    selectedPriestPasswordMethods.find((method) => method.value === priestPasswordDeliveryMethod) ||
    selectedPriestPasswordMethods[0] ||
    null;
  const selectedPriestClergyType = selectedPriest ? normalizePriestClergyType(selectedPriest.clergyType) : PRIEST_CLERGY_TYPES.DIOCESAN;
  const selectedPriestReligiousOrderCode = selectedPriest ? normalizeReligiousOrderCode(selectedPriest.religiousOrderCode) : "";
  const selectedPriestReligiousOrderOption = activeReligiousOrderOptions.find(
    (option) => String(option.code || "").trim().toUpperCase() === selectedPriestReligiousOrderCode,
  );
  const selectedPriestReligiousOrderLabel = selectedPriestReligiousOrderOption
    ? selectedPriestReligiousOrderOption.label || selectedPriestReligiousOrderOption.code
    : selectedPriestReligiousOrderCode;
  const selectedPriestClergyLabel =
    selectedPriestClergyType === PRIEST_CLERGY_TYPES.RELIGIOUS
      ? selectedPriestReligiousOrderCode
        ? selectedPriestReligiousOrderLabel &&
          String(selectedPriestReligiousOrderLabel).trim().toUpperCase() !== selectedPriestReligiousOrderCode
          ? `Clergy Type: Religious (${selectedPriestReligiousOrderLabel} - ${selectedPriestReligiousOrderCode})`
          : `Clergy Type: Religious (${selectedPriestReligiousOrderCode})`
        : "Clergy Type: Religious (Religious order not set)"
      : "Clergy Type: Diocesan";
  const todayKey = getManilaDateKeyAndMinutes().dateKey;
  const selectedPriestSchedules = selectedPriest
    ? combineConsecutiveUnavailability(schedulesByPriest[selectedPriest.priestID] || [], todayKey).sort((a, b) => {
        const dateA = String(a.eventDate || "");
        const dateB = String(b.eventDate || "");
        const dateTimeA = `${dateA}T${a.startTime || "00:00"}:00`;
        const dateTimeB = `${dateB}T${b.startTime || "00:00"}:00`;
        const toneA = getScheduleStatus(a, todayKey).tone;
        const toneB = getScheduleStatus(b, todayKey).tone;
        const rankByTone = { upcoming: 0, today: 1, past: 2, unknown: 3 };
        const rankA = rankByTone[toneA] ?? 3;
        const rankB = rankByTone[toneB] ?? 3;
        if (rankA !== rankB) return rankA - rankB;
        if (toneA === "past") return dateTimeB.localeCompare(dateTimeA);
        return dateTimeA.localeCompare(dateTimeB);
      })
    : [];
  const upcomingSchedules = selectedPriestSchedules.filter((entry) => {
    const tone = getScheduleStatus(entry, todayKey).tone;
    return tone === "upcoming" || tone === "today";
  });
  const completedSchedules = selectedPriestSchedules.filter((entry) => {
    const tone = getScheduleStatus(entry, todayKey).tone;
    return tone === "past" || tone === "unknown";
  });
  const visibleSchedules = scheduleListView === "completed" ? completedSchedules : upcomingSchedules;
  const schedulePageCount = Math.max(1, Math.ceil(visibleSchedules.length / PRIEST_LIST_PAGE_SIZE));
  const safeSchedulePage = Math.min(schedulePage, schedulePageCount);
  const pagedSchedules = visibleSchedules.slice(
    (safeSchedulePage - 1) * PRIEST_LIST_PAGE_SIZE,
    safeSchedulePage * PRIEST_LIST_PAGE_SIZE,
  );
  // Unavailability appears in the lists, but it is not an assigned schedule in the priest's totals.
  const selectedAssignedSchedulesCount = selectedPriestSchedules.filter((entry) => !isPriestUnavailabilityEntry(entry)).length;
  const selectedCompletedSchedulesCount = completedSchedules.filter((entry) => !isPriestUnavailabilityEntry(entry)).length;
  const unreviewedRemarks = priestScheduleRemarks.filter((item) => !item.reviewedBySecretary);
  const reviewedRemarks = priestScheduleRemarks.filter((item) => item.reviewedBySecretary);
  const visibleRemarks = remarksListView === "reviewed" ? reviewedRemarks : unreviewedRemarks;
  const remarksPageCount = Math.max(1, Math.ceil(visibleRemarks.length / PRIEST_LIST_PAGE_SIZE));
  const safeRemarksPage = Math.min(remarksPage, remarksPageCount);
  const pagedRemarks = visibleRemarks.slice(
    (safeRemarksPage - 1) * PRIEST_LIST_PAGE_SIZE,
    safeRemarksPage * PRIEST_LIST_PAGE_SIZE,
  );
  const unreviewedRemarksCount = Number.isInteger(Number(priestRemarksSummary?.unreviewedRemarks))
    ? Number(priestRemarksSummary.unreviewedRemarks)
    : unreviewedRemarks.length;
  const selectedScheduleStatus = selectedScheduleEntry ? getScheduleStatus(selectedScheduleEntry, todayKey) : null;
  const selectedScheduleTheme = selectedScheduleEntry ? getScheduleEventTheme(selectedScheduleEntry) : null;
  const selectedScheduleIsUnavailability = isPriestUnavailabilityEntry(selectedScheduleEntry);
  const selectedScheduleTypeLabel = selectedScheduleEntry
    ? selectedScheduleIsUnavailability
      ? "Priest Unavailability"
      : String(selectedScheduleEntry.scheduleType || "") === "priest_schedule"
        ? "Priest Schedule"
        : "Parish Event"
    : "N/A";
  const toTimeInputValue = (value) => {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return "";
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  };
  const selectedScheduleIsAppointment = selectedScheduleEntry
    ? isAppointmentCalendarEntry(selectedScheduleEntry)
    : false;
  const selectedSpecialAppointment = selectedScheduleAppointments.find((appointment) => isSpecialProgramAppointment(appointment)) || null;
  const selectedScheduleIsSpecialAppointment = Boolean(selectedSpecialAppointment) || (
    selectedScheduleIsAppointment && isSpecialSacramentCalendarEntry(selectedScheduleEntry)
  );
  const selectedScheduleAppointmentId = (() => {
    const fromEntry = Number(selectedScheduleEntry?.appointmentID);
    if (Number.isInteger(fromEntry) && fromEntry > 0) return fromEntry;
    const titleMatch = String(selectedScheduleEntry?.title || "").match(/appointment\s*#\s*(\d+)/i);
    if (titleMatch) return Number(titleMatch[1]);
    const fromSpecial = Number(selectedSpecialAppointment?.appointmentID);
    if (Number.isInteger(fromSpecial) && fromSpecial > 0) return fromSpecial;
    const fromLinked = Number(selectedScheduleAppointments[0]?.appointmentID);
    return Number.isInteger(fromLinked) && fromLinked > 0 ? fromLinked : null;
  })();
  const handleCloseScheduleEntryModal = () => {
    setSelectedScheduleEntry(null);
    setSelectedScheduleAppointments([]);
    setScheduleAppointmentsError("");
    setIsEditingScheduleTime(false);
    setScheduleEditError("");
  };
  const handleOpenScheduleEditor = () => {
    if (!selectedScheduleEntry) return;
    const scheduleType = String(selectedScheduleEntry.scheduleType || "").trim().toLowerCase();
    const entryId = Number(selectedScheduleEntry.id || selectedScheduleEntry.calendarEntryID);
    if ((scheduleType === "parish_event" || isSpecialSacramentCalendarEntry(selectedScheduleEntry)) && Number.isInteger(entryId) && entryId > 0) {
      navigate(`/admin/dashboard?editCalendar=${entryId}`);
      return;
    }
    setScheduleEditDate(String(selectedScheduleEntry.eventDate || "").slice(0, 10));
    setScheduleEditStart(toTimeInputValue(selectedScheduleEntry.startTime));
    setScheduleEditEnd(toTimeInputValue(selectedScheduleEntry.endTime));
    setScheduleEditError("");
    setIsEditingScheduleTime(true);
  };
  const handleSaveScheduleTime = async () => {
    const entryId = Number(selectedScheduleEntry?.id || selectedScheduleEntry?.calendarEntryID);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      setScheduleEditError("This schedule cannot be updated.");
      return;
    }
    if (!scheduleEditDate || !scheduleEditStart || !scheduleEditEnd) {
      setScheduleEditError("Choose a date, start time, and end time.");
      return;
    }
    if (scheduleEditEnd <= scheduleEditStart) {
      setScheduleEditError("End time must be later than the start time.");
      return;
    }
    const toMinutes = (value) => {
      const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
      if (!match) return null;
      return Number(match[1]) * 60 + Number(match[2]);
    };
    const nextStart = toMinutes(scheduleEditStart);
    const nextEnd = toMinutes(scheduleEditEnd);
    const priestID = Number(selectedScheduleEntry.priestID) || Number(selectedPriestId);
    const overlappingEntry = calendarEntries.find((entry) => {
      if (Number(entry.id || entry.calendarEntryID) === entryId) return false;
      if (String(entry.eventDate || "").slice(0, 10) !== scheduleEditDate) return false;
      if (Number(entry.priestID) !== priestID) return false;
      const start = toMinutes(entry.startTime);
      const end = toMinutes(entry.endTime);
      return start !== null && end !== null && nextStart < end && start < nextEnd;
    });
    if (overlappingEntry) {
      setScheduleEditError(`That time conflicts with "${getCalendarEntryDisplayTitle(overlappingEntry) || "another schedule"}". Choose a different time.`);
      return;
    }
    setIsSavingScheduleTime(true);
    setScheduleEditError("");
    try {
      const response = await fetch(`/admin-api/calendar-entries/${entryId}?adminID=${adminID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(selectedScheduleEntry.title || getCalendarEntryDisplayTitle(selectedScheduleEntry) || "").trim(),
          scheduleType: selectedScheduleEntry.scheduleType,
          eventDate: scheduleEditDate,
          startTime: scheduleEditStart,
          endTime: scheduleEditEnd,
          location: selectedScheduleEntry.location || null,
          notes: selectedScheduleEntry.notes || null,
          priestID: Number(selectedScheduleEntry.priestID) || Number(selectedPriestId) || null,
          adminID,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to update this schedule.");
      }
      const updatedEntry = {
        ...selectedScheduleEntry,
        ...(responseData.entry || responseData.calendarEntry || {}),
        eventDate: scheduleEditDate,
        startTime: scheduleEditStart,
        endTime: scheduleEditEnd,
      };
      setSelectedScheduleEntry(updatedEntry);
      setCalendarEntries((current) =>
        current.map((entry) =>
          Number(entry.id || entry.calendarEntryID) === entryId ? { ...entry, ...updatedEntry } : entry,
        ),
      );
      setIsEditingScheduleTime(false);
      pushUiNotice("Schedule date and time updated.");
      await loadCalendarEntries();
    } catch (error) {
      setScheduleEditError(error.message || "Unable to update this schedule.");
    } finally {
      setIsSavingScheduleTime(false);
    }
  };

  const handleTogglePriestStatus = async (priest) => {
    if (!priest || !Number.isInteger(adminID) || adminID <= 0) return;
    setFeedbackMessage("");
    setStatusTogglePriestId(priest.priestID);
    try {
      const response = await fetch(`/admin-api/priests/${priest.priestID}/toggle-status?adminID=${adminID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminID,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to update priest status.");
      }
      const updatedPriest = responseData?.priest || {};
      const successMessage = updatedPriest.isActive
        ? responseData.message || "Priest activated successfully. Their schedules are back on the calendar."
        : responseData.message || "Priest deactivated successfully. Their schedules are hidden from the calendar.";
      setFeedbackMessage(successMessage);
      pushUiNotice(successMessage);
      await loadPriests();
      await loadCalendarEntries();
    } catch (error) {
      setFeedbackMessage(error.message || "Unable to update priest status.");
    } finally {
      setStatusTogglePriestId(null);
    }
  };

  const resetAddPriestForm = () => {
    setNewPriestFirstName("");
    setNewPriestLastName("");
    setNewPriestEmail("");
    setNewPriestPhoneNumber("");
    setNewPriestClergyType(PRIEST_CLERGY_TYPES.DIOCESAN);
    setNewPriestReligiousOrderCode("");
    setNewPriestParishRole("");
    setFeedbackMessage("");
    setCreatedPriestResult(null);
    setCopiedPassword(false);
  };

  const closeAddPriestModal = () => {
    if (isSavingPriest) return;
    setIsAddPriestModalOpen(false);
    resetAddPriestForm();
  };

  const handleCopyTemporaryPassword = async (password) => {
    const nextPassword = String(password || "").trim();
    if (!nextPassword) return;
    try {
      await navigator.clipboard.writeText(nextPassword);
      setCopiedPassword(true);
    } catch {
      setCopiedPassword(false);
    }
  };

  const handleAddPriest = async (event) => {
    event.preventDefault();
    setFeedbackMessage("");

    const fullName = joinPersonName(newPriestFirstName, newPriestLastName);
    const email = String(newPriestEmail || "").trim().toLowerCase();
    const phoneNumber = String(newPriestPhoneNumber || "").trim();
    const clergyType = normalizePriestClergyType(newPriestClergyType);
    const religiousOrderCode = normalizeReligiousOrderCode(newPriestReligiousOrderCode);
    if (!String(newPriestFirstName || "").trim() || !String(newPriestLastName || "").trim()) {
      setFeedbackMessage("Please enter the priest's first name and last name.");
      return;
    }
    const identifierError = getPriestLoginIdentifierError(email, phoneNumber);
    if (identifierError) {
      setFeedbackMessage(identifierError);
      return;
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setFeedbackMessage("Unable to detect admin account.");
      return;
    }
    if (clergyType === PRIEST_CLERGY_TYPES.RELIGIOUS && !religiousOrderCode) {
      setFeedbackMessage("Please select a religious order for religious clergy.");
      return;
    }

    setIsSavingPriest(true);
    try {
      const response = await fetch("/admin-api/priests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: String(newPriestFirstName || "").trim(),
          lastName: String(newPriestLastName || "").trim(),
          fullName,
          email,
          phoneNumber,
          adminID,
          clergyType,
          religiousOrderCode: clergyType === PRIEST_CLERGY_TYPES.RELIGIOUS ? religiousOrderCode : null,
          parishRole: normalizePriestParishRole(newPriestParishRole) || null,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to add priest.");
      }

      const successMessage = String(responseData?.message || "").trim() || "Priest added successfully.";
      const temporaryPassword = String(responseData?.temporaryPassword || "").trim();
      const emailDeliveryError = String(responseData?.emailDeliveryError || "").trim();
      const createdPriest = responseData?.priest || {};
      const createdPriestID = Number(createdPriest.priestID);

      setNewPriestFirstName("");
      setNewPriestLastName("");
      setNewPriestEmail("");
      setNewPriestPhoneNumber("");
      setNewPriestClergyType(PRIEST_CLERGY_TYPES.DIOCESAN);
      setNewPriestReligiousOrderCode("");
      setNewPriestParishRole("");
      setCopiedPassword(false);
      setCreatedPriestResult({
        fullName: createdPriest.fullName || fullName,
        email: String(createdPriest.email || email || "").trim(),
        phoneNumber: String(createdPriest.phoneNumber || phoneNumber || "").trim(),
        temporaryPassword,
        credentialsEmailed: Boolean(responseData?.credentialsEmailed) && !emailDeliveryError,
        emailDeliveryError,
        message: successMessage,
      });
      setFeedbackMessage("");
      pushUiNotice("Priest account created.");
      if (Number.isInteger(createdPriestID) && createdPriestID > 0) {
        setSelectedPriestId(createdPriestID);
      }
      await loadPriests();
    } catch (error) {
      setFeedbackMessage(error.message || "Unable to add priest.");
    } finally {
      setIsSavingPriest(false);
    }
  };

  useEffect(() => {
    if (!selectedPriest) {
      setEditPriestFirstName("");
      setEditPriestLastName("");
      setEditPriestEmail("");
      setEditPriestPhoneNumber("");
      setEditPriestClergyType(PRIEST_CLERGY_TYPES.DIOCESAN);
      setEditPriestReligiousOrderCode("");
      setIsEditingPriestName(false);
      return;
    }
    const selectedName = splitPersonName(selectedPriest.fullName);
    setEditPriestFirstName(selectedName.firstName);
    setEditPriestLastName(selectedName.lastName);
    setEditPriestEmail(String(selectedPriest.email || "").trim().toLowerCase());
    setEditPriestPhoneNumber(String(selectedPriest.phoneNumber || "").trim());
    setEditPriestClergyType(normalizePriestClergyType(selectedPriest.clergyType));
    setEditPriestReligiousOrderCode(normalizeReligiousOrderCode(selectedPriest.religiousOrderCode));
  }, [selectedPriest]);

  // Reset the role field whenever the priest changes or the edit form opens or closes.
  useEffect(() => {
    setEditPriestParishRole(normalizePriestParishRole(selectedPriest?.parishRole));
  }, [selectedPriest, isEditingPriestName]);

  useEffect(() => {
    setPriestPasswordDeliveryMethod("");
    setIsPriestPasswordResetConfirmOpen(false);
    setPriestPasswordResetError("");
    setPriestPasswordResetSuccess("");
  }, [selectedPriestId]);

  const handleSavePriestName = async () => {
    if (!selectedPriest) return;
    const normalizedName = joinPersonName(editPriestFirstName, editPriestLastName);
    const normalizedEmail = String(editPriestEmail || "").trim().toLowerCase();
    const normalizedPhoneNumber = String(editPriestPhoneNumber || "").trim();
    const clergyType = normalizePriestClergyType(editPriestClergyType);
    const religiousOrderCode = normalizeReligiousOrderCode(editPriestReligiousOrderCode);
    if (!String(editPriestFirstName || "").trim() || !String(editPriestLastName || "").trim()) {
      setFeedbackMessage("Please enter the priest's first name and last name.");
      return;
    }
    const identifierError = getPriestLoginIdentifierError(normalizedEmail, normalizedPhoneNumber);
    if (identifierError) {
      setFeedbackMessage(identifierError);
      return;
    }
    if (clergyType === PRIEST_CLERGY_TYPES.RELIGIOUS && !religiousOrderCode) {
      setFeedbackMessage("Please select a religious order for religious clergy.");
      return;
    }
    setFeedbackMessage("");
    setIsSavingPriestName(true);
    try {
      const response = await fetch(`/admin-api/priests/${selectedPriest.priestID}?adminID=${adminID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: String(editPriestFirstName || "").trim(),
          lastName: String(editPriestLastName || "").trim(),
          fullName: normalizedName,
          email: normalizedEmail,
          phoneNumber: normalizedPhoneNumber,
          adminID,
          clergyType,
          religiousOrderCode: clergyType === PRIEST_CLERGY_TYPES.RELIGIOUS ? religiousOrderCode : null,
          parishRole: normalizePriestParishRole(editPriestParishRole) || null,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to update priest name.");
      }
      setFeedbackMessage("Priest information updated successfully.");
      pushUiNotice("Priest information updated successfully.");
      setIsEditingPriestName(false);
      await loadPriests();
    } catch (error) {
      setFeedbackMessage(error.message || "Unable to update priest information.");
    } finally {
      setIsSavingPriestName(false);
    }
  };

  const handleOpenPriestPasswordReset = () => {
    if (!selectedPriest) return;
    if (selectedPriest.isActive === false) {
      setPriestPasswordResetError("Activate this priest account before generating a new password.");
      return;
    }
    if (selectedPriestPasswordMethods.length === 0) {
      setPriestPasswordResetError("Add a valid Gmail address or phone number before generating a password.");
      return;
    }
    setPriestPasswordResetError("");
    setPriestPasswordResetSuccess("");
    setPriestPasswordDeliveryMethod(selectedPriestPasswordMethod?.value || "");
    setIsPriestPasswordResetConfirmOpen(true);
  };

  const handleGeneratePriestPassword = async () => {
    if (!selectedPriest || !selectedPriestPasswordMethod) {
      setPriestPasswordResetError("Choose a valid registered email or phone number.");
      return;
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setPriestPasswordResetError("Unable to detect admin account.");
      return;
    }
    setIsGeneratingPriestPassword(true);
    setPriestPasswordResetError("");
    setPriestPasswordResetSuccess("");
    try {
      const response = await fetch(`/admin-api/priests/${selectedPriest.priestID}/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminID,
          deliveryMethod: selectedPriestPasswordMethod.value,
        }),
      });
      const responseData = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseData?.message || "Unable to generate a new priest password.");
      }
      setPriestPasswordResetSuccess(responseData?.message || "The new password was sent successfully.");
      setIsPriestPasswordResetConfirmOpen(false);
      pushUiNotice(
        selectedPriestPasswordMethod.value === "sms"
          ? "Password SMS accepted for delivery."
          : "New priest password sent by email.",
      );
    } catch (error) {
      setPriestPasswordResetError(error.message || "Unable to generate a new priest password.");
    } finally {
      setIsGeneratingPriestPassword(false);
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
          <section className="dashboard-panel dashboard-hero priest-management-hero admin-list-hero">
            <div className="priest-hero-content">
              <h2>Priest Management <PageGuide pageKey="priest-management" /></h2>
            </div>
            <div className="view-mode-hero-actions">
              {selectedPriestId ? (
                <button
                  type="button"
                  className="priest-hero-add-button priest-hero-back-button"
                  aria-label="Back to priest directory"
                  title="Back to priest directory"
                  onClick={handleBackToPriestDirectory}
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  className="priest-hero-add-button"
                  aria-label="Open Add New Priest"
                  title="Add New Priest"
                  onClick={() => {
                    resetAddPriestForm();
                    setIsAddPriestModalOpen(true);
                  }}
                >
                  <UserPlus size={16} strokeWidth={2.2} />
                  Add Priest
                </button>
              )}
            </div>
          </section>

          <section className="dashboard-panel priest-details-panel">
            <div className="priest-details-shell">
              <div className="priest-schedule-panel priest-schedule-panel-full">
                {priests.length > 0 ? (
                  <>
                    {selectedPriest ? (
                      <>
                        <div className="priest-selected-profile-shell">
                          <article className="priest-selected-profile-card">
                            <div className="priest-profile-top priest-selected-profile-top">
                              <button
                                type="button"
                                className={`priest-profile-photo-button ${isPriestPickerOpen ? "is-open" : ""}`}
                                onClick={() => setIsPriestPickerOpen(true)}
                                aria-haspopup="dialog"
                                aria-expanded={isPriestPickerOpen}
                                aria-label="Choose another priest"
                                title="Choose another priest"
                              >
                                <span className="priest-profile-switch-icon" aria-hidden="true">
                                  <ChevronsUpDown size={13} strokeWidth={2.4} />
                                </span>
                                <img
                                  className="priest-profile-photo"
                                  src={resolvePriestPhotoSource(selectedPriest.photo, selectedPriest.linkedUserUpdatedAt) || defaultPriestAvatar}
                                  alt=""
                                  onError={(event) => {
                                    event.currentTarget.src = defaultPriestAvatar;
                                  }}
                                />
                              </button>
                              <div className="priest-selected-profile-identity">
                                <div className="priest-selected-profile-name-row">
                                  <h4>{selectedPriest.fullName || "Priest"}</h4>
                                  <div className="priest-detail-actions">
                                    <button
                                      type="button"
                                      className="priest-edit-button"
                                      onClick={() => {
                                        setFeedbackMessage("");
                                        const selectedName = splitPersonName(selectedPriest.fullName);
    setEditPriestFirstName(selectedName.firstName);
    setEditPriestLastName(selectedName.lastName);
                                        setEditPriestEmail(String(selectedPriest.email || "").trim().toLowerCase());
                                        setEditPriestPhoneNumber(String(selectedPriest.phoneNumber || "").trim());
                                        setEditPriestClergyType(normalizePriestClergyType(selectedPriest.clergyType));
                                        setEditPriestReligiousOrderCode(normalizeReligiousOrderCode(selectedPriest.religiousOrderCode));
                                        setIsEditingPriestName(true);
                                      }}
                                    >
                                      <Pencil size={15} />
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className={`priest-status-toggle-button ${selectedPriest.isActive === false ? "is-active" : "is-inactive"}`}
                                      onClick={() =>
                                        setStatusConfirmTarget({
                                          priest: selectedPriest,
                                          nextIsActive: selectedPriest.isActive === false,
                                        })
                                      }
                                      disabled={statusTogglePriestId !== null}
                                    >
                                      {statusTogglePriestId === selectedPriest.priestID
                                        ? "Updating..."
                                        : selectedPriest.isActive === false
                                          ? "Activate"
                                          : "Deactivate"}
                                    </button>
                                  </div>
                                </div>
                                <span className={`priest-status-chip ${selectedPriest.isActive === false ? "is-inactive" : "is-active"}`}>
                                  {selectedPriest.isActive === false ? "Inactive account" : "Active account"}
                                </span>
                              </div>
                            </div>
                            <div className="priest-profile-tags priest-selected-meta-tags">
                              <span className={`priest-type-chip ${selectedPriestClergyType === PRIEST_CLERGY_TYPES.RELIGIOUS ? "is-religious" : "is-diocesan"}`}>
                                {selectedPriestClergyLabel}
                              </span>
                              <span className="priest-order-chip">
                                Parish Role: {getPriestParishRoleLabel(selectedPriest.parishRole)}
                              </span>
                              <span className="priest-order-chip">
                                Email: {String(selectedPriest.email || "").trim() || "Not set"}
                              </span>
                              <span className="priest-order-chip">
                                Phone: {String(selectedPriest.phoneNumber || "").trim() || "Not set"}
                              </span>
                            </div>
                          </article>
                          <div className="priest-schedule-summary-grid">
                            <button
                              type="button"
                              className={`priest-schedule-summary-card ${detailView === "schedule" ? "is-active" : ""}`}
                              onClick={() => setDetailView("schedule")}
                            >
                              <span className="priest-stat-icon" aria-hidden="true">
                                <CalendarDays size={18} />
                              </span>
                              <div>
                                <p>Total Schedules</p>
                                <h5>{selectedAssignedSchedulesCount}</h5>
                              </div>
                            </button>
                            <button
                              type="button"
                              className={`priest-schedule-summary-card ${detailView === "schedule" && scheduleListView === "completed" ? "is-active" : ""}`}
                              onClick={() => {
                                setDetailView("schedule");
                                setScheduleListView("completed");
                                setSchedulePage(1);
                              }}
                            >
                              <span className="priest-stat-icon" aria-hidden="true">
                                <CheckCircle2 size={18} />
                              </span>
                              <div>
                                <p>Completed</p>
                                <h5>{selectedCompletedSchedulesCount}</h5>
                              </div>
                            </button>
                            <button
                              type="button"
                              className={`priest-schedule-summary-card ${detailView === "remarks" ? "is-active" : ""}`}
                              onClick={() => {
                                setDetailView("remarks");
                                setRemarksListView("needs-review");
                              }}
                            >
                              <span className="priest-stat-icon" aria-hidden="true">
                                <MessageSquare size={18} />
                              </span>
                              <div>
                                <p>Needs Review</p>
                                <h5>{unreviewedRemarksCount}</h5>
                              </div>
                            </button>
                          </div>
                        </div>
                        <div className="priest-schedule-scroll-body">
                          <div className="view-mode-content-bar priest-detail-layout-bar">
                          <div className="priest-detail-view-toggle" role="tablist" aria-label="Priest schedule and remarks">
                            <button
                              type="button"
                              role="tab"
                              aria-selected={detailView === "schedule"}
                              className={`priest-detail-view-button ${detailView === "schedule" ? "is-active" : ""}`}
                              onClick={() => {
                                setDetailView("schedule");
                                setScheduleListView("upcoming");
                                setSchedulePage(1);
                              }}
                            >
                              Full Schedule Details
                              <span>{selectedPriestSchedules.length}</span>
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={detailView === "remarks"}
                              className={`priest-detail-view-button ${detailView === "remarks" ? "is-active" : ""}`}
                              onClick={() => setDetailView("remarks")}
                            >
                              Priest Remarks
                              <span className={unreviewedRemarksCount > 0 ? "is-alert" : ""}>{unreviewedRemarksCount}</span>
                            </button>
                          </div>
                          <ViewModeToggle value={viewMode} onChange={setViewMode} />
                          </div>
                          {detailView === "schedule" ? (
                          <section className="priest-list-section priest-section-card">
                            <div className="priest-remarks-filter" role="tablist" aria-label="Schedule status">
                              <button
                                type="button"
                                role="tab"
                                aria-selected={scheduleListView === "upcoming"}
                                className={`priest-remarks-filter-button ${scheduleListView === "upcoming" ? "is-active" : ""}`}
                                onClick={() => {
                                  setScheduleListView("upcoming");
                                  setSchedulePage(1);
                                }}
                              >
                                Upcoming
                                <em>{upcomingSchedules.length}</em>
                              </button>
                              <button
                                type="button"
                                role="tab"
                                aria-selected={scheduleListView === "completed"}
                                className={`priest-remarks-filter-button ${scheduleListView === "completed" ? "is-active" : ""}`}
                                onClick={() => {
                                  setScheduleListView("completed");
                                  setSchedulePage(1);
                                }}
                              >
                                Completed
                                <em>{completedSchedules.length}</em>
                              </button>
                            </div>
                            {pagedSchedules.length > 0 ? (
                              <>
                              <ul className={`priest-schedule-list${viewMode === "grid" ? " is-grid" : ""}`}>
                                      {pagedSchedules.map((entry) => {
                                        const status = getScheduleStatus(entry, todayKey);
                                        const kindLabel = entry.kindLabel || getScheduleKindLabel(entry);
                                        const notesLabel = cleanScheduleNotes(entry.notes);
                                        const locationLabel = isPriestUnavailabilityEntry(entry)
                                          ? String(entry.location || "").trim()
                                          : String(entry.locationLabel || "").trim() ||
                                            getCalendarEntryLocationLabel(entry, { emptyLabel: "Parish" });
                                        const requesterName = String(entry.requesterFullName || "").trim();
                                        return (
                                          <li
                                            key={`priest-schedule-${entry.id}`}
                                            id={`priest-schedule-${entry.id}`}
                                            data-schedule-ids={getScheduleMemberIds(entry).join(" ")}
                                            className={`priest-schedule-card is-${status.tone} is-${entry.kind || "priest_schedule"}${
                                              getScheduleMemberIds(entry).some((id) => Number(id) === Number(searchParams.get("scheduleID")))
                                                ? " is-focus"
                                                : ""
                                            }`}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Open details for ${getCalendarEntryDisplayTitle(entry)}`}
                                            onClick={() => handleOpenScheduleEntry(entry)}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                handleOpenScheduleEntry(entry);
                                              }
                                            }}
                                          >
                                            <ScheduleDateBlock value={entry.eventDate} endValue={entry.rangeEndDate} />
                                            <div className="priest-card-body">
                                            <div className="priest-schedule-card-head">
                                              <div>
                                                <strong>{getCalendarEntryDisplayTitle(entry)}</strong>
                                                <p className="priest-schedule-card-kind">{kindLabel}</p>
                                              </div>
                                              <span className={`priest-schedule-status is-${status.tone}`}>{status.label}</span>
                                            </div>
                                            <p className="priest-schedule-card-when">{formatFormalScheduleWhen(entry)}</p>
                                            <div className="priest-schedule-card-meta">
                                              {locationLabel ? (
                                                <span>
                                                  <MapPin size={14} aria-hidden="true" />
                                                  {locationLabel}
                                                </span>
                                              ) : null}
                                              {requesterName ? (
                                                <span>
                                                  <UserRound size={14} aria-hidden="true" />
                                                  {requesterName}
                                                </span>
                                              ) : null}
                                            </div>
                                            {notesLabel ? <p className="priest-schedule-card-notes">{notesLabel}</p> : null}
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                    {visibleSchedules.length > PRIEST_LIST_PAGE_SIZE ? (
                                      <div className="priest-list-pagination" aria-label="Schedule pagination">
                                        <button
                                          type="button"
                                          className="priest-list-pagination-button"
                                          onClick={() => setSchedulePage(Math.max(1, safeSchedulePage - 1))}
                                          disabled={safeSchedulePage <= 1}
                                        >
                                          Previous
                                        </button>
                                        <span className="priest-list-pagination-label">
                                          Page {safeSchedulePage} of {schedulePageCount}
                                        </span>
                                        <button
                                          type="button"
                                          className="priest-list-pagination-button"
                                          onClick={() => setSchedulePage(Math.min(schedulePageCount, safeSchedulePage + 1))}
                                          disabled={safeSchedulePage >= schedulePageCount}
                                        >
                                          Next
                                        </button>
                                      </div>
                                    ) : null}
                              </>
                            ) : (
                              <div className="priest-empty-card" role="status">
                                <Inbox size={28} strokeWidth={1.5} aria-hidden="true" />
                                <p>
                                  {selectedPriestSchedules.length === 0
                                    ? "No schedules assigned to this priest yet."
                                    : scheduleListView === "completed"
                                      ? "No completed schedules yet."
                                      : "No upcoming schedules yet."}
                                </p>
                              </div>
                            )}
                          </section>
                          ) : (
                          <section className="priest-list-section priest-remarks-section priest-section-card">
                            <div className="priest-remarks-filter" role="tablist" aria-label="Priest remarks status">
                              <button
                                type="button"
                                role="tab"
                                aria-selected={remarksListView === "needs-review"}
                                className={`priest-remarks-filter-button ${remarksListView === "needs-review" ? "is-active" : ""}`}
                                onClick={() => {
                                  setRemarksListView("needs-review");
                                  setRemarksPage(1);
                                }}
                              >
                                Needs Review
                                <em className={unreviewedRemarks.length > 0 ? "is-alert" : ""}>{unreviewedRemarks.length}</em>
                              </button>
                              <button
                                type="button"
                                role="tab"
                                aria-selected={remarksListView === "reviewed"}
                                className={`priest-remarks-filter-button ${remarksListView === "reviewed" ? "is-active" : ""}`}
                                onClick={() => {
                                  setRemarksListView("reviewed");
                                  setRemarksPage(1);
                                }}
                              >
                                Reviewed
                                <em>{reviewedRemarks.length}</em>
                              </button>
                            </div>
                            {isLoadingPriestScheduleRemarks ? (
                              <p className="priest-empty">Loading priest remarks...</p>
                            ) : priestScheduleRemarksError ? (
                              <p className="priest-empty">{priestScheduleRemarksError}</p>
                            ) : visibleRemarks.length > 0 ? (
                              <>
                              <ul className={`priest-remarks-list${viewMode === "grid" ? " is-grid" : ""}`}>
                                {pagedRemarks.map((item) => (
                                  <li
                                    key={`priest-remark-${item.remarkID}`}
                                    id={`priest-remark-${item.remarkID}`}
                                    className={`priest-remark-card ${item.reviewedBySecretary ? "is-reviewed" : "is-pending"}${
                                      Number(focusedRemarkId) === Number(item.remarkID) ? " is-focus" : ""
                                    }`}
                                  >
                                    <ScheduleDateBlock value={item.eventDate} />
                                    <div className="priest-card-body">
                                    <div className="priest-remark-top">
                                      <div>
                                        <strong>{item.sacramentName || item.title || "Assigned Schedule"}</strong>
                                        {item.requesterFullName ? (
                                          <p className="priest-remark-requester">Requester: {item.requesterFullName}</p>
                                        ) : null}
                                      </div>
                                      <span className={`priest-schedule-status ${item.reviewedBySecretary ? "is-past" : "is-today"}`}>
                                        {item.reviewedBySecretary ? "Reviewed" : "Needs Review"}
                                      </span>
                                    </div>
                                    <div className="priest-schedule-card-meta">
                                      <span>
                                        <CalendarDays size={14} aria-hidden="true" />
                                        {formatLongDate(item.eventDate)}
                                      </span>
                                      <span>
                                        <Clock size={14} aria-hidden="true" />
                                        {to12HourTime(item.startTime)} - {to12HourTime(item.endTime)}
                                      </span>
                                      <span>
                                        <MapPin size={14} aria-hidden="true" />
                                        {item.location || "Location not set"}
                                      </span>
                                    </div>
                                    <blockquote className="priest-remark-quote">
                                      <MessageSquare size={16} aria-hidden="true" />
                                      <p>{item.remarks || "No remark text was submitted."}</p>
                                    </blockquote>
                                    <div className="priest-remark-footer">
                                      <p>
                                        Sent {formatDateTimeLabel(item.sentAt)}
                                        {item.reviewedBySecretary ? ` · Reviewed ${formatDateTimeLabel(item.reviewedAt)}` : ""}
                                      </p>
                                      <button
                                        type="button"
                                        className="priest-remark-review-button"
                                        onClick={() => void handleMarkRemarkReviewed(item)}
                                        disabled={item.reviewedBySecretary || Boolean(isMarkingRemarkReviewedById[item.remarkID])}
                                      >
                                        {item.reviewedBySecretary
                                          ? "Reviewed"
                                          : isMarkingRemarkReviewedById[item.remarkID]
                                            ? "Marking..."
                                            : "Mark as Reviewed"}
                                      </button>
                                    </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                              {visibleRemarks.length > PRIEST_LIST_PAGE_SIZE ? (
                                <div className="priest-list-pagination" aria-label="Remarks pagination">
                                  <button
                                    type="button"
                                    className="priest-list-pagination-button"
                                    onClick={() => setRemarksPage(Math.max(1, safeRemarksPage - 1))}
                                    disabled={safeRemarksPage <= 1}
                                  >
                                    Previous
                                  </button>
                                  <span className="priest-list-pagination-label">
                                    Page {safeRemarksPage} of {remarksPageCount}
                                  </span>
                                  <button
                                    type="button"
                                    className="priest-list-pagination-button"
                                    onClick={() => setRemarksPage(Math.min(remarksPageCount, safeRemarksPage + 1))}
                                    disabled={safeRemarksPage >= remarksPageCount}
                                  >
                                    Next
                                  </button>
                                </div>
                              ) : null}
                              </>
                            ) : (
                              <div className="priest-empty-card" role="status">
                                <MessageSquare size={28} strokeWidth={1.5} aria-hidden="true" />
                                <p>
                                  {priestScheduleRemarks.length === 0
                                    ? "No remarks submitted yet by this priest."
                                    : remarksListView === "reviewed"
                                      ? "No reviewed remarks yet."
                                      : "No priest remarks are waiting for review."}
                                </p>
                              </div>
                            )}
                          </section>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="priest-directory" aria-label="Priest directory">
                        <div className="priest-directory-header">
                          <div>
                            <h3>Priest Directory</h3>
                            <p>Select a priest to view their full schedule and remarks.</p>
                          </div>
                          <span>{priests.length} total</span>
                        </div>
                        {isLoadingPriests ? (
                          <p className="priest-empty" role="status">Loading priests...</p>
                        ) : (
                          <>
                            {activePriests.length > 0 ? (
                              <section className="priest-directory-group" aria-labelledby="active-priests-heading">
                                <h4 id="active-priests-heading">Active Priests <span>{activePriests.length}</span></h4>
                                <div className="priest-directory-grid">
                                  {activePriests.map((priest) => {
                                    const clergyType = normalizePriestClergyType(priest.clergyType);
                                    const clergyLabel =
                                      clergyType === PRIEST_CLERGY_TYPES.RELIGIOUS
                                        ? `Religious${priest.religiousOrderCode ? ` · ${priest.religiousOrderCode}` : ""}`
                                        : "Diocesan";
                                    return (
                                      <button
                                        key={`priest-directory-${priest.priestID}`}
                                        type="button"
                                        className="priest-directory-card"
                                        onClick={() => selectPriestById(priest.priestID)}
                                      >
                                        <img
                                          src={resolvePriestPhotoSource(priest.photo, priest.linkedUserUpdatedAt) || defaultPriestAvatar}
                                          alt=""
                                          onError={(event) => {
                                            event.currentTarget.src = defaultPriestAvatar;
                                          }}
                                        />
                                        <span className="priest-directory-card-copy">
                                          <strong>{priest.fullName || "Priest"}</strong>
                                          <small>{clergyLabel}</small>
                                          <PriestParishRoleBadge parishRole={priest.parishRole} />
                                        </span>
                                        <span className="priest-directory-card-status is-active">Active</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </section>
                            ) : null}
                            {inactivePriests.length > 0 ? (
                              <section className="priest-directory-group" aria-labelledby="inactive-priests-heading">
                                <h4 id="inactive-priests-heading">Inactive Accounts <span>{inactivePriests.length}</span></h4>
                                <div className="priest-directory-grid">
                                  {inactivePriests.map((priest) => (
                                    <button
                                      key={`priest-directory-${priest.priestID}`}
                                      type="button"
                                      className="priest-directory-card is-inactive"
                                      onClick={() => selectPriestById(priest.priestID)}
                                    >
                                      <img
                                        src={resolvePriestPhotoSource(priest.photo, priest.linkedUserUpdatedAt) || defaultPriestAvatar}
                                        alt=""
                                        onError={(event) => {
                                          event.currentTarget.src = defaultPriestAvatar;
                                        }}
                                      />
                                      <span className="priest-directory-card-copy">
                                        <strong>{priest.fullName || "Priest"}</strong>
                                        <small>Inactive account</small>
                                        <PriestParishRoleBadge parishRole={priest.parishRole} />
                                      </span>
                                      <span className="priest-directory-card-status is-inactive">Inactive</span>
                                    </button>
                                  ))}
                                </div>
                              </section>
                            ) : null}
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  isLoadingPriests ? (
                    <p className="priest-empty" role="status">Loading priests...</p>
                  ) : (
                    <div className="appointment-requests-empty-state" role="status">
                      <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                        <Users size={36} strokeWidth={1.5} />
                      </div>
                      <h3 className="appointment-requests-empty-state-title">No priests yet</h3>
                      <p className="appointment-requests-empty-state-text">
                        When you add a priest account, it will appear here so you can manage schedules and profile details.
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          </section>

        </section>
      </div>
      {isPriestPickerOpen ? (
        <div
          className="priest-picker-overlay"
          role="presentation"
          onClick={() => setIsPriestPickerOpen(false)}
        >
          <aside
            className="priest-picker-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Choose a priest"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="priest-picker-header">
              <div>
                <h3>Choose a priest</h3>
                <p>Select another priest to view their profile and schedule.</p>
              </div>
              <button
                type="button"
                className="priest-picker-close"
                onClick={() => setIsPriestPickerOpen(false)}
                aria-label="Close priest picker"
              >
                <X size={18} />
              </button>
            </header>
            <div className="priest-picker-grid">
              {chooserPriests.map((priest) => {
                const isSelected = Number(priest.priestID) === Number(selectedPriestId);
                return (
                  <button
                    key={`priest-picker-${priest.priestID}`}
                    type="button"
                    className={`priest-picker-item ${isSelected ? "is-selected" : ""} ${priest.isActive === false ? "is-inactive" : ""}`}
                    onClick={() => selectPriestById(priest.priestID)}
                    aria-pressed={isSelected}
                    title={priest.fullName}
                  >
                    <img
                      src={resolvePriestPhotoSource(priest.photo, priest.linkedUserUpdatedAt) || defaultPriestAvatar}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.src = defaultPriestAvatar;
                      }}
                    />
                    <span>{priest.fullName || "Priest"}</span>
                    {priest.isActive === false ? <em>Inactive</em> : null}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      ) : null}
      {selectedScheduleEntry ? (
        <div
          className="priest-modal-overlay"
          role="presentation"
          onClick={handleCloseScheduleEntryModal}
        >
          <section
            className="priest-modal-card priest-schedule-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Schedule event details"
            onClick={(event) => event.stopPropagation()}
            style={{
              "--event-accent": selectedScheduleTheme?.accent || "#7f1717",
              "--event-light": selectedScheduleTheme?.light || "#fffdf8",
              "--event-text": selectedScheduleTheme?.text || "#7f1717",
            }}
          >
            <header className="priest-schedule-detail-header">
              <div>
                <p className="priest-schedule-detail-kicker">
                  {selectedScheduleIsUnavailability ? "Priest unavailability" : "Parish event"}
                </p>
                <h3>{getCalendarEntryDisplayTitle(selectedScheduleEntry)}</h3>
                <p>{selectedScheduleIsUnavailability ? "Complete unavailability details" : "Complete event details"}</p>
              </div>
              <div className="priest-schedule-detail-header-side">
                <span className={`priest-schedule-status is-${selectedScheduleStatus?.tone || "unknown"}`}>
                  {selectedScheduleStatus?.label || "Unknown"}
                </span>
                <button
                  type="button"
                  className="priest-schedule-detail-close"
                  aria-label="Close event details"
                  onClick={handleCloseScheduleEntryModal}
                >
                  <X size={16} strokeWidth={2.2} />
                </button>
              </div>
            </header>
            {isEditingScheduleTime ? (
              <form
                className="priest-schedule-edit-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveScheduleTime();
                }}
              >
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={scheduleEditDate}
                    onChange={(event) => setScheduleEditDate(event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Start time</span>
                  <input
                    type="time"
                    value={scheduleEditStart}
                    onChange={(event) => setScheduleEditStart(event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>End time</span>
                  <input
                    type="time"
                    value={scheduleEditEnd}
                    onChange={(event) => setScheduleEditEnd(event.target.value)}
                    required
                  />
                </label>
                {scheduleEditError ? <p className="priest-feedback-message">{scheduleEditError}</p> : null}
              </form>
            ) : null}
            <div className={`priest-schedule-detail-grid${isEditingScheduleTime ? " is-hidden-while-editing" : ""}`}>
              <p>
                <span>Reference ID</span>
                #{selectedScheduleEntry.id || "N/A"}
                {selectedScheduleEntry.memberIds?.length > 1 ? ` + ${selectedScheduleEntry.memberIds.length - 1} more` : ""}
              </p>
              <p>
                <span>Event Type</span>
                {selectedScheduleTypeLabel}
              </p>
              <p>
                <span>Date</span>
                {formatScheduleDateLabel(selectedScheduleEntry)}
              </p>
              <p>
                <span>Time</span>
                {selectedScheduleIsUnavailability
                  ? formatOccupiedSlotsLabel(
                      selectedScheduleEntry.occupiedSlots,
                      selectedScheduleEntry.startTime,
                      selectedScheduleEntry.endTime,
                    ) || "Time not set"
                  : `${to12HourTime(selectedScheduleEntry.startTime)} - ${to12HourTime(selectedScheduleEntry.endTime)}`}
              </p>
              {!selectedScheduleIsUnavailability ? (
                <>
                  <p>
                    <span>Start Time</span>
                    {to12HourTime(selectedScheduleEntry.startTime)}
                  </p>
                  <p>
                    <span>End Time</span>
                    {to12HourTime(selectedScheduleEntry.endTime)}
                  </p>
                </>
              ) : null}
              <p>
                <span>Location</span>
                {selectedScheduleEntry.location || "Location not set"}
              </p>
              <p>
                <span>Assigned Priest</span>
                {selectedPriest?.fullName || "Not assigned"}
              </p>
              <p className="is-full">
                <span>Notes</span>
                {sanitizeScheduleNotes(selectedScheduleEntry.notes) || "N/A"}
              </p>
            </div>
            {!selectedScheduleIsUnavailability ? (
            <section className={`priest-schedule-appointments-section${isEditingScheduleTime ? " is-hidden-while-editing" : ""}`}>
              <h4>Appointment Submissions</h4>
              {isLoadingScheduleAppointments ? (
                <p className="priest-empty">Loading appointment details...</p>
              ) : scheduleAppointmentsError ? (
                <p className="priest-empty">{scheduleAppointmentsError}</p>
              ) : selectedScheduleAppointments.length > 0 ? (
                <ul className="priest-schedule-appointment-list">
                  {selectedScheduleAppointments.map((appointment) => {
                    const credentialEntries = Object.entries(
                      appointment.credentials && typeof appointment.credentials === "object" ? appointment.credentials : {},
                    );
                    return (
                      <li key={`schedule-appointment-${appointment.appointmentID}`} className="priest-schedule-appointment-card">
                        <div className="priest-schedule-appointment-top">
                          <strong>{appointment.requesterFullName || appointment.userFullName || "Unknown requester"}</strong>
                          <span className={`priest-schedule-status is-${appointment.isConducted ? "past" : "upcoming"}`}>
                            {appointment.status || "Unknown"}
                          </span>
                        </div>
                        <div className="priest-schedule-appointment-meta">
                          <p><span>Appointment ID</span>#{appointment.appointmentID || "N/A"}</p>
                          <p><span>Sacrament</span>{appointment.resolvedSacramentName || "N/A"}</p>
                          <p><span>Account Username</span>{appointment.userName || "N/A"}</p>
                          <p><span>Contact Number</span>{appointment.userContactNumber || "N/A"}</p>
                          <p><span>Address</span>{appointment.userAddress || "N/A"}</p>
                          <p><span>Scheduled DateTime</span>{formatDateTimeLabel(appointment.scheduledEventDateTime)}</p>
                          <p><span>Submitted At</span>{formatDateTimeLabel(appointment.createdAt)}</p>
                          <p><span>Finished At</span>{formatDateTimeLabel(appointment.finishedAt)}</p>
                          <p className="is-full"><span>Request Note</span>{appointment.note || "N/A"}</p>
                        </div>
                        <div className="priest-schedule-credential-block">
                          <h5>Submitted Form Details</h5>
                          {credentialEntries.length > 0 ? (
                            <div className="priest-schedule-credential-grid">
                              {credentialEntries.map(([fieldKey, fieldValue]) => (
                                <p key={`credential-${appointment.appointmentID}-${fieldKey}`}>
                                  <span>{formatCredentialFieldLabel(fieldKey)}</span>
                                  {formatCredentialFieldValue(fieldValue)}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="priest-empty">No additional form details submitted.</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="priest-empty">No linked appointment submissions found for this event date.</p>
              )}
            </section>
            ) : null}
            <div className="priest-modal-actions">
              {isEditingScheduleTime ? (
                <>
                  <button
                    type="button"
                    className="priest-modal-cancel-button"
                    onClick={() => {
                      setIsEditingScheduleTime(false);
                      setScheduleEditError("");
                    }}
                    disabled={isSavingScheduleTime}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="priest-account-submit"
                    onClick={() => void handleSaveScheduleTime()}
                    disabled={isSavingScheduleTime}
                  >
                    {isSavingScheduleTime ? "Saving..." : "Save schedule"}
                  </button>
                </>
              ) : (
                <>
                  {selectedScheduleStatus?.tone !== "past" && selectedScheduleStatus?.tone !== "unknown" && selectedScheduleIsAppointment && !selectedScheduleIsSpecialAppointment && !isSpecialSacramentCalendarEntry(selectedScheduleEntry) ? (
                    <button
                      type="button"
                      className="priest-account-submit"
                      onClick={() => {
                        if (selectedScheduleAppointmentId) {
                          navigate(`/admin/progress-tracker/${selectedScheduleAppointmentId}`);
                        }
                      }}
                    >
                      View Progress
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="priest-modal-cancel-button"
                    onClick={handleCloseScheduleEntryModal}
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
      {isAddPriestModalOpen ? (
        <div
          className="priest-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!createdPriestResult?.temporaryPassword) {
              closeAddPriestModal();
            }
          }}
        >
          <section
            className="priest-modal-card priest-schedule-detail-modal priest-account-modal"
            role="dialog"
            aria-modal="true"
            aria-label={createdPriestResult ? "Priest Account Created" : "Add New Priest"}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="priest-schedule-detail-header">
              <div>
                <p className="priest-schedule-detail-kicker">Priest Management</p>
                <h3>{createdPriestResult ? "Priest Account Created" : "Add New Priest"}</h3>
                <p>
                  {createdPriestResult
                    ? createdPriestResult.message
                    : "Register a priest account for parish scheduling and login."}
                </p>
              </div>
              <button
                type="button"
                className="priest-schedule-detail-close"
                onClick={closeAddPriestModal}
                disabled={isSavingPriest}
                aria-label="Close add priest"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </header>
            {createdPriestResult ? (
              <>
                <div className="priest-account-modal-body">
                  <dl className="priest-credentials-list">
                    <div className="priest-credentials-row">
                      <dt>Priest</dt>
                      <dd>{createdPriestResult.fullName}</dd>
                    </div>
                    <div className="priest-credentials-row">
                      <dt>Gmail login</dt>
                      <dd>{createdPriestResult.email || "Not set"}</dd>
                    </div>
                    <div className="priest-credentials-row">
                      <dt>Phone login</dt>
                      <dd>{createdPriestResult.phoneNumber || "Not set"}</dd>
                    </div>
                  </dl>
                  {createdPriestResult.credentialsEmailed ? (
                    <p className="priest-feedback-message">
                      The temporary password was emailed to {createdPriestResult.email}.
                    </p>
                  ) : null}
                  {createdPriestResult.emailDeliveryError ? (
                    <p className="priest-feedback-message is-warning">{createdPriestResult.emailDeliveryError}</p>
                  ) : null}
                  {createdPriestResult.temporaryPassword ? (
                    <div className="priest-temp-password">
                      <div>
                        <span>Temporary password</span>
                        <code>{createdPriestResult.temporaryPassword}</code>
                      </div>
                      <button
                        type="button"
                        className="priest-copy-password-button"
                        onClick={() => void handleCopyTemporaryPassword(createdPriestResult.temporaryPassword)}
                      >
                        <Copy size={15} />
                        {copiedPassword ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ) : null}
                  {!createdPriestResult.credentialsEmailed && createdPriestResult.temporaryPassword ? (
                    <p className="priest-account-hint">
                      Share this password with the priest. They can sign in with the Gmail or phone number on file, then change it on Profile.
                    </p>
                  ) : null}
                </div>
                <div className="priest-modal-actions">
                  <button type="button" className="priest-account-submit" onClick={closeAddPriestModal}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form className="priest-account-form" onSubmit={handleAddPriest}>
                <div className="priest-account-modal-body">
                  <div className="priest-account-field">
                    <label htmlFor="newPriestFirstName">First Name</label>
                    <input
                      id="newPriestFirstName"
                      type="text"
                      value={newPriestFirstName}
                      onChange={(event) => setNewPriestFirstName(event.target.value)}
                      placeholder="First name"
                      autoFocus
                      required
                    />
                  </div>
                  <div className="priest-account-field">
                    <label htmlFor="newPriestLastName">Last Name</label>
                    <input
                      id="newPriestLastName"
                      type="text"
                      value={newPriestLastName}
                      onChange={(event) => setNewPriestLastName(event.target.value)}
                      placeholder="Last name"
                      required
                    />
                  </div>
                  <div className="priest-account-field">
                    <label htmlFor="newPriestEmail">Gmail</label>
                    <input
                      id="newPriestEmail"
                      type="email"
                      value={newPriestEmail}
                      onChange={(event) => setNewPriestEmail(event.target.value)}
                      placeholder="name@gmail.com"
                    />
                  </div>
                  <div className="priest-account-field">
                    <label htmlFor="newPriestPhoneNumber">Phone Number</label>
                    <input
                      id="newPriestPhoneNumber"
                      type="tel"
                      value={newPriestPhoneNumber}
                      onChange={(event) => setNewPriestPhoneNumber(normalizeMobileInput(event.target.value))}
                      placeholder="09XXXXXXXXX"
                      inputMode="numeric"
                      maxLength={11}
                    />
                  </div>
                  <p className="priest-account-hint">Provide a Gmail address, a phone number, or both.</p>
                  <div
                    className={`priest-account-field${
                      newPriestClergyType === PRIEST_CLERGY_TYPES.RELIGIOUS ? "" : " is-wide"
                    }`}
                  >
                    <label htmlFor="newPriestClergyType">Clergy Type</label>
                    <select
                      id="newPriestClergyType"
                      value={newPriestClergyType}
                      onChange={(event) => {
                        const nextType = normalizePriestClergyType(event.target.value);
                        setNewPriestClergyType(nextType);
                        if (nextType !== PRIEST_CLERGY_TYPES.RELIGIOUS) {
                          setNewPriestReligiousOrderCode("");
                        }
                      }}
                    >
                      <option value={PRIEST_CLERGY_TYPES.DIOCESAN}>Diocesan</option>
                      <option value={PRIEST_CLERGY_TYPES.RELIGIOUS}>Religious Order</option>
                    </select>
                  </div>
                  {newPriestClergyType === PRIEST_CLERGY_TYPES.RELIGIOUS ? (
                    <div className="priest-account-field">
                      <label htmlFor="newPriestReligiousOrderCode">Religious Order</label>
                      <select
                        id="newPriestReligiousOrderCode"
                        value={newPriestReligiousOrderCode}
                        onChange={(event) => setNewPriestReligiousOrderCode(event.target.value)}
                      >
                        <option value="">Select religious order</option>
                        {activeReligiousOrderOptions.map((option) => (
                          <option key={`order-option-new-${option.code}`} value={option.code}>
                            {option.label || option.code} ({option.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="priest-account-field">
                    <label htmlFor="newPriestParishRole">Parish Role</label>
                    <select
                      id="newPriestParishRole"
                      value={newPriestParishRole}
                      onChange={(event) => setNewPriestParishRole(event.target.value)}
                    >
                      <option value="">Select parish role</option>
                      {PRIEST_PARISH_ROLE_OPTIONS.map((option) => (
                        <option key={`parish-role-new-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {feedbackMessage ? <p className="priest-feedback-message">{feedbackMessage}</p> : null}
                </div>
                <div className="priest-modal-actions">
                  <button
                    type="button"
                    className="priest-modal-cancel-button"
                    onClick={closeAddPriestModal}
                    disabled={isSavingPriest}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="priest-account-submit" disabled={isSavingPriest}>
                    <UserPlus size={16} />
                    {isSavingPriest ? "Saving..." : "Add Priest"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
      {isEditingPriestName && selectedPriest ? (
        <div
          className="priest-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!isSavingPriestName) {
              setIsEditingPriestName(false);
              const selectedName = splitPersonName(selectedPriest.fullName);
    setEditPriestFirstName(selectedName.firstName);
    setEditPriestLastName(selectedName.lastName);
              setEditPriestEmail(String(selectedPriest.email || "").trim().toLowerCase());
              setEditPriestPhoneNumber(String(selectedPriest.phoneNumber || "").trim());
              setEditPriestClergyType(normalizePriestClergyType(selectedPriest.clergyType));
              setEditPriestReligiousOrderCode(normalizeReligiousOrderCode(selectedPriest.religiousOrderCode));
            }
          }}
        >
          <section
            className="priest-modal-card priest-schedule-detail-modal priest-account-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit Priest"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="priest-schedule-detail-header">
              <div>
                <p className="priest-schedule-detail-kicker">Priest Management</p>
                <h3>Edit Priest</h3>
                <p>{selectedPriestClergyLabel || "Update priest details for the parish directory."}</p>
              </div>
              <button
                type="button"
                className="priest-schedule-detail-close"
                disabled={isSavingPriestName}
                aria-label="Close edit priest"
                onClick={() => {
                  setIsEditingPriestName(false);
                  const selectedName = splitPersonName(selectedPriest.fullName);
    setEditPriestFirstName(selectedName.firstName);
    setEditPriestLastName(selectedName.lastName);
                  setEditPriestEmail(String(selectedPriest.email || "").trim().toLowerCase());
                  setEditPriestPhoneNumber(String(selectedPriest.phoneNumber || "").trim());
                  setEditPriestClergyType(normalizePriestClergyType(selectedPriest.clergyType));
                  setEditPriestReligiousOrderCode(normalizeReligiousOrderCode(selectedPriest.religiousOrderCode));
                }}
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </header>
            <form className="priest-account-form" onSubmit={(event) => event.preventDefault()}>
              <div className="priest-account-modal-body">
                <div className="priest-account-field">
                  <label htmlFor="editPriestFirstName">First Name</label>
                  <input
                    id="editPriestFirstName"
                    type="text"
                    value={editPriestFirstName}
                    onChange={(event) => setEditPriestFirstName(event.target.value)}
                    placeholder="First name"
                    autoFocus
                    required
                  />
                </div>
                <div className="priest-account-field">
                  <label htmlFor="editPriestLastName">Last Name</label>
                  <input
                    id="editPriestLastName"
                    type="text"
                    value={editPriestLastName}
                    onChange={(event) => setEditPriestLastName(event.target.value)}
                    placeholder="Last name"
                    required
                  />
                </div>
                <div className="priest-account-field">
                  <label htmlFor="editPriestEmail">Gmail</label>
                  <input
                    id="editPriestEmail"
                    type="email"
                    value={editPriestEmail}
                    onChange={(event) => setEditPriestEmail(event.target.value)}
                    placeholder="name@gmail.com"
                  />
                </div>
                <div className="priest-account-field">
                  <label htmlFor="editPriestPhoneNumber">Phone Number</label>
                  <input
                    id="editPriestPhoneNumber"
                    type="tel"
                    value={editPriestPhoneNumber}
                    onChange={(event) => setEditPriestPhoneNumber(normalizeMobileInput(event.target.value))}
                    placeholder="09XXXXXXXXX"
                    inputMode="numeric"
                    maxLength={11}
                  />
                </div>
                <p className="priest-account-hint">Keep at least a Gmail address or a phone number for login.</p>
                <section className="priest-password-reset-panel" aria-label="Generate a priest password">
                  <div>
                    <h4>Generate a temporary password</h4>
                    <p>
                      Send a new password to this priest&apos;s saved contact. This replaces the current password and is limited
                      to one reset per 24 hours across email and SMS. Save contact changes above before sending to a new address or number.
                    </p>
                  </div>
                  <label htmlFor="priestPasswordDeliveryMethod">Send password by</label>
                  <select
                    id="priestPasswordDeliveryMethod"
                    value={selectedPriestPasswordMethod?.value || ""}
                    disabled={selectedPriestPasswordMethods.length === 0 || isGeneratingPriestPassword}
                    onChange={(event) => {
                      setPriestPasswordDeliveryMethod(event.target.value);
                      setPriestPasswordResetError("");
                      setPriestPasswordResetSuccess("");
                    }}
                  >
                    {selectedPriestPasswordMethods.length === 0 ? (
                      <option value="">No valid contact method available</option>
                    ) : (
                      selectedPriestPasswordMethods.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedPriest?.isActive === false ? (
                    <p className="priest-feedback-message is-warning" role="status">
                      Activate this priest account before generating a new password.
                    </p>
                  ) : null}
                  {priestPasswordResetError && !isPriestPasswordResetConfirmOpen ? (
                    <p className="priest-feedback-message is-warning" role="alert">{priestPasswordResetError}</p>
                  ) : null}
                  {priestPasswordResetSuccess ? (
                    <p className="priest-feedback-message" role="status">{priestPasswordResetSuccess}</p>
                  ) : null}
                  <button
                    type="button"
                    className="priest-account-submit priest-password-reset-button"
                    onClick={handleOpenPriestPasswordReset}
                    disabled={
                      selectedPriestPasswordMethods.length === 0 ||
                      selectedPriest?.isActive === false ||
                      isGeneratingPriestPassword ||
                      isSavingPriestName
                    }
                  >
                    <KeyRound size={15} />
                    Generate Password
                  </button>
                </section>
                <div
                  className={`priest-account-field${
                    editPriestClergyType === PRIEST_CLERGY_TYPES.RELIGIOUS ? "" : " is-wide"
                  }`}
                >
                  <label htmlFor="editPriestClergyType">Clergy Type</label>
                  <select
                    id="editPriestClergyType"
                    value={editPriestClergyType}
                    onChange={(event) => {
                      const nextType = normalizePriestClergyType(event.target.value);
                      setEditPriestClergyType(nextType);
                      if (nextType !== PRIEST_CLERGY_TYPES.RELIGIOUS) {
                        setEditPriestReligiousOrderCode("");
                      }
                    }}
                  >
                    <option value={PRIEST_CLERGY_TYPES.DIOCESAN}>Diocesan</option>
                    <option value={PRIEST_CLERGY_TYPES.RELIGIOUS}>Religious Order</option>
                  </select>
                </div>
                {editPriestClergyType === PRIEST_CLERGY_TYPES.RELIGIOUS ? (
                  <div className="priest-account-field">
                    <label htmlFor="editPriestReligiousOrderCode">Religious Order</label>
                    <select
                      id="editPriestReligiousOrderCode"
                      value={editPriestReligiousOrderCode}
                      onChange={(event) => setEditPriestReligiousOrderCode(event.target.value)}
                    >
                      <option value="">Select religious order</option>
                      {activeReligiousOrderOptions.map((option) => (
                        <option key={`order-option-edit-${option.code}`} value={option.code}>
                          {option.label || option.code} ({option.code})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="priest-account-field">
                  <label htmlFor="editPriestParishRole">Parish Role</label>
                  <select
                    id="editPriestParishRole"
                    value={editPriestParishRole}
                    onChange={(event) => setEditPriestParishRole(event.target.value)}
                  >
                    <option value="">Select parish role</option>
                    {PRIEST_PARISH_ROLE_OPTIONS.map((option) => (
                      <option key={`parish-role-edit-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {feedbackMessage ? <p className="priest-feedback-message">{feedbackMessage}</p> : null}
              </div>
              <div className="priest-modal-actions">
                <button
                  type="button"
                  className="priest-modal-cancel-button"
                  onClick={() => {
                    setIsEditingPriestName(false);
                    const selectedName = splitPersonName(selectedPriest.fullName);
    setEditPriestFirstName(selectedName.firstName);
    setEditPriestLastName(selectedName.lastName);
                    setEditPriestEmail(String(selectedPriest.email || "").trim().toLowerCase());
                    setEditPriestPhoneNumber(String(selectedPriest.phoneNumber || "").trim());
                    setEditPriestClergyType(normalizePriestClergyType(selectedPriest.clergyType));
                    setEditPriestReligiousOrderCode(normalizeReligiousOrderCode(selectedPriest.religiousOrderCode));
                  }}
                  disabled={isSavingPriestName}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="priest-account-submit"
                  disabled={isSavingPriestName}
                  onClick={() => setIsSaveConfirmOpen(true)}
                >
                  {isSavingPriestName ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {isPriestPasswordResetConfirmOpen && selectedPriest && selectedPriestPasswordMethod ? (
        <div
          className="priest-modal-overlay priest-password-reset-overlay"
          role="presentation"
          onClick={() => {
            if (!isGeneratingPriestPassword) {
              setIsPriestPasswordResetConfirmOpen(false);
              setPriestPasswordResetError("");
            }
          }}
        >
          <section
            className="priest-modal-card priest-password-reset-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm priest password generation"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="priest-schedule-detail-header">
              <div>
                <p className="priest-schedule-detail-kicker">Priest Management</p>
                <h3>Generate a new password?</h3>
                <p>{selectedPriest.fullName}</p>
              </div>
            </header>
            <div className="priest-password-reset-confirm-body">
              <p>
                A new temporary password will be sent by <strong>{selectedPriestPasswordMethod.value === "sms" ? "SMS" : "email"}</strong> to:
              </p>
              <strong>{selectedPriestPasswordMethod.destination}</strong>
              <p>The priest&apos;s current password will stop working. The new password will not be shown on this screen.</p>
              {priestPasswordResetError ? (
                <p className="priest-feedback-message is-warning" role="alert">{priestPasswordResetError}</p>
              ) : null}
            </div>
            <div className="priest-modal-actions">
              <button
                type="button"
                className="priest-modal-cancel-button"
                disabled={isGeneratingPriestPassword}
                onClick={() => {
                  setIsPriestPasswordResetConfirmOpen(false);
                  setPriestPasswordResetError("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="priest-account-submit"
                disabled={isGeneratingPriestPassword}
                onClick={() => void handleGeneratePriestPassword()}
              >
                {isGeneratingPriestPassword ? "Generating and sending..." : "Generate and send"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isSaveConfirmOpen ? (
        <div
          className="priest-confirm-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!isSavingPriestName) setIsSaveConfirmOpen(false);
          }}
        >
          <section
            className="priest-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save priest changes confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="priest-confirm-modal-body">
              <span className="priest-confirm-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Save priest changes?</h4>
              <p>This will update the selected priest details.</p>
            </div>
            <div className="priest-confirm-modal-actions">
              <button
                type="button"
                className="priest-confirm-btn secondary"
                onClick={() => setIsSaveConfirmOpen(false)}
                disabled={isSavingPriestName}
              >
                Cancel
              </button>
              <button
                type="button"
                className="priest-confirm-btn danger"
                onClick={() => {
                  setIsSaveConfirmOpen(false);
                  void handleSavePriestName();
                }}
                disabled={isSavingPriestName}
              >
                {isSavingPriestName ? "Saving..." : "Save"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {statusConfirmTarget ? (
        <div
          className="priest-confirm-modal-overlay"
          role="presentation"
          onClick={() => {
            if (statusTogglePriestId === null) setStatusConfirmTarget(null);
          }}
        >
          <section
            className="priest-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Change priest status confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="priest-confirm-modal-body">
              <span className="priest-confirm-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>{statusConfirmTarget.nextIsActive ? "Activate this priest?" : "Deactivate this priest?"}</h4>
              <p>
                {statusConfirmTarget.nextIsActive
                  ? `Activate ${statusConfirmTarget.priest.fullName}? Their calendar appointments will be restored to the parish calendar.`
                  : `Deactivate ${statusConfirmTarget.priest.fullName}? All of this priest's appointments will be removed from the calendar until the account is activated again.`}
              </p>
            </div>
            <div className="priest-confirm-modal-actions">
              <button
                type="button"
                className="priest-confirm-btn secondary"
                onClick={() => setStatusConfirmTarget(null)}
                disabled={statusTogglePriestId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`priest-confirm-btn ${statusConfirmTarget.nextIsActive ? "secondary" : "danger"}`}
                onClick={() => {
                  const target = statusConfirmTarget;
                  setStatusConfirmTarget(null);
                  void handleTogglePriestStatus(target.priest);
                }}
                disabled={statusTogglePriestId !== null}
              >
                {statusTogglePriestId === statusConfirmTarget.priest.priestID
                  ? "Updating..."
                  : statusConfirmTarget.nextIsActive
                    ? "Yes, Activate"
                    : "Yes, Deactivate"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminPriestManagement;
