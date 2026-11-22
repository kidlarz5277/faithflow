import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Image as ImageIcon, X } from "lucide-react";
import logo from "./assets/logo.png";
import churchBackground from "./assets/church-background.jpg";
import ParishActivityMediaCarousel from "./components/ParishActivityMediaCarousel";
import { compareParishActivitiesNewestFirst } from "./utils/parishActivityOrder";
import {
  ABOUT_PAGE_STORAGE_KEY,
  ABOUT_PAGE_UPDATED_EVENT,
  DEFAULT_ABOUT_PAGE_CONTENT,
  fetchAboutPageContent,
  sanitizeAboutPageContent,
  splitParagraphs,
  splitParishHeroLines,
} from "./utils/aboutPageContent";
import { fetchAccountTextStyle, parseStoredSettings, saveAppSettings } from "./utils/appSettings";
import "./App.css";

const resolveParishActivityImageSrc = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("data:") || normalized.startsWith("blob:") || /^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("/assets/parish-activity-media/")) {
    const fileName = normalized.split("/").pop();
    return fileName ? `/api/uploads/parish-activities/${fileName}` : normalized;
  }
  if (normalized.startsWith("/uploads/")) return `/api${normalized}`;
  return normalized;
};

const getParishActivityMediaReference = (item) => String(item?.filePath || item?.url || "").trim();

const getParishActivityCoverMedia = (entry) => {
  if (Array.isArray(entry?.media) && entry.media.length > 0) {
    const item = entry.media[0];
    const filePath = getParishActivityMediaReference(item);
    return {
      type: item?.type === "video" ? "video" : "image",
      filePath,
      url: filePath,
    };
  }
  const legacyImagePath = String(entry?.imageUrl || "").trim();
  return legacyImagePath ? { type: "image", filePath: legacyImagePath, url: legacyImagePath } : null;
};

const renderParishActivityCoverMedia = (entry) => {
  const coverMedia = getParishActivityCoverMedia(entry);
  const mediaReference = getParishActivityMediaReference(coverMedia);
  if (!mediaReference) {
    return <div className="about-parish-activity-media-empty">No media available</div>;
  }
  const src = resolveParishActivityImageSrc(mediaReference);
  if (coverMedia.type === "video") {
    return <video src={src} muted playsInline preload="metadata" aria-label={entry?.title || "Parish activity"} />;
  }
  return (
    <>
      <img className="about-parish-activity-media-backdrop" src={src} alt="" aria-hidden="true" />
      <img className="about-parish-activity-media-main" src={src} alt={entry?.title || "Parish activity"} />
    </>
  );
};

const renderParishActivityMediaPreview = (item, altText = "Parish activity media") => {
  const mediaReference = getParishActivityMediaReference(item);
  if (!mediaReference) return null;
  const src = resolveParishActivityImageSrc(mediaReference);
  if (item.type === "video") {
    return <video src={src} controls playsInline preload="metadata" aria-label={altText} className="about-parish-activity-modal-image" />;
  }
  return <img src={src} alt={altText} className="about-parish-activity-modal-image" />;
};

const normalizeParishActivityMediaForDisplay = (entry) => {
  if (Array.isArray(entry?.media) && entry.media.length > 0) {
    return entry.media
      .map((item) => {
        const filePath = getParishActivityMediaReference(item);
        return {
          type: item?.type === "video" ? "video" : "image",
          filePath,
          url: filePath,
          summary: String(item?.summary || item?.description || item?.caption || "").trim(),
        };
      })
      .filter((item) => item.filePath);
  }
  const legacyImagePath = String(entry?.imageUrl || "").trim();
  return legacyImagePath ? [{ type: "image", filePath: legacyImagePath, url: legacyImagePath }] : [];
};

