import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./Sidebar.css";
import { SETTINGS_UPDATED_EVENT, parseStoredSettings } from "../utils/appSettings";
import { t } from "../utils/i18n";

const userMenuItems = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
  },
  {
    id: "status",
    label: "Status",
    path: "/dashboard/status",
  },
  {
    id: "history",
    label: "History",
    path: "/dashboard/history",
  },
];

const priestMenuItems = [
  {
    id: "priest-dashboard",
    label: "Dashboard",
    path: "/priest/dashboard",
  },
  {
    id: "priest-assigned-appointments",
    label: "Appointments",
    path: "/priest/assigned-appointments",
  },
  {
    id: "priest-history",
    label: "History",
    path: "/priest/history",
  },
];

const adminMenuItems = [
  { id: "dashboard", label: "Dashboard", path: "/admin/dashboard" },
  { id: "appointment-request", label: "Appointment Request", path: "/admin/appointment-requests" },
  { id: "progress-tracker", label: "Progress Tracker", path: "/admin/progress-tracker" },
  { id: "priest-management", label: "Priest Management", path: "/admin/priest-management" },
  {
    id: "sacrament-manager",
    label: "Sacrament Manager",
    path: "/admin/sacrament-form-schemas",
    matchPaths: ["/admin/sacrament-form-schemas/archive"],
  },
  {
    id: "special-programs",
    label: "Special Programs",
    path: "/admin/special-programs",
    matchPaths: ["/admin/special-sacrament-form-schemas"],
  },
  {
    id: "certificate-requests",
    label: "Certificate Requests",
    path: "/admin/certificate-requests",
    matchPaths: ["/admin/certificate-types", "/admin/certificate-types/archive"],
  },
  {
    id: "reports",
    label: "Report Generation",
    path: "/admin/reports",
    children: [{ id: "reports-ad-hoc", label: "Ad Hoc", path: "/admin/reports/ad-hoc" }],
  },
  { id: "history", label: "History", path: "/admin/history" },
];

const iconMap = {
  dashboard: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  ),
  status: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.2 2.2L15.5 9.5" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 3-6.24" />
      <path d="M4 4v4h4" />
      <path d="M12 8v5l3 2" />
    </svg>
  ),
  "appointment-request": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  ),
  "approved-appointments": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M9 13.5 11.2 16l4.8-5" />
    </svg>
  ),
  "priest-management": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
      <circle cx="17" cy="10" r="2" />
      <path d="M15.5 18a3.5 3.5 0 0 1 5 0" />
    </svg>
  ),
  "sacrament-manager": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v18" />
      <path d="M7 8h10" />
      <path d="M8 21h8" />
    </svg>
  ),
  "progress-tracker": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18V6" />
      <path d="M10 18v-8" />
      <path d="M16 18v-5" />
      <path d="M22 18v-11" />
    </svg>
  ),
  "certificate-requests": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M8.5 9.5h7M8.5 13h7M8.5 16.5h5" />
    </svg>
  ),
  "admin-request": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h9l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M14 4v4h4M8 13h8M8 17h6" />
    </svg>
  ),
  "admin-management": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  ),
  "user-management": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M3 19v0a5 5 0 0 1 10 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M14 19v0a4 4 0 0 1 7-2.5" />
    </svg>
  ),
  "priest-dashboard": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18V6" />
      <path d="M10 18v-6" />
      <path d="M16 18v-10" />
      <path d="M22 18v-8" />
    </svg>
  ),
  "priest-assigned-appointments": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  ),
  "priest-history": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 3-6.24" />
      <path d="M4 4v4h4" />
      <path d="M12 8v5l3 2" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h9l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M14 4v4h4" />
      <path d="M8 18v-4M12 18v-7M16 18v-2" />
    </svg>
  ),
  "special-programs": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4v16" />
      <path d="M6 5h12l-3 4 3 4H6" />
    </svg>
  ),
};

const requestSidebarClose = () => {
  window.dispatchEvent(new CustomEvent("faithflow:close-sidebar"));
};

