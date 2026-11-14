import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleAlert, Eye, EyeOff, Pencil, X } from "lucide-react";
import Header from "../components/Header";
import PageGuide from "../components/PageGuide";
import "../components/Header.css";
import "./Dashboard.css";
import "./Profile.css";
import { pushUiNotice } from "../utils/uiNotice";
import { SETTINGS_UPDATED_EVENT, parseStoredSettings } from "../utils/appSettings";
import { t } from "../utils/i18n";

const PHONE_NUMBER_REGEX = /^09\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_REGEX = /^[^\s@]+@gmail\.com$/i;
const GMAIL_APP_PASSWORD_REGEX = /^[a-zA-Z0-9]{16}$/;
const normalizeGmailAppPassword = (value) => String(value || "").replace(/\s+/g, "").trim();
const normalizeMobileInput = (rawValue) => {
  let digitsOnly = String(rawValue || "").replace(/\D/g, "");
  if (digitsOnly.startsWith("639")) digitsOnly = `0${digitsOnly.slice(2)}`;
  else if (digitsOnly.startsWith("9")) digitsOnly = `0${digitsOnly}`;
  digitsOnly = digitsOnly.slice(0, 11);
  if (!digitsOnly) return "";
  if (digitsOnly[0] !== "0") return "";
  if (digitsOnly.length === 1) return "0";
  if (digitsOnly[1] !== "9") return "0";
  return digitsOnly;
};

const parseJson = (rawValue, fallbackValue) => {
  if (!rawValue) return fallbackValue;
  try {
    return JSON.parse(rawValue);
  } catch {
    return fallbackValue;
  }
};

const getActiveAuthState = () => {
  const localRaw = localStorage.getItem("faithflow_auth");
  if (localRaw) {
    return {
      source: "local",
      data: parseJson(localRaw, null),
    };
  }

  const sessionRaw = sessionStorage.getItem("faithflow_auth");
  return {
    source: "session",
    data: parseJson(sessionRaw, null),
  };
};

const formatDateLabel = (dateValue) => {
  const normalized = String(dateValue || "").trim();
  if (!normalized) return "Not provided";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Not provided";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatGenderLabel = (genderValue) => {
  const normalized = String(genderValue || "")
    .trim()
    .toLowerCase();
  if (normalized === "male") return "Male";
  if (normalized === "female") return "Female";
  return "Not provided";
};

const getInitials = (fullName) => {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "U";
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
};

const resolveProfilePhotoSource = (photoValue) => {
  const normalized = String(photoValue || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("data:")) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const userAssetMatch = normalized.match(/^(?:\/?(?:src\/)?assets\/)?user-photos\/(.+)$/i);
  if (userAssetMatch) return `/api/uploads/user-photos/${userAssetMatch[1]}`;
  const priestAssetMatch = normalized.match(/^(?:\/?(?:src\/)?assets\/)?priest-photos\/(.+)$/i);
  if (priestAssetMatch) return `/api/uploads/priest-photos/${priestAssetMatch[1]}`;
  const adminAssetMatch = normalized.match(/^(?:\/?(?:src\/)?assets\/)?admin-photos\/(.+)$/i);
  if (adminAssetMatch) return `/api/uploads/admin-photos/${adminAssetMatch[1]}`;
  if (normalized.startsWith("/uploads/")) return `/api${normalized}`;
  return normalized;
};

