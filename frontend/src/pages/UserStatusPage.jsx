import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, CalendarX2, CircleCheckBig, CircleDashed, Cross, Droplets, FileText, Handshake, Inbox, Search, Sparkles, X } from "lucide-react";
import PageGuide from "../components/PageGuide";
import "../components/AppointmentCancellation.css";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { subscribeNotificationStream } from "../utils/notificationStream";
import { formatCertificatePickupLabel } from "../utils/parishSchedule";
import { isSpecialProgramAppointment } from "../utils/specialProgramProgress";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";
import "./AdminProgressTracker.css";
import "./UserStatusPage.css";

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

const APPOINTMENT_FILTER_OPTIONS = ["Marriage", "Funeral Mass", "Baptism", "Blessing"];
const CERTIFICATE_FILTER_OPTIONS = ["Marriage Certificate", "Baptismal Certificate", "Confirmation Certificate"];

const normalizeProgressState = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending" || normalized === "for review" || normalized === "for-review") return "Pending";
  if (normalized === "scheduled" || normalized === "confirmed" || normalized === "approved" || normalized === "ongoing") {
    return "Ongoing";
  }
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "declined") return "Declined";
  if (normalized === "completed") return "Completed";
  return "Pending";
};

const resolveDisplayedProgressState = (item) => {
  const state = normalizeProgressState(item?.progressState || item?.status);
  if (state === "Declined" || state === "Completed") return state;
  const hasStartedProgress =
    Number(item?.completedTasks) > 0 || Number(item?.progressPercent) > 0 || Boolean(item?.eventDone);
  if (hasStartedProgress) return "Ongoing";
  return state;
};

const pickNonNegativeCount = (value, fallbackValue = 0) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallbackValue;
};

const matchesSelectedStatus = (item, statusFilter) => {
  const requestedStatus = String(statusFilter || "all").trim().toLowerCase();
  if (!requestedStatus || requestedStatus === "all") return true;
  return String(item?.progressState || "").trim().toLowerCase() === requestedStatus;
};

const getProgressPercent = (item, state) => {
  const storedPercent = Number(item?.progressPercent);
  if (Number.isFinite(storedPercent)) {
    return Math.max(0, Math.min(100, storedPercent));
  }
  if (state === "Pending") return 0;
  if (state === "Completed") return 100;
  if (state === "Declined") return 0;
  if (state === "Ongoing") return 0;
  return 0;
};

const formatProgressHint = (item, progressPercent) => {
  const totalTasks = Math.max(0, Number(item?.totalTasks) || 0);
  const completedTasks = Math.max(0, Number(item?.completedTasks) || 0);
  if (item?.isCertificateRequest) {
    if (item.progressState === "Ongoing") return "Certificate is being processed by the parish";
    return "Certificate request received";
  }
  if (totalTasks > 0) {
    return `${completedTasks} of ${totalTasks} requirements complete`;
  }
  if (progressPercent > 0) {
    return "Requirements in progress";
  }
  return "Checklist not started";
};

