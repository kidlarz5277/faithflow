import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarX2 } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import ViewModeToggle, { useViewMode } from "../components/ViewModeToggle";
import { CancelledAppointmentsList } from "../components/AppointmentCancellation";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressDetails.css";
import "./UserStatusPage.css";
import "./UserCancelledAppointmentsPage.css";

const toPositiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

function UserCancelledAppointmentsPage() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [viewMode, setViewMode] = useViewMode("user-cancelled-appointments");

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
  const userID =
    toPositiveInteger(user?.userID) ??
    toPositiveInteger(user?.userId) ??
    toPositiveInteger(user?.id) ??
    toPositiveInteger(user?.accountID);

  useEffect(() => {
    document.title = "Faithflow - Cancelled Appointments";
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType === "admin") navigate("/admin/progress-tracker", { replace: true });
  }, [navigate, user, accountType]);

  if (!user || accountType === "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  return (
    <main className="dashboard-layout user-cancelled-page">
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
          <section className="dashboard-panel dashboard-hero appointment-cancel-page-hero view-mode-hero">
            <div className="appointment-cancel-page-hero-copy">
              <span className="user-cancelled-title-mark" aria-hidden="true">
                <CalendarX2 size={22} />
              </span>
              <h2>Cancelled Appointments</h2>
            </div>
            <div className="view-mode-hero-actions">
              <button type="button" className="progress-back-button" onClick={() => navigate("/dashboard/status")}>
                Back
              </button>
            </div>
          </section>

          <section className="dashboard-panel appointment-cancel-page appointment-cancel-page-panel user-cancelled-panel">
            <div className="view-mode-content-bar">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            {userID ? (
              <CancelledAppointmentsList userID={userID} viewMode={viewMode} />
            ) : (
              <p className="appointment-cancel-error">Unable to detect your account details.</p>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

export default UserCancelledAppointmentsPage;
