import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";

function AdminSectionPage({ title, description, emptyStateTitle, emptyStateDescription }) {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);

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
    document.title = `Faithflow - ${title}`;
  }, [title]);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user, accountType]);

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
          <section className="dashboard-panel dashboard-hero">
            <h2>{title}</h2>
            <p>{description}</p>
          </section>
          {emptyStateTitle ? (
            <section className="dashboard-panel appointment-requests-panel" aria-live="polite">
              <div className="appointment-requests-empty-state" role="status">
                <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">{emptyStateTitle}</h3>
                <p className="appointment-requests-empty-state-text">
                  {emptyStateDescription || "Records will appear here once entries are available."}
                </p>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default AdminSectionPage;
