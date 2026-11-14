import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Image as ImageIcon,
  Inbox,
  Megaphone,
  MessageSquareText,
  X,
} from "lucide-react";
import { PriestNoteComposer } from "../components/PriestScheduleNotes";
import DashboardWelcomeHeader from "../components/DashboardWelcomeHeader";
import { pushUiNotice } from "../utils/uiNotice";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import ParishActivityMediaCarousel from "../components/ParishActivityMediaCarousel";
import CalendarDayAgenda from "../components/CalendarDayAgenda";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { compareParishActivitiesNewestFirst } from "../utils/parishActivityOrder";
import {
  formatCalendarWeekday,
  formatPriestHonorificName,
  getCalendarDateColorClass,
  getCalendarEntryDisplayTitle,
  getCalendarEntryKind,
  shiftDateKey,
  sortCalendarEntriesByStartTime,
} from "../utils/parishSchedule";
import { getTrustedNow } from "../utils/parishClock";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminDashboard.css";
import "./AdminAppointmentRequests.css";
import "./PriestDashboard.css";

const resolveParishActivityImageSrc = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("data:") || normalized.startsWith("blob:") || /^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("/assets/parish-activity-media/")) {
    const fileName = normalized.split("/").pop();
    return fileName ? `/api/uploads/parish-activities/${fileName}` : normalized;
  }
  if (normalized.startsWith("/uploads/")) return `/api${normalized}`;
  return normalized;
};

const getParishActivityMediaReference = (item) => String(item?.filePath || item?.url || "").trim();

const getParishActivityCoverMedia = (entry) => {
  if (Array.isArray(entry?.media) && entry.media.length > 0) {
    const item = entry.media[0];
    const filePath = getParishActivityMediaReference(item);
    return {
      type: item?.type === "video" ? "video" : "image",
      filePath,
      url: filePath,
    };
  }
  const legacyImagePath = String(entry?.imageUrl || "").trim();
  return legacyImagePath ? { type: "image", filePath: legacyImagePath, url: legacyImagePath } : null;
};

const renderParishActivityCoverMedia = (entry) => {
  const coverMedia = getParishActivityCoverMedia(entry);
  const mediaReference = getParishActivityMediaReference(coverMedia);
  if (!mediaReference) {
    return <div className="admin-parish-activity-media-empty">No media available</div>;
  }
  const src = resolveParishActivityImageSrc(mediaReference);
  if (coverMedia.type === "video") {
    return <video src={src} muted playsInline preload="metadata" aria-label={entry?.title || "Parish activity"} />;
  }
  return (
    <>
      <img className="admin-parish-activity-media-backdrop" src={src} alt="" aria-hidden="true" />
      <img className="admin-parish-activity-media-main" src={src} alt={entry?.title || "Parish activity"} />
    </>
  );
};