const formatParishActivityPostDate = (dateValue) => {
  const normalizedDate = String(dateValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) return "";
  return new Date(`${normalizedDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const PHONE_NUMBER_REGEX = /^09\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isGmailAddress = (email) => String(email || "").trim().toLowerCase().endsWith("@gmail.com");
const MIN_PASSWORD_LENGTH = 6;
const normalizeMobileInput = (rawValue) => {
  const digitsOnly = String(rawValue || "").replace(/\D/g, "").slice(0, 11);
  if (!digitsOnly) return "";
  if (digitsOnly[0] !== "0") return "";
  if (digitsOnly.length === 1) return "0";
  if (digitsOnly[1] !== "9") return "0";
  return digitsOnly;
};

function App({ initialPage = "about" }) {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState("about");
  const [authModal, setAuthModal] = useState(initialPage === "login" || initialPage === "register" || initialPage === "forgot" ? initialPage : null);
  const [loginFormData, setLoginFormData] = useState({
    userName: "",
    password: "",
    rememberMe: false,
  });
  const [registerFormData, setRegisterFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    contactNumber: "",
    address: "",
    birthdate: "",
    gender: "",
    password: "",
    confirmPassword: "",
  });
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [isSubmittingForgotPassword, setIsSubmittingForgotPassword] = useState(false);
  const [isSubmittingRegister, setIsSubmittingRegister] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [loginErrorMessage, setLoginErrorMessage] = useState("");
  const [loginSuccessMessage, setLoginSuccessMessage] = useState("");
  const [forgotPasswordIdentifier, setForgotPasswordIdentifier] = useState("");
  const [forgotPasswordErrorMessage, setForgotPasswordErrorMessage] = useState("");
  const [forgotPasswordSuccessMessage, setForgotPasswordSuccessMessage] = useState("");
  const [registerErrorMessage, setRegisterErrorMessage] = useState("");
  const [registerSuccessMessage, setRegisterSuccessMessage] = useState("");
  const [aboutParishActivities, setAboutParishActivities] = useState([]);
  const [isLoadingAboutParishActivities, setIsLoadingAboutParishActivities] = useState(false);
  const [aboutParishActivitiesError, setAboutParishActivitiesError] = useState("");
  const [aboutParishActivitySlideIndex, setAboutParishActivitySlideIndex] = useState(0);
  const [isAboutParishActivityModalOpen, setIsAboutParishActivityModalOpen] = useState(false);
  const [selectedAboutParishActivity, setSelectedAboutParishActivity] = useState(null);
  const [registerReturnPage, setRegisterReturnPage] = useState("about");
  const [aboutPageContent, setAboutPageContent] = useState(() => sanitizeAboutPageContent(DEFAULT_ABOUT_PAGE_CONTENT));

  useEffect(() => {
    setCurrentPage("about");
    setAuthModal(initialPage === "login" || initialPage === "register" || initialPage === "forgot" ? initialPage : null);
  }, [initialPage]);

  useEffect(() => {
    if (authModal === "login") {
      document.title = "Faithflow - Login";
      return;
    }
    if (authModal === "forgot") {
      document.title = "Faithflow - Forgot Password";
      return;
    }
    if (authModal === "register") {
      document.title = "Faithflow - Register User";
      return;
    }
    document.title = "Faithflow - About";
  }, [authModal]);

  useEffect(() => {
    if (currentPage !== "about") return;
    let isActive = true;
    const loadAboutParishActivities = async () => {
      setIsLoadingAboutParishActivities(true);
      setAboutParishActivitiesError("");
      try {
        const response = await fetch("/api/public/parish-activities?adminID=1");
        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(responseData?.message || "Unable to load parish activities.");
        }
        if (!isActive) return;
        setAboutParishActivities(Array.isArray(responseData) ? responseData : []);
      } catch (error) {
        if (!isActive) return;
        setAboutParishActivities([]);
        setAboutParishActivitiesError(error.message || "Unable to load parish activities.");
      } finally {
        if (isActive) {
          setIsLoadingAboutParishActivities(false);
        }
      }
    };
    void loadAboutParishActivities();
    return () => {
      isActive = false;
    };
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== "about") return undefined;
    let isActive = true;
    const applyAboutContent = (nextContent) => {
      if (!nextContent) return;
      setAboutPageContent(sanitizeAboutPageContent(nextContent));
    };
    const loadAboutPageContent = async () => {
      try {
        const loadedContent = await fetchAboutPageContent();
        const adminResponse = await fetch("/admin-api/admins", { cache: "no-store" });
        const adminRows = await adminResponse.json().catch(() => []);
        const profileParishName = String(Array.isArray(adminRows) ? adminRows[0]?.parishName : "").trim();
        if (!isActive) return;
        applyAboutContent({
          ...loadedContent,
          ...(profileParishName ? { parishName: profileParishName } : {}),
        });
      } catch {
        if (!isActive) return;
        applyAboutContent(DEFAULT_ABOUT_PAGE_CONTENT);
      }
    };
    void loadAboutPageContent();
    const handleAboutPageUpdated = (event) => {
      applyAboutContent(event?.detail?.aboutPage);
    };
    const handleAboutPageStorage = (event) => {
      if (event.key !== ABOUT_PAGE_STORAGE_KEY || !event.newValue) return;
      try {
        applyAboutContent(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed local copies and keep the current About Us content.
      }
    };
    const handleAboutPageVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadAboutPageContent();
    };
    window.addEventListener(ABOUT_PAGE_UPDATED_EVENT, handleAboutPageUpdated);
    window.addEventListener("storage", handleAboutPageStorage);
    window.addEventListener("focus", handleAboutPageVisible);
    document.addEventListener("visibilitychange", handleAboutPageVisible);
    return () => {
      isActive = false;
      window.removeEventListener(ABOUT_PAGE_UPDATED_EVENT, handleAboutPageUpdated);
      window.removeEventListener("storage", handleAboutPageStorage);
      window.removeEventListener("focus", handleAboutPageVisible);
      document.removeEventListener("visibilitychange", handleAboutPageVisible);
    };
  }, [currentPage]);

  const handleInputChange = (event, setState) => {
    const { name, type, value, checked } = event.target;
    const normalizedValue = name === "contactNumber" ? normalizeMobileInput(value) : value;
    setState((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : normalizedValue,
    }));
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setLoginErrorMessage("");
    setLoginSuccessMessage("");
    setIsSubmittingLogin(true);

    try {
      const loginPayload = {
        userName: loginFormData.userName.trim(),
        password: loginFormData.password.trim(),
      };
      const requestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginPayload),
      };
      const userResponse = await fetch("/api/login", requestOptions);
      const userResponseData = await userResponse.json().catch(() => ({}));

      let response = userResponse;
      let responseData = userResponseData;

      if (!userResponse.ok) {
        const adminResponse = await fetch("/admin-api/login", requestOptions);
        const adminResponseData = await adminResponse.json().catch(() => ({}));
        if (adminResponse.ok) {
          response = adminResponse;
          responseData = adminResponseData;
        } else if (userResponse.status === 404 && adminResponse.status === 404) {
          throw new Error(
            userResponseData.message ||
              adminResponseData.message ||
              "Login API not found. Start the stack with npm run dev from the project root (backend on port 3001) and open the app at http://localhost:5173 — not as a saved/offline HTML file.",
          );
        } else {
          throw new Error(adminResponseData.message || userResponseData.message || "Invalid username or password.");
        }
      }

      const normalizedAccountTypeRaw = String(
        responseData.accountType || responseData.user?.accountType || responseData.user?.role || "user",
      )
        .trim()
        .toLowerCase();
      const normalizedAccountType = ["admin", "priest", "user"].includes(normalizedAccountTypeRaw)
        ? normalizedAccountTypeRaw
        : "user";
      const authData = {
        token: responseData.token || "",
        accountType: normalizedAccountType,
        user: responseData.user || { userName: loginFormData.userName },
      };

      if (normalizedAccountType === "user" || normalizedAccountType === "priest") {
        const accountID = Number(normalizedAccountType === "priest" ? authData.user?.priestID : authData.user?.userID);
        if (Number.isInteger(accountID) && accountID > 0) {
          try {
            const textStyle = await fetchAccountTextStyle({ accountType: normalizedAccountType, accountID });
            saveAppSettings({ ...parseStoredSettings(), textStyle });
          } catch {
            // Keep the current text style if this account's setting cannot be loaded yet.
          }
        }
      }

      if (loginFormData.rememberMe) {
        localStorage.setItem("faithflow_auth", JSON.stringify(authData));
      } else {
        sessionStorage.setItem("faithflow_auth", JSON.stringify(authData));
      }

      const dashboardPath =
        normalizedAccountType === "admin"
          ? "/admin/dashboard"
          : normalizedAccountType === "priest"
            ? "/priest/dashboard"
            : "/dashboard";
      setLoginFormData({
        userName: "",
        password: "",
        rememberMe: loginFormData.rememberMe,
      });
      navigate(dashboardPath);
    } catch (error) {
      setLoginErrorMessage(error.message || "Unable to log in right now.");
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    setRegisterErrorMessage("");
    setRegisterSuccessMessage("");

    const email = String(registerFormData.username || "").trim().toLowerCase();
    const contactNumber = String(registerFormData.contactNumber || "").trim();
    if (!email) {
      setRegisterErrorMessage("Enter your Gmail address.");
      return;
    }
    if (!EMAIL_REGEX.test(email) || !isGmailAddress(email)) {
      setRegisterErrorMessage("Please use a Gmail address (example@gmail.com).");
      return;
    }
    if (!contactNumber) {
      setRegisterErrorMessage("Enter your phone number.");
      return;
    }
    if (!PHONE_NUMBER_REGEX.test(contactNumber)) {
      setRegisterErrorMessage("Phone number must be 11 digits and start with 09.");
      return;
    }
    if (registerFormData.password.length < MIN_PASSWORD_LENGTH) {
      setRegisterErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (registerFormData.password !== registerFormData.confirmPassword) {
      setRegisterErrorMessage("Passwords do not match.");
      return;
    }
    const firstName = String(registerFormData.firstName || "").trim();
    const lastName = String(registerFormData.lastName || "").trim();
    if (!firstName || !lastName) {
      setRegisterErrorMessage("Enter your first name and last name.");
      return;
    }

    setIsSubmittingRegister(true);

    try {
      const response = await fetch("/api/users/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          username: email,
          email,
          contactNumber,
          address: registerFormData.address,
          birthdate: registerFormData.birthdate || null,
          gender: registerFormData.gender,
          parishName: null,
          password: registerFormData.password,
          role: "user",
        }),
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(responseData.message || "Unable to create your account right now.");
      }

      setRegisterSuccessMessage("Parishioner account created. You can log in with your Gmail or phone number.");
      setRegisterFormData({
        firstName: "",
        lastName: "",
        username: "",
        contactNumber: "",
        address: "",
        birthdate: "",
        gender: "",
        password: "",
        confirmPassword: "",
      });
      setAuthModal("login");
      setCurrentPage("about");
    } catch (error) {
      setRegisterErrorMessage(error.message || "Unable to create your account right now.");
    } finally {
      setIsSubmittingRegister(false);
    }
  };

  const goToRegister = () => {
    setLoginErrorMessage("");
    setLoginSuccessMessage("");
    setForgotPasswordErrorMessage("");
    setForgotPasswordSuccessMessage("");
    setRegisterErrorMessage("");
    setRegisterSuccessMessage("");
    setRegisterReturnPage(authModal === "login" ? "login" : "about");
    setAuthModal("register");
    setCurrentPage("about");
  };

  const goToLogin = () => {
    setLoginErrorMessage("");
    setForgotPasswordErrorMessage("");
    setForgotPasswordSuccessMessage("");
    setRegisterErrorMessage("");
    setRegisterSuccessMessage("");
    setAuthModal("login");
    setCurrentPage("about");
  };

  const closeAuthModal = () => {
    setLoginErrorMessage("");
    setLoginSuccessMessage("");
    setForgotPasswordErrorMessage("");
    setForgotPasswordSuccessMessage("");
    setRegisterErrorMessage("");
    setRegisterSuccessMessage("");
    setAuthModal(null);
    setCurrentPage("about");
  };

  const goToAbout = () => {
    closeAuthModal();
  };

  const goBackFromRegister = () => {
    if (registerReturnPage === "login") {
      goToLogin();
      return;
    }
    closeAuthModal();
  };

  const goToForgotPassword = () => {
    setLoginErrorMessage("");
    setLoginSuccessMessage("");
    setForgotPasswordErrorMessage("");
    setForgotPasswordSuccessMessage("");
    setForgotPasswordIdentifier(String(loginFormData.userName || "").trim());
    setAuthModal("forgot");
    setCurrentPage("about");
  };

  const handleForgotPasswordSubmit = async (event) => {
    event.preventDefault();
    setForgotPasswordErrorMessage("");
    setForgotPasswordSuccessMessage("");
    const identifier = String(forgotPasswordIdentifier || "").trim();
    if (!identifier) {
      setForgotPasswordErrorMessage("Enter the Gmail address on this account, or the phone number for a user or priest account.");
      return;
    }

    setIsSubmittingForgotPassword(true);
    try {
      const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: identifier, email: identifier }),
      };
      const userResponse = await fetch("/api/forgot-password", requestOptions);
      const userResponseData = await userResponse.json().catch(() => ({}));
      if (userResponse.ok) {
        setForgotPasswordSuccessMessage(
          userResponseData.message || "Your new password was sent to the contact method on file.",
        );
        return;
      }
      if (userResponse.status !== 404) {
        throw new Error(userResponseData.message || "Unable to send a new password right now.");
      }

      throw new Error("No Faithflow account matches that Gmail address or phone number.");
    } catch (error) {
      setForgotPasswordErrorMessage(error.message || "Unable to send a new password right now.");
    } finally {
      setIsSubmittingForgotPassword(false);
    }
  };

  const isRegisterContactNumberInvalid =
    String(registerFormData.contactNumber || "").length > 0 && !PHONE_NUMBER_REGEX.test(String(registerFormData.contactNumber || "").trim());
  const isRegisterEmailInvalid =
    String(registerFormData.username || "").length > 0 &&
    (!EMAIL_REGEX.test(String(registerFormData.username || "").trim()) ||
      !isGmailAddress(registerFormData.username));
  const isRegisterPasswordInvalid =
    String(registerFormData.password || "").length > 0 &&
    String(registerFormData.password || "").length < MIN_PASSWORD_LENGTH;
  const isRegisterConfirmPasswordInvalid =
    String(registerFormData.confirmPassword || "").length > 0 &&
    (String(registerFormData.confirmPassword || "").length < MIN_PASSWORD_LENGTH ||
      registerFormData.confirmPassword !== registerFormData.password);
  const recentAboutParishActivities = [...aboutParishActivities]
    .filter((entry) => Number.isInteger(Number(entry?.id)) && Number(entry.id) > 0)
    .sort(compareParishActivitiesNewestFirst);
  const safeAboutParishActivitySlideIndex =
    recentAboutParishActivities.length > 0
      ? Math.max(0, Math.min(aboutParishActivitySlideIndex, recentAboutParishActivities.length - 1))
      : 0;

  useEffect(() => {
    if (recentAboutParishActivities.length === 0 && aboutParishActivitySlideIndex !== 0) {
      setAboutParishActivitySlideIndex(0);
      return;
    }
    if (recentAboutParishActivities.length > 0 && aboutParishActivitySlideIndex > recentAboutParishActivities.length - 1) {
      setAboutParishActivitySlideIndex(recentAboutParishActivities.length - 1);
    }
  }, [aboutParishActivitySlideIndex, recentAboutParishActivities.length]);

  const openAboutParishActivityModal = (entry) => {
    setSelectedAboutParishActivity(entry || null);
    setIsAboutParishActivityModalOpen(true);
  };

  const closeAboutParishActivityModal = () => {
    setIsAboutParishActivityModalOpen(false);
    setSelectedAboutParishActivity(null);
  };

  const landingPhoto = `url("${String(aboutPageContent.heroBackgroundImage || churchBackground).replace(/"/g, "")}")`;

  return (
    <main className="about-page-shell" style={{ "--landing-photo": landingPhoto }}>
      {currentPage === "about" ? (
        <section className="about-page" aria-label="About Faithflow page">
          <header className="about-header">
            <div className="about-header-bar">
              <div className="about-header-brand">
                <img className="about-header-logo" src={logo} alt="Faithflow logo" />
                <h1>Faithflow</h1>
              </div>
              <div className="about-header-actions">
                <button type="button" className="about-faq-link" onClick={() => navigate("/faqs")}>
                  FAQs
                </button>
                <button type="button" className="about-login-link" onClick={goToLogin}>
                  Login
                </button>
                <button type="button" className="about-signup-link" onClick={goToRegister}>
                  Sign Up
                </button>
              </div>
            </div>
            <section className="about-hero" aria-label="Faithflow hero section">
              <div className="about-hero-content">
                <h3 className="about-hero-title">
                  {splitParishHeroLines(aboutPageContent.parishName).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </h3>
                <p className="about-hero-subtitle">{aboutPageContent.parishTagline}</p>
              </div>
              <div className="about-hero-badges" aria-label="Faithflow offers">
                <article className="about-hero-badge about-hero-offer-card">
                  <p className="about-hero-offer-title">Sacramental Service Offer</p>
                  <div className="about-hero-offer-list" aria-label="Sacramental services available">
                    {aboutPageContent.sacramentalOffers.map((offer) => (
                      <span key={offer}>{offer}</span>
                    ))}
                  </div>
                </article>
                <article className="about-hero-badge about-hero-offer-card">
                  <p className="about-hero-offer-title">Online Certificate Offer</p>
                  <div className="about-hero-offer-list" aria-label="Certificates available online">
                    {aboutPageContent.certificateOffers.map((offer) => (
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
              <section className="about-features" aria-label="FaithFlow features">
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
                  <h4>{aboutPageContent.missionTitle}</h4>
                  {splitParagraphs(aboutPageContent.missionBody).map((paragraph, index) => (
                    <p key={`mission-${index}`}>{paragraph}</p>
                  ))}
                </section>
                <section className="about-card vision">
                  <h4>{aboutPageContent.visionTitle}</h4>
                  {splitParagraphs(aboutPageContent.visionBody).map((paragraph, index) => (
                    <p key={`vision-${index}`}>{paragraph}</p>
                  ))}
                </section>
              </div>

              <section className="about-recent-parish-activities" aria-label="Recent parish activities">
                <header className="about-recent-activities-header">
                  <h4>
                    <ImageIcon size={18} aria-hidden="true" />
                    Recent Parish Activities
                  </h4>
                </header>
                {isLoadingAboutParishActivities ? <p className="about-recent-activities-empty">Loading parish activities...</p> : null}
                {!isLoadingAboutParishActivities && aboutParishActivitiesError ? (
                  <p className="about-recent-activities-error">{aboutParishActivitiesError}</p>
                ) : null}
                {!isLoadingAboutParishActivities && !aboutParishActivitiesError ? (
                  recentAboutParishActivities.length > 0 ? (
                    <div className="about-parish-activity-slider">
                      <button
                        type="button"
                        className="about-parish-activity-arrow"
                        aria-label="Previous parish activity"
                        onClick={() =>
                          setAboutParishActivitySlideIndex((current) =>
                            recentAboutParishActivities.length > 0
                              ? (current - 1 + recentAboutParishActivities.length) % recentAboutParishActivities.length
                              : 0,
                          )
                        }
                        disabled={recentAboutParishActivities.length <= 1}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div className="about-parish-activity-viewport">
                        <ul
                          className="about-parish-activity-list"
                          style={{ transform: `translateX(-${safeAboutParishActivitySlideIndex * 100}%)` }}
                        >
                          {recentAboutParishActivities.map((entry) => (
                            <li
                              key={`about-parish-activity-${entry.id}`}
                              className="about-parish-activity-item"
                              role="button"
                              tabIndex={0}
                              onClick={() => openAboutParishActivityModal(entry)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openAboutParishActivityModal(entry);
                                }
                              }}
                              aria-label={`Open details for ${entry.title || "parish activity"}`}
                            >
                              <div className="about-parish-activity-media">
                                {renderParishActivityCoverMedia(entry)}
                                <div className="about-parish-activity-overlay">
                                  <strong>{entry.title || "Parish Activity"}</strong>
                                  <small>View full details</small>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        className="about-parish-activity-arrow"
                        aria-label="Next parish activity"
                        onClick={() =>
                          setAboutParishActivitySlideIndex((current) =>
                            recentAboutParishActivities.length > 0 ? (current + 1) % recentAboutParishActivities.length : 0,
                          )
                        }
                        disabled={recentAboutParishActivities.length <= 1}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  ) : (
                    <p className="about-recent-activities-empty">No parish activities yet.</p>
                  )
                ) : null}
                {!isLoadingAboutParishActivities && !aboutParishActivitiesError && recentAboutParishActivities.length > 1 ? (
                  <div className="about-parish-activity-dots" role="tablist" aria-label="Recent parish activity slides">
                    {recentAboutParishActivities.map((entry, index) => (
                      <button
                        key={`about-parish-activity-dot-${entry.id}`}
                        type="button"
                        role="tab"
                        aria-selected={safeAboutParishActivitySlideIndex === index}
                        className={`about-parish-activity-dot${safeAboutParishActivitySlideIndex === index ? " is-active" : ""}`}
                        onClick={() => setAboutParishActivitySlideIndex(index)}
                        aria-label={`Show parish activity ${index + 1}`}
                      />
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="about-description">
                <h4>{aboutPageContent.brandTitle}</h4>
                {splitParagraphs(aboutPageContent.brandBody).map((paragraph, index) => (
                  <p key={`brand-${index}`}>{paragraph}</p>
                ))}
              </section>
            </article>
          </section>

          <footer className="about-footer" aria-label="Faithflow general footer">
            <div className="about-footer-item">
              <span>© 2026 Faithflow. Parish Service System. All rights reserved.</span>
            </div>
          </footer>
          {isAboutParishActivityModalOpen && selectedAboutParishActivity ? (
            <div className="about-parish-activity-modal-overlay" role="presentation" onClick={closeAboutParishActivityModal}>
              <section
                className="about-parish-activity-modal parish-activity-post"
                role="dialog"
                aria-modal="true"
                aria-label={`${selectedAboutParishActivity.title || "Parish activity"} details`}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="parish-activity-post-header">
                  <span className="parish-activity-post-avatar" aria-hidden="true">
                    <ImageIcon size={16} />
                  </span>
                  <div className="parish-activity-post-identity">
                    <strong>{selectedAboutParishActivity.title || "Parish Activity"}</strong>
                  </div>
                  <div className="parish-activity-post-actions">
                    <button type="button" aria-label="Close" onClick={closeAboutParishActivityModal}>
                      <X size={18} />
                    </button>
                  </div>
                </header>
                <ParishActivityMediaCarousel
                  items={normalizeParishActivityMediaForDisplay(selectedAboutParishActivity)}
                  resolveSrc={resolveParishActivityImageSrc}
                  activityTitle={selectedAboutParishActivity.title || "Parish activity"}
                  postedDate={formatParishActivityPostDate(selectedAboutParishActivity.activityDate)}
                  variant="post"
                />
              </section>
            </div>
          ) : null}
        </section>
      ) : null}
      {authModal ? (
        <div className="landing-auth-overlay" role="presentation" onClick={closeAuthModal}>
          {authModal === "login" ? (
        <section className="login-card" aria-label="Login form" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="landing-auth-close" aria-label="Close login" onClick={closeAuthModal}>
            <X size={18} />
          </button>
          <div className="login-brand">
            <img className="brand-logo" src={logo} alt="Faithflow logo" />
            <h1>Faithflow</h1>
          </div>

          <form className="login-form" onSubmit={handleLoginSubmit}>
            <div className="input-group">
              <input
                id="userName"
                name="userName"
                type="text"
                placeholder="Username, email, or phone number"
                value={loginFormData.userName}
                onChange={(event) => handleInputChange(event, setLoginFormData)}
                autoComplete="username"
                required
              />
              <p className="login-field-hint">Use your email or phone number.</p>
            </div>

            <div className="input-group">
              <div className="password-field">
                <input
                  id="password"
                  name="password"
                  type={showLoginPassword ? "text" : "password"}
                  placeholder="Password"
                  value={loginFormData.password}
                  onChange={(event) => handleInputChange(event, setLoginFormData)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowLoginPassword((current) => !current)}
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="login-row">
              <label className="remember-me" htmlFor="rememberMe">
                <input
                  id="rememberMe"
                  name="rememberMe"
                  type="checkbox"
                  checked={loginFormData.rememberMe}
                  onChange={(event) => handleInputChange(event, setLoginFormData)}
                />
                Remember me
              </label>
              <button type="button" className="forgot-password" onClick={goToForgotPassword}>
                Forgot password?
              </button>
            </div>

            <button type="submit" className="login-button" disabled={isSubmittingLogin}>
              {isSubmittingLogin ? "Logging in..." : "Log in"}
            </button>
          </form>

          <div className="extra-actions">
            <button type="button" className="secondary-button" onClick={goToRegister}>
              Create Account
            </button>
          </div>

          {loginErrorMessage && (
            <p className="form-feedback is-error" role="alert">
              {loginErrorMessage}
            </p>
          )}
          {loginSuccessMessage && (
            <p className="form-feedback is-success" role="status">
              {loginSuccessMessage}
            </p>
          )}
        </section>
          ) : authModal === "forgot" ? (
        <section className="login-card" aria-label="Forgot password form" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="landing-auth-close" aria-label="Close" onClick={closeAuthModal}>
            <X size={18} />
          </button>
          <div className="login-brand">
            <img className="brand-logo" src={logo} alt="Faithflow logo" />
            <h1>Faithflow</h1>
            <p className="register-subtitle">Reset your password</p>
          </div>

          <form className="login-form" onSubmit={handleForgotPasswordSubmit}>
            <p className="login-field-hint forgot-password-copy">
              Admin recovery requires the registered Gmail address. Users and priests can use their Gmail address or phone number.
            </p>
            <p className="login-field-hint forgot-password-limit">
              You can request one new password in any 24-hour period. Email and SMS requests share this limit.
            </p>
            <div className="input-group">
              <input
                id="forgotIdentifier"
                name="forgotIdentifier"
                type="text"
                placeholder="Admin Gmail, or user/priest Gmail or phone"
                value={forgotPasswordIdentifier}
                onChange={(event) => setForgotPasswordIdentifier(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <button type="submit" className="login-button" disabled={isSubmittingForgotPassword}>
              {isSubmittingForgotPassword ? "Sending new password..." : "Send new password"}
            </button>
          </form>

          <div className="extra-actions">
            <button type="button" className="secondary-button" onClick={goToLogin}>
              Back
            </button>
          </div>

          {forgotPasswordErrorMessage ? (
            <p className="form-feedback is-error" role="alert">
              {forgotPasswordErrorMessage}
            </p>
          ) : null}
          {forgotPasswordSuccessMessage ? (
            <p className="form-feedback is-success" role="status">
              {forgotPasswordSuccessMessage}
            </p>
          ) : null}
        </section>
          ) : (
        <section className="login-card register-card" aria-label="Register form" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="landing-auth-close" aria-label="Close create account" onClick={closeAuthModal}>
            <X size={18} />
          </button>
          <div className="login-brand">
            <img className="brand-logo" src={logo} alt="Faithflow logo" />
            <h1>Faithflow</h1>
            <p className="register-subtitle">Create Your Account</p>
          </div>

          <form className="login-form" onSubmit={handleRegisterSubmit}>
            <div className="login-name-row">
              <div className="input-group">
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder="First name"
                  value={registerFormData.firstName}
                  onChange={(event) => handleInputChange(event, setRegisterFormData)}
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="input-group">
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  placeholder="Last name"
                  value={registerFormData.lastName}
                  onChange={(event) => handleInputChange(event, setRegisterFormData)}
                  autoComplete="family-name"
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <input
                id="username"
                name="username"
                type="email"
                className={isRegisterEmailInvalid ? "invalid-field" : undefined}
                aria-invalid={isRegisterEmailInvalid || undefined}
                placeholder="Gmail"
                value={registerFormData.username}
                onChange={(event) => handleInputChange(event, setRegisterFormData)}
                autoComplete="email"
                required
                title="Use a Gmail address (example@gmail.com)."
              />
            </div>

            <div className="input-group">
              <input
                id="contactNumber"
                name="contactNumber"
                type="tel"
                className={isRegisterContactNumberInvalid ? "invalid-phone" : undefined}
                aria-invalid={isRegisterContactNumberInvalid || undefined}
                placeholder="Phone number"
                value={registerFormData.contactNumber}
                onChange={(event) => handleInputChange(event, setRegisterFormData)}
                autoComplete="tel"
                inputMode="numeric"
                pattern="09[0-9]{9}"
                maxLength={11}
                required
                title="Contact number must be 11 digits and start with 09."
              />
            </div>

            <div className="input-group">
              <input
                id="address"
                name="address"
                type="text"
                placeholder="Address"
                value={registerFormData.address}
                onChange={(event) => handleInputChange(event, setRegisterFormData)}
                autoComplete="street-address"
                required
              />
            </div>

            <div className="input-group">
              <input
                id="birthdate"
                name="birthdate"
                type="date"
                value={registerFormData.birthdate}
                onChange={(event) => handleInputChange(event, setRegisterFormData)}
                required
              />
            </div>
            <div className="input-group">
              <select
                id="gender"
                name="gender"
                value={registerFormData.gender}
                onChange={(event) => handleInputChange(event, setRegisterFormData)}
                required
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>

            <div className="input-group">
              <div className="password-field">
                <input
                  id="registerPassword"
                  name="password"
                  type={showRegisterPassword ? "text" : "password"}
                  className={isRegisterPasswordInvalid ? "invalid-field" : undefined}
                  aria-invalid={isRegisterPasswordInvalid || undefined}
                  placeholder="Password"
                  value={registerFormData.password}
                  onChange={(event) => handleInputChange(event, setRegisterFormData)}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  title={`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowRegisterPassword((current) => !current)}
                  aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                >
                  {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="input-group">
              <div className="password-field">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showRegisterConfirmPassword ? "text" : "password"}
                  className={isRegisterConfirmPasswordInvalid ? "invalid-field" : undefined}
                  aria-invalid={isRegisterConfirmPasswordInvalid || undefined}
                  placeholder="Confirm password"
                  value={registerFormData.confirmPassword}
                  onChange={(event) => handleInputChange(event, setRegisterFormData)}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  title={`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowRegisterConfirmPassword((current) => !current)}
                  aria-label={showRegisterConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showRegisterConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="login-button" disabled={isSubmittingRegister}>
              {isSubmittingRegister ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="register-login-hint">
            Already have an account?{" "}
            <button type="button" className="register-login-link" onClick={goToLogin}>
              Login
            </button>
          </p>

          {registerErrorMessage && (
            <p className="form-feedback is-error" role="alert">
              {registerErrorMessage}
            </p>
          )}
          {registerSuccessMessage && (
            <p className="form-feedback is-success" role="status">
              {registerSuccessMessage}
            </p>
          )}
        </section>
          )}
        </div>
      ) : null}

    </main>
  );
}

export default App;
