import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, CalendarX2, RotateCcw, ShieldCheck, UserRound, X } from "lucide-react";
import { pushUiNotice } from "../utils/uiNotice";
import "../pages/UserStatusPage.css";
import "./AppointmentCancellation.css";

const formatManilaDateTime = (value) => {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

function ModalShell({ title, subtitle, onClose, isBusy, children, actions, className = "" }) {
  return (
    <div className="appointment-confirm-overlay" role="presentation" onClick={() => (isBusy ? null : onClose())}>
      <section
        className={`appointment-confirm-modal user-status-modal appointment-cancel-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="user-status-modal-header">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="user-status-modal-close" onClick={onClose} disabled={isBusy} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="user-status-modal-body">{children}</div>
        {actions ? <div className="appointment-confirm-actions user-status-modal-actions">{actions}</div> : null}
      </section>
    </div>
  );
}

function ChangeRequestConfirm({ mode, appointment, userID, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isCancel = mode === "cancel";
  const serviceName = appointment?.serviceName || appointment?.sacramentalType || "this appointment";

  const handleSubmit = async () => {
    const trimmedReason = reason.trim();
    if (isCancel && trimmedReason.length < 3) {
      setError("Please tell the parish office why you want to cancel.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/appointments/${appointment.appointmentID}/${isCancel ? "cancel-request" : "restore-request"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userID, reason: trimmedReason }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Unable to send your request.");
      pushUiNotice(payload.message || "Your request was sent to the parish office.");
      onDone();
    } catch (submitError) {
      setError(submitError.message || "Unable to send your request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      title={isCancel ? "Cancel Appointment" : "Restore Appointment"}
      subtitle={
        isCancel
          ? `Are you sure you want to cancel your ${serviceName} appointment?`
          : `Are you sure you want to restore your ${serviceName} appointment?`
      }
      onClose={onClose}
      isBusy={isSubmitting}
      actions={
        <>
          <button type="button" className="change-request-button is-secondary" onClick={onClose} disabled={isSubmitting}>
            {isCancel ? "No, Keep It" : "No, Go Back"}
          </button>
          <button
            type="button"
            className="change-request-button is-primary"
            onClick={handleSubmit}
            disabled={isSubmitting || (isCancel && reason.trim().length < 3)}
          >
            {isSubmitting ? "Sending..." : isCancel ? "Yes, Request Cancellation" : "Yes, Request Restore"}
          </button>
        </>
      }
    >
      <p className="user-status-modal-note">
        {isCancel
          ? "The parish office must approve this first. Until they do, your appointment stays active. Once approved, it moves to your History tagged as Cancelled."
          : "The parish office must approve this first. Once approved, the appointment returns to your Status page."}
      </p>
      <label className="appointment-cancel-field">
        <span>{isCancel ? "Reason for cancelling (required)" : "Reason (optional)"}</span>
        <textarea
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            if (error) setError("");
          }}
          placeholder={isCancel ? "For example: we moved the date of the event" : "Tell the parish office why"}
          disabled={isSubmitting}
          required={isCancel}
          autoFocus
        />
      </label>
      {error ? <p className="appointment-cancel-error">{error}</p> : null}
    </ModalShell>
  );
}

export function ConfirmActionDialog({ title = "Are you sure?", message, confirmLabel, isBusy, onConfirm, onClose }) {
  return (
    <ModalShell
      title={title}
      onClose={onClose}
      isBusy={isBusy}
      className="change-request-confirm"
      actions={
        <>
          <button type="button" className="change-request-button is-secondary" onClick={onClose} disabled={isBusy}>
            No, Go Back
          </button>
          <button type="button" className="change-request-button is-primary" onClick={onConfirm} disabled={isBusy}>
            {isBusy ? "Please wait..." : confirmLabel}
          </button>
        </>
      }
    >
      <div className="change-request-confirm-summary">
        <span className="change-request-confirm-icon" aria-hidden="true">
          <AlertTriangle size={20} strokeWidth={2.1} />
        </span>
        <p>{message}</p>
      </div>
    </ModalShell>
  );
}

export function CancelAppointmentModal({ appointment, userID, onClose, onDone }) {
  return <ChangeRequestConfirm mode="cancel" appointment={appointment} userID={userID} onClose={onClose} onDone={onDone} />;
}

export function CancelledAppointmentsList({ userID, onChanged, viewMode = "list" }) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [withdrawingID, setWithdrawingID] = useState(null);
  const [withdrawTarget, setWithdrawTarget] = useState(null);

  const loadItems = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/users/${userID}/cancelled-appointments`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Unable to load your cancelled appointments.");
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load your cancelled appointments.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userID]);

  const handleWithdraw = async (item) => {
    setWithdrawingID(item.appointmentID);
    try {
      const response = await fetch(`/api/appointments/${item.appointmentID}/change-request?userID=${userID}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Unable to withdraw your request.");
      pushUiNotice(payload.message || "Your request was withdrawn.");
      setWithdrawTarget(null);
      await loadItems();
    } catch (withdrawError) {
      pushUiNotice(withdrawError.message || "Unable to withdraw your request.", "error");
    } finally {
      setWithdrawingID(null);
    }
  };

  return (
    <>
      <div className="appointment-cancel-page-panel-head">
        <div className="appointment-cancel-page-panel-title">
          <span className="appointment-cancel-page-panel-icon" aria-hidden="true">
            <CalendarX2 size={18} />
          </span>
          <div>
            <h3>Your cancelled appointments</h3>
            <p>Keep track of services you have cancelled and their latest updates.</p>
          </div>
        </div>
        <span className="appointment-cancel-page-count">
          {items.length} {items.length === 1 ? "appointment" : "appointments"}
        </span>
      </div>
      {isLoading ? (
        <p className="appointment-cancel-empty">Loading cancelled appointments...</p>
      ) : error ? (
        <p className="appointment-cancel-error">{error}</p>
      ) : items.length === 0 ? (
        <div className="appointment-cancel-empty appointment-cancel-page-empty">
          <CalendarX2 size={34} strokeWidth={1.5} aria-hidden="true" />
          <strong>No cancelled appointments</strong>
          <span>Appointments you cancel will appear here.</span>
        </div>
      ) : (
        <ul className={`appointment-cancelled-list is-page is-${viewMode}`}>
          {items.map((item) => {
            const scheduleLabel = formatManilaDateTime(item.scheduledEventDateTime);
            const cancelledLabel = formatManilaDateTime(item.cancelledAt);
            return (
              <li
                key={`cancelled-${item.appointmentID}`}
                className={`appointment-cancelled-item${viewMode === "grid" ? " is-grid" : ""}`}
              >
                <div className="appointment-cancelled-record-head">
                  <span className="appointment-cancelled-grid-icon" aria-hidden="true">
                    <CalendarX2 size={19} strokeWidth={1.9} />
                  </span>
                  <div className="appointment-cancelled-record-title">
                    <strong>{item.serviceName}</strong>
                    <span className="appointment-cancelled-grid-id">Appointment #{item.appointmentID}</span>
                  </div>
                  <span className="appointment-cancelled-tag">Cancelled</span>
                </div>
                {viewMode === "grid" ? (
                  <p className="appointment-cancelled-grid-type">Appointment record</p>
                ) : null}
                <dl className="appointment-cancelled-facts">
                  {scheduleLabel ? (
                    <div className="appointment-cancelled-fact">
                      <span className="appointment-cancelled-fact-icon" aria-hidden="true">
                        <CalendarDays size={15} />
                      </span>
                      <div>
                        <dt>Schedule</dt>
                        <dd>{scheduleLabel}</dd>
                      </div>
                    </div>
                  ) : null}
                  {item.priestName ? (
                    <div className="appointment-cancelled-fact">
                      <span className="appointment-cancelled-fact-icon" aria-hidden="true">
                        <UserRound size={15} />
                      </span>
                      <div>
                        <dt>Priest</dt>
                        <dd>{item.priestName}</dd>
                      </div>
                    </div>
                  ) : null}
                  {cancelledLabel ? (
                    <div className="appointment-cancelled-fact">
                      <span className="appointment-cancelled-fact-icon" aria-hidden="true">
                        <CalendarX2 size={15} />
                      </span>
                      <div>
                        <dt>Cancelled on</dt>
                        <dd>{cancelledLabel}</dd>
                      </div>
                    </div>
                  ) : null}
                  <div className="appointment-cancelled-fact">
                    <span className="appointment-cancelled-fact-icon" aria-hidden="true">
                      <ShieldCheck size={15} />
                    </span>
                    <div>
                      <dt>Cancelled by</dt>
                      <dd>{item.cancelledBy === "you" ? "Your request (approved)" : "Parish office"}</dd>
                    </div>
                  </div>
                </dl>
                {item.cancelReason ? (
                  <p className="appointment-cancelled-reason">
                    <AlertTriangle size={15} aria-hidden="true" />
                    <span>{item.cancelReason}</span>
                  </p>
                ) : null}
                {item.lastRestoreStatus === "declined" && !item.pendingRequestType ? (
                  <p className="appointment-cancelled-status is-declined">
                    Your last restore request was declined{item.lastRestoreResponse ? `: ${item.lastRestoreResponse}` : "."}
                  </p>
                ) : null}
                <div className="appointment-cancelled-actions">
                  {item.pendingRequestType === "restore" ? (
                    <>
                      <span className="appointment-cancelled-status">Restore request waiting for the parish office</span>
                      <button
                        type="button"
                        className="appointment-cancel-ghost"
                        onClick={() => setWithdrawTarget(item)}
                        disabled={withdrawingID === item.appointmentID}
                      >
                        {withdrawingID === item.appointmentID ? "Withdrawing..." : "Withdraw"}
                      </button>
                    </>
                  ) : item.isSchedulePast ? (
                    <span className="appointment-cancelled-status">The schedule has passed, so it can no longer be restored.</span>
                  ) : (
                    <button
                      type="button"
                      className="appointment-cancel-primary"
                      onClick={() => setRestoreTarget(item)}
                      disabled={!item.canRequestRestore}
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      Restore Appointment
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {withdrawTarget ? (
        <ConfirmActionDialog
          message={`Withdraw your restore request for ${withdrawTarget.serviceName}? The appointment will stay cancelled.`}
          confirmLabel="Yes, Withdraw"
          isBusy={withdrawingID === withdrawTarget.appointmentID}
          onConfirm={() => void handleWithdraw(withdrawTarget)}
          onClose={() => setWithdrawTarget(null)}
        />
      ) : null}
      {restoreTarget ? (
        <ChangeRequestConfirm
          mode="restore"
          appointment={restoreTarget}
          userID={userID}
          onClose={() => setRestoreTarget(null)}
          onDone={() => {
            setRestoreTarget(null);
            void loadItems();
            onChanged?.();
          }}
        />
      ) : null}
    </>
  );
}
