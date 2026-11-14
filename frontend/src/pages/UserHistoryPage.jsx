import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheckBig, Cross, Inbox, Search, X } from "lucide-react";
import PageGuide from "../components/PageGuide";
import ViewModeToggle, { useViewMode } from "../components/ViewModeToggle";
import HistoryRecordCard from "../components/HistoryRecordCard";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";
import "./AdminProgressTracker.css";
import "./UserHistoryPage.css";

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

const formatDurationBetween = (startAt, endAt, durationSecondsOverride = null) => {
  const startDate = new Date(startAt || "");
  const endDate = new Date(endAt || "");
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return "Not available";
  const formatDateRangePart = (dateValue) =>
    dateValue
      .toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
      .replace(",", "");
  return `${formatDateRangePart(startDate)}-${formatDateRangePart(endDate)}`;
};

const getStatusDesign = (statusValue) => {
  const normalizedStatus = String(statusValue || "").trim().toUpperCase();
  if (normalizedStatus === "CANCELLED") return { label: "Declined", className: "is-declined", icon: <Cross size={18} /> };
  return { label: "Completed", className: "is-scheduled", icon: <CircleCheckBig size={18} /> };
};

const toLabel = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

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

const flattenCredentialDetails = (value, prefix = "") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const hasSplitMarriageAddress = Boolean(
    String(value.brideAddress || "").trim() || String(value.groomAddress || "").trim(),
  );
  const hasDeceasedAddress = Boolean(String(value.deceasedAddress || "").trim());
  return Object.entries(value).flatMap(([key, entryValue]) => {
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
    return [{ label, value: String(entryValue || "").trim() || "Not provided" }];
  });
};

const getStaffComment = (item) => {
  const hasAssignedPriest = Number(item?.priestID) > 0;
  const title = hasAssignedPriest ? "Parish Priest Comment" : "Parish Secretary Comment";
  const normalizedStatus = String(item?.status || "").trim().toUpperCase();
  const isCertificateRequest = String(item?.requestType || "").trim().toLowerCase().includes("certificate");
  const fallbackComment =
    normalizedStatus === "CANCELLED"
      ? isCertificateRequest
        ? "No decline reason was provided by the admin."
        : "Your request was reviewed by the parish office and marked cancelled. Please contact the parish office for requirements and next steps."
      : "Your request was reviewed by the parish office and processed successfully.";
  return {
    title,
    body: String(item?.note || "").trim() || fallbackComment,
  };
};

