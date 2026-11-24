import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cross, Droplets, Handshake, Inbox, Search, Sparkles, Trash2 } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";

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

const toKebabCase = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const toReadableLabel = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const getResolvedServiceName = (request) =>
  String(
    request?.resolvedSacramentName ||
      request?.specialSacramentName ||
      request?.s_sacramentName ||
      request?.sacramentName ||
      "",
  ).trim();

const getAppointmentCategoryLabel = (request) => {
  const rawSacrament = getResolvedServiceName(request);
  const sacrament = rawSacrament.toLowerCase();
  if (sacrament === "marriage") return "Marriage";
  if (sacrament === "funeral mass" || sacrament === "funeral-mass") return "Funeral Mass";
  if (sacrament === "blessing" || sacrament === "blessings") return "Blessings";
  if (sacrament === "christening" || sacrament === "baptism") return "Christening";
  return rawSacrament ? toReadableLabel(rawSacrament) : "Appointment";
};

const getAppointmentDesign = (request) => {
  const category = getAppointmentCategoryLabel(request);
  if (category === "Marriage") return { className: "is-marriage", icon: <Handshake size={20} />, iconLabel: "Marriage request icon" };
  if (category === "Funeral Mass") return { className: "is-funeral-mass", icon: <Cross size={20} />, iconLabel: "Death mass request icon" };
  if (category === "Blessings") return { className: "is-blessing", icon: <Sparkles size={20} />, iconLabel: "Blessing request icon" };
  if (category === "Christening") return { className: "is-christening", icon: <Droplets size={20} />, iconLabel: "Christening request icon" };
  return { className: "", icon: <Cross size={20} />, iconLabel: "Appointment request icon" };
};