const renderParishActivityMediaPreview = (item, altText = "Parish activity media") => {
  const mediaReference = getParishActivityMediaReference(item);
  if (!mediaReference) return null;
  const src = resolveParishActivityImageSrc(mediaReference);
  if (item.type === "video") {
    return <video src={src} controls playsInline preload="metadata" aria-label={altText} />;
  }
  return <img src={src} alt={altText} />;
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
  return legacyImagePath ? [{ type: "image", filePath: legacyImagePath, url: legacyImagePath }] : [];
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

const formatTimeRangeLabel = (startTime, endTime) => {
  const startLabel = startTime ? to12HourTime(startTime) : "";
  const endLabel = endTime ? to12HourTime(endTime) : "";
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || "Time not set";
};

const formatCalendarDateLabel = (value) => {
  if (!value) return "N/A";
  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "N/A";
  return parsedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

function PriestDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [priestData, setPriestData] = useState(null);
  const [parishName, setParishName] = useState("");
  const [phNowLabel, setPhNowLabel] = useState("");
  const [officeStatus, setOfficeStatus] = useState({ isOpen: null, statusLabel: "Loading..." });
  const [stats, setStats] = useState({
    totalSchedules: 0,
    upcomingSchedules: 0,
    completedSchedules: 0,
    totalRecords: 0,
    completedRecords: 0,
    pendingRecords: 0,
  });
  const [schedules, setSchedules] = useState([]);
  const [records, setRecords] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [priestNotes, setPriestNotes] = useState([]);
  const [calendarPriests, setCalendarPriests] = useState([]);
  const [dayOffWeekday, setDayOffWeekday] = useState(null);
  const [dayOffSpecificDates, setDayOffSpecificDates] = useState([]);
  const [halfDaySetting, setHalfDaySetting] = useState(null);
  const [parishActivities, setParishActivities] = useState([]);
  const [isLoadingParishActivities, setIsLoadingParishActivities] = useState(false);
  const [parishActivitiesError, setParishActivitiesError] = useState("");
  const lastPriestDashboardFetchRef = useRef(0);
  const [parishActivitySlideIndex, setParishActivitySlideIndex] = useState(0);
  const [isParishActivityDetailsModalOpen, setIsParishActivityDetailsModalOpen] = useState(false);
  const [selectedParishActivity, setSelectedParishActivity] = useState(null);
  const [selectedCalendarView, setSelectedCalendarView] = useState("mine");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const requestedDate = String(searchParams.get("date") || "");
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(requestedDate);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, 1);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    const requestedDate = String(searchParams.get("date") || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return requestedDate;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [isDateSchedulesModalOpen, setIsDateSchedulesModalOpen] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(searchParams.get("date") || "")),
  );
  const [dateScheduleSlideStep, setDateScheduleSlideStep] = useState(0);
  const [calendarNow, setCalendarNow] = useState(() => getTrustedNow());

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
  const viewerPriestID = Number(user?.priestID || priestData?.priestID);
  const viewerAdminID = Number(user?.priestAdminID || priestData?.adminID);

  useEffect(() => {
    const updatePhTime = () => {
      setPhNowLabel(
        new Date().toLocaleString("en-US", {
          timeZone: "Asia/Manila",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    };
    updatePhTime();
    const intervalId = window.setInterval(updatePhTime, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let isActive = true;
    if (!Number.isInteger(viewerAdminID) || viewerAdminID <= 0) {
      setParishName("Our Lady of Guadalupe Parish - Villanueva");
      setOfficeStatus({ isOpen: null, statusLabel: "Unavailable" });
      return () => {
        isActive = false;
      };
    }

    const loadWelcomeDetails = async () => {
      const [profileResult, officeResult] = await Promise.allSettled([
        fetch(`/admin-api/profile?accountType=admin&accountID=${viewerAdminID}`).then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload?.message || "Unable to load parish profile.");
          return String(payload?.user?.parishName || "").trim();
        }),
        fetch(`/api/dashboard/office-status?adminID=${viewerAdminID}`).then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload?.message || "Unable to load office status.");
          return {
            isOpen: Boolean(payload?.office?.isOpen),
            statusLabel: String(payload?.office?.statusLabel || "").trim() || (payload?.office?.isOpen ? "Open" : "Closed"),
          };
        }),
      ]);
      if (!isActive) return;
      setParishName(
        profileResult.status === "fulfilled" && profileResult.value
          ? profileResult.value
          : String(user?.parishName || "").trim() || "Our Lady of Guadalupe Parish - Villanueva",
      );
      setOfficeStatus(
        officeResult.status === "fulfilled"
          ? officeResult.value
          : { isOpen: null, statusLabel: "Unavailable" },
      );
    };
    void loadWelcomeDetails();
    return () => {
      isActive = false;
    };
  }, [viewerAdminID, user?.parishName]);

  useEffect(() => {
    document.title = "Faithflow - Priest Dashboard";
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

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const loadDashboard = async () => {
    if (!Number.isInteger(priestID) || priestID <= 0) return;
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/priest/me/dashboard?priestID=${priestID}`);
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load priest dashboard.");
      }
      setPriestData(responseData?.priest || null);
      setStats(
        responseData?.stats || {
          totalSchedules: 0,
          upcomingSchedules: 0,
          completedSchedules: 0,
          totalRecords: 0,
          completedRecords: 0,
          pendingRecords: 0,
        },
      );
      setSchedules(Array.isArray(responseData?.schedules) ? responseData.schedules : []);
      setRecords(Array.isArray(responseData?.records) ? responseData.records : []);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load priest dashboard.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPriestNotes = async () => {
    if (!Number.isInteger(priestID) || priestID <= 0) return;
    try {
      const response = await fetch(`/api/priest/me/schedule-notes?priestID=${priestID}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseData.message || "Unable to load your schedule notes.");
      setPriestNotes(Array.isArray(responseData?.notes) ? responseData.notes : []);
    } catch (error) {
      setCalendarError(error.message || "Unable to load your schedule notes.");
    }
  };

  const handleSubmitPriestNote = async (payload) => {
    const response = await fetch(`/api/priest/me/schedule-notes?priestID=${priestID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseData.message || "Unable to send your note right now.");
    const dayCount = Array.isArray(payload?.noteDates) ? payload.noteDates.length : 1;
    pushUiNotice(dayCount > 1 ? `Your unavailability request was sent for ${dayCount} days.` : "Your note was sent to the parish office.");
    await loadPriestNotes();
  };

  const handleWithdrawPriestNote = async (note) => {
    const response = await fetch(`/api/priest/me/schedule-notes/${note.noteID}?priestID=${priestID}`, { method: "DELETE" });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseData.message || "Unable to withdraw this note.");
    pushUiNotice(responseData.message || "Your note was withdrawn.");
    await loadPriestNotes();
  };

  const loadCalendarEntries = async () => {
    if (!Number.isInteger(priestID) || priestID <= 0) return;
    setIsLoadingCalendar(true);
    setCalendarError("");
    try {
      const params = new URLSearchParams({ priestID: String(priestID) });
      if (selectedCalendarView === "all") {
        params.set("scope", "all");
      } else if (selectedCalendarView.startsWith("priest:")) {
        const targetPriestID = Number(selectedCalendarView.replace("priest:", ""));
        if (Number.isInteger(targetPriestID) && targetPriestID > 0) {
          params.set("scope", "priest");
          params.set("targetPriestID", String(targetPriestID));
        } else {
          params.set("scope", "mine");
        }
      } else {
        params.set("scope", "mine");
      }

      const response = await fetch(`/api/priest/me/sacramental-calendar?${params.toString()}`);
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load priest calendar.");
      }
      const nextEvents = (Array.isArray(responseData?.events) ? responseData.events : []).filter((entry) => {
        const scheduleType = String(entry?.scheduleType || "").trim().toLowerCase();
        if (scheduleType === "parish_event") return true;
        const priestName = String(entry?.priestName || "").trim();
        const priestID = Number(entry?.priestID);
        return Boolean(priestName) && Number.isInteger(priestID) && priestID > 0;
      });
      setCalendarEvents(nextEvents);
      setCalendarPriests(Array.isArray(responseData?.priests) ? responseData.priests : []);
    } catch (error) {
      setCalendarEvents([]);
      setCalendarError(error.message || "Unable to load priest calendar.");
    } finally {
      setIsLoadingCalendar(false);
    }
  };

  const loadDayOffSettings = async () => {
    if (!Number.isInteger(viewerAdminID) || viewerAdminID <= 0) {
      setDayOffWeekday(null);
      setDayOffSpecificDates([]);
      setHalfDaySetting(null);
      return;
    }
    try {
      const response = await fetch(`/api/day-offs?adminID=${viewerAdminID}`);
      const responseData = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseData?.message || "Unable to load day-off settings.");
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
        halfDayRaw &&
          Number.isInteger(halfDayWeekday) &&
          halfDayWeekday >= 0 &&
          halfDayWeekday <= 6 &&
          halfDayRaw.startTime &&
          halfDayRaw.endTime
          ? {
              weekday: halfDayWeekday,
              startTime: String(halfDayRaw.startTime),
              endTime: String(halfDayRaw.endTime),
            }
          : null,
      );
    } catch (error) {
      setCalendarError(error.message || "Unable to load parish calendar day-off settings.");
    }
  };

  const loadParishActivities = async ({ silent = false } = {}) => {
    if (!Number.isInteger(viewerAdminID) || viewerAdminID <= 0) {
      setParishActivities([]);
      setParishActivitiesError("");
      setIsLoadingParishActivities(false);
      return;
    }

    if (!silent) {
      setIsLoadingParishActivities(true);
      setParishActivitiesError("");
    }
    try {
      const response = await fetch(`/api/parish-activities?adminID=${viewerAdminID}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData?.message || "Unable to load parish activities.");
      }
      const normalized = (Array.isArray(responseData) ? responseData : [])
        .filter((entry) => Number.isInteger(Number(entry?.id)) && Number(entry.id) > 0);
      setParishActivities(normalized);
    } catch (error) {
      setParishActivities([]);
      setParishActivitiesError(error.message || "Unable to load parish activities.");
    } finally {
      if (!silent) setIsLoadingParishActivities(false);
    }
  };

  useEffect(() => {
    const tickCalendarClock = () => setCalendarNow(getTrustedNow());
    tickCalendarClock();
    const intervalId = window.setInterval(tickCalendarClock, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    lastPriestDashboardFetchRef.current = Date.now();
    void loadDashboard();
    void loadPriestNotes();
  }, [priestID]);

  useEffect(() => {
    void loadCalendarEntries();
  }, [priestID, selectedCalendarView]);

  useEffect(() => {
    void loadDayOffSettings();
  }, [viewerAdminID]);

  useEffect(() => {
    void loadParishActivities();
  }, [viewerAdminID]);

  useEffect(() => {
    const refreshDashboardData = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastPriestDashboardFetchRef.current < 20000) return;
      lastPriestDashboardFetchRef.current = now;
      void loadDashboard();
      void loadCalendarEntries();
      void loadParishActivities({ silent: true });
      void loadDayOffSettings();
      void loadPriestNotes();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshDashboardData();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshDashboardData);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshDashboardData);
    };
  }, [priestID, selectedCalendarView, viewerAdminID]);

  useEffect(() => {
    const activityCount = parishActivities.filter((entry) => Number.isInteger(Number(entry?.id)) && Number(entry.id) > 0).length;
    if (activityCount === 0 && parishActivitySlideIndex !== 0) {
      setParishActivitySlideIndex(0);
      return;
    }
    if (activityCount > 0 && parishActivitySlideIndex > activityCount - 1) {
      setParishActivitySlideIndex(activityCount - 1);
    }
  }, [parishActivities, parishActivitySlideIndex]);

  useEffect(() => {
    if (!isDateSchedulesModalOpen) {
      setDateScheduleSlideStep(0);
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setDateScheduleSlideStep((current) => {
        if (current !== 0) return current;
        return event.key === "ArrowLeft" ? -1 : 1;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDateSchedulesModalOpen]);

  if (!user || accountType !== "priest") return null;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstDayIndex = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const priestNotesByDate = priestNotes.reduce((acc, note) => {
    const noteDate = String(note?.noteDate || "").slice(0, 10);
    if (!noteDate) return acc;
    acc[noteDate] = acc[noteDate] || [];
    acc[noteDate].push(note);
    return acc;
  }, {});

  const entriesByDate = calendarEvents.reduce((acc, entry) => {
    const eventDate = String(entry?.eventDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return acc;
    acc[eventDate] = acc[eventDate] || [];
    acc[eventDate].push(entry);
    return acc;
  }, {});

  const selectedDateEntries = selectedDate ? sortCalendarEntriesByStartTime(entriesByDate[selectedDate] || []) : [];
  const selectedDateTitle = selectedDate === todayString ? "Today's Schedule" : `Schedule for ${formatCalendarDateLabel(selectedDate)}`;
  const visibleScheduleDate =
    dateScheduleSlideStep === 0 ? selectedDate : shiftDateKey(selectedDate, dateScheduleSlideStep);
  const selectedDateLabel = formatCalendarDateLabel(visibleScheduleDate);
  const scheduleSlideDates = [-1, 0, 1].map((offset) => shiftDateKey(selectedDate, offset));
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
  const getScheduleDateMeta = (dateKey) => {
    const normalizedDate = String(dateKey || "").trim();
    const dayOfWeek = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)
      ? new Date(`${normalizedDate}T00:00:00`).getDay()
      : null;
    return {
      dateKey: normalizedDate,
      entries: sortCalendarEntriesByStartTime(entriesByDate[normalizedDate] || []),
      isDayOff:
        Boolean(normalizedDate) &&
        (dayOffSpecificDates.includes(normalizedDate) || dayOffWeekday === dayOfWeek),
      isHalfDay:
        Boolean(normalizedDate) &&
        Boolean(halfDaySetting) &&
        halfDaySetting.weekday === dayOfWeek &&
        !dayOffSpecificDates.includes(normalizedDate) &&
        dayOffWeekday !== dayOfWeek,
    };
  };
  const selectedDateDayOfWeek = selectedDate ? new Date(`${selectedDate}T00:00:00`).getDay() : null;
  const isSelectedDateDayOff = selectedDate
    ? dayOffSpecificDates.includes(selectedDate) || dayOffWeekday === selectedDateDayOfWeek
    : false;
  const recentParishActivities = [...parishActivities]
    .filter((entry) => Number.isInteger(Number(entry?.id)) && Number(entry.id) > 0)
    .sort(compareParishActivitiesNewestFirst);
  const safeParishActivitySlideIndex =
    recentParishActivities.length > 0
      ? Math.max(0, Math.min(parishActivitySlideIndex, recentParishActivities.length - 1))
      : 0;

  const openParishActivityDetailsModal = (entry) => {
    setSelectedParishActivity(entry || null);
    setIsParishActivityDetailsModalOpen(true);
  };

  const closeParishActivityDetailsModal = () => {
    setIsParishActivityDetailsModalOpen(false);
    setSelectedParishActivity(null);
  };

  const getDateCellClass = (dayNumber) => {
    const dateString = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    const dateEvents = entriesByDate[dateString] || [];
    const dayOfWeek = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), dayNumber).getDay();
    const isSpecificDayOff = dayOffSpecificDates.includes(dateString);
    if (isSpecificDayOff || dayOffWeekday === dayOfWeek) return "is-day-off";
    const entryClass = getCalendarDateColorClass(dateEvents, dateString, calendarNow);
    if (halfDaySetting && halfDaySetting.weekday === dayOfWeek) {
      return [entryClass, "is-half-day"].filter(Boolean).join(" ");
    }
    return entryClass;
  };

  const refreshAll = async () => {
    await Promise.all([loadDashboard(), loadCalendarEntries(), loadDayOffSettings()]);
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
          <DashboardWelcomeHeader
            parishName={parishName || "Our Lady of Guadalupe Parish - Villanueva"}
            timeLabel={phNowLabel}
            officeStatus={officeStatus}
          />

          <section className="admin-content-grid priest-dashboard-calendar-layout">
            <div className="admin-left-column">
              <section className="dashboard-panel priest-dashboard-summary" aria-label="Priest dashboard summary">
                <article className="priest-summary-card is-total-schedules">
                  <span className="priest-summary-icon"><CalendarDays size={18} aria-hidden="true" /></span>
                  <div><p>Total Schedules</p><h3>{Number(stats?.totalSchedules) || 0}</h3></div>
                </article>
                <article className="priest-summary-card is-upcoming">
                  <span className="priest-summary-icon priest-summary-icon-admin"><Clock3 size={18} aria-hidden="true" /></span>
                  <div><p>Upcoming</p><h3>{Number(stats?.upcomingSchedules) || 0}</h3></div>
                </article>
                <article className="priest-summary-card is-completed">
                  <span className="priest-summary-icon"><CheckCircle2 size={18} aria-hidden="true" /></span>
                  <div><p>Completed</p><h3>{Number(stats?.completedSchedules) || 0}</h3></div>
                </article>
                <article className="priest-summary-card is-total-records">
                  <span className="priest-summary-icon priest-summary-icon-admin"><FileText size={18} aria-hidden="true" /></span>
                  <div><p>Total Records</p><h3>{Number(stats?.totalRecords) || 0}</h3></div>
                </article>
                <article className="priest-summary-card is-completed-records">
                  <span className="priest-summary-icon"><BadgeCheck size={18} aria-hidden="true" /></span>
                  <div><p>Completed Records</p><h3>{Number(stats?.completedRecords) || 0}</h3></div>
                </article>
                <article className="priest-summary-card is-pending-records">
                  <span className="priest-summary-icon"><Inbox size={18} aria-hidden="true" /></span>
                  <div><p>Pending Records</p><h3>{Number(stats?.pendingRecords) || 0}</h3></div>
                </article>
              </section>

              <section className="dashboard-panel priest-selected-day-panel" aria-live="polite">
                <header className="priest-selected-day-header">
                  <div>
                    <h3 className="priest-selected-day-title"><CalendarDays size={18} aria-hidden="true" /> {selectedDateTitle}</h3>
                  </div>
                  <span className="priest-selected-day-count">
                    {selectedDateEntries.length} {selectedDateEntries.length === 1 ? "item" : "items"}
                  </span>
                </header>
                {isLoadingCalendar ? (
                  <p className="priest-selected-day-message">Loading this day’s schedule...</p>
                ) : selectedDateEntries.length > 0 ? (
                  <ul className="priest-selected-day-list">
                    {selectedDateEntries.map((entry) => {
                      const kind = getCalendarEntryKind(entry);
                      return (
                        <li key={`selected-day-${entry.id || entry.calendarID || getCalendarEntryDisplayTitle(entry)}`} className={`priest-selected-day-entry is-${kind.id}`}>
                          <span className="priest-selected-day-entry-icon" aria-hidden="true">
                            {kind.id === "appointment" ? <CalendarDays size={16} /> : <Clock3 size={16} />}
                          </span>
                          <span className="priest-selected-day-entry-copy">
                            <strong>{getCalendarEntryDisplayTitle(entry)}</strong>
                            <small>{kind.label}</small>
                            <em>{formatTimeRangeLabel(entry.startTime, entry.endTime)}</em>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className={`priest-selected-day-empty${isSelectedDateDayOff ? " is-day-off" : ""}`}>
                    <span className="priest-selected-day-empty-icon" aria-hidden="true">
                      {isSelectedDateDayOff ? <Inbox size={20} /> : <CalendarDays size={20} />}
                    </span>
                    <div>
                      <strong>No appointments or events</strong>
                      <p>
                        {isSelectedDateDayOff
                          ? "The parish is marked as closed for this day."
                          : `There are no appointments, parish events, or priest schedules for ${formatCalendarDateLabel(selectedDate)}.`}
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </div>
            <div className="admin-right-column">
              <section className="dashboard-panel admin-content-card admin-calendar-card priest-calendar-panel">
            <header className="admin-content-header">
              <h3>
                <CalendarDays size={18} aria-hidden="true" />
                Calendar
              </h3>
              <div className="priest-calendar-view-filter">
                <select
                  className="appointment-filter-select"
                  aria-label="Calendar schedule"
                  value={selectedCalendarView}
                  onChange={(event) => setSelectedCalendarView(event.target.value)}
                >
                  <option value="mine">My Calendar Appointments</option>
                  <option value="all">All Priests</option>
                  {calendarPriests
                    .filter((priest) => Number(priest?.priestID) > 0 && Number(priest?.priestID) !== viewerPriestID)
                    .map((priest) => (
                      <option key={`calendar-priest-${priest.priestID}`} value={`priest:${priest.priestID}`}>
                        {priest.fullName}
                      </option>
                    ))}
                </select>
              </div>
            </header>

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
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <strong className="admin-month-label">{monthLabel}</strong>
              <button
                type="button"
                className="admin-icon-nav"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {calendarError ? <p className="priest-dashboard-error">{calendarError}</p> : null}
            {isLoadingCalendar ? <p className="priest-dashboard-empty">Loading calendar schedules...</p> : null}

            <div className="admin-calendar-grid">
              {dayNames.map((day) => (
                <span key={day} className="admin-calendar-day">
                  {day}
                </span>
              ))}
              {Array.from({ length: firstDayIndex }).map((_, index) => (
                <span key={`calendar-blank-${index}`} className="admin-calendar-date is-empty" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, index) => {
                const dayNumber = index + 1;
                const dateString = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
                const cellClass = getDateCellClass(dayNumber);
                const entryCount = (entriesByDate[dateString] || []).length;
                const noteCount = (priestNotesByDate[dateString] || []).length;
                return (
                  <button
                    key={`priest-calendar-day-${dayNumber}`}
                    type="button"
                    className={`admin-calendar-date${cellClass ? ` ${cellClass}` : ""}${selectedDate === dateString ? " is-selected" : ""}${todayString === dateString ? " is-today" : ""}${noteCount > 0 ? " has-priest-note" : ""}`}
                    onClick={() => {
                      setSelectedDate(dateString);
                      setIsDateSchedulesModalOpen(true);
                    }}
                    aria-label={`View schedules for ${dateString}`}
                  >
                    <span className="admin-calendar-date-number">{dayNumber}</span>
                    {entryCount > 0 ? <span className="admin-calendar-entry-count">{entryCount}</span> : null}
                    {noteCount > 0 ? (
                      <span className="admin-calendar-note-count" title={`${noteCount} note${noteCount === 1 ? "" : "s"} sent`}>
                        <MessageSquareText aria-hidden="true" />
                        {noteCount}
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
                <i className="legend-dot is-priest" /> Priest Schedule
              </span>
              <span>
                <i className="legend-dot is-activity" /> Priest Unavailability
              </span>
              <span>
                <i className="legend-dot is-church" /> Parish Event
              </span>
              <span>
                <i className="legend-dot is-appointment" /> Appointment
              </span>
              <span>
                <i className="legend-dot is-special" /> Special Sacrament
              </span>
              {halfDaySetting ? (
                <span>
                  <i className="legend-dot is-half-day" /> Half Day
                </span>
              ) : null}
            </div>
              </section>
            </div>
          </section>

          <section className="dashboard-panel admin-content-card admin-parish-activities-card priest-parish-activity-section">
            <header className="admin-content-header">
              <h3>
                <ImageIcon size={18} aria-hidden="true" />
                Recent Parish Activity
              </h3>
            </header>

            {isLoadingParishActivities ? <p className="priest-dashboard-empty">Loading parish activities...</p> : null}
            {!isLoadingParishActivities && parishActivitiesError ? <p className="priest-dashboard-error">{parishActivitiesError}</p> : null}
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
                          key={`priest-parish-activity-${entry.id}`}
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
                            {renderParishActivityCoverMedia(entry)}
                            <div className="admin-parish-activity-overlay">
                              <strong>{entry.title || "Parish Activity"}</strong>
                              <span>{entry.activityDate ? `Date: ${formatLongDate(entry.activityDate)}` : "Date not set"}</span>
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
                <div className="priest-parish-activity-empty-card appointment-requests-empty-state" role="status">
                  <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                    <Megaphone size={36} strokeWidth={1.5} />
                  </div>
                  <h3 className="appointment-requests-empty-state-title">No parish activities yet</h3>
                  <p className="appointment-requests-empty-state-text">
                    When the parish secretary publishes parish activities, they will appear here as recent parish activity.
                  </p>
                </div>
              )
            ) : null}
            {!isLoadingParishActivities && !parishActivitiesError && recentParishActivities.length > 1 ? (
              <div className="admin-parish-activity-dots" role="tablist" aria-label="Parish activity slides">
                {recentParishActivities.map((entry, index) => (
                  <button
                    key={`priest-parish-activity-dot-${entry.id}`}
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

          {errorMessage ? (
            <section className="dashboard-panel priest-dashboard-list-panel">
              <p className="priest-dashboard-error">{errorMessage}</p>
            </section>
          ) : null}
        </section>
      </div>
      {isParishActivityDetailsModalOpen && selectedParishActivity ? (
        <div className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered" role="presentation" onClick={closeParishActivityDetailsModal}>
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
                <button type="button" aria-label="Close" onClick={closeParishActivityDetailsModal}>
                  <X size={18} />
                </button>
              </div>
            </header>
            <ParishActivityMediaCarousel
              items={normalizeParishActivityMediaForDisplay(selectedParishActivity)}
              resolveSrc={resolveParishActivityImageSrc}
              activityTitle={selectedParishActivity.title || "Parish activity"}
              postedDate={
                /^\d{4}-\d{2}-\d{2}$/.test(String(selectedParishActivity.activityDate || "").trim())
                  ? formatLongDate(selectedParishActivity.activityDate)
                  : ""
              }
              variant="post"
            />
          </section>
        </div>
      ) : null}
      {isDateSchedulesModalOpen && selectedDate ? (
        <div className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered" role="presentation" onClick={() => setIsDateSchedulesModalOpen(false)}>
          <section className="admin-calendar-modal admin-date-schedules-modal" role="dialog" aria-modal="true" aria-label={selectedDateLabel} onClick={(event) => event.stopPropagation()}>
            <header className="admin-calendar-modal-header admin-date-schedules-hero">
              <div>
                <p className="admin-date-schedules-kicker">Parish day schedule</p>
                <h3>{formatCalendarWeekday(visibleScheduleDate) || "Day schedule"}</h3>
                <p className="admin-date-schedules-hero-date">{selectedDateLabel}</p>
              </div>
              <button type="button" className="admin-date-schedules-close" onClick={() => setIsDateSchedulesModalOpen(false)} aria-label="Close">
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
                      <div key={`priest-schedule-slide-${dateKey}`} className="admin-date-schedules-slide">
                        <CalendarDayAgenda
                          dateKey={panel.dateKey}
                          dateLabel={formatCalendarDateLabel(panel.dateKey)}
                          entries={panel.entries}
                          isDayOff={panel.isDayOff}
                          isReadOnly
                          emptyStateTitle="No appointments or events"
                          emptyStateDescription={`${panel.isHalfDay ? `Parish half-day hours are ${formatTimeRangeLabel(halfDaySetting.startTime, halfDaySetting.endTime)}. ` : ""}There are no appointments, parish events, or priest schedules for ${formatCalendarDateLabel(panel.dateKey)}.`}
                          emptyStateClassName="is-priest-empty"
                          resolvePriestName={(entry) => formatPriestHonorificName(entry)}
                        >
                          <PriestNoteComposer
                            key={`priest-note-composer-${panel.dateKey}`}
                            dateKey={panel.dateKey}
                            dateLabel={formatCalendarDateLabel(panel.dateKey)}
                            notes={priestNotesByDate[panel.dateKey] || []}
                            ownEntries={panel.entries.filter((entry) => Number(entry?.priestID) === viewerPriestID)}
                            ownScheduleEntries={calendarEvents.filter((entry) => Number(entry?.priestID) === viewerPriestID)}
                            dayOffWeekday={dayOffWeekday}
                            dayOffSpecificDates={dayOffSpecificDates}
                            halfDaySetting={halfDaySetting}
                            isPastDate={panel.dateKey < todayString}
                            isDayOff={panel.isDayOff}
                            halfDayHours={
                              panel.isHalfDay
                                ? { startTime: halfDaySetting.startTime, endTime: halfDaySetting.endTime }
                                : null
                            }
                            onSubmit={handleSubmitPriestNote}
                            onWithdraw={handleWithdrawPriestNote}
                          />
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
    </main>
  );
}

export default PriestDashboard;
