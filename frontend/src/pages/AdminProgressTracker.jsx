import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, CalendarX2, CircleDashed, Cross, Droplets, Handshake, Inbox, RotateCcw, Search, Sparkles } from "lucide-react";
import PageGuide from "../components/PageGuide";
import { fetchPendingAppointmentChangeRequests } from "../components/AdminAppointmentChangeRequests";
import ViewModeToggle, { useViewMode } from "../components/ViewModeToggle";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { subscribeNotificationStream } from "../utils/notificationStream";
import { normalizeSpecialProgramSacramentalType } from "../utils/specialProgramProgress";
import { getAppointmentSubjectName, resolveChildDisplayName } from "../utils/parishSchedule";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";
import "./AdminProgressTracker.css";

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

const SACRAMENTAL_FILTER_OPTIONS = ["Marriage", "Funeral Mass", "Baptism", "Blessing", "Special Sacrament Program"];

const toReadableLabel = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());

const normalizeSacramentalType = (rawSacramentName) => {
  const aliased = normalizeSpecialProgramSacramentalType(rawSacramentName);
  if (aliased) return aliased;
  return toReadableLabel(rawSacramentName) || "";
};

const getSacramentalFilterValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "marriage") return "Marriage";
  if (normalized === "funeral mass" || normalized === "funeral-mass") return "Funeral Mass";
  if (normalized === "baptism" || normalized === "christening") return "Baptism";
  if (normalized === "blessing" || normalized === "blessings") return "Blessing";
  return "";
};

const getProgressStateFromStatus = (statusValue) => {
  const normalizedStatus = String(statusValue || "").trim().toUpperCase();
  if (normalizedStatus === "CONFIRMED") return "Ongoing";
  if (normalizedStatus === "CANCELLED") return "Cancelled";
  return "For Review";
};

// Every CANCELLED appointment is listed in the Cancelled view: approved appointments that were cancelled
// (by the parish or at the requester's request) and requests the requester withdrew before approval.
// DECLINED requests are on the Declined Requests page instead.
const isProgressCancelledAppointment = (appointment) =>
  String(appointment?.status || "").trim().toUpperCase() === "CANCELLED";

const readChecklistMetrics = (appointment) => {
  const totalTasks = Math.max(0, Number(appointment?.totalTasks) || 0);
  const completedTasks = Math.max(0, Number(appointment?.completedTasks) || 0);
  const progressPercent = Math.max(0, Math.min(100, Number(appointment?.progressPercent) || 0));
  return { progressPercent, completedTasks, totalTasks };
};

const buildProgressMetricsFromChecklist = (checklist) => {
  const steps = Array.isArray(checklist) ? checklist : [];
  let totalTasks = 0;
  let completedTasks = 0;
  steps.forEach((step) => {
    const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
    tasks.forEach((task) => {
      totalTasks += 1;
      if (task && typeof task === "object" && Boolean(task.done)) completedTasks += 1;
    });
  });
  return {
    progressPercent: totalTasks > 0 ? Math.max(0, Math.min(100, Math.round((completedTasks / totalTasks) * 100))) : 0,
    completedTasks,
    totalTasks,
  };
};

const formatProgressHint = (completedTasks, totalTasks, progressPercent) => {
  if (totalTasks > 0) {
    return `${completedTasks} of ${totalTasks} requirements complete`;
  }
  if (progressPercent > 0) {
    return "Requirements in progress";
  }
  return "Checklist not started";
};

const getProgressDesign = (state) => {
  if (state === "Cancelled") {
    return {
      className: "is-declined",
      icon: <CalendarX2 size={18} />,
      iconLabel: "Cancelled progress icon",
    };
  }
  if (state === "Ongoing") {
    return {
      className: "is-scheduled",
      icon: <CalendarDays size={18} />,
      iconLabel: "Ongoing progress icon",
    };
  }
  return {
    className: "is-review",
    icon: <CircleDashed size={18} />,
    iconLabel: "For review icon",
  };
};