function Profile() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState(() => getActiveAuthState());
  const [profileUploadMessage, setProfileUploadMessage] = useState("");
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);

  useEffect(() => {
    if (!isPhotoViewerOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsPhotoViewerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPhotoViewerOpen]);
  const [smtpAppPassword, setSmtpAppPassword] = useState("");
  const [isSmtpAppPasswordVisible, setIsSmtpAppPasswordVisible] = useState(false);
  const [isEmailHelpOpen, setIsEmailHelpOpen] = useState(false);
  const [hasStoredPriestMailerPassword, setHasStoredPriestMailerPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordVisibility, setPasswordVisibility] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const passwordInputRefs = useRef({
    current: null,
    next: null,
    confirm: null,
  });
  const [language, setLanguage] = useState(() => parseStoredSettings().language);

  const authData = useMemo(() => {
    return authState.data;
  }, [authState]);

  const user = authData?.user;
  const accountType = authData?.accountType;
  const accountTypeForApi = accountType === "admin" ? "admin" : accountType === "priest" ? "priest" : "user";
  const profileApiBase = accountType === "admin" ? "/admin-api" : "/api";
  const profileUser = useMemo(() => profileData || user || null, [profileData, user]);
  const profilePhotoSource = resolveProfilePhotoSource(profileUser?.photo || profileUser?.profileImage);

  useEffect(() => {
    setProfileData(user || null);
  }, [user]);

  useEffect(() => {
    const roleLabel = accountType === "admin" ? "Admin" : accountType === "priest" ? "Priest" : "User";
    document.title = `Faithflow - ${roleLabel} Profile`;
  }, [accountType]);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    const handleSettingsRefresh = (event) => {
      const nextLanguage = event?.detail?.settings?.language;
      if (typeof nextLanguage === "string" && nextLanguage.trim()) {
        setLanguage(nextLanguage);
      }
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsRefresh);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsRefresh);
  }, []);

  useEffect(() => {
    if (!profileUploadMessage) return undefined;
    const timeoutId = window.setTimeout(() => {
      setProfileUploadMessage("");
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [profileUploadMessage]);

  useEffect(() => {
    if (!user) return;
    const accountID =
      accountType === "admin"
        ? Number(user?.adminID)
        : accountType === "priest"
          ? Number(user?.priestID)
          : Number(user?.userID);
    if (!Number.isInteger(accountID) || accountID <= 0) return;

    const loadProfile = async () => {
      try {
        const response = await fetch(`${profileApiBase}/profile?accountType=${accountTypeForApi}&accountID=${accountID}`);
        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(responseData.message || "Unable to load profile.");
        }
        setProfileData(responseData?.user || user);
      } catch (error) {
        setProfileUploadMessage(error.message || "Unable to load profile.");
      }
    };

    loadProfile();
  }, [accountType, accountTypeForApi, profileApiBase, user]);

  if (!user) return null;
  const isErrorNotice = /unable|please|required|invalid|must|not found|error/i.test(String(profileUploadMessage || ""));

  const accountID =
    accountType === "admin"
      ? Number(user?.adminID)
      : accountType === "priest"
        ? Number(user?.priestID)
        : Number(user?.userID);
  const isEditValueEmpty = !String(editingValue || "").trim();
  const isEditingContactNumberInvalid =
    editingField === "contactNumber" && String(editingValue || "").length > 0 && !PHONE_NUMBER_REGEX.test(String(editingValue || "").trim());
  const isEditingEmailField =
    editingField === "email" || (editingField === "userName" && accountType !== "admin");
  const isEditingEmailInvalid =
    isEditingEmailField &&
    String(editingValue || "").length > 0 &&
    (!EMAIL_REGEX.test(String(editingValue || "").trim()) ||
      ((accountType === "admin" || accountType === "user") && !GMAIL_REGEX.test(String(editingValue || "").trim())));
  const normalizedEditingAppPassword = normalizeGmailAppPassword(smtpAppPassword);
  const isAdminEmailEditor = editingField === "email" && accountType === "admin";
  const isEditingAppPasswordInvalid =
    isAdminEmailEditor &&
    normalizedEditingAppPassword.length > 0 &&
    !GMAIL_APP_PASSWORD_REGEX.test(normalizedEditingAppPassword);
  const currentPasswordValue = String(passwordForm.currentPassword || "");
  const newPasswordValue = String(passwordForm.newPassword || "");
  const confirmPasswordValue = String(passwordForm.confirmPassword || "");
  const currentPasswordAsteriskMask = "*".repeat(currentPasswordValue.length);
  const adminChurchDisplayName = profileUser.parishName || "Our Lady of Guadalupe Parish Villanueva";
  const adminSecretaryDisplayName = profileUser.fullName || profileUser.userName || profileUser.username || "Not provided";
  const editableCards = [
    ...(accountType === "admin"
      ? [{ key: "parishName", label: "Church Name", value: profileUser.parishName || "Not provided", full: true }]
      : []),
    ...(accountType === "admin"
      ? [{
          key: "fullName",
          label: "Parish Secretary Name",
          value: profileUser.fullName || "Not provided",
          full: false,
        }]
      : [
          {
            key: "firstName",
            label: "First Name",
            value: profileUser.firstName || "Not provided",
            full: false,
          },
          {
            key: "lastName",
            label: "Last Name",
            value: profileUser.lastName || "Not provided",
            full: false,
          },
        ]),
    {
      key: "userName",
      label: accountType === "admin" ? "Username" : "Email",
      value: profileUser.userName || profileUser.username || "Not provided",
      full: false,
    },
    {
      key: "contactNumber",
      label: accountType === "priest" ? "Phone Number" : "Contact Number",
      value: profileUser.contactNumber || "Not provided",
      full: false,
    },
    ...(accountType === "admin"
      ? [
          {
            key: "email",
            label: "Email",
            value: profileUser.email || "Not provided",
            full: false,
          },
        ]
      : []),
    ...(accountType === "user"
      ? [
          { key: "gender", label: "Gender", value: formatGenderLabel(profileUser.gender), full: false },
          { key: "birthdate", label: "Birthdate", value: formatDateLabel(profileUser.birthdate), full: true },
        ]
      : []),
    ...(accountType === "priest"
      ? [{ key: "priestID", label: "Priest ID", value: profileUser.priestID || "Not provided", full: false, readOnly: true }]
      : []),
    { key: "address", label: "Address", value: profileUser.address || "Not provided", full: true },
  ];

  const closeFieldEditModal = () => {
    setEditingField(null);
    setSmtpAppPassword("");
    setIsSmtpAppPasswordVisible(false);
    setIsEmailHelpOpen(false);
    setEditError("");
  };

  const openEditField = (fieldKey) => {
    const rawValue = profileUser?.[fieldKey];
    if (fieldKey === "birthdate") {
      const normalized = String(rawValue || "").trim();
      setEditingValue(/^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : normalized ? normalized.slice(0, 10) : "");
    } else if (fieldKey === "gender") {
      const normalized = String(rawValue || "")
        .trim()
        .toLowerCase();
      setEditingValue(normalized === "female" ? "female" : "male");
    } else {
      const nextValue = String(rawValue || "").trim();
      const isEmailField = fieldKey === "email" || (fieldKey === "userName" && accountType !== "admin");
      setEditingValue(isEmailField ? nextValue.toLowerCase() : nextValue);
    }
    setEditError("");
    setSmtpAppPassword("");
    setIsSmtpAppPasswordVisible(false);
    setIsEmailHelpOpen(false);
    setEditingField(fieldKey);
    if (fieldKey === "email" && accountType === "admin") {
      void (async () => {
        try {
          const response = await fetch("/admin-api/settings/priest-email");
          const responseData = await response.json().catch(() => ({}));
          if (!response.ok) {
            setHasStoredPriestMailerPassword(false);
            return;
          }
          setHasStoredPriestMailerPassword(Boolean(responseData?.hasStoredPassword));
        } catch {
          setHasStoredPriestMailerPassword(false);
        }
      })();
    }
  };

  const handleSaveFieldEdit = async () => {
    if (!editingField) return;
    const nextValue =
      editingField === "userName" && accountType !== "admin"
        ? String(editingValue || "").trim().toLowerCase()
        : String(editingValue || "").trim();
    if (!nextValue) {
      setEditError("This field is required.");
      return;
    }
    if (!Number.isInteger(accountID) || accountID <= 0) {
      setEditError("Unable to detect account.");
      return;
    }
    if (editingField === "contactNumber" && !PHONE_NUMBER_REGEX.test(nextValue)) {
      setEditError("Contact number must be 11 digits and start with 09.");
      return;
    }
    if (editingField === "email" && !EMAIL_REGEX.test(nextValue)) {
      setEditError("Please enter a valid email address.");
      return;
    }
    if (editingField === "email" && accountType === "admin" && !GMAIL_REGEX.test(nextValue)) {
      setEditError("Parish email must be a Gmail address (example@gmail.com).");
      return;
    }
    if (editingField === "email" && accountType === "user" && !GMAIL_REGEX.test(nextValue)) {
      setEditError("Please use a Gmail address (example@gmail.com).");
      return;
    }
    const normalizedAppPassword = normalizeGmailAppPassword(smtpAppPassword);
    const currentEmail = String(profileUser?.email || "").trim().toLowerCase();
    const isAdminEmailChange =
      editingField === "email" && accountType === "admin" && nextValue.toLowerCase() !== currentEmail;
    if (editingField === "email" && accountType === "admin") {
      if ((isAdminEmailChange || !hasStoredPriestMailerPassword) && !normalizedAppPassword) {
        setEditError("Paste the 16-character Gmail App Password, then click Save. Use the help icon if you need the steps.");
        return;
      }
      if (normalizedAppPassword && !GMAIL_APP_PASSWORD_REGEX.test(normalizedAppPassword)) {
        setEditError("Gmail App Password must be 16 letters and numbers from Google App passwords.");
        return;
      }
    }
    if (editingField === "userName" && accountType !== "admin") {
      const normalizedGmail = nextValue.toLowerCase();
      if (!/^[^\s@]+@gmail\.com$/i.test(normalizedGmail)) {
        setEditError("Username must be a Gmail address (example@gmail.com).");
        return;
      }
    }
    if (editingField === "gender" && !["male", "female"].includes(nextValue.toLowerCase())) {
      setEditError("Gender must be male or female.");
      return;
    }

    setIsSavingEdit(true);
    setEditError("");
    try {
      const response = await fetch(`${profileApiBase}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType: accountTypeForApi,
          accountID,
          [editingField]: nextValue,
          ...(editingField === "firstName" ? { lastName: profileUser.lastName || "" } : {}),
          ...(editingField === "lastName" ? { firstName: profileUser.firstName || "" } : {}),
          ...(editingField === "email" && accountType === "admin"
            ? { smtpAppPassword: normalizedAppPassword }
            : {}),
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to update profile.");
      }

      const nextAuthData = {
        ...authData,
        user: {
          ...(authData?.user || {}),
          ...(responseData?.user || {}),
        },
      };
      if (authState.source === "local") {
        localStorage.setItem("faithflow_auth", JSON.stringify(nextAuthData));
      } else {
        sessionStorage.setItem("faithflow_auth", JSON.stringify(nextAuthData));
      }
      setAuthState((current) => ({
        ...current,
        data: nextAuthData,
      }));
      setProfileData(nextAuthData.user);
      setEditingField(null);
      setEditingValue("");
      setSmtpAppPassword("");
      setIsSmtpAppPasswordVisible(false);
      setIsEmailHelpOpen(false);
      const successMessage =
        editingField === "email" && accountType === "admin"
          ? responseData.message || "Parish email updated. Priest password emails will now be sent from this Gmail."
          : editingField === "email"
            ? "Gmail updated. Sign in and password reset now use this address."
            : "Profile updated successfully.";
      setProfileUploadMessage(successMessage);
      pushUiNotice(successMessage);
    } catch (error) {
      setEditError(error.message || "Unable to update profile.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleProfileImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileUploadMessage("Please upload an image file.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileUploadMessage("Image size must be 5MB or smaller.");
      event.target.value = "";
      return;
    }

    const uploadAccountType = accountType === "admin" ? "admin" : accountType === "priest" ? "priest" : "user";
    const accountID =
      uploadAccountType === "admin"
        ? Number(user?.adminID)
        : uploadAccountType === "priest"
          ? Number(user?.priestID)
          : Number(user?.userID);
    if (!Number.isInteger(accountID) || accountID <= 0) {
      setProfileUploadMessage("Unable to detect account.");
      event.target.value = "";
      return;
    }

    setIsUploadingProfileImage(true);
    try {
      const payload = new FormData();
      payload.append("accountType", uploadAccountType);
      payload.append("accountID", String(accountID));
      payload.append("photo", file);

      const response = await fetch(`${profileApiBase}/profile/photo`, {
        method: "POST",
        body: payload,
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to upload profile photo.");
      }

      const nextAuthData = {
        ...authData,
        user: {
          ...(authData?.user || {}),
          ...(responseData?.user || {}),
          photo: responseData?.photo || responseData?.user?.photo || null,
        },
      };
      if (authState.source === "local") {
        localStorage.setItem("faithflow_auth", JSON.stringify(nextAuthData));
      } else {
        sessionStorage.setItem("faithflow_auth", JSON.stringify(nextAuthData));
      }
      setAuthState((current) => ({
        ...current,
        data: nextAuthData,
      }));
      setProfileData(nextAuthData.user);
      setProfileUploadMessage("Profile picture updated.");
      pushUiNotice("Profile picture updated.");
      window.dispatchEvent(new CustomEvent("faithflow-auth-updated"));
    } catch (error) {
      setProfileUploadMessage(error.message || "Unable to upload profile photo.");
    } finally {
      setIsUploadingProfileImage(false);
      event.target.value = "";
    }
  };

  const openChangePasswordModal = () => {
    setPasswordError("");
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setPasswordVisibility({
      current: false,
      next: false,
      confirm: false,
    });
    setIsChangePasswordOpen(true);
  };

  const handleChangePassword = async () => {
    const currentPassword = String(passwordForm.currentPassword || "");
    const newPassword = String(passwordForm.newPassword || "");
    const confirmPassword = String(passwordForm.confirmPassword || "");

    if (!Number.isInteger(accountID) || accountID <= 0) {
      setPasswordError("Unable to detect account.");
      return;
    }
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setPasswordError("All password fields are required.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password must match.");
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError("New password must be different from your current password.");
      return;
    }

    setIsChangingPassword(true);
    setPasswordError("");
    try {
      const response = await fetch(`${profileApiBase}/profile/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType: accountTypeForApi,
          accountID,
          currentPassword,
          newPassword,
        }),
      });
      const responseText = await response.text();
      let responseData = {};
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = {};
      }
      if (!response.ok) {
        const fallbackMessage = responseText.trim() || "Unable to change password.";
        throw new Error(responseData.message || fallbackMessage);
      }
      setIsChangePasswordOpen(false);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordVisibility({
        current: false,
        next: false,
        confirm: false,
      });
      setProfileUploadMessage("Password changed successfully.");
      pushUiNotice("Password changed successfully.");
    } catch (error) {
      setPasswordError(error.message || "Unable to change password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    if (accountType === "admin") {
      navigate("/admin/dashboard", { replace: true });
      return;
    }
    if (accountType === "priest") {
      navigate("/priest/dashboard", { replace: true });
      return;
    }
    navigate("/dashboard", { replace: true });
  };

  const togglePasswordVisibility = (fieldKey) => {
    setPasswordVisibility((current) => ({
      ...current,
      [fieldKey]: !current[fieldKey],
    }));
    window.requestAnimationFrame(() => {
      const activeInput = passwordInputRefs.current[fieldKey];
      if (!activeInput) return;
      const cursorPosition = String(activeInput.value || "").length;
      activeInput.focus();
      try {
        activeInput.setSelectionRange(cursorPosition, cursorPosition);
      } catch {
        // no-op for browsers that do not support selection range for this field type
      }
    });
  };

  return (
    <main className="profile-layout">
      <Header
        isSidebarOpen={false}
        onProfile={() => navigate("/profile")}
        onSettings={() => navigate(accountType === "admin" ? "/admin/settings" : accountType === "priest" ? "/priest/settings" : "/dashboard/settings")}
        onLogout={handleLogout}
      />
      {profileUploadMessage ? (
        <div className={`profile-top-notice${isErrorNotice ? " is-error" : ""}`} role="status">
          {profileUploadMessage}
        </div>
      ) : null}
      <div className="profile-body">
        <section className="profile-main">
          <section className="dashboard-panel dashboard-hero profile-page-hero">
            <div className="profile-page-hero-copy">
              <h2>{t("profile", "Profile", language)} <PageGuide pageKey="profile" /></h2>
            </div>
            <button type="button" className="profile-back-button" onClick={handleBack}>
              <span>{t("back", "Back", language)}</span>
            </button>
          </section>
          <section className="profile-card">
            <section className="profile-hero">
              <div className="profile-avatar-wrap">
                {profilePhotoSource ? (
                  <button
                    type="button"
                    className="profile-avatar-view-button"
                    aria-label="View profile picture"
                    onClick={() => setIsPhotoViewerOpen(true)}
                  >
                    <img
                      src={profilePhotoSource}
                      alt={`${profileUser.fullName || "User"} profile`}
                      className="profile-avatar-image"
                    />
                  </button>
                ) : (
                  <span className="profile-avatar-fallback">{getInitials(profileUser.fullName || profileUser.username)}</span>
                )}
              </div>
              <div className="profile-hero-info">
                <h3>{accountType === "admin" ? adminChurchDisplayName : profileUser.fullName || "Faithflow User"}</h3>
                <p>
                  {accountType === "admin"
                    ? `Parish Secretary: ${adminSecretaryDisplayName}`
                    : accountType === "priest"
                      ? "Priest Account"
                      : "Parishioner Account"}
                </p>
                <label className="profile-upload-button">
                  {isUploadingProfileImage
                    ? "Uploading..."
                    : profilePhotoSource
                      ? "Change Profile Picture"
                      : "Attach Profile Picture"}
                  <input type="file" accept="image/*" onChange={handleProfileImageChange} disabled={isUploadingProfileImage} />
                </label>
                <button type="button" className="profile-upload-button profile-change-password-button" onClick={openChangePasswordModal}>
                  Change Password
                </button>
              </div>
            </section>

            <div className="profile-grid">
              {editableCards.map((card) => (
                <article key={card.key} className={`profile-field${card.full ? " profile-field-full" : ""}`}>
                  <div className="profile-field-head">
                    <h3>{card.label}</h3>
                    {card.readOnly ? null : (
                    <button type="button" className="profile-edit-button" onClick={() => openEditField(card.key)} aria-label={`Edit ${card.label}`}>
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    )}
                  </div>
                  <p>{card.value}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      </div>
      {editingField ? (
        <div
          className="profile-edit-modal-overlay"
          role="presentation"
          onClick={closeFieldEditModal}
        >
          <section
            className={`profile-edit-modal${editingField === "email" && accountType === "admin" ? " profile-edit-modal--email" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Edit profile field"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="profile-edit-modal-heading">
              <h3>Edit {editableCards.find((card) => card.key === editingField)?.label || "Field"}</h3>
              {editingField === "email" && accountType === "admin" ? (
                <button
                  type="button"
                  className={`profile-email-help-button${isEmailHelpOpen ? " is-open" : ""}`}
                  onClick={() => setIsEmailHelpOpen((current) => !current)}
                  aria-expanded={isEmailHelpOpen}
                  aria-controls="profile-email-help-steps"
                  title="How to set up Gmail App Password"
                >
                  <CircleAlert size={18} aria-hidden="true" />
                  <span className="visually-hidden">How to change the parish Gmail and App Password</span>
                </button>
              ) : null}
            </div>
            {editingField === "email" && accountType === "admin" && isEmailHelpOpen ? (
              <ol id="profile-email-help-steps" className="profile-email-help-steps">
                <li>Go to your Google Account, then open <strong>Security</strong>.</li>
                <li>Turn on <strong>2-Step Verification</strong> if it is not already on.</li>
                <li>Open <strong>App passwords</strong> (search for it in the Google Account search box if you do not see it).</li>
                <li>Create a new app password named <strong>Faithflow</strong>.</li>
                <li>Google shows a 16-character code. Copy it, paste it in Gmail App Password below, then click Save.</li>
              </ol>
            ) : null}
            <div className="input-group">
              {editingField === "gender" ? (
                <select
                  id="profile-edit-input"
                  className="profile-edit-input"
                  aria-label="Profile edit value"
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  autoFocus
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              ) : (
                <input
                  id="profile-edit-input"
                  className={`profile-edit-input${isEditingContactNumberInvalid ? " invalid-phone" : ""}`}
                  aria-label="Profile edit value"
                  aria-invalid={isEditingContactNumberInvalid || isEditingEmailInvalid || undefined}
                  type={
                    editingField === "birthdate"
                      ? "date"
                      : editingField === "contactNumber"
                        ? "tel"
                        : isEditingEmailField
                          ? "email"
                          : "text"
                  }
                  value={editingValue}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    if (editingField === "contactNumber") {
                      setEditingValue(normalizeMobileInput(rawValue));
                    } else {
                      setEditingValue(isEditingEmailField ? rawValue.toLowerCase() : rawValue);
                    }
                  }}
                  autoCapitalize={isEditingEmailField ? "none" : undefined}
                  autoCorrect={isEditingEmailField ? "off" : undefined}
                  spellCheck={isEditingEmailField ? false : undefined}
                  data-title-case={isEditingEmailField ? "off" : undefined}
                  inputMode={editingField === "contactNumber" ? "numeric" : isEditingEmailField ? "email" : undefined}
                  pattern={editingField === "contactNumber" ? "09\\d{9}" : undefined}
                  minLength={editingField === "contactNumber" ? 11 : undefined}
                  maxLength={editingField === "contactNumber" ? 11 : undefined}
                  autoFocus
                />
              )}
            </div>
            {editingField === "email" && accountType === "admin" ? (
              <div className="input-group profile-sender-password-group">
                <label htmlFor="profile-smtp-app-password">Gmail App Password</label>
                <div className="profile-password-input-wrap">
                  <input
                    id="profile-smtp-app-password"
                    className={`profile-edit-input${isEditingAppPasswordInvalid ? " invalid-phone" : ""}`}
                    type={isSmtpAppPasswordVisible ? "text" : "password"}
                    autoComplete="off"
                    placeholder="16-character App Password from Google"
                    spellCheck={false}
                    maxLength={32}
                    value={smtpAppPassword}
                    onChange={(event) => setSmtpAppPassword(normalizeGmailAppPassword(event.target.value))}
                  />
                  <button
                    type="button"
                    className="profile-password-visibility-button"
                    onClick={() => setIsSmtpAppPasswordVisible((current) => !current)}
                    aria-label={isSmtpAppPasswordVisible ? "Hide Gmail App Password" : "Show Gmail App Password"}
                    aria-pressed={isSmtpAppPasswordVisible}
                  >
                    {isSmtpAppPasswordVisible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
                <span className="profile-password-helper-text">
                  {String(editingValue || "").trim().toLowerCase() === String(profileUser?.email || "").trim().toLowerCase() &&
                  hasStoredPriestMailerPassword
                    ? "This Gmail is already connected. Paste a new 16-character App Password only if you want to replace it."
                    : "Copy the 16-character code from Google App passwords, not from your inbox. Do not use the normal Gmail password."}
                </span>
              </div>
            ) : null}
            {editError ? <p className="profile-edit-error">{editError}</p> : null}
            <div className="profile-edit-actions">
              <button
                type="button"
                className="primary"
                onClick={handleSaveFieldEdit}
                disabled={isSavingEdit || isEditValueEmpty || isEditingEmailInvalid}
              >
                {isSavingEdit ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={closeFieldEditModal}
                disabled={isSavingEdit}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isPhotoViewerOpen && profilePhotoSource ? (
        <div className="profile-photo-viewer-overlay" role="presentation" onClick={() => setIsPhotoViewerOpen(false)}>
          <figure
            className="profile-photo-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="Profile picture"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="profile-photo-viewer-close"
              aria-label="Close picture"
              onClick={() => setIsPhotoViewerOpen(false)}
            >
              <X size={18} />
            </button>
            <img src={profilePhotoSource} alt={`${profileUser.fullName || "User"} profile`} />
          </figure>
        </div>
      ) : null}
      {isChangePasswordOpen ? (
        <div className="profile-edit-modal-overlay" role="presentation" onClick={() => setIsChangePasswordOpen(false)}>
          <section
            className="profile-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Change password"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Change Password</h3>
            <div className="profile-password-fields">
              <div className="input-group">
                <label htmlFor="profile-current-password">Current Password</label>
                <div className="profile-password-input-wrap">
                  <input
                    id="profile-current-password"
                    className="profile-edit-input"
                    type={passwordVisibility.current ? "text" : "password"}
                    ref={(node) => {
                      passwordInputRefs.current.current = node;
                    }}
                    autoComplete="current-password"
                    placeholder={passwordVisibility.current ? "Enter current password" : "***********"}
                    spellCheck={false}
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                    autoFocus
                  />
                  <button
                    type="button"
                    className="profile-password-visibility-button"
                    onClick={() => togglePasswordVisibility("current")}
                    aria-label={passwordVisibility.current ? "Hide current password" : "Show current password"}
                    aria-pressed={passwordVisibility.current}
                  >
                    {passwordVisibility.current ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div className="input-group">
                <label htmlFor="profile-new-password">New Password</label>
                <div className="profile-password-input-wrap">
                  <input
                    id="profile-new-password"
                    className="profile-edit-input"
                    type={passwordVisibility.next ? "text" : "password"}
                    ref={(node) => {
                      passwordInputRefs.current.next = node;
                    }}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    spellCheck={false}
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        newPassword: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="profile-password-visibility-button"
                    onClick={() => togglePasswordVisibility("next")}
                    aria-label={passwordVisibility.next ? "Hide new password" : "Show new password"}
                    aria-pressed={passwordVisibility.next}
                  >
                    {passwordVisibility.next ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div className="input-group">
                <label htmlFor="profile-confirm-password">Confirm New Password</label>
                <div className="profile-password-input-wrap">
                  <input
                    id="profile-confirm-password"
                    className="profile-edit-input"
                    type={passwordVisibility.confirm ? "text" : "password"}
                    ref={(node) => {
                      passwordInputRefs.current.confirm = node;
                    }}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    spellCheck={false}
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="profile-password-visibility-button"
                    onClick={() => togglePasswordVisibility("confirm")}
                    aria-label={passwordVisibility.confirm ? "Hide confirm password" : "Show confirm password"}
                    aria-pressed={passwordVisibility.confirm}
                  >
                    {passwordVisibility.confirm ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </div>
            {passwordError ? <p className="profile-edit-error">{passwordError}</p> : null}
            <div className="profile-edit-actions">
              <button type="button" className="primary" onClick={handleChangePassword} disabled={isChangingPassword}>
                {isChangingPassword ? "Saving..." : "Save Password"}
              </button>
              <button type="button" className="secondary" onClick={() => setIsChangePasswordOpen(false)} disabled={isChangingPassword}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default Profile;
