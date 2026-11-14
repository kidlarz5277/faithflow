import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Copy, Inbox, Plus, X } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { subscribeNotificationStream } from "../utils/notificationStream";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressTemplates.css";
import "./AdminSacramentRequirements.css";

const toTaskTitleCase = (value) =>
  String(value || "").replace(/\b([A-Za-z])([A-Za-z']*)/g, (_match, first, rest = "") => `${first.toUpperCase()}${rest.toLowerCase()}`);

const createStepUiId = () => `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toEditorStep = (step = {}, index = 0) => ({
  uiId: String(step?.uiId || createStepUiId()),
  title: String(step?.title || `Step ${index + 1}`),
  tasks:
    (Array.isArray(step?.tasks) ? step.tasks : [])
      .map((task) => toTaskTitleCase(task))
      .filter((task) => String(task || "").trim().length > 0).length > 0
      ? (Array.isArray(step?.tasks) ? step.tasks : []).map((task) => toTaskTitleCase(task))
      : ["New task"],
});

const createDefaultEditor = () => ({
  templateID: null,
  scope: "sacrament",
  sacramentID: "",
  schemaID: "",
  templateName: "",
  steps: [],
});

const normalizeEditorSteps = (steps) =>
  (Array.isArray(steps) ? steps : [])
    .map((step, index) => ({
      title: String(step?.title || `Step ${index + 1}`).trim(),
      tasks: (Array.isArray(step?.tasks) ? step.tasks : [])
        .map((task) => toTaskTitleCase(task).trim())
        .filter(Boolean),
    }))
    .filter((step) => step.title && step.tasks.length > 0);

function AdminProgressTemplates() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setupProgramName = String(searchParams.get("program") || "").trim();
  const isProgramSetup = searchParams.get("setup") === "1" && setupProgramName.length > 0;
  const setupAppliedRef = useRef("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [templates, setTemplates] = useState([]);
  const [sacraments, setSacraments] = useState([]);
  const [specialFormSchemas, setSpecialFormSchemas] = useState([]);
  const [templateScopeFilter, setTemplateScopeFilter] = useState("all");
  const [selectedTemplateID, setSelectedTemplateID] = useState(null);
  const [selectedCatalogKey, setSelectedCatalogKey] = useState(null);
  const [editor, setEditor] = useState(createDefaultEditor);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [stepDeleteTarget, setStepDeleteTarget] = useState(null);
  const [isDeletingStep, setIsDeletingStep] = useState(false);
  const [stepEditorTargetId, setStepEditorTargetId] = useState("");
  const [stepTaskDraft, setStepTaskDraft] = useState("");
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);

  const authData = useMemo(() => {
    const localValue = localStorage.getItem("faithflow_auth");
    const sessionValue = sessionStorage.getItem("faithflow_auth");
    const raw = localValue || sessionValue;
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const user = authData?.user;
  const accountType = authData?.accountType;
  const adminID = Number(user?.adminID);
  const activeNotice = error || saveMessage;
  const isErrorNotice = Boolean(error);

  const specialSchemaOptions = useMemo(
    () =>
      (Array.isArray(specialFormSchemas) ? specialFormSchemas : [])
        .map((item) => ({
          schemaID: Number(item?.schemaID || item?.s_sacramentID),
          specialSacramentName: String(item?.specialSacramentName || item?.s_sacramentName || item?.displayLabel || "").trim(),
        }))
        .filter((item) => Number.isInteger(item.schemaID) && item.schemaID > 0 && item.specialSacramentName)
        .sort((left, right) => left.specialSacramentName.localeCompare(right.specialSacramentName)),
    [specialFormSchemas],
  );
  const specialSchemaNameById = useMemo(
    () => new Map(specialSchemaOptions.map((item) => [item.schemaID, item.specialSacramentName])),
    [specialSchemaOptions],
  );

  const sacramentNameById = useMemo(() => {
    const entries = (Array.isArray(sacraments) ? sacraments : []).map((item) => [Number(item?.sacramentID), String(item?.sacramentName || "").trim()]);
    return new Map(entries);
  }, [sacraments]);
  const sacramentOptions = useMemo(
    () =>
      (Array.isArray(sacraments) ? sacraments : [])
        .filter((item) => Number.isInteger(Number(item?.sacramentID)) && Number(item?.sacramentID) > 0 && String(item?.sacramentName || "").trim() && item?.is_archived !== true && item?.isArchived !== true)
        .map((item) => ({
          sacramentID: Number(item.sacramentID),
          sacramentName: String(item.sacramentName || "").trim(),
        }))
        .sort((a, b) => a.sacramentName.localeCompare(b.sacramentName)),
    [sacraments],
  );

  const catalogItems = useMemo(() => {
    const sacramentItems = sacramentOptions.map((item) => {
      const template = (Array.isArray(templates) ? templates : []).find(
        (entry) => String(entry?.scope || "") === "sacrament" && Number(entry?.sacramentID) === item.sacramentID,
      );
      return {
        key: `sacrament-${item.sacramentID}`,
        scope: "sacrament",
        sacramentID: item.sacramentID,
        schemaID: null,
        name: item.sacramentName,
        template: template || null,
      };
    });
    const specialItems = specialSchemaOptions.map((item) => {
      const template = (Array.isArray(templates) ? templates : []).find(
        (entry) => String(entry?.scope || "") === "special_sacrament" && Number(entry?.schemaID) === item.schemaID,
      );
      return {
        key: `special-${item.schemaID}`,
        scope: "special_sacrament",
        sacramentID: null,
        schemaID: item.schemaID,
        name: item.specialSacramentName,
        template: template || null,
      };
    });
    const items = [...sacramentItems, ...specialItems];
    if (templateScopeFilter === "all") return items;
    return items.filter((item) => item.scope === templateScopeFilter);
  }, [sacramentOptions, specialSchemaOptions, templateScopeFilter, templates]);

  const loadData = useCallback(async () => {
    if (!user || accountType !== "admin") return;
    setIsLoading(true);
    setError("");
    const [templatesResult, sacramentsResult, specialSchemasResult] = await Promise.allSettled([
      fetch("/admin-api/progress-templates"),
      fetch("/admin-api/sacraments?archived=false"),
      fetch("/admin-api/special-sacrament-form-schemas"),
    ]);
    const issues = [];

    if (templatesResult.status === "fulfilled") {
      const templatesData = await templatesResult.value.json().catch(() => []);
      if (templatesResult.value.ok) {
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
      } else {
        setTemplates([]);
        issues.push("Unable to load progress templates.");
      }
    } else {
      setTemplates([]);
      issues.push("Unable to load progress templates.");
    }

    if (sacramentsResult.status === "fulfilled") {
      const sacramentsData = await sacramentsResult.value.json().catch(() => []);
      if (sacramentsResult.value.ok) {
        setSacraments(Array.isArray(sacramentsData) ? sacramentsData : []);
      } else {
        setSacraments([]);
        issues.push("Unable to load sacraments.");
      }
    } else {
      setSacraments([]);
      issues.push("Unable to load sacraments.");
    }

    if (specialSchemasResult.status === "fulfilled") {
      const specialSchemasData = await specialSchemasResult.value.json().catch(() => []);
      if (specialSchemasResult.value.ok) {
        setSpecialFormSchemas(Array.isArray(specialSchemasData) ? specialSchemasData : []);
      } else {
        setSpecialFormSchemas([]);
        issues.push("Unable to load special sacrament forms.");
      }
    } else {
      setSpecialFormSchemas([]);
      issues.push("Unable to load special sacrament forms.");
    }

    if (issues.length > 0) {
      setError(issues[0]);
    }
    setIsLoading(false);
  }, [accountType, user]);

  useEffect(() => {
    document.title = "Faithflow - Progress Templates";
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
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (accountType !== "admin" || !Number.isInteger(adminID) || adminID <= 0) return undefined;
    const streamPath = `/api/notifications/stream?accountType=admin&adminID=${adminID}`;
    return subscribeNotificationStream(streamPath, {
      onNotification: (event) => {
        try {
          const payload = JSON.parse(String(event?.data || "{}"));
          if (payload?.action !== "realtime_update") return;
          if (
            payload?.resource === "progress_templates" ||
            payload?.resource === "sacrament_form_schemas" ||
            payload?.resource === "special_sacrament_form_schemas"
          ) {
            void loadData();
          }
        } catch {
          // Ignore malformed stream payloads.
        }
      },
    });
  }, [accountType, adminID, loadData]);

  useEffect(() => {
    if (selectedTemplateID === null) return;
    const selected = templates.find((template) => Number(template.templateID) === Number(selectedTemplateID));
    if (!selected) return;
    const selectedSteps = Array.isArray(selected.steps) ? selected.steps.map((step, index) => toEditorStep(step, index)) : [];
    setEditor({
      templateID: Number(selected.templateID),
      scope: String(selected.scope || "sacrament"),
      sacramentID: selected.sacramentID ? String(selected.sacramentID) : "",
      schemaID: selected.schemaID ? String(selected.schemaID) : "",
      templateName: selected.templateName || "",
      steps: selectedSteps,
    });
    setStepEditorTargetId("");
    setStepTaskDraft("");
  }, [selectedTemplateID, templates]);

  const handleSelectCatalogItem = (item) => {
    setSelectedCatalogKey(item.key);
    setError("");
    setSaveMessage("");
    setStepEditorTargetId("");
    setStepTaskDraft("");
    if (item.template) {
      setSelectedTemplateID(Number(item.template.templateID));
      return;
    }
    setSelectedTemplateID(null);
    setEditor({
      templateID: null,
      scope: item.scope,
      sacramentID: item.sacramentID ? String(item.sacramentID) : "",
      schemaID: item.schemaID ? String(item.schemaID) : "",
      templateName: item.name,
      steps: [],
    });
  };

  const handleTemplateScopeFilterChange = (event) => {
    const nextFilter = String(event.target.value || "all");
    setTemplateScopeFilter(nextFilter);
    setSelectedCatalogKey(null);
    setSelectedTemplateID(null);
    setEditor(createDefaultEditor());
    setError("");
    setSaveMessage("");
    setStepEditorTargetId("");
    setStepTaskDraft("");
    setStepDeleteTarget(null);
    setIsSaveConfirmOpen(false);
  };

  useEffect(() => {
    const programName = setupProgramName.toLowerCase();
    if (!programName || catalogItems.length === 0) return;
    if (setupAppliedRef.current === programName) return;
    const match = catalogItems.find(
      (item) => item.scope === "special_sacrament" && String(item.name || "").trim().toLowerCase() === programName,
    );
    if (!match) return;
    setupAppliedRef.current = programName;
    handleSelectCatalogItem(match);
  }, [catalogItems, setupProgramName]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const saveTemplate = async () => {
    setIsSaving(true);
    setError("");
    setSaveMessage("");
    try {
      const hasLinkedTarget =
        editor.scope === "special_sacrament"
          ? Number(editor.schemaID) > 0
          : Number(editor.sacramentID) > 0;
      if (!hasLinkedTarget) {
        throw new Error("Select a sacrament or special sacrament from the list first.");
      }
      const linkedName =
        editor.scope === "special_sacrament"
          ? specialSchemaNameById.get(Number(editor.schemaID)) || ""
          : sacramentNameById.get(Number(editor.sacramentID)) || "";
      const payload = {
        scope: editor.scope,
        sacramentID: editor.scope === "sacrament" ? Number(editor.sacramentID) : null,
        schemaID: editor.scope === "special_sacrament" ? Number(editor.schemaID) : null,
        templateName: String(editor.templateName || "").trim() || linkedName,
        isActive: true,
      };
      const normalizedSteps = normalizeEditorSteps(editor.steps);

      let templateID = editor.templateID;
      if (!templateID) {
        const createResponse = await fetch("/admin-api/progress-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, steps: normalizedSteps }),
        });
        const created = await createResponse.json().catch(() => null);
        if (!createResponse.ok) throw new Error(created?.message || "Unable to create template.");
        templateID = Number(created?.templateID);
      } else {
        const updateResponse = await fetch(`/admin-api/progress-templates/${templateID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const updated = await updateResponse.json().catch(() => null);
        if (!updateResponse.ok) throw new Error(updated?.message || "Unable to update template.");
        const stepsResponse = await fetch(`/admin-api/progress-templates/${templateID}/steps`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steps: normalizedSteps }),
        });
        const stepsResult = await stepsResponse.json().catch(() => null);
        if (!stepsResponse.ok) throw new Error(stepsResult?.message || "Unable to update template steps.");
      }

      await loadData();
      if (templateID) {
        setSelectedTemplateID(templateID);
      }
      if (payload.scope === "special_sacrament" && Number(payload.schemaID) > 0) {
        setSelectedCatalogKey(`special-${payload.schemaID}`);
      } else if (payload.scope === "sacrament" && Number(payload.sacramentID) > 0) {
        setSelectedCatalogKey(`sacrament-${payload.sacramentID}`);
      }
      if (isProgramSetup && payload.scope === "special_sacrament") {
        const readyName = linkedName || setupProgramName;
        navigate("/admin/special-programs", {
          state: {
            notice: `${readyName} is ready. Parishioners can apply for it from the dashboard through the day of the event.`,
          },
        });
        return;
      }
      setSaveMessage("Template saved.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save template.");
    } finally {
      setIsSaving(false);
    }
  };

  const requestStepRemoval = (stepIndex) => {
    const rawTitle = String(editor.steps[stepIndex]?.title || "").trim();
    setStepDeleteTarget({
      stepIndex,
      stepUiId: String(editor.steps[stepIndex]?.uiId || ""),
      title: rawTitle || `Step ${stepIndex + 1}`,
    });
  };

  const confirmStepRemoval = async () => {
    if (!stepDeleteTarget) return;
    const nextSteps = editor.steps.filter((_item, index) => index !== stepDeleteTarget.stepIndex);

    if (!editor.templateID) {
      setEditor((current) => ({ ...current, steps: nextSteps }));
      if (stepDeleteTarget.stepUiId && stepDeleteTarget.stepUiId === stepEditorTargetId) {
        setStepEditorTargetId("");
        setStepTaskDraft("");
      }
      setSaveMessage("Step removed.");
      setError("");
      setStepDeleteTarget(null);
      return;
    }

    const normalizedSteps = normalizeEditorSteps(nextSteps);

    setIsDeletingStep(true);
    setError("");
    setSaveMessage("");
    try {
      const stepsResponse = await fetch(`/admin-api/progress-templates/${editor.templateID}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: normalizedSteps }),
      });
      const stepsResult = await stepsResponse.json().catch(() => null);
      if (!stepsResponse.ok) throw new Error(stepsResult?.message || "Unable to remove template step.");

      setEditor((current) => ({ ...current, steps: nextSteps }));
      if (stepDeleteTarget.stepUiId && stepDeleteTarget.stepUiId === stepEditorTargetId) {
        setStepEditorTargetId("");
        setStepTaskDraft("");
      }
      setSaveMessage("Step removed.");
      setStepDeleteTarget(null);
    } catch (removeError) {
      setError(removeError.message || "Unable to remove template step.");
    } finally {
      setIsDeletingStep(false);
    }
  };

  const duplicateEditorStep = (stepIndex) => {
    setEditor((current) => {
      const sourceStep = current.steps[stepIndex];
      if (!sourceStep) return current;
      const baseTitle = String(sourceStep.title || "").trim();
      const duplicatedStep = {
        ...sourceStep,
        uiId: createStepUiId(),
        title: baseTitle ? `${baseTitle} Copy` : `Step ${stepIndex + 2}`,
      };
      const nextSteps = [...current.steps];
      nextSteps.splice(stepIndex + 1, 0, duplicatedStep);
      return {
        ...current,
        steps: nextSteps,
      };
    });
  };

  const persistEditingStep = async () => {
    if (!editor.templateID) {
      closeStepTaskModal();
      setSaveMessage("Step updated. Use Save Changes to store the new template.");
      return;
    }
    setIsSaving(true);
    setError("");
    setSaveMessage("");
    try {
      const stepsResponse = await fetch(`/admin-api/progress-templates/${editor.templateID}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: normalizeEditorSteps(editor.steps) }),
      });
      const stepsResult = await stepsResponse.json().catch(() => null);
      if (!stepsResponse.ok) throw new Error(stepsResult?.message || "Unable to save this step.");
      setSaveMessage("Step saved. Open progress trackers will use this checklist.");
      closeStepTaskModal();
    } catch (saveError) {
      setError(saveError.message || "Unable to save this step.");
    } finally {
      setIsSaving(false);
    }
  };

  const editingStepIndex = useMemo(
    () => editor.steps.findIndex((step) => String(step.uiId) === String(stepEditorTargetId)),
    [editor.steps, stepEditorTargetId],
  );

  const editingStep = editingStepIndex >= 0 ? editor.steps[editingStepIndex] : null;

  const openStepTaskModal = (stepUiId) => {
    const normalizedId = String(stepUiId || "");
    if (!normalizedId) return;
    setStepEditorTargetId(normalizedId);
    setStepTaskDraft("");
  };

  const closeStepTaskModal = () => {
    setStepEditorTargetId("");
    setStepTaskDraft("");
  };

  const addTaskToEditingStep = () => {
    if (editingStepIndex < 0) return;
    const normalizedTask = toTaskTitleCase(String(stepTaskDraft || "").trim());
    if (!normalizedTask) return;
    setEditor((current) => ({
      ...current,
      steps: current.steps.map((step, index) =>
        index === editingStepIndex ? { ...step, tasks: [...(Array.isArray(step.tasks) ? step.tasks : []), normalizedTask] } : step,
      ),
    }));
    setStepTaskDraft("");
  };

  const removeTaskFromEditingStep = (taskIndex) => {
    if (editingStepIndex < 0) return;
    setEditor((current) => ({
      ...current,
      steps: current.steps.map((step, index) =>
        index === editingStepIndex
          ? {
              ...step,
              tasks: (Array.isArray(step.tasks) ? step.tasks : []).filter((_task, currentIndex) => currentIndex !== taskIndex),
            }
          : step,
      ),
    }));
  };

  const updateTaskInEditingStep = (taskIndex, value) => {
    if (editingStepIndex < 0) return;
    setEditor((current) => ({
      ...current,
      steps: current.steps.map((step, index) =>
        index === editingStepIndex
          ? {
              ...step,
              tasks: (Array.isArray(step.tasks) ? step.tasks : []).map((task, currentIndex) =>
                currentIndex === taskIndex ? value : task,
              ),
            }
          : step,
      ),
    }));
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
              <h2>Progress Template Manager</h2>
              <p>Manage templates and step checklists for sacrament and special sacrament progress tracking.</p>
            </div>
          </section>

          <section
            className={`dashboard-panel sacrament-schema-layout progress-templates-layout${
              selectedCatalogKey ? " is-editor-open" : " is-list-only"
            }`}
          >
            <aside className="sacrament-schema-list progress-templates-list">
              <div className="sacrament-schema-list-header progress-templates-list-header">
                <h3>Templates</h3>
              </div>
              <div className="progress-template-filter">
                <label htmlFor="template-scope-filter">Filter</label>
                <select
                  id="template-scope-filter"
                  value={templateScopeFilter}
                  onChange={handleTemplateScopeFilterChange}
                >
                  <option value="all">All Templates</option>
                  <option value="sacrament">Sacraments</option>
                  <option value="special_sacrament">Special Sacraments</option>
                </select>
              </div>
              {isLoading ? (
                <p>Loading templates...</p>
              ) : catalogItems.length === 0 ? (
                <div className="sacrament-schema-empty-state progress-template-empty-state" role="status" aria-live="polite">
                  <span className="sacrament-schema-empty-icon progress-template-empty-icon" aria-hidden="true">
                    <Inbox size={28} strokeWidth={1.6} />
                  </span>
                  <h4>
                    {templateScopeFilter === "sacrament"
                      ? "No sacrament types yet"
                      : templateScopeFilter === "special_sacrament"
                        ? "No special sacrament forms yet"
                        : "No types yet"}
                  </h4>
                  <p>
                    {templateScopeFilter === "special_sacrament"
                      ? "Add a special sacrament form first, then you can create its progress template."
                      : templateScopeFilter === "sacrament"
                        ? "Sacrament types from the sacraments table will appear here."
                        : "Sacrament and special sacrament form names will appear here."}
                  </p>
                </div>
              ) : (
                <ul>
                  {catalogItems.map((item) => {
                    const isSelected = item.key === selectedCatalogKey;
                    return (
                      <li key={item.key}>
                        <div
                          className={`sacrament-schema-item progress-template-item ${isSelected ? "is-selected" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectCatalogItem(item)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleSelectCatalogItem(item);
                            }
                          }}
                        >
                          <div className="sacrament-schema-item-main progress-template-item-main">
                            <strong>{item.name}</strong>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>

            {selectedCatalogKey ? (
            <section className="sacrament-schema-editor progress-template-editor" aria-live="polite">
              <div className="sacrament-schema-editor-header progress-template-editor-header">
                <h3>{editor.templateID ? "Edit Template" : "New Template"}</h3>
                <div className="sacrament-schema-editor-actions progress-template-editor-actions">
                  <button type="button" className="progress-template-btn" onClick={() => setIsSaveConfirmOpen(true)} disabled={isSaving}>
                    {isSaving ? "Saving..." : isProgramSetup ? "Save and finish" : "Save Changes"}
                  </button>
                </div>
              </div>

              <div className="template-steps-header">
                <h4>Template Steps</h4>
                <button
                  type="button"
                  className="sacrament-add-icon-button progress-template-add-step-icon-button"
                  aria-label="Add step"
                  title="Add Step"
                  onClick={() => {
                    const nextIndex = editor.steps.length;
                    const newStep = toEditorStep({ title: `Step ${nextIndex + 1}`, tasks: ["New task"] }, nextIndex);
                    setEditor((current) => ({
                      ...current,
                      steps: [...current.steps, newStep],
                    }));
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
              <p className="sacrament-schema-hint">Each step title appears in order. Add one task per line to build the checklist.</p>

              <div className="template-steps-list">
                {editor.steps.length === 0 ? (
                  <p className="sacrament-schema-hint">No steps yet. Use the + button to add a step.</p>
                ) : null}
                {editor.steps.map((step, stepIndex) => (
                  <article key={`template-step-${stepIndex}`} className="template-step-card sacrament-schema-field-card">
                    <header className="sacrament-schema-field-card-header">
                      <div className="sacrament-schema-field-card-title">
                        <h5>{step.title || `Step ${stepIndex + 1}`}</h5>
                        <span>Position {stepIndex + 1}</span>
                      </div>
                      <div className="sacrament-schema-field-card-actions">
                        <button
                          type="button"
                          className="sacrament-schema-card-edit-toggle"
                          onClick={() => openStepTaskModal(step.uiId)}
                        >
                          Edit Field
                        </button>
                        <button
                          type="button"
                          className="sacrament-schema-row-action"
                          onClick={() => duplicateEditorStep(stepIndex)}
                          aria-label={`Duplicate ${step.title || `step ${stepIndex + 1}`}`}
                          title="Duplicate step"
                        >
                          <Copy size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="sacrament-schema-row-action sacrament-schema-row-action--danger"
                          onClick={() => requestStepRemoval(stepIndex)}
                          disabled={isSaving || isDeletingStep}
                          aria-label={`Remove ${step.title || `step ${stepIndex + 1}`}`}
                          title="Remove step"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </header>
                    <div className="sacrament-schema-field-summary template-step-summary">
                      <span>
                        Tasks: <code>{step.tasks.filter((task) => String(task || "").trim()).length}</code>
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            ) : null}
          </section>
        </section>
      </div>
      {editingStep ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={closeStepTaskModal}>
          <section
            className="template-delete-modal template-step-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit tasks for ${editingStep.title || "step"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-step-editor-topbar">
              <div className="template-delete-modal-body template-step-editor-modal-body">
                <h4>Edit Step Tasks</h4>
                <p>Add tasks for <strong>{editingStep.title || `Step ${editingStepIndex + 1}`}</strong>.</p>
              </div>
              <button
                type="button"
                className="template-step-editor-close"
                aria-label="Close edit step tasks modal"
                onClick={closeStepTaskModal}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="template-step-editor-meta">
              <span>
                Step: <strong>{editingStepIndex + 1}</strong>
              </span>
              <span>
                Total Tasks: <strong>{editingStep.tasks.filter((task) => String(task || "").trim()).length}</strong>
              </span>
            </div>
            <div className="template-step-edit-grid">
              <label>
                Step Title
                <input
                  value={editingStep.title}
                  onChange={(event) =>
                    setEditor((current) => ({
                      ...current,
                      steps: current.steps.map((item, index) =>
                        index === editingStepIndex ? { ...item, title: event.target.value } : item,
                      ),
                    }))
                  }
                  placeholder={`Step ${editingStepIndex + 1} title`}
                />
              </label>
            </div>
            <p className="template-step-task-list-label">Task</p>
            <div className="template-step-task-list">
              {Array.isArray(editingStep.tasks) && editingStep.tasks.length > 0 ? (
                editingStep.tasks.map((task, taskIndex) => {
                  return (
                    <div key={`${editingStep.uiId}-task-${taskIndex}`} className="template-step-task-item">
                      <span className="template-step-task-index">{taskIndex + 1}</span>
                      <input
                        className="template-step-task-text template-step-task-edit-input"
                        value={String(task || "")}
                        onChange={(event) => updateTaskInEditingStep(taskIndex, event.target.value)}
                        placeholder={`Task ${taskIndex + 1}`}
                      />
                      <button
                        type="button"
                        className="template-step-task-remove"
                        onClick={() => removeTaskFromEditingStep(taskIndex)}
                        aria-label={`Remove task ${taskIndex + 1}`}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="template-step-task-empty">No tasks yet. Add your first task below.</p>
              )}
            </div>
            <label className="template-step-task-input-label">
              Add Task
              <div className="template-step-task-add-row">
                <input
                  value={stepTaskDraft}
                  onChange={(event) => setStepTaskDraft(toTaskTitleCase(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTaskToEditingStep();
                    }
                  }}
                  placeholder="e.g. Submit requirements to office"
                  autoFocus
                />
                <button type="button" className="progress-template-btn template-step-task-add-btn" onClick={addTaskToEditingStep}>
                  Add Task
                </button>
              </div>
            </label>
            <div className="template-delete-modal-actions template-step-editor-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => void persistEditingStep()} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {stepDeleteTarget ? (
        <div
          className="template-delete-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!isDeletingStep) setStepDeleteTarget(null);
          }}
        >
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove step confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Remove this step?</h4>
              <p>
                This will remove <strong>{stepDeleteTarget.title}</strong> and its tasks
                {editor.templateID ? " from this template in the database." : "."}
              </p>
            </div>
            <div className="template-delete-modal-actions">
              <button
                type="button"
                className="template-modal-btn secondary"
                onClick={() => setStepDeleteTarget(null)}
                disabled={isDeletingStep}
              >
                Cancel
              </button>
              <button
                type="button"
                className="template-modal-btn danger"
                onClick={() => void confirmStepRemoval()}
                disabled={isDeletingStep}
              >
                {isDeletingStep ? "Removing..." : "Remove Step"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isSaveConfirmOpen ? (
        <div
          className="template-delete-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!isSaving) setIsSaveConfirmOpen(false);
          }}
        >
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save template confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Save template changes?</h4>
              <p>This will update the selected template and its steps.</p>
            </div>
            <div className="template-delete-modal-actions">
              <button
                type="button"
                className="template-modal-btn secondary"
                onClick={() => setIsSaveConfirmOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="template-modal-btn danger"
                onClick={() => {
                  setIsSaveConfirmOpen(false);
                  void saveTemplate();
                }}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminProgressTemplates;
