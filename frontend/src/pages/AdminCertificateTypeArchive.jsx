import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Inbox } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressTemplates.css";
import "./AdminSacramentRequirements.css";
import "./AdminSacramentArchive.css";

function AdminCertificateTypeArchive() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [archivedTypes, setArchivedTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const authData = useMemo(() => {
    const raw = localStorage.getItem("faithflow_auth") || sessionStorage.getItem("faithflow_auth");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);
  const user = authData?.user;
  const accountType = authData?.accountType;
  const activeNotice = error || notice;
  const isErrorNotice = Boolean(error);

  const loadArchivedTypes = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/admin-api/certificate-types/archived");
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load archived certificate types.");
      }
      setArchivedTypes(Array.isArray(responseData.items) ? responseData.items : []);
    } catch (loadError) {
      setArchivedTypes([]);
      setError(loadError.message || "Unable to load archived certificate types.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Faithflow - Archived Certificate Types";
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
    if (accountType === "admin") {
      void loadArchivedTypes();
    }
  }, [accountType, loadArchivedTypes]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleRemoveType = async () => {
    const certificateTypeID = Number(removeTarget?.certificateTypeID);
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) return;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/admin-api/certificate-types/${certificateTypeID}/permanent`, { method: "DELETE" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to remove certificate type.");
      }
      setArchivedTypes(Array.isArray(responseData.items) ? responseData.items : []);
      setRemoveTarget(null);
      setNotice("Certificate type removed.");
    } catch (removeError) {
      setError(removeError.message || "Unable to remove certificate type.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreType = async () => {
    const certificateTypeID = Number(restoreTarget?.certificateTypeID);
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) return;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/admin-api/certificate-types/${certificateTypeID}/restore`, { method: "POST" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to restore certificate type.");
      }
      setArchivedTypes(Array.isArray(responseData.items) ? responseData.items : []);
      setRestoreTarget(null);
      setNotice("Certificate type restored.");
    } catch (restoreError) {
      setError(restoreError.message || "Unable to restore certificate type.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="dashboard-layout">
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onLogout={handleLogout}
      />
      {activeNotice ? (
        <div className={`admin-top-notice${isErrorNotice ? " is-error" : ""}`} role="status">
          {activeNotice}
        </div>
      ) : null}
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="admin" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero sacrament-schema-hero">
            <div>
              <h2>Archived Certificate Types</h2>
              <p>Review certificate types whose isArchived value is true.</p>
            </div>
            <button
              type="button"
              className="progress-template-btn progress-template-btn--hero"
              onClick={() => navigate("/admin/certificate-types")}
            >
              Back to Certificate Type Manager
            </button>
          </section>

          <section className="dashboard-panel sacrament-archive-panel">
            {isLoading ? (
              <p>Loading archived types...</p>
            ) : archivedTypes.length === 0 ? (
              <div className="sacrament-archive-empty-state" role="status">
                <span className="sacrament-archive-empty-icon" aria-hidden="true">
                  <Inbox size={28} strokeWidth={1.6} />
                </span>
                <h4>No archived certificate types</h4>
                <p>Remove a certificate type from the manager page to see it here.</p>
              </div>
            ) : (
              <ul className="sacrament-archive-list">
                {archivedTypes.map((item) => {
                  const name = String(item.certTypeName || item.label || "Certificate Type").trim();
                  const fieldCount = Array.isArray(item.formSchema?.fields) ? item.formSchema.fields.length : 0;
                  return (
                    <li key={item.certificateTypeID}>
                      <article className="sacrament-archive-card">
                        <div className="sacrament-archive-card-identity">
                          <span className="sacrament-archive-card-icon" aria-hidden="true">
                            <Archive size={20} strokeWidth={1.8} />
                          </span>
                          <div className="sacrament-archive-card-copy">
                            <div className="sacrament-archive-card-title-row">
                              <h3>{name}</h3>
                              <span className="sacrament-archive-card-badge">Archived</span>
                            </div>
                            <p>Hidden from the certificate type manager until it is restored.</p>
                            <ul className="sacrament-archive-card-meta">
                              <li>{fieldCount === 1 ? "1 field" : `${fieldCount} fields`}</li>
                            </ul>
                          </div>
                        </div>
                        <div className="sacrament-archive-card-actions">
                          <button
                            type="button"
                            className="certificate-archive-action certificate-archive-action--restore"
                            onClick={() => setRestoreTarget(item)}
                            disabled={isSaving}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className="certificate-archive-action certificate-archive-action--remove"
                            onClick={() => setRemoveTarget(item)}
                            disabled={isSaving}
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </section>
      </div>
      {restoreTarget ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && setRestoreTarget(null)}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Restore certificate type confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <h4>Restore this certificate type?</h4>
              <p>
                <strong>{restoreTarget.certTypeName || restoreTarget.label || "Certificate Type"}</strong> will be moved back to
                the Certificate Type Manager.
              </p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setRestoreTarget(null)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn sacrament-archive-confirm-btn" onClick={() => void handleRestoreType()} disabled={isSaving}>
                {isSaving ? "Restoring..." : "Restore Type"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {removeTarget ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && setRemoveTarget(null)}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove certificate type confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <h4>Remove this certificate type?</h4>
              <p>
                <strong>{removeTarget.certTypeName || removeTarget.label || "Certificate Type"}</strong> will be taken off the
                archived list and cannot be restored.
              </p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setRemoveTarget(null)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn danger" onClick={() => void handleRemoveType()} disabled={isSaving}>
                {isSaving ? "Removing..." : "Remove"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminCertificateTypeArchive;
