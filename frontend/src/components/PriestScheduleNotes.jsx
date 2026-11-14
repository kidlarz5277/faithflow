import { useEffect, useRef, useState } from "react";
import { CalendarX2, CheckCircle2, ChevronDown, Clock3, MessageSquareText, Send, Trash2 } from "lucide-react";
import {
  expandScheduleBusyRanges,
  formatOccupiedSlotsLabel,
  getManilaDateKey,
  getParishHourSlotKey,
  isScheduleSlotInThePast,
  PARISH_APPOINTMENT_TIME_SLOTS,
  PRIEST_BLOCK_OTHER_REASON,
  PRIEST_BLOCK_REASONS,
  to12HourTime,
  toggleOccupiedHourSlot,
} from "../utils/parishSchedule";
import { getTrustedNow } from "../utils/parishClock";
import "./PriestScheduleNotes.css";

const NOTE_STATUS_META = {
  pending: { label: "Waiting for parish office", className: "is-pending" },
  scheduled: { label: "Marked unavailable", className: "is-scheduled" },
  reviewed: { label: "Reviewed", className: "is-reviewed" },
};

const toMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const COVERAGE_OPTIONS = [
  { id: "day", label: "This day" },
  { id: "range", label: "Date range" },
  { id: "week", label: "By week" },
  { id: "month", label: "By month" },
];

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const todayDateKey = () => toDateKey(new Date());

const listDateKeys = (startKey, endKey) => {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end || end < start) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 31) {
    const key = toDateKey(cursor);
    if (key >= todayDateKey()) dates.push(key);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const weekBounds = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return { start: dateKey, end: dateKey };
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toDateKey(start), end: toDateKey(end) };
};

const monthBounds = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return { start: dateKey, end: dateKey };
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toDateKey(start), end: toDateKey(end) };
};

const formatShortDate = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const upcomingWeeks = (count = 12) => {
  const today = parseDateKey(todayDateKey());
  const bounds = weekBounds(todayDateKey());
  const start = parseDateKey(bounds.start);
  return Array.from({ length: count }, (_, index) => {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + index * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const startKey = toDateKey(weekStart);
    const endKey = toDateKey(weekEnd);
    const included = listDateKeys(startKey, endKey);
    return {
      id: startKey,
      start: startKey,
      end: endKey,
      label: `${formatShortDate(startKey)} – ${formatShortDate(endKey)}`,
      included,
      isCurrent: startKey === bounds.start,
      isPast: weekEnd < today,
    };
  }).filter((week) => !week.isPast && week.included.length);
};

const upcomingMonths = (count = 12) => {
  const today = parseDateKey(todayDateKey());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() + index, 1);
    const bounds = monthBounds(toDateKey(date));
    return {
      id: bounds.start.slice(0, 7),
      start: bounds.start,
      end: bounds.end,
      label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      included: listDateKeys(bounds.start, bounds.end),
    };
  }).filter((month) => month.included.length);
};