function UserHistoryPage() {
  const PAGE_SIZE = 10;
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [viewMode, setViewMode] = useViewMode("user-history");
  const [historyItems, setHistoryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [appointmentTypeOptions, setAppointmentTypeOptions] = useState(["Marriage", "Funeral Mass", "Baptism", "Blessing"]);
  const [specialProgramTypeOptions, setSpecialProgramTypeOptions] = useState([]);
  const [certificateTypeOptions, setCertificateTypeOptions] = useState(["Marriage Certificate", "Baptismal Certificate", "Confirmation Certificate"]);
  const [selectedRequestCategory, setSelectedRequestCategory] = useState("all");
  const [selectedSpecificType, setSelectedSpecificType] = useState("all");
  const [selectedSort, setSelectedSort] = useState("date_desc");
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
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
    all: 0,
    COMPLETED: 0,
    CANCELLED: 0,
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
    document.title = "Faithflow - History";
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

  useEffect(() => {
    if (!selectedHistoryItem) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSelectedHistoryItem(null);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedHistoryItem]);

  useEffect(() => {
    if (!user || accountType === "admin") return;

    const loadHistory = async () => {
      setIsLoading(true);
      setHistoryError("");
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
          status: statusFilter,
          requestType: selectedRequestCategory,
          specificType: selectedSpecificType,
        });
        if (searchQuery.trim()) {
          params.set("search", searchQuery.trim());
        }

        const historyResponse = await fetch(`/api/history/user?${params.toString()}`);
        const historyPayload = await historyResponse.json().catch(() => null);

        if (!historyResponse.ok || !historyPayload) throw new Error(historyPayload?.message || "Unable to load your history records.");
        const payloadItems = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
        const normalizedItems = payloadItems.map((item) => ({
          ...item,
          parishName: String(item?.parishName || "").trim() || "Parish not available",
        }));
        const payloadPagination = historyPayload?.pagination && typeof historyPayload.pagination === "object" ? historyPayload.pagination : {};
        const payloadSummary = historyPayload?.summary && typeof historyPayload.summary === "object" ? historyPayload.summary : {};

        const nextAppointmentTypes = Array.isArray(historyPayload?.appointmentTypeOptions)
          ? historyPayload.appointmentTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        const nextSpecialProgramTypes = Array.isArray(historyPayload?.specialProgramTypeOptions)
          ? historyPayload.specialProgramTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        const nextCertificateTypes = Array.isArray(historyPayload?.certificateTypeOptions)
          ? historyPayload.certificateTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        if (nextAppointmentTypes.length) setAppointmentTypeOptions(nextAppointmentTypes);
        if (nextSpecialProgramTypes.length) setSpecialProgramTypeOptions(nextSpecialProgramTypes);
        if (nextCertificateTypes.length) setCertificateTypeOptions(nextCertificateTypes);
        setHistoryItems(normalizedItems);
        setPagination({
          page: Number(payloadPagination.page) > 0 ? Number(payloadPagination.page) : 1,
          pageSize: Number(payloadPagination.pageSize) > 0 ? Number(payloadPagination.pageSize) : PAGE_SIZE,
          totalItems: Math.max(0, Number(payloadPagination.totalItems) || 0),
          totalPages: Math.max(1, Number(payloadPagination.totalPages) || 1),
          hasPreviousPage: Boolean(payloadPagination.hasPreviousPage),
          hasNextPage: Boolean(payloadPagination.hasNextPage),
        });
        setSummaryCounts({
          all: Math.max(0, Number(payloadSummary.total) || 0),
          COMPLETED: Math.max(0, Number(payloadSummary.completed) || 0),
          CANCELLED: Math.max(0, Number(payloadSummary.cancelled) || 0),
        });
      } catch (error) {
        setHistoryItems([]);
        setPagination({
          page: 1,
          pageSize: PAGE_SIZE,
          totalItems: 0,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        });
        setSummaryCounts({
          all: 0,
          COMPLETED: 0,
          CANCELLED: 0,
        });
        setHistoryError(error.message || "Unable to load your history records.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadHistory();
  }, [user, accountType, currentPage, searchQuery, selectedRequestCategory, selectedSpecificType, selectedSort, statusFilter, PAGE_SIZE]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRequestCategory, selectedSpecificType, selectedSort, statusFilter]);

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

  const selectedHistoryDetails = useMemo(() => {
    if (!selectedHistoryItem) return [];
    const normalizedRequestType = String(selectedHistoryItem?.requestType || "").trim().toLowerCase();
    const normalizedStatus = String(selectedHistoryItem?.status || "").trim().toUpperCase();
    const isCertificateRequest = normalizedRequestType.includes("certificate");
    const detailRows = [
      { label: "Appointment ID", value: `#${selectedHistoryItem.appointmentID}` },
      { label: "Service", value: selectedHistoryItem.sacramentName || "Not available" },
      { label: "Request Type", value: selectedHistoryItem.requestType || "Appointment" },
      { label: "Parish", value: selectedHistoryItem.parishName || "Parish not available" },
      { label: "Requested By", value: selectedHistoryItem.requesterFullName || "Unknown requester" },
      { label: "Start Date", value: formatDateTime(selectedHistoryItem.historyStartAt || selectedHistoryItem.createdAt) },
      { label: "End Date", value: formatDateTime(selectedHistoryItem.historyEndAt || selectedHistoryItem.finishedAt) },
      {
        label: "Duration",
        value: formatDurationBetween(
          selectedHistoryItem.historyStartAt || selectedHistoryItem.createdAt,
          selectedHistoryItem.historyEndAt || selectedHistoryItem.finishedAt,
          selectedHistoryItem.historyDurationSeconds,
        ),
      },
      { label: "Current Status", value: getStatusDesign(selectedHistoryItem.status).label },
    ];
    if (selectedHistoryItem?.finalEventSchedule) {
      detailRows.push({
        label: "Final Event Schedule",
        value: formatDateTime(selectedHistoryItem.finalEventSchedule),
      });
    }
    if (String(selectedHistoryItem.priestName || "").trim() || Number(selectedHistoryItem.priestID) > 0) {
      detailRows.push({
        label: "Assigned Priest",
        value: String(selectedHistoryItem.priestName || "").trim() || "Not assigned yet",
      });
    }
    if (selectedHistoryItem?.pickupSchedule) {
      detailRows.push({
        label: isCertificateRequest ? "Pickup Schedule" : "Pickup Schedule",
        value: selectedHistoryItem.pickupSchedule,
      });
    }
    if (isCertificateRequest && String(selectedHistoryItem?.receiptNumber || "").trim()) {
      detailRows.push({
        label: "Receipt Number",
        value: String(selectedHistoryItem.receiptNumber).trim(),
      });
    }
    if (isCertificateRequest && normalizedStatus === "COMPLETED" && selectedHistoryItem?.finishedAt) {
      detailRows.push({
        label: "Claimed At",
        value: formatDateTime(selectedHistoryItem.finishedAt),
      });
    }
    if (normalizedStatus === "CANCELLED") {
      detailRows.push({
        label: selectedHistoryItem?.isCancelledAppointment ? "Cancellation Reason" : "Decline Reason",
        value: String(selectedHistoryItem?.declineReason || selectedHistoryItem?.note || "").trim() || "Not provided",
      });
    }
    return [...detailRows, ...flattenCredentialDetails(selectedHistoryItem.credentials)];
  }, [selectedHistoryItem]);

  const selectedHistoryComment = useMemo(() => getStaffComment(selectedHistoryItem), [selectedHistoryItem]);

  if (!user || accountType === "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

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
          <section className="dashboard-panel dashboard-hero user-history-hero progress-tracker-hero admin-list-hero">
            <h2>History <PageGuide pageKey="user-history" /></h2>
          </section>

          <section className="dashboard-panel priest-history-panel">
            <div className="priest-page-toolbar priest-history-toolbar user-history-filter-bar" aria-label="History filters">
              <label className="appointment-filter-field">
                <span>Search</span>
                <input
                  type="search"
                  className="appointment-search-input"
                  placeholder="Search service, parish, status, or ID"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  aria-label="Search history records"
                />
              </label>
              <label className="appointment-filter-field">
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
              <label className="appointment-filter-field">
                <span>{specificTypeLabel}</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Filter by the selected request type"
                  value={selectedSpecificType}
                  onChange={(event) => setSelectedSpecificType(event.target.value)}
                >
                  <option value="all">All</option>
                  {specificTypeOptions.map((type) => (
                    <option key={`history-type-${type}`} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="appointment-filter-field">
                <span>Sort By</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Sort history records"
                  value={selectedSort}
                  onChange={(event) => setSelectedSort(event.target.value)}
                >
                  <option value="date_desc">Newest</option>
                  <option value="date_asc">Oldest</option>
                  <option value="service_asc">Service A-Z</option>
                  <option value="parish_asc">Parish A-Z</option>
                </select>
              </label>
            </div>

            <div className="priest-history-summary" role="group" aria-label="Filter history by status">
              <button
                type="button"
                className={statusFilter === "all" ? "is-active" : ""}
                aria-pressed={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              >
                <span>All Records</span>
                <strong>{summaryCounts.all}</strong>
              </button>
              <button
                type="button"
                className={`is-completed${statusFilter === "COMPLETED" ? " is-active" : ""}`}
                aria-pressed={statusFilter === "COMPLETED"}
                onClick={() => setStatusFilter("COMPLETED")}
              >
                <span>Completed</span>
                <strong>{summaryCounts.COMPLETED}</strong>
              </button>
              <button
                type="button"
                className={`is-cancelled${statusFilter === "CANCELLED" ? " is-active" : ""}`}
                aria-pressed={statusFilter === "CANCELLED"}
                onClick={() => setStatusFilter("CANCELLED")}
              >
                <span>Declined</span>
                <strong>{summaryCounts.CANCELLED}</strong>
              </button>
            </div>

            <div className="view-mode-content-bar">
              {!isLoading && !historyError ? (
                <p className="priest-history-result-count">
                  Showing {historyItems.length} of {pagination.totalItems} record{pagination.totalItems === 1 ? "" : "s"}
                </p>
              ) : null}
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>

            {historyError ? (
              <p className="priest-dashboard-error">{historyError}</p>
            ) : isLoading ? (
              <p className="priest-page-empty">Loading your history records...</p>
            ) : historyItems.length === 0 ? (
              <div className="appointment-requests-empty-state" role="status">
                <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No history yet</h3>
                <p className="appointment-requests-empty-state-text">
                  Completed and cancelled records will appear here once requests are processed.
                </p>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="appointment-requests-empty-state appointment-requests-empty-state--search" role="status">
                <div className="appointment-requests-empty-state-icon appointment-requests-empty-state-icon--muted" aria-hidden="true">
                  <Search size={34} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No matching records</h3>
                <p className="appointment-requests-empty-state-text">Try a different search term or filter.</p>
              </div>
            ) : (
              <>
                <ul className={`priest-history-list${viewMode === "grid" ? " is-grid" : ""}`}>
                  {historyItems.map((item) => {
                    const isCancelled = String(item.status || "").trim().toUpperCase() === "CANCELLED";
                    const isCancelledAppointment = isCancelled && Boolean(item.isCancelledAppointment);
                    const requestType = String(item.requestType || "Appointment");
                    const isCertificate = requestType.toLowerCase().includes("certificate");
                    const finishedAt = item.historyEndAt || item.finishedAt;
                    return (
                      <HistoryRecordCard
                        key={item.historyID || item.appointmentID}
                        dateValue={item.finalEventSchedule || finishedAt || item.createdAt}
                        title={item.sacramentName || "Sacramental Activity"}
                        subtitle={`${isCertificate ? "Certificate Request" : "Appointment"} No. ${item.appointmentID}`}
                        status={isCancelled ? "cancelled" : "completed"}
                        statusLabel={isCancelledAppointment ? "Cancelled" : getStatusDesign(item.status).label}
                        facts={[
                          { label: "Parish", value: item.parishName || "Parish not available" },
                          {
                            label: isCertificate ? "Pickup" : "Scheduled",
                            value: isCertificate
                              ? item.pickupSchedule || "Not set"
                              : item.finalEventSchedule
                                ? formatDateTime(item.finalEventSchedule)
                                : "Not scheduled",
                          },
                          {
                            label: isCancelledAppointment ? "Cancelled" : isCancelled ? "Declined" : "Finished",
                            value: formatDateTime(finishedAt),
                          },
                        ]}
                        notes={[
                          { label: "Request Type", value: requestType },
                          { label: "Submitted", value: formatDateTime(item.historyStartAt || item.createdAt) },
                        ]}
                        onView={() => setSelectedHistoryItem(item)}
                      />
                    );
                  })}
                </ul>
                <div className="history-pagination" aria-label="History pagination">
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
      {selectedHistoryItem ? (
        <div
          className="user-history-modal-overlay"
          role="presentation"
          onClick={() => setSelectedHistoryItem(null)}
        >
          <section
            className="user-history-modal"
            role="dialog"
            aria-modal="true"
            aria-label="History event details"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="user-history-modal-header">
              <div>
                <h3>{selectedHistoryItem.sacramentName || "Request"} Details</h3>
                <p>
                  Request ID #{selectedHistoryItem.appointmentID}
                </p>
              </div>
              <button
                type="button"
                className="user-history-modal-close"
                onClick={() => setSelectedHistoryItem(null)}
                aria-label="Close history details"
              >
                <X size={18} />
              </button>
            </header>

            <section className="user-history-modal-section">
              <h4>Full Event Information</h4>
              <div className="user-history-modal-grid">
                {selectedHistoryDetails.map((detail) => (
                  <p key={`${detail.label}-${detail.value}`}>
                    <span>{detail.label}</span>
                    <strong>{detail.value}</strong>
                  </p>
                ))}
              </div>
            </section>

            <section className="user-history-comment-card">
              <h4>{selectedHistoryComment.title}</h4>
              <p>{selectedHistoryComment.body}</p>
            </section>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default UserHistoryPage;
