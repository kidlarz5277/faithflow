import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import "./ParishDateField.css";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (value) => String(value).padStart(2, "0");
const toIso = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

const parseIso = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
};

const formatDisplay = (value) => {
  const date = parseIso(value);
  if (!date) return "";
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
};

const todayDate = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export function ParishDateField({ name, value, onChange, allowFuture = false, disablePast = false, disabled = false }) {
  const selected = parseIso(value);
  const maxDate = todayDate();
  const max = toIso(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => selected || new Date(maxDate.getFullYear(), maxDate.getMonth(), 1));
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const years = [];
  const latestYear = allowFuture ? maxDate.getFullYear() + 15 : maxDate.getFullYear();
  const earliestYear = disablePast ? maxDate.getFullYear() : 1900;
  for (let item = latestYear; item >= earliestYear; item -= 1) years.push(item);

  const isBlocked = (iso) => (!allowFuture && iso > max) || (disablePast && iso < max);

  const choose = (day) => {
    const next = toIso(year, month, day);
    if (isBlocked(next)) return;
    onChange({ target: { name, value: next } });
    setOpen(false);
  };

  return (
    <div className={`parish-date-field${open && !disabled ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="parish-date-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{formatDisplay(value) || "MM/DD/YYYY"}</span>
        <CalendarDays size={18} aria-hidden="true" />
      </button>
      {open && !disabled ? (
        <div className="parish-date-popover" role="dialog" aria-label="Choose a date">
          <div className="parish-date-nav">
            <button type="button" aria-label="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))}>
              <ChevronLeft size={18} />
            </button>
            <label>
              <span className="parish-date-sr">Month</span>
              <select value={month} onChange={(event) => setCursor(new Date(year, Number(event.target.value), 1))}>
                {MONTHS.map((label, index) => (
                  <option key={label} value={index}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="parish-date-sr">Year</span>
              <select value={year} onChange={(event) => setCursor(new Date(Number(event.target.value), month, 1))}>
                {years.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <button type="button" aria-label="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="parish-date-weekdays">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="parish-date-grid">
            {Array.from({ length: 42 }, (_, index) => {
              const day = index - firstWeekday + 1;
              if (day < 1 || day > daysInMonth) return <span key={`empty-${index}`} />;
              const iso = toIso(year, month, day);
              return (
                <button
                  key={iso}
                  type="button"
                  className={iso === value ? "is-selected" : ""}
                  disabled={isBlocked(iso)}
                  onClick={() => choose(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="parish-date-actions">
            <button type="button" onClick={() => { onChange({ target: { name, value: "" } }); setOpen(false); }}>Clear</button>
            <button
              type="button"
              onClick={() => {
                onChange({ target: { name, value: max } });
                setCursor(maxDate);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
