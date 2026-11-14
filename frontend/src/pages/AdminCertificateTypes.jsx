import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Inbox,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import PageGuide from "../components/PageGuide";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressTemplates.css";
import "./AdminSacramentRequirements.css";

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

function AdminCertificateTypes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [certificateTypes, setCertificateTypes] = useState([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [typeRemoveTarget, setTypeRemoveTarget] = useState(null);
  const [selectedTypeId, setSelectedTypeId] = useState(null);
  const [editor, setEditor] = useState({ label: "", fields: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openFieldIds, setOpenFieldIds] = useState([]);
  const [fieldDeleteTarget, setFieldDeleteTarget] = useState("");
  const [fieldDeleteStep, setFieldDeleteStep] = useState("confirm");
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState("");
  const [showAddTypeForm, setShowAddTypeForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeFee, setNewTypeFee] = useState("");
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isNameSaveConfirmOpen, setIsNameSaveConfirmOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [feeDraft, setFeeDraft] = useState("");
  const [isAddFieldModalOpen, setIsAddFieldModalOpen] = useState(false);
  const [isAddFieldConfirmOpen, setIsAddFieldConfirmOpen] = useState(false);
  const [newFieldDraft, setNewFieldDraft] = useState(createEmptyField());
  const [newFieldOptionDraft, setNewFieldOptionDraft] = useState("");
  const [addFieldError, setAddFieldError] = useState("");
  const [pendingFieldPayload, setPendingFieldPayload] = useState(null);
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

  const selectedType = useMemo(
    () => certificateTypes.find((item) => item.certificateTypeID === selectedTypeId) || null,
    [certificateTypes, selectedTypeId],
  );
  const selectedTypeLabel = useMemo(
    () => toTitleCase(String(editor.label || selectedType?.label || "").trim()) || "Certificate Type",
    [editor.label, selectedType],
  );
  const normalizedEditorFields = useMemo(() => editor.fields.map((field, index) => toSchemaField(field, index)), [editor.fields]);
  const normalizedStoredFields = useMemo(
    () => (Array.isArray(selectedType?.formSchema?.fields) ? selectedType.formSchema.fields : []).map((field, index) => toSchemaField(toFieldEditor(field), index)),
    [selectedType],
  );
  const hasUnsavedFieldChanges = useMemo(
    () => JSON.stringify(normalizedEditorFields) !== JSON.stringify(normalizedStoredFields),
    [normalizedEditorFields, normalizedStoredFields],
  );

  useEffect(() => {
    if (!activeNotice) return undefined;
    const timeoutId = window.setTimeout(() => {
      setError("");
      setNotice("");
    }, 2500);
    return () => window.clearTimeout(timeoutId);
  }, [activeNotice]);

  const loadCertificateTypes = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/admin-api/certificate-types");
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to load certificate types.");
      }
      const items = Array.isArray(responseData.items) ? responseData.items : [];
      setCertificateTypes(items);
      setArchivedCount(Number(responseData.archivedCount) || 0);
    } catch (loadError) {
      setCertificateTypes([]);
      setError(loadError.message || "Unable to load certificate types.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Faithflow - Certificate Types";
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
      void loadCertificateTypes();
    }
  }, [accountType, loadCertificateTypes]);

  useEffect(() => {
    if (!selectedType) {
      setEditor({ label: "", fields: [] });
      setOpenFieldIds([]);
      return;
    }
    setEditor({
      label: String(selectedType.label || ""),
      fields: Array.isArray(selectedType.formSchema?.fields) ? selectedType.formSchema.fields.map((field) => toFieldEditor(field)) : [],
    });
    setOpenFieldIds([]);
  }, [selectedType]);

  useEffect(() => {
    const storedFee = selectedType?.fee;
    setFeeDraft(storedFee === null || storedFee === undefined ? "" : String(storedFee));
  }, [selectedType?.certificateTypeID, selectedType?.fee]);

  useEffect(() => {
    if (selectedTypeId == null) return;
    if (certificateTypes.some((item) => item.certificateTypeID === selectedTypeId)) return;
    setSelectedTypeId(null);
  }, [certificateTypes, selectedTypeId]);

  useEffect(() => {
    const requestedId = Number(new URLSearchParams(location.search).get("certificateTypeID"));
    if (!Number.isInteger(requestedId) || requestedId <= 0 || certificateTypes.length === 0) return;
    if (certificateTypes.some((item) => item.certificateTypeID === requestedId)) {
      setSelectedTypeId(requestedId);
    }
    navigate(location.pathname, { replace: true });
  }, [certificateTypes, location.pathname, location.search, navigate]);

  if (!user || accountType !== "admin") return null;

  const applyItems = (items, nextSelectedId = selectedTypeId) => {
    const nextItems = Array.isArray(items) ? items : [];
    setCertificateTypes(nextItems);
    if (nextSelectedId != null && nextItems.some((item) => item.certificateTypeID === nextSelectedId)) {
      setSelectedTypeId(nextSelectedId);
      return;
    }
    setSelectedTypeId(null);
  };

  const handleArchiveCertificateType = async (certificateTypeID) => {
    if (!Number.isInteger(certificateTypeID) || certificateTypeID <= 0) return;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/admin-api/certificate-types/${certificateTypeID}`, { method: "DELETE" });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to remove certificate type.");
      }
      applyItems(responseData.items);
      setArchivedCount(Number(responseData.archivedCount) || 0);
      setTypeRemoveTarget(null);
      setNotice("Certificate type removed.");
    } catch (archiveError) {
      setError(archiveError.message || "Unable to remove certificate type.");
    } finally {
      setIsSaving(false);
    }
  };

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
    setNewFieldDraft(createEmptyField());
    setNewFieldOptionDraft("");
    setPendingFieldPayload(null);
    setIsAddFieldConfirmOpen(false);
    setIsAddFieldModalOpen(true);
  };

  const handleCloseAddFieldModal = () => {
    if (isSaving) return;
    setAddFieldError("");
    setIsAddFieldConfirmOpen(false);
    setPendingFieldPayload(null);
    setNewFieldDraft(createEmptyField());
    setNewFieldOptionDraft("");
    setIsAddFieldModalOpen(false);
  };

  const handleAddNewFieldOption = () => {
    const normalizedOption = toTitleCase(String(newFieldOptionDraft || "").trim());
    if (!normalizedOption) return;
    setNewFieldDraft((current) => {
      const hasExisting = String(current.optionsText || "")
        .split("\n")
        .some((item) => item.trim().toLowerCase() === normalizedOption.toLowerCase());
      if (hasExisting) return current;
      const nextOptions = [...String(current.optionsText || "").split("\n").map((item) => item.trim()).filter(Boolean), normalizedOption];
      return { ...current, optionsText: nextOptions.join("\n") };
    });
    setNewFieldOptionDraft("");
    setAddFieldError("");
  };

  const handleRemoveNewFieldOption = (optionIndex) => {
    setNewFieldDraft((current) => {
      const nextOptions = String(current.optionsText || "")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((_item, index) => index !== optionIndex);
      return { ...current, optionsText: nextOptions.join("\n") };
    });
  };

  const buildFieldPayloadFromDraft = () => {
    const normalizedLabel = toTitleCase(String(newFieldDraft.label || "").trim());
    if (!normalizedLabel) {
      setAddFieldError("Field name is required.");
      return null;
    }
    const options = String(newFieldDraft.optionsText || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    if (newFieldDraft.type === "select" && options.length === 0) {
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
      optionsText: newFieldDraft.type === "select" ? options.join("\n") : "",
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
    if (!pendingFieldPayload || !selectedTypeId) {
      setAddFieldError("Select a certificate type first.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    setAddFieldError("");
    try {
      const response = await fetch(`/admin-api/certificate-types/${selectedTypeId}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: pendingFieldPayload }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to add field.");
      }
      applyItems(responseData.items, selectedTypeId);
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
      return { ...current, fields: nextFields };
    });
  };

  const persistSchemaFields = async (nextEditorFields, successMessage) => {
    if (!selectedTypeId) {
      throw new Error("Select a certificate type first.");
    }
    const response = await fetch(`/admin-api/certificate-types/${selectedTypeId}/fields`, {
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
    applyItems(responseData.items, selectedTypeId);
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

  const handleAddType = async () => {
    const normalizedLabel = toTitleCase(String(newTypeName || "").trim());
    if (!normalizedLabel) {
      setError("Provide a valid certificate type name.");
      return;
    }
    const existingSameName = certificateTypes.some(
      (item) => String(item.certTypeName || item.label || "").trim().toLowerCase() === normalizedLabel.toLowerCase(),
    );
    if (existingSameName) {
      setError("A certificate type with this name already exists.");
      return;
    }
    const trimmedFee = String(newTypeFee || "").trim();
    const fee = trimmedFee === "" ? null : Number(trimmedFee);
    if (fee !== null && (!Number.isFinite(fee) || fee < 0)) {
      setError("Fee must be a valid amount of 0 or more.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/admin-api/certificate-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certTypeName: normalizedLabel, fee }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to create certificate type.");
      }
      const createdId = Number(responseData.item?.certificateTypeID);
      applyItems(responseData.items, Number.isInteger(createdId) && createdId > 0 ? createdId : selectedTypeId);
      setShowAddTypeForm(false);
      setNewTypeName("");
      setNewTypeFee("");
      setNotice("Certificate type created.");
    } catch (createError) {
      setError(createError.message || "Unable to create certificate type.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenNameModal = () => {
    setIsNameSaveConfirmOpen(false);
    setNameDraft(selectedTypeLabel);
    setIsNameModalOpen(true);
  };

  const handleCloseNameModal = () => {
    if (isSaving) return;
    setIsNameSaveConfirmOpen(false);
    setNameDraft("");
    setIsNameModalOpen(false);
  };

  const saveCertificateTypeName = async () => {
    if (!selectedTypeId) {
      setError("Select a certificate type first.");
      return;
    }
    const normalizedName = toTitleCase(String(nameDraft || "").trim());
    if (!normalizedName) {
      setError("Provide a certificate type name.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/admin-api/certificate-types/${selectedTypeId}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: normalizedName }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to update certificate type name.");
      }
      applyItems(responseData.items, selectedTypeId);
      setNotice("Certificate type name updated.");
      setIsNameSaveConfirmOpen(false);
      setNameDraft("");
      setIsNameModalOpen(false);
    } catch (saveError) {
      setError(saveError.message || "Unable to update certificate type name.");
    } finally {
      setIsSaving(false);
    }
  };

  const storedFeeText =
    selectedType?.fee === null || selectedType?.fee === undefined ? "" : String(selectedType.fee);
  const isFeeDirty = String(feeDraft).trim() !== storedFeeText;

  const saveCertificateTypeFee = async () => {
    if (!selectedTypeId) {
      setError("Select a certificate type first.");
      return;
    }
    const trimmedFee = String(feeDraft || "").trim();
    const nextFee = trimmedFee === "" ? null : Number(trimmedFee);
    if (nextFee !== null && (!Number.isFinite(nextFee) || nextFee < 0)) {
      setError("Fee must be a valid amount of 0 or more.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/admin-api/certificate-types/${selectedTypeId}/fee`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fee: nextFee }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to update certificate type fee.");
      }
      applyItems(responseData.items, selectedTypeId);
      setNotice(!nextFee ? "Certificate fee cleared. This certificate is now free." : "Certificate fee updated.");
    } catch (saveError) {
      setError(saveError.message || "Unable to update certificate type fee.");
    } finally {
      setIsSaving(false);
    }
  };

  const newFieldOptions = String(newFieldDraft.optionsText || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

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
              <h2>Certificate Type Manager <PageGuide pageKey="certificate-type-manager" /></h2>
            </div>
            <button
              type="button"
              className="progress-template-btn progress-template-btn--hero"
              onClick={() => navigate("/admin/certificate-requests")}
            >
              Back
            </button>
          </section>

          <section
            className={`dashboard-panel sacrament-schema-layout sacrament-form-manager-layout${
              selectedTypeId ? " is-editor-open" : " is-list-only"
            }`}
          >
            <aside className="sacrament-schema-list sacrament-form-manager-list">
              <div className="sacrament-schema-list-header">
                <h3>Certificate Types</h3>
                <div className="sacrament-schema-list-header-actions">
                  <button
                    type="button"
                    className="sacrament-archive-link-button"
                    onClick={() => navigate("/admin/certificate-types/archive")}
                    disabled={isSaving}
                    aria-label={archivedCount > 0 ? `Open archived certificate types, ${archivedCount} archived` : "Open archived certificate types"}
                  >
                    <Archive size={14} aria-hidden="true" />
                    Archive
                    {archivedCount > 0 ? (
                      <span className="sacrament-archive-link-badge">{archivedCount > 9 ? "9+" : archivedCount}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="sacrament-add-icon-button"
                    aria-label="Add certificate type"
                    title="Add Type"
                    onClick={() => {
                      setError("");
                      setNotice("");
                      setNewTypeName("");
                      setNewTypeFee("");
                      setShowAddTypeForm(true);
                    }}
                    disabled={isSaving}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {isLoading ? (
                <p>Loading certificate types...</p>
              ) : certificateTypes.length === 0 ? (
                <div className="sacrament-schema-empty-state" role="status">
                  <span className="sacrament-schema-empty-icon" aria-hidden="true">
                    <Inbox size={28} strokeWidth={1.6} />
                  </span>
                  <h4>No certificate types</h4>
                  <p>Add a certificate type to start building its form fields.</p>
                </div>
              ) : (
                <ul>
                  {certificateTypes.map((item) => {
                    const isSelected = item.certificateTypeID === selectedTypeId;
                    return (
                      <li key={item.certificateTypeID}>
                        <div
                          className={`sacrament-schema-item ${isSelected ? "is-selected" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedTypeId(item.certificateTypeID);
                            setNotice("");
                            setError("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedTypeId(item.certificateTypeID);
                              setNotice("");
                              setError("");
                            }
                          }}
                        >
                          <div className="sacrament-schema-item-main">
                            <strong>{item.label || "Certificate Type"}</strong>
                          </div>
                          <div className="sacrament-schema-item-actions">
                            <button
                              type="button"
                              className="sacrament-schema-item-action sacrament-schema-item-action--danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                setError("");
                                setNotice("");
                                setTypeRemoveTarget(item);
                              }}
                              disabled={isSaving}
                            >
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

            {selectedTypeId ? (
              <section className="sacrament-schema-editor sacrament-form-manager-editor" aria-live="polite">
                <div className="sacrament-schema-editor-header">
                  <h3 className="sacrament-schema-editor-title">
                    <span>{selectedTypeLabel}</span>
                    <button
                      type="button"
                      className="sacrament-schema-edit-icon-button"
                      aria-label={`Edit ${selectedTypeLabel}`}
                      title={`Edit ${selectedTypeLabel}`}
                      onClick={handleOpenNameModal}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                  </h3>
                  <form
                    className="certificate-type-fee-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (isFeeDirty) void saveCertificateTypeFee();
                    }}
                  >
                    <label htmlFor="certificate-type-fee">Fee (₱)</label>
                    <input
                      id="certificate-type-fee"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={feeDraft}
                      onChange={(event) => setFeeDraft(event.target.value)}
                      placeholder="Free"
                      title="Leave blank or enter 0 to make this certificate free."
                      disabled={isSaving}
                    />
                    <button type="submit" className="sacrament-theme-btn sacrament-theme-btn--quiet" disabled={isSaving || !isFeeDirty}>
                      {isSaving ? "Saving..." : "Save Fee"}
                    </button>
                    <button type="button" className="sacrament-theme-btn sacrament-theme-btn--primary" onClick={handleOpenAddFieldModal} disabled={isSaving}>
                      <Plus size={15} aria-hidden="true" />
                      Add Field
                    </button>
                  </form>
                </div>
                <div className="template-steps-header sacrament-questions-heading">
                  <h4>Questions on the form</h4>
                </div>
                <p className="sacrament-schema-hint">
                  These are the questions a parishioner answers when requesting this certificate. Use a clear name, then choose what kind of answer you need.
                </p>

                <div className="sacrament-schema-fields-list">
                  {editor.fields.length === 0 ? (
                    <div className="sacrament-schema-empty-state" role="status">
                      <span className="sacrament-schema-empty-icon" aria-hidden="true">
                        <Inbox size={28} strokeWidth={1.6} />
                      </span>
                      <h4>No input fields yet</h4>
                      <p>Add the fields users should fill when requesting this certificate.</p>
                    </div>
                  ) : (
                    editor.fields.map((field, index) => (
                      <article key={field.uiId} className="sacrament-schema-field-card">
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
                              aria-label={`Remove ${field.label || `field ${index + 1}`}`}
                              title="Remove field"
                            >
                              <X size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </header>
                        <div className="sacrament-schema-field-summary">
                          <span>
                            Type: <code>{field.type}</code>
                          </span>
                          <span>
                            Key: <code>{field.key || toCamelCaseKey(field.label) || `field_${index + 1}`}</code>
                          </span>
                          <span>
                            Placeholder:{" "}
                            <code>
                              {field.type === "list"
                                ? "Dynamic list of entries"
                                : field.label
                                  ? `Enter ${field.label}`
                                  : `Enter Field ${index + 1}`}
                            </code>
                          </span>
                          {field.type === "list" ? (
                            <span>
                              Minimum: <code>{field.minEntries || DEFAULT_MIN_LIST_ENTRIES}</code> entries
                            </span>
                          ) : null}
                        </div>

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
                    ))
                  )}
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

      {showAddTypeForm ? (
        <div className="template-delete-modal-overlay" role="presentation" onClick={() => !isSaving && setShowAddTypeForm(false)}>
          <section
            className="template-delete-modal sacrament-schema-add-type-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add certificate type"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <h4>Add certificate type</h4>
              <p>Enter one certificate name to create and store it in the certificate_type table.</p>
            </div>
            <div className="sacrament-schema-add-type">
              <label>
                Certificate Type Name
                <input
                  value={newTypeName}
                  onChange={(event) => setNewTypeName(toTitleCase(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddType();
                    }
                  }}
                  placeholder="Marriage Certificate"
                />
              </label>
              <label>
                Fee (₱)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={newTypeFee}
                  onChange={(event) => setNewTypeFee(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddType();
                    }
                  }}
                  placeholder="Free"
                  title="Leave blank or enter 0 to make this certificate free."
                />
              </label>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setShowAddTypeForm(false)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="template-modal-btn danger" onClick={() => void handleAddType()} disabled={isSaving}>
                {isSaving ? "Creating..." : "Create Type"}
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
            aria-label="Edit certificate type name"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <h4>Edit Certificate Type Name</h4>
              <p>Update the certificate type name stored in the database.</p>
            </div>
            <div className="sacrament-schema-add-type">
              <label>
                Certificate Type Name
                <input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(toTitleCase(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setIsNameSaveConfirmOpen(true);
                    }
                  }}
                  placeholder="Marriage Certificate"
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
            aria-label="Save certificate type name confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Save certificate type name?</h4>
              <p>This will update the selected certificate type name in the database.</p>
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
                  void saveCertificateTypeName();
                }}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Name"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
                        optionsText: nextType === "select" ? current.optionsText : "",
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
                    {newFieldOptions.length > 0 ? (
                      newFieldOptions.map((option, optionIndex) => (
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
              <p>This will add and save the field to the selected certificate type.</p>
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

      {typeRemoveTarget ? (
        <div
          className="template-delete-modal-overlay"
          role="presentation"
          onClick={() => !isSaving && setTypeRemoveTarget(null)}
        >
          <section
            className="template-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Archive certificate type confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-delete-modal-body">
              <span className="template-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h4>Archive this certificate type?</h4>
              <p>
                <strong>{typeRemoveTarget.certTypeName || typeRemoveTarget.label || "This certificate type"}</strong> will be
                moved to the archive.
              </p>
            </div>
            <div className="template-delete-modal-actions">
              <button type="button" className="template-modal-btn secondary" onClick={() => setTypeRemoveTarget(null)} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="template-modal-btn danger"
                onClick={() => void handleArchiveCertificateType(Number(typeRemoveTarget.certificateTypeID))}
                disabled={isSaving}
              >
                {isSaving ? "Archiving..." : "Archive"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
                This will apply the updated questions to this certificate type.
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

export default AdminCertificateTypes;