function AdminDeclinedAppointments() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedRestoreRequest, setSelectedRestoreRequest] = useState(null);
  const [selectedRemoveRequest, setSelectedRemoveRequest] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

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
  const adminId = Number(user?.adminID);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const loadDeclinedAppointments = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    setErrorMessage("");
    try {
      if (!Number.isInteger(adminId) || adminId <= 0) {
        throw new Error("Unable to detect admin account.");
      }
      // This page lists requests that never got past review: DECLINED (turned down by the parish office)
      // and CANCELLED requests the requester withdrew while still pending. Approved appointments that
      // were cancelled later live in the Progress Tracker's Cancelled view instead.
      const [declinedResponse, cancelledResponse] = await Promise.all([
        fetch(`/admin-api/appointments?adminID=${adminId}&status=DECLINED`),
        fetch(`/admin-api/appointments?adminID=${adminId}&status=CANCELLED`),
      ]);
      const declinedData = await declinedResponse.json().catch(() => []);
      const cancelledData = await cancelledResponse.json().catch(() => []);
      if (!declinedResponse.ok) {
        throw new Error(declinedData?.message || "Unable to load declined appointments.");
      }
      const isAppointment = (item) => String(item?.requestType || "").trim().toLowerCase() !== "certificate";
      const declinedRows = (Array.isArray(declinedData) ? declinedData : []).filter(isAppointment);
      const withdrawnRows = (cancelledResponse.ok && Array.isArray(cancelledData) ? cancelledData : []).filter(
        (item) => isAppointment(item) && item?.withdrawnByRequester,
      );
      const merged = [...declinedRows, ...withdrawnRows].sort(
        (a, b) => new Date(b?.finishedAt || b?.createdAt || 0).getTime() - new Date(a?.finishedAt || a?.createdAt || 0).getTime(),
      );
      setRequests(merged);
    } catch (error) {
      if (!silent) setRequests([]);
      setErrorMessage(error.message || "Unable to load declined appointments.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    document.title = "Faithflow - Declined Appointment Requests";
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
    if (accountType !== "admin") return;
    if (!Number.isInteger(adminId) || adminId <= 0) return;
    loadDeclinedAppointments();
  }, [accountType, adminId, loadDeclinedAppointments]);

  useEffect(() => {
    if (accountType !== "admin") return undefined;
    if (!Number.isInteger(adminId) || adminId <= 0) return undefined;
    const pollInterval = window.setInterval(() => {
      if (document.hidden) return;
      loadDeclinedAppointments({ silent: true });
    }, 60000);
    return () => window.clearInterval(pollInterval);
  }, [accountType, adminId, loadDeclinedAppointments]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleRemove = async (request) => {
    const appointmentId = Number(request?.appointmentID);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) return;
    setActionError("");
    try {
      setIsRemoving(true);
      const response = await fetch(`/admin-api/appointments/${appointmentId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminID: adminId }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to remove this declined request.");
      }
      setSelectedRemoveRequest(null);
      await loadDeclinedAppointments({ silent: true });
    } catch (error) {
      setActionError(error.message || "Unable to remove this declined request.");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleRestore = async (request) => {
    const appointmentId = Number(request?.appointmentID);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) return;
    setActionError("");
    try {
      setIsRestoring(true);
      const response = await fetch(`/admin-api/appointments/${appointmentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PENDING",
          adminID: adminId,
          confirmRestore: true,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to restore appointment request.");
      }
      setSelectedRestoreRequest(null);
      await loadDeclinedAppointments({ silent: true });
    } catch (error) {
      setActionError(error.message || "Unable to restore appointment request.");
    } finally {
      setIsRestoring(false);
    }
  };

  const filteredRequests = requests.filter((request) => {
    if (!normalizedSearch) return true;
    const requester = String(request?.requesterFullName || "").toLowerCase();
    const category = getResolvedServiceName(request).toLowerCase();
    return requester.includes(normalizedSearch) || category.includes(normalizedSearch);
  });

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
        <section className="dashboard-main declined-appointments-page">
          <section className="dashboard-panel dashboard-hero admin-list-hero">
            <div className="declined-hero-row">
              <div className="declined-hero-copy">
                <h2>Declined Appointment Requests</h2>
              </div>
              <button type="button" className="appointment-back-button" onClick={() => navigate("/admin/appointment-requests")}>
                Back
              </button>
            </div>
          </section>
          <section className="dashboard-panel appointment-requests-panel">
            <div className="appointment-search-row" aria-label="Search declined appointment requests">
              <label className="appointment-filter-field">
                <span className="sr-only">Search declined appointment requests</span>
                <input
                  type="search"
                  className="appointment-search-input"
                  placeholder="Search requester or category"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
            </div>
            {actionError ? <p className="appointment-requests-error">{actionError}</p> : null}
            {errorMessage ? (
              <p className="appointment-requests-empty">{errorMessage}</p>
            ) : isLoading ? (
              <p className="appointment-requests-empty">Loading declined appointment requests...</p>
            ) : requests.length === 0 ? (
              <div className="appointment-requests-empty-state" role="status">
                <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No declined appointment requests</h3>
                <p className="appointment-requests-empty-state-text">
                  Declined requests, and requests the requester withdrew before approval, will appear here.
                </p>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="appointment-requests-empty-state appointment-requests-empty-state--search" role="status">
                <div className="appointment-requests-empty-state-icon appointment-requests-empty-state-icon--muted" aria-hidden="true">
                  <Search size={34} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No matching requests</h3>
                <p className="appointment-requests-empty-state-text">Try a different search term.</p>
              </div>
            ) : (
              <ul className="appointment-request-list">
                {filteredRequests.map((request) => {
                  const requestDesign = getAppointmentDesign(request);
                  const requestCategory = getAppointmentCategoryLabel(request);
                  const requestTypeClass = `is-${toKebabCase(requestCategory)}`;
                  return (
                    <li
                      key={request.appointmentID}
                      className={`appointment-request-item trash-request-item ${requestDesign.className}`}
                    >
                      <span className="appointment-request-icon" aria-label={requestDesign.iconLabel}>
                        {requestDesign.icon}
                      </span>
                      <div className="appointment-request-details">
                        <div className="appointment-request-top">
                          <strong>{request.requesterFullName || "Unknown Account"}</strong>
                        </div>
                        <div className="appointment-request-badges">
                          <span className="appointment-badge appointment-type-badge">Appointment</span>
                          <span className={`appointment-badge appointment-category-badge ${requestTypeClass}`}>{requestCategory}</span>
                          {request.withdrawnByRequester ? (
                            <span className="appointment-badge declined-withdrawn-badge">Cancelled by requester</span>
                          ) : null}
                        </div>
                        <p className="appointment-request-row">
                          <span>Requested at:</span> {formatDateTime(request.createdAt)}
                        </p>
                        <p className="appointment-request-row">
                          <span>{request.withdrawnByRequester ? "Cancelled at:" : "Declined at:"}</span>{" "}
                          {formatDateTime(request.finishedAt)}
                        </p>
                        {request.note ? (
                          <p className="appointment-request-row">
                            <span>Reason:</span> {request.note}
                          </p>
                        ) : null}
                      </div>
                      <div className="appointment-request-actions declined-request-actions">
                        <button type="button" className="restore-button" onClick={() => setSelectedRestoreRequest(request)}>
                          Restore
                        </button>
                        <button type="button" className="declined-remove-button" onClick={() => setSelectedRemoveRequest(request)}>
                          <Trash2 size={14} aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </section>
      </div>
      {selectedRestoreRequest ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={() => (isRestoring ? null : setSelectedRestoreRequest(null))}>
          <section
            className="appointment-confirm-modal declined-restore-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm restore request"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="declined-restore-header">
              <p>Declined appointment</p>
              <h3>Restore Request</h3>
            </header>
            <div className="declined-restore-body">
              <p>
                Restore <strong>{selectedRestoreRequest.requesterFullName || "this requester"}</strong>&apos;s{" "}
                {getAppointmentCategoryLabel(selectedRestoreRequest)} request back to pending?
              </p>
            </div>
            <div className="appointment-confirm-actions declined-restore-actions">
              <button type="button" className="secondary" onClick={() => setSelectedRestoreRequest(null)} disabled={isRestoring}>
                Cancel
              </button>
              <button type="button" className="declined-restore-confirm" onClick={() => void handleRestore(selectedRestoreRequest)} disabled={isRestoring}>
                {isRestoring ? "Restoring..." : "Yes, Restore"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {selectedRemoveRequest ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={() => (isRemoving ? null : setSelectedRemoveRequest(null))}>
          <section
            className="appointment-confirm-modal declined-restore-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove declined request"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="declined-restore-header">
              <p>Declined appointment</p>
              <h3>Remove this request</h3>
            </header>
            <div className="declined-restore-body">
              <p>
                Remove <strong>{selectedRemoveRequest.requesterFullName || "this requester"}</strong>&apos;s{" "}
                {getAppointmentCategoryLabel(selectedRemoveRequest)} request from this list?
              </p>
            </div>
            <div className="appointment-confirm-actions declined-restore-actions">
              <button type="button" className="secondary" onClick={() => setSelectedRemoveRequest(null)} disabled={isRemoving}>
                Keep it
              </button>
              <button type="button" className="declined-remove-confirm" onClick={() => void handleRemove(selectedRemoveRequest)} disabled={isRemoving}>
                {isRemoving ? "Removing..." : "Remove"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminDeclinedAppointments;
