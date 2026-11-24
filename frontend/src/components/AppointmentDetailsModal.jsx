import { useEffect } from "react";
import { DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG, getSacramentSchemaByName } from "../utils/sacramentFormSchemas";
import { formatListForDisplay, isListCredentialValue } from "../utils/listField";
import { describeCredentialFiles, isRedundantFileUrlKey } from "../utils/credentialFiles";
import { getCalendarRequesterName, getCredentialSubjectName } from "../utils/parishSchedule";
// The popup reuses the request-details popup styles from the admin requests page.
import "../pages/AdminAppointmentRequests.css";
import "./AppointmentDetailsModal.css";

const toReadableLabel = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

// Keys already shown in the summary, or internal bookkeeping not meant as form answers.
const HIDDEN_CREDENTIAL_KEYS = new Set([
  "requesterName",
  "requestorName",
  "requesterFullName",
  "requestorFullName",
  "paymentRecords",
  "scheduledEventDateTime",
  "finalSchedule",
  "finalEventSchedule",
]);

const getCredentialLabel = (key, sacramentName) => {
  const schema = getSacramentSchemaByName(DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG, sacramentName);
  const schemaLabel = (schema?.fields || []).find((field) => field.key === key)?.label;
  return schemaLabel || toReadableLabel(key);
};

const formatCredentialValue = (value) => {
  if (isListCredentialValue(value)) return formatListForDisplay(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((item) => formatCredentialValue(item)).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, nested]) => nested !== null && nested !== undefined && String(nested).trim() !== "")
      .map(([nestedKey, nested]) => `${toReadableLabel(nestedKey)}: ${formatCredentialValue(nested)}`)
      .join("\n");
  }
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
  }
  return text;
};

// Splits an appointment's credentials into readable fields and uploaded files, in form order.
export const buildCredentialDetails = (credentials, sacramentName) => {
  const source = credentials && typeof credentials === "object" && !Array.isArray(credentials) ? credentials : {};
  const schema = getSacramentSchemaByName(DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG, sacramentName);
  const schemaOrder = (schema?.fields || []).map((field) => field.key);
  const rank = (key) => {
    const index = schemaOrder.indexOf(key);
    return index >= 0 ? index : 1000;
  };
  const fields = [];
  const files = [];
  Object.entries(source)
    .sort(([left], [right]) => rank(left) - rank(right))
    .forEach(([key, value]) => {
      if (HIDDEN_CREDENTIAL_KEYS.has(key) || isRedundantFileUrlKey(key, source)) return;
      const label = getCredentialLabel(key.replace(/(FileName|FileUrl|File)$/i, ""), sacramentName);
      const fileItems = describeCredentialFiles(value, source, key);
      if (fileItems.length > 0) {
        fileItems.forEach((file, index) => files.push({ key: `${key}-${index}`, label, ...file }));
        return;
      }
      const text = formatCredentialValue(value);
      if (!text || text === "Not provided") return;
      fields.push({ key, label, value: text });
    });
  return { fields, files };
};

// Name typed into the form (both partners for Marriage), otherwise the requester's name
// (e.g. Blessing has no name field).
export const getAppointmentDisplayName = (appointment) =>
  getCredentialSubjectName(appointment) ||
  String(appointment?.requesterFullName || "").trim() ||
  String(getCalendarRequesterName(appointment) || "").trim();

export const hasCredentialDetails = (appointment) =>
  Boolean(
    appointment?.credentials &&
      typeof appointment.credentials === "object" &&
      Object.keys(appointment.credentials).length > 0,
  );

/**
 * Popup with an appointment's full details: a summary grid supplied by the page, an optional
 * note, every answer from the appointment's credentials, and uploaded files.
 */
function AppointmentDetailsModal({
  kicker = "Appointment",
  title,
  appointmentID,
  chips = [],
  summaryItems = [],
  note = "",
  noteLabel = "Note",
  credentials,
  sacramentName = "",
  onClose,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const { fields, files } = buildCredentialDetails(credentials, sacramentName);
  const visibleSummary = summaryItems.filter((item) => item && String(item.value ?? "").trim());
  const visibleChips = chips.filter(Boolean);
  const noteText = String(note || "").trim();

  return (
    <div className="appointment-confirm-overlay" role="presentation" onClick={onClose}>
      <section
        className="appointment-confirm-modal appointment-details-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Appointment details"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="appointment-details-shell">
          <div className="appointment-details-header">
            <div>
              <p className="appointment-details-kicker">{kicker}</p>
              <h3>{title || sacramentName || "Appointment Details"}</h3>
            </div>
            {appointmentID ? <span className="appointment-details-id">#{appointmentID}</span> : null}
          </div>
          {visibleChips.length > 0 ? (
            <div className="appointment-details-meta">
              {visibleChips.map((chip, index) => (
                <span key={`chip-${chip}`} className={`appointment-details-chip${index > 0 ? " is-category" : ""}`}>
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          <div className="appointment-details-content">
            {visibleSummary.length > 0 ? (
              <div className="appointment-details-grid">
                {visibleSummary.map((item) => (
                  <div key={`summary-${item.label}`} className="appointment-detail-item">
                    <span className="appointment-detail-label">{item.label}</span>
                    <p className="appointment-detail-value appointment-details-multiline">{item.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {noteText ? (
              <div className="appointment-detail-item is-full-width">
                <span className="appointment-detail-label">{noteLabel}</span>
                <p className="appointment-detail-value appointment-details-multiline">{noteText}</p>
              </div>
            ) : null}
            <section className="appointment-extra-details-section" aria-label="Details submitted">
              <h4>Details submitted</h4>
              {fields.length > 0 ? (
                <div className="appointment-details-grid">
                  {fields.map((field) => (
                    <div key={`credential-${field.key}`} className="appointment-detail-item">
                      <span className="appointment-detail-label">{field.label}</span>
                      <p className="appointment-detail-value appointment-details-multiline">{field.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="appointment-detail-value">No additional details were submitted.</p>
              )}
            </section>
            {files.length > 0 ? (
              <section className="appointment-attachments-section" aria-label="Uploaded files">
                <h4>Attachments</h4>
                <div className="appointment-details-grid">
                  {files.map((file) => (
                    <div key={`file-${file.key}`} className="appointment-detail-item">
                      <span className="appointment-detail-label">{file.label}</span>
                      <p className="appointment-detail-value">
                        <a href={file.url} target="_blank" rel="noopener noreferrer">
                          {file.name}
                        </a>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
          <div className="appointment-details-actions">
            <button type="button" className="appointment-details-back-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AppointmentDetailsModal;
