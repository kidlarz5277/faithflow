import { BookOpen, CalendarDays, CalendarOff, Church, Clock3, Cross, Droplets, Handshake, MapPin, Pencil, Sparkles, Trash2, UserRound, Users } from "lucide-react";
import {
  formatOccupiedSlotsLabel,
  getCalendarEntryDisplayTitle,
  getCalendarEntryKind,
  getCalendarEntryLocationLabel,
  getCalendarRequesterName,
  getManilaDateKey,
  normalizeOccupiedSlots,
  summarizeCalendarDayEntries,
  to12HourTime,
} from "../utils/parishSchedule";

const formatTimeRangeLabel = (startTime, endTime) => {
  const startLabel = to12HourTime(startTime);
  const endLabel = to12HourTime(endTime);
  if (startLabel && endLabel) return `${startLabel} – ${endLabel}`;
  return startLabel || endLabel || "Time not set";
};

const getEntryIcon = (entry, kindId) => {
  const title = String(entry?.sacramentName || entry?.title || "").trim().toLowerCase();
  if (title.includes("marriage") || title.includes("kasalan")) return <Handshake size={18} />;
  if (title.includes("funeral") || title.includes("death")) return <Cross size={18} />;
  if (title.includes("baptism") || title.includes("christening")) return <Droplets size={18} />;
  if (title.includes("blessing")) return <Sparkles size={18} />;
  if (kindId === "special") return <Users size={18} />;
  if (kindId === "activity") return <BookOpen size={18} />;
  if (kindId === "appointment") return <CalendarDays size={18} />;
  return <Church size={18} />;
};

