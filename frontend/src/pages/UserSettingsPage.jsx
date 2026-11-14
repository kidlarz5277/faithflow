import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import Header from "../components/Header";
import "../components/Header.css";
import "./Dashboard.css";
import "./Profile.css";
import "./UserSettingsPage.css";
import {
  SETTINGS_UPDATED_EVENT,
  applyAppSettings,
  clearThemeSettingsFromObject,
  extractThemeSettings,
  fetchGlobalThemeSettings,
  getStoredGlobalThemeSettings,
  parseStoredSettings,
  TEXT_STYLE_OPTIONS,
  readSignedInTextStyleAccount,
  saveAccountTextStyle,
  saveGlobalThemeSettings,
  saveAppSettings,
  setStoredGlobalThemeSettings,
  withThemeSettings,
} from "../utils/appSettings";
import { t } from "../utils/i18n";
import { pushUiNotice } from "../utils/uiNotice";
import { COLOR_PRESETS } from "../utils/colorPresets";
import logo from "../assets/logo.png";
import churchBackground from "../assets/church-background.jpg";
import { DEFAULT_ABOUT_PAGE_CONTENT, fetchAboutPageContent, saveAboutPageContent, splitParagraphs, splitParishHeroLines } from "../utils/aboutPageContent";
import "../App.css";

const PDF_PREVIEW_ROWS = [
  { userId: "482", name: "Buroto", type: "Baptism", status: "Ongoing", payment: "Unpaid", receipt: "—", paymentDate: "—" },
  {
    userId: "678",
    name: "Dio",
    type: "Confirmation Certificate",
    status: "Completed",
    payment: "Paid",
    receipt: "OR-10234",
    paymentDate: "Oct 2, 2026",
  },
  { userId: "632", name: "Sasuke", type: "Funeral Mass", status: "Ongoing", payment: "Free", receipt: "—", paymentDate: "—" },
];

