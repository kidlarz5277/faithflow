import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Inbox, Pencil, Plus, Ticket, Users } from "lucide-react";
import PageGuide from "../components/PageGuide";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import {
  formatEventDateTimeLabel,
  formatLongDate,
  formatOccupiedSlotsLabel,
  getManilaDateKey,
  getParishHourSlotKey,
  getScheduleSlotsForDay,
  isPriestAssignedCalendarEntry,
  normalizeScheduleMinAdvanceDays,
  occupiedSlotsToFormTimes,
  toggleOccupiedHourSlot,
  toEventDateKey,
} from "../utils/parishSchedule";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminDashboard.css";
import "./AdminProgressDetails.css";
import "./AdminSpecialProgramsPage.css";

const EMPTY_PROGRAM_FORM = {
  title: "",
  sSacramentID: "",
  slotLimitType: "maximum",
  maxSlots: "1",
  eventDate: "",
  startTime: "",
  endTime: "",
  durationHours: 1,
  occupiedSlots: [],
  priestID: "",
  deadline: "",
};

const isSpecialProgramEntry = (entry) => Number.isInteger(Number(entry?.s_sacramentID)) && Number(entry.s_sacramentID) > 0;

function AdminSpecialProgramsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [calendarEntries, setCalendarEntries] = useState([]);
  const [priests, setPriests] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [programBlueprints, setProgramBlueprints] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [programForm, setProgramForm] = useState(EMPTY_PROGRAM_FORM);
  const [priestCalendarMonth, setPriestCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [remoteDayAvailability, setRemoteDayAvailability] = useState(null);
  const [isLoadingScheduleSlots, setIsLoadingScheduleSlots] = useState(false);
  const [dayOffWeekday, setDayOffWeekday] = useState(null);
  const [dayOffSpecificDates, setDayOffSpecificDates] = useState([]);
  const [scheduleMinAdvanceDays, setScheduleMinAdvanceDays] = useState(5);
  const [editingOriginalEventDate, setEditingOriginalEventDate] = useState("");

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
  const adminID = Number(user?.adminID);

  useEffect(() => {
    document.title = "Faithflow - Special Programs";
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [accountType, navigate, user]);

  useEffect(() => {
    const incomingNotice = String(location.state?.notice || "").trim();
    if (!incomingNotice) return;
    setNotice(incomingNotice);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const loadPrograms = async () => {
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setCalendarEntries([]);
      setLoadError("Unable to detect admin account.");
      return;
    }
    setIsLoading(true);
    setLoadError("");
    try {
      const [calendarResponse, priestsResponse, dayOffResponse] = await Promise.all([
        fetch(`/admin-api/calendar-entries?adminID=${adminID}`),
        fetch(`/admin-api/priests?adminID=${adminID}&includeInactive=true`),
        fetch(`/admin-api/day-offs?adminID=${adminID}`),
      ]);
      const calendarData = await calendarResponse.json().catch(() => []);
      const priestsData = await priestsResponse.json().catch(() => []);
      const dayOffData = await dayOffResponse.json().catch(() => null);
      if (!calendarResponse.ok) throw new Error("Unable to load special sacramental programs.");
      if (!priestsResponse.ok) throw new Error("Unable to load priests.");
      setCalendarEntries(Array.isArray(calendarData) ? calendarData : []);
      setPriests((Array.isArray(priestsData) ? priestsData : []).filter((priest) => priest && priest.isActive !== false));
      if (dayOffResponse.ok) {
        const weekdayRaw = dayOffData?.weekday;
        const parsedWeekday = weekdayRaw === null || weekdayRaw === undefined || weekdayRaw === "" ? null : Number(weekdayRaw);
        setDayOffWeekday(Number.isInteger(parsedWeekday) && parsedWeekday >= 0 && parsedWeekday <= 6 ? parsedWeekday : null);
        setDayOffSpecificDates(
          Array.isArray(dayOffData?.specificDates)
            ? dayOffData.specificDates
                .map((item) => String(item?.date || "").trim())
                .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
            : [],
        );
        setScheduleMinAdvanceDays(normalizeScheduleMinAdvanceDays(dayOffData?.minAdvanceDays));
      }
    } catch (error) {
      setCalendarEntries([]);
      setPriests([]);
      setLoadError(error.message || "Unable to load special sacramental programs.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user || accountType !== "admin") return;
    void loadPrograms();
  }, [accountType, adminID, user]);

  useEffect(() => {
    if (!user || accountType !== "admin") return undefined;
    let cancelled = false;
    const loadBlueprints = async () => {
      try {
        const response = await fetch("/admin-api/special-sacrament-form-schemas");
        const payload = await response.json().catch(() => []);
        if (!response.ok || cancelled) return;
        const names = (Array.isArray(payload) ? payload : [])
          .map((entry) =>
            String(entry?.displayLabel || entry?.specialSacramentName || entry?.s_sacramentName || "").trim(),
          )
          .filter(Boolean);
        const known = new Set(names.map((name) => name.toLowerCase()));
        const programNames = (Array.isArray(calendarEntries) ? calendarEntries : [])
          .filter((entry) => isSpecialProgramEntry(entry))
          .map((entry) => String(entry?.s_sacramentName || entry?.title || "").trim())
          .filter(Boolean);
        for (const programName of [...new Set(programNames)]) {
          if (known.has(programName.toLowerCase())) continue;
          const createResponse = await fetch("/admin-api/special-sacrament-form-schemas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ specialSacramentName: programName, displayLabel: programName }),
          });
          if (createResponse.ok || createResponse.status === 409) names.push(programName);
        }
        setProgramBlueprints([...new Set(names)].sort((left, right) => left.localeCompare(right)));
      } catch {
        if (!cancelled) setProgramBlueprints([]);
      }
    };
    void loadBlueprints();
    return () => {
      cancelled = true;
    };
  }, [accountType, calendarEntries, user]);

  const specialProgramEntries = useMemo(
    () => {
      const todayKey = getManilaDateKey();
      return calendarEntries
        .filter((entry) => isSpecialProgramEntry(entry))
        .filter((entry) => {
          const dateKey = toEventDateKey(entry.eventDate) || String(entry.eventDate || "").slice(0, 10);
          return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey >= todayKey;
        })
        .sort((a, b) => {
          const dateA = `${a?.eventDate || ""}T${a?.startTime || "00:00"}:00`;
          const dateB = `${b?.eventDate || ""}T${b?.startTime || "00:00"}:00`;
          return dateA.localeCompare(dateB);
        });
    },
    [calendarEntries],
  );

  const priestNameById = useMemo(
    () => new Map(priests.map((priest) => [Number(priest.priestID), String(priest.fullName || "").trim()])),
    [priests],
  );
  const selectedProgramPriestID = Number(programForm.priestID);
  const selectedProgramPriestEntries = useMemo(
    () =>
      (Array.isArray(calendarEntries) ? calendarEntries : []).filter((entry) =>
        isPriestAssignedCalendarEntry(entry, selectedProgramPriestID),
      ),
    [calendarEntries, selectedProgramPriestID],
  );
  const selectedProgramDayEntries = useMemo(
    () =>
      selectedProgramPriestEntries.filter(
        (entry) => toEventDateKey(entry?.eventDate) === String(programForm.eventDate || "").trim(),
      ),
    [programForm.eventDate, selectedProgramPriestEntries],
  );
  const isEditingOriginalScheduleDate =
    Boolean(editingEntryId) &&
    /^\d{4}-\d{2}-\d{2}$/.test(editingOriginalEventDate) &&
    String(programForm.eventDate || "").trim() === editingOriginalEventDate;
  const programSlotOptions = useMemo(() => {
    if (
      remoteDayAvailability &&
      remoteDayAvailability.date === programForm.eventDate &&
      Number(remoteDayAvailability.priestID) === selectedProgramPriestID &&
      Array.isArray(remoteDayAvailability.slots)
    ) {
      if (remoteDayAvailability.isLocked && isEditingOriginalScheduleDate) {
        return remoteDayAvailability.slots.map((slot) => ({
          ...slot,
          available: !remoteDayAvailability.isDayOff && !slot.conflictTitle,
        }));
      }
      return remoteDayAvailability.slots;
    }
    const isDayOff =
      dayOffSpecificDates.includes(programForm.eventDate) ||
      (Number.isInteger(dayOffWeekday) &&
        programForm.eventDate &&
        dayOffWeekday === new Date(`${programForm.eventDate}T00:00:00`).getDay());
    return getScheduleSlotsForDay(selectedProgramDayEntries, editingEntryId, {
      isDayOff,
    });
  }, [
    dayOffSpecificDates,
    dayOffWeekday,
    editingEntryId,
    isEditingOriginalScheduleDate,
    programForm.eventDate,
    remoteDayAvailability,
    selectedProgramDayEntries,
    selectedProgramPriestID,
  ]);
  const programDayExistingEntries = selectedProgramDayEntries.filter(
    (entry) => !editingEntryId || Number(entry?.id) !== Number(editingEntryId),
  );
  const priestCalendarMonthLabel = priestCalendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const priestCalendarFirstDayIndex = new Date(priestCalendarMonth.getFullYear(), priestCalendarMonth.getMonth(), 1).getDay();
  const priestCalendarDaysInMonth = new Date(priestCalendarMonth.getFullYear(), priestCalendarMonth.getMonth() + 1, 0).getDate();
  const priestCalendarTodayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  const priestCalendarEntriesByDate = selectedProgramPriestEntries.reduce((accumulator, entry) => {
    const dateKey = toEventDateKey(entry?.eventDate);
    if (!dateKey) return accumulator;
    accumulator[dateKey] = accumulator[dateKey] || [];
    accumulator[dateKey].push(entry);
    return accumulator;
  }, {});
  const isProgramDayOff =
    Boolean(remoteDayAvailability?.date === programForm.eventDate && remoteDayAvailability.isDayOff) ||
    dayOffSpecificDates.includes(programForm.eventDate) ||
    (Number.isInteger(dayOffWeekday) &&
      programForm.eventDate &&
      dayOffWeekday === new Date(`${programForm.eventDate}T00:00:00`).getDay());
  const isProgramDayLocked = Boolean(
    remoteDayAvailability?.date === programForm.eventDate &&
      remoteDayAvailability.isLocked &&
      !isEditingOriginalScheduleDate,
  );

  useEffect(() => {
    if (!isModalOpen) return undefined;
    if (!Number.isInteger(selectedProgramPriestID) || selectedProgramPriestID <= 0) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(programForm.eventDate || "").trim())) return undefined;
    if (!Number.isInteger(adminID) || adminID <= 0) return undefined;

    let isCancelled = false;
    const loadSlots = async () => {
      setIsLoadingScheduleSlots(true);
      try {
        const excludeQuery = editingEntryId ? `&excludeCalendarEntryID=${editingEntryId}` : "";
        const response = await fetch(
          `/admin-api/priests/${selectedProgramPriestID}/available-slots?adminID=${adminID}&date=${programForm.eventDate}${excludeQuery}&durationHours=1&minAdvanceDays=0`,
        );
        const payload = await response.json().catch(() => null);
        if (isCancelled) return;
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to load available time slots.");
        }
        setRemoteDayAvailability(payload);
      } catch (error) {
        if (!isCancelled) {
          setRemoteDayAvailability(null);
          setFormError(error.message || "Unable to load available time slots.");
        }
      } finally {
        if (!isCancelled) setIsLoadingScheduleSlots(false);
      }
    };
    void loadSlots();
    return () => {
      isCancelled = true;
    };
  }, [adminID, editingEntryId, isModalOpen, programForm.eventDate, selectedProgramPriestID]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const resetProgramForm = () => {
    setProgramForm(EMPTY_PROGRAM_FORM);
    setEditingEntryId(null);
    setFormError("");
    setIsDeleteConfirmOpen(false);
    setRemoteDayAvailability(null);
    setEditingOriginalEventDate("");
    setPriestCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetProgramForm();
  };

  const handleAddProgram = () => {
    resetProgramForm();
    setProgramForm({ ...EMPTY_PROGRAM_FORM });
    setIsModalOpen(true);
  };

  const handleEditProgram = (entry) => {
    setFormError("");
    setEditingEntryId(entry.id);
    const times = occupiedSlotsToFormTimes(entry.occupiedSlots, entry.startTime, entry.endTime);
    setProgramForm({
      title: entry.s_sacramentName || entry.title || "",
      sSacramentID: String(entry.s_sacramentID || ""),
      slotLimitType: Boolean(entry.isUnlimitedSlots) || Number(entry.maxSlots) <= 0 ? "unlimited" : "maximum",
      maxSlots:
        !(Boolean(entry.isUnlimitedSlots) || Number(entry.maxSlots) <= 0) && Number(entry.maxSlots) > 0
          ? String(entry.maxSlots)
          : "1",
      eventDate: entry.eventDate || "",
      startTime: times.startTime,
      endTime: times.endTime,
      durationHours: times.durationHours,
      occupiedSlots: times.occupiedSlots,
      priestID: entry.priestID ? String(entry.priestID) : "",
      deadline: String(entry.deadline || "").slice(0, 10),
    });
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(entry.eventDate || ""))) {
      const [year, month] = String(entry.eventDate).split("-").map(Number);
      setPriestCalendarMonth(new Date(year, month - 1, 1));
      setEditingOriginalEventDate(String(entry.eventDate).slice(0, 10));
    } else {
      setEditingOriginalEventDate("");
    }
    setRemoteDayAvailability(null);
    setIsModalOpen(true);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    if (name === "slotLimitType") {
      setProgramForm((current) => ({
        ...current,
        slotLimitType: value === "unlimited" ? "unlimited" : "maximum",
        maxSlots: value === "unlimited" ? "" : current.maxSlots || "1",
      }));
      return;
    }
    setProgramForm((current) => {
      const next = {
        ...current,
        [name]: value,
        ...(name === "priestID"
          ? { startTime: "", endTime: "", occupiedSlots: [], durationHours: 1 }
          : {}),
      };
      if (name === "deadline" && next.eventDate && next.eventDate <= value) {
        next.eventDate = "";
        next.startTime = "";
        next.endTime = "";
        next.occupiedSlots = [];
        next.durationHours = 1;
      }
      return next;
    });
    if (name === "priestID") {
      setRemoteDayAvailability(null);
    }
  };

  const handleSaveProgram = async (event) => {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      if (!Number.isInteger(adminID) || adminID <= 0) {
        throw new Error("Unable to detect admin account.");
      }
      const title = String(programForm.title || "").trim();
      if (!title) throw new Error("Provide a special program name.");
      if (!Number(programForm.priestID)) throw new Error("Please select a priest first.");
      if (!programForm.eventDate) throw new Error("Choose a date from the priest calendar.");
      if (!programForm.occupiedSlots?.length || !programForm.startTime || !programForm.endTime) {
        throw new Error("Choose at least one available 1-hour time slot. You can pick more than one hour as long as those hours are free.");
      }
      const deadline = String(programForm.deadline || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
        throw new Error("Deadline for submission is required.");
      }
      if (programForm.eventDate <= deadline) {
        throw new Error("The event date must be after the deadline. People submit first, then the event happens.");
      }
      const times = occupiedSlotsToFormTimes(programForm.occupiedSlots, programForm.startTime, programForm.endTime);
      const durationHours = times.durationHours;

      const isEditing = Boolean(editingEntryId && Number(programForm.sSacramentID));
      const payload = isEditing
        ? {
            s_sacramentName: title,
            maxSlots: programForm.slotLimitType === "unlimited" ? null : Number(programForm.maxSlots),
            isUnlimitedSlots: programForm.slotLimitType === "unlimited",
            eventDate: programForm.eventDate,
            startTime: times.startTime,
            endTime: times.endTime,
            durationHours,
            occupiedSlots: times.occupiedSlots,
            calendarTitle: title,
            calendarEntryId: editingEntryId,
            priestID: Number(programForm.priestID) || null,
            deadline,
            adminID,
          }
        : {
            s_sacramentName: title,
            maxSlots: programForm.slotLimitType === "unlimited" ? null : Number(programForm.maxSlots),
            isUnlimitedSlots: programForm.slotLimitType === "unlimited",
            timeDate: `${programForm.eventDate}T${times.startTime}:00`,
            calendarTitle: title,
            eventDate: programForm.eventDate,
            startTime: times.startTime,
            endTime: times.endTime,
            durationHours,
            occupiedSlots: times.occupiedSlots,
            priestID: Number(programForm.priestID) || null,
            deadline,
            adminID,
          };

      const response = await fetch(
        isEditing ? `/admin-api/special-sacraments/${Number(programForm.sSacramentID)}` : "/admin-api/special-sacraments",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to save special sacramental program.");
      }
      const schemaResponse = await fetch("/admin-api/special-sacrament-form-schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialSacramentName: title, displayLabel: title }),
      });
      if (!schemaResponse.ok && schemaResponse.status !== 409) {
        const schemaError = await schemaResponse.json().catch(() => ({}));
        throw new Error(schemaError.message || "The program was saved, but its form could not be opened.");
      }
      if (schemaResponse.ok) {
        setProgramBlueprints((current) =>
          current.some((name) => name.toLowerCase() === title.toLowerCase())
            ? current
            : [...current, title].sort((left, right) => left.localeCompare(right)),
        );
      }
      await loadPrograms();
      closeModal();
      const isKnownBlueprint = programBlueprints.some((name) => name.toLowerCase() === title.toLowerCase());
      if (!isEditing && !isKnownBlueprint) {
        navigate(
          `/admin/special-sacrament-form-schemas?program=${encodeURIComponent(title)}&setup=1`,
        );
        return;
      }
      setNotice(
        isEditing
          ? "Special program updated successfully."
          : "Special program added. Its saved form and progress steps are in use again.",
      );
    } catch (error) {
      setFormError(error.message || "Unable to save special sacramental program.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteProgram = async () => {
    if (!editingEntryId) return;
    setIsDeleteConfirmOpen(false);
    setFormError("");
    setIsSaving(true);
    try {
      if (!Number.isInteger(adminID) || adminID <= 0) {
        throw new Error("Unable to detect admin account.");
      }
      const response = await fetch(`/admin-api/calendar-entries/${editingEntryId}?adminID=${adminID}`, { method: "DELETE" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to remove special program.");
      }
      await loadPrograms();
      closeModal();
      setNotice("Special program removed successfully.");
    } catch (error) {
      setFormError(error.message || "Unable to remove special program.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTargetLabel = String(programForm.title || "").trim() || "special program";

  return (
    <main className="dashboard-layout">
      {notice ? (
        <div className="admin-top-notice" role="status">
          {notice}
        </div>
      ) : null}
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="admin" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero special-programs-hero admin-list-hero">
            <div>
              <h2>Special Programs <PageGuide pageKey="special-programs" /></h2>
            </div>
            <div className="special-programs-hero-actions">
              <button type="button" className="special-programs-secondary-button" onClick={() => navigate("/admin/special-sacrament-form-schemas")}>
                Manage requirements
              </button>
              <button type="button" className="special-programs-primary-button" onClick={handleAddProgram}>
                <Plus size={16} aria-hidden="true" />
                Add program
              </button>
            </div>
          </section>

          <section className="dashboard-panel special-programs-panel" aria-label="Special sacramental programs">
            <header className="special-programs-panel-header">
              <p>{specialProgramEntries.length} program{specialProgramEntries.length === 1 ? "" : "s"}</p>
            </header>

            {loadError ? (
              <p className="special-programs-feedback" role="alert">
                {loadError}
              </p>
            ) : isLoading ? (
              <p className="special-programs-feedback">Loading special programs...</p>
            ) : specialProgramEntries.length === 0 ? (
              <div className="special-programs-empty" role="status">
                <div className="special-programs-empty-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3>No special programs yet</h3>
                <p>Add upcoming sacramental programs here.</p>
              </div>
            ) : (
              <ul className="special-programs-grid">
                {specialProgramEntries.map((entry) => {
                  const assignedPriestName =
                    String(entry.priestName || "").trim() || priestNameById.get(Number(entry.priestID)) || "";
                  return (
                    <li key={`special-program-${entry.id}`} className="special-programs-card">
                      <span className="special-programs-card-icon" aria-hidden="true">
                        <CalendarDays size={20} />
                      </span>
                      <div className="special-programs-card-title">
                        <strong>{entry.s_sacramentName || entry.title}</strong>
                        <small>{assignedPriestName ? `Priest · ${assignedPriestName}` : "No priest assigned"}</small>
                      </div>
                      <div className="special-programs-card-facts">
                        <p>
                          <Clock size={14} aria-hidden="true" />
                          <span>Event</span>
                          <strong>{formatEventDateTimeLabel(entry.eventDate, entry.startTime, entry.endTime, entry.occupiedSlots)}</strong>
                        </p>
                        <p>
                          <Users size={14} aria-hidden="true" />
                          <span>Applied</span>
                          <strong>{Number(entry.currentAppliedCount) >= 0 ? entry.currentAppliedCount : 0}</strong>
                        </p>
                        <p>
                          <Ticket size={14} aria-hidden="true" />
                          <span>Slots</span>
                          <strong>{Boolean(entry.isUnlimitedSlots) || Number(entry.maxSlots) <= 0 ? "Unlimited" : entry.maxSlots}</strong>
                        </p>
                        <p>
                          <CalendarDays size={14} aria-hidden="true" />
                          <span>Deadline</span>
                          <strong>{entry.deadline ? formatLongDate(entry.deadline) : "Not set"}</strong>
                        </p>
                      </div>
                      <button
                        type="button"
                        className="special-programs-card-edit"
                        onClick={() => handleEditProgram(entry)}
                        aria-label={`Edit ${entry.s_sacramentName || entry.title}`}
                      >
                        <Pencil size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </section>
      </div>

      {isModalOpen ? (
        <div className="admin-calendar-modal-overlay admin-calendar-modal-overlay--centered" role="presentation" onClick={closeModal}>
          <section
            className="admin-calendar-modal admin-calendar-modal--schedule"
            role="dialog"
            aria-modal="true"
            aria-label={editingEntryId ? "Edit special sacrament program" : "Add special sacrament program"}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>{editingEntryId ? "Edit Special Sacrament Program" : "Special Sacrament Program"}</h3>
            </header>
            <form className="admin-calendar-form" onSubmit={handleSaveProgram}>
              <label className="admin-calendar-field-label">
                <span>Name of Special Program</span>
                <input
                  name="title"
                  type="text"
                  list="special-program-blueprints"
                  placeholder="Choose a saved program or type a new name"
                  value={programForm.title}
                  onChange={handleFormChange}
                  required
                />
                <datalist id="special-program-blueprints">
                  {programBlueprints.map((name) => (
                    <option key={`blueprint-${name}`} value={name} />
                  ))}
                </datalist>
                <small>
                  {programBlueprints.some((name) => name.toLowerCase() === programForm.title.trim().toLowerCase())
                    ? "This saved program brings its form and progress steps back. Set a new deadline, then a later event date."
                    : "Type a new program name, or choose a saved one to use its form again."}
                </small>
              </label>
              <label className="admin-calendar-field-label">
                <span>Total Entries</span>
                <div className="admin-calendar-form-row admin-calendar-form-row--special-slots">
                  <select name="slotLimitType" value={programForm.slotLimitType} onChange={handleFormChange}>
                    <option value="maximum">Maximum Slots</option>
                    <option value="unlimited">Unlimited Slots</option>
                  </select>
                  {programForm.slotLimitType === "maximum" ? (
                    <input
                      name="maxSlots"
                      type="number"
                      min="1"
                      placeholder="Maximum entries"
                      value={programForm.maxSlots}
                      onChange={handleFormChange}
                      required
                    />
                  ) : null}
                </div>
              </label>
              <label className="admin-calendar-field-label">
                <span>Deadline for Submission</span>
                <input
                  name="deadline"
                  type="date"
                  value={programForm.deadline}
                  onChange={handleFormChange}
                  max={(() => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(programForm.eventDate)) return undefined;
                    const previous = new Date(`${programForm.eventDate}T00:00:00`);
                    previous.setDate(previous.getDate() - 1);
                    return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
                  })()}
                  required
                />
                <small>This must come before the event date.</small>
              </label>
              <div className="admin-calendar-scheduling">
                <label className="admin-calendar-field-label">
                  <span>Select Priest</span>
                  <select name="priestID" value={programForm.priestID} onChange={handleFormChange} required>
                    <option value="">Select Priest</option>
                    {priests.map((priest) => (
                      <option key={`priest-${priest.priestID}`} value={String(priest.priestID)}>
                        {priest.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="progress-schedule-split-layout">
                  <div className="progress-schedule-split-panel">
                    <h4>Priest Calendar</h4>
                    {Number.isInteger(selectedProgramPriestID) && selectedProgramPriestID > 0 ? (
                      <>
                        <div className="progress-priest-calendar-month">
                          <button
                            type="button"
                            className="progress-calendar-month-nav"
                            onClick={() =>
                              setPriestCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                            }
                          >
                            <ChevronLeft size={14} aria-hidden="true" />
                          </button>
                          <strong>{priestCalendarMonthLabel}</strong>
                          <button
                            type="button"
                            className="progress-calendar-month-nav"
                            onClick={() =>
                              setPriestCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                            }
                          >
                            <ChevronRight size={14} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="progress-priest-calendar-grid">
                          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                            <span key={`calendar-head-${dayName}`} className="progress-priest-calendar-day-name">
                              {dayName}
                            </span>
                          ))}
                          {Array.from({ length: priestCalendarFirstDayIndex }).map((_, index) => (
                            <span key={`calendar-empty-${index}`} className="progress-priest-calendar-date-cell is-empty" />
                          ))}
                          {Array.from({ length: priestCalendarDaysInMonth }).map((_, index) => {
                            const dayNumber = index + 1;
                            const dateKey = `${priestCalendarMonth.getFullYear()}-${String(priestCalendarMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
                            const entryCount = (priestCalendarEntriesByDate[dateKey] || []).length;
                            const dateDayOfWeek = new Date(
                              priestCalendarMonth.getFullYear(),
                              priestCalendarMonth.getMonth(),
                              dayNumber,
                            ).getDay();
                            const isDayOff =
                              dayOffSpecificDates.includes(dateKey) ||
                              (Number.isInteger(dayOffWeekday) && dayOffWeekday === dateDayOfWeek);
                            const deadlineKey = String(programForm.deadline || "").trim();
                            const isBeforeDeadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineKey) && dateKey <= deadlineKey;
                            const isLockedDate =
                              (dateKey < getManilaDateKey() && dateKey !== editingOriginalEventDate) || isBeforeDeadline;
                            return (
                              <button
                                key={`calendar-date-${dateKey}`}
                                type="button"
                                className={`progress-priest-calendar-date-cell ${
                                  isLockedDate ? "is-locked" : isDayOff ? "is-day-off" : entryCount > 0 ? "is-busy" : "is-free"
                                } ${!isLockedDate && programForm.eventDate === dateKey ? "is-selected" : ""} ${
                                  !isLockedDate && priestCalendarTodayKey === dateKey ? "is-today" : ""
                                }`}
                                onClick={() => {
                                  if (isDayOff || isLockedDate) return;
                                  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(programForm.deadline || "").trim())) {
                                    setFormError("Set the deadline first. The event date must be after the deadline.");
                                    return;
                                  }
                                  setProgramForm((current) => ({
                                    ...current,
                                    eventDate: dateKey,
                                    startTime: "",
                                    endTime: "",
                                    occupiedSlots: [],
                                    durationHours: 1,
                                  }));
                                  setRemoteDayAvailability(null);
                                  setFormError("");
                                }}
                                disabled={isDayOff || isLockedDate}
                              >
                                <span>{dayNumber}</span>
                                {isLockedDate ? (
                                  <small>Locked</small>
                                ) : isDayOff ? (
                                  <small>Off</small>
                                ) : entryCount > 0 ? (
                                  <small>{entryCount}</small>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                        <div className="progress-priest-calendar-modal-legend">
                          <span><i className="is-free" /> Free day</span>
                          <span><i className="is-busy" /> With schedule</span>
                          <span><i className="is-day-off" /> Day off</span>
                          <span><i className="is-locked" /> Locked</span>
                        </div>
                      </>
                    ) : (
                      <p className="progress-schedule-slot-empty">Select a priest above to view available dates.</p>
                    )}
                  </div>
                  <div className="progress-schedule-split-panel">
                    <h4>Available Time Slots</h4>
                    <p className="progress-picked-date-label">
                      Selected date: <strong>{programForm.eventDate ? formatLongDate(programForm.eventDate) : "Not set"}</strong>
                    </p>
                    <div className="special-program-duration">
                      <span>Event hours</span>
                      <p className="special-program-duration-hint">
                        Pick one or more 1-hour slots, even non-consecutive hours like 9:00 AM - 10:00 AM and 1:00 PM - 2:00 PM.
                        Only hours that are already booked for this priest are blocked.
                      </p>
                      {(programForm.occupiedSlots || []).length > 0 ? (
                        <p className="special-program-selected-hours">
                          {(programForm.occupiedSlots || []).length} hour{(programForm.occupiedSlots || []).length === 1 ? "" : "s"} selected:{" "}
                          {formatOccupiedSlotsLabel(programForm.occupiedSlots, programForm.startTime, programForm.endTime)}
                        </p>
                      ) : (
                        <p className="special-program-selected-hours">No hours selected yet.</p>
                      )}
                    </div>
                    {!Number.isInteger(selectedProgramPriestID) || selectedProgramPriestID <= 0 ? (
                      <p className="progress-schedule-slot-empty">
                        Select a priest first, then click a date to load 1-hour time slots.
                      </p>
                    ) : !programForm.eventDate ? (
                      <p className="progress-schedule-slot-empty">
                        Click a date on the priest calendar to load 1-hour time slots.
                      </p>
                    ) : isLoadingScheduleSlots ? (
                      <p className="progress-schedule-slot-empty">Checking this priest&apos;s availability...</p>
                    ) : isProgramDayOff ? (
                      <p className="progress-schedule-slot-empty">This date is marked as day off.</p>
                    ) : isProgramDayLocked ? (
                      <p className="progress-schedule-slot-empty">
                        {remoteDayAvailability?.lockedMessage || "This date is locked. Choose a later date."}
                      </p>
                    ) : (
                      <>
                        <div className="progress-schedule-slot-grid" role="listbox" aria-multiselectable="true" aria-label="Available time slots">
                          {programSlotOptions.map((slot) => {
                            const isSelected = (programForm.occupiedSlots || []).some(
                              (item) => getParishHourSlotKey(item.startTime, item.endTime) === getParishHourSlotKey(slot.startTime, slot.endTime),
                            );
                            return (
                              <button
                                key={`${slot.startTime}-${slot.endTime}`}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                disabled={!slot.available && !isSelected}
                                title={slot.available || isSelected ? slot.label : slot.conflictTitle || "Unavailable"}
                                className={`progress-schedule-slot-button${isSelected ? " is-selected" : ""}${
                                  slot.available || isSelected ? "" : " is-unavailable"
                                }`}
                                onClick={() => {
                                  if (!slot.available && !isSelected) return;
                                  setProgramForm((current) => ({
                                    ...current,
                                    ...occupiedSlotsToFormTimes(toggleOccupiedHourSlot(current.occupiedSlots, slot)),
                                  }));
                                  setFormError("");
                                }}
                              >
                                <span>{slot.label}</span>
                                {!slot.available && !isSelected && slot.conflictTitle ? <small>{slot.conflictTitle}</small> : null}
                              </button>
                            );
                          })}
                        </div>
                        {programSlotOptions.filter((slot) => slot.available).length === 0 ? (
                          <p className="progress-schedule-slot-empty">
                            No available 1-hour slots for this priest on the selected date.
                          </p>
                        ) : null}
                      </>
                    )}
                    {programForm.eventDate ? (
                      <div className="progress-priest-day-schedules">
                        <h4>Existing priest schedules on {formatLongDate(programForm.eventDate)}</h4>
                        {programDayExistingEntries.length > 0 ? (
                          <ul>
                            {programDayExistingEntries.map((entry) => (
                              <li key={`selected-day-schedule-${entry.id}`}>
                                <strong>{entry.title || "Priest Schedule"}</strong>
                                <span>
                                  {formatOccupiedSlotsLabel(entry.occupiedSlots, entry.startTime, entry.endTime)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No other priest schedule entries for this day.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="admin-calendar-form-actions">
                <button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : editingEntryId ? "Update Entry" : "Add Entry"}
                </button>
                <button type="button" className="secondary" onClick={closeModal} disabled={isSaving}>
                  Cancel
                </button>
                {editingEntryId ? (
                  <button type="button" className="danger" disabled={isSaving} onClick={() => setIsDeleteConfirmOpen(true)}>
                    Remove Entry
                  </button>
                ) : null}
              </div>
            </form>
            {formError ? <p className="admin-calendar-error">{formError}</p> : null}
          </section>
        </div>
      ) : null}

      {isDeleteConfirmOpen ? (
        <div className="admin-calendar-modal-overlay" role="presentation" onClick={() => setIsDeleteConfirmOpen(false)}>
          <section
            className="admin-calendar-modal admin-delete-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete special program confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-calendar-modal-header">
              <h3>Remove Entry</h3>
            </header>
            <div className="admin-delete-confirm-body">
              <span className="admin-delete-confirm-icon" aria-hidden="true">
                !
              </span>
              <p>Are you sure you want to remove this entry: {deleteTargetLabel}?</p>
              <p>This action cannot be undone.</p>
            </div>
            <div className="admin-calendar-form-actions">
              <button type="button" className="danger" disabled={isSaving} onClick={() => void confirmDeleteProgram()}>
                {isSaving ? "Deleting..." : "Yes, Remove"}
              </button>
              <button type="button" className="secondary" disabled={isSaving} onClick={() => setIsDeleteConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminSpecialProgramsPage;