function CalendarDayAgenda({
  dateKey,
  dateLabel,
  entries = [],
  isDayOff = false,
  isSpecificDayOff = false,
  isHalfDay = false,
  halfDayHoursLabel = "",
  isReadOnly = false,
  emptyStateTitle = "No schedules for this date",
  emptyStateDescription,
  emptyStateClassName = "",
  onEditEntry,
  onRemoveEntry,
  onEditDayOff,
  resolvePriestName,
  children,
}) {
  const summary = summarizeCalendarDayEntries(entries);
  const chips = [
    summary.appointment > 0 ? { id: "appointment", label: `${summary.appointment} appointment${summary.appointment === 1 ? "" : "s"}` } : null,
    summary.priest > 0 ? { id: "priest", label: `${summary.priest} priest schedule${summary.priest === 1 ? "" : "s"}` } : null,
    summary.activity > 0 ? { id: "activity", label: `${summary.activity} priest unavailabilit${summary.activity === 1 ? "y" : "ies"}` } : null,
    summary.parish > 0 ? { id: "parish", label: `${summary.parish} parish event${summary.parish === 1 ? "" : "s"}` } : null,
    summary.special > 0 ? { id: "special", label: `${summary.special} special program${summary.special === 1 ? "" : "s"}` } : null,
  ].filter(Boolean);

  return (
    <div className="calendar-day-agenda">
      {isDayOff ? (
        <div className="calendar-day-agenda-empty is-day-off" role="status">
          <div className="calendar-day-agenda-empty-icon" aria-hidden="true">
            <CalendarOff size={28} strokeWidth={1.6} />
          </div>
          <div>
            <h4>Church day off</h4>
            <p>
              {isSpecificDayOff
                ? `This date is marked as a church day off. New schedules should not be booked here.`
                : `This weekday is a recurring church day off. New schedules should not be booked here.`}
            </p>
            {!isReadOnly && typeof onEditDayOff === "function" ? (
              <button type="button" className="calendar-day-agenda-empty-action" onClick={() => onEditDayOff(dateKey)}>
                <Pencil size={14} />
                Edit day off
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isDayOff && isHalfDay ? (
        <div className="calendar-day-agenda-empty is-half-day" role="status">
          <div className="calendar-day-agenda-empty-icon" aria-hidden="true">
            <Clock3 size={28} strokeWidth={1.6} />
          </div>
          <div>
            <h4>Half day</h4>
            <p>
              The parish is open {halfDayHoursLabel || "half day"} only on this day. Schedules outside these hours
              cannot be booked.
            </p>
            {!isReadOnly && typeof onEditDayOff === "function" ? (
              <button type="button" className="calendar-day-agenda-empty-action" onClick={() => onEditDayOff(dateKey)}>
                <Pencil size={14} />
                Edit half day
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <>
          <div className="calendar-day-agenda-chips" aria-label="Schedule summary">
            <span className="calendar-day-agenda-chip is-total">
              {summary.total} schedule{summary.total === 1 ? "" : "s"}
            </span>
            {chips.map((chip) => (
              <span key={`${dateKey}-${chip.id}`} className={`calendar-day-agenda-chip is-${chip.id}`}>
                {chip.label}
              </span>
            ))}
          </div>
          <ol className="calendar-day-agenda-list">
            {entries.map((entry) => {
              const kind = getCalendarEntryKind(entry);
              const title = getCalendarEntryDisplayTitle(entry);
              const priestName =
                typeof resolvePriestName === "function" ? resolvePriestName(entry) : "";
              const rawLocation = getCalendarEntryLocationLabel(entry, { emptyLabel: "" });
              const location =
                kind.id === "appointment" && rawLocation.toLowerCase() === title.toLowerCase()
                  ? ""
                  : rawLocation;
              const requesterName = getCalendarRequesterName(entry);
              const notes = String(entry?.notes || entry?.note || "").trim();
              const requestType = String(entry?.requestType || "").trim();
              const isPastActivity = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "")) && dateKey < getManilaDateKey();
              const canEdit = !isReadOnly && !isPastActivity && typeof onEditEntry === "function";
              const canRemove = !isReadOnly && isPastActivity && typeof onRemoveEntry === "function";
              const occupied = normalizeOccupiedSlots(entry.occupiedSlots);
              const timeLabel = formatOccupiedSlotsLabel(entry.occupiedSlots, entry.startTime, entry.endTime);
              const displayStart = occupied[0]?.startTime || entry.startTime;
              const displayEnd = occupied[occupied.length - 1]?.endTime || entry.endTime;
              return (
                <li
                  key={`day-entry-${entry.id || entry.calendarEntryID || title}`}
                  className={`calendar-day-agenda-card ${kind.className}`}
                >
                  <div className="calendar-day-agenda-time">
                    <span>{to12HourTime(displayStart) || "—"}</span>
                    <small>{to12HourTime(displayEnd) || ""}</small>
                  </div>
                  <span className="calendar-day-agenda-icon" aria-hidden="true">
                    {getEntryIcon(entry, kind.id)}
                  </span>
                  <div className="calendar-day-agenda-body">
                    <div className="calendar-day-agenda-top">
                      <strong>{title}</strong>
                      <span className={`admin-schedule-kind ${kind.badgeClass}`}>{kind.label}</span>
                    </div>
                    {kind.id === "appointment" && requestType && requestType.toLowerCase() !== "appointment" ? (
                      <p className="calendar-day-agenda-meta">{requestType}</p>
                    ) : null}
                    <p className="calendar-day-agenda-meta">
                      <UserRound size={13} aria-hidden="true" />
                      <span>{priestName || "Priest not assigned"}</span>
                    </p>
                    {requesterName ? (
                      <p className="calendar-day-agenda-meta">
                        <Users size={13} aria-hidden="true" />
                        <span>{requesterName}</span>
                      </p>
                    ) : null}
                    {location ? (
                      <p className="calendar-day-agenda-meta">
                        <MapPin size={13} aria-hidden="true" />
                        <span>{location}</span>
                      </p>
                    ) : null}
                    <p className="calendar-day-agenda-meta is-time-range">{timeLabel || formatTimeRangeLabel(entry.startTime, entry.endTime)}</p>
                    {!isReadOnly && notes && kind.id !== "appointment" ? (
                      <p className="calendar-day-agenda-notes">{notes}</p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="admin-selected-date-edit"
                      onClick={() => onEditEntry(entry)}
                      aria-label={`Edit ${title}`}
                    >
                      <Pencil size={14} />
                    </button>
                  ) : null}
                  {canRemove ? (
                    <button
                      type="button"
                      className="admin-selected-date-edit is-remove"
                      onClick={() => onRemoveEntry(entry)}
                      aria-label={`Remove ${title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : !isDayOff ? (
        <div className={`calendar-day-agenda-empty${emptyStateClassName ? ` ${emptyStateClassName}` : ""}`} role="status">
          <div className="calendar-day-agenda-empty-icon" aria-hidden="true">
            <CalendarDays size={28} strokeWidth={1.6} />
          </div>
          <div>
            <h4>{emptyStateTitle}</h4>
            <p>
              {emptyStateDescription ||
                (isReadOnly
                  ? "There are no parish events, priest schedules, or appointments on this date."
                  : `Add a parish event or priest schedule for ${dateLabel || "this date"}.`)}
            </p>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

export default CalendarDayAgenda;