const resolvePreviewPhoto = (photoValue) => {
  const normalized = String(photoValue || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("data:") || /^https?:\/\//i.test(normalized)) return normalized;
  const adminAssetMatch = normalized.match(/^(?:\/?(?:src\/)?assets\/)?admin-photos\/(.+)$/i);
  if (adminAssetMatch) return `/api/uploads/admin-photos/${adminAssetMatch[1]}`;
  if (normalized.startsWith("/uploads/")) return `/api${normalized}`;
  return normalized;
};

const PDF_LAYOUT_CHOICES = [
  {
    key: "pdfHeaderAlign",
    label: "Header",
    options: [
      { id: "left", label: "Left" },
      { id: "center", label: "Centered" },
    ],
  },
  {
    key: "pdfHeaderRule",
    label: "Header rule",
    options: [
      { id: "single", label: "Single line" },
      { id: "double", label: "Double line" },
    ],
  },
  {
    key: "pdfDensity",
    label: "Spacing",
    options: [
      { id: "standard", label: "Standard" },
      { id: "compact", label: "Compact" },
    ],
  },
  {
    key: "pdfTableStyle",
    label: "Table",
    options: [
      { id: "open", label: "Open rules" },
      { id: "grid", label: "Full grid" },
    ],
  },
];

const describePdfLayout = (settings) =>
  [
    settings.pdfHeaderAlign === "center" ? "Centered header" : "Left header",
    settings.pdfHeaderRule === "double" ? "Double rule" : "Single rule",
    settings.pdfDensity === "compact" ? "Compact spacing" : "Standard spacing",
    settings.pdfTableStyle === "grid" ? "Full grid" : "Open table",
    settings.pdfLogoShape === "oval" ? "Oval logo" : "Square logo",
    settings.pdfLogoBorder === "none" ? "Logo without border" : "Logo with border",
  ].join(" · ");

const PDF_INCLUDE_GROUPS = [
  {
    label: "Letterhead",
    options: [
      { key: "pdfShowLogo", label: "Church logo" },
      { key: "pdfShowParishName", label: "Parish name" },
      { key: "pdfShowAddress", label: "Address" },
      { key: "pdfShowFooter", label: "Footer" },
    ],
  },
];

const PDF_STYLE_KEYS = [
  "pdfPrintStyle",
  "pdfHeaderAlign",
  "pdfHeaderRule",
  "pdfDensity",
  "pdfTableStyle",
  "pdfLogoShape",
  "pdfLogoBorder",
  "pdfChurchLogo",
  "pdfReportTitle",
  "pdfSubtitle",
  "pdfFooterNote",
  "pdfShowLogo",
  "pdfShowParishName",
  "pdfShowAddress",
  "pdfShowGenerated",
  "pdfShowPeriod",
  "pdfShowRecordCount",
  "pdfShowType",
  "pdfShowStatus",
  "pdfShowPayment",
  "pdfShowSort",
  "pdfShowUserId",
  "pdfShowPersonName",
  "pdfShowAppointmentType",
  "pdfShowAppointmentStatus",
  "pdfShowPaymentStatus",
  "pdfShowReceiptNumber",
  "pdfShowPaymentDate",
  "pdfShowFooter",
];

const THEME_SETTING_KEYS = [
  "appTheme",
  "colorPreset",
  "primaryColor",
  "secondaryColor",
  "thirdColor",
  "backgroundColor",
  "containerColor",
  "backgroundStyle",
  "designStyle",
];

function PdfStylePreview({ settings, user }) {
  const headerAlign = settings.pdfHeaderAlign === "center" ? "center" : "left";
  const headerRule = settings.pdfHeaderRule === "double" ? "double" : "single";
  const density = settings.pdfDensity === "compact" ? "compact" : "standard";
  const tableStyle = settings.pdfTableStyle === "grid" ? "grid" : "open";
  const logoShape = settings.pdfLogoShape === "oval" ? "oval" : "square";
  const logoBorder = settings.pdfLogoBorder === "none" ? "plain" : "border";
  const parishName = String(user?.parishName || "Parish").trim() || "Parish";
  const parishAddress = String(user?.address || "").trim();
  const secretaryName = String(user?.fullName || "").trim();
  const initials =
    parishName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "P";
  const show = (key) => settings[key] !== false;
  const logoSource = settings.pdfChurchLogo || (show("pdfShowLogo") ? resolvePreviewPhoto(user?.photo) : "");
  const visibleColumns = [
    { key: "userId", label: "User ID" },
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status", pill: true },
    { key: "payment", label: "Payment", pill: true },
    { key: "receipt", label: "Receipt No." },
    { key: "paymentDate", label: "Date of Payment" },
  ];
  const previewPeriodLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <article className={`settings-pdf-page is-align-${headerAlign} is-rule-${headerRule} is-density-${density} is-table-${tableStyle} is-logo-${logoShape} is-logo-${logoBorder}`}>
      <header className="settings-pdf-page-brand">
        {show("pdfShowLogo") ? (
          <div className="settings-pdf-page-mark">
            {logoSource ? <img src={logoSource} alt="" /> : <span>{initials}</span>}
          </div>
        ) : null}
        <div className="settings-pdf-page-copy">
          {settings.pdfReportTitle ? <p className="settings-pdf-page-kicker">{settings.pdfReportTitle}</p> : null}
          {show("pdfShowParishName") ? <h4>{parishName}</h4> : null}
          {show("pdfShowAddress") && parishAddress ? <p>{parishAddress}</p> : null}
          <p className="settings-pdf-page-subtitle">{previewPeriodLabel}</p>
        </div>
      </header>
      <p className="settings-pdf-page-example">Example only. Printed columns come from the report.</p>
      <table>
        <thead>
          <tr>
            {visibleColumns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PDF_PREVIEW_ROWS.map((row) => (
            <tr key={`${row.userId}-${row.name}`}>
              {visibleColumns.map((column) => (
                <td key={column.key}>
                  {column.pill ? <em className={`is-${String(row[column.key]).toLowerCase()}`}>{row[column.key]}</em> : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={visibleColumns.length}>Total: {PDF_PREVIEW_ROWS.length} records</td>
          </tr>
        </tfoot>
      </table>
      {show("pdfShowFooter") ? (
        <footer>
          <span>
            {settings.pdfFooterNote || "Prepared through Faithflow"}
            {secretaryName ? ` • ${secretaryName}` : ""}
          </span>
          {show("pdfShowParishName") ? <span>{parishName}</span> : null}
        </footer>
      ) : null}
    </article>
  );
}

function UserSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settings, setSettings] = useState(parseStoredSettings);
  const [savedSettings, setSavedSettings] = useState(parseStoredSettings);
  const [settingsSection, setSettingsSection] = useState("");
  const [isCustomDesignOpen, setIsCustomDesignOpen] = useState(false);
  const [landingPage, setLandingPage] = useState(DEFAULT_ABOUT_PAGE_CONTENT);
  const [isSavingLandingPage, setIsSavingLandingPage] = useState(false);
  const [isThemeConfirmOpen, setIsThemeConfirmOpen] = useState(false);

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
  const isAdmin = accountType === "admin";

  useEffect(() => {
    document.title = "Faithflow - Settings";
  }, []);

  useEffect(() => {
    const requestedSection = new URLSearchParams(location.search).get("section");
    const allowedSections = isAdmin ? ["preferences", "design", "landing", "pdf"] : ["preferences"];
    if (requestedSection && allowedSections.includes(requestedSection)) {
      setSettingsSection(requestedSection);
    }
  }, [isAdmin, location.search]);

  useEffect(() => {
    let isSubscribed = true;
    const loadLandingPage = async () => {
      try {
        const content = await fetchAboutPageContent();
        if (isSubscribed) setLandingPage(content);
      } catch {
        // Keep the fixed landing page copy when the saved page cannot be loaded.
      }
    };
    void loadLandingPage();
    return () => {
      isSubscribed = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
    }
  }, [navigate, user, accountType]);

  useEffect(() => {
    const handleSettingsRefresh = (event) => {
      const nextSettings = event?.detail?.settings;
      if (!nextSettings) return;
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsRefresh);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsRefresh);
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    const synchronizeGlobalTheme = async () => {
      const localSettings = parseStoredSettings();
      let themeSettings = getStoredGlobalThemeSettings();
      try {
        themeSettings = await fetchGlobalThemeSettings();
      } catch {
        // Keep using cached global theme when API is unavailable.
      }
      setStoredGlobalThemeSettings(themeSettings);
      if (!isSubscribed) return;
      const mergedSettings = withThemeSettings(localSettings, themeSettings);
      saveAppSettings(mergedSettings);
      setSettings(mergedSettings);
      setSavedSettings(mergedSettings);
    };
    synchronizeGlobalTheme();
    return () => {
      isSubscribed = false;
    };
  }, []);

  if (!user) return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleSelectSetting = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleColorSetting = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
      colorPreset: "custom",
    }));
  };

  const applyColorPreset = (preset) => {
    if (!preset) return;
    setSettings((current) => ({
      ...current,
      colorPreset: preset.id,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      thirdColor: preset.thirdColor,
      backgroundColor: preset.backgroundColor,
      containerColor: preset.containerColor,
      backgroundStyle: preset.backgroundStyle,
      designStyle: preset.designStyle,
    }));
    setIsCustomDesignOpen(false);
  };

  const hasPendingChanges = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const hasPendingThemeChanges = THEME_SETTING_KEYS.some((key) => settings[key] !== savedSettings[key]);

  const handleApplyPdfStyle = () => {
    const nextStored = { ...parseStoredSettings() };
    PDF_STYLE_KEYS.forEach((key) => {
      nextStored[key] = settings[key];
    });
    saveAppSettings(nextStored);
    setSavedSettings((current) => {
      const nextSaved = { ...current };
      PDF_STYLE_KEYS.forEach((key) => {
        nextSaved[key] = settings[key];
      });
      return nextSaved;
    });
    pushUiNotice("PDF style saved.");
  };

  const updateLandingPage = (field, value) => {
    setLandingPage((current) => ({ ...current, [field]: value }));
  };

  const handleLandingBackgroundFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Choose an image file for the landing page background.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxWidth = 1600;
        const scale = image.width > maxWidth ? maxWidth / image.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        updateLandingPage("heroBackgroundImage", canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  };

  const landingPreviewPhoto = `url("${String(landingPage.heroBackgroundImage || churchBackground).replace(/"/g, "")}")`;

  const handleSaveLandingPage = async () => {
    if (isSavingLandingPage) return;
    setIsSavingLandingPage(true);
    try {
      const saved = await saveAboutPageContent(
        { ...landingPage, parishName: String(user?.parishName || landingPage.parishName || "").trim() },
        { adminID: Number(user?.adminID || 1) },
      );
      setLandingPage(saved);
      pushUiNotice("Landing page saved.");
    } catch (error) {
      window.alert(error?.message || "Unable to save landing page content.");
    } finally {
      setIsSavingLandingPage(false);
    }
  };

  const handleResetTextStyle = async () => {
    const textStyleAccount = readSignedInTextStyleAccount();
    if (!textStyleAccount) {
      window.alert("Sign in as a user or priest to reset the text style.");
      return;
    }
    try {
      const textStyle = await saveAccountTextStyle(textStyleAccount, "poppins");
      const nextSettings = { ...settings, textStyle };
      saveAppSettings(nextSettings);
      applyAppSettings(nextSettings);
      setSettings(nextSettings);
      setSavedSettings((current) => ({ ...current, textStyle }));
      pushUiNotice("Text style reset to Default.");
    } catch (error) {
      window.alert(error?.message || "Unable to reset text style.");
    }
  };

  const handleSaveSettings = async () => {
    if (!hasPendingChanges) return;
    if (isAdmin && hasPendingThemeChanges) {
      setIsThemeConfirmOpen(true);
      return;
    }
    await commitSettingsSave();
  };

  const commitSettingsSave = async () => {
    try {
      let nextSettings = settings;
      if (isAdmin && hasPendingThemeChanges) {
        const savedTheme = await saveGlobalThemeSettings(extractThemeSettings(settings), {
          adminID: Number(user?.adminID || 1),
        });
        setStoredGlobalThemeSettings(savedTheme);
        nextSettings = withThemeSettings(nextSettings, savedTheme);
      } else if (!isAdmin) {
        nextSettings = withThemeSettings(clearThemeSettingsFromObject(nextSettings), getStoredGlobalThemeSettings());
        const textStyleAccount = readSignedInTextStyleAccount();
        if (textStyleAccount) {
          nextSettings = {
            ...nextSettings,
            textStyle: await saveAccountTextStyle(textStyleAccount, nextSettings.textStyle),
          };
        }
      }
      saveAppSettings(nextSettings);
      applyAppSettings(nextSettings);
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      pushUiNotice(t("settingsSaved", "Settings saved.", nextSettings.language));
      setIsThemeConfirmOpen(false);
    } catch (error) {
      window.alert(error?.message || "Unable to save settings right now.");
    }
  };

  const handleBack = () => {
    if (Number(window.history.state?.idx) > 0) {
      navigate(-1);
      return;
    }
    if (accountType === "admin") {
      navigate("/admin/dashboard");
      return;
    }
    if (accountType === "priest") {
      navigate("/priest/dashboard");
      return;
    }
    navigate("/dashboard");
  };

  return (
    <main className="profile-layout settings-page">
      <Header
        isSidebarOpen={false}
        onProfile={() => navigate("/profile")}
        onSettings={() => navigate(accountType === "admin" ? "/admin/settings" : "/dashboard/settings")}
        onLogout={handleLogout}
      />
      <div className="profile-body">
        <section className="profile-main">
          <section className="dashboard-panel dashboard-hero profile-page-hero">
            <div className="profile-page-hero-copy">
              <h2>{t("settings", "Settings", settings.language)}</h2>
            </div>
            <button type="button" className="profile-back-button" onClick={handleBack}>
              <span>{t("back", "Back", settings.language)}</span>
            </button>
          </section>
          <section className="profile-card settings-profile-card">
            <section className={`settings-manager${settingsSection ? " is-editor-open" : " is-list-only"}`}>
              <aside className="settings-manager-list">
                <ul>
                  {[
                    { id: "preferences", label: t("appPreferences", "App Preferences", settings.language) },
                    ...(isAdmin
                      ? [
                          { id: "design", label: t("websiteDesign", "Website Design", settings.language) },
                          { id: "landing", label: "Landing Page" },
                          { id: "pdf", label: "PDF style" },
                        ]
                      : []),
                  ].map((section) => {
                    const isSelected = settingsSection === section.id;
                    return (
                      <li key={section.id}>
                        <button
                          type="button"
                          className={`settings-manager-item${isSelected ? " is-selected" : ""}`}
                          onClick={() => setSettingsSection(section.id)}
                        >
                          <strong>{section.label}</strong>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>

              {settingsSection === "preferences" ? (
                <section className="settings-manager-editor" key="preferences">
                  <h3>{t("appPreferences", "App Preferences", settings.language)}</h3>
                  <div className="settings-fields-grid">
                <label className="settings-field">
                  <span>{t("language", "Language", settings.language)}</span>
                  <select value={settings.language} onChange={(event) => handleSelectSetting("language", event.target.value)}>
                    <option value="en">{t("english", "English", settings.language)}</option>
                    <option value="fil">{t("tagalog", "Tagalog", settings.language)}</option>
                    <option value="ceb">{t("cebuano", "Bisaya (Cebuano)", settings.language)}</option>
                  </select>
                </label>
                {isAdmin ? (
                  <label className="settings-field">
                    <span>{t("theme", "Theme", settings.language)}</span>
                    <select value={settings.appTheme} onChange={(event) => handleSelectSetting("appTheme", event.target.value)}>
                      <option value="system">{t("systemDefault", "System Default", settings.language)}</option>
                      <option value="light">{t("light", "Light", settings.language)}</option>
                      <option value="dark">{t("dark", "Dark", settings.language)}</option>
                    </select>
                  </label>
                ) : null}
                {isAdmin ? (
                  <label className="settings-field">
                    <span>{t("timezone", "Timezone", settings.language)}</span>
                    <select value={settings.timezone} onChange={(event) => handleSelectSetting("timezone", event.target.value)}>
                      <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York</option>
                    </select>
                  </label>
                ) : null}
                {!isAdmin ? (
                  <label className="settings-field settings-text-style-field">
                    <span>Text style</span>
                    <select value={settings.textStyle || "poppins"} onChange={(event) => handleSelectSetting("textStyle", event.target.value)}>
                      {TEXT_STYLE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p
                      className="settings-text-style-preview"
                      style={{
                        fontFamily: TEXT_STYLE_OPTIONS.find((option) => option.id === (settings.textStyle || "poppins"))?.fontFamily,
                      }}
                    >
                      Faithflow preview. The parish calendar shows appointments, certificates, and progress in this text style.
                    </p>
                  </label>
                ) : null}
                <label className="settings-field">
                  <span>{t("dateFormat", "Date Format", settings.language)}</span>
                  <select value={settings.dateFormat} onChange={(event) => handleSelectSetting("dateFormat", event.target.value)}>
                    <option value="MMMM D, YYYY">April 13, 2026</option>
                    <option value="DD/MM/YYYY">13/04/2026</option>
                    <option value="MM/DD/YYYY">04/13/2026</option>
                  </select>
                </label>
                  </div>
                  <div className="settings-theme-actions-row">
                    {!isAdmin ? (
                      <button
                        type="button"
                        className="settings-action-button secondary"
                        onClick={handleResetTextStyle}
                        disabled={(settings.textStyle || "poppins") === "poppins" && (savedSettings.textStyle || "poppins") === "poppins"}
                      >
                        Reset text style
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="settings-action-button primary"
                      onClick={handleSaveSettings}
                      disabled={!hasPendingChanges}
                    >
                      {isAdmin ? "Save Theme & Settings" : "Save"}
                    </button>
                  </div>
                </section>
              ) : null}

              {settingsSection === "design" && isAdmin ? (
                <section className="settings-manager-editor" key="design">
                  <h3>{t("websiteDesign", "Website Design", settings.language)}</h3>
              {!isAdmin ? (
                <p className="settings-manual-note">
                  Theme settings are managed by admins and stay applied after closing the app.
                </p>
              ) : null}
              <div className="settings-design-sections">
              <div className={`settings-design-split${isCustomDesignOpen ? " is-open" : ""}`}>
              <section className="settings-design-section">
                <header className="settings-design-section-header">
                  <h4>Preview</h4>
                  {isAdmin && !isCustomDesignOpen ? (
                    <button
                      type="button"
                      className="settings-custom-design-button"
                      onClick={() => setIsCustomDesignOpen(true)}
                    >
                      Make your own design
                    </button>
                  ) : null}
                </header>
              <div
                className="settings-dashboard-preview"
                aria-label="Dashboard preview"
                style={{
                  "--preview-primary": settings.primaryColor,
                  "--preview-secondary": settings.secondaryColor,
                  "--preview-third": settings.thirdColor,
                  "--preview-background": settings.backgroundColor,
                  "--preview-container": settings.containerColor || "#FFF8F1",
                }}
                data-background-style={settings.backgroundStyle}
                data-color-preset={settings.colorPreset}
              >
                <div className="settings-dashboard-preview-frame">
                  <aside className="settings-dashboard-preview-sidebar" aria-hidden="true">
                    <span className="is-active">Dashboard</span>
                    <span>Status</span>
                    <span>History</span>
                  </aside>
                  <div className="settings-dashboard-preview-main">
                    <article className="settings-dashboard-preview-hero">
                      <strong>Mass Thursday</strong>
                      <span>Priest Schedule</span>
                      <span>10:00 AM – 11:00 AM</span>
                    </article>
                    <div className="settings-dashboard-preview-grid">
                      <article className="settings-dashboard-preview-card">
                        <header>Special Sacramental Programs</header>
                        <div className="settings-dashboard-preview-row">
                          <div>
                            <strong>Binyagan Ng Bayan</strong>
                            <span>September 30, 2026</span>
                          </div>
                          <button type="button" tabIndex={-1}>Apply</button>
                        </div>
                        <div className="settings-dashboard-preview-row">
                          <div>
                            <strong>Kasalan Ng Bayan</strong>
                            <span>November 5, 2026</span>
                          </div>
                          <button type="button" tabIndex={-1}>Apply</button>
                        </div>
                      </article>
                      <article className="settings-dashboard-preview-card is-calendar">
                        <header>Calendar</header>
                        <div className="settings-dashboard-preview-days" aria-hidden="true">
                          <span>1</span>
                          <span className="is-primary">5</span>
                          <span className="is-secondary">8</span>
                          <span>12</span>
                          <span className="is-third">17</span>
                          <span className="is-primary">24</span>
                        </div>
                      </article>
                    </div>
                    <article className="settings-dashboard-preview-activity">
                      <header>Recent Parish Activity</header>
                      <strong>Huhay</strong>
                      <span>August 30, 2026</span>
                    </article>
                  </div>
                </div>
              </div>
              </section>
              <section className="settings-design-section settings-design-colors-pane" aria-hidden={!isCustomDesignOpen}>
                <h4>Colors</h4>
              <div className="settings-fields-grid">
                <label className="settings-field">
                  <span>{t("firstColor", "1st Color", settings.language)}</span>
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={(event) => handleColorSetting("primaryColor", event.target.value)}
                    disabled={!isAdmin}
                  />
                </label>
                <label className="settings-field">
                  <span>{t("secondColor", "2nd Color", settings.language)}</span>
                  <input
                    type="color"
                    value={settings.secondaryColor}
                    onChange={(event) => handleColorSetting("secondaryColor", event.target.value)}
                    disabled={!isAdmin}
                  />
                </label>
                <label className="settings-field">
                  <span>{t("thirdColor", "3rd Color", settings.language)}</span>
                  <input
                    type="color"
                    value={settings.thirdColor}
                    onChange={(event) => handleColorSetting("thirdColor", event.target.value)}
                    disabled={!isAdmin}
                  />
                </label>
                <label className="settings-field">
                  <span>{t("backgroundColor", "Background Color", settings.language)}</span>
                  <input
                    type="color"
                    value={settings.backgroundColor}
                    onChange={(event) => handleColorSetting("backgroundColor", event.target.value)}
                    disabled={!isAdmin}
                  />
                </label>
                <label className="settings-field">
                  <span>{t("containerColor", "Container Color", settings.language)}</span>
                  <input
                    type="color"
                    value={settings.containerColor || "#FFF8F1"}
                    onChange={(event) => handleColorSetting("containerColor", event.target.value)}
                    disabled={!isAdmin}
                  />
                </label>
              </div>
              <h4>Style</h4>
              <div className="settings-fields-grid">
                <label className="settings-field">
                  <span>{t("backgroundStyle", "Background Style", settings.language)}</span>
                  <select
                    value={settings.backgroundStyle}
                    onChange={(event) => handleSelectSetting("backgroundStyle", event.target.value)}
                    disabled={!isAdmin}
                  >
                    <option value="solid">Solid</option>
                    <option value="gradient">Gradient</option>
                    <option value="soft-pattern">Soft Pattern</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>{t("designStyle", "Design Style", settings.language)}</span>
                  <select
                    value={settings.designStyle}
                    onChange={(event) => handleSelectSetting("designStyle", event.target.value)}
                    disabled={!isAdmin}
                  >
                    <option value="classic">Classic</option>
                    <option value="modern">Modern</option>
                    <option value="soft">Soft</option>
                  </select>
                </label>
              </div>
              </section>
              </div>
              <section className="settings-design-section">
                <h4>Presets</h4>
              <div className="settings-preset-grid">
                {COLOR_PRESETS.map((preset) => {
                  const isActive = settings.colorPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`settings-preset-card${isActive ? " is-active" : ""}`}
                      style={{
                        "--preset-accent": preset.primaryColor,
                        "--preset-metal": preset.secondaryColor,
                        "--preset-third": preset.thirdColor,
                      }}
                      onClick={() => applyColorPreset(preset)}
                      disabled={!isAdmin}
                    >
                      <span className="settings-preset-title">{preset.name}</span>
                      <span className="settings-preset-swatches" aria-hidden="true">
                        <span style={{ backgroundColor: preset.primaryColor }} />
                        <span style={{ backgroundColor: preset.secondaryColor }} />
                        <span style={{ backgroundColor: preset.thirdColor }} />
                        <span style={{ backgroundColor: preset.backgroundColor }} />
                      </span>
                    </button>
                  );
                })}
              </div>
              </section>
              </div>
              <div className="settings-theme-actions-row">
                <button
                  type="button"
                  className="settings-action-button primary"
                  onClick={handleSaveSettings}
                  disabled={!hasPendingChanges}
                >
                  Save Theme & Settings
                </button>
              </div>
                </section>
              ) : null}

              {settingsSection === "pdf" && isAdmin ? (
                <section className="settings-manager-editor is-pdf" key="pdf">
                  <h3>PDF style</h3>
                  <p className="settings-manual-note">Arrange the letterhead, then check the page on the right.</p>
                  <div className="settings-pdf-modal-layout">
                    <div className="settings-pdf-modal-body">
                      <section className="settings-pdf-group">
                        <h4>Layout</h4>
                        <div className="settings-pdf-choice-list">
                          {PDF_LAYOUT_CHOICES.map((group) => (
                            <div key={group.key} className="settings-pdf-choice-row">
                              <span>{group.label}</span>
                              <div className="settings-pdf-style-options is-pair" role="radiogroup" aria-label={group.label}>
                                {group.options.map((option) => {
                                  const isSelected = (settings[group.key] || group.options[0].id) === option.id;
                                  return (
                                    <label key={option.id} className={`settings-pdf-style-option${isSelected ? " is-active" : ""}`}>
                                      <input
                                        type="radio"
                                        name={group.key}
                                        value={option.id}
                                        checked={isSelected}
                                        onChange={() => handleSelectSetting(group.key, option.id)}
                                      />
                                      {option.label}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="settings-pdf-group">
                        <h4>Letterhead</h4>
                        <div className="settings-pdf-choice-row">
                          <span>Logo</span>
                          <div className="settings-pdf-style-options is-pair" role="radiogroup" aria-label="Logo shape">
                            {[
                              { id: "square", label: "Square" },
                              { id: "oval", label: "Oval" },
                            ].map((option) => {
                              const isSelected = (settings.pdfLogoShape || "square") === option.id;
                              return (
                                <label key={option.id} className={`settings-pdf-style-option${isSelected ? " is-active" : ""}`}>
                                  <input
                                    type="radio"
                                    name="pdfLogoShape"
                                    value={option.id}
                                    checked={isSelected}
                                    onChange={() => handleSelectSetting("pdfLogoShape", option.id)}
                                  />
                                  {option.label}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="settings-pdf-choice-row">
                          <span>Logo border</span>
                          <div className="settings-pdf-style-options is-pair" role="radiogroup" aria-label="Logo border">
                            {[
                              { id: "border", label: "With border" },
                              { id: "none", label: "No border" },
                            ].map((option) => {
                              const isSelected = (settings.pdfLogoBorder || "border") === option.id;
                              return (
                                <label key={option.id} className={`settings-pdf-style-option${isSelected ? " is-active" : ""}`}>
                                  <input
                                    type="radio"
                                    name="pdfLogoBorder"
                                    value={option.id}
                                    checked={isSelected}
                                    onChange={() => handleSelectSetting("pdfLogoBorder", option.id)}
                                  />
                                  {option.label}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <label className="settings-field">
                          <span>Report heading</span>
                          <input
                            type="text"
                            maxLength={80}
                            value={settings.pdfReportTitle || ""}
                            onChange={(event) => handleSelectSetting("pdfReportTitle", event.target.value)}
                          />
                        </label>
                        <p className="settings-manual-note">The line under the parish name is the month or year chosen when the report is printed.</p>
                        <label className="settings-field">
                          <span>Footer note</span>
                          <input
                            type="text"
                            maxLength={120}
                            value={settings.pdfFooterNote || ""}
                            onChange={(event) => handleSelectSetting("pdfFooterNote", event.target.value)}
                          />
                        </label>
                      </section>

                      <section className="settings-pdf-group">
                        <h4>Shown on the page</h4>
                        {PDF_INCLUDE_GROUPS.map((group) => (
                          <div key={group.label} className="settings-pdf-include-group">
                            <h5>{group.label}</h5>
                            <div className="settings-pdf-include-list">
                              {group.options.map((option) => (
                                <label key={option.key} className="settings-pdf-include">
                                  <input
                                    type="checkbox"
                                    checked={settings[option.key] !== false}
                                    onChange={(event) => handleSelectSetting(option.key, event.target.checked)}
                                  />
                                  {option.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </section>
                    </div>
                    <aside className="settings-pdf-preview-pane" aria-label="PDF page preview">
                      <p>Page preview</p>
                      <PdfStylePreview settings={settings} user={user} />
                    </aside>
                  </div>
                  <div className="settings-theme-actions-row">
                    <button type="button" className="settings-action-button primary" onClick={handleApplyPdfStyle}>
                      Save PDF style
                    </button>
                  </div>
                </section>
              ) : null}

              {settingsSection === "landing" && isAdmin ? (
                <section className="settings-manager-editor is-landing" key="landing">
                  <h3>Landing Page Preview</h3>
                  <div className="settings-landing-background-editor">
                    <div>
                      <p>Background photo</p>
                      <span>This photo fills the landing page, including the parish name banner.</span>
                    </div>
                    <img src={landingPage.heroBackgroundImage || churchBackground} alt="Landing page background preview" />
                    <label className="settings-action-button primary">
                      Change photo
                      <input type="file" accept="image/*" onChange={handleLandingBackgroundFile} />
                    </label>
                    <button type="button" className="settings-action-button" onClick={() => updateLandingPage("heroBackgroundImage", "")}>
                      Use parish photo
                    </button>
                  </div>
                  <div className="settings-about-preview" aria-label="About Us live preview" style={{ "--landing-photo": landingPreviewPhoto }}>
                    <section className="about-page">
                      <header className="about-header">
                        <div className="about-header-bar">
                          <div className="about-header-brand">
                            <img className="about-header-logo" src={logo} alt="" />
                            <h1>Faithflow</h1>
                          </div>
                          <div className="about-header-actions">
                            <span className="about-faq-link">FAQs</span>
                            <span className="about-login-link">Login</span>
                            <span className="about-signup-link">Sign Up</span>
                          </div>
                        </div>
                        <section className="about-hero">
                          <div className="about-hero-content">
                            <h3 className="about-hero-title" title="This name is edited from the admin profile.">
                              {splitParishHeroLines(user?.parishName || landingPage.parishName).map((line) => (
                                <span key={line}>{line}</span>
                              ))}
                            </h3>
                            <textarea
                              className="settings-about-body-input is-on-photo"
                              aria-label="Parish tagline"
                              rows={2}
                              value={landingPage.parishTagline}
                              onChange={(event) => updateLandingPage("parishTagline", event.target.value)}
                            />
                          </div>
                          <div className="about-hero-badges">
                            <article className="about-hero-badge about-hero-offer-card">
                              <p className="about-hero-offer-title">Sacramental Service Offer</p>
                              <div className="about-hero-offer-list">
                                {landingPage.sacramentalOffers.map((offer) => (
                                  <span key={offer}>{offer}</span>
                                ))}
                              </div>
                            </article>
                            <article className="about-hero-badge about-hero-offer-card">
                              <p className="about-hero-offer-title">Online Certificate Offer</p>
                              <div className="about-hero-offer-list">
                                {landingPage.certificateOffers.map((offer) => (
                                  <span key={offer}>{offer}</span>
                                ))}
                              </div>
                            </article>
                          </div>
                        </section>
                      </header>
                      <section className="about-main">
                        <article className="about-content">
                          <h3>Online Appointment Scheduling System</h3>
                          <section className="about-features">
                            <h4>What you can do with FaithFlow</h4>
                            <div className="about-feature-grid">
                              <article className="about-feature-item">
                                <h5>Request Parish Services</h5>
                                <p>Submit requests for Christening, Marriage, Funeral Mass, and Blessings.</p>
                              </article>
                              <article className="about-feature-item">
                                <h5>Request Certificates</h5>
                                <p>Apply for Baptismal and Marriage Certificates online with fewer steps.</p>
                              </article>
                              <article className="about-feature-item">
                                <h5>Stay Updated</h5>
                                <p>Receive parish updates, schedule information, and service announcements.</p>
                              </article>
                              <article className="about-feature-item">
                                <h5>Track Requests</h5>
                                <p>Monitor request progress with better transparency and organized records.</p>
                              </article>
                            </div>
                          </section>
                          <div className="about-pillars">
                            <section className="about-card mission">
                              <input
                                className="settings-about-title-input"
                                aria-label="Mission title"
                                value={landingPage.missionTitle}
                                onChange={(event) => updateLandingPage("missionTitle", event.target.value)}
                              />
                              <textarea
                                className="settings-about-body-input"
                                aria-label="Mission"
                                rows={8}
                                value={landingPage.missionBody}
                                onChange={(event) => updateLandingPage("missionBody", event.target.value)}
                              />
                            </section>
                            <section className="about-card vision">
                              <input
                                className="settings-about-title-input"
                                aria-label="Vision title"
                                value={landingPage.visionTitle}
                                onChange={(event) => updateLandingPage("visionTitle", event.target.value)}
                              />
                              <textarea
                                className="settings-about-body-input"
                                aria-label="Vision"
                                rows={8}
                                value={landingPage.visionBody}
                                onChange={(event) => updateLandingPage("visionBody", event.target.value)}
                              />
                            </section>
                          </div>
                          <section className="about-description">
                            <h4>{landingPage.brandTitle}</h4>
                            {splitParagraphs(landingPage.brandBody).map((paragraph, index) => (
                              <p key={`brand-${index}`}>{paragraph}</p>
                            ))}
                          </section>
                        </article>
                      </section>
                      <footer className="about-footer">
                        <div className="about-footer-item">
                          <span>© 2026 Faithflow. Parish Service System. All rights reserved.</span>
                        </div>
                      </footer>
                    </section>
                  </div>
                  <div className="settings-theme-actions-row">
                    <button
                      type="button"
                      className="settings-action-button primary"
                      onClick={handleSaveLandingPage}
                      disabled={isSavingLandingPage}
                    >
                      {isSavingLandingPage ? "Saving..." : "Save Landing Page"}
                    </button>
                  </div>
                </section>
              ) : null}
            </section>
          </section>
        </section>
      </div>
      {isThemeConfirmOpen ? (
        <div className="settings-confirm-overlay" role="presentation" onClick={() => setIsThemeConfirmOpen(false)}>
          <section
            className="settings-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Change website color theme confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-confirm-body">
              <span className="settings-confirm-icon" aria-hidden="true">
                <CheckCircle2 size={24} />
              </span>
              <h4>Change the website color theme?</h4>
              <p>Are you sure you want to change the website color theme?</p>
            </div>
            <div className="settings-confirm-actions">
              <button type="button" className="settings-confirm-btn secondary" onClick={() => setIsThemeConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="settings-confirm-btn primary" onClick={() => void commitSettingsSave()}>
                Save
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default UserSettingsPage;
