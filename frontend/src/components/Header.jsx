import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Header.css";
import logo from "../assets/logo.png";
import { AlertTriangle, Bell, BellRing, CalendarClock, CheckCircle2, CircleHelp, Info, LogOut, MessageSquare, Settings, User, UserRound, X } from "lucide-react";
import { consumeStoredUiNotice, uiNoticeEventName } from "../utils/uiNotice";
import { SETTINGS_UPDATED_EVENT, parseStoredSettings } from "../utils/appSettings";
import { subscribeNotificationStream } from "../utils/notificationStream";
import { t } from "../utils/i18n";

function Header({ isSidebarOpen, onToggleSidebar, onLogout, onProfile, onSettings, notificationCount }) {
  const navigate = useNavigate();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [autoNotificationCount, setAutoNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [hasNewNotificationPulse, setHasNewNotificationPulse] = useState(false);
  const [isProfileImageBroken, setIsProfileImageBroken] = useState(false);
  const [topNotice, setTopNotice] = useState(null);
  const [scheduleNotice, setScheduleNotice] = useState(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [language, setLanguage] = useState(() => parseStoredSettings().language);
  const [authVersion, setAuthVersion] = useState(0);
  const userMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const previousUnreadCountRef = useRef(0);
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
  }, [authVersion]);
  const hasExplicitNotificationCount = Number.isFinite(Number(notificationCount));
  const accountType = String(authData?.accountType || "").trim().toLowerCase();
  const adminID = Number(authData?.user?.adminID);
  const userID = Number(authData?.user?.userID);
  const isAdminAccount = accountType === "admin" && Number.isInteger(adminID) && adminID > 0;
  const isUserAccount = accountType === "user" && Number.isInteger(userID) && userID > 0;
  const priestID = Number(authData?.user?.priestID);
  const isPriestAccount = accountType === "priest" && Number.isInteger(priestID) && priestID > 0;
  const notificationApi = useMemo(() => {
    if (isAdminAccount) {
      return {
        list: `/admin-api/admin-notifications?adminID=${adminID}&limit=12`,
        unread: `/admin-api/admin-notifications/unread-count?adminID=${adminID}`,
        read: (id) => `/admin-api/admin-notifications/${id}/read`,
        readBody: { adminID },
        readAll: "/admin-api/admin-notifications/read-all",
        readAllBody: { adminID },
        stream: `/api/notifications/stream?accountType=admin&adminID=${adminID}`,
      };
    }
    if (isPriestAccount) {
      return {
        list: `/api/priest-notifications?priestID=${priestID}&limit=12`,
        unread: `/api/priest-notifications/unread-count?priestID=${priestID}`,
        read: (id) => `/api/priest-notifications/${id}/read`,
        readBody: { priestID },
        readAll: "/api/priest-notifications/read-all",
        readAllBody: { priestID },
        stream: `/api/notifications/stream?accountType=priest&priestID=${priestID}`,
      };
    }
    if (isUserAccount) {
      return {
        list: `/api/user-notifications?userID=${userID}&limit=12`,
        unread: `/api/user-notifications/unread-count?userID=${userID}`,
        read: (id) => `/api/user-notifications/${id}/read`,
        readBody: { userID },
        readAll: "/api/user-notifications/read-all",
        readAllBody: { userID },
        stream: `/api/notifications/stream?accountType=user&userID=${userID}`,
      };
    }
    return null;
  }, [adminID, isAdminAccount, isPriestAccount, isUserAccount, priestID, userID]);
  const resolvedNotificationCount = hasExplicitNotificationCount
    ? Math.max(0, Number(notificationCount))
    : Math.max(0, Number(autoNotificationCount) || 0);
  const canToggleSidebar = typeof onToggleSidebar === "function";
  const canShowSettings = Boolean(onSettings) || isAdminAccount || isUserAccount;
  const faqPath = isAdminAccount ? "/admin/faqs" : isPriestAccount ? "/priest/faqs" : isUserAccount ? "/dashboard/faqs" : "";
  const dashboardPath = isAdminAccount
    ? "/admin/dashboard"
    : isPriestAccount
      ? "/priest/dashboard"
      : isUserAccount
        ? "/dashboard"
        : "/login";
  const resolveProfilePhotoSource = (photoValue) => {
    const normalized = String(photoValue || "").trim();
    if (!normalized) return "";
    if (normalized.startsWith("data:")) return normalized;
    if (/^https?:\/\//i.test(normalized)) return normalized;
    const userAssetMatch = normalized.match(/^(?:\/?(?:src\/)?assets\/)?user-photos\/(.+)$/i);
    if (userAssetMatch) return `/api/uploads/user-photos/${userAssetMatch[1]}`;
    const priestAssetMatch = normalized.match(/^(?:\/?(?:src\/)?assets\/)?priest-photos\/(.+)$/i);
    if (priestAssetMatch) return `/api/uploads/priest-photos/${priestAssetMatch[1]}`;
    const adminAssetMatch = normalized.match(/^(?:\/?(?:src\/)?assets\/)?admin-photos\/(.+)$/i);
    if (adminAssetMatch) return `/api/uploads/admin-photos/${adminAssetMatch[1]}`;
    if (normalized.startsWith("/uploads/")) return `/api${normalized}`;
    return normalized;
  };
  const headerProfilePhotoSource = resolveProfilePhotoSource(authData?.user?.photo || authData?.user?.profileImage);
  const shouldShowProfilePhoto = Boolean(headerProfilePhotoSource) && !isProfileImageBroken;

  useEffect(() => {
    if (typeof onToggleSidebar !== "function") return undefined;
    const handleCloseSidebar = () => {
      if (isSidebarOpen) onToggleSidebar();
    };
    window.addEventListener("faithflow:close-sidebar", handleCloseSidebar);
    return () => window.removeEventListener("faithflow:close-sidebar", handleCloseSidebar);
  }, [isSidebarOpen, onToggleSidebar]);

  useEffect(() => {
    const handleSettingsRefresh = (event) => {
      const nextLanguage = event?.detail?.settings?.language;
      if (typeof nextLanguage === "string" && nextLanguage.trim()) {
        setLanguage(nextLanguage);
      }
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsRefresh);
    const handleAuthRefresh = () => setAuthVersion((current) => current + 1);
    window.addEventListener("faithflow-auth-updated", handleAuthRefresh);
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsRefresh);
      window.removeEventListener("faithflow-auth-updated", handleAuthRefresh);
    };
  }, []);

  useEffect(() => {
    setIsProfileImageBroken(false);
  }, [headerProfilePhotoSource]);
  useEffect(() => {
    const storedNotice = consumeStoredUiNotice();
    if (storedNotice) {
      setTopNotice(storedNotice);
    }

    const handleUiNotice = (event) => {
      const nextNotice = event?.detail;
      if (!nextNotice || !String(nextNotice.message || "").trim()) return;
      setTopNotice({
        message: String(nextNotice.message).trim(),
        type: String(nextNotice.type || "success").trim().toLowerCase() === "error" ? "error" : "success",
      });
    };
    window.addEventListener(uiNoticeEventName, handleUiNotice);
    return () => {
      window.removeEventListener(uiNoticeEventName, handleUiNotice);
    };
  }, []);
  useEffect(() => {
    if (!topNotice?.message) return undefined;
    const timeoutId = window.setTimeout(() => {
      setTopNotice(null);
    }, 2500);
    return () => window.clearTimeout(timeoutId);
  }, [topNotice]);
  useEffect(() => {
    if (!scheduleNotice) return undefined;
    const timeoutId = window.setTimeout(() => {
      setScheduleNotice(null);
    }, 14000);
    return () => window.clearTimeout(timeoutId);
  }, [scheduleNotice]);
  const formatNotificationTimestamp = (dateValue) => {
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) return "";
    return parsedDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const buildScheduleNotice = useCallback((item) => {
    const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const appointmentID = Number(metadata.appointmentID || metadata.appointmentId || item?.appointmentID);
    return {
      id: Number(item?.userNotifID ?? item?.id ?? item?.notificationId) || Date.now(),
      title: String(item?.title || "Appointment date and time changed").trim(),
      body: String(item?.body || "").trim(),
      previousLabel: String(metadata.previousLabel || "").trim(),
      nextLabel: String(metadata.nextLabel || "").trim(),
      path:
        String(metadata.path || "").trim() ||
        (Number.isInteger(appointmentID) && appointmentID > 0
          ? `/dashboard/status/${appointmentID}`
          : "/dashboard/status"),
    };
  }, []);
  const getNotificationVisual = (item) => {
    const normalizedType = String(item?.type || "").trim().toLowerCase();
    const normalizedSeverity = String(item?.severity || "").trim().toLowerCase();

    if (normalizedSeverity === "error" || normalizedSeverity === "danger") {
      return { icon: AlertTriangle, toneClass: "is-danger", iconLabel: "Important alert" };
    }
    if (normalizedSeverity === "success") {
      return { icon: CheckCircle2, toneClass: "is-success", iconLabel: "Success update" };
    }
    if (normalizedType.includes("remark")) {
      return { icon: MessageSquare, toneClass: "is-accent", iconLabel: "Remarks notification" };
    }
    if (normalizedType.includes("appointment") || normalizedType.includes("schedule") || normalizedType.includes("assignment")) {
      return { icon: CalendarClock, toneClass: "is-accent", iconLabel: "Schedule notification" };
    }
    if (normalizedType.includes("progress") || normalizedType.includes("checklist")) {
      return { icon: AlertTriangle, toneClass: "is-danger", iconLabel: "Progress update" };
    }
    if (normalizedType.includes("certificate")) {
      return { icon: CheckCircle2, toneClass: "is-success", iconLabel: "Certificate notification" };
    }
    if (normalizedType.includes("system")) {
      return { icon: BellRing, toneClass: "is-accent", iconLabel: "System notification" };
    }
    return { icon: Info, toneClass: "is-info", iconLabel: "Notification" };
  };

  const loadUnreadCount = useCallback(async () => {
    if (hasExplicitNotificationCount) return;
    if (!notificationApi) {
      setAutoNotificationCount(0);
      return;
    }
    try {
      const response = await fetch(notificationApi.unread);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const parsedCount = Number(payload?.count);
      const nextCount = Number.isFinite(parsedCount) && parsedCount > 0 ? Math.floor(parsedCount) : 0;
      if (nextCount > Number(previousUnreadCountRef.current || 0)) {
        setHasNewNotificationPulse(true);
      }
      previousUnreadCountRef.current = nextCount;
      setAutoNotificationCount(nextCount);
    } catch {
      setAutoNotificationCount((current) => current);
    }
  }, [hasExplicitNotificationCount, notificationApi]);

  const markNotificationAsRead = useCallback(
    async (notificationID) => {
      if (!notificationApi || !Number.isInteger(Number(notificationID)) || Number(notificationID) <= 0) {
        return false;
      }
      try {
        const response = await fetch(notificationApi.read(notificationID), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notificationApi.readBody),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    [notificationApi],
  );

  const markAllNotificationsAsRead = useCallback(async () => {
    if (!notificationApi) {
      return false;
    }
    setIsMarkingAllRead(true);
    setNotificationError("");
    try {
      const response = await fetch(notificationApi.readAll, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationApi.readAllBody),
      });
      if (!response.ok) {
        throw new Error("Unable to mark notifications as read.");
      }
      setNotifications((current) => current.map((entry) => (entry.isRead ? entry : { ...entry, isRead: true })));
      await loadUnreadCount();
      return true;
    } catch (error) {
      setNotificationError(error.message || "Unable to mark notifications as read.");
      return false;
    } finally {
      setIsMarkingAllRead(false);
    }
  }, [loadUnreadCount, notificationApi]);

  const loadNotifications = useCallback(async () => {
    if (!notificationApi) {
      setNotifications([]);
      setNotificationError("");
      return;
    }
    setNotificationError("");
    setIsLoadingNotifications(true);
    try {
      const response = await fetch(notificationApi.list);
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error("Unable to load notifications.");
      }
      const normalizedNotifications = Array.isArray(payload)
        ? payload
            .map((item) => ({
              id: Number(item?.userNotifID ?? item?.priestNotifID ?? item?.adminNotifID ?? item?.id),
              type: String(item?.type || "").trim(),
              severity: String(item?.severity || "").trim(),
              title: String(item?.title || "").trim() || "Notification",
              body: String(item?.body || "").trim(),
              isRead: Boolean(item?.isRead),
              createdAt: item?.createdAt || null,
              metadata: item?.metadata && typeof item.metadata === "object" ? item.metadata : {},
            }))
            .filter((item) => Number.isInteger(item.id) && item.id > 0 && item.body)
        : [];
      setNotifications(normalizedNotifications);
      await loadUnreadCount();
    } catch (error) {
      setNotificationError(error.message || "Unable to load notifications.");
      setNotifications([]);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [loadUnreadCount, notificationApi]);

  useEffect(() => {
    if (!isUserAccount || !notificationApi) return undefined;
    let isActive = true;
    const showRecentScheduleNotice = async () => {
      try {
        const response = await fetch(notificationApi.list);
        const payload = await response.json().catch(() => []);
        if (!response.ok || !isActive || !Array.isArray(payload)) return;
        const recent = payload.find((item) => {
          const type = String(item?.type || "").trim().toLowerCase();
          if (type !== "progress_schedule_updated" || item?.isRead) return false;
          const createdAt = new Date(item?.createdAt || 0).getTime();
          return Number.isFinite(createdAt) && Date.now() - createdAt < 2 * 60 * 60 * 1000;
        });
        if (recent) {
          setScheduleNotice(buildScheduleNotice(recent));
        }
      } catch {
        // Keep the dashboard usable if the notice preview cannot load.
      }
    };
    void showRecentScheduleNotice();
    return () => {
      isActive = false;
    };
  }, [buildScheduleNotice, isUserAccount, notificationApi]);

  const resolveNotificationDestination = useCallback(
    (item) => {
      const normalizedType = String(item?.type || "").trim().toLowerCase();
      const normalizedTitle = String(item?.title || "").trim().toLowerCase();
      const normalizedBody = String(item?.body || "").trim().toLowerCase();
      const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
      const metadataPath = String(metadata.path || metadata.route || "").trim();
      const metadataAppointmentId = Number(metadata.appointmentID || metadata.appointmentId);
      const isAppointmentOrCertificateNotification =
        normalizedType.includes("appointment") ||
        normalizedType.includes("certificate") ||
        normalizedTitle.includes("appointment") ||
        normalizedTitle.includes("certificate") ||
        normalizedBody.includes("appointment") ||
        normalizedBody.includes("certificate");

      if (metadataPath.startsWith("/")) {
        const noteDate = String(metadata.noteDate || "").slice(0, 10);
        if (
          isPriestAccount &&
          /^\d{4}-\d{2}-\d{2}$/.test(noteDate) &&
          metadataPath.startsWith("/priest/dashboard") &&
          !/[?&]date=/.test(metadataPath)
        ) {
          return `${metadataPath}${metadataPath.includes("?") ? "&" : "?"}date=${noteDate}`;
        }
        const metadataScheduleIdFromPath = Number(metadata.calendarEntryID || metadata.scheduleID || metadata.scheduleId);
        if (
          isAdminAccount &&
          (normalizedType.includes("remark") || normalizedTitle.includes("remark")) &&
          metadataPath.includes("/admin/priest-management") &&
          !/[?&]view=/.test(metadataPath)
        ) {
          return `${metadataPath}${metadataPath.includes("?") ? "&" : "?"}view=remarks`;
        }
        if (
          isPriestAccount &&
          metadataPath.startsWith("/priest/assigned-appointments") &&
          !/[?&]scheduleID=/.test(metadataPath) &&
          Number.isInteger(metadataScheduleIdFromPath) &&
          metadataScheduleIdFromPath > 0
        ) {
          const viewValue = normalizedType.includes("remark") ? "remarked" : "awaiting";
          return `${metadataPath}${metadataPath.includes("?") ? "&" : "?"}scheduleID=${metadataScheduleIdFromPath}&view=${viewValue}`;
        }
        return metadataPath;
      }

      const metadataPriestId = Number(metadata.priestID || metadata.priestId);
      const metadataScheduleId = Number(metadata.calendarEntryID || metadata.scheduleID || metadata.scheduleId);
      const metadataRemarkId = Number(metadata.remarkID || metadata.remarkId);

      if (normalizedType.includes("remark")) {
        if (normalizedType.includes("user_schedule") || normalizedType.includes("appointment_schedule")) {
          if (isAdminAccount && Number.isInteger(metadataAppointmentId) && metadataAppointmentId > 0) {
            const remarkID = Number(metadata.remarkID || metadata.remarkId);
            const params = new URLSearchParams();
            if (Number.isInteger(remarkID) && remarkID > 0) params.set("remarkID", String(remarkID));
            const query = params.toString();
            return `/admin/progress-tracker/${metadataAppointmentId}${query ? `?${query}` : ""}`;
          }
          if (Number.isInteger(metadataAppointmentId) && metadataAppointmentId > 0) {
            return `/dashboard/status/${metadataAppointmentId}`;
          }
        }
        if (isAdminAccount) {
          const params = new URLSearchParams();
          params.set("view", "remarks");
          if (Number.isInteger(metadataPriestId) && metadataPriestId > 0) params.set("priestID", String(metadataPriestId));
          if (Number.isInteger(metadataScheduleId) && metadataScheduleId > 0) params.set("scheduleID", String(metadataScheduleId));
          if (Number.isInteger(metadataRemarkId) && metadataRemarkId > 0) params.set("remarkID", String(metadataRemarkId));
          if (Number.isInteger(metadataAppointmentId) && metadataAppointmentId > 0) {
            params.set("appointmentID", String(metadataAppointmentId));
          }
          const query = params.toString();
          return query ? `/admin/priest-management?${query}` : "/admin/priest-management?view=remarks";
        }
        if (isPriestAccount) {
          const params = new URLSearchParams();
          params.set("view", "remarked");
          if (Number.isInteger(metadataScheduleId) && metadataScheduleId > 0) {
            params.set("scheduleID", String(metadataScheduleId));
          }
          return `/priest/assigned-appointments?${params.toString()}`;
        }
      }

      if (isPriestAccount) {
        if (
          normalizedType.includes("schedule_hold") ||
          normalizedType.includes("schedule_restored") ||
          normalizedType.includes("calendar")
        ) {
          return "/priest/dashboard";
        }
        if (normalizedType.includes("history") || normalizedBody.includes("moved to history") || normalizedBody.includes("marked complete")) {
          return "/priest/history";
        }
        const params = new URLSearchParams();
        params.set("view", normalizedType.includes("remark") ? "remarked" : "awaiting");
        if (Number.isInteger(metadataScheduleId) && metadataScheduleId > 0) {
          params.set("scheduleID", String(metadataScheduleId));
        }
        return `/priest/assigned-appointments?${params.toString()}`;
      }

      if (!isAdminAccount && Number.isInteger(metadataAppointmentId) && metadataAppointmentId > 0) {
        return `/dashboard/status/${metadataAppointmentId}`;
      }

      if (isUserAccount && isAppointmentOrCertificateNotification) {
        return "/dashboard/status";
      }

      if (isAdminAccount) {
        if (Number.isInteger(metadataAppointmentId) && metadataAppointmentId > 0) {
          return `/admin/progress-tracker/${metadataAppointmentId}`;
        }
        if (normalizedType.includes("appointment") || normalizedTitle.includes("appointment") || normalizedBody.includes("appointment")) {
          return "/admin/appointment-requests";
        }
        if (normalizedType.includes("certificate") || normalizedTitle.includes("certificate") || normalizedBody.includes("certificate")) {
          return "/admin/certificate-requests";
        }
        if (normalizedType.includes("progress") || normalizedBody.includes("progress")) {
          return "/admin/progress-tracker";
        }
        if (normalizedType.includes("priest") || normalizedBody.includes("priest")) {
          return "/admin/priest-management";
        }
        return "/admin/dashboard";
      }

      if (Number.isInteger(metadataAppointmentId) && metadataAppointmentId > 0) {
        return `/dashboard/status/${metadataAppointmentId}`;
      }
      if (normalizedType.includes("status") || normalizedType.includes("progress") || normalizedBody.includes("status update")) {
        return "/dashboard/status";
      }
      if (normalizedType.includes("history")) {
        return "/dashboard/history";
      }
      if (normalizedType.includes("certificate") || normalizedTitle.includes("certificate") || normalizedBody.includes("certificate")) {
        return "/dashboard/request-certificate";
      }
      if (isPriestAccount) {
        return "/priest/assigned-appointments";
      }
      return "/dashboard";
    },
    [isAdminAccount, isPriestAccount, isUserAccount],
  );

  const handleNotificationClick = useCallback(
    async (item) => {
      if (!item || !Number.isInteger(Number(item.id))) return;
      const destination = resolveNotificationDestination(item);

      if (!item.isRead) {
        const wasUpdated = await markNotificationAsRead(item.id);
        if (wasUpdated) {
          setNotifications((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
          await loadUnreadCount();
        }
      }

      setIsNotificationMenuOpen(false);
      navigate(destination);
    },
    [loadUnreadCount, markNotificationAsRead, navigate, resolveNotificationDestination],
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target)) {
        setIsNotificationMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
        setIsNotificationMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (hasExplicitNotificationCount || !notificationApi) {
      if (!hasExplicitNotificationCount) {
        setAutoNotificationCount(0);
      }
      return;
    }
    loadUnreadCount();
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        loadUnreadCount();
      }
    };
    window.addEventListener("focus", loadUnreadCount);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.removeEventListener("focus", loadUnreadCount);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [hasExplicitNotificationCount, loadUnreadCount, notificationApi]);

  useEffect(() => {
    if (hasExplicitNotificationCount || !notificationApi) return undefined;

    const handleNotificationUpdate = (event) => {
      void loadUnreadCount();
      if (isNotificationMenuOpen) {
        void loadNotifications();
      }
      if (!isUserAccount) return;
      let payload = {};
      try {
        payload = JSON.parse(String(event?.data || "{}"));
      } catch {
        return;
      }
      const notificationType = String(payload?.type || "").trim().toLowerCase();
      if (notificationType !== "progress_schedule_updated") return;
      setScheduleNotice(buildScheduleNotice(payload));
      void loadNotifications();
    };

    return subscribeNotificationStream(notificationApi.stream, {
      onNotification: handleNotificationUpdate,
    });
  }, [
    buildScheduleNotice,
    hasExplicitNotificationCount,
    isNotificationMenuOpen,
    isUserAccount,
    loadNotifications,
    loadUnreadCount,
    notificationApi,
  ]);

  return (
    <>
      <header className="app-header">
      <div className="header-brand">
        {canToggleSidebar ? (
          <button
            className="menu-button"
            type="button"
            aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={isSidebarOpen}
            onClick={onToggleSidebar}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          className="header-brand-home"
          onClick={() => navigate(dashboardPath)}
          aria-label="Go to Faithflow dashboard"
        >
          <img className="header-logo" src={logo} alt="" />
          <h1 className="app-title">Faithflow</h1>
        </button>
      </div>
      <div className="header-actions">
        <div className="notification-menu" ref={notificationMenuRef}>
          <button
            className={`icon-button icon-button--notif${resolvedNotificationCount > 0 ? " has-unread" : ""}${
              hasNewNotificationPulse ? " has-pulse" : ""
            }`}
            type="button"
            aria-haspopup="menu"
            aria-expanded={isNotificationMenuOpen}
            aria-label={
              resolvedNotificationCount > 0 ? `View notifications, ${resolvedNotificationCount} unread` : "View notifications"
            }
            onClick={() => {
              if (isNotificationMenuOpen) {
                setIsNotificationMenuOpen(false);
                return;
              }
              setIsUserMenuOpen(false);
              setIsNotificationMenuOpen(true);
              setHasNewNotificationPulse(false);
              void loadNotifications();
            }}
          >
            {resolvedNotificationCount > 0 ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
            {resolvedNotificationCount > 0 ? (
              <span className="header-notif-badge">{resolvedNotificationCount > 9 ? "9+" : resolvedNotificationCount}</span>
            ) : null}
          </button>
          {isNotificationMenuOpen ? (
            <div className="notification-menu-dropdown" role="menu" aria-label="Notifications">
              <header className="notification-menu-header">
                <strong>Notifications</strong>
                <button
                  className="notification-menu-mark-read"
                  type="button"
                  onClick={() => {
                    void markAllNotificationsAsRead();
                  }}
                  disabled={isMarkingAllRead || resolvedNotificationCount <= 0 || isLoadingNotifications}
                >
                  {isMarkingAllRead ? "Marking..." : "Mark all read"}
                </button>
              </header>
              {isLoadingNotifications ? (
                <p className="notification-menu-status">Loading notifications...</p>
              ) : notificationError ? (
                <p className="notification-menu-status is-error">{notificationError}</p>
              ) : notifications.length > 0 ? (
                <ul className="notification-menu-list">
                  {notifications.map((item) => {
                    const visual = getNotificationVisual(item);
                    const IconComponent = visual.icon;
                    return (
                      <li
                        key={`notif-${item.id}`}
                        className={`notification-menu-item ${visual.toneClass}${item.isRead ? " is-read" : " is-unread"}`}
                        role="menuitem"
                        tabIndex={0}
                        onClick={() => {
                          void handleNotificationClick(item);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void handleNotificationClick(item);
                          }
                        }}
                      >
                        <span className={`notification-menu-icon ${visual.toneClass}`} aria-hidden="true">
                          <IconComponent size={15} />
                        </span>
                        <div className="notification-menu-content">
                          <p className="notification-menu-title">{item.title}</p>
                          <p className="notification-menu-body">{item.body}</p>
                          {String(item.type || "").toLowerCase() === "progress_schedule_updated" &&
                          (item.metadata?.previousLabel || item.metadata?.nextLabel) ? (
                            <div className="notification-menu-schedule">
                              {item.metadata.previousLabel ? (
                                <span className="notification-menu-schedule-time is-old">{item.metadata.previousLabel}</span>
                              ) : null}
                              {item.metadata.previousLabel && item.metadata.nextLabel ? (
                                <span aria-hidden="true">→</span>
                              ) : null}
                              {item.metadata.nextLabel ? (
                                <span className="notification-menu-schedule-time is-new">{item.metadata.nextLabel}</span>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="notification-menu-meta">
                            {item.createdAt ? <span className="notification-menu-time">{formatNotificationTimestamp(item.createdAt)}</span> : <span />}
                            {!item.isRead ? <span className="notification-menu-unread-dot" aria-label="Unread notification" /> : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="notification-menu-status">No Notifications</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="user-menu" ref={userMenuRef}>
          <button
            className="icon-button"
            type="button"
            aria-label="Open user menu"
            aria-haspopup="menu"
            aria-expanded={isUserMenuOpen}
            onClick={() => setIsUserMenuOpen((current) => !current)}
          >
            {shouldShowProfilePhoto ? (
              <img
                src={headerProfilePhotoSource}
                alt="Profile"
                className="header-profile-photo"
                onError={() => setIsProfileImageBroken(true)}
              />
            ) : (
              <UserRound aria-hidden="true" />
            )}
          </button>
          {isUserMenuOpen ? (
            <div className="user-menu-dropdown" role="menu" aria-label="User options">
              <button
                className="user-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  if (onProfile) onProfile();
                }}
              >
                <User className="menu-item-icon" aria-hidden="true" />
                <span>{t("profile", "Profile", language)}</span>
              </button>
              {canShowSettings ? (
                <button
                  className="user-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    if (onSettings) {
                      onSettings();
                      return;
                    }
                    if (isAdminAccount) {
                      navigate("/admin/settings");
                      return;
                    }
                    if (isUserAccount) {
                      navigate("/dashboard/settings");
                    }
                  }}
                >
                  <Settings className="menu-item-icon" aria-hidden="true" />
                  <span>{t("settings", "Settings", language)}</span>
                </button>
              ) : null}
              {faqPath ? (
                <button
                  className="user-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate(faqPath);
                  }}
                >
                  <CircleHelp className="menu-item-icon" aria-hidden="true" />
                  <span>{t("faqs", "FAQs", language)}</span>
                </button>
              ) : null}
              <button
                className="user-menu-item user-menu-item-logout"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setIsLogoutConfirmOpen(true);
                }}
              >
                <LogOut className="menu-item-icon" aria-hidden="true" />
                <span>{t("logout", "Logout", language)}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      </header>
      {topNotice?.message ? (
        <div className={`header-top-notice${topNotice.type === "error" ? " is-error" : ""}`} role="status" aria-live="polite">
          {topNotice.message}
        </div>
      ) : null}
      {isUserAccount && scheduleNotice ? (
        <aside className="header-schedule-notice" role="status" aria-live="polite">
          <span className="header-schedule-notice__icon" aria-hidden="true">
            <CalendarClock size={20} />
          </span>
          <div className="header-schedule-notice__copy">
            <strong>{scheduleNotice.title}</strong>
            <p>{scheduleNotice.body}</p>
            {scheduleNotice.previousLabel || scheduleNotice.nextLabel ? (
              <div className="header-schedule-notice__times">
                {scheduleNotice.previousLabel ? (
                  <span className="header-schedule-notice__time is-old">{scheduleNotice.previousLabel}</span>
                ) : null}
                {scheduleNotice.previousLabel && scheduleNotice.nextLabel ? (
                  <span className="header-schedule-notice__arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
                {scheduleNotice.nextLabel ? (
                  <span className="header-schedule-notice__time is-new">{scheduleNotice.nextLabel}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="header-schedule-notice__actions">
            <button
              type="button"
              className="header-schedule-notice__view"
              onClick={() => {
                const destination = scheduleNotice.path || "/dashboard/status";
                setScheduleNotice(null);
                navigate(destination);
              }}
            >
              View appointment
            </button>
            <button
              type="button"
              className="header-schedule-notice__close"
              aria-label="Dismiss schedule notice"
              onClick={() => setScheduleNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        </aside>
      ) : null}
      {isLogoutConfirmOpen ? (
        <div
          className="header-logout-overlay"
          role="presentation"
          onClick={() => setIsLogoutConfirmOpen(false)}
        >
          <section
            className="header-logout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="header-logout-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="header-logout-modal-body">
              <span className="header-logout-modal-icon" aria-hidden="true">
                <LogOut size={24} />
              </span>
              <h3 id="header-logout-title">
                {t("logoutConfirmTitle", "Are you sure you want to logout?", language)}
              </h3>
            </div>
            <div className="header-logout-modal-actions">
              <button type="button" className="secondary" onClick={() => setIsLogoutConfirmOpen(false)}>
                {t("cancel", "Cancel", language)}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setIsLogoutConfirmOpen(false);
                  if (typeof onLogout === "function") onLogout();
                }}
              >
                {t("logout", "Logout", language)}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default Header;
