import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Archive, ArchiveRestore, Inbox, Trash2 } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import PageGuide from "../components/PageGuide";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { normalizeSacramentFormSchemaConfig } from "../utils/sacramentFormSchemas";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressTemplates.css";
import "./AdminSacramentRequirements.css";
import "./AdminSacramentArchive.css";

// The archive mirrors the sacraments table, so the built-in schemas are never used as a fallback.
const EMPTY_SCHEMA_CONFIG = { version: 1, sacraments: {}, archivedSacraments: {} };
const toStoredSchemaConfig = (rawConfig) => normalizeSacramentFormSchemaConfig(rawConfig, { includeDefaults: false });

function AdminSacramentArchive() {
  const navigate = useNavigate();
  const location = useLocation();
  const dashboardOriginState = location.state?.fromDashboard ? { fromDashboard: true } : {};
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [schemaConfig, setSchemaConfig] = useState(EMPTY_SCHEMA_CONFIG);
  const [archivedSacraments, setArchivedSacraments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeAction, setActiveAction] = useState({ type: "", schemaKey: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);

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

  const toSchemaKeyFromName = useCallback((nameValue) => {
    const normalizedName = String(nameValue || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return normalizedName || null;
  }, []);

  const archivedSchemaEntries = useMemo(() => {
    const toCount = (value) => (Array.isArray(value) ? value.filter((item) => String(item || "").trim()).length : 0);
    const entriesByKey = new Map();
    for (const item of archivedSacraments) {
      const schemaKey = toSchemaKeyFromName(item?.sacramentName);
      if (!schemaKey || entriesByKey.has(schemaKey)) continue;
      const schemaFromConfig = schemaConfig?.archivedSacraments?.[schemaKey] || null;
      const fields = Array.isArray(schemaFromConfig?.fields) ? schemaFromConfig.fields : (item?.formSchema ?? item?.form_schema);
      const documents = schemaFromConfig?.requirements?.documents ?? item?.requirements?.documents;
      const nonDocuments = schemaFromConfig?.requirements?.nonDocuments ?? item?.requirements?.nonDocuments;
      entriesByKey.set(schemaKey, {
        ...(schemaFromConfig || {}),
        sacramentID: Number(item?.sacramentID) || null,
        label: String(item?.sacramentName || schemaFromConfig?.label || schemaKey),
        fieldCount: toCount(fields),
        documentCount: toCount(documents),
        otherRequirementCount: toCount(nonDocuments),
      });
    }
    return Array.from(entriesByKey.entries());
  }, [archivedSacraments, schemaConfig, toSchemaKeyFromName]);

  const formatCountLabel = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

  const loadSchemaConfig = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [schemaResponse, archivedSacramentsResponse] = await Promise.all([
        fetch("/admin-api/sacrament-form-schemas"),
        fetch("/admin-api/sacraments/archived"),
      ]);
      const schemaResponseData = await schemaResponse.json().catch(() => ({}));
      const archivedSacramentsResponseData = await archivedSacramentsResponse.json().catch(() => ({}));
      if (!schemaResponse.ok) {
        throw new Error(schemaResponseData.message || "Unable to load sacrament form schemas.");
      }
      if (!archivedSacramentsResponse.ok) {
        throw new Error(archivedSacramentsResponseData.message || "Unable to load archived sacrament types.");
      }
      const normalizedConfig = toStoredSchemaConfig(schemaResponseData);
      setSchemaConfig(normalizedConfig);
      setArchivedSacraments(Array.isArray(archivedSacramentsResponseData) ? archivedSacramentsResponseData : []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load archived sacrament types.");
      setSchemaConfig(EMPTY_SCHEMA_CONFIG);
      setArchivedSacraments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Faithflow - Archived Sacrament Types";
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
      void loadSchemaConfig();
    }
  }, [accountType, loadSchemaConfig]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const closeConfirmAction = () => {
    if (isSaving) return;
    setConfirmAction(null);
  };

  const openConfirmAction = (type, schemaKey, schema) => {
    setError("");
    setNotice("");
    setConfirmAction({ type, schemaKey, schema });
  };

  const handleRestoreType = async () => {
    const schemaKey = confirmAction?.schemaKey;
    const schema = confirmAction?.schema || {};
    if (!schemaKey) return;
    const hasArchivedSchema = archivedSchemaEntries.some(([entryKey]) => entryKey === schemaKey);
    if (!hasArchivedSchema) {
      setError("Archived sacrament type not found.");
      setConfirmAction(null);
      return;
    }
    setIsSaving(true);
    setActiveAction({ type: "restore", schemaKey });
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/admin-api/sacrament-form-schemas/${encodeURIComponent(schemaKey)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sacramentID: schema.sacramentID }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to restore sacrament type.");
      }
      const restoredSchemaKey = String(responseData.schemaKey || schemaKey).trim();
      navigate("/admin/sacrament-form-schemas", { state: { ...dashboardOriginState, selectedSchemaKey: restoredSchemaKey } });
    } catch (restoreError) {
      setError(restoreError.message || "Unable to restore sacrament type.");
      setIsSaving(false);
      setActiveAction({ type: "", schemaKey: "" });
    }
  };

  const handleDeleteType = async () => {
    const schemaKey = confirmAction?.schemaKey;
    const schema = confirmAction?.schema || {};
    if (!schemaKey) return;
    const hasArchivedSchema = archivedSchemaEntries.some(([entryKey]) => entryKey === schemaKey);
    if (!hasArchivedSchema) {
      setError("Archived sacrament type not found.");
      setConfirmAction(null);
      return;
    }

    setIsSaving(true);
    setActiveAction({ type: "delete", schemaKey });
    setError("");
    setNotice("");
    try {
      const deleteUrl = new URL(`/admin-api/sacrament-form-schemas/${encodeURIComponent(schemaKey)}`, window.location.origin);
      if (schema.sacramentID) {
        deleteUrl.searchParams.set("sacramentID", String(schema.sacramentID));
      }
      const response = await fetch(`${deleteUrl.pathname}${deleteUrl.search}`, { method: "DELETE" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to delete sacrament type.");
      }
      setSchemaConfig(toStoredSchemaConfig(responseData.config || schemaConfig));
      setConfirmAction(null);
      await loadSchemaConfig();
      setNotice("Sacrament type permanently deleted.");
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete sacrament type.");
    } finally {
      setIsSaving(false);
      setActiveAction({ type: "", schemaKey: "" });
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
              <h2>Archived Sacrament Types <PageGuide pageKey="sacrament-archive" /></h2>
            </div>
            <button
              type="button"
              className="progress-template-btn progress-template-btn--hero"
              onClick={() => navigate("/admin/sacrament-form-schemas", { state: dashboardOriginState })}
            >
              Back to Sacrament Manager
            </button>
          </section>

          <section className="dashboard-panel sacrament-archive-panel">
            {isLoading ? (
              <p>Loading archived types...</p>
            ) : archivedSchemaEntries.length === 0 ? (
              <div className="sacrament-archive-empty-state" role="status">
                <span className="sacrament-archive-empty-icon" aria-hidden="true">
                  <Inbox size={28} strokeWidth={1.6} />
                </span>
                <h4>No archived sacrament types</h4>
                <p>Archive a sacrament type from the manager page to see it here.</p>
              </div>
            ) : (
              <ul className="sacrament-archive-list">
                {archivedSchemaEntries.map(([schemaKey, schema]) => (
                  <li key={schemaKey}>
                    <article className="sacrament-archive-card">
                      <div className="sacrament-archive-card-identity">
                        <span className="sacrament-archive-card-icon" aria-hidden="true">
                          <Archive size={20} strokeWidth={1.8} />
                        </span>
                        <div className="sacrament-archive-card-copy">
                          <div className="sacrament-archive-card-title-row">
                            <h3>{schema.label || schemaKey}</h3>
                            <span className="sacrament-archive-card-badge">Archived</span>
                          </div>
                          <p>Hidden from the sacrament manager until it is restored.</p>
                          <ul className="sacrament-archive-card-meta">
                            <li>{formatCountLabel(schema.fieldCount, "field", "fields")}</li>
                            <li>{formatCountLabel(schema.documentCount, "document", "documents")}</li>
                            <li>{formatCountLabel(schema.otherRequirementCount, "other requirement", "other requirements")}</li>
                          </ul>
                        </div>
                      </div>
                      <div className="sacrament-archive-card-actions">
                        <button
                          type="button"
                          className="sacrament-archive-card-action sacrament-archive-card-action--restore"
                          onClick={() => openConfirmAction("restore", schemaKey, schema)}
                          disabled={isSaving}
                        >
                          <ArchiveRestore size={15} aria-hidden="true" />
                          Restore
                        </button>
                        <button
                          type="button"
                          className="sacrament-archive-card-action sacrament-archive-card-action--danger"
                          onClick={() => openConfirmAction("delete", schemaKey, schema)}
                          disabled={isSaving}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </div>
      {confirmAction?.type === "restore" ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={closeConfirmAction}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Restore sacrament type confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon sacrament-archive-confirm-icon" aria-hidden="true">
                <ArchiveRestore size={24} />
              </span>
              <h4>Restore this sacrament type?</h4>
              <p>
                <strong>{confirmAction.schema?.label || confirmAction.schemaKey}</strong> will be moved back to the Sacrament
                Form Manager.
              </p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={closeConfirmAction} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn sacrament-archive-confirm-btn" onClick={() => void handleRestoreType()} disabled={isSaving}>
                {isSaving && activeAction.type === "restore" ? "Restoring..." : "Restore Type"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {confirmAction?.type === "delete" ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={closeConfirmAction}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove sacrament type confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Remove this sacrament type?</h4>
              <p>
                <strong>{confirmAction.schema?.label || confirmAction.schemaKey}</strong> will be taken off the archived list
                and cannot be restored.
              </p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={closeConfirmAction} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn danger" onClick={() => void handleDeleteType()} disabled={isSaving}>
                {isSaving && activeAction.type === "delete" ? "Removing..." : "Remove"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminSacramentArchive;