const getProgressDesign = (state) => {
  if (state === "Declined") {
    return {
      className: "is-declined",
      icon: <Cross size={18} />,
      iconLabel: "Declined progress icon",
    };
  }
  if (state === "Completed") {
    return {
      className: "is-completed",
      icon: <CircleCheckBig size={18} />,
      iconLabel: "Completed progress icon",
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
    iconLabel: "Pending icon",
  };
};

const getSacramentalIconDesign = (sacramentalType, isCertificateRequest = false) => {
  const normalized = String(sacramentalType || "").trim().toLowerCase();
  if (isCertificateRequest || normalized.includes("certificate")) {
    if (normalized.includes("marriage")) {
      return { icon: <Handshake size={18} />, iconLabel: "Marriage certificate icon" };
    }
    if (normalized.includes("baptism") || normalized.includes("christening")) {
      return { icon: <Droplets size={18} />, iconLabel: "Baptismal certificate icon" };
    }
    return { icon: <FileText size={18} />, iconLabel: "Certificate request icon" };
  }
  if (normalized === "marriage") {
    return { icon: <Handshake size={18} />, iconLabel: "Marriage appointment icon" };
  }
  if (normalized === "funeral mass") {
    return { icon: <Cross size={18} />, iconLabel: "Funeral Mass icon" };
  }
  if (normalized === "baptism") {
    return { icon: <Droplets size={18} />, iconLabel: "Baptism appointment icon" };
  }
  if (normalized === "blessing" || normalized === "blessings") {
    return { icon: <Sparkles size={18} />, iconLabel: "Blessing appointment icon" };
  }
  return { icon: <CalendarDays size={18} />, iconLabel: "Sacramental appointment icon" };
};

const toKebabCase = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const toPositiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const getLoggedInUserId = (user) =>
  toPositiveInteger(user?.userID) ??
  toPositiveInteger(user?.userId) ??
  toPositiveInteger(user?.id) ??
  toPositiveInteger(user?.accountID);

function UserStatusPage() {
  const PAGE_SIZE = 3;
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [searchQuery, setSearchQuery] = useState("");
  const [appointmentTypeOptions, setAppointmentTypeOptions] = useState(APPOINTMENT_FILTER_OPTIONS);
  const [specialProgramTypeOptions, setSpecialProgramTypeOptions] = useState([]);
  const [certificateTypeOptions, setCertificateTypeOptions] = useState(CERTIFICATE_FILTER_OPTIONS);
  const [selectedRequestCategory, setSelectedRequestCategory] = useState("all");
  const [selectedSpecificType, setSelectedSpecificType] = useState("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [selectedSort, setSelectedSort] = useState("date_desc");
  const [trackerItems, setTrackerItems] = useState([]);
  const [isLoadingTracker, setIsLoadingTracker] = useState(false);
  const [trackerError, setTrackerError] = useState("");
  const [selectedDeclinedRequest, setSelectedDeclinedRequest] = useState(null);
  const [selectedPendingRequest, setSelectedPendingRequest] = useState(null);
  const [statusSyncTick, setStatusSyncTick] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [summaryCounts, setSummaryCounts] = useState({
    total: 0,
    pending: 0,
    scheduled: 0,
  });

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
  useEffect(() => {
    if (!user || accountType === "admin") return;
    const refreshStatus = () => setStatusSyncTick((value) => value + 1);
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      refreshStatus();
    }, 60000);
    const handleFocus = () => refreshStatus();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshStatus();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, accountType]);

  useEffect(() => {
    if (!user || accountType === "admin") return undefined;
    const userID = getLoggedInUserId(user);
    if (!userID) return undefined;
    return subscribeNotificationStream(`/api/notifications/stream?accountType=user&userID=${userID}`, {
      onNotification: (event) => {
        let payload = {};
        try {
          payload = JSON.parse(String(event?.data || "{}"));
        } catch {
          return;
        }
        const resource = String(payload?.resource || payload?.type || "").toLowerCase();
        if (resource.includes("certificate") || resource.startsWith("appointment") || payload?.action === "realtime_update") {
          setStatusSyncTick((value) => value + 1);
        }
      },
    });
  }, [user, accountType]);

  useEffect(() => {
    if (!user || accountType === "admin") return;

    const loadStatusItems = async () => {
      setIsLoadingTracker(true);
      setTrackerError("");
      try {
        const normalizedUserId = getLoggedInUserId(user);
        if (!normalizedUserId) {
          throw new Error("Unable to detect your account details.");
        }
        const params = new URLSearchParams({
          userID: String(normalizedUserId),
          page: String(currentPage),
          pageSize: String(PAGE_SIZE),
          sort: selectedSort,
          status: selectedStatusFilter,
          requestType: selectedRequestCategory,
          specificType: selectedSpecificType,
        });
        if (searchQuery.trim()) {
          params.set("search", searchQuery.trim());
        }

        const [statusResponse, adminsResponse] = await Promise.all([
          fetch(`/api/status/user?${params.toString()}`, { cache: "no-store" }),
          fetch("/admin-api/admins"),
        ]);
        const statusPayload = await statusResponse.json().catch(() => null);
        const adminsData = await adminsResponse.json().catch(() => []);
        if (!statusResponse.ok || !statusPayload) throw new Error(statusPayload?.message || "Unable to load status records.");
        if (!adminsResponse.ok) throw new Error("Unable to load parishes.");

        const adminParishMap = new Map(
          (Array.isArray(adminsData) ? adminsData : []).map((admin) => [
            Number(admin.adminID),
            String(admin.parishName || "").trim() || "Parish not available",
          ]),
        );
        const payloadItems = Array.isArray(statusPayload?.items) ? statusPayload.items : [];
        const nextAppointmentTypeOptions = Array.isArray(statusPayload?.appointmentTypeOptions)
          ? statusPayload.appointmentTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        const nextSpecialProgramTypeOptions = Array.isArray(statusPayload?.specialProgramTypeOptions)
          ? statusPayload.specialProgramTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        const nextCertificateTypeOptions = Array.isArray(statusPayload?.certificateTypeOptions)
          ? statusPayload.certificateTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        setAppointmentTypeOptions(
          nextAppointmentTypeOptions.length > 0 ? nextAppointmentTypeOptions : APPOINTMENT_FILTER_OPTIONS,
        );
        if (nextSpecialProgramTypeOptions.length) setSpecialProgramTypeOptions(nextSpecialProgramTypeOptions);
        setCertificateTypeOptions(
          nextCertificateTypeOptions.length > 0 ? nextCertificateTypeOptions : CERTIFICATE_FILTER_OPTIONS,
        );
        const normalizedItems = payloadItems
          .map((item) => ({
            ...item,
            parishName: [...adminParishMap.values()][0] || "Parish not available",
            progressState: resolveDisplayedProgressState(item),
            paymentStatus: (() => {
              const normalized = String(item?.paymentStatus || "unpaid").trim().toLowerCase();
              if (isSpecialProgramAppointment(item) || normalized === "free") return "free";
              return normalized === "paid" ? "paid" : "unpaid";
            })(),
            pickupSchedule:
              item?.pickupSchedule ||
              formatCertificatePickupLabel(item?.pickupDate, item?.pickupTime, item?.pickupEndTime) ||
              null,
          }))
          .filter((item) => matchesSelectedStatus(item, selectedStatusFilter));
        const payloadPagination = statusPayload?.pagination && typeof statusPayload.pagination === "object" ? statusPayload.pagination : {};
        const payloadSummary = statusPayload?.summary && typeof statusPayload.summary === "object" ? statusPayload.summary : {};
        const fallbackSummary = {
          total: pickNonNegativeCount(payloadSummary.total, normalizedItems.length),
          pending: pickNonNegativeCount(payloadSummary.pending, 0),
          scheduled: pickNonNegativeCount(payloadSummary.scheduled, 0),
        };

        setTrackerItems(normalizedItems);
        setPagination({
          page: Number(payloadPagination.page) > 0 ? Number(payloadPagination.page) : 1,
          pageSize: Number(payloadPagination.pageSize) > 0 ? Number(payloadPagination.pageSize) : PAGE_SIZE,
          totalItems: pickNonNegativeCount(payloadPagination.totalItems, normalizedItems.length),
          totalPages: Math.max(
            1,
            pickNonNegativeCount(
              payloadPagination.totalPages,
              Math.ceil(Math.max(1, normalizedItems.length) / PAGE_SIZE),
            ),
          ),
          hasPreviousPage:
            payloadPagination.hasPreviousPage !== undefined
              ? Boolean(payloadPagination.hasPreviousPage)
              : false,
          hasNextPage:
            payloadPagination.hasNextPage !== undefined
              ? Boolean(payloadPagination.hasNextPage)
              : false,
        });
        setSummaryCounts({
          total: fallbackSummary.total,
          pending: fallbackSummary.pending,
          scheduled: fallbackSummary.scheduled,
        });
      } catch (error) {
        setTrackerItems([]);
        setPagination({
          page: 1,
          pageSize: PAGE_SIZE,
          totalItems: 0,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        });
        setSummaryCounts({
          total: 0,
          pending: 0,
          scheduled: 0,
        });
        setTrackerError(error.message || "Unable to load status records.");
      } finally {
        setIsLoadingTracker(false);
      }
    };

    void loadStatusItems();
  }, [
    user,
    accountType,
    currentPage,
    searchQuery,
    selectedRequestCategory,
    selectedSpecificType,
    selectedStatusFilter,
    selectedSort,
    statusSyncTick,
    PAGE_SIZE,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRequestCategory, selectedSpecificType, selectedStatusFilter, selectedSort]);

  useEffect(() => {
    document.title = "Faithflow - Status";
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
  }, [navigate, user, accountType]);

  if (!user || accountType === "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleOpenProgressDetails = (item) => {
    navigate(`/dashboard/status/${item.appointmentID}`, {
      state: { progressItem: item },
    });
  };

  const specificTypeOptions = selectedRequestCategory === "appointment"
    ? appointmentTypeOptions
    : selectedRequestCategory === "special_program"
      ? specialProgramTypeOptions
      : selectedRequestCategory === "certificate"
        ? certificateTypeOptions
        : [...new Set([...appointmentTypeOptions, ...specialProgramTypeOptions, ...certificateTypeOptions])].sort((left, right) => left.localeCompare(right));
  const specificTypeLabel = selectedRequestCategory === "appointment"
    ? "Appointment"
    : selectedRequestCategory === "special_program"
      ? "Special Program"
      : selectedRequestCategory === "certificate"
        ? "Certificate"
        : "Type";

  const hasActiveListFilters =
    selectedStatusFilter !== "all" ||
    selectedRequestCategory !== "all" ||
    selectedSpecificType !== "all" ||
    Boolean(searchQuery.trim());

  return (
    <main className="dashboard-layout">
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onSettings={() => navigate("/dashboard/settings")}
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="user" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero user-status-hero admin-list-hero">
            <h2>Status <PageGuide pageKey="user-status" /></h2>
          </section>

          <section className="dashboard-panel appointment-requests-panel progress-tracker-panel user-status-panel">
            <div className="appointment-requests-header user-status-header-row">
              <h3>Your Progress</h3>
              <button type="button" className="user-status-cancelled-button" onClick={() => navigate("/dashboard/status/cancelled")}>
                <CalendarX2 size={15} aria-hidden="true" />
                <span>Cancelled Appointments</span>
              </button>
            </div>

            <div className="user-status-toolbar" aria-label="Filter and search your request progress">
              <label className="appointment-filter-field">
                <span>Search</span>
                <input
                  type="search"
                  className="appointment-search-input"
                  placeholder="Search service, parish, status, or ID"
                  aria-label="Search your progress requests"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>

              <label className="appointment-filter-field progress-tracker-filter-field">
                <span>Request</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Filter by request kind"
                  value={selectedRequestCategory}
                  onChange={(event) => {
                    setSelectedRequestCategory(event.target.value);
                    setSelectedSpecificType("all");
                  }}
                >
                  <option value="all">All</option>
                  <option value="appointment">Appointment</option>
                  <option value="special_program">Special Program</option>
                  <option value="certificate">Certificate</option>
                </select>
              </label>

              <label className="appointment-filter-field progress-tracker-filter-field">
                <span>{specificTypeLabel}</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Filter by the selected request type"
                  value={selectedSpecificType}
                  onChange={(event) => setSelectedSpecificType(event.target.value)}
                >
                  <option value="all">All</option>
                  {specificTypeOptions.map((type) => (
                    <option key={`user-status-type-${type}`} value={type}>
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
                </select>
              </label>
            </div>

            <div className="progress-summary-row" aria-label="Progress summary">
              <button
                type="button"
                className={`progress-summary-item ${selectedStatusFilter === "all" ? "is-active" : ""}`}
                onClick={() => setSelectedStatusFilter("all")}
                aria-pressed={selectedStatusFilter === "all"}
              >
                Total: {summaryCounts.total}
              </button>
              <button
                type="button"
                className={`progress-summary-item ${selectedStatusFilter === "Pending" ? "is-active" : ""}`}
                onClick={() => setSelectedStatusFilter("Pending")}
                aria-pressed={selectedStatusFilter === "Pending"}
              >
                Pending: {summaryCounts.pending}
              </button>
              <button
                type="button"
                className={`progress-summary-item ${selectedStatusFilter === "Ongoing" ? "is-active" : ""}`}
                onClick={() => setSelectedStatusFilter("Ongoing")}
                aria-pressed={selectedStatusFilter === "Ongoing"}
              >
                Ongoing: {summaryCounts.scheduled}
              </button>
            </div>

            {trackerError ? (
              <p className="appointment-requests-empty user-status-empty">{trackerError}</p>
            ) : isLoadingTracker ? (
              <p className="appointment-requests-empty user-status-empty">Loading your status records...</p>
            ) : trackerItems.length === 0 && hasActiveListFilters ? (
              <div className="appointment-requests-empty-state appointment-requests-empty-state--search" role="status">
                <div className="appointment-requests-empty-state-icon appointment-requests-empty-state-icon--muted" aria-hidden="true">
                  <Search size={34} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">
                  {selectedStatusFilter === "Pending"
                    ? "There are no pending requests"
                    : selectedStatusFilter === "Ongoing"
                      ? "There are no ongoing requests"
                      : "There are no matching requests"}
                </h3>
                <p className="appointment-requests-empty-state-text">
                  {selectedStatusFilter === "Pending"
                    ? "Approved requests stay in Ongoing. Pending only shows requests still waiting for parish review."
                    : "Try a different search term or filter."}
                </p>
              </div>
            ) : trackerItems.length === 0 ? (
              <div className="appointment-requests-empty-state" role="status">
                <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">There are no requests yet</h3>
                <p className="appointment-requests-empty-state-text">
                  Your appointment and certificate request progress will appear here once you submit a request.
                </p>
              </div>
            ) : (
              <>
                <ul className="appointment-request-list">
                  {trackerItems.map((item) => {
                  const progressDesign = getProgressDesign(item.progressState);
                  const safeProgressPercent = getProgressPercent(item, item.progressState);
                  const shouldShowProgressBar = item.progressState !== "Pending" && item.progressState !== "Declined";
                  const sacramentalTypeClass = `type-${toKebabCase(item.sacramentalType)}`;
                  const sacramentalIcon = getSacramentalIconDesign(item.sacramentalType, item.isCertificateRequest);
                  const isDeclinedRequest = item.progressState === "Declined";
                  const isPendingRequest = item.progressState === "Pending";
                  const isProgressTrackerTarget = !item.isCertificateRequest && !isDeclinedRequest && !isPendingRequest;
                  const isCardInteractive = isProgressTrackerTarget || isDeclinedRequest || isPendingRequest;
                  const handleCardOpen = () => {
                    if (isDeclinedRequest) {
                      setSelectedDeclinedRequest(item);
                      return;
                    }
                    if (isPendingRequest) {
                      setSelectedPendingRequest(item);
                      return;
                    }
                    if (isProgressTrackerTarget) {
                      handleOpenProgressDetails(item);
                    }
                  };
                  return (
                    <li
                      key={item.isCertificateRequest ? `certificate-${item.appointmentID}` : `appointment-${item.appointmentID}`}
                      className={`appointment-request-item progress-tracker-item ${progressDesign.className} ${sacramentalTypeClass}`}
                      role={isCardInteractive ? "button" : undefined}
                      tabIndex={isCardInteractive ? 0 : undefined}
                      onClick={isCardInteractive ? handleCardOpen : undefined}
                      onKeyDown={
                        !isCardInteractive
                          ? undefined
                          : (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleCardOpen();
                              }
                            }
                      }
                    >
                      <span className="appointment-request-icon" aria-label={sacramentalIcon.iconLabel}>
                        {sacramentalIcon.icon}
                      </span>
                      <div className="appointment-request-details">
                        <div className="appointment-request-top">
                          <strong>
                            {item.isCertificateRequest
                              ? item.certificateType || item.sacramentalType || "Certificate Request"
                              : item.sacramentalType}
                          </strong>
                        </div>
                        <div className="appointment-request-badges">
                          <span className="appointment-badge appointment-category-badge">
                            {item.isCertificateRequest ? "Certificate Request" : item.requestType || "Appointment"}
                          </span>
                          <span className="appointment-badge progress-state-badge">
                            {progressDesign.icon}
                            <span style={{ marginLeft: 6 }}>{item.progressState}</span>
                          </span>
                          {isSpecialProgramAppointment(item) || item.paymentStatus === "free" ? (
                            <span className="appointment-badge progress-payment-badge is-free">Free</span>
                          ) : item.paymentStatus === "paid" && !item.isCertificateRequest ? (
                            <span className="appointment-badge progress-payment-badge is-paid">Paid</span>
                          ) : item.paymentStatus === "unpaid" &&
                            !item.isCertificateRequest &&
                            item.progressState === "Ongoing" ? (
                            <span className="appointment-badge progress-payment-badge is-unpaid">Unpaid</span>
                          ) : null}
                        </div>
                        <div className="progress-tracker-meta">
                          <p>
                            <span>Date Requested</span>
                            <strong>{formatDateTime(item.createdAt)}</strong>
                          </p>
                          <p>
                            <span>Parish</span>
                            <strong>{item.parishName || "Parish not available"}</strong>
                          </p>
                          {item.isCertificateRequest && item.pickupSchedule ? (
                            <p>
                              <span>Pickup Schedule</span>
                              <strong>{item.pickupSchedule}</strong>
                            </p>
                          ) : null}
                        </div>
                        {shouldShowProgressBar ? (
                          <div className="progress-tracker-percent-block">
                            <div className="progress-tracker-percent-head">
                              <p className="progress-tracker-percent-label">Progress</p>
                              <strong className="progress-tracker-percent-value">{safeProgressPercent}%</strong>
                            </div>
                            <div className="progress-tracker-percent-track" aria-hidden="true">
                              <span
                                className="progress-tracker-percent-fill"
                                style={{
                                  width: `${safeProgressPercent}%`,
                                  minWidth: safeProgressPercent > 0 ? "14px" : "0",
                                }}
                              />
                            </div>
                            <p className="progress-tracker-percent-hint">
                              {formatProgressHint(item, safeProgressPercent)}
                            </p>
                          </div>
                        ) : (
                          <p className="user-status-pending-message">
                            {item.progressState === "Declined"
                              ? item.declineReason
                                ? `Your request was declined by the parish office. Reason: ${item.declineReason}`
                                : "Your request was declined by the parish office."
                              : item.isCertificateRequest
                              ? "Certificate request received and pending parish review."
                              : "Under review by parish admin."}
                          </p>
                        )}
                        {!item.isCertificateRequest && item.pendingChangeRequest?.requestType === "cancel" ? (
                          <p className="appointment-status-change-note">
                            Cancellation requested. Waiting for the parish office to approve or decline.
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                  })}
                </ul>
                <div className="history-pagination" aria-label="Status pagination">
                  <button
                    type="button"
                    className="history-pagination-button"
                    disabled={!pagination.hasPreviousPage}
                    onClick={() => setCurrentPage((pageValue) => Math.max(1, pageValue - 1))}
                  >
                    Previous
                  </button>
                  <span className="history-pagination-label">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    className="history-pagination-button"
                    disabled={!pagination.hasNextPage}
                    onClick={() => setCurrentPage((pageValue) => Math.min(pagination.totalPages, pageValue + 1))}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </section>
        </section>
      </div>
      {selectedDeclinedRequest ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={() => setSelectedDeclinedRequest(null)}>
          <section
            className="appointment-confirm-modal user-status-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Declined request reason"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="user-status-modal-header">
              <div>
                <h3>Request Declined</h3>
                <p>This request was declined by the parish office.</p>
              </div>
              <button
                type="button"
                className="user-status-modal-close"
                onClick={() => setSelectedDeclinedRequest(null)}
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="user-status-modal-body">
              <p className="user-status-modal-note is-declined">
                <span>Reason</span>
                {String(selectedDeclinedRequest?.declineReason || "").trim() || "No reason was provided by the parish office."}
              </p>
            </div>
            <div className="appointment-confirm-actions user-status-modal-actions">
              <button type="button" className="secondary" onClick={() => setSelectedDeclinedRequest(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {selectedPendingRequest ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={() => setSelectedPendingRequest(null)}>
          <section
            className="appointment-confirm-modal user-status-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Pending request details"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="user-status-modal-header">
              <div>
                <h3>Pending Request Details</h3>
                <p>This request is still under review and waiting for parish admin approval.</p>
              </div>
              <button
                type="button"
                className="user-status-modal-close"
                onClick={() => setSelectedPendingRequest(null)}
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="user-status-modal-body">
              <div className="user-status-modal-grid">
                <p>
                  <span>Service Type</span>
                  <strong>
                    {selectedPendingRequest.isCertificateRequest
                      ? selectedPendingRequest.certificateType || selectedPendingRequest.sacramentalType || "Certificate Request"
                      : selectedPendingRequest.sacramentalType || "Appointment"}
                  </strong>
                </p>
                <p>
                  <span>Request Type</span>
                  <strong>
                    {selectedPendingRequest.isCertificateRequest ? "Certificate Request" : selectedPendingRequest.requestType || "Appointment"}
                  </strong>
                </p>
                <p>
                  <span>Status</span>
                  <strong>{selectedPendingRequest.progressState || "Pending"}</strong>
                </p>
                <p>
                  <span>Date Requested</span>
                  <strong>{formatDateTime(selectedPendingRequest.createdAt)}</strong>
                </p>
                <p className="is-wide">
                  <span>Parish</span>
                  <strong>{selectedPendingRequest.parishName || "Parish not available"}</strong>
                </p>
                {selectedPendingRequest.isCertificateRequest && selectedPendingRequest.pickupSchedule ? (
                  <p className="is-wide">
                    <span>Pickup Schedule</span>
                    <strong>{selectedPendingRequest.pickupSchedule}</strong>
                  </p>
                ) : null}
              </div>
              <p className="user-status-modal-note">
                {selectedPendingRequest.isCertificateRequest
                  ? "Certificate request received and pending parish review."
                  : "Your appointment request is under review by parish admin."}
              </p>
            </div>
            <div className="appointment-confirm-actions user-status-modal-actions">
              <button type="button" className="secondary" onClick={() => setSelectedPendingRequest(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default UserStatusPage;
