import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, FileText, Inbox, Pencil, Plus, X } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import PageGuide from "../components/PageGuide";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressTemplates.css";
import "./AdminSacramentRequirements.css";

const FIELD_TYPES = ["text", "number", "date", "tel", "select", "file"];
const FIELD_TYPE_LABELS = {
  text: "Short text",
  number: "Number",
  date: "Date",
  tel: "Phone number",
  select: "Choose from a list",
  file: "Upload a file",
};
const createFieldUiId = () => `field-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const normalizeFieldType = (value) => {
  const normalized = String(value || "text").trim().toLowerCase();
  return FIELD_TYPES.includes(normalized) ? normalized : "text";
};
const DEFAULT_SPECIAL_FORM_SCHEMA = {
  version: 1,
  requirements: { documents: [], nonDocuments: [] },
  fields: [],
};

const createEmptyField = () => ({
  uiId: createFieldUiId(),
  key: "",
  label: "",
  type: normalizeFieldType("text"),
  required: true,
  placeholder: "",
  accept: "",
  optionsText: "",
});

const toFieldEditor = (field = {}) => ({
  uiId: String(field.uiId || createFieldUiId()),
  key: String(field.key || ""),
  label: String(field.label || ""),
  type: normalizeFieldType(field.type),
  required: field.required !== false,
  placeholder: String(field.placeholder || ""),
  accept: String(field.accept || ""),
  optionsText: Array.isArray(field.options) ? field.options.join("\n") : "",
});

const toCamelCaseKey = (value) => {
  const words = String(value || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  if (words.length === 0) return "";
  return `${words[0]}${words
    .slice(1)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}`;
};

const toTitleCase = (value) =>
  String(value || "").replace(/\b([A-Za-z])([A-Za-z']*)/g, (_match, first, rest = "") => `${first.toUpperCase()}${rest.toLowerCase()}`);
const toTitleCaseLines = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => toTitleCase(line))
    .join("\n");

const toSchemaField = (field = {}, index = 0) => {
  const options = String(field.optionsText || "")
    .split("\n")
    .map((item) => toTitleCase(item.trim()))
    .filter(Boolean);
  const label = toTitleCase(String(field.label || "").trim());
  const autoKey = toCamelCaseKey(label);
  const autoPlaceholder = label ? `Enter ${label}` : `Enter Field ${index + 1}`;
  return {
    key: String(field.key || "").trim() || autoKey || `field_${index + 1}`,
    label: label || `Field ${index + 1}`,
    type: normalizeFieldType(field.type),
    required: field.required !== false,
    placeholder: String(field.placeholder || "").trim() || autoPlaceholder,
    accept: String(field.accept || "").trim(),
    options,
  };
};

const normalizeSpecialFormSchema = (rawSchema) => {
  const fallback = DEFAULT_SPECIAL_FORM_SCHEMA;
  if (!rawSchema || typeof rawSchema !== "object") return fallback;
  const requirements = {
    documents: Array.isArray(rawSchema?.requirements?.documents)
      ? rawSchema.requirements.documents.map((item) => String(item || "").trim()).filter(Boolean)
      : fallback.requirements.documents,
    nonDocuments: Array.isArray(rawSchema?.requirements?.nonDocuments)
      ? rawSchema.requirements.nonDocuments.map((item) => String(item || "").trim()).filter(Boolean)
      : fallback.requirements.nonDocuments,
  };
  const fieldsSource = Array.isArray(rawSchema?.fields) ? rawSchema.fields : fallback.fields;
  return {
    version: Number(rawSchema?.version) || 1,
    requirements,
    fields: fieldsSource.map((field, index) => toSchemaField({ ...toFieldEditor(field), key: field?.key || "", label: field?.label || "" }, index)),
  };
};

function AdminSpecialSacramentRequirements() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setupProgramName = String(searchParams.get("program") || "").trim();
  const isProgramSetup = searchParams.get("setup") === "1" && setupProgramName.length > 0;
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [entries, setEntries] = useState([]);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [defaultSchemaEntry, setDefaultSchemaEntry] = useState(null);
  const [editor, setEditor] = useState({
    specialSacramentName: "",
    documentsText: "",
    nonDocumentsText: "",
    fields: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fieldDeleteTarget, setFieldDeleteTarget] = useState("");
  const [fieldDeleteStep, setFieldDeleteStep] = useState("confirm");
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState("");
  const [openFieldIds, setOpenFieldIds] = useState([]);
  const [isAddFieldModalOpen, setIsAddFieldModalOpen] = useState(false);
  const [newFieldDraft, setNewFieldDraft] = useState({
    label: "",
    type: "text",
    required: true,
    accept: "",
    options: [],
  });
  const [newFieldOptionDraft, setNewFieldOptionDraft] = useState("");
  const [addFieldError, setAddFieldError] = useState("");
  const [isAddFieldConfirmOpen, setIsAddFieldConfirmOpen] = useState(false);
  const [pendingFieldPayload, setPendingFieldPayload] = useState(null);
  const [showAddTypeForm, setShowAddTypeForm] = useState(false);
  const [newSpecialSacramentName, setNewSpecialSacramentName] = useState("");
  const [isRequirementsModalOpen, setIsRequirementsModalOpen] = useState(false);
  const [isRequirementsSaveConfirmOpen, setIsRequirementsSaveConfirmOpen] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isNameSaveConfirmOpen, setIsNameSaveConfirmOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [typeDeleteTarget, setTypeDeleteTarget] = useState(null);
  const [requirementsEditor, setRequirementsEditor] = useState({
    documentsText: "",
    nonDocumentsText: "",
  });
  const [requirementDrafts, setRequirementDrafts] = useState({
    documents: "",
    nonDocuments: "",
  });
  const [requirementDeleteTarget, setRequirementDeleteTarget] = useState(null);
  const [isFieldSaveConfirmOpen, setIsFieldSaveConfirmOpen] = useState(false);
  const [fieldSaveStep, setFieldSaveStep] = useState("confirm");
  const [savePassword, setSavePassword] = useState("");
  const [savePasswordError, setSavePasswordError] = useState("");

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

  const selectedEntry = useMemo(() => {
    const normalizedSelectedId = String(selectedEntryId || "");
    return entries.find((entry) => String(entry?.s_sacramentID || "") === normalizedSelectedId) || null;
  }, [entries, selectedEntryId]);
  const isTemplateMode = !selectedEntry;
  const canEditSelectedSpecialSacramentName = Boolean(selectedEntry && !selectedEntry?.isTemplateOnly && Number(selectedEntry?.s_sacramentID) > 0);
  const selectedSpecialSacramentLabel = useMemo(
    () =>
      toTitleCase(
        editor.specialSacramentName ||
          selectedEntry?.specialSacramentName ||
          selectedEntry?.s_sacramentName ||
          selectedEntry?.displayLabel ||
          defaultSchemaEntry?.specialSacramentName ||
          defaultSchemaEntry?.displayLabel,
      ),
    [defaultSchemaEntry, editor.specialSacramentName, selectedEntry],
  );

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/admin-api/special-sacrament-form-schemas");
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload?.message || "Unable to load special sacrament schemas.");
      const normalized = Array.isArray(payload) ? payload : [];
      if (normalized.length > 0) {
        setEntries(normalized);
        setSelectedEntryId((current) => {
          const normalizedCurrentId = String(current || "");
          return normalized.some((entry) => String(entry?.s_sacramentID || "") === normalizedCurrentId)
            ? current
            : null;
        });
        return;
      }
      setEntries([]);
      setSelectedEntryId(null);
    } catch (loadError) {
      setEntries([]);
      setError(loadError.message || "Unable to load special sacrament schemas.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDefaultSchemaEntry = useCallback(async () => {
    try {
      const response = await fetch("/admin-api/special-sacrament-form-schema-default");
      if (!response.ok) {
        setDefaultSchemaEntry(null);
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object") {
        setDefaultSchemaEntry(null);
        return;
      }
      setDefaultSchemaEntry(payload);
    } catch {
      setDefaultSchemaEntry(null);
    }
  }, []);

  useEffect(() => {
    document.title = "Faithflow - Special Sacrament Form Schemas";
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
      void loadEntries();
      void loadDefaultSchemaEntry();
    }
  }, [accountType, loadEntries, loadDefaultSchemaEntry]);

  useEffect(() => {
    const programName = setupProgramName.toLowerCase();
    if (!programName || entries.length === 0) return;
    const match = entries.find((entry) =>
      [entry?.specialSacramentName, entry?.s_sacramentName, entry?.displayLabel].some(
        (value) => String(value || "").trim().toLowerCase() === programName,
      ),
    );
    if (match) setSelectedEntryId(match.s_sacramentID);
  }, [entries, setupProgramName]);

  useEffect(() => {
    if (!selectedEntry && !defaultSchemaEntry) {
      setEditor({
        specialSacramentName: "",
        documentsText: "",
        nonDocumentsText: "",
        fields: [],
      });
      setOpenFieldIds([]);
      return;
    }
    const schemaSource = selectedEntry?.formSchema || defaultSchemaEntry?.formSchema;
    const schema = normalizeSpecialFormSchema(schemaSource);
    setEditor({
      specialSacramentName: String(
        selectedEntry?.specialSacramentName ||
          selectedEntry?.s_sacramentName ||
          selectedEntry?.displayLabel ||
          defaultSchemaEntry?.specialSacramentName ||
          defaultSchemaEntry?.displayLabel ||
          "",
      ),
      documentsText: Array.isArray(schema.requirements?.documents) ? schema.requirements.documents.join("\n") : "",
      nonDocumentsText: Array.isArray(schema.requirements?.nonDocuments) ? schema.requirements.nonDocuments.join("\n") : "",
      fields: Array.isArray(schema.fields) ? schema.fields.map((field) => toFieldEditor(field)) : [],
    });
    setOpenFieldIds([]);
  }, [selectedEntry, defaultSchemaEntry]);

  const storedSchemaFields = useMemo(() => {
    const schemaSource = selectedEntry?.formSchema || defaultSchemaEntry?.formSchema;
    const schema = normalizeSpecialFormSchema(schemaSource);
    return Array.isArray(schema.fields) ? schema.fields : [];
  }, [defaultSchemaEntry, selectedEntry]);
  const normalizedEditorFields = useMemo(
    () => editor.fields.map((field, index) => toSchemaField(field, index)),
    [editor.fields],
  );
  const hasUnsavedFieldChanges = useMemo(
    () => JSON.stringify(normalizedEditorFields) !== JSON.stringify(storedSchemaFields),
    [normalizedEditorFields, storedSchemaFields],
  );

  if (!user || accountType !== "admin") return null;
  const isSchemaEmptyState = !isLoading && entries.length === 0;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const updateEditorField = (fieldIndex, key, value) => {
    setEditor((current) => ({
      ...current,
      fields: current.fields.map((field, index) => (index === fieldIndex ? { ...field, [key]: value } : field)),
    }));
  };

  const toggleFieldEditor = (fieldUiId) => {
    setOpenFieldIds((current) =>
      current.includes(fieldUiId) ? current.filter((currentId) => currentId !== fieldUiId) : [...current, fieldUiId],
    );
  };

  const moveEditorField = (fieldIndex, direction) => {
    setEditor((current) => {
      const nextIndex = direction === "up" ? fieldIndex - 1 : fieldIndex + 1;
      if (nextIndex < 0 || nextIndex >= current.fields.length) return current;
      const nextFields = [...current.fields];
      const [targetField] = nextFields.splice(fieldIndex, 1);
      nextFields.splice(nextIndex, 0, targetField);
      return {
        ...current,
        fields: nextFields,
      };
    });
  };

  const handleOpenAddFieldModal = () => {
    setAddFieldError("");
    setNewFieldDraft({
      label: "",
      type: "text",
      required: true,
      accept: "",
      options: [],
    });
    setNewFieldOptionDraft("");
    setIsAddFieldModalOpen(true);
  };

  const handleCloseAddFieldModal = () => {
    if (isSaving) return;
    setAddFieldError("");
    setIsAddFieldConfirmOpen(false);
    setPendingFieldPayload(null);
    setNewFieldDraft({
      label: "",
      type: "text",
      required: true,
      accept: "",
      options: [],
    });
    setNewFieldOptionDraft("");
    setIsAddFieldModalOpen(false);
  };

  const handleAddNewFieldOption = () => {
    const normalizedOption = toTitleCase(String(newFieldOptionDraft || "").trim());
    if (!normalizedOption) return;
    setNewFieldDraft((current) => {
      const hasExisting = current.options.some((item) => item.toLowerCase() === normalizedOption.toLowerCase());
      if (hasExisting) return current;
      return { ...current, options: [...current.options, normalizedOption] };
    });
    setNewFieldOptionDraft("");
    setAddFieldError("");
  };

  const handleRemoveNewFieldOption = (optionIndex) => {
    setNewFieldDraft((current) => ({
      ...current,
      options: current.options.filter((_item, index) => index !== optionIndex),
    }));
  };

  const buildFieldPayloadFromDraft = () => {
    const normalizedLabel = toTitleCase(String(newFieldDraft.label || "").trim());
    if (!normalizedLabel) {
      setAddFieldError("Field name is required.");
      return null;
    }
    if (newFieldDraft.type === "select" && newFieldDraft.options.length === 0) {
      setAddFieldError("Add at least one option for select type.");
      return null;
    }
    return {
      label: normalizedLabel,
      type: String(newFieldDraft.type || "text"),
      required: newFieldDraft.required !== false,
      key: toCamelCaseKey(normalizedLabel),
      placeholder: `Enter ${normalizedLabel}`,
      accept: newFieldDraft.type === "file" ? String(newFieldDraft.accept || "").trim() : "",
      optionsText: newFieldDraft.type === "select" ? newFieldDraft.options.join("\n") : "",
    };
  };

  const handleRequestCreateFieldFromModal = () => {
    const fieldPayload = buildFieldPayloadFromDraft();
    if (!fieldPayload) return;
    setAddFieldError("");
    setPendingFieldPayload(fieldPayload);
    setIsAddFieldConfirmOpen(true);
  };

  const handleCreateFieldFromModal = async () => {
    if (!pendingFieldPayload) return;
    const targetId = Number(selectedEntry?.s_sacramentID ?? selectedEntryId);
    const hasLinkedSpecialProgram = Number.isInteger(targetId) && targetId > 0;
    const nextFields = [...editor.fields, { ...createEmptyField(), ...pendingFieldPayload, uiId: createFieldUiId() }];
    const specialSacramentName = String(
      editor.specialSacramentName || selectedEntry?.specialSacramentName || selectedEntry?.s_sacramentName || selectedEntry?.displayLabel || "",
    ).trim();
    const payload = {
      specialSacramentName,
      displayLabel: specialSacramentName,
      formSchema: {
        version: 1,
        requirements: {
          documents: normalizeRequirementLines(editor.documentsText),
          nonDocuments: normalizeRequirementLines(editor.nonDocumentsText),
        },
        fields: nextFields.map((field, index) => toSchemaField(field, index)),
      },
    };
    setIsSaving(true);
    setError("");
    setNotice("");
    setAddFieldError("");
    const createdField = {
      ...createEmptyField(),
      ...pendingFieldPayload,
      uiId: createFieldUiId(),
    };
    try {
      let response = null;
      if (!hasLinkedSpecialProgram) {
        response = await fetch("/admin-api/special-sacrament-form-schema-default", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`/admin-api/special-sacraments/${targetId}/form-schema`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseData.message || "Unable to add field.");
      setEditor((current) => ({
        ...current,
        fields: [...current.fields, createdField],
      }));
      setOpenFieldIds((current) => [...current, createdField.uiId]);
      setNotice("Field added and saved.");
      handleCloseAddFieldModal();
      await loadEntries();
      await loadDefaultSchemaEntry();
    } catch (createError) {
      setAddFieldError(createError.message || "Unable to add field.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenRequirementsModal = () => {
    setRequirementDrafts({ documents: "", nonDocuments: "" });
    setRequirementDeleteTarget(null);
    setIsRequirementsSaveConfirmOpen(false);
    setRequirementsEditor({
      documentsText: editor.documentsText,
      nonDocumentsText: editor.nonDocumentsText,
    });
    setIsRequirementsModalOpen(true);
  };

  const handleOpenAddTypeModal = () => {
    setError("");
    setNotice("");
    setNewSpecialSacramentName("");
    setShowAddTypeForm(true);
  };

  const handleCreateSpecialSacramentType = async () => {
    const normalizedName = toTitleCase(String(newSpecialSacramentName || "").trim());
    if (!normalizedName) {
      setError("Provide a special sacrament name.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/admin-api/special-sacrament-form-schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specialSacramentName: normalizedName,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to create special sacrament schema.");
      }
      const createdEntryId = responseData?.specialSacrament?.s_sacramentID;
      if (createdEntryId) {
        setSelectedEntryId(createdEntryId);
      }
      setShowAddTypeForm(false);
      setNewSpecialSacramentName("");
      setNotice("Special sacrament schema created.");
      await loadEntries();
      await loadDefaultSchemaEntry();
    } catch (createError) {
      setError(createError.message || "Unable to create special sacrament schema.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveType = async (entry) => {
    const targetName = toTitleCase(
      String(entry?.specialSacramentName || entry?.s_sacramentName || entry?.displayLabel || "").trim(),
    );
    if (!targetName) {
      setError("Special sacrament type not found.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/admin-api/special-sacrament-form-schemas/${encodeURIComponent(targetName)}`, {
        method: "DELETE",
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to remove special sacrament type.");
      }
      setTypeDeleteTarget(null);
      setNotice("Special sacrament type removed.");
      await loadEntries();
      await loadDefaultSchemaEntry();
    } catch (removeError) {
      setError(removeError.message || "Unable to remove special sacrament type.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseRequirementsModal = () => {
    if (isSaving) return;
    setRequirementDrafts({ documents: "", nonDocuments: "" });
    setRequirementDeleteTarget(null);
    setIsRequirementsSaveConfirmOpen(false);
    setIsRequirementsModalOpen(false);
  };

  const handleOpenNameModal = () => {
    if (!canEditSelectedSpecialSacramentName) {
      setError("Select a scheduled special sacrament program to edit its name.");
      return;
    }
    setIsNameSaveConfirmOpen(false);
    setNameDraft(selectedSpecialSacramentLabel);
    setIsNameModalOpen(true);
  };

  const handleCloseNameModal = () => {
    if (isSaving) return;
    setIsNameSaveConfirmOpen(false);
    setNameDraft("");
    setIsNameModalOpen(false);
  };

  const handleRequirementDraftChange = (key, value) => {
    setRequirementDrafts((current) => ({ ...current, [key]: value }));
  };

  const normalizeRequirementLines = (value) =>
    String(value || "")
      .split("\n")
      .map((line) => toTitleCase(line.trim()))
      .filter(Boolean);

  const documentItems = normalizeRequirementLines(requirementsEditor.documentsText);
  const nonDocumentItems = normalizeRequirementLines(requirementsEditor.nonDocumentsText);

  const handleAddRequirement = (key) => {
    const draftValue = toTitleCase(String(requirementDrafts[key] || "").trim());
    if (!draftValue) return;
    setRequirementsEditor((current) => {
      const currentLines = normalizeRequirementLines(key === "documents" ? current.documentsText : current.nonDocumentsText);
      const nextLines = [...currentLines, draftValue];
      return {
        ...current,
        [key === "documents" ? "documentsText" : "nonDocumentsText"]: nextLines.join("\n"),
      };
    });
    setRequirementDrafts((current) => ({ ...current, [key]: "" }));
  };

  const handleRemoveRequirement = (key, targetIndex) => {
    setRequirementsEditor((current) => {
      const currentLines = normalizeRequirementLines(key === "documents" ? current.documentsText : current.nonDocumentsText);
      const nextLines = currentLines.filter((_line, index) => index !== targetIndex);
      return {
        ...current,
        [key === "documents" ? "documentsText" : "nonDocumentsText"]: nextLines.join("\n"),
      };
    });
  };

  const handleRequestRemoveRequirement = (key, targetIndex, label) => {
    setRequirementDeleteTarget({ key, targetIndex, label: String(label || "").trim() });
  };

  const saveSpecialSacramentName = async () => {
    const targetId = Number(selectedEntry?.s_sacramentID ?? selectedEntryId);
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      if (!canEditSelectedSpecialSacramentName || !Number.isInteger(targetId) || targetId <= 0) {
        throw new Error("Select a scheduled special sacrament program first.");
      }
      const specialSacramentName = toTitleCase(String(nameDraft || "").trim());
      if (!specialSacramentName) {
        throw new Error("Provide a special sacrament name.");
      }
      const response = await fetch(`/admin-api/special-sacraments/${targetId}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialSacramentName }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseData.message || "Unable to save special sacrament name.");
      setEditor((current) => ({ ...current, specialSacramentName }));
      setNotice("Special sacrament name updated.");
      handleCloseNameModal();
      await loadEntries();
      await loadDefaultSchemaEntry();
    } catch (saveError) {
      setError(saveError.message || "Unable to save special sacrament name.");
    } finally {
      setIsSaving(false);
    }
  };

  const persistSchemaFields = async (nextEditorFields, successMessage) => {
    const targetId = Number(selectedEntry?.s_sacramentID ?? selectedEntryId);
    const hasLinkedSpecialProgram = Number.isInteger(targetId) && targetId > 0;
    const specialSacramentName = String(
      editor.specialSacramentName || selectedEntry?.specialSacramentName || selectedEntry?.s_sacramentName || selectedEntry?.displayLabel || "",
    ).trim();
    if (!specialSacramentName && !hasLinkedSpecialProgram) {
      throw new Error("Select a special sacrament schema first.");
    }
    const payload = {
      specialSacramentName,
      displayLabel: specialSacramentName,
      formSchema: {
        version: 1,
        requirements: {
          documents: normalizeRequirementLines(editor.documentsText),
          nonDocuments: normalizeRequirementLines(editor.nonDocumentsText),
        },
        fields: nextEditorFields.map((field, index) => toSchemaField(field, index)),
      },
    };
    const response = hasLinkedSpecialProgram
      ? await fetch(`/admin-api/special-sacraments/${targetId}/form-schema`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/admin-api/special-sacrament-form-schema-default", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseData.message || "Unable to save field changes.");
    }
    setNotice(successMessage);
    await loadEntries();
    await loadDefaultSchemaEntry();
  };

  const closeFieldSaveModal = () => {
    setIsFieldSaveConfirmOpen(false);
    setFieldSaveStep("confirm");
    setSavePassword("");
    setSavePasswordError("");
  };

  const saveFieldChanges = async () => {
    const password = savePassword;
    if (!password.trim()) {
      setSavePasswordError("Enter the admin password.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    setSavePasswordError("");
    try {
      const verifyResponse = await fetch("/admin-api/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const verifyData = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) {
        setSavePasswordError(verifyData.message || "Password does not match the admin account.");
        return;
      }
      await persistSchemaFields(editor.fields, "Field changes saved.");
      closeFieldSaveModal();
    } catch (saveError) {
      setError(saveError.message || "Unable to save field changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const closeFieldDeleteModal = () => {
    setFieldDeleteTarget("");
    setFieldDeleteStep("confirm");
    setDeletePassword("");
    setDeletePasswordError("");
  };

  const handleConfirmRemoveField = async () => {
    const targetUiId = fieldDeleteTarget;
    if (!targetUiId) return;
    const password = deletePassword;
    if (!password.trim()) {
      setDeletePasswordError("Enter the admin password.");
      return;
    }
    const remainingFields = editor.fields.filter((field) => field.uiId !== targetUiId);
    setIsSaving(true);
    setError("");
    setNotice("");
    setDeletePasswordError("");
    try {
      const verifyResponse = await fetch("/admin-api/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const verifyData = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) {
        setDeletePasswordError(verifyData.message || "Password does not match the admin account.");
        return;
      }
      await persistSchemaFields(remainingFields, "Field removed.");
      setEditor((current) => ({ ...current, fields: remainingFields }));
      setOpenFieldIds((current) => current.filter((fieldUiId) => fieldUiId !== targetUiId));
      closeFieldDeleteModal();
    } catch (deleteError) {
      setError(deleteError.message || "Unable to remove field.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveRequirementsOnly = async () => {
    const targetId = Number(selectedEntry?.s_sacramentID ?? selectedEntryId);
    const hasLinkedSpecialProgram = Number.isInteger(targetId) && targetId > 0;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const specialSacramentName = String(
        editor.specialSacramentName || selectedEntry?.specialSacramentName || selectedEntry?.s_sacramentName || selectedEntry?.displayLabel || "",
      ).trim();
      const payload = {
        specialSacramentName,
        displayLabel: specialSacramentName,
        formSchema: {
          version: 1,
          requirements: {
            documents: documentItems,
            nonDocuments: nonDocumentItems,
          },
          fields: editor.fields.map((field, index) => toSchemaField(field, index)),
        },
      };
      let response = null;
      if (!hasLinkedSpecialProgram) {
        response = await fetch("/admin-api/special-sacrament-form-schema-default", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`/admin-api/special-sacraments/${targetId}/form-schema`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseData.message || "Unable to save special sacrament requirements.");
      setEditor((current) => ({
        ...current,
        documentsText: requirementsEditor.documentsText,
        nonDocumentsText: requirementsEditor.nonDocumentsText,
      }));
      setNotice("Requirements saved.");
      handleCloseRequirementsModal();
      await loadEntries();
      await loadDefaultSchemaEntry();
    } catch (saveError) {
      setError(saveError.message || "Unable to save special sacrament requirements.");
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
              <h2>Special Sacrament Form Manager <PageGuide pageKey="special-sacrament-form-manager" /></h2>
            </div>
            <button type="button" className="progress-template-btn progress-template-btn--hero" onClick={() => navigate("/admin/special-programs")}>
              Back
            </button>
          </section>

          <section
            className={`dashboard-panel sacrament-schema-layout sacrament-form-manager-layout${
              isSchemaEmptyState ? " sacrament-schema-layout--empty" : selectedEntryId ? " is-editor-open" : " is-list-only"
            }`}
          >
            {isLoading ? (
              <p>Loading schemas...</p>
            ) : entries.length === 0 ? (
              <div className="sacrament-schema-single-empty-state" role="status">
                <div className="sacrament-schema-editor-empty-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3 className="sacrament-schema-editor-empty-title">No requests yet</h3>
                <p className="sacrament-schema-editor-empty-text">
                  Special sacrament form schemas will appear here once you add a special program.
                </p>
                <button
                  type="button"
                  className="progress-template-btn"
                  onClick={handleOpenAddTypeModal}
                  disabled={isSaving}
                >
                  Add a Special Program Form
                </button>
              </div>
            ) : (
              <>
            <aside className="sacrament-schema-list sacrament-form-manager-list">
              <div className="sacrament-schema-list-header">
                <h3>Special Sacrament Types</h3>
              </div>
                <ul>
                  {entries.map((entry) => {
                    const isSelected = String(entry?.s_sacramentID || "") === String(selectedEntryId || "");
                    return (
                      <li key={`special-schema-${entry.s_sacramentID}`}>
                        <div
                          className={`sacrament-schema-item ${isSelected ? "is-selected" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedEntryId(entry.s_sacramentID);
                            setNotice("");
                            setError("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedEntryId(entry.s_sacramentID);
                              setNotice("");
                              setError("");
                            }
                          }}
                        >
                          <div className="sacrament-schema-item-main">
                            <strong>{entry.specialSacramentName || entry.s_sacramentName || entry.displayLabel || `Program ${entry.s_sacramentID}`}</strong>
                          </div>
                          <div className="sacrament-schema-item-actions">
                            <button
                              type="button"
                              className="sacrament-schema-item-action sacrament-schema-item-action--danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                setTypeDeleteTarget(entry);
                              }}
                              disabled={isSaving}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
            </aside>

            {selectedEntryId ? (
            <section className="sacrament-schema-editor sacrament-form-manager-editor" aria-live="polite">
              {entries.length === 0 ? (
                <div className="sacrament-schema-editor-empty-state" role="status">
                  <div className="sacrament-schema-editor-empty-icon" aria-hidden="true">
                    <Inbox size={36} strokeWidth={1.5} />
                  </div>
                  <h3 className="sacrament-schema-editor-empty-title">No requests yet</h3>
                  <p className="sacrament-schema-editor-empty-text">
                    Special sacrament form schemas will appear here once you add a special program.
                  </p>
                </div>
              ) : (
                <>
                  <div className="sacrament-schema-editor-header">
                    <h3 className="sacrament-schema-editor-title">
                      <span>{selectedSpecialSacramentLabel}</span>
                      <button
                        type="button"
                        className="sacrament-schema-edit-icon-button"
                        aria-label={`Edit ${selectedSpecialSacramentLabel}`}
                        title={`Edit ${selectedSpecialSacramentLabel}`}
                        onClick={handleOpenNameModal}
                        disabled={isSaving}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                    </h3>
                    <div className="sacrament-schema-editor-actions">
                      {isProgramSetup ? (
                        <button
                          type="button"
                          className="sacrament-theme-btn sacrament-theme-btn--primary"
                          onClick={() =>
                            navigate(
                              `/admin/progress-templates?program=${encodeURIComponent(setupProgramName)}&setup=1`,
                            )
                          }
                        >
                          Continue to progress steps
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="sacrament-theme-btn sacrament-theme-btn--quiet"
                        onClick={handleOpenRequirementsModal}
                        disabled={isSaving}
                      >
                        Edit Requirements
                      </button>
                      <button
                        type="button"
                        className="sacrament-theme-btn sacrament-theme-btn--primary"
                        onClick={handleOpenAddFieldModal}
                        disabled={isSaving}
                      >
                        <Plus size={15} aria-hidden="true" />
                        Add Field
                      </button>
                    </div>
                  </div>
                  <div className="template-steps-header sacrament-questions-heading">
                    <h4>Questions on the form</h4>
                    {isProgramSetup ? (
                      <p>Set the questions for {selectedSpecialSacramentLabel}, then continue to its progress steps. This form stays here for the next time you schedule this program.</p>
                    ) : null}
                  </div>
                  <p className="sacrament-schema-hint">
                    These are the questions a parishioner answers for this special program. Use a clear name, then choose what kind of answer you need.
                  </p>

                  <div className="sacrament-schema-fields-list">
                    {editor.fields.map((field, index) => (
                      <article key={field.uiId || `special-schema-field-${index}`} className="sacrament-schema-field-card">
                        <header className="sacrament-schema-field-card-header">
                          <div className="sacrament-schema-field-card-title">
                            <h5>{field.label || `Field ${index + 1}`}</h5>
                            <span>Position {index + 1}</span>
                          </div>
                          <div className="sacrament-schema-field-card-actions">
                            <button
                              type="button"
                              className="sacrament-schema-card-edit-toggle"
                              onClick={() => toggleFieldEditor(field.uiId)}
                              aria-expanded={openFieldIds.includes(field.uiId)}
                            >
                              {openFieldIds.includes(field.uiId) ? (
                                <>
                                  <ChevronUp size={14} aria-hidden="true" />
                                  Hide Edit
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={14} aria-hidden="true" />
                                  Edit Field
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              className="sacrament-schema-row-action"
                              onClick={() => moveEditorField(index, "up")}
                              disabled={index === 0}
                              aria-label={`Move ${field.label || `field ${index + 1}`} up`}
                              title="Move up"
                            >
                              <ArrowUp size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="sacrament-schema-row-action"
                              onClick={() => moveEditorField(index, "down")}
                              disabled={index === editor.fields.length - 1}
                              aria-label={`Move ${field.label || `field ${index + 1}`} down`}
                              title="Move down"
                            >
                              <ArrowDown size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="sacrament-schema-row-action sacrament-schema-row-action--danger"
                              onClick={() => setFieldDeleteTarget(field.uiId)}
                              disabled={editor.fields.length <= 1}
                              aria-label={`Remove ${field.label || `field ${index + 1}`}`}
                              title="Remove field"
                            >
                              <X size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </header>
                        {openFieldIds.includes(field.uiId) ? (
                          <>
                            <div className="sacrament-schema-field-grid sacrament-schema-field-grid--compact">
                              <label>
                                Question
                                <input
                                  value={field.label}
                                  onChange={(event) => {
                                    const nextLabel = toTitleCase(event.target.value);
                                    updateEditorField(index, "label", nextLabel);
                                    updateEditorField(index, "key", toCamelCaseKey(nextLabel));
                                    updateEditorField(index, "placeholder", nextLabel ? `Enter ${nextLabel}` : "");
                                  }}
                                  placeholder="Phone Number"
                                />
                              </label>
                              <label>
                                Kind of answer
                                <select
                                  value={normalizeFieldType(field.type)}
                                  onChange={(event) => updateEditorField(index, "type", normalizeFieldType(event.target.value))}
                                >
                                  {FIELD_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {FIELD_TYPE_LABELS[type] || type}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <label className="sacrament-add-field-required sacrament-edit-field-required">
                              <input
                                type="checkbox"
                                checked={field.required !== false}
                                onChange={(event) => updateEditorField(index, "required", event.target.checked)}
                              />
                              <span>Required. Leave this unchecked if the parishioner may skip this question.</span>
                            </label>
                            {field.type === "file" || field.type === "select" ? (
                              <div className="sacrament-schema-advanced-settings">
                                {field.type === "file" ? (
                                  <label>
                                    Allowed file types
                                    <input
                                      value={field.accept}
                                      onChange={(event) => updateEditorField(index, "accept", event.target.value)}
                                      placeholder=".pdf,.docx,image/*"
                                    />
                                  </label>
                                ) : null}
                                {field.type === "select" ? (
                                  <label className="sacrament-schema-options-block">
                                    Select options (one per line)
                                    <textarea
                                      rows={3}
                                      value={field.optionsText}
                                      onChange={(event) => updateEditorField(index, "optionsText", toTitleCaseLines(event.target.value))}
                                      placeholder="Option 1"
                                    />
                                  </label>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </article>
                    ))}
                  </div>
                  {hasUnsavedFieldChanges ? (
                    <div className="sacrament-schema-field-save-actions">
                      <button
                        type="button"
                        className="progress-template-btn"
                        onClick={() => {
                          setFieldSaveStep("confirm");
                          setSavePassword("");
                          setSavePasswordError("");
                          setIsFieldSaveConfirmOpen(true);
                        }}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
            ) : null}
              </>
            )}
          </section>
        </section>
      </div>

      {fieldDeleteTarget
        ? createPortal(
            <div className="template-delete-modal-overlay" role="presentation" onClick={closeFieldDeleteModal}>
              <section className="template-delete-modal" role="dialog" aria-modal="true" aria-label="Remove question confirmation" onClick={(event) => event.stopPropagation()}>
                <div className="template-delete-modal-body">
                  <span className="template-delete-modal-icon" aria-hidden="true">
                    <AlertTriangle size={24} />
                  </span>
                  <h4>Remove this question?</h4>
                  <p>
                    {editor.fields.find((field) => field.uiId === fieldDeleteTarget)?.label || "This question"} will be removed from the request form.
                    {fieldDeleteStep === "password" ? " Enter the admin password to confirm." : ""}
                  </p>
                  {fieldDeleteStep === "password" ? (
                    <>
                      <label className="sacrament-delete-password">
                        Admin password
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={deletePassword}
                          onChange={(event) => {
                            setDeletePassword(event.target.value);
                            setDeletePasswordError("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleConfirmRemoveField();
                            }
                          }}
                          disabled={isSaving}
                        />
                      </label>
                      {deletePasswordError ? <p className="sacrament-delete-password-error">{deletePasswordError}</p> : null}
                    </>
                  ) : null}
                </div>
                <div className="template-delete-modal-actions">
                  <button type="button" className="template-modal-btn secondary" onClick={closeFieldDeleteModal} disabled={isSaving}>
                    Cancel
                  </button>
                  {fieldDeleteStep === "password" ? (
                    <button type="button" className="template-modal-btn danger" onClick={() => void handleConfirmRemoveField()} disabled={isSaving}>
                      {isSaving ? "Removing..." : "Remove"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="template-modal-btn danger"
                      onClick={() => {
                        setDeletePassword("");
                        setDeletePasswordError("");
                        setFieldDeleteStep("password");
                      }}
                    >
                      Yes
                    </button>
                  )}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
      {isAddFieldModalOpen ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={handleCloseAddFieldModal}>
          <section
            className="template-delete-modal sacrament-schema-add-type-modal sacrament-add-field-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add field"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sacrament-colored-modal-header">
              <h4>Add a question</h4>
              <button
                type="button"
                className="sacrament-colored-modal-close"
                onClick={handleCloseAddFieldModal}
                disabled={isSaving}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="sacrament-schema-add-type">
              <p className="sacrament-colored-modal-note">Name the question, then it is added to this form.</p>
              <label>
                Question
                <input
                  value={newFieldDraft.label}
                  onChange={(event) =>
                    setNewFieldDraft((current) => ({ ...current, label: toTitleCase(event.target.value) }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRequestCreateFieldFromModal();
                    }
                  }}
                  placeholder="e.g. Contact Number"
                  autoFocus
                />
              </label>
              <label>
                Kind of answer
                <select
                  value={newFieldDraft.type}
                  onChange={(event) =>
                    setNewFieldDraft((current) => {
                      const nextType = event.target.value;
                      return {
                        ...current,
                        type: nextType,
                        accept: nextType === "file" ? current.accept : "",
                        options: nextType === "select" ? current.options : [],
                      };
                    })
                  }
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={`new-field-type-${type}`} value={type}>
                      {FIELD_TYPE_LABELS[type] || type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sacrament-add-field-required">
                <input
                  type="checkbox"
                  checked={newFieldDraft.required !== false}
                  onChange={(event) => setNewFieldDraft((current) => ({ ...current, required: event.target.checked }))}
                />
                <span>Required. Leave this unchecked if the parishioner may skip this question.</span>
              </label>
              {newFieldDraft.type === "file" ? (
                <label>
                  Allowed file types
                  <input
                    value={newFieldDraft.accept}
                    onChange={(event) =>
                      setNewFieldDraft((current) => ({ ...current, accept: event.target.value }))
                    }
                    placeholder=".pdf,.docx,image/*"
                  />
                </label>
              ) : null}
              {newFieldDraft.type === "select" ? (
                <label>
                  Add option
                  <div className="sacrament-add-field-option-row">
                    <input
                      value={newFieldOptionDraft}
                      onChange={(event) => setNewFieldOptionDraft(toTitleCase(event.target.value))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddNewFieldOption();
                        }
                      }}
                      placeholder="Option 1"
                    />
                    <button type="button" className="sacrament-add-field-option-btn" onClick={handleAddNewFieldOption}>
                      Add
                    </button>
                  </div>
                  <div className="sacrament-add-field-option-list" role="list">
                    {newFieldDraft.options.length > 0 ? (
                      newFieldDraft.options.map((option, optionIndex) => (
                        <span key={`new-select-option-${option}-${optionIndex}`} className="sacrament-add-field-option-chip" role="listitem">
                          {option}
                          <button
                            type="button"
                            className="sacrament-add-field-option-remove"
                            onClick={() => handleRemoveNewFieldOption(optionIndex)}
                            aria-label={`Remove option ${option}`}
                          >
                            <X size={12} aria-hidden="true" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="sacrament-add-field-option-empty">No options added yet.</span>
                    )}
                  </div>
                </label>
              ) : null}
              {addFieldError ? <p className="sacrament-add-field-error">{addFieldError}</p> : null}
            </div>
            <div className="template-delete-modal-actions sacrament-colored-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={handleCloseAddFieldModal} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn danger" onClick={handleRequestCreateFieldFromModal} disabled={isSaving}>
                Add Field
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isAddFieldConfirmOpen ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && setIsAddFieldConfirmOpen(false)}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add field confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Add this field?</h4>
              <p>This will add the field to the selected special sacrament schema.</p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setIsAddFieldConfirmOpen(false)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn danger" onClick={() => void handleCreateFieldFromModal()} disabled={isSaving}>
                {isSaving ? "Adding..." : "Confirm Add"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showAddTypeForm ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && setShowAddTypeForm(false)}>
          <section
            className="template-delete-modal sacrament-schema-add-type-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add special sacrament type"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <h4>Add Special Sacrament Type</h4>
              <p>Enter a special sacrament name to create a schema template entry.</p>
            </div>
            <div className="sacrament-schema-add-type">
              <label>
                Special Sacrament Name
                <input
                  value={newSpecialSacramentName}
                  onChange={(event) => setNewSpecialSacramentName(toTitleCase(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreateSpecialSacramentType();
                    }
                  }}
                  placeholder="Kasalan Ng Bayan"
                  disabled={isSaving}
                  autoFocus
                />
              </label>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setShowAddTypeForm(false)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn danger" onClick={() => void handleCreateSpecialSacramentType()} disabled={isSaving}>
                {isSaving ? "Creating..." : "Create Type"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {typeDeleteTarget ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && setTypeDeleteTarget(null)}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove special sacrament type confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Remove this special sacrament type?</h4>
              <p>This removes its custom special sacrament form schema settings.</p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setTypeDeleteTarget(null)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn danger" onClick={() => void handleRemoveType(typeDeleteTarget)} disabled={isSaving}>
                {isSaving ? "Removing..." : "Remove Type"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isRequirementsModalOpen ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={handleCloseRequirementsModal}>
          <section
            className="template-delete-modal sacrament-requirements-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit requirements"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sacrament-requirements-modal-topbar">
              <div className="template-delete-modal-body sacrament-requirements-modal-heading">
                <h4>Edit Requirements</h4>
                <p>Manage what users will see before they continue to appointment details.</p>
              </div>
              <button
                type="button"
                className="sacrament-requirements-modal-close"
                onClick={handleCloseRequirementsModal}
                aria-label="Close requirements modal"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <section className="sacrament-schema-preview" aria-label="User interface preview">
              <div className="sacrament-schema-preview-header">
                <h4>User UI Preview</h4>
                <span className="sacrament-schema-preview-badge">{toTitleCase(editor.specialSacramentName || selectedEntry?.specialSacramentName || selectedEntry?.s_sacramentName || selectedEntry?.displayLabel || "")}</span>
              </div>
              <p className="sacrament-schema-preview-lead">
                This is how requirement groups will appear to users before they continue to appointment details.
              </p>
              <div className="sacrament-schema-preview-columns">
                <article className="sacrament-schema-preview-card sacrament-schema-preview-card--documents">
                  <div className="sacrament-schema-preview-card-head">
                    <span className="sacrament-schema-preview-card-icon" aria-hidden="true">
                      <FileText size={18} />
                    </span>
                    <div>
                      <h5>Required documents</h5>
                      <p>Pass requirement onsite</p>
                    </div>
                  </div>
                  <ul className="sacrament-schema-preview-list">
                    {documentItems.length > 0 ? (
                      documentItems.map((item, index) => (
                        <li key={`preview-document-${item}-${index}`}>
                          <span className="sacrament-schema-preview-list-main">
                            <CheckCircle2 size={14} aria-hidden="true" />
                            <span>{item}</span>
                          </span>
                          <button
                            type="button"
                            className="sacrament-schema-preview-remove"
                            aria-label={`Remove ${item}`}
                            onClick={() => handleRequestRemoveRequirement("documents", index, item)}
                            disabled={isSaving}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="sacrament-schema-preview-empty">No document requirements listed.</li>
                    )}
                  </ul>
                </article>
                <article className="sacrament-schema-preview-card sacrament-schema-preview-card--steps">
                  <div className="sacrament-schema-preview-card-head">
                    <span className="sacrament-schema-preview-card-icon sacrament-schema-preview-card-icon--steps" aria-hidden="true">
                      <ClipboardList size={18} />
                    </span>
                    <div>
                      <h5>Non-document requirements</h5>
                      <p>Seminars and interviews</p>
                    </div>
                  </div>
                  <ul className="sacrament-schema-preview-list sacrament-schema-preview-list--steps">
                    {nonDocumentItems.length > 0 ? (
                      nonDocumentItems.map((item, index) => (
                        <li key={`preview-non-document-${item}-${index}`}>
                          <span className="sacrament-schema-preview-list-main">
                            <CheckCircle2 size={14} aria-hidden="true" />
                            <span>{item}</span>
                          </span>
                          <button
                            type="button"
                            className="sacrament-schema-preview-remove"
                            aria-label={`Remove ${item}`}
                            onClick={() => handleRequestRemoveRequirement("nonDocuments", index, item)}
                            disabled={isSaving}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="sacrament-schema-preview-empty">No non-document requirements listed.</li>
                    )}
                  </ul>
                </article>
              </div>
            </section>
            <div className="sacrament-schema-preview-inputs">
              <div className="sacrament-schema-quick-add-card">
                <label htmlFor="quick-add-required-document" className="sacrament-schema-quick-add-title">
                  Add required document
                </label>
                <div className="sacrament-schema-preview-input-row sacrament-schema-requirement-input-row">
                  <input
                    id="quick-add-required-document"
                    value={requirementDrafts.documents}
                    onChange={(event) => handleRequirementDraftChange("documents", toTitleCase(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddRequirement("documents");
                      }
                    }}
                    placeholder="e.g. Cenomar"
                    disabled={isSaving}
                  />
                  <button type="button" className="sacrament-schema-quick-add-btn" onClick={() => handleAddRequirement("documents")} disabled={isSaving}>
                    Add
                  </button>
                </div>
              </div>
              <div className="sacrament-schema-quick-add-card">
                <label htmlFor="quick-add-non-document" className="sacrament-schema-quick-add-title">
                  Add non-document requirement
                </label>
                <div className="sacrament-schema-preview-input-row sacrament-schema-requirement-input-row">
                  <input
                    id="quick-add-non-document"
                    value={requirementDrafts.nonDocuments}
                    onChange={(event) => handleRequirementDraftChange("nonDocuments", toTitleCase(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddRequirement("nonDocuments");
                      }
                    }}
                    placeholder="e.g. Orientation"
                    disabled={isSaving}
                  />
                  <button type="button" className="sacrament-schema-quick-add-btn" onClick={() => handleAddRequirement("nonDocuments")} disabled={isSaving}>
                    Add
                  </button>
                </div>
              </div>
            </div>
            <div className="sacrament-requirements-modal-actions">
              <button type="button" className="progress-template-btn" onClick={() => setIsRequirementsSaveConfirmOpen(true)} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {requirementDeleteTarget ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => setRequirementDeleteTarget(null)}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove requirement confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Remove this requirement?</h4>
              <p>{requirementDeleteTarget.label || "This requirement"} will be removed after you save changes.</p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setRequirementDeleteTarget(null)} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="template-modal-btn danger"
                onClick={() => {
                  handleRemoveRequirement(requirementDeleteTarget.key, requirementDeleteTarget.targetIndex);
                  setRequirementDeleteTarget(null);
                }}
                disabled={isSaving}
              >
                Remove Requirement
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isRequirementsSaveConfirmOpen ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && setIsRequirementsSaveConfirmOpen(false)}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save requirement changes confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Save requirement changes?</h4>
              <p>This will apply the updated requirements to the selected special sacrament program.</p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setIsRequirementsSaveConfirmOpen(false)} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="template-modal-btn danger"
                onClick={() => {
                  setIsRequirementsSaveConfirmOpen(false);
                  void saveRequirementsOnly();
                }}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isNameModalOpen ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={handleCloseNameModal}>
          <section
            className="template-delete-modal sacrament-schema-add-type-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit special sacrament name"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <h4>Edit Special Sacrament Name</h4>
              <p>Update the special sacrament name used by this schema.</p>
            </div>
            <div className="sacrament-schema-add-type">
              <label>
                Special Sacrament Name
                <input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(toTitleCase(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setIsNameSaveConfirmOpen(true);
                    }
                  }}
                  placeholder="Special Sacrament Name"
                  disabled={isSaving}
                  autoFocus
                />
              </label>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={handleCloseNameModal} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn danger" onClick={() => setIsNameSaveConfirmOpen(true)} disabled={isSaving}>
                Continue
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isNameSaveConfirmOpen ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && setIsNameSaveConfirmOpen(false)}>
          <section className="template-delete-modal" role="dialog" aria-modal="true" aria-label="Save schema confirmation" onClick={(event) => event.stopPropagation()}>
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Save special sacrament name?</h4>
              <p>This will update the selected special sacrament schema name.</p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setIsNameSaveConfirmOpen(false)} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="template-modal-btn danger"
                onClick={() => {
                  setIsNameSaveConfirmOpen(false);
                  void saveSpecialSacramentName();
                }}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Name"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isRequirementsModalOpen ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={handleCloseRequirementsModal}>
          <section
            className="template-delete-modal sacrament-requirements-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit requirements"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sacrament-requirements-modal-topbar">
              <div className="template-delete-modal-body sacrament-requirements-modal-heading">
                <h4>Edit Requirements</h4>
                <p>Manage what users will see before they continue to appointment details.</p>
              </div>
              <button
                type="button"
                className="sacrament-requirements-modal-close"
                onClick={handleCloseRequirementsModal}
                aria-label="Close requirements modal"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <section className="sacrament-schema-preview" aria-label="User interface preview">
              <div className="sacrament-schema-preview-header">
                <h4>User UI Preview</h4>
                <span className="sacrament-schema-preview-badge">
                  {toTitleCase(
                    editor.specialSacramentName ||
                      selectedEntry?.specialSacramentName ||
                      selectedEntry?.s_sacramentName ||
                      selectedEntry?.displayLabel ||
                      "",
                  )}
                </span>
              </div>
              <p className="sacrament-schema-preview-lead">
                This is how requirement groups will appear to users before they continue to appointment details.
              </p>
              <div className="sacrament-schema-preview-columns">
                <article className="sacrament-schema-preview-card sacrament-schema-preview-card--documents">
                  <div className="sacrament-schema-preview-card-head">
                    <span className="sacrament-schema-preview-card-icon" aria-hidden="true">
                      <FileText size={18} />
                    </span>
                    <div>
                      <h5>Required documents</h5>
                      <p>Pass requirement onsite</p>
                    </div>
                  </div>
                  <ul className="sacrament-schema-preview-list">
                    {documentItems.length > 0 ? (
                      documentItems.map((item, index) => (
                        <li key={`preview-document-${item}-${index}`}>
                          <span className="sacrament-schema-preview-list-main">
                            <CheckCircle2 size={14} aria-hidden="true" />
                            <span>{item}</span>
                          </span>
                          <button
                            type="button"
                            className="sacrament-schema-preview-remove"
                            aria-label={`Remove ${item}`}
                            onClick={() => handleRequestRemoveRequirement("documents", index, item)}
                            disabled={isSaving}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="sacrament-schema-preview-empty">No document requirements listed.</li>
                    )}
                  </ul>
                </article>
                <article className="sacrament-schema-preview-card sacrament-schema-preview-card--steps">
                  <div className="sacrament-schema-preview-card-head">
                    <span className="sacrament-schema-preview-card-icon sacrament-schema-preview-card-icon--steps" aria-hidden="true">
                      <ClipboardList size={18} />
                    </span>
                    <div>
                      <h5>Non-document requirements</h5>
                      <p>Seminars and interviews</p>
                    </div>
                  </div>
                  <ul className="sacrament-schema-preview-list sacrament-schema-preview-list--steps">
                    {nonDocumentItems.length > 0 ? (
                      nonDocumentItems.map((item, index) => (
                        <li key={`preview-non-document-${item}-${index}`}>
                          <span className="sacrament-schema-preview-list-main">
                            <CheckCircle2 size={14} aria-hidden="true" />
                            <span>{item}</span>
                          </span>
                          <button
                            type="button"
                            className="sacrament-schema-preview-remove"
                            aria-label={`Remove ${item}`}
                            onClick={() => handleRequestRemoveRequirement("nonDocuments", index, item)}
                            disabled={isSaving}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="sacrament-schema-preview-empty">No non-document requirements listed.</li>
                    )}
                  </ul>
                </article>
              </div>
            </section>
            <div className="sacrament-schema-preview-inputs">
              <div className="sacrament-schema-quick-add-card">
                <label htmlFor="special-quick-add-required-document" className="sacrament-schema-quick-add-title">
                  Add required document
                </label>
                <div className="sacrament-schema-preview-input-row sacrament-schema-requirement-input-row">
                  <input
                    id="special-quick-add-required-document"
                    value={requirementDrafts.documents}
                    onChange={(event) => handleRequirementDraftChange("documents", toTitleCase(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddRequirement("documents");
                      }
                    }}
                    placeholder="e.g. Cenomar"
                    disabled={isSaving}
                  />
                  <button type="button" className="sacrament-schema-quick-add-btn" onClick={() => handleAddRequirement("documents")} disabled={isSaving}>
                    Add
                  </button>
                </div>
              </div>
              <div className="sacrament-schema-quick-add-card">
                <label htmlFor="special-quick-add-non-document" className="sacrament-schema-quick-add-title">
                  Add non-document requirement
                </label>
                <div className="sacrament-schema-preview-input-row sacrament-schema-requirement-input-row">
                  <input
                    id="special-quick-add-non-document"
                    value={requirementDrafts.nonDocuments}
                    onChange={(event) => handleRequirementDraftChange("nonDocuments", toTitleCase(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddRequirement("nonDocuments");
                      }
                    }}
                    placeholder="e.g. Pre-Cana Seminar"
                    disabled={isSaving}
                  />
                  <button type="button" className="sacrament-schema-quick-add-btn" onClick={() => handleAddRequirement("nonDocuments")} disabled={isSaving}>
                    Add
                  </button>
                </div>
              </div>
            </div>
            <div className="sacrament-requirements-modal-actions">
              <button type="button" className="progress-template-btn" onClick={() => setIsRequirementsSaveConfirmOpen(true)} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {requirementDeleteTarget ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => setRequirementDeleteTarget(null)}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove requirement confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Remove this requirement?</h4>
              <p>{requirementDeleteTarget.label || "This requirement"} will be removed after you save changes.</p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setRequirementDeleteTarget(null)} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="template-modal-btn danger"
                onClick={() => {
                  handleRemoveRequirement(requirementDeleteTarget.key, requirementDeleteTarget.targetIndex);
                  setRequirementDeleteTarget(null);
                }}
                disabled={isSaving}
              >
                Remove Requirement
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isRequirementsSaveConfirmOpen ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && setIsRequirementsSaveConfirmOpen(false)}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save requirement changes confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Save requirement changes?</h4>
              <p>This will apply the updated requirements to the selected special sacrament program.</p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setIsRequirementsSaveConfirmOpen(false)} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="template-modal-btn danger"
                onClick={() => {
                  setIsRequirementsSaveConfirmOpen(false);
                  void saveRequirementsOnly();
                }}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isFieldSaveConfirmOpen ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && closeFieldSaveModal()}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save field changes confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Save field changes?</h4>
              <p>
                This will apply the updated questions to this special sacrament.
                {fieldSaveStep === "password" ? " Enter the admin password to confirm." : ""}
              </p>
              {fieldSaveStep === "password" ? (
                <>
                  <label className="sacrament-delete-password">
                    Admin password
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={savePassword}
                      onChange={(event) => {
                        setSavePassword(event.target.value);
                        setSavePasswordError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveFieldChanges();
                        }
                      }}
                      disabled={isSaving}
                    />
                  </label>
                  {savePasswordError ? <p className="sacrament-delete-password-error">{savePasswordError}</p> : null}
                </>
              ) : null}
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={closeFieldSaveModal} disabled={isSaving}>
                Cancel
              </button>
              {fieldSaveStep === "password" ? (
                <button type="button" className="template-modal-btn danger" onClick={() => void saveFieldChanges()} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              ) : (
                <button
                  type="button"
                  className="template-modal-btn danger"
                  onClick={() => {
                    setSavePassword("");
                    setSavePasswordError("");
                    setFieldSaveStep("password");
                  }}
                >
                  Yes
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminSpecialSacramentRequirements;
