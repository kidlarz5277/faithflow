import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Inbox, MapPin, PencilLine, Phone, UserRound } from "lucide-react";
import PageGuide from "../components/PageGuide";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import {
  getCalendarEntryDisplayTitle,
  getCalendarEntryLocationLabel,
  getCalendarRequesterName,
  getManilaDateKeyAndMinutes,
  sanitizeScheduleNotes,
} from "../utils/parishSchedule";
import { subscribeNotificationStream } from "../utils/notificationStream";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";
import "./PriestAppointmentsPages.css";

const formatDateTimeLabel = (value) => {
  if (!value) return "";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return parsedDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getRemarksStatusMeta = (entry) => {
  const status = String(entry?.remarkStatus || "").trim().toLowerCase();
  if (status === "reviewed_by_secretary" || entry?.reviewedBySecretary) {
    return {
      className: "is-remarks-reviewed",
      label: entry?.remarkStatusLabel || "Reviewed",
    };
  }
  if (status === "remarks_sent" || Boolean(String(entry?.priestRemarks || "").trim())) {
    return {
      className: "is-remarks-sent",
      label: entry?.remarkStatusLabel || "Remarks Sent",
    };
  }
  return {
    className: "is-awaiting-remarks",
    label: entry?.remarkStatusLabel || "Needs Remarks",
  };
};

const getUsefulLocationLabel = (entry) => {
  const title = String(entry?.title || "").trim().toLowerCase();
  const sacramentName = String(entry?.sacramentName || "").trim().toLowerCase();
  const candidates = [
    String(entry?.locationLabel || "").trim(),
    getCalendarEntryLocationLabel(entry, { emptyLabel: "" }),
    String(entry?.location || "").trim(),
  ].filter(Boolean);
  const location = candidates.find((value) => {
    const normalized = value.toLowerCase();
    return (
      normalized !== "location not set" &&
      normalized !== title &&
      normalized !== sacramentName &&
      normalized !== "parish schedule"
    );
  });
  if (location) return location;
  return String(entry?.scheduleType || "").trim().toLowerCase() === "parish_event" || !candidates[0]
    ? "Parish"
    : "Parish";
};

const formatScheduleWhen = (entry) => {
  const dateLabel = formatLongDate(entry?.eventDate);
  const timeLabel = formatTimeRange(entry?.startTime, entry?.endTime);
  const normalized = String(entry?.eventDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return timeLabel;
  const weekday = new Date(`${normalized}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday}, ${dateLabel} · ${timeLabel}`;
};

const getTimingMeta = (entry) => {
  if (entry?.timingLabel) {
    return { key: entry.timingKey || "upcoming", label: entry.timingLabel };
  }
  const date = String(entry?.eventDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { key: "unscheduled", label: "Date not set" };
  }
  const manila = getManilaDateKeyAndMinutes();
  const daysUntil = Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${manila.dateKey}T00:00:00`).getTime()) / 86400000,
  );
  if (daysUntil === 0) return { key: "today", label: "Today" };
  if (daysUntil === 1) return { key: "tomorrow", label: "Tomorrow" };
  if (daysUntil === -1) return { key: "past", label: "Yesterday" };
  if (daysUntil < 0) return { key: "past", label: `${Math.abs(daysUntil)} days ago` };
  return { key: "upcoming", label: `In ${daysUntil} days` };
};

const formatLongDate = (value) => {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "Date not set";
  return new Date(`${normalized}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const to12HourTime = (timeValue) => {
  if (!timeValue) return "Time not set";
  const [hoursRaw, minutesRaw] = String(timeValue).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "Time not set";
  const normalizedHours = ((hours % 24) + 24) % 24;
  const period = normalizedHours >= 12 ? "PM" : "AM";
  const twelveHour = normalizedHours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${period}`;
};

const formatTimeRange = (startTime, endTime) => {
  const startLabel = startTime ? to12HourTime(startTime) : "";
  const endLabel = endTime ? to12HourTime(endTime) : "";
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || "Time not set";
};

const cleanScheduleNotes = sanitizeScheduleNotes;

const ASSIGNMENT_TYPE_OPTIONS = [
  { value: "parish_event", label: "Parish Event" },
  { value: "priest_schedule", label: "Priest Schedule" },
];

const getScheduleTypeKey = (entry) => {
  const raw = String(entry?.scheduleType || "").trim().toLowerCase();
  return raw === "parish_event" ? "parish_event" : "priest_schedule";
};

const getTypeLabel = (entry) =>
  String(entry?.typeLabel || "").trim() ||
  (getScheduleTypeKey(entry) === "parish_event" ? "Parish Event" : "Priest Schedule");

const getAssignedStamp = (entry) => {
  const assigned = Date.parse(entry?.assignedAt || entry?.createdAt || "");
  if (!Number.isNaN(assigned)) return assigned;
  return Number(entry?.id) || 0;
};

const getEventStamp = (entry) => {
  const date = String(entry?.eventDate || "").trim();
  const time = String(entry?.startTime || "00:00").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}`);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return getAssignedStamp(entry);
};

const hasPriestRemarks = (entry) => {
  if (typeof entry?.hasRemarks === "boolean") return entry.hasRemarks;
  const status = String(entry?.remarkStatus || "").trim().toLowerCase();
  if (status === "remarks_sent" || status === "reviewed_by_secretary") return true;
  if (entry?.reviewedBySecretary) return true;
  return Boolean(String(entry?.priestRemarks || "").trim());
};

const EMPTY_SUMMARY = {
  totalAssigned: 0,
  awaitingRemarks: 0,
  remarksSent: 0,
  reviewed: 0,
};

function PriestAssignedAppointments() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [formErrorMessage, setFormErrorMessage] = useState("");
  const [formSuccessMessage, setFormSuccessMessage] = useState("");
  const [remarkDraftByScheduleId, setRemarkDraftByScheduleId] = useState({});
  const [isSubmittingRemarkByScheduleId, setIsSubmittingRemarkByScheduleId] = useState({});
  const [editingRemarkId, setEditingRemarkId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedSort, setSelectedSort] = useState("upcoming");
  const [listView, setListView] = useState(() =>
    String(searchParams.get("view") || "").trim().toLowerCase() === "remarked" ? "remarked" : "awaiting",
  );
  const focusedScheduleId = Number(searchParams.get("scheduleID"));
  const autoViewAppliedRef = useRef("");

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
  const accountType = String(authData?.accountType || "")
    .trim()
    .toLowerCase();
  const priestID = Number(user?.priestID);

  useEffect(() => {
    document.title = "Faithflow - Priest Assigned Appointments";
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
    if (accountType !== "priest") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user, accountType]);

  const loadAssignedAppointments = async () => {
    if (!Number.isInteger(priestID) || priestID <= 0) return;
    setIsLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({ priestID: String(priestID) });
      if (selectedType === "parish_event" || selectedType === "priest_schedule") {
        params.set("type", selectedType);
      }
      params.set(
        "sort",
        selectedSort === "oldest" || selectedSort === "latest" || selectedSort === "upcoming"
          ? selectedSort
          : "upcoming",
      );
      const response = await fetch(`/api/priest/me/assigned-schedules?${params.toString()}`);
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load assigned appointments.");
      }
      const assignedSchedules = Array.isArray(responseData?.schedules) ? responseData.schedules : [];
      setRecords(assignedSchedules);
      setSummary({
        totalAssigned: Number(responseData?.summary?.totalAssigned) || assignedSchedules.length,
        awaitingRemarks:
          Number(responseData?.summary?.awaitingRemarks) ||
          assignedSchedules.filter((entry) => !hasPriestRemarks(entry)).length,
        remarksSent:
          Number(responseData?.summary?.remarksSent) ||
          assignedSchedules.filter((entry) => hasPriestRemarks(entry)).length,
        reviewed:
          Number(responseData?.summary?.reviewed) ||
          assignedSchedules.filter((entry) => entry?.reviewedBySecretary).length,
      });
      setRemarkDraftByScheduleId(
        assignedSchedules.reduce((accumulator, entry) => {
          const scheduleID = Number(entry?.id);
          if (!Number.isInteger(scheduleID) || scheduleID <= 0) return accumulator;
          accumulator[scheduleID] = String(entry?.priestRemarks || "").trim();
          return accumulator;
        }, {}),
      );
    } catch (error) {
      setRecords([]);
      setSummary(EMPTY_SUMMARY);
      setErrorMessage(error.message || "Unable to load assigned appointments.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignedAppointments();
  }, [priestID, selectedType, selectedSort]);

  useEffect(() => {
    const view = String(searchParams.get("view") || "").trim().toLowerCase();
    if (view === "remarked" || view === "awaiting") {
      setListView(view);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!Number.isInteger(focusedScheduleId) || focusedScheduleId <= 0 || records.length === 0) return;
    const focused = records.find((entry) => Number(entry.id) === focusedScheduleId);
    if (!focused) return;
    const nextView = hasPriestRemarks(focused) ? "remarked" : "awaiting";
    const appliedKey = `${focusedScheduleId}-${nextView}`;
    if (autoViewAppliedRef.current === appliedKey) return;
    autoViewAppliedRef.current = appliedKey;
    setListView(nextView);
  }, [focusedScheduleId, records]);

  useEffect(() => {
    if (!Number.isInteger(priestID) || priestID <= 0) return undefined;
    return subscribeNotificationStream(`/api/notifications/stream?accountType=priest&priestID=${priestID}`, {
      onNotification: () => {
        void loadAssignedAppointments();
      },
    });
  }, [priestID]);

  useEffect(() => {
    if (!Number.isInteger(focusedScheduleId) || focusedScheduleId <= 0) return;
    const node = document.getElementById(`assigned-schedule-${focusedScheduleId}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedScheduleId, listView, records]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const nextItems = records.filter((entry) => {
      const title = String(entry?.title || "").trim();
      const typeLabel = getTypeLabel(entry);
      const typeKey = getScheduleTypeKey(entry);
      const status = String(entry?.remarkStatusLabel || entry?.remarkStatus || "").trim();
      const idLabel = String(entry?.id || "").trim();
      const requester = String(entry?.requesterFullName || getCalendarRequesterName(entry) || "").trim();
      const locationLabel = String(
        entry?.locationLabel || getCalendarEntryLocationLabel(entry, { emptyLabel: "" }) || "",
      ).trim();
      const sacramentName = String(entry?.sacramentName || "").trim();
      const matchesSearch =
        !normalizedSearch ||
        title.toLowerCase().includes(normalizedSearch) ||
        sacramentName.toLowerCase().includes(normalizedSearch) ||
        typeLabel.toLowerCase().includes(normalizedSearch) ||
        status.toLowerCase().includes(normalizedSearch) ||
        requester.toLowerCase().includes(normalizedSearch) ||
        locationLabel.toLowerCase().includes(normalizedSearch) ||
        String(entry?.location || "").toLowerCase().includes(normalizedSearch) ||
        String(entry?.contactNumber || "").toLowerCase().includes(normalizedSearch) ||
        idLabel.includes(normalizedSearch);
      const matchesType =
        selectedType !== "parish_event" && selectedType !== "priest_schedule"
          ? true
          : typeKey === selectedType;
      return matchesSearch && matchesType;
    });

    nextItems.sort((a, b) => {
      if (selectedSort === "upcoming") {
        return getEventStamp(a) - getEventStamp(b) || Number(a?.id || 0) - Number(b?.id || 0);
      }
      const newestFirst = getAssignedStamp(b) - getAssignedStamp(a) || Number(b?.id || 0) - Number(a?.id || 0);
      return selectedSort === "oldest" ? -newestFirst : newestFirst;
    });
    return nextItems;
  }, [records, searchQuery, selectedSort, selectedType]);

  const awaitingRemarkItems = useMemo(
    () => filteredItems.filter((entry) => !hasPriestRemarks(entry)),
    [filteredItems],
  );
  const remarkedItems = useMemo(
    () => filteredItems.filter((entry) => hasPriestRemarks(entry)),
    [filteredItems],
  );
  const visibleItems = listView === "remarked" ? remarkedItems : awaitingRemarkItems;

  const remarksSentCount = records.filter((entry) => hasPriestRemarks(entry)).length;
  const awaitingRemarksCount = records.filter((entry) => !hasPriestRemarks(entry)).length;

  const beginEditRemarks = (schedule) => {
    const scheduleID = Number(schedule?.id);
    if (!Number.isInteger(scheduleID) || scheduleID <= 0) return;
    setEditingRemarkId(scheduleID);
    setRemarkDraftByScheduleId((current) => ({
      ...current,
      [scheduleID]: String(schedule?.priestRemarks || current[scheduleID] || "").trim(),
    }));
    setFormErrorMessage("");
    setFormSuccessMessage("");
  };

  const cancelEditRemarks = (schedule) => {
    const scheduleID = Number(schedule?.id);
    setEditingRemarkId(null);
    if (!Number.isInteger(scheduleID) || scheduleID <= 0) return;
    setRemarkDraftByScheduleId((current) => ({
      ...current,
      [scheduleID]: String(schedule?.priestRemarks || "").trim(),
    }));
    setFormErrorMessage("");
  };

  const handleSendRemarks = async (schedule, { isUpdate = false } = {}) => {
    const scheduleID = Number(schedule?.id);
    if (!Number.isInteger(scheduleID) || scheduleID <= 0) return;
    if (!Number.isInteger(priestID) || priestID <= 0) return;

    const remarks = String(remarkDraftByScheduleId[scheduleID] || "").trim();
    if (!remarks) {
      setFormErrorMessage(isUpdate ? "Please enter your updated remarks before saving." : "Please enter your remarks before sending.");
      setFormSuccessMessage("");
      return;
    }
    if (isUpdate && remarks === String(schedule?.priestRemarks || "").trim()) {
      setFormErrorMessage("Change your remarks before saving.");
      setFormSuccessMessage("");
      return;
    }
    setFormErrorMessage("");
    setFormSuccessMessage("");
    setIsSubmittingRemarkByScheduleId((current) => ({ ...current, [scheduleID]: true }));
    try {
      const response = await fetch(`/api/priest/me/assigned-schedules/${scheduleID}/remarks?priestID=${priestID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to send remarks right now.");
      }
      const savedRemark = responseData?.remark || null;
      setRecords((current) =>
        current.map((entry) =>
          Number(entry.id) === scheduleID
            ? {
                ...entry,
                priestRemarks: savedRemark?.remarks || remarks,
                hasRemarks: true,
                remarkStatus: savedRemark?.status || "remarks_sent",
                remarkStatusLabel: "Remarks Sent",
                remarkSentAt: savedRemark?.sentAt || new Date().toISOString(),
                remarkUpdatedAt: savedRemark?.updatedAt || new Date().toISOString(),
                reviewedBySecretary: false,
                reviewedAt: null,
              }
            : entry,
        ),
      );
      setEditingRemarkId(null);
      setSummary((current) => ({
        ...current,
        awaitingRemarks: Math.max(0, Number(current.awaitingRemarks || 0) - (isUpdate ? 0 : 1)),
        remarksSent: Number(current.remarksSent || 0) + (isUpdate ? 0 : 1),
        reviewed: Math.max(0, Number(current.reviewed || 0) - (schedule?.reviewedBySecretary ? 1 : 0)),
      }));
      setFormSuccessMessage(
        isUpdate
          ? "Remarks updated. The parish secretary will review the new note."
          : "Remarks sent to the parish secretary.",
      );
      setFormErrorMessage("");
    } catch (error) {
      setFormErrorMessage(error.message || "Unable to send remarks right now.");
      setFormSuccessMessage("");
    } finally {
      setIsSubmittingRemarkByScheduleId((current) => ({ ...current, [scheduleID]: false }));
    }
  };

  if (!user || accountType !== "priest") return null;

  const renderAssignedCard = (entry) => {
    const remarksStatusMeta = getRemarksStatusMeta(entry);
    const typeLabel = getTypeLabel(entry);
    const secretaryNote = cleanScheduleNotes(entry.note);
    const remarkSentLabel = formatDateTimeLabel(entry.remarkSentAt);
    const reviewedLabel = formatDateTimeLabel(entry.reviewedAt);
    const updatedLabel = formatDateTimeLabel(entry.remarkUpdatedAt);
    const isParishEvent = String(entry.scheduleType || "").trim().toLowerCase() === "parish_event";
    const remarkStatus = String(entry?.remarkStatus || "").trim().toLowerCase();
    const alreadyRemarked = hasPriestRemarks(entry);
    const isEditingRemarks = alreadyRemarked && Number(editingRemarkId) === Number(entry.id);
    const canUpdateRemarks = remarkStatus === "remarks_sent" || remarkStatus === "reviewed_by_secretary";
    const timingMeta = getTimingMeta(entry);
    const requesterName = String(entry.requesterFullName || getCalendarRequesterName(entry) || "").trim();
    const locationLabel = getUsefulLocationLabel(entry);
    const sacramentName = String(entry.sacramentName || "").trim();
    const showSacrament = sacramentName && sacramentName.toLowerCase() !== String(entry.title || "").trim().toLowerCase();
    const metaItems = [
      { icon: CalendarDays, label: formatScheduleWhen(entry) },
      locationLabel ? { icon: MapPin, label: locationLabel } : null,
      requesterName ? { icon: UserRound, label: requesterName } : null,
      entry.contactNumber ? { icon: Phone, label: String(entry.contactNumber).trim() } : null,
    ].filter(Boolean);
    return (
      <li
        id={`assigned-schedule-${entry.id}`}
        key={`assigned-${entry.id}`}
        className={`priest-assigned-card ${isParishEvent ? "is-parish" : "is-appointment"} ${
          alreadyRemarked ? "is-remarked" : "is-awaiting"
        } is-${timingMeta.key}${Number(focusedScheduleId) === Number(entry.id) ? " is-focus" : ""}`}
      >
        <div className="priest-assigned-card-head">
          <div className="priest-assigned-card-copy">
            <div className="priest-assigned-title-row">
              <strong>{getCalendarEntryDisplayTitle(entry) || "Assigned Sacramental Schedule"}</strong>
              <span className={`priest-assigned-timing is-${timingMeta.key}`}>{timingMeta.label}</span>
            </div>
            {showSacrament ? <p className="priest-assigned-card-sub">{sacramentName}</p> : null}
          </div>
          <div className="priest-assigned-chip-row">
            <span className={`priest-assigned-type-chip ${isParishEvent ? "is-parish" : "is-appointment"}`}>
              {typeLabel}
            </span>
            <span className={`priest-page-status-chip ${remarksStatusMeta.className}`}>
              {remarksStatusMeta.label}
            </span>
          </div>
        </div>
        <ul className="priest-assigned-meta">
          {metaItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={`${entry.id}-${item.label}`}>
                <Icon size={14} aria-hidden="true" />
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
        {secretaryNote ? (
          <p className="priest-assigned-note">
            <span>Parish note</span>
            {secretaryNote}
          </p>
        ) : null}
        {alreadyRemarked && !isEditingRemarks ? (
          <div className="priest-assigned-remark-review">
            <div className="priest-assigned-remark-review-copy">
              <span>Your remarks</span>
              <p>{entry.priestRemarks || "No remarks saved."}</p>
              <small>
                {remarkSentLabel ? `Sent ${remarkSentLabel}` : "Sent"}
                {updatedLabel && updatedLabel !== remarkSentLabel ? ` · Updated ${updatedLabel}` : ""}
                {reviewedLabel ? ` · Reviewed ${reviewedLabel}` : ""}
              </small>
            </div>
            <button type="button" className="priest-assigned-edit-button" onClick={() => beginEditRemarks(entry)}>
              <PencilLine size={15} aria-hidden="true" />
              Edit Remarks
            </button>
          </div>
        ) : (
          <div className={`priest-assigned-composer ${isEditingRemarks ? "is-editing" : ""}`}>
            <label htmlFor={`priest-remarks-${entry.id}`}>
              {isEditingRemarks ? "Edit your remarks" : "Remarks"}
            </label>
            {isEditingRemarks && remarksStatusMeta.label === "Reviewed" ? (
              <p className="priest-assigned-edit-note">Saving a change will send this remark back for parish review.</p>
            ) : null}
            <div className="priest-assigned-composer-row">
              <textarea
                id={`priest-remarks-${entry.id}`}
                value={remarkDraftByScheduleId[entry.id] ?? entry.priestRemarks ?? ""}
                onChange={(event) =>
                  setRemarkDraftByScheduleId((current) => ({ ...current, [entry.id]: event.target.value }))
                }
                placeholder="Write a short confirmation or concern..."
                rows={isEditingRemarks ? 3 : 2}
                maxLength={1500}
              />
              <div className="priest-assigned-composer-actions">
                {isEditingRemarks ? (
                  <button
                    type="button"
                    className="priest-assigned-cancel-button"
                    onClick={() => cancelEditRemarks(entry)}
                    disabled={Boolean(isSubmittingRemarkByScheduleId[entry.id])}
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  className="priest-page-view-button"
                  onClick={() => void handleSendRemarks(entry, { isUpdate: isEditingRemarks || canUpdateRemarks })}
                  disabled={Boolean(isSubmittingRemarkByScheduleId[entry.id])}
                >
                  {isSubmittingRemarkByScheduleId[entry.id]
                    ? isEditingRemarks
                      ? "Saving..."
                      : "Sending..."
                    : isEditingRemarks || canUpdateRemarks
                      ? "Save Changes"
                      : "Send Remarks"}
                </button>
              </div>
            </div>
          </div>
        )}
      </li>
    );
  };

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
        onSettings={() => navigate("/priest/settings")}
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="priest" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero priest-assigned-hero admin-list-hero">
            <div>
              <h2>Assigned Appointments <PageGuide pageKey="assigned-appointments" /></h2>
            </div>
          </section>

          <section className="dashboard-panel priest-assigned-panel">
            <div className="priest-assigned-summary" aria-label="Assigned appointments summary">
              <article className="priest-assigned-stat">
                <span>Total Assigned</span>
                <strong>{Number(summary.totalAssigned) || records.length}</strong>
              </article>
              <article className="priest-assigned-stat is-awaiting">
                <span>Awaiting Remarks</span>
                <strong>{awaitingRemarksCount}</strong>
              </article>
              <article className="priest-assigned-stat is-sent">
                <span>Remarks Sent</span>
                <strong>{remarksSentCount}</strong>
              </article>
              <article className="priest-assigned-stat">
                <span>This List</span>
                <strong>{visibleItems.length}</strong>
              </article>
            </div>

            <div className="priest-assigned-view-toggle" role="tablist" aria-label="Assigned appointment lists">
              <button
                type="button"
                role="tab"
                aria-selected={listView === "awaiting"}
                className={`priest-assigned-view-button ${listView === "awaiting" ? "is-active" : ""}`}
                onClick={() => setListView("awaiting")}
              >
                Needs Remarks
                <span className={awaitingRemarkItems.length > 0 ? "is-alert" : ""}>{awaitingRemarkItems.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listView === "remarked"}
                className={`priest-assigned-view-button ${listView === "remarked" ? "is-active" : ""}`}
                onClick={() => setListView("remarked")}
              >
                Remarked
                <span>{remarkedItems.length}</span>
              </button>
            </div>

            <div className="priest-page-toolbar priest-assigned-toolbar" aria-label="Assigned appointments filters">
              <label className="appointment-filter-field">
                <span>Search</span>
                <input
                  type="search"
                  className="appointment-search-input"
                  value={searchQuery}
                  placeholder="Search title, place, requester, or ID"
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <label className="appointment-filter-field">
                <span>Type</span>
                <select className="appointment-filter-select" value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
                  <option value="">All types</option>
                  {ASSIGNMENT_TYPE_OPTIONS.map((option) => (
                    <option key={`assigned-type-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="appointment-filter-field">
                <span>Sort By</span>
                <select className="appointment-filter-select" value={selectedSort} onChange={(event) => setSelectedSort(event.target.value)}>
                  <option value="upcoming">Upcoming date</option>
                  <option value="latest">Newest assigned</option>
                  <option value="oldest">Oldest assigned</option>
                </select>
              </label>
            </div>

            {errorMessage ? <p className="priest-dashboard-error">{errorMessage}</p> : null}
            {formErrorMessage ? <p className="priest-dashboard-error">{formErrorMessage}</p> : null}
            {formSuccessMessage ? <p className="priest-page-empty priest-page-success">{formSuccessMessage}</p> : null}
            {isLoading ? <p className="priest-page-empty">Loading assigned appointments...</p> : null}
            {!isLoading && !errorMessage && visibleItems.length === 0 ? (
              <div className="priest-assigned-empty" role="status">
                <Inbox size={28} strokeWidth={1.5} aria-hidden="true" />
                <p>
                  {filteredItems.length === 0
                    ? "No assigned appointments found for the selected filters."
                    : listView === "remarked"
                      ? "No remarked appointments yet."
                      : "No appointments are waiting for remarks."}
                </p>
              </div>
            ) : null}
            {!isLoading && !errorMessage && visibleItems.length > 0 ? (
              <ul className="priest-assigned-list">{visibleItems.map((entry) => renderAssignedCard(entry))}</ul>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}

export default PriestAssignedAppointments;
