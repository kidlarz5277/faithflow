import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { SETTINGS_UPDATED_EVENT, parseStoredSettings } from "../utils/appSettings";
import { t } from "../utils/i18n";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";

const toTitleCase = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase());

function Dashboard() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [language, setLanguage] = useState(() => parseStoredSettings().language);

  const authData = useMemo(() => {
    const localValue = localStorage.getItem("faithflow_auth");
    const sessionValue = sessionStorage.getItem("faithflow_auth");
    const raw = localValue || sessionValue;

    if (!raw) {
      return null;
    }

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
  const displayName = toTitleCase(user?.fullName || user?.userName || user?.email || "Parishioner");
  const selectedParish = useMemo(
    () => ({
      id: "1",
      adminID: 1,
      name: displayName,
      location: "Parish dashboard",
    }),
    [displayName],
  );

  useEffect(() => {
    const handleSettingsRefresh = (event) => {
      const nextLanguage = event?.detail?.settings?.language;
      if (typeof nextLanguage === "string" && nextLanguage.trim()) {
        setLanguage(nextLanguage);
      }
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsRefresh);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsRefresh);
  }, []);

  useEffect(() => {
    document.title = "Faithflow - User Dashboard";
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
    if (accountType === "priest") {
      navigate("/priest/dashboard", { replace: true });
      return;
    }
  }, [navigate, user, accountType]);

  useEffect(() => {
    if (!user || accountType === "admin" || accountType === "priest") return;

    navigate("/dashboard/parish/1", {
      replace: true,
      state: {
        selectedParish,
      },
    });
  }, [navigate, user, accountType, selectedParish]);

  if (!user || accountType === "admin" || accountType === "priest") return null;

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
          <section className="dashboard-panel dashboard-hero">
            <h2>{t("appointmentRequest", "Book Your Parish Appointment", language)}</h2>
            <p>
              Welcome, {displayName}. Redirecting you to your parish dashboard.
            </p>
            <div className="hero-tags">
              <span>{displayName}</span>
              <span>Faith-based services</span>
              <span>Organized scheduling</span>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

export default Dashboard;