function RangeCalendar({ startKey, endKey, activeEdge, onPick }) {
  const todayKey = todayDateKey();
  const initial = parseDateKey(activeEdge === "end" ? endKey : startKey) || parseDateKey(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <div className="priest-note-calendar">
      <div className="priest-note-calendar-nav">
        <button type="button" onClick={() => setVisibleMonth(new Date(year, month - 1, 1))} aria-label="Previous month">
          ‹
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" onClick={() => setVisibleMonth(new Date(year, month + 1, 1))} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="priest-note-calendar-grid">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((name) => (
          <span key={name} className="priest-note-calendar-weekday">{name}</span>
        ))}
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const key = toDateKey(new Date(year, month, day));
          const isPast = key < todayKey;
          const isStart = key === startKey;
          const isEnd = key === endKey;
          const inRange = startKey && endKey && key > startKey && key < endKey;
          return (
            <button
              key={key}
              type="button"
              className={`priest-note-calendar-day${isPast ? " is-past" : ""}${isStart || isEnd ? " is-selected" : ""}${inRange ? " is-in-range" : ""}`}
              disabled={isPast}
              onClick={() => onPick(key)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const formatSentAt = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const COVERAGE_LABELS = {
  day: "This day",
  range: "Date range",
  week: "By week",
  month: "By month",
};

const formatCoverageLabel = (note) => {
  const dates = Array.isArray(note.coverageDates) ? note.coverageDates : [];
  if (dates.length < 2) return "";
  const kind = COVERAGE_LABELS[note.coverageKind] || "Date range";
  const start = parseDateKey(dates[0]);
  const end = parseDateKey(dates[dates.length - 1]);
  const span = start && end
    ? `${start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
    : `${dates[0]} – ${dates[dates.length - 1]}`;
  return `${kind} · ${span} · ${dates.length} days`;
};

function NoteCard({ note, footer }) {
  const statusMeta = NOTE_STATUS_META[note.status] || NOTE_STATUS_META.pending;
  const coverageLabel = formatCoverageLabel(note);
  return (
    <li className={`priest-note-card ${statusMeta.className}`}>
      <div className="priest-note-card-top">
        <strong>{note.reason}</strong>
        <span className={`priest-note-status ${statusMeta.className}`}>{statusMeta.label}</span>
      </div>
      {coverageLabel ? <p className="priest-note-hours">{coverageLabel}</p> : null}
      <p className="priest-note-hours">{formatOccupiedSlotsLabel(note.occupiedSlots) || "No hours selected"}</p>
      {note.message ? <p className="priest-note-message">{note.message}</p> : null}
      <p className="priest-note-sent">
        Sent {formatSentAt(note.createdAt)}
        {note.reviewedAt ? ` · Handled ${formatSentAt(note.reviewedAt)}` : ""}
      </p>
      {footer}
    </li>
  );
}

export function PriestNoteComposer({
  dateKey,
  dateLabel,
  notes = [],
  ownEntries = [],
  isPastDate = false,
  isDayOff = false,
  halfDayHours = null,
  ownScheduleEntries = [],
  dayOffWeekday = null,
  dayOffSpecificDates = [],
  halfDaySetting = null,
  onSubmit,
  onWithdraw,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [reasonChoice, setReasonChoice] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [message, setMessage] = useState("");
  const [slots, setSlots] = useState([]);
  const [coverage, setCoverage] = useState("day");
  const [rangeStart, setRangeStart] = useState(dateKey && dateKey >= todayDateKey() ? dateKey : todayDateKey());
  const [rangeEnd, setRangeEnd] = useState(dateKey && dateKey >= todayDateKey() ? dateKey : todayDateKey());
  const [rangeEdge, setRangeEdge] = useState("start");
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [selectedMonthId, setSelectedMonthId] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState(null);
  const [now, setNow] = useState(() => getTrustedNow());
  const [reasonOpen, setReasonOpen] = useState(false);
  const reasonMenuRef = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(getTrustedNow()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (coverage !== "day") return;
    setSlots((current) => current.filter((slot) => !isScheduleSlotInThePast(dateKey, slot.startTime, now)));
  }, [coverage, dateKey, now]);

  useEffect(() => {
    if (!reasonOpen) return undefined;
    const close = (event) => {
      if (!reasonMenuRef.current?.contains(event.target)) setReasonOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [reasonOpen]);

  const busyRanges = ownEntries.flatMap((entry) => expandScheduleBusyRanges(entry));
  const isSlotPast = (slot) => coverage === "day" && isScheduleSlotInThePast(dateKey, slot.startTime, now);
  const slotHasSchedule = (slot) => {
    const start = toMinutes(slot.startTime);
    const end = toMinutes(slot.endTime);
    if (start === null || end === null) return false;
    return busyRanges.some((range) => range.start < end && start < range.end);
  };
  const isSlotUnavailable = (slot) => {
    if (isSlotPast(slot) || slotHasSchedule(slot)) return true;
    if (isDayOff) return true;
    if (!halfDayHours) return false;
    const start = toMinutes(slot.startTime);
    const end = toMinutes(slot.endTime);
    const openStart = toMinutes(halfDayHours.startTime);
    const openEnd = toMinutes(halfDayHours.endTime);
    return start === null || end === null || openStart === null || openEnd === null || start < openStart || end > openEnd;
  };
  const availableSlots = PARISH_APPOINTMENT_TIME_SLOTS.filter((slot) => !isSlotUnavailable(slot));
  const getSlotScheduleTitle = (slot) => {
    const start = toMinutes(slot.startTime);
    const end = toMinutes(slot.endTime);
    return busyRanges.find((range) => range.start < end && start < range.end)?.title || "";
  };
  const isSlotSelected = (slot) =>
    slots.some((item) => getParishHourSlotKey(item.startTime, item.endTime) === getParishHourSlotKey(slot.startTime, slot.endTime));
  const selectedAvailableSlots = availableSlots.filter(isSlotSelected);
  const selectedAvailableSlotCount = selectedAvailableSlots.length;
  const reason = reasonChoice === PRIEST_BLOCK_OTHER_REASON ? customReason.trim() : reasonChoice;

  const weekChoices = upcomingWeeks();
  const monthChoices = upcomingMonths();
  const activeWeek = weekChoices.find((week) => week.id === selectedWeekId) || weekChoices[0];
  const activeMonth = monthChoices.find((month) => month.id === selectedMonthId) || monthChoices[0];
  const coveredDateKeys = (() => {
    if (coverage === "week") return activeWeek?.included || [];
    if (coverage === "month") return activeMonth?.included || [];
    if (coverage === "range") return listDateKeys(rangeStart, rangeEnd);
    return dateKey && dateKey >= todayDateKey() ? [dateKey] : [];
  })();

  const isCoveredDateClosed = (key) => {
    if (dayOffSpecificDates.includes(key)) return true;
    const weekday = new Date(`${key}T12:00:00`).getDay();
    return dayOffWeekday === weekday;
  };

  const openSlotsForDate = (key) => {
    if (isCoveredDateClosed(key)) return [];
    const weekday = new Date(`${key}T12:00:00`).getDay();
    if (!halfDaySetting || halfDaySetting.weekday !== weekday) return PARISH_APPOINTMENT_TIME_SLOTS;
    const openStart = toMinutes(halfDaySetting.startTime);
    const openEnd = toMinutes(halfDaySetting.endTime);
    return PARISH_APPOINTMENT_TIME_SLOTS.filter((slot) => {
      const start = toMinutes(slot.startTime);
      const end = toMinutes(slot.endTime);
      return start !== null && end !== null && openStart !== null && openEnd !== null && start >= openStart && end <= openEnd;
    });
  };

  const scheduleConflict = (() => {
    if (coverage === "day") return null;
    for (const key of coveredDateKeys) {
      const openSlots = openSlotsForDate(key);
      if (!openSlots.length) continue;
      const dayEntries = ownScheduleEntries.filter((entry) => String(entry?.eventDate || "").slice(0, 10) === key);
      for (const entry of dayEntries) {
        const ranges = expandScheduleBusyRanges(entry);
        for (const slot of openSlots) {
          const start = toMinutes(slot.startTime);
          const end = toMinutes(slot.endTime);
          const hit = ranges.find((range) => range.start < end && start < range.end);
          if (hit) {
            return `${formatShortDate(key)} already has ${hit.title} at ${to12HourTime(slot.startTime)}. A range, week, or month note cannot be sent when even one of your scheduled times is included.`;
          }
        }
      }
    }
    return null;
  })();

  const resetForm = () => {
    setReasonChoice("");
    setCustomReason("");
    setMessage("");
    setSlots([]);
    setCoverage("day");
    setRangeStart(dateKey || "");
    setRangeEnd(dateKey || "");
    setError("");
  };

  const handleSubmit = async () => {
    if (!reason) {
      setError(reasonChoice === PRIEST_BLOCK_OTHER_REASON ? "Please type your reason." : "Please select a reason.");
      return;
    }
    const slotsToSend = coverage === "day" ? selectedAvailableSlots : PARISH_APPOINTMENT_TIME_SLOTS;
    if (!slotsToSend.length) {
      setError(coverage === "day" ? "Pick at least one time slot." : "There are no open hours to block for this choice.");
      return;
    }
    if (scheduleConflict) {
      setError(scheduleConflict);
      return;
    }
    if (!coveredDateKeys.length) {
      setError("Choose at least one upcoming date.");
      return;
    }
    if (coverage === "range" && rangeEnd < rangeStart) {
      setError("The end date must be the same as or after the start date.");
      return;
    }
    setIsSending(true);
    setError("");
    try {
      await onSubmit({
        noteDate: coveredDateKeys[0],
        noteDates: coveredDateKeys,
        coverageKind: coverage,
        reason,
        message: message.trim(),
        occupiedSlots: slotsToSend,
      });
      resetForm();
      setIsOpen(false);
    } catch (submitError) {
      setError(submitError.message || "Unable to send your note right now.");
    } finally {
      setIsSending(false);
    }
  };

  const handleWithdraw = async (note) => {
    setWithdrawingId(note.noteID);
    setError("");
    try {
      await onWithdraw(note);
    } catch (withdrawError) {
      setError(withdrawError.message || "Unable to withdraw this note.");
    } finally {
      setWithdrawingId(null);
    }
  };

  return (
    <section className="priest-notes-section" aria-label="Notes to the parish office">
      <header className="priest-notes-header">
        <h4>
          <MessageSquareText size={16} aria-hidden="true" />
          Notes to the parish office
        </h4>
        {!isOpen && !isPastDate && !isDayOff ? (
          <button type="button" className="priest-notes-open-button" onClick={() => setIsOpen(true)}>
            <Send size={14} aria-hidden="true" />
            Send a note
          </button>
        ) : null}
      </header>

      {notes.length > 0 ? (
        <ul className="priest-notes-list">
          {notes.map((note) => (
            <NoteCard
              key={`priest-note-${note.noteID}`}
              note={note}
              footer={
                note.status === "pending" && typeof onWithdraw === "function" ? (
                  <div className="priest-note-actions">
                    <button
                      type="button"
                      className="priest-note-secondary-button"
                      onClick={() => void handleWithdraw(note)}
                      disabled={withdrawingId === note.noteID}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      {withdrawingId === note.noteID ? "Withdrawing..." : "Withdraw"}
                    </button>
                  </div>
                ) : null
              }
            />
          ))}
        </ul>
      ) : !isOpen && isDayOff ? (
        <p className="priest-notes-empty is-day-off">
          The parish is closed on this date, so no availability note is needed.
        </p>
      ) : !isOpen ? (
        <p className="priest-notes-empty">
          {isPastDate
            ? "No notes were sent for this date."
            : `Not available on ${dateLabel || "this date"}? Send a note so the parish office can adjust your schedule.`}
        </p>
      ) : null}

      {isOpen && isDayOff ? (
        <p className="priest-note-closed-notice" role="status">
          The parish is closed for the whole day. Availability notes cannot be sent for this date.
        </p>
      ) : null}

      {isOpen && !isDayOff ? (
        <div className="priest-note-form">
          <div className="priest-note-field">
            <span>When you are not available</span>
            <div className="priest-note-coverage" role="radiogroup" aria-label="When you are not available">
              {COVERAGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={coverage === option.id}
                  className={`priest-note-coverage-option${coverage === option.id ? " is-selected" : ""}`}
                  onClick={() => {
                    setCoverage(option.id);
                    setError("");
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {coverage === "range" ? (
              <div className="priest-note-range-picker">
                <div className="priest-note-range-edges">
                  <button type="button" className={rangeEdge === "start" ? "is-selected" : ""} onClick={() => setRangeEdge("start")}>
                    From {formatShortDate(rangeStart)}
                  </button>
                  <button type="button" className={rangeEdge === "end" ? "is-selected" : ""} onClick={() => setRangeEdge("end")}>
                    To {formatShortDate(rangeEnd)}
                  </button>
                </div>
                <RangeCalendar
                  startKey={rangeStart}
                  endKey={rangeEnd}
                  activeEdge={rangeEdge}
                  onPick={(key) => {
                    if (rangeEdge === "start") {
                      setRangeStart(key);
                      if (rangeEnd < key) setRangeEnd(key);
                      setRangeEdge("end");
                    } else {
                      if (key < rangeStart) {
                        setRangeEnd(rangeStart);
                        setRangeStart(key);
                      } else {
                        setRangeEnd(key);
                      }
                    }
                    setError("");
                  }}
                />
              </div>
            ) : null}
            {coverage === "week" ? (
              <div className="priest-note-choice-list" role="listbox" aria-label="Choose a week">
                {weekChoices.map((week) => (
                  <button
                    key={week.id}
                    type="button"
                    className={`priest-note-choice${activeWeek?.id === week.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedWeekId(week.id)}
                  >
                    {week.label}
                    {week.isCurrent ? <small>Current week</small> : null}
                  </button>
                ))}
              </div>
            ) : null}
            {coverage === "month" ? (
              <div className="priest-note-choice-list" role="listbox" aria-label="Choose a month">
                {monthChoices.map((month) => (
                  <button
                    key={month.id}
                    type="button"
                    className={`priest-note-choice${activeMonth?.id === month.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedMonthId(month.id)}
                  >
                    {month.label}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="priest-note-hint">
              {coveredDateKeys.length
                ? `This note will be sent for ${coveredDateKeys.length} day${coveredDateKeys.length === 1 ? "" : "s"}: ${coveredDateKeys[0]} to ${coveredDateKeys[coveredDateKeys.length - 1]}.`
                : "No upcoming dates are included in this choice."}
            </p>
          </div>
          <div className="priest-note-field">
            <span>Reason</span>
            <div className={`priest-note-reason${reasonOpen ? " is-open" : ""}`} ref={reasonMenuRef}>
              <button
                type="button"
                className="priest-note-reason-trigger"
                aria-haspopup="listbox"
                aria-expanded={reasonOpen}
                onClick={() => setReasonOpen((open) => !open)}
              >
                <span>{reasonChoice === PRIEST_BLOCK_OTHER_REASON ? "Other" : reasonChoice || "Select a reason"}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {reasonOpen ? (
                <ul className="priest-note-reason-menu" role="listbox">
                  {PRIEST_BLOCK_REASONS.map((item) => (
                    <li key={item}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={reasonChoice === item}
                        className={reasonChoice === item ? "is-selected" : ""}
                        onClick={() => {
                          setReasonChoice(item);
                          setReasonOpen(false);
                          setError("");
                        }}
                      >
                        {item}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      role="option"
                      aria-selected={reasonChoice === PRIEST_BLOCK_OTHER_REASON}
                      className={reasonChoice === PRIEST_BLOCK_OTHER_REASON ? "is-selected" : ""}
                      onClick={() => {
                        setReasonChoice(PRIEST_BLOCK_OTHER_REASON);
                        setReasonOpen(false);
                        setError("");
                      }}
                    >
                      Other
                    </button>
                  </li>
                </ul>
              ) : null}
            </div>
            {reasonChoice === PRIEST_BLOCK_OTHER_REASON ? (
              <input
                type="text"
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                placeholder="Type your reason"
                maxLength={120}
                autoFocus
              />
            ) : null}
          </div>

          {coverage === "day" ? (
          <div className="priest-note-field">
            <div className="priest-note-slots-head">
              <span>Hours you are not available</span>
              <button
                type="button"
                className="priest-note-link-button"
                disabled={!availableSlots.length}
                onClick={() =>
                  setSlots(
                    selectedAvailableSlotCount === availableSlots.length
                      ? []
                      : availableSlots.map((slot) => ({ ...slot })),
                  )
                }
              >
                {availableSlots.length > 0 && selectedAvailableSlotCount === availableSlots.length ? "Clear selection" : "Select open hours"}
              </button>
            </div>
            <div className="priest-note-slot-grid" role="listbox" aria-multiselectable="true" aria-label="Hours you are not available">
              {PARISH_APPOINTMENT_TIME_SLOTS.map((slot) => {
                const isPast = isSlotPast(slot);
                const isUnavailable = isSlotUnavailable(slot);
                const isSelected = !isUnavailable && isSlotSelected(slot);
                const scheduleTitle = getSlotScheduleTitle(slot);
                const unavailableTitle = scheduleTitle
                  ? `You already have "${scheduleTitle}" at this time`
                  : isPast
                  ? "This hour has already passed"
                  : isDayOff
                    ? "The parish is closed for the whole day"
                    : halfDayHours
                      ? `The parish is open ${to12HourTime(halfDayHours.startTime)} - ${to12HourTime(halfDayHours.endTime)}`
                      : "";
                return (
                  <button
                    key={`note-slot-${slot.startTime}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`priest-note-slot${isSelected ? " is-selected" : ""}${scheduleTitle ? " has-schedule" : ""}${isUnavailable ? " is-locked" : ""}`}
                    disabled={isUnavailable}
                    onClick={() => {
                      setSlots((current) => toggleOccupiedHourSlot(current, slot));
                      setError("");
                    }}
                    title={isUnavailable ? unavailableTitle : scheduleTitle ? `You have "${scheduleTitle}" at this time` : undefined}
                  >
                    <span className="priest-note-slot-time">
                      <Clock3 size={13} aria-hidden="true" />
                      <span>
                        {to12HourTime(slot.startTime)}
                        <em>{to12HourTime(slot.endTime)}</em>
                      </span>
                    </span>
                    {scheduleTitle ? <small>Has schedule</small> : isSelected ? <small>Selected</small> : isPast ? <small>Passed</small> : isUnavailable ? <small>{isDayOff ? "Parish closed" : "Closed"}</small> : <small>Open</small>}
                  </button>
                );
              })}
            </div>
            {dateKey === getManilaDateKey(now) ? (
              <p className="priest-note-hint">Hours that have already started today are locked.</p>
            ) : null}
            {halfDayHours ? (
              <p className="priest-note-hint">
                The parish is open {to12HourTime(halfDayHours.startTime)} - {to12HourTime(halfDayHours.endTime)}. Closed hours are locked.
              </p>
            ) : null}
            <p className="priest-note-hint">
              {selectedAvailableSlots.length
                ? `${selectedAvailableSlots.length} hour${selectedAvailableSlots.length === 1 ? "" : "s"} selected: ${formatOccupiedSlotsLabel(selectedAvailableSlots)}`
                : "Pick one or more hours. They do not need to be next to each other."}
            </p>
          </div>
          ) : (
            <p className={`priest-note-hint${scheduleConflict ? " is-conflict" : ""}`}>
              {scheduleConflict ||
                "Parish day offs and half days in this selection are skipped. The note cannot be sent if any included day already has your appointment, parish event, or priest schedule."}
            </p>
          )}

          <label className="priest-note-field">
            <span>Message (optional)</span>
            <textarea
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1000}
              placeholder="Add details for the parish office, e.g. please move my 9 AM baptism."
            />
          </label>

          {error ? <p className="priest-note-error">{error}</p> : null}

          <div className="priest-note-actions">
            <button
              type="button"
              className="priest-note-secondary-button"
              onClick={() => {
                resetForm();
                setIsOpen(false);
              }}
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="priest-note-primary-button"
              onClick={() => void handleSubmit()}
              disabled={isSending || (coverage === "day" && !selectedAvailableSlotCount) || Boolean(scheduleConflict)}
            >
              <Send size={14} aria-hidden="true" />
              {isSending ? "Sending..." : "Send to parish office"}
            </button>
          </div>
        </div>
      ) : error ? (
        <p className="priest-note-error">{error}</p>
      ) : null}
    </section>
  );
}

