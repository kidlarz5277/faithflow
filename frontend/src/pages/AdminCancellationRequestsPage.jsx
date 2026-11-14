import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import AdminAppointmentChangeRequestsList, {
  fetchPendingAppointmentChangeRequests,
} from "../components/AdminAppointmentChangeRequests";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { subscribeNotificationStream } from "../utils/notificationStream";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressDetails.css";

function AdminCancellationRequestsPage() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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
  const hasAdminID = Number.isInteger(adminID) && adminID > 0;

  const loadRequests = useCallback(async () => {
    if (accountType !== "admin" || !hasAdminID) return;
    try {
      setRequests(await fetchPendingAppointmentChangeRequests(adminID));
      setLoadError("");
    } catch (error) {
      setLoadError(error.message || "Unable to load cancellation requests.");
    } finally {
      setIsLoading(false);
    }
  }, [accountType, adminID, hasAdminID]);

  useEffect(() => {
    document.title = "Faithflow - Cancellation Requests";
  }, []);

  useEffect(() => {
    if (!user || accountType !== "admin") navigate("/login", { replace: true });
  }, [navigate, user, accountType]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (accountType !== "admin" || !hasAdminID) return undefined;
    return subscribeNotificationStream(`/api/notifications/stream?accountType=admin&adminID=${adminID}`, {
      onNotification: () => void loadRequests(),
    });
  }, [accountType, adminID, hasAdminID, loadRequests]);

  if (!user || accountType !== "admin") return null;

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
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="admin" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero appointment-cancel-page-hero">
            <div className="appointment-cancel-page-hero-copy">
              <h2>Cancellation Requests</h2>
            </div>
            <button type="button" className="progress-back-button" onClick={() => navigate("/admin/progress-tracker")}>
              Back
            </button>
          </section>

          <section className="dashboard-panel appointment-cancel-page appointment-cancel-page-panel">
            <div className="appointment-cancel-page-panel-head">
              <div>
                <h3>Pending Requests</h3>
              </div>
              <span className="appointment-cancel-page-count">
                {requests.length} {requests.length === 1 ? "request" : "requests"} waiting
              </span>
            </div>
            {loadError ? <p className="appointment-cancel-error">{loadError}</p> : null}
            <AdminAppointmentChangeRequestsList
              adminID={adminID}
              requests={requests}
              isLoading={isLoading && requests.length === 0}
              onChanged={loadRequests}
            />
          </section>
        </section>
      </div>
    </main>
  );
}

export default AdminCancellationRequestsPage;