function Sidebar({ isOpen, variant = "user" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = useState(() => parseStoredSettings().language);
  const [openMenuId, setOpenMenuId] = useState("");
  const baseItems = variant === "admin" ? adminMenuItems : variant === "priest" ? priestMenuItems : userMenuItems;
  const menuItems = baseItems.map((item) => {
    const translatedLabelById = {
      dashboard: t("dashboard", "Dashboard", language),
      status: t("status", "Status", language),
      history: t("history", "History", language),
      "appointment-request": t("appointmentRequest", "Appointment Request", language),
      "progress-tracker": t("progressTracker", "Progress Tracker", language),
      "priest-management": t("priestManagement", "Priest Management", language),
      "sacrament-manager": t("sacramentManager", "Sacrament Manager", language),
      "special-programs": t("specialPrograms", "Special Programs", language),
      "certificate-requests": t("certificateRequests", "Certificate Requests", language),
      reports: t("reports", "Report Generation", language),
      "reports-ad-hoc": "Ad Hoc",
      "priest-dashboard": t("dashboard", "Dashboard", language),
      "priest-assigned-appointments": t("appointments", "Appointments", language),
      "priest-history": t("history", "History", language),
    };
    return {
      ...item,
      label: translatedLabelById[item.id] || item.label,
      icon: iconMap[item.id] || iconMap.dashboard,
      children: (item.children || []).map((child) => ({
        ...child,
        label: translatedLabelById[child.id] || child.label,
      })),
    };
  });
  const childItems = menuItems.flatMap((item) => item.children || []);
  const activeChildId = childItems.reduce((bestMatchId, item) => {
    const isMatch = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    if (!isMatch) return bestMatchId;
    const bestMatchItem = childItems.find((menuItem) => menuItem.id === bestMatchId);
    return (item.path?.length || 0) > (bestMatchItem?.path?.length || -1) ? item.id : bestMatchId;
  }, "");
  const activeItemId = activeChildId
    ? ""
    : menuItems
    .filter((item) => item.path)
    .reduce((bestMatchId, item) => {
      const relatedPaths = Array.isArray(item.matchPaths) ? item.matchPaths : [];
      const isMatch =
        location.pathname === item.path ||
        location.pathname.startsWith(`${item.path}/`) ||
        relatedPaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
      if (!isMatch) return bestMatchId;

      const bestMatchItem = menuItems.find((menuItem) => menuItem.id === bestMatchId);
      const bestMatchLength = bestMatchItem?.path?.length || -1;
      const currentLength = item.path.length;
      return currentLength > bestMatchLength ? item.id : bestMatchId;
    }, "");

  useEffect(() => {
    if (!activeChildId) return;
    const parent = menuItems.find((item) => (item.children || []).some((child) => child.id === activeChildId));
    if (parent) setOpenMenuId(parent.id);
  }, [activeChildId, location.pathname]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const syncOverflow = () => {
      document.body.style.overflow = media.matches && isOpen ? "hidden" : "";
    };
    syncOverflow();
    media.addEventListener("change", syncOverflow);
    return () => {
      media.removeEventListener("change", syncOverflow);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

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

  return (
    <>
    {isOpen ? (
      <button type="button" className="sidebar-backdrop" aria-label="Close menu" onClick={requestSidebarClose} />
    ) : null}
    <aside
      className={`app-sidebar${isOpen ? "" : " is-collapsed"}`}
    >
      <nav>
        <ul className="sidebar-menu">
          {menuItems.map((item) => (
            <li
              key={item.label}
              className={`sidebar-item${item.id === activeItemId ? " is-active" : ""}`}
            >
              <button
                type="button"
                onClick={() => {
                  if (item.children?.length) setOpenMenuId(item.id);
                  if (item.path) navigate(item.path);
                  if (!item.children?.length && window.matchMedia("(max-width: 900px)").matches) requestSidebarClose();
                }}
              >
                <span className="sidebar-link-content">
                  <span className={`sidebar-icon sidebar-icon-${item.id}`}>
                    {item.icon}
                  </span>
                  <span className="sidebar-label">{item.label}</span>
                </span>
              </button>
              {Array.isArray(item.children) && item.children.length && (openMenuId === item.id || location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)) ? (
                <ul className="sidebar-submenu">
                  {item.children.map((child) => (
                    <li key={child.id} className={`sidebar-subitem${child.id === activeChildId ? " is-active" : ""}`}>
                      <button
                        type="button"
                        onClick={() => {
                          if (child.path) navigate(child.path);
                          if (window.matchMedia("(max-width: 900px)").matches) requestSidebarClose();
                        }}
                      >
                        <span className="sidebar-label">{child.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
    </>
  );
}

export default Sidebar;