export function AdminDayNotesPanel({ notes = [], busyNoteId = null, onBlockSchedule, onMarkReviewed }) {
  if (!notes.length) return null;
  return (
    <section className="priest-notes-section is-admin" aria-label="Priest notes for this date">
      <header className="priest-notes-header">
        <h4>
          <MessageSquareText size={16} aria-hidden="true" />
          Priest notes ({notes.length})
        </h4>
      </header>
      <ul className="priest-notes-list">
        {notes.map((note) => (
          <NoteCard
            key={`admin-note-${note.noteID}`}
            note={{ ...note, reason: `${note.priestName || "Priest"} · ${note.reason}` }}
            footer={
              note.status === "pending" ? (
                <div className="priest-note-actions">
                  <button
                    type="button"
                    className="priest-note-primary-button"
                    onClick={() => onMarkReviewed(note)}
                    disabled={busyNoteId === note.noteID}
                  >
                    <CheckCircle2 size={13} aria-hidden="true" />
                    {busyNoteId === note.noteID ? "Saving..." : "Mark as Reviewed"}
                  </button>
                </div>
              ) : note.status === "reviewed" ? (
                <div className="priest-note-actions">
                  <button
                    type="button"
                    className="priest-note-primary-button"
                    onClick={() => onBlockSchedule(note)}
                    disabled={busyNoteId === note.noteID}
                  >
                    <CalendarX2 size={13} aria-hidden="true" />
                    Mark as Unavailable
                  </button>
                </div>
              ) : null
            }
          />
        ))}
      </ul>
    </section>
  );
}