const readCredentialText = (credentials, keys) => {
  const source = credentials && typeof credentials === "object" ? credentials : {};
  for (const key of keys) {
    const value = String(source?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const formatBlessingTypeLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("house") || normalized.includes("home")) return "Home Blessing";
  if (normalized.includes("vehicle") || normalized.includes("car")) return "Car Blessing";
  if (normalized.includes("business")) return "Business Blessing";
  return String(value || "").trim();
};

const getConductedPersonSummary = (item) => {
  if (item?.conductedPersonLabel && item?.conductedPersonValue) {
    return {
      conductedPersonLabel: item.conductedPersonLabel,
      conductedPersonValue: item.conductedPersonValue,
    };
  }

  const credentials = item?.credentials && typeof item.credentials === "object" ? item.credentials : {};
  const sacramentName = String(item?.sacramentName || item?.sacramentalType || "").trim().toLowerCase();

  if (sacramentName.includes("marriage") || sacramentName.includes("kasalan") || sacramentName.includes("kasal")) {
    const groomName = readCredentialText(credentials, ["groomName", "groomFullName"]);
    const brideName = readCredentialText(credentials, ["brideName", "brideFullName"]);
    const coupleName = groomName && brideName ? `${groomName} & ${brideName}` : groomName || brideName;
    return { conductedPersonLabel: "Couple", conductedPersonValue: coupleName || "Not provided" };
  }
  if (sacramentName.includes("funeral") || sacramentName.includes("death")) {
    return {
      conductedPersonLabel: "Deceased",
      conductedPersonValue: readCredentialText(credentials, ["deceasedName", "deceasedFullName", "fullName"]) || "Not provided",
    };
  }
  if (sacramentName.includes("blessing")) {
    const blessingType = formatBlessingTypeLabel(readCredentialText(credentials, ["blessingType"]));
    return {
      conductedPersonLabel: "Blessing type",
      conductedPersonValue: blessingType || readCredentialText(credentials, ["blessingTarget"]) || "Not provided",
    };
  }
  if (sacramentName.includes("baptism") || sacramentName.includes("christening") || sacramentName.includes("binyagan")) {
    return {
      conductedPersonLabel: "Child",
      conductedPersonValue:
        resolveChildDisplayName(credentials) ||
        readCredentialText(credentials, ["childFullName", "fullName"]) ||
        "Not provided",
    };
  }
  return {
    conductedPersonLabel: "Conducted for",
    conductedPersonValue:
      readCredentialText(credentials, ["childFullName", "fullName", "deceasedName", "deceasedFullName", "blessingTarget"]) || "Not provided",
  };
};

const getSacramentalIconDesign = (sacramentalType) => {
  if (sacramentalType === "Marriage") {
    return { icon: <Handshake size={18} />, iconLabel: "Marriage icon" };
  }
  if (sacramentalType === "Funeral Mass") {
    return { icon: <Cross size={18} />, iconLabel: "Death mass icon" };
  }
  if (sacramentalType === "Baptism") {
    return { icon: <Droplets size={18} />, iconLabel: "Baptism icon" };
  }
  return { icon: <Sparkles size={18} />, iconLabel: "Blessing icon" };
};

const toKebabCase = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const TRACKER_ITEMS_PER_PAGE = 5;

function AdminProgressTracker() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [viewMode, setViewMode] = useViewMode("admin-progress-tracker");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("Ongoing");
  const [selectedSort, setSelectedSort] = useState("date_desc");
  const [trackerItems, setTrackerItems] = useState([]);
  const [cancelledItems, setCancelledItems] = useState([]);
  const [isLoadingTracker, setIsLoadingTracker] = useState(false);
  const [trackerError, setTrackerError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRestoreItem, setSelectedRestoreItem] = useState(null);
  const [isRestoringAppointment, setIsRestoringAppointment] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [changeRequests, setChangeRequests] = useState([]);
  const location = useLocation();

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

  const loadChangeRequests = useCallback(async () => {
    if (accountType !== "admin" || !Number.isInteger(adminID) || adminID <= 0) return;
    try {
      setChangeRequests(await fetchPendingAppointmentChangeRequests(adminID));
    } catch {
      // The badge is optional; the requests page shows its own load errors.
    }
  }, [accountType, adminID]);

  const loadTrackerItems = useCallback(
    async ({ showLoader = true } = {}) => {
      if (!user || accountType !== "admin") return;
      if (showLoader) {
        setIsLoadingTracker(true);
      }
      setTrackerError("");
      try {
        const [appointmentsResponse, sacramentsResponse, specialSacramentsResponse] = await Promise.all([
          fetch("/admin-api/appointments"),
          fetch("/admin-api/sacraments"),
          fetch("/admin-api/special-sacraments"),
        ]);
        const appointmentsData = await appointmentsResponse.json().catch(() => []);
        const sacramentsData = await sacramentsResponse.json().catch(() => []);
        const specialSacramentsData = await specialSacramentsResponse.json().catch(() => []);

        if (!appointmentsResponse.ok) throw new Error("Unable to load appointments.");
        if (!sacramentsResponse.ok) throw new Error("Unable to load sacraments.");
        if (!specialSacramentsResponse.ok) throw new Error("Unable to load special sacraments.");

        const sacramentNameMap = new Map(
          (Array.isArray(sacramentsData) ? sacramentsData : []).map((item) => [Number(item.sacramentID), String(item.sacramentName || "")]),
        );
        const specialSacramentNameMap = new Map(
          (Array.isArray(specialSacramentsData) ? specialSacramentsData : []).map((item) => [
            Number(item.s_sacramentID),
            String(item.s_sacramentName || ""),
          ]),
        );

        const normalizedItems = (Array.isArray(appointmentsData) ? appointmentsData : [])
          .map((appointment) => {
            const normalizedStatus = String(appointment?.status || "").trim().toUpperCase();
            const isConfirmed = normalizedStatus === "CONFIRMED";
            const isCancelledProgress = isProgressCancelledAppointment(appointment);
            if (!isConfirmed && !isCancelledProgress) return null;
            const sacramentNameFromAppointment = String(
              appointment?.resolvedSacramentName ||
                appointment?.specialSacramentName ||
                appointment?.s_sacramentName ||
                appointment?.sacramentName ||
                "",
            ).trim();
            const sacramentNameFromLookup = appointment?.sacramentID
              ? sacramentNameMap.get(Number(appointment.sacramentID)) || ""
              : appointment?.s_sacramentID
                ? specialSacramentNameMap.get(Number(appointment.s_sacramentID)) || ""
                : "";
            const sacramentName = sacramentNameFromAppointment || sacramentNameFromLookup || "Appointment";
            const sacramentalType = normalizeSacramentalType(sacramentName);
            const hasStoredMetrics = Object.prototype.hasOwnProperty.call(appointment || {}, "progressPercent");
            return {
              ...appointment,
              requesterFullName:
                getAppointmentSubjectName({ ...appointment, sacramentName }) ||
                String(appointment?.requesterFullName || "").trim() ||
                "Unknown Account",
              sacramentName,
              sacramentalType,
              declineReason: String(appointment?.note || appointment?.declineReason || "").trim(),
              ...getConductedPersonSummary({ ...appointment, sacramentName, sacramentalType }),
              isSpecialProgram: Number.isInteger(Number(appointment?.s_sacramentID)) && Number(appointment?.s_sacramentID) > 0,
              ...(hasStoredMetrics ? readChecklistMetrics(appointment) : { progressPercent: 0, completedTasks: 0, totalTasks: 0 }),
              hasStoredMetrics,
              progressState: isCancelledProgress ? "Cancelled" : getProgressStateFromStatus(appointment?.status),
              isFinalEventDone: Boolean(appointment?.eventDone),
              finishedAt: appointment?.finishedAt || null,
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            const timeA = new Date(a.createdAt).getTime();
            const timeB = new Date(b.createdAt).getTime();
            if (Number.isNaN(timeA) && Number.isNaN(timeB)) return (a.appointmentID || 0) - (b.appointmentID || 0);
            if (Number.isNaN(timeA)) return 1;
            if (Number.isNaN(timeB)) return -1;
            return timeB - timeA;
          });

        const itemsNeedingProgress = normalizedItems.filter((item) => !item.hasStoredMetrics);
        const fetchedProgressById = new Map();
        if (itemsNeedingProgress.length > 0) {
          await Promise.all(
            itemsNeedingProgress.map(async (item) => {
              const appointmentID = Number(item?.appointmentID);
              if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;
              try {
                const progressResponse = await fetch(`/admin-api/appointments/${appointmentID}/progress`);
                const progressPayload = await progressResponse.json().catch(() => null);
                if (!progressResponse.ok) return;
                fetchedProgressById.set(appointmentID, {
                  ...buildProgressMetricsFromChecklist(progressPayload?.checklist),
                  isFinalEventDone: Boolean(progressPayload?.finalDetails?.eventDone),
                  finishedAt: progressPayload?.finishedAt || item.finishedAt || null,
                });
              } catch {
                fetchedProgressById.set(appointmentID, null);
              }
            }),
          );
        }
        const itemsWithProgress = normalizedItems.map((item) => {
          if (item.hasStoredMetrics) return item;
          const fetched = fetchedProgressById.get(Number(item.appointmentID));
          if (!fetched) return item;
          return { ...item, ...fetched };
        });
        const confirmedItems = itemsWithProgress.filter((item) => {
          if (Boolean(item?.finishedAt)) return false;
          const isConfirmed =
            String(item?.status || "")
              .trim()
              .toUpperCase() === "CONFIRMED";
          return isConfirmed;
        });
        const regularItems = [];
        const specialProgramGroups = new Map();
        confirmedItems.forEach((item) => {
          const programID = Number(item?.s_sacramentID);
          if (item.isSpecialProgram && Number.isInteger(programID) && programID > 0) {
            const current = specialProgramGroups.get(programID) || [];
            current.push(item);
            specialProgramGroups.set(programID, current);
            return;
          }
          regularItems.push(item);
        });
        const groupedSpecialPrograms = [...specialProgramGroups.entries()].map(([programID, applicants]) => {
          const latestApplicant = [...applicants].sort((left, right) => {
            const timeA = new Date(left.createdAt).getTime();
            const timeB = new Date(right.createdAt).getTime();
            return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
          })[0];
          const totalProgress = applicants.reduce((sum, applicant) => sum + (Number(applicant.progressPercent) || 0), 0);
          const averageProgress = applicants.length > 0 ? Math.round(totalProgress / applicants.length) : 0;
          const completedTasks = applicants.reduce((sum, applicant) => sum + (Number(applicant.completedTasks) || 0), 0);
          const totalTasks = applicants.reduce((sum, applicant) => sum + (Number(applicant.totalTasks) || 0), 0);
          return {
            ...latestApplicant,
            isSpecialProgramGroup: true,
            groupKey: `program-${programID}`,
            s_sacramentID: programID,
            sacramentName: latestApplicant.sacramentName,
            sacramentalType: latestApplicant.sacramentalType,
            applicantCount: applicants.length,
            applicants,
            requesterFullName: `${applicants.length} applicant${applicants.length === 1 ? "" : "s"}`,
            conductedPersonLabel: "Applicants",
            conductedPersonValue: String(applicants.length),
            progressPercent: averageProgress,
            completedTasks,
            totalTasks,
            progressState: "Ongoing",
            createdAt: latestApplicant.createdAt,
          };
        });
        setTrackerItems([...regularItems, ...groupedSpecialPrograms]);
        setCancelledItems(
          itemsWithProgress
            .filter((item) => isProgressCancelledAppointment(item))
            .sort((a, b) => {
              const timeA = new Date(a.finishedAt || a.createdAt).getTime();
              const timeB = new Date(b.finishedAt || b.createdAt).getTime();
              if (Number.isNaN(timeA) && Number.isNaN(timeB)) return (b.appointmentID || 0) - (a.appointmentID || 0);
              if (Number.isNaN(timeA)) return 1;
              if (Number.isNaN(timeB)) return -1;
              return timeB - timeA;
            }),
        );
      } catch (error) {
        setTrackerItems([]);
        setCancelledItems([]);
        setTrackerError(error.message || "Unable to load progress tracker records.");
      } finally {
        if (showLoader) {
          setIsLoadingTracker(false);
        }
      }
    },
    [accountType, user],
  );

  useEffect(() => {
    if (!user || accountType !== "admin") return;
    void loadTrackerItems();
  }, [accountType, loadTrackerItems, user]);

  useEffect(() => {
    if (!user || accountType !== "admin") return undefined;

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void loadTrackerItems({ showLoader: false });
    }, 30000);

    const handleFocus = () => {
      void loadTrackerItems({ showLoader: false });
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        void loadTrackerItems({ showLoader: false });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [accountType, loadTrackerItems, user]);

  useEffect(() => {
    if (!user || accountType !== "admin") return undefined;
    if (!Number.isInteger(adminID) || adminID <= 0) return undefined;

    const streamPath = `/api/notifications/stream?accountType=admin&adminID=${adminID}`;
    return subscribeNotificationStream(streamPath, {
      onNotification: (event) => {
        if (document.hidden) return;
        try {
          const payload = JSON.parse(String(event?.data || "{}"));
          if (payload?.action && payload.action !== "realtime_update") return;
          const resource = String(payload?.resource || "").trim().toLowerCase();
          if (resource && resource !== "progress_templates" && resource !== "appointments") return;
        } catch {
          return;
        }
        const now = Date.now();
        if (now - lastTrackerRefreshRef.current < 45000) return;
        lastTrackerRefreshRef.current = now;
        void loadTrackerItems({ showLoader: false });
        void loadChangeRequests();
      },
    });
  }, [accountType, adminID, loadTrackerItems, loadChangeRequests, user]);

  useEffect(() => {
    void loadChangeRequests();
  }, [loadChangeRequests]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("changeRequests") !== "1") return;
    navigate("/admin/progress-tracker/cancellation-requests", { replace: true });
  }, [location.search, navigate]);

  const pendingChangeRequestByAppointment = useMemo(
    () => new Map(changeRequests.map((request) => [Number(request.appointmentID), request.requestType])),
    [changeRequests],
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const isCancelledView = selectedStatusFilter === "Cancelled";
  const sourceItems = useMemo(() => [...trackerItems, ...cancelledItems], [trackerItems, cancelledItems]);
  const baseFilteredItems = useMemo(() => {
    return sourceItems.filter((item) => {
      const fullName = String(item.requesterFullName || "").toLowerCase();
      const sacramentalType = String(item.sacramentalType || "").toLowerCase();
      const sacramentName = String(item.sacramentName || "").toLowerCase();
      const conductedPerson = String(item.conductedPersonValue || "").toLowerCase();
      const progressState = String(item.progressState || "").toLowerCase();
      const declineReason = String(item.declineReason || item.note || "").toLowerCase();
      const applicantNames = Array.isArray(item.applicants)
        ? item.applicants.map((applicant) => String(applicant?.requesterFullName || "").toLowerCase()).join(" ")
        : "";
      const matchesSearch =
        !normalizedSearch ||
        fullName.includes(normalizedSearch) ||
        applicantNames.includes(normalizedSearch) ||
        sacramentalType.includes(normalizedSearch) ||
        sacramentName.includes(normalizedSearch) ||
        conductedPerson.includes(normalizedSearch) ||
        progressState.includes(normalizedSearch) ||
        declineReason.includes(normalizedSearch);
      const matchesType =
        selectedTypeFilter === "all" ||
        (selectedTypeFilter === "Special Sacrament Program" && Boolean(item.isSpecialProgram)) ||
        getSacramentalFilterValue(item.sacramentalType) === selectedTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [normalizedSearch, selectedTypeFilter, sourceItems]);

  const filteredTrackerItems = useMemo(() => {
    if (selectedStatusFilter === "all") return baseFilteredItems;
    return baseFilteredItems.filter((item) => item.progressState === selectedStatusFilter);
  }, [baseFilteredItems, selectedStatusFilter]);

  const sortedTrackerItems = useMemo(() => {
    const items = [...filteredTrackerItems];
    const getSortTime = (item) =>
      new Date(item.progressState === "Cancelled" ? item.finishedAt || item.createdAt : item.createdAt).getTime();
    if (selectedSort === "date_asc") {
      items.sort((a, b) => getSortTime(a) - getSortTime(b));
      return items;
    }
    if (selectedSort === "name_asc") {
      items.sort((a, b) => String(a.requesterFullName || "").localeCompare(String(b.requesterFullName || "")));
      return items;
    }
    if (selectedSort === "progress_desc") {
      items.sort((a, b) => Number(b.progressPercent || 0) - Number(a.progressPercent || 0));
      return items;
    }
    items.sort((a, b) => getSortTime(b) - getSortTime(a));
    return items;
  }, [filteredTrackerItems, selectedSort]);

  const summaryCounts = useMemo(() => {
    let ongoing = 0;
    let cancelled = 0;
    for (const item of baseFilteredItems) {
      if (item.progressState === "Ongoing") ongoing += 1;
      if (item.progressState === "Cancelled") cancelled += 1;
    }
    return {
      total: ongoing + cancelled,
      ongoing,
      cancelled,
    };
  }, [baseFilteredItems]);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedTrackerItems.length / TRACKER_ITEMS_PER_PAGE)),
    [sortedTrackerItems.length],
  );
  const pagedTrackerItems = useMemo(() => {
    const startIndex = (currentPage - 1) * TRACKER_ITEMS_PER_PAGE;
    return sortedTrackerItems.slice(startIndex, startIndex + TRACKER_ITEMS_PER_PAGE);
  }, [sortedTrackerItems, currentPage]);

  useEffect(() => {
    document.title = "Faithflow - Progress Tracker";
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
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTypeFilter, selectedStatusFilter, selectedSort]);
  useEffect(() => {
    setCurrentPage((activePage) => Math.min(activePage, totalPages));
  }, [totalPages]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleRestoreCancelledAppointment = async (item) => {
    const appointmentID = Number(item?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setRestoreError("Unable to detect admin account.");
      return;
    }
    setRestoreError("");
    setIsRestoringAppointment(true);
    try {
      const response = await fetch(`/admin-api/appointments/${appointmentID}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminID,
          // A request withdrawn before approval goes back to review; an approved one back to Confirmed.
          status: item?.withdrawnByRequester ? "PENDING" : "CONFIRMED",
          confirmRestore: true,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to restore this appointment.");
      }
      setSelectedRestoreItem(null);
      await loadTrackerItems({ showLoader: false });
    } catch (error) {
      setRestoreError(error.message || "Unable to restore this appointment.");
    } finally {
      setIsRestoringAppointment(false);
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
          <section className="dashboard-panel dashboard-hero progress-tracker-hero admin-list-hero">
            <div className="progress-tracker-hero-copy">
              <h2>
                Progress Tracker <PageGuide pageKey="progress-tracker" />
              </h2>
            </div>
            <div className="progress-tracker-hero-actions">
              <button
                type="button"
                className="progress-tracker-hero-action"
                onClick={() => navigate("/admin/progress-templates")}
              >
                Manage Templates
              </button>
            </div>
          </section>

          <section className="dashboard-panel appointment-requests-panel progress-tracker-panel">

            <div className="progress-tracker-toolbar" aria-label="Filter and search request progress">
              <label className="appointment-filter-field progress-tracker-search-field">
                <span className="sr-only">Search requests</span>
                <div className="progress-tracker-search-wrapper">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    className="appointment-search-input"
                    placeholder="Search name, sacramental type, status, or reason"
                    aria-label="Search progress requests"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
              </label>

              <label className="appointment-filter-field progress-tracker-filter-field">
                <span>Sacramental Type</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Filter by sacramental type"
                  value={selectedTypeFilter}
                  onChange={(event) => setSelectedTypeFilter(event.target.value)}
                >
                  <option value="all">Types</option>
                  {SACRAMENTAL_FILTER_OPTIONS.map((type) => (
                    <option key={`tracker-type-${type}`} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="appointment-filter-field progress-tracker-filter-field">
                <span>Sort By</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Sort progress requests"
                  value={selectedSort}
                  onChange={(event) => setSelectedSort(event.target.value)}
                >
                  <option value="date_desc">Newest</option>
                  <option value="date_asc">Oldest</option>
                  <option value="progress_desc">Highest Progress</option>
                  <option value="name_asc">Name A-Z</option>
                </select>
              </label>
            </div>

            <div className="progress-summary-row" aria-label="Progress summary">
              <button
                type="button"
                className={`progress-summary-item ${selectedStatusFilter === "Ongoing" ? "is-active" : ""}`}
                onClick={() => setSelectedStatusFilter("Ongoing")}
                aria-pressed={selectedStatusFilter === "Ongoing"}
              >
                Ongoing: {summaryCounts.ongoing}
              </button>
              <button
                type="button"
                className={`progress-summary-item ${selectedStatusFilter === "Cancelled" ? "is-active" : ""}`}
                onClick={() => setSelectedStatusFilter("Cancelled")}
                aria-pressed={selectedStatusFilter === "Cancelled"}
              >
                Cancelled: {summaryCounts.cancelled}
              </button>
              <button
                type="button"
                className={`progress-summary-item ${selectedStatusFilter === "all" ? "is-active" : ""}`}
                onClick={() => setSelectedStatusFilter("all")}
                aria-pressed={selectedStatusFilter === "all"}
              >
                Total: {summaryCounts.total}
              </button>
            </div>

            <div className="view-mode-content-bar">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>

            {restoreError ? <p className="appointment-requests-error">{restoreError}</p> : null}
            {trackerError ? (
              <p className="appointment-requests-empty">{trackerError}</p>
            ) : isLoadingTracker ? (
              <p className="appointment-requests-empty">
                {isCancelledView ? "Loading cancelled appointments..." : "Loading progress records..."}
              </p>
            ) : sourceItems.length === 0 || (isCancelledView && cancelledItems.length === 0) ? (
              <div className="appointment-requests-empty-state" role="status">
                <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                  {isCancelledView ? <CalendarX2 size={36} strokeWidth={1.5} /> : <Inbox size={36} strokeWidth={1.5} />}
                </div>
                <h3 className="appointment-requests-empty-state-title">
                  {isCancelledView ? "No cancelled appointments" : "No requests yet"}
                </h3>
                <p className="appointment-requests-empty-state-text">
                  {isCancelledView
                    ? "Cancelled appointments from Progress Tracker will appear here so you can restore them."
                    : "Appointment requests will appear here once parishioners submit them."}
                </p>
              </div>
            ) : sortedTrackerItems.length === 0 ? (
              <div className="appointment-requests-empty-state appointment-requests-empty-state--search" role="status">
                <div className="appointment-requests-empty-state-icon appointment-requests-empty-state-icon--muted" aria-hidden="true">
                  <Search size={34} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No matching requests</h3>
                <p className="appointment-requests-empty-state-text">Try a different search term or filter.</p>
              </div>
            ) : (
              <>
                <ul className={`appointment-request-list${viewMode === "grid" ? " is-grid" : ""}`}>
                  {pagedTrackerItems.map((item) => {
                  const progressDesign = getProgressDesign(item.progressState);
                  const progressPercent = Math.max(0, Math.min(100, Number(item.progressPercent) || 0));
                  const completedTasks = Math.max(0, Number(item.completedTasks) || 0);
                  const totalTasks = Math.max(0, Number(item.totalTasks) || 0);
                  const sacramentalTypeClass = `type-${toKebabCase(item.sacramentalType)}`;
                  const sacramentalIcon = getSacramentalIconDesign(item.sacramentalType);
                  const isCancelledItem = item.progressState === "Cancelled";
                  const openTrackerItem = () => {
                    if (isCancelledItem) return;
                    if (item.isSpecialProgramGroup) {
                      navigate(`/admin/progress-tracker/program/${item.s_sacramentID}`, {
                        state: { programItem: item },
                      });
                      return;
                    }
                    navigate(`/admin/progress-tracker/${item.appointmentID}`, {
                      state: { progressItem: item },
                    });
                  };
                  return (
                    <li
                      key={item.groupKey || item.appointmentID}
                      className={`appointment-request-item progress-tracker-item ${progressDesign.className} ${sacramentalTypeClass}`}
                      role={isCancelledItem ? undefined : "button"}
                      tabIndex={isCancelledItem ? undefined : 0}
                      onClick={isCancelledItem ? undefined : openTrackerItem}
                      onKeyDown={
                        isCancelledItem
                          ? undefined
                          : (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openTrackerItem();
                              }
                            }
                      }
                    >
                      <span className="appointment-request-icon" aria-label={sacramentalIcon.iconLabel}>
                        <span className="progress-tracker-icon-glyph">{sacramentalIcon.icon}</span>
                        {(() => {
                          const blockDate = item.createdAt ? new Date(item.createdAt) : null;
                          if (!blockDate || Number.isNaN(blockDate.getTime())) return null;
                          return (
                            <span className="progress-tracker-icon-date" aria-hidden="true">
                              <span>{blockDate.toLocaleString("en-US", { month: "short" })}</span>
                              <strong>{blockDate.getDate()}</strong>
                              <small>{blockDate.getFullYear()}</small>
                            </span>
                          );
                        })()}
                      </span>
                      <div className="appointment-request-details">
                        <div className="appointment-request-top">
                          <strong>{item.sacramentName || item.sacramentalType || "Appointment"}</strong>
                        </div>
                        <div className="appointment-request-badges">
                          {item.isSpecialProgram ? (
                            <span className="appointment-badge appointment-type-badge">Special Sacrament Program</span>
                          ) : null}
                          <span className="appointment-badge progress-state-badge">{item.progressState}</span>
                          {!item.isSpecialProgramGroup && pendingChangeRequestByAppointment.get(Number(item.appointmentID)) ? (
                            <span
                              className={`appointment-badge progress-change-request-badge is-${pendingChangeRequestByAppointment.get(Number(item.appointmentID))}`}
                            >
                              <CalendarX2 size={12} aria-hidden="true" />
                              {pendingChangeRequestByAppointment.get(Number(item.appointmentID)) === "restore"
                                ? "Restore requested by user"
                                : "Cancellation requested by user"}
                            </span>
                          ) : null}
                        </div>
                        <div className="progress-tracker-meta">
                          <p>
                            <span>{item.isSpecialProgramGroup ? "Applicants" : "Requester"}</span>
                            <strong>
                              {item.isSpecialProgramGroup
                                ? `${item.applicantCount || 0} ${Number(item.applicantCount) === 1 ? "person" : "people"}`
                                : item.requesterFullName || "Unknown Account"}
                            </strong>
                          </p>
                          {item.isSpecialProgramGroup ? null : (
                            <p>
                              <span>{item.conductedPersonLabel || "Conducted for"}</span>
                              <strong>{item.conductedPersonValue || "Not provided"}</strong>
                            </p>
                          )}
                          {isCancelledItem ? (
                            <>
                              <p>
                                <span>Requested</span>
                                <strong>{formatDateTime(item.createdAt)}</strong>
                              </p>
                              <p>
                                <span>Cancelled</span>
                                <strong>{formatDateTime(item.finishedAt)}</strong>
                              </p>
                            </>
                          ) : null}
                        </div>
                        {isCancelledItem ? (
                          <p className="progress-tracker-note">
                            <span>Reason</span>
                            {item.declineReason || "No reason provided"}
                          </p>
                        ) : (
                          <div className="progress-tracker-percent-block">
                            <div className="progress-tracker-percent-head">
                              <p className="progress-tracker-percent-label">Progress</p>
                              <strong className="progress-tracker-percent-value">{progressPercent}%</strong>
                            </div>
                            <div className="progress-tracker-percent-track" aria-hidden="true">
                              <span className="progress-tracker-percent-fill" style={{ width: `${progressPercent}%` }} />
                            </div>
                            <p className="progress-tracker-percent-hint">
                              {item.isSpecialProgramGroup
                                ? `Average across ${item.applicantCount || 0} ${Number(item.applicantCount) === 1 ? "applicant" : "applicants"}`
                                : formatProgressHint(completedTasks, totalTasks, progressPercent)}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="appointment-request-actions">
                        {isCancelledItem ? (
                          <button
                            type="button"
                            className="view-details-button progress-restore-button"
                            onClick={() => {
                              setRestoreError("");
                              setSelectedRestoreItem(item);
                            }}
                          >
                            <RotateCcw size={16} aria-hidden="true" />
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="view-details-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openTrackerItem();
                            }}
                          >
                            {item.isSpecialProgramGroup ? "View Applicants" : "View Progress"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                  })}
                </ul>
                {sortedTrackerItems.length > 0 ? (
                  <div className="history-pagination" aria-label="Progress tracker pagination">
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
      {selectedRestoreItem ? (
        <div
          className="header-logout-overlay"
          role="presentation"
          onClick={() => (isRestoringAppointment ? null : setSelectedRestoreItem(null))}
        >
          <section
            className="header-logout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-cancelled-appointment-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="header-logout-modal-body">
              <span className="header-logout-modal-icon" aria-hidden="true">
                <RotateCcw size={22} />
              </span>
              <h3 id="restore-cancelled-appointment-title">Restore this appointment?</h3>
              <p>
                {selectedRestoreItem.sacramentName || selectedRestoreItem.sacramentalType || "This appointment"} will
                {selectedRestoreItem.withdrawnByRequester
                  ? " go back to Appointment Requests for review, since it was withdrawn before approval."
                  : " return to the Progress Tracker."}{" "}
                The requester will be notified.
              </p>
            </div>
            <div className="header-logout-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setSelectedRestoreItem(null)}
                disabled={isRestoringAppointment}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void handleRestoreCancelledAppointment(selectedRestoreItem)}
                disabled={isRestoringAppointment}
              >
                {isRestoringAppointment ? "Restoring..." : "Restore"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminProgressTracker;
