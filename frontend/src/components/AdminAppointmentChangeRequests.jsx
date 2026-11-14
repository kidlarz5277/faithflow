import { useState } from "react";
import { AlertTriangle, CalendarClock, CalendarX2, Check, Clock3, RotateCcw, User, UserRound, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

export async function fetchPendingAppointmentChangeRequests(adminID) {
  const response = await fetch(`/api/appointment-change-requests?adminID=${adminID}&status=pending`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Unable to load cancellation requests.");
  return Array.isArray(payload.requests) ? payload.requests : [];
}

const describeDecision = (isApprove, isCancel) => {
  if (isApprove && isCancel) {
    return "The appointment will be cancelled and removed from the calendar. It moves to History and Reports tagged as Cancelled, and the requester and assigned priest are notified.";
  }
  if (isApprove) {
    return "The appointment becomes active again and returns to the requester's Status page and your Progress Tracker.";
  }
  return isCancel
    ? "The appointment stays active. The requester is notified with your reason."
    : "The appointment stays cancelled. The requester is notified with your reason.";
};

export default function AdminAppointmentChangeRequestsList({ adminID, requests, isLoading, onChanged }) {
  const navigate = useNavigate();
  const [busyRequestID, setBusyRequestID] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState("");

  const openConfirm = (request, decision) => {
    setError("");
    setDeclineReason("");
    setConfirmTarget({ request, decision });
  };

  const submitDecision = async () => {
    if (!confirmTarget) return;
    const { request, decision } = confirmTarget;
    if (decision === "decline" && declineReason.trim().length < 3) {
      setError("Please give the requester a reason for declining.");
      return;
    }
    setBusyRequestID(request.requestID);
    setError("");
    try {
      const response = await fetch(`/api/appointment-change-requests/${request.requestID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminID, decision, response: declineReason.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Unable to update this request.");
      pushUiNotice(payload.message || "Request updated.");
      setConfirmTarget(null);
      await onChanged();
    } catch (submitError) {
      setError(submitError.message || "Unable to update this request.");
    } finally {
      setBusyRequestID(null);
    }
  };

  const isBusy = busyRequestID !== null;
  const confirmRequest = confirmTarget?.request;
  const isConfirmCancel = confirmRequest?.requestType === "cancel";
  const isConfirmApprove = confirmTarget?.decision === "approve";

  if (isLoading) return <p className="appointment-cancel-empty">Loading requests...</p>;

  return (
    <>
      {requests.length === 0 ? (
        <div className="appointment-cancel-empty appointment-cancel-page-empty">
          <CalendarX2 size={34} strokeWidth={1.5} aria-hidden="true" />
          <strong>No requests waiting</strong>
          <span>Cancellation and restore requests from parishioners will appear here.</span>
        </div>
      ) : (
        <ul className="change-request-list">
          {requests.map((request) => {
            const isCancel = request.requestType === "cancel";
            const scheduleLabel = formatManilaDateTime(request.scheduledEventDateTime);
            return (
              <li key={`change-request-${request.requestID}`} className={`change-request-card is-${request.requestType}`}>
                <header className="change-request-card-head">
                  <div className="change-request-card-title">
                    <span className="change-request-card-icon" aria-hidden="true">
                      {isCancel ? <CalendarX2 size={18} strokeWidth={2.1} /> : <RotateCcw size={18} strokeWidth={2.1} />}
                    </span>
                    <div>
                      <h4>{request.serviceName}</h4>
                      <p>Appointment No. {request.appointmentID}</p>
                    </div>
                  </div>
                  <span className={`change-request-type is-${request.requestType}`}>
                    {isCancel ? "Cancellation Request" : "Restore Request"}
                  </span>
                </header>

                <dl className="change-request-facts">
                  <div>
                    <dt>
                      <UserRound size={13} aria-hidden="true" /> Requester
                    </dt>
                    <dd>{request.requesterFullName || "Unknown requester"}</dd>
                  </div>
                  <div>
                    <dt>
                      <Clock3 size={13} aria-hidden="true" /> Requested On
                    </dt>
                    <dd>{formatManilaDateTime(request.createdAt) || "Not available"}</dd>
                  </div>
                  <div>
                    <dt>
                      <CalendarClock size={13} aria-hidden="true" /> Event Schedule
                    </dt>
                    <dd>{scheduleLabel || "Not scheduled yet"}</dd>
                  </div>
                  <div>
                    <dt>
                      <User size={13} aria-hidden="true" /> Assigned Priest
                    </dt>
                    <dd>{request.priestName || "Not assigned yet"}</dd>
                  </div>
                </dl>

                <div className="change-request-reason">
                  <span>Reason Given</span>
                  <p>{request.reason || "No reason was given."}</p>
                </div>

                <footer className="change-request-card-actions">
                  <button
                    type="button"
                    className="change-request-link"
                    onClick={() => navigate(`/admin/progress-tracker/${request.appointmentID}`)}
                  >
                    View Appointment
                  </button>
                  <div className="change-request-card-buttons">
                    <button
                      type="button"
                      className="change-request-button is-secondary"
                      onClick={() => openConfirm(request, "decline")}
                      disabled={isBusy}
                    >
                      <X size={15} aria-hidden="true" />
                      Decline
                    </button>
                    <button
                      type="button"
                      className="change-request-button is-primary"
                      onClick={() => openConfirm(request, "approve")}
                      disabled={isBusy}
                    >
                      <Check size={15} aria-hidden="true" />
                      {isCancel ? "Approve Cancellation" : "Approve Restore"}
                    </button>
                  </div>
                </footer>
              </li>
            );
          })}
        </ul>
      )}

      {confirmTarget ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={() => (isBusy ? null : setConfirmTarget(null))}>
          <section
            className="appointment-confirm-modal user-status-modal appointment-cancel-modal change-request-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="change-request-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="user-status-modal-header">
              <div>
                <h3 id="change-request-confirm-title">Are you sure?</h3>
                <p>
                  {isConfirmApprove ? "Approve" : "Decline"} the {isConfirmCancel ? "cancellation" : "restore"} request of{" "}
                  {confirmRequest.requesterFullName}
                </p>
              </div>
              <button
                type="button"
                className="user-status-modal-close"
                onClick={() => setConfirmTarget(null)}
                disabled={isBusy}
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="user-status-modal-body">
              <div className="change-request-confirm-summary">
                <span className="change-request-confirm-icon" aria-hidden="true">
                  <AlertTriangle size={20} strokeWidth={2.1} />
                </span>
                <div>
                  <strong>
                    {confirmRequest.serviceName} · Appointment No. {confirmRequest.appointmentID}
                  </strong>
                  <p>{describeDecision(isConfirmApprove, isConfirmCancel)}</p>
                </div>
              </div>
              {!isConfirmApprove ? (
                <label className="appointment-cancel-field">
                  <span>Reason for declining (required)</span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={declineReason}
                    onChange={(event) => {
                      setDeclineReason(event.target.value);
                      if (error) setError("");
                    }}
                    placeholder="This will be sent to the requester"
                    disabled={isBusy}
                    required
                    autoFocus
                  />
                </label>
              ) : null}
              {error ? <p className="appointment-cancel-error">{error}</p> : null}
            </div>
            <div className="appointment-confirm-actions user-status-modal-actions">
              <button
                type="button"
                className="change-request-button is-secondary"
                onClick={() => setConfirmTarget(null)}
                disabled={isBusy}
              >
                No, Go Back
              </button>
              <button
                type="button"
                className="change-request-button is-primary"
                onClick={() => void submitDecision()}
                disabled={isBusy || (!isConfirmApprove && declineReason.trim().length < 3)}
              >
                {isBusy ? "Saving..." : isConfirmApprove ? "Yes, Approve" : "Yes, Decline"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
