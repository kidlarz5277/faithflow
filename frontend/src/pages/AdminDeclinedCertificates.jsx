import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Inbox, Search } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { pushUiNotice } from "../utils/uiNotice";
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

function AdminDeclinedCertificates() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedRestoreRequest, setSelectedRestoreRequest] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

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

  const loadDeclinedCertificates = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    setErrorMessage("");
    try {
      if (!Number.isInteger(adminId) || adminId <= 0) {
        throw new Error("Unable to detect admin account.");
      }
      const response = await fetch("/admin-api/certificate-requests");
      const responseData = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load declined certificate requests.");
      }
      const rows = Array.isArray(responseData) ? responseData : [];
      const cancelledCertificates = rows.filter((item) => {
        const status = String(item?.status || "").trim().toLowerCase();
        return status === "cancelled" || status === "declined" || status === "canceled";
      });
      setRequests(cancelledCertificates);
    } catch (error) {
      if (!silent) setRequests([]);
      setErrorMessage(error.message || "Unable to load declined certificate requests.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    document.title = "Faithflow - Declined Certificate Requests";
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
    loadDeclinedCertificates();
  }, [accountType, adminId, loadDeclinedCertificates]);

  useEffect(() => {
    if (accountType !== "admin") return undefined;
    if (!Number.isInteger(adminId) || adminId <= 0) return undefined;
    const pollInterval = window.setInterval(() => {
      if (document.hidden) return;
      loadDeclinedCertificates({ silent: true });
    }, 60000);
    return () => window.clearInterval(pollInterval);
  }, [accountType, adminId, loadDeclinedCertificates]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleRestore = async (request) => {
    const certificateRequestId = Number(request?.id);
    if (!Number.isInteger(certificateRequestId) || certificateRequestId <= 0) return;
    setActionError("");
    try {
      setIsRestoring(true);
      const response = await fetch(`/admin-api/certificate-requests/${certificateRequestId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Pending",
          confirmRestore: true,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to restore certificate request.");
      }
      setSelectedRestoreRequest(null);
      await loadDeclinedCertificates({ silent: true });
      pushUiNotice("Certificate request restored to pending.");
      navigate("/admin/certificate-requests", { state: { statusFilter: "pending" } });
    } catch (error) {
      setActionError(error.message || "Unable to restore certificate request.");
    } finally {
      setIsRestoring(false);
    }
  };

  const filteredRequests = requests.filter((request) => {
    if (!normalizedSearch) return true;
    const requester = String(request?.fullName || "").toLowerCase();
    const category = String(request?.certificateType || "").toLowerCase();
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
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero">
            <div className="declined-hero-row">
              <div className="declined-hero-copy">
                <h2>Declined Certificate Requests</h2>
                <p>Certificate requests with status Cancelled are listed here and can be restored to pending.</p>
              </div>
              <button type="button" className="appointment-back-button" onClick={() => navigate("/admin/certificate-requests")}>
                Back
              </button>
            </div>
          </section>
          <section className="dashboard-panel appointment-requests-panel">
            <div className="appointment-search-row" aria-label="Search declined certificate requests">
              <label className="appointment-filter-field">
                <span className="sr-only">Search declined certificate requests</span>
                <input
                  type="search"
                  className="appointment-search-input"
                  placeholder="Search requester or certificate type"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
            </div>
            {actionError ? <p className="appointment-requests-error">{actionError}</p> : null}
            {errorMessage ? (
              <p className="appointment-requests-empty">{errorMessage}</p>
            ) : isLoading ? (
              <p className="appointment-requests-empty">Loading declined certificate requests...</p>
            ) : requests.length === 0 ? (
              <div className="appointment-requests-empty-state" role="status">
                <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No declined certificate requests</h3>
                <p className="appointment-requests-empty-state-text">Requests with status Cancelled will appear here.</p>
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
                {filteredRequests.map((request) => (
                  <li key={`declined-certificate-${request.id}`} className="appointment-request-item trash-request-item is-certificate">
                    <span className="appointment-request-icon" aria-label="Certificate request icon">
                      <FileText size={20} />
                    </span>
                    <div className="appointment-request-details">
                      <div className="appointment-request-top">
                        <strong>{request.fullName || "Unknown Account"}</strong>
                      </div>
                      <div className="appointment-request-badges">
                        <span className="appointment-badge appointment-type-badge">Certificate Request</span>
                        <span className="appointment-badge appointment-category-badge">{request.certificateType || "Certificate"}</span>
                      </div>
                      <p className="appointment-request-row">
                        <span>Requested at:</span> {formatDateTime(request.createdAt)}
                      </p>
                      <p className="appointment-request-row">
                        <span>Declined at:</span> {formatDateTime(request.updatedAt)}
                      </p>
                      <p className="appointment-request-row">
                        <span>Reason:</span> {String(request.declineReason || "").trim() || "Not available"}
                      </p>
                    </div>
                    <div className="appointment-request-actions">
                      <span className="trash-request-id">#{request.id}</span>
                      <button type="button" className="restore-button" onClick={() => setSelectedRestoreRequest(request)}>
                        Restore
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </div>
      {selectedRestoreRequest ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={() => (isRestoring ? null : setSelectedRestoreRequest(null))}>
          <section
            className="appointment-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm restore request"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Restore Request</h3>
            <p>
              Are you sure you want to restore this declined certificate request to pending?
            </p>
            <div className="appointment-confirm-actions">
              <button type="button" className="secondary" onClick={() => setSelectedRestoreRequest(null)} disabled={isRestoring}>
                Cancel
              </button>
              <button
                type="button"
                className="restore-button"
                onClick={() => void handleRestore(selectedRestoreRequest)}
                disabled={isRestoring}
              >
                {isRestoring ? "Restoring..." : "Yes, Restore"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminDeclinedCertificates;
