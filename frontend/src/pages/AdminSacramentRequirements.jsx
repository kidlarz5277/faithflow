import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Inbox,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import PageGuide from "../components/PageGuide";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { subscribeNotificationStream } from "../utils/notificationStream";
import { normalizeSacramentFormSchemaConfig } from "../utils/sacramentFormSchemas";
import PaymentPreview, { toFeeAmount } from "../components/PaymentPreview";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressTemplates.css";
import "./AdminSacramentRequirements.css";

// This page manages the sacraments table directly, so it never falls back to the built-in schemas.
const EMPTY_SCHEMA_CONFIG = { version: 1, sacraments: {}, archivedSacraments: {} };
const toStoredSchemaConfig = (rawConfig) => normalizeSacramentFormSchemaConfig(rawConfig, { includeDefaults: false });
const FIELD_TYPES = ["text", "number", "date", "tel", "select", "file", "list"];
const FIELD_TYPE_LABELS = {
  text: "Short text",
  number: "Number",
  date: "Date",
  tel: "Phone number",
  select: "Choose from a list",
  file: "Upload a file",
  list: "Repeating list",
};
const DEFAULT_MIN_LIST_ENTRIES = 3;

const createFieldUiId = () => `field-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const normalizeFieldType = (value) => {
  const normalized = String(value || "text")
    .trim()
    .toLowerCase();
  return FIELD_TYPES.includes(normalized) ? normalized : "text";
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

  minEntries: DEFAULT_MIN_LIST_ENTRIES,
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

  minEntries: Math.max(1, Number(field?.minEntries) || DEFAULT_MIN_LIST_ENTRIES),
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

const normalizeRequirementLines = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => toTitleCase(line.trim()))
    .filter(Boolean);

const toSchemaField = (field = {}, index = 0) => {
  const options = String(field.optionsText || "")
    .split("\n")
    .map((item) => toTitleCase(item.trim()))
    .filter(Boolean);
  const label = toTitleCase(String(field.label || "").trim());
  const autoKey = toCamelCaseKey(label);
  const autoPlaceholder = label ? `Enter ${label}` : `Enter Field ${index + 1}`;

  const fieldType = normalizeFieldType(field.type);
  const schemaField = {
    key: String(field.key || "").trim() || autoKey || `field_${index + 1}`,
    label: label || `Field ${index + 1}`,
    type: fieldType,
    required: field.required !== false,
    placeholder: fieldType === "list" ? "" : autoPlaceholder,
    accept: String(field.accept || "").trim(),
    options,
  };

  if (fieldType === "list") {
    schemaField.minEntries = Math.max(1, Number(field?.minEntries) || DEFAULT_MIN_LIST_ENTRIES);
  }
  return schemaField;
};

function AdminSacramentRequirements() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedSchemaKey = String(location.state?.selectedSchemaKey || "").trim();
  const cameFromDashboard = Boolean(location.state?.fromDashboard);
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);

  const [schemaConfig, setSchemaConfig] = useState(EMPTY_SCHEMA_CONFIG);
  const [selectedSchemaKey, setSelectedSchemaKey] = useState(requestedSchemaKey);
  const [editor, setEditor] = useState({
    label: "",
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

    minEntries: DEFAULT_MIN_LIST_ENTRIES,
  });
  const [newFieldOptionDraft, setNewFieldOptionDraft] = useState("");
  const [addFieldError, setAddFieldError] = useState("");
  const [isAddFieldConfirmOpen, setIsAddFieldConfirmOpen] = useState(false);
  const [pendingFieldPayload, setPendingFieldPayload] = useState(null);
  const [typeArchiveTarget, setTypeArchiveTarget] = useState("");
  const [isRequirementsModalOpen, setIsRequirementsModalOpen] = useState(false);
  const [feeDrafts, setFeeDrafts] = useState({ residentFee: "", nonResidentFee: "" });
  const [isLoadingFees, setIsLoadingFees] = useState(false);
  const [feeFormError, setFeeFormError] = useState("");
  const [isRequirementsSaveConfirmOpen, setIsRequirementsSaveConfirmOpen] = useState(false);
  const [requirementsTargetSchemaKey, setRequirementsTargetSchemaKey] = useState("");
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isNameSaveConfirmOpen, setIsNameSaveConfirmOpen] = useState(false);
  const [nameTargetSchemaKey, setNameTargetSchemaKey] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [newSacramentName, setNewSacramentName] = useState("");
  const [showAddTypeForm, setShowAddTypeForm] = useState(false);
  const [isFieldSaveConfirmOpen, setIsFieldSaveConfirmOpen] = useState(false);
  const [fieldSaveStep, setFieldSaveStep] = useState("confirm");
  const [savePassword, setSavePassword] = useState("");
  const [savePasswordError, setSavePasswordError] = useState("");
  const [requirementsEditor, setRequirementsEditor] = useState({
    documentsText: "",
    nonDocumentsText: "",
  });
  const [requirementDrafts, setRequirementDrafts] = useState({
    documents: "",
    nonDocuments: "",
  });
  const [requirementDeleteTarget, setRequirementDeleteTarget] = useState(null);

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
  const adminID = Number(user?.adminID);
  const activeNotice = error || notice;
  const isErrorNotice = Boolean(error);

  useEffect(() => {
    if (!activeNotice) return undefined;
    const timeoutId = window.setTimeout(() => {
      setError("");
      setNotice("");
    }, 2500);
    return () => window.clearTimeout(timeoutId);
  }, [activeNotice]);

  const schemaEntries = useMemo(() => Object.entries(schemaConfig?.sacraments || {}), [schemaConfig]);
  const visibleSchemaEntries = useMemo(() => schemaEntries.filter(([schemaKey]) => schemaKey !== "default"), [schemaEntries]);
  const archivedCount = useMemo(() => Object.keys(schemaConfig?.archivedSacraments || {}).length, [schemaConfig]);
  const selectedSchemaLabel = useMemo(() => {
    const currentSchema = schemaConfig?.sacraments?.[selectedSchemaKey];
    const fallbackLabel = String(selectedSchemaKey || "").replace(/_/g, " ");
    return toTitleCase(String(editor.label || currentSchema?.label || fallbackLabel).trim()) || "Schema";
  }, [editor.label, schemaConfig, selectedSchemaKey]);
  const selectedSchemaFields = useMemo(() => {
    const currentSchema = schemaConfig?.sacraments?.[selectedSchemaKey];
    return Array.isArray(currentSchema?.fields) ? currentSchema.fields : [];
  }, [schemaConfig, selectedSchemaKey]);
  const normalizedEditorFields = useMemo(() => editor.fields.map((field, index) => toSchemaField(field, index)), [editor.fields]);
  const normalizedStoredFields = useMemo(
    () => selectedSchemaFields.map((field, index) => toSchemaField(toFieldEditor(field), index)),
    [selectedSchemaFields],
  );
  const hasUnsavedFieldChanges = useMemo(
    () => JSON.stringify(normalizedEditorFields) !== JSON.stringify(normalizedStoredFields),
    [normalizedEditorFields, normalizedStoredFields],
  );
  const hasUnsavedFieldChangesRef = useRef(hasUnsavedFieldChanges);
  hasUnsavedFieldChangesRef.current = hasUnsavedFieldChanges;
  const documentItems = useMemo(() => normalizeRequirementLines(requirementsEditor.documentsText), [requirementsEditor.documentsText]);
  const nonDocumentItems = useMemo(() => normalizeRequirementLines(requirementsEditor.nonDocumentsText), [requirementsEditor.nonDocumentsText]);

  const loadSchemaConfig = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/admin-api/sacrament-form-schemas");
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load sacrament form schemas.");
      }

      setSchemaConfig(toStoredSchemaConfig(responseData));
    } catch (loadError) {
      setError(loadError.message || "Unable to load sacrament form schemas.");

      setSchemaConfig(EMPTY_SCHEMA_CONFIG);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Faithflow - Sacrament Form Schemas";
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

  useEffect(() => {
    if (accountType !== "admin" || !Number.isInteger(adminID) || adminID <= 0) return undefined;
    const streamPath = `/api/notifications/stream?accountType=admin&adminID=${adminID}`;
    return subscribeNotificationStream(streamPath, {
      onNotification: (event) => {
        try {
          const payload = JSON.parse(String(event?.data || "{}"));
          if (payload?.action !== "realtime_update") return;
          if (payload?.resource === "sacrament_form_schemas") {
            if (hasUnsavedFieldChangesRef.current) return;
            void loadSchemaConfig();
          }
        } catch {
          // Ignore malformed stream payloads.
        }
      },
    });
  }, [accountType, adminID, loadSchemaConfig]);

  useEffect(() => {
    const selectedSchema = schemaConfig?.sacraments?.[selectedSchemaKey];
    if (!selectedSchema) return;
    const mappedFields = Array.isArray(selectedSchema.fields) ? selectedSchema.fields.map((field) => toFieldEditor(field)) : [];
    setEditor({
      label: String(selectedSchema.label || ""),
      documentsText: Array.isArray(selectedSchema.requirements?.documents) ? selectedSchema.requirements.documents.join("\n") : "",
      nonDocumentsText: Array.isArray(selectedSchema.requirements?.nonDocuments) ? selectedSchema.requirements.nonDocuments.join("\n") : "",
      fields: mappedFields,
    });
    setOpenFieldIds([]);
  }, [schemaConfig, selectedSchemaKey]);

  useEffect(() => {
    if (requestedSchemaKey && schemaConfig?.sacraments?.[requestedSchemaKey]) {
      setSelectedSchemaKey(requestedSchemaKey);
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (!selectedSchemaKey) return;
    if (schemaConfig?.sacraments?.[selectedSchemaKey]) return;
    const fallbackSelection = visibleSchemaEntries[0]?.[0] || "";
    setSelectedSchemaKey(fallbackSelection);
  }, [location.pathname, navigate, requestedSchemaKey, schemaConfig, selectedSchemaKey, visibleSchemaEntries]);

  useEffect(() => {
    setRequirementDrafts({ documents: "", nonDocuments: "" });
  }, [selectedSchemaKey]);

  if (!user || accountType !== "admin") return null;

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
    setOpenFieldIds((current) => (current.includes(fieldUiId) ? current.filter((currentId) => currentId !== fieldUiId) : [...current, fieldUiId]));
  };

  const handleOpenAddFieldModal = () => {
    setAddFieldError("");
    setNewFieldDraft({
      label: "",
      type: "text",
      required: true,
      accept: "",
      options: [],
      minEntries: DEFAULT_MIN_LIST_ENTRIES,
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
      minEntries: DEFAULT_MIN_LIST_ENTRIES,
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
      placeholder: newFieldDraft.type === "list" ? "" : `Enter ${normalizedLabel}`,
      accept: newFieldDraft.type === "file" ? String(newFieldDraft.accept || "").trim() : "",
      optionsText: newFieldDraft.type === "select" ? newFieldDraft.options.join("\n") : "",

      minEntries: Math.max(1, Number(newFieldDraft.minEntries) || DEFAULT_MIN_LIST_ENTRIES),
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
    const targetSchemaKey = String(selectedSchemaKey || "").trim();
    if (!targetSchemaKey || targetSchemaKey === "default") {
      setAddFieldError("Select a sacrament schema first.");
      return;
    }
    const targetSchemaLabel = String(schemaConfig?.sacraments?.[targetSchemaKey]?.label || "").trim();
    setIsSaving(true);
    setError("");
    setNotice("");
    setAddFieldError("");
    try {
      const response = await fetch(`/admin-api/sacrament-form-schemas/${encodeURIComponent(targetSchemaKey)}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: pendingFieldPayload }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to add field.");
      }

      const savedConfig = toStoredSchemaConfig(responseData.config || schemaConfig);
      const resolvedSchemaKey = resolveSchemaSelectionKey(savedConfig, responseData.schemaKey || targetSchemaKey, targetSchemaLabel);
      setSchemaConfig(savedConfig);
      setSelectedSchemaKey(resolvedSchemaKey);
      setNotice("Field added and saved.");
      handleCloseAddFieldModal();
    } catch (createError) {
      setAddFieldError(createError.message || "Unable to add field.");
    } finally {
      setIsSaving(false);
    }
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

  const handleOpenRequirementsModal = () => {
    setRequirementsTargetSchemaKey(selectedSchemaKey);
    setRequirementDrafts({ documents: "", nonDocuments: "" });
    setRequirementDeleteTarget(null);
    setIsRequirementsSaveConfirmOpen(false);
    setRequirementsEditor({
      documentsText: editor.documentsText,
      nonDocumentsText: editor.nonDocumentsText,
    });
    setFeeDrafts({ residentFee: "", nonResidentFee: "" });
    setFeeFormError("");
    setIsRequirementsModalOpen(true);
    void loadSacramentFees(selectedSchemaLabel);
  };

  const loadSacramentFees = async (sacramentLabel) => {
    const targetName = String(sacramentLabel || "").trim().toLowerCase();
    if (!targetName) return;
    setIsLoadingFees(true);
    try {
      const response = await fetch("/admin-api/sacraments");
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error("Unable to load fees.");
      const match = (Array.isArray(rows) ? rows : []).find(
        (row) => String(row?.sacramentName || "").trim().toLowerCase() === targetName,
      );
      const toDraft = (value) => {
        const amount = toFeeAmount(value);
        return amount === null ? "" : String(amount);
      };
      setFeeDrafts({ residentFee: toDraft(match?.residentFee), nonResidentFee: toDraft(match?.nonResidentFee) });
    } catch (loadError) {
      setFeeFormError(loadError.message || "Unable to load fees.");
    } finally {
      setIsLoadingFees(false);
    }
  };

  const handleFeeDraftChange = (key, value) => {
    const cleaned = String(value || "").replace(/[^\d.]/g, "");
    const [whole, ...decimals] = cleaned.split(".");
    const nextValue = decimals.length > 0 ? `${whole}.${decimals.join("").slice(0, 2)}` : whole;
    setFeeDrafts((current) => ({ ...current, [key]: nextValue }));
    setFeeFormError("");
  };

  const handleOpenNameModal = () => {
    setIsNameSaveConfirmOpen(false);
    setNameTargetSchemaKey(selectedSchemaKey);
    setNameDraft(selectedSchemaLabel);
    setIsNameModalOpen(true);
  };

  const handleCloseNameModal = () => {
    if (isSaving) return;
    setIsNameSaveConfirmOpen(false);
    setNameTargetSchemaKey("");
    setNameDraft("");
    setIsNameModalOpen(false);
  };

  const handleCloseRequirementsModal = () => {
    if (isSaving) return;
    setRequirementDrafts({ documents: "", nonDocuments: "" });
    setRequirementDeleteTarget(null);
    setIsRequirementsSaveConfirmOpen(false);
    setRequirementsTargetSchemaKey("");
    setFeeFormError("");
    setIsRequirementsModalOpen(false);
  };

  const handleRequirementDraftChange = (key, value) => {
    setRequirementDrafts((current) => ({ ...current, [key]: value }));
  };

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

  const resolveSchemaSelectionKey = (config, preferredKey, preferredLabel = "") => {
    const availableSacraments = config?.sacraments || {};
    const normalizedPreferredKey = String(preferredKey || "").trim();
    if (normalizedPreferredKey && availableSacraments[normalizedPreferredKey]) {
      return normalizedPreferredKey;
    }
    const normalizedPreferredLabel = String(preferredLabel || "")
      .trim()
      .toLowerCase();
    if (normalizedPreferredLabel) {
      const matchedEntry = Object.entries(availableSacraments).find(
        ([schemaKey, schema]) =>
          schemaKey !== "default" &&
          String(schema?.label || "")
            .trim()
            .toLowerCase() === normalizedPreferredLabel,
      );
      if (matchedEntry?.[0]) {
        return matchedEntry[0];
      }
    }
    return Object.keys(availableSacraments).find((schemaKey) => schemaKey !== "default") || "default";
  };

  const saveRequirementsOnly = async () => {
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const targetSchemaKey = String(requirementsTargetSchemaKey || selectedSchemaKey || "").trim();
      if (!targetSchemaKey || targetSchemaKey === "default") {
        throw new Error("Select a sacrament schema first.");
      }
      const targetSchemaLabel = String(schemaConfig?.sacraments?.[targetSchemaKey]?.label || "").trim();
      const residentFeeText = String(feeDrafts.residentFee || "").trim();
      const nonResidentFeeText = String(feeDrafts.nonResidentFee || "").trim();
      if ((residentFeeText && toFeeAmount(residentFeeText) === null) || (nonResidentFeeText && toFeeAmount(nonResidentFeeText) === null)) {
        setFeeFormError("Enter valid peso amounts for the fees.");
        throw new Error("Enter valid peso amounts for the fees.");
      }
      const response = await fetch(`/admin-api/sacrament-form-schemas/${encodeURIComponent(targetSchemaKey)}/requirements`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: documentItems,
          nonDocuments: nonDocumentItems,
          residentFee: residentFeeText ? Number(residentFeeText) : null,
          nonResidentFee: nonResidentFeeText ? Number(nonResidentFeeText) : null,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to save requirements.");
      }

      const savedConfig = toStoredSchemaConfig(responseData.config || schemaConfig);
      const resolvedSchemaKey = resolveSchemaSelectionKey(savedConfig, responseData.schemaKey || targetSchemaKey, targetSchemaLabel);
      setSchemaConfig(savedConfig);
      setSelectedSchemaKey(resolvedSchemaKey);
      setNotice("Requirements and fees saved.");
      handleCloseRequirementsModal();
    } catch (saveError) {
      setError(saveError.message || "Unable to save requirements.");
    } finally {
      setIsSaving(false);
    }
  };

  const persistSchemaFields = async (nextEditorFields, successMessage) => {
    const targetSchemaKey = String(selectedSchemaKey || "").trim();
    if (!targetSchemaKey || targetSchemaKey === "default") {
      throw new Error("Select a sacrament schema first.");
    }
    const targetSchemaLabel = String(schemaConfig?.sacraments?.[targetSchemaKey]?.label || "").trim();
    const response = await fetch(`/admin-api/sacrament-form-schemas/${encodeURIComponent(targetSchemaKey)}/fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: nextEditorFields.map((field, index) => toSchemaField(field, index)),
      }),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseData.message || "Unable to save field changes.");
    }

    const savedConfig = toStoredSchemaConfig(responseData.config || schemaConfig);
    const resolvedSchemaKey = resolveSchemaSelectionKey(savedConfig, responseData.schemaKey || targetSchemaKey, targetSchemaLabel);
    setSchemaConfig(savedConfig);
    setSelectedSchemaKey(resolvedSchemaKey);
    setNotice(successMessage);
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
      setOpenFieldIds((current) => current.filter((fieldUiId) => fieldUiId !== targetUiId));
      closeFieldDeleteModal();
    } catch (deleteError) {
      setError(deleteError.message || "Unable to remove field.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveSacramentName = async () => {
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const targetSchemaKey = String(nameTargetSchemaKey || selectedSchemaKey || "").trim();
      if (!targetSchemaKey || targetSchemaKey === "default") {
        throw new Error("Select a sacrament schema first.");
      }
      const normalizedName = toTitleCase(String(nameDraft || "").trim());
      if (!normalizedName) {
        throw new Error("Provide a sacrament name.");
      }
      const response = await fetch(`/admin-api/sacrament-form-schemas/${encodeURIComponent(targetSchemaKey)}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sacramentName: normalizedName }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to update sacrament name.");
      }

      const savedConfig = toStoredSchemaConfig(responseData.config || schemaConfig);
      const resolvedSchemaKey = resolveSchemaSelectionKey(savedConfig, responseData.schemaKey || targetSchemaKey, normalizedName);
      setSchemaConfig(savedConfig);
      setSelectedSchemaKey(resolvedSchemaKey);
      setNotice("Sacrament name updated.");
      handleCloseNameModal();
    } catch (saveError) {
      setError(saveError.message || "Unable to update sacrament name.");
    } finally {
      setIsSaving(false);
    }
  };

  const createTypeKey = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const handleAddType = async () => {
    const normalizedLabel = toTitleCase(String(newSacramentName || "").trim());
    const normalizedKey = createTypeKey(normalizedLabel);
    if (!normalizedLabel || !normalizedKey) {
      setError("Provide a valid sacrament name.");
      return;
    }
    if (schemaConfig?.sacraments?.[normalizedKey]) {
      setError("A sacrament type with this name already exists.");
      return;
    }
    const existingSameName = Object.values(schemaConfig?.sacraments || {}).some(
      (schema) =>
        String(schema?.label || "")
          .trim()
          .toLowerCase() === normalizedLabel.toLowerCase(),
    );
    if (existingSameName) {
      setError("A sacrament type with this name already exists.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/admin-api/sacrament-form-schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sacramentName: normalizedLabel,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to create sacrament type.");
      }

      const savedConfig = toStoredSchemaConfig(responseData.config || schemaConfig);
      const resolvedSchemaKey = resolveSchemaSelectionKey(savedConfig, responseData.schemaKey || normalizedKey, normalizedLabel);
      setSchemaConfig(savedConfig);
      setSelectedSchemaKey(resolvedSchemaKey);
      setShowAddTypeForm(false);
      setNewSacramentName("");
      const syncedTemplateName = String(responseData?.syncedProgressTemplate?.sacramentName || "").trim();
      setNotice(
        syncedTemplateName ? `Sacrament type created and synced to Progress Templates (${syncedTemplateName}).` : "Sacrament type created and synced.",
      );
    } catch (createError) {
      setError(createError.message || "Unable to create sacrament type.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenAddTypeModal = () => {
    setError("");
    setNotice("");
    setNewSacramentName("");
    setShowAddTypeForm(true);
  };

  const handleArchiveType = async (schemaKey) => {
    if (!schemaKey) return;
    if (schemaKey === "default") {
      setError("The default schema cannot be removed.");
      return;
    }
    const activeNonDefaultKeys = Object.keys(schemaConfig?.sacraments || {}).filter((key) => key !== "default");
    if (activeNonDefaultKeys.length <= 1) {
      setError("At least one sacrament type must remain.");
      return;
    }
    if (!schemaConfig?.sacraments?.[schemaKey]) {
      setError("Sacrament type not found.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/admin-api/sacrament-form-schemas/${encodeURIComponent(schemaKey)}/archive`, { method: "POST" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to archive sacrament type.");
      }

      const savedConfig = toStoredSchemaConfig(responseData.config || schemaConfig);
      const remainingKeys = Object.keys(savedConfig?.sacraments || {}).filter((key) => key !== "default");
      const fallbackSelection = remainingKeys.includes(selectedSchemaKey)
        ? selectedSchemaKey
        : remainingKeys[0] || "";
      setSchemaConfig(savedConfig);
      setSelectedSchemaKey(fallbackSelection);
      setTypeArchiveTarget("");
      setNotice("Sacrament type moved to archive.");
    } catch (archiveError) {
      setError(archiveError.message || "Unable to archive sacrament type.");
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
              <h2>Sacrament Form Manager <PageGuide pageKey="sacrament-form-manager" /></h2>
            </div>
            {selectedSchemaKey ? (
              <button type="button" className="progress-template-btn progress-template-btn--hero" onClick={() => setSelectedSchemaKey("")}>
                Back
              </button>
            ) : null}
          </section>

          <section
            className={`dashboard-panel sacrament-schema-layout sacrament-form-manager-layout${
              selectedSchemaKey ? " is-editor-open" : " is-list-only"
            }`}
          >
            <aside className="sacrament-schema-list sacrament-form-manager-list">
              <div className="sacrament-schema-list-header">
                <h3>Sacrament Types</h3>
                <div className="sacrament-schema-list-header-actions">
                  <button
                    type="button"
                    className="sacrament-archive-link-button"
                    onClick={() =>
                      navigate("/admin/sacrament-form-schemas/archive", { state: cameFromDashboard ? { fromDashboard: true } : null })
                    }
                    disabled={isSaving}
                    aria-label={archivedCount > 0 ? `Open archived sacrament types, ${archivedCount} archived` : "Open archived sacrament types"}
                  >
                    <Archive size={14} aria-hidden="true" />
                    Archived
                    {archivedCount > 0 ? (
                      <span className="sacrament-archive-link-badge">{archivedCount > 9 ? "9+" : archivedCount}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="sacrament-add-icon-button"
                    aria-label="Add sacrament type"
                    title="Add Type"
                    onClick={handleOpenAddTypeModal}
                    disabled={isSaving}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {isLoading ? (
                <p>Loading sacrament types...</p>
              ) : visibleSchemaEntries.length === 0 ? (
                <div className="sacrament-schema-empty-state" role="status">
                  <span className="sacrament-schema-empty-icon" aria-hidden="true">
                    <Inbox size={28} strokeWidth={1.6} />
                  </span>
                  <h4>No sacrament types yet</h4>
                  <p>Add a sacrament type to start its form.</p>
                </div>
              ) : (
                <ul>
                  {visibleSchemaEntries.map(([schemaKey, schema]) => {
                    const isSelected = schemaKey === selectedSchemaKey;
                    return (
                      <li key={schemaKey}>
                        <div
                          className={`sacrament-schema-item ${isSelected ? "is-selected" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedSchemaKey(schemaKey);
                            setNotice("");
                            setError("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedSchemaKey(schemaKey);
                              setNotice("");
                              setError("");
                            }
                          }}
                        >
                          <div className="sacrament-schema-item-main">
                            <strong>{schema.label || schemaKey}</strong>
                          </div>
                          <div className="sacrament-schema-item-actions">
                            <button
                              type="button"
                              className="sacrament-schema-item-action"
                              onClick={(event) => {
                                event.stopPropagation();
                                setTypeArchiveTarget(schemaKey);
                              }}
                              disabled={schemaKey === "default" || isSaving}
                            >
                              <Archive size={12} aria-hidden="true" />
                              Archive
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>

            {selectedSchemaKey ? (
            <section className="sacrament-schema-editor sacrament-form-manager-editor" aria-live="polite">
              <div className="sacrament-schema-editor-header">
                <h3 className="sacrament-schema-editor-title">
                  <span>{selectedSchemaLabel}</span>
                  <button
                    type="button"
                    className="sacrament-schema-edit-icon-button"
                    aria-label={`Edit ${selectedSchemaLabel}`}
                    title={`Edit ${selectedSchemaLabel}`}
                    onClick={handleOpenNameModal}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                </h3>
                <div className="sacrament-schema-editor-actions">
                  <button type="button" className="sacrament-theme-btn sacrament-theme-btn--quiet" onClick={handleOpenRequirementsModal} disabled={isSaving}>
                    Edit Requirements
                  </button>
                  <button type="button" className="sacrament-theme-btn sacrament-theme-btn--primary" onClick={handleOpenAddFieldModal} disabled={isSaving}>
                    <Plus size={15} aria-hidden="true" />
                    Add question
                  </button>
                </div>
              </div>
              <div className="template-steps-header sacrament-questions-heading">
                <h4>Questions on the form</h4>
              </div>
              <p className="sacrament-schema-hint">
                These are the questions a parishioner answers when requesting {selectedSchemaLabel}. Use a clear name, then choose what kind of answer you need.
              </p>

              <div className="sacrament-schema-fields-list">
                {editor.fields.map((field, index) => (
                  <article key={field.uiId} className="sacrament-schema-field-card">
                    <header className="sacrament-schema-field-card-header">
                      <div className="sacrament-schema-field-card-title">
                        <h5>{field.label || `Question ${index + 1}`}</h5>
                        <span>Question {index + 1}</span>
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
                              Edit
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
                              placeholder="e.g. Bride Full Name"
                            />
                          </label>
                          <label>
                            Kind of answer
                            <select
                              value={normalizeFieldType(field.type)}
                              onChange={(event) => {
                                const nextType = normalizeFieldType(event.target.value);
                                if (nextType === normalizeFieldType(field.type)) return;
                                setEditor((current) => ({
                                  ...current,
                                  fields: current.fields.map((item, itemIndex) => {
                                    if (itemIndex !== index) return item;
                                    return {
                                      ...item,
                                      type: nextType,
                                      accept: nextType === "file" ? String(item.accept || "") : "",
                                      optionsText: nextType === "select" ? String(item.optionsText || "") : "",
                                    };
                                  }),
                                }));
                              }}
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

                        {field.type === "file" || field.type === "select" || field.type === "list" ? (
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

                            {field.type === "list" ? (
                              <div className="sacrament-schema-list-settings">
                                <label>
                                  Minimum Entries
                                  <input
                                    type="number"
                                    min="1"
                                    value={field.minEntries}
                                    onChange={(event) => updateEditorField(index, "minEntries", Math.max(1, Number(event.target.value) || 1))}
                                  />
                                </label>
                              </div>
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
            </section>
            ) : null}
          </section>
        </section>
      </div>
      {fieldDeleteTarget
        ? createPortal(
            <div className="template-delete-modal-overlay" role="presentation" onClick={closeFieldDeleteModal}>
              <section
                className="template-delete-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Remove question confirmation"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="template-delete-modal-body">
                  <span className="template-delete-modal-icon" aria-hidden="true">
                    <AlertTriangle size={24} />
                  </span>
                  <h4>Remove this question?</h4>
                  <p>
                    {editor.fields.find((field) => field.uiId === fieldDeleteTarget)?.label || "This question"} will be
                    removed from the request form.
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
                  onChange={(event) => setNewFieldDraft((current) => ({ ...current, label: toTitleCase(event.target.value) }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRequestCreateFieldFromModal();
                    }
                  }}
                  placeholder="e.g. Groom Full Name"
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
                    onChange={(event) => setNewFieldDraft((current) => ({ ...current, accept: event.target.value }))}
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
              {newFieldDraft.type === "list" ? (
                <div className="sacrament-schema-list-settings">
                  <label>
                    Minimum Entries
                    <input
                      type="number"
                      min="1"
                      value={newFieldDraft.minEntries}
                      onChange={(event) =>
                        setNewFieldDraft((current) => ({
                          ...current,
                          minEntries: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                    />
                  </label>
                </div>
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
              <p>This will add and save the field to the selected sacrament schema.</p>
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
            className="template-delete-modal sacrament-schema-add-type-modal sacrament-add-field-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add sacrament type"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sacrament-colored-modal-header">
              <h4>Add sacrament type</h4>
              <button
                type="button"
                className="sacrament-colored-modal-close"
                onClick={() => setShowAddTypeForm(false)}
                disabled={isSaving}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="sacrament-schema-add-type">
              <p className="sacrament-colored-modal-note">Enter the sacrament name. It is saved with its own form.</p>
              <label>
                Sacrament name
                <input
                  value={newSacramentName}
                  onChange={(event) => setNewSacramentName(toTitleCase(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddType();
                    }
                  }}
                  placeholder="Enter the sacrament name"
                />
              </label>
            </div>
            <div className="template-delete-modal-actions sacrament-colored-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setShowAddTypeForm(false)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="sacrament-theme-btn sacrament-theme-btn--primary" onClick={() => void handleAddType()} disabled={isSaving}>
                {isSaving ? "Creating..." : "Create type"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {typeArchiveTarget ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => setTypeArchiveTarget("")}>
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Archive sacrament type confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Archive this sacrament type?</h4>
              <p>This moves the type to Archived. It can be restored later.</p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setTypeArchiveTarget("")}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn archive" onClick={() => void handleArchiveType(typeArchiveTarget)} disabled={isSaving}>
                {isSaving ? "Archiving..." : "Archive Type"}
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
            aria-label="Edit sacrament name"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <h4>Edit Sacrament Name</h4>
              <p>Update the sacrament name stored in the database.</p>
            </div>
            <div className="sacrament-schema-add-type">
              <label>
                Sacrament Name
                <input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(toTitleCase(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setIsNameSaveConfirmOpen(true);
                    }
                  }}
                  placeholder="Marriage"
                  disabled={isSaving}
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
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save sacrament name confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Save sacrament name?</h4>
              <p>This will update the selected sacrament name in the database.</p>
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
                  void saveSacramentName();
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
                <span className="sacrament-schema-preview-badge">{toTitleCase(editor.label || selectedSchemaKey.replace(/_/g, " "))}</span>
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
              {toFeeAmount(feeDrafts.residentFee) === null && toFeeAmount(feeDrafts.nonResidentFee) === null ? (
                <p className="sacrament-fees-preview-empty">No fees set. Users won't see a Payment Preview for this sacrament.</p>
              ) : (
                <PaymentPreview residentFee={feeDrafts.residentFee} nonResidentFee={feeDrafts.nonResidentFee} />
              )}
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
                    placeholder="e.g. Pre-Cana Seminar"
                    disabled={isSaving}
                  />
                  <button
                    type="button"
                    className="sacrament-schema-quick-add-btn"
                    onClick={() => handleAddRequirement("nonDocuments")}
                    disabled={isSaving}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            <section className="sacrament-fees-section" aria-label="Sacrament fees">
              <div className="sacrament-fees-head">
                <h4>Fees</h4>
                <p>Updates the Payment Preview above. Leave blank to hide a fee.</p>
              </div>
              <div className="sacrament-fees-inputs">
                  <label className="sacrament-fee-field">
                    <span>Villanueva resident fee</span>
                    <div className="sacrament-fee-input">
                      <em aria-hidden="true">₱</em>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={feeDrafts.residentFee}
                        onChange={(event) => handleFeeDraftChange("residentFee", event.target.value)}
                        placeholder={isLoadingFees ? "Loading..." : "e.g. 3000"}
                        disabled={isSaving || isLoadingFees}
                      />
                    </div>
                  </label>
                  <label className="sacrament-fee-field">
                    <span>Non-resident fee</span>
                    <div className="sacrament-fee-input">
                      <em aria-hidden="true">₱</em>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={feeDrafts.nonResidentFee}
                        onChange={(event) => handleFeeDraftChange("nonResidentFee", event.target.value)}
                        placeholder={isLoadingFees ? "Loading..." : "e.g. 5000"}
                        disabled={isSaving || isLoadingFees}
                      />
                    </div>
                  </label>
                  <small>Enter 0 to show the fee as Free.</small>
                  {feeFormError ? <p className="sacrament-fee-error">{feeFormError}</p> : null}
              </div>
            </section>
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
              <p>This will apply the updated requirements to the selected sacrament.</p>
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
                This will apply the updated questions to this sacrament.
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

export default AdminSacramentRequirements;
