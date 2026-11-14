function DashboardWelcomeHeader({
  parishName,
  timeLabel,
  officeStatus,
  subtitle,
  children,
}) {
  const officeStateClass = officeStatus?.isOpen ? "is-open" : officeStatus?.isOpen === false ? "is-closed" : "is-unavailable";
  const officeStatusLabel = officeStatus?.statusLabel || "Unavailable";

  return (
    <section className="admin-hero dashboard-welcome-header">
      <div>
        <h2>Welcome, {parishName}</h2>
        <div className="admin-office-status-row" aria-live="polite">
          <span className="admin-office-time-chip">
            PH Time: <strong>{timeLabel || "Loading..."}</strong>
          </span>
          <span className={`admin-office-state-chip ${officeStateClass}`}>
            Office {officeStatusLabel}
          </span>
        </div>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children ? <div className="admin-hero-actions">{children}</div> : null}
    </section>
  );
}

export default DashboardWelcomeHeader;
