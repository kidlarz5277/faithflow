import { CalendarDays } from "lucide-react";
import "../pages/PriestAppointmentsPages.css";

const getDateBlockParts = (value) => {
  const parsedDate = value ? new Date(value) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null;
  return {
    month: parsedDate.toLocaleString("en-US", { month: "short" }),
    day: parsedDate.getDate(),
    year: parsedDate.getFullYear(),
  };
};

function HistoryRecordCard({
  dateValue,
  title,
  subtitle,
  status,
  statusLabel,
  facts = [],
  notes = [],
  onView,
  viewLabel = "View Details",
  compact = false,
}) {
  const dateParts = getDateBlockParts(dateValue);
  const statusClass = status === "cancelled" ? "is-cancelled" : "is-completed";

  return (
    <li className={`priest-history-card ${statusClass}${compact ? " is-compact" : ""}`}>
      <div className="priest-history-date" aria-hidden="true">
        {dateParts ? (
          <>
            <span>{dateParts.month}</span>
            <strong>{dateParts.day}</strong>
            <small>{dateParts.year}</small>
          </>
        ) : (
          <CalendarDays size={22} />
        )}
      </div>
      <div className="priest-history-content">
        <div className="priest-history-card-head">
          <div className="priest-history-card-title">
            <strong>{title}</strong>
            {subtitle ? <small>{subtitle}</small> : null}
          </div>
          <span className={`priest-history-status ${statusClass}`}>{statusLabel}</span>
        </div>
        {facts.length > 0 ? (
          <div className="priest-history-facts">
            {facts.map((fact) => (
              <p key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </p>
            ))}
          </div>
        ) : null}
        <div className="priest-history-footer">
          {notes.length > 0 ? (
            <div className="priest-history-notes">
              {notes.map((note) => (
                <p key={note.label}>
                  <span>{note.label}</span>
                  <strong>{note.value}</strong>
                </p>
              ))}
            </div>
          ) : null}
          <button type="button" className="priest-history-view" onClick={onView}>
            {viewLabel}
          </button>
        </div>
      </div>
    </li>
  );
}

export default HistoryRecordCard;
