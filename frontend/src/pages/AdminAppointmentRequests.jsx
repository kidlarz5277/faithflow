import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Cross,
  Droplets,
  FileText,
  Handshake,
  Inbox,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import PageGuide from "../components/PageGuide";
import ViewModeToggle, { useViewMode } from "../components/ViewModeToggle";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG, getSacramentSchemaByName } from "../utils/sacramentFormSchemas";
import { pushUiNotice } from "../utils/uiNotice";
import { formatListForDisplay, isListCredentialValue } from "../utils/listField";
import { getAppointmentSubjectName } from "../utils/parishSchedule";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";

const formatDateTime = (dateValue) => {
  if (!dateValue) return "Not available";
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "Not available";
  return parsedDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const toKebabCase = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const toReadableLabel = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const CREDENTIAL_LABELS = {
  childFirstName: "Child First Name",
  childLastName: "Child Last Name",
  childFullName: "Child Full Name",
  childBirthDate: "Birth Date",
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  phoneNumber: "Phone Number",
  address: "Address",
};
const CREDENTIAL_DISPLAY_ORDER = [
  "childFullName",
  "childFirstName",
  "childLastName",
  "childBirthDate",
  "fatherName",
  "motherName",
  "brideName",
  "brideAge",
  "bridePhoneNumber",
  "brideAddress",
  "groomName",
  "groomAge",
  "groomPhoneNumber",
  "groomAddress",
  "deceasedName",
  "dateOfDeath",
  "familyContactName",
  "relationToDeceased",
  "deceasedAddress",
  "blessingType",
  "blessingTarget",
  "address",
  "phoneNumber",
];

const formatCredentialDisplayValue = (key, value) => {
  if (isListCredentialValue(value)) {
    return formatListForDisplay(value);
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
  }
  return text || "Not provided";
};

const getCredentialLabel = (key, sacramentName) => {
  const schema = getSacramentSchemaByName(DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG, sacramentName);
  const schemaLabel = (schema?.fields || []).find((field) => field.key === key)?.label;
  return schemaLabel || CREDENTIAL_LABELS[key] || toReadableLabel(key);
};

const sortCredentialEntries = (entries, sacramentName) => {
  const schema = getSacramentSchemaByName(DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG, sacramentName);
  const schemaOrder = (schema?.fields || []).map((field) => field.key);
  const rank = (key) => {
    const knownIndex = CREDENTIAL_DISPLAY_ORDER.indexOf(key);
    if (knownIndex >= 0) return knownIndex;
    const schemaIndex = schemaOrder.indexOf(key);
    return schemaIndex >= 0 ? 200 + schemaIndex : 1000;
  };
  return [...entries].sort((left, right) => rank(left[0]) - rank(right[0]) || String(left[0]).localeCompare(String(right[0])));
};

const getRequestDisplayName = (request) =>
  getAppointmentSubjectName(request) || String(request?.requesterFullName || "").trim() || "Unknown Account";

const isChildNamedRequest = (request) => {
  const sacrament = String(
    request?.resolvedSacramentName ||
      request?.specialSacramentName ||
      request?.s_sacramentName ||
      request?.sacramentName ||
      "",
  )
    .trim()
    .toLowerCase();
  return sacrament.includes("baptism") || sacrament.includes("christening") || sacrament.includes("binyagan");
};

const getResolvedServiceName = (request) =>
  String(
    request?.resolvedSacramentName ||
      request?.specialSacramentName ||
      request?.s_sacramentName ||
      request?.sacramentName ||
      "",
  ).trim();

const FILE_LINK_CREDENTIAL_KEYS = new Set([
  "birthCertificateFileUrl",
  "birthCertificateFileName",
  "brideBirthCertificateFileUrl",
  "brideBirthCertificateFileName",
  "groomBirthCertificateFileUrl",
  "groomBirthCertificateFileName",
]);
const REDUNDANT_CREDENTIAL_KEYS = new Set([
  "requesterName",
  "requestorName",
  "requesterFullName",
  "requestorFullName",
  "fullName",
]);
const MARRIAGE_BRIDE_DETAIL_KEYS = ["brideName", "brideAge", "bridePhoneNumber", "brideAddress"];
const MARRIAGE_GROOM_DETAIL_KEYS = ["groomName", "groomAge", "groomPhoneNumber", "groomAddress"];
const MARRIAGE_SHARED_DETAIL_KEYS = ["address"];
const getMarriageDetailEntry = (entries, preferredKey, fallbackKey = "") => {
  const preferred = entries.find(([entryKey]) => entryKey === preferredKey);
  if (preferred && String(preferred[1] || "").trim()) return preferred;
  if (fallbackKey) {
    const fallback = entries.find(([entryKey]) => entryKey === fallbackKey);
    if (fallback && String(fallback[1] || "").trim()) {
      return [preferredKey, fallback[1]];
    }
  }
  return preferred || null;
};

const toSafeUrl = (value) => {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return "";
  if (normalizedValue.startsWith("data:")) return normalizedValue;
  if (/^https?:\/\//i.test(normalizedValue)) return normalizedValue;
  if (normalizedValue.startsWith("/uploads/")) return `/api${normalizedValue}`;
  if (normalizedValue.startsWith("/api/uploads/")) return normalizedValue;
  return "";
};

const getAttachmentKind = (url, name) => {
  const target = `${name || ""} ${url || ""}`.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|svg|avif)(\?|$)/.test(target)) return "image";
  if (/\.pdf(\?|$)/.test(target)) return "pdf";
  return "file";
};

const FILE_NAME_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg|avif|pdf|docx?)$/i;

const collectAppointmentFileAttachments = (credentials, sacramentName) => {
  const source = credentials && typeof credentials === "object" ? credentials : {};
  const seen = new Set();
  const items = [];
  const pushItem = (key, labelKey, name, url) => {
    const safeUrl = toSafeUrl(url);
    const safeName = String(name || "View file").trim() || "View file";
    const identity = safeUrl || `${labelKey}:${safeName}`;
    if (seen.has(identity)) return;
    if (!safeUrl && !FILE_NAME_PATTERN.test(safeName)) return;
    seen.add(identity);
    items.push({
      key,
      label: getCredentialLabel(String(labelKey || "").replace(/File$/i, ""), sacramentName),
      name: safeName,
      url: safeUrl,
      kind: getAttachmentKind(safeUrl, safeName),
    });
  };

  Object.entries(source).forEach(([key, value]) => {
    const text = String(value || "").trim();
    if (/(FileUrl|Url)$/.test(key)) {
      const base = key.replace(/(FileUrl|Url)$/, "");
      pushItem(
        key,
        base,
        source[`${base}FileName`] || source[`${base}Name`] || "View file",
        text,
      );
      return;
    }
    if (/(FileName|Name)$/.test(key) && FILE_NAME_PATTERN.test(text)) {
      const base = key.replace(/(FileName|Name)$/, "");
      pushItem(key, base, text, source[`${base}Url`] || source[`${base}FileUrl`] || "");
    }
  });
  return items;
};

const getDisplayNote = (request) => {
  const normalized = String(request?.note || "").trim();
  return normalized || "No note provided.";
};

const REQUEST_CARD_ORDER = [
  "Marriage",
  "Funeral Mass",
  "Blessings",
  "Christening",
  "Special Sacrament Program",
  "Kasalan ng Bayan",
  "Binyagan ng Bayan",
  "Marriage Certificate",
  "Baptismal Certificate",
];
const CARDS_PER_PAGE = 4;
const CARD_SLIDE_STEP = 3;
const REQUESTS_PER_PAGE = 5;

const DECLINE_REASON_OPTIONS = [
  "Not met requirements",
  "Wrong file attached",
  "Incomplete information",
  "Duplicate request",
  "Other reason",
];
const isRequestUnderReview = (request) => Boolean(request?.reviewUnderReviewAt);
const isRequestViewed = (request) => isRequestUnderReview(request) || Boolean(request?.reviewViewedAt);

function AdminAppointmentRequests() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmationAction, setConfirmationAction] = useState(null);
  const [selectedRequestForDetails, setSelectedRequestForDetails] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [selectedDeclineReason, setSelectedDeclineReason] = useState(DECLINE_REASON_OPTIONS[0]);
  const [declineCustomReason, setDeclineCustomReason] = useState("");
  const [declineReasonError, setDeclineReasonError] = useState("");
  const [selectedRequestCardKey, setSelectedRequestCardKey] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [sortByDate, setSortByDate] = useState("newest");
  const [cardPage, setCardPage] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useViewMode("admin-appointment-requests");

  const authRaw =
    typeof window !== "undefined"
      ? localStorage.getItem("faithflow_auth") || sessionStorage.getItem("faithflow_auth")
      : null;
  const authData = useMemo(() => {
    if (!authRaw) return null;
    try {
      return JSON.parse(authRaw);
    } catch {
      return null;
    }
  }, [authRaw]);

  const user = authData?.user;
  const accountType = authData?.accountType;
  const sessionAdminId = user?.adminID;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const getRequestTypeLabel = (request) => {
    if (Number.isInteger(Number(request?.s_sacramentID)) && Number(request?.s_sacramentID) > 0) {
      return "Special Sacrament Program";
    }
    const explicitType = String(request.requestType || "").trim();
    if (explicitType) {
      const normalizedExplicitType = explicitType.toLowerCase();
      if (normalizedExplicitType === "certificate" || normalizedExplicitType === "certificate request") {
        return "Certificate Request";
      }
      if (normalizedExplicitType === "special sacrament program" || normalizedExplicitType === "special sacrament") {
        return "Special Sacrament Program";
      }
      if (normalizedExplicitType === "appointment") {
        return "Appointment";
      }
      return explicitType;
    }

    const sacrament = String(request.sacramentName || request.specialSacramentName || "").toLowerCase();
    if (sacrament.includes("certificate")) return "Certificate Request";
    if (sacrament.includes("kasalan ng bayan") || sacrament.includes("binyagan ng bayan")) return "Special Sacrament Program";
    return "Appointment";
  };
  const getRequestSubCategoryLabel = (request) => {
    const rawSacrament = getResolvedServiceName(request);
    const normalizedSacrament = rawSacrament.toLowerCase();
    const requestType = getRequestTypeLabel(request);

    if (requestType === "Appointment") {
      if (normalizedSacrament === "marriage") return "Marriage";
      if (normalizedSacrament === "funeral mass" || normalizedSacrament === "funeral-mass") return "Funeral Mass";
      if (normalizedSacrament === "blessing" || normalizedSacrament === "blessings") return "Blessings";
      if (normalizedSacrament === "christening" || normalizedSacrament === "baptism") return "Christening";
      if (rawSacrament) return toReadableLabel(rawSacrament);
      return "Appointment";
    }

    if (requestType === "Special Sacrament Program") {
      if (normalizedSacrament === "kasalan ng bayan") return "Kasalan ng Bayan";
      if (normalizedSacrament === "binyagan ng bayan") return "Binyagan ng Bayan";
      if (rawSacrament) return toReadableLabel(rawSacrament);
      return "Special Sacrament Program";
    }

    if (requestType === "Certificate Request") {
      if (normalizedSacrament === "marriage certificate") return "Marriage Certificate";
      if (normalizedSacrament === "baptismal certificate") return "Baptismal Certificate";
      return "Certificate Request";
    }

    return rawSacrament || "Request";
  };
  const getRequestDesign = (request) => {
    const subCategory = getRequestSubCategoryLabel(request);

    if (subCategory === "Marriage") {
      return { className: "is-marriage", icon: <Handshake size={20} />, iconLabel: "Marriage request icon" };
    }
    if (subCategory === "Funeral Mass") {
      return { className: "is-funeral-mass", icon: <Cross size={20} />, iconLabel: "Death mass request icon" };
    }
    if (subCategory === "Blessings") {
      return { className: "is-blessing", icon: <Sparkles size={20} />, iconLabel: "Blessing request icon" };
    }
    if (subCategory === "Christening") {
      return { className: "is-christening", icon: <Droplets size={20} />, iconLabel: "Christening request icon" };
    }
    if (subCategory === "Kasalan ng Bayan" || subCategory === "Binyagan ng Bayan" || getRequestTypeLabel(request) === "Special Sacrament Program") {
      return { className: "is-special", icon: <Users size={20} />, iconLabel: "Special sacrament request icon" };
    }
    return { className: "is-certificate", icon: <FileText size={20} />, iconLabel: "Certificate request icon" };
  };
  const appointmentOnlyRequests = useMemo(
    () => requests.filter((request) => getRequestTypeLabel(request) !== "Certificate Request"),
    [requests],
  );
  const requestCards = useMemo(() => {
    const cards = appointmentOnlyRequests.reduce((accumulator, request) => {
      const label = getRequestSubCategoryLabel(request);
      if (!accumulator[label]) {
        const type = getRequestTypeLabel(request);
        accumulator[label] = {
          key: `${type}::${label}`,
          label,
          type,
          count: 0,
        };
      }
      accumulator[label].count += 1;
      return accumulator;
    }, {});

    return Object.values(cards).sort((a, b) => {
      const orderA = REQUEST_CARD_ORDER.indexOf(a.label);
      const orderB = REQUEST_CARD_ORDER.indexOf(b.label);
      const normalizedOrderA = orderA === -1 ? Number.MAX_SAFE_INTEGER : orderA;
      const normalizedOrderB = orderB === -1 ? Number.MAX_SAFE_INTEGER : orderB;
      if (normalizedOrderA !== normalizedOrderB) return normalizedOrderA - normalizedOrderB;
      return a.label.localeCompare(b.label);
    });
  }, [appointmentOnlyRequests]);
  const filteredRequests = useMemo(() => {
    const activeCard = requestCards.find((card) => card.key === selectedRequestCardKey) || null;
    const cardMatchedRequests = activeCard
      ? appointmentOnlyRequests.filter((request) => {
          const requestTypeLabel = getRequestTypeLabel(request);
          const requestSubCategory = getRequestSubCategoryLabel(request);
          return requestSubCategory === activeCard.label && requestTypeLabel === activeCard.type;
        })
      : appointmentOnlyRequests;

    const matchingRequests = cardMatchedRequests.filter((request) => {
      const fullName = getRequestDisplayName(request).toLowerCase();
      const sacrament = getResolvedServiceName(request).toLowerCase();
      const requestTypeLabel = getRequestTypeLabel(request);
      const requestType = requestTypeLabel.toLowerCase();
      const isUnderReview = isRequestUnderReview(request);
      const isViewed = isRequestViewed(request);

      const matchesSearch =
        !normalizedSearch ||
        fullName.includes(normalizedSearch) ||
        sacrament.includes(normalizedSearch) ||
        requestType.includes(normalizedSearch);
      if (!matchesSearch) return false;
      if (reviewFilter === "unread") {
        return !isViewed && !isUnderReview;
      }
      if (reviewFilter === "read") {
        return isViewed && !isUnderReview;
      }
      if (reviewFilter === "under_review") {
        return isUnderReview;
      }
      return true;
    });

    return matchingRequests.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (Number.isNaN(timeA) && Number.isNaN(timeB)) return a.appointmentID - b.appointmentID;
      if (Number.isNaN(timeA)) return 1;
      if (Number.isNaN(timeB)) return -1;
      if (timeA !== timeB) {
        return sortByDate === "newest" ? timeB - timeA : timeA - timeB;
      }
      return a.appointmentID - b.appointmentID;
    });
  }, [
    appointmentOnlyRequests,
    normalizedSearch,
    sortByDate,
    requestCards,
    selectedRequestCardKey,
    reviewFilter,
  ]);
  const totalCardPages = useMemo(() => {
    const maxStartIndex = Math.max(0, requestCards.length - CARDS_PER_PAGE);
    return Math.max(1, Math.ceil(maxStartIndex / CARD_SLIDE_STEP) + 1);
  }, [requestCards]);
  const visibleRequestCards = useMemo(() => {
    const maxStartIndex = Math.max(0, requestCards.length - CARDS_PER_PAGE);
    const start = Math.min(cardPage * CARD_SLIDE_STEP, maxStartIndex);
    return requestCards.slice(start, start + CARDS_PER_PAGE);
  }, [requestCards, cardPage]);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRequests.length / REQUESTS_PER_PAGE)),
    [filteredRequests.length],
  );
  const pagedFilteredRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * REQUESTS_PER_PAGE;
    return filteredRequests.slice(startIndex, startIndex + REQUESTS_PER_PAGE);
  }, [filteredRequests, currentPage]);

  useEffect(() => {
    if (requestCards.length === 0) {
      if (selectedRequestCardKey) setSelectedRequestCardKey("");
      return;
    }

    const selectedCardExists = requestCards.some((card) => card.key === selectedRequestCardKey);
    if (!selectedCardExists) {
      setSelectedRequestCardKey(requestCards[0].key);
    }
  }, [requestCards, selectedRequestCardKey]);

  useEffect(() => {
    setCardPage((currentPage) => {
      const maxPage = Math.max(0, totalCardPages - 1);
      return currentPage > maxPage ? maxPage : currentPage;
    });
  }, [totalCardPages]);

  useEffect(() => {
    if (!selectedRequestCardKey) return;
    const selectedIndex = requestCards.findIndex((card) => card.key === selectedRequestCardKey);
    if (selectedIndex === -1) return;
    const selectedPage = Math.floor(selectedIndex / CARD_SLIDE_STEP);
    if (selectedPage !== cardPage) {
      setCardPage(selectedPage);
    }
  }, [selectedRequestCardKey, requestCards, cardPage]);
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedRequestCardKey, searchQuery, reviewFilter, sortByDate]);
  useEffect(() => {
    setCurrentPage((activePage) => Math.min(activePage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    document.title = "Faithflow - Appointment Request";
  }, []);

  useEffect(() => {
    if (!authData) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, authData, accountType]);

  const loadRequests = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setIsLoadingRequests(true);
      }
      setRequestsError("");
      try {
        const normalizedAdminId = Number(sessionAdminId);
        if (!Number.isInteger(normalizedAdminId) || normalizedAdminId <= 0) {
          throw new Error("Unable to detect admin account.");
        }
        const response = await fetch(`/admin-api/appointments/requests?adminID=${normalizedAdminId}`);
        const responseData = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error(responseData.message || "Unable to load appointment requests.");
        }
        const rows = Array.isArray(responseData) ? responseData : [];
        let scoped = rows.filter(
          (row) => String(row?.status || "").trim().toUpperCase() === "PENDING",
        );
        if (scoped.length === 0) {
          // Fallback for stale backend processes that still serve pending-only request endpoint.
          const appointmentsResponse = await fetch("/admin-api/appointments");
          const appointmentsData = await appointmentsResponse.json().catch(() => []);
          if (appointmentsResponse.ok) {
            const allAppointments = Array.isArray(appointmentsData)
              ? appointmentsData
              : Array.isArray(appointmentsData?.items)
                ? appointmentsData.items
                : [];
            scoped = allAppointments
              .filter((row) => String(row?.status || "").trim().toUpperCase() === "PENDING")
              .map((row) => ({
                ...row,
                reviewViewedAt: row?.reviewViewedAt || null,
                reviewUnderReviewAt: row?.reviewUnderReviewAt || null,
              }));
          }
        }
        setRequests(scoped);
      } catch (error) {
        if (!silent) {
          setRequests([]);
        }
        setRequestsError(error.message || "Unable to load appointment requests.");
      } finally {
        if (!silent) {
          setIsLoadingRequests(false);
        }
      }
    },
    [sessionAdminId],
  );

  useEffect(() => {
    if (accountType !== "admin") return;
    const normalizedAdminId = Number(sessionAdminId);
    if (!Number.isInteger(normalizedAdminId) || normalizedAdminId <= 0) return;
    loadRequests();
  }, [accountType, sessionAdminId, loadRequests]);

  useEffect(() => {
    if (accountType !== "admin") return undefined;
    const normalizedAdminId = Number(sessionAdminId);
    if (!Number.isInteger(normalizedAdminId) || normalizedAdminId <= 0) return undefined;

    const guideIsOpen = () => Boolean(document.querySelector(".page-guide-overlay"));
    const pollInterval = window.setInterval(() => {
      if (document.hidden || guideIsOpen()) return;
      loadRequests({ silent: true });
    }, 60000);

    const handleFocusRefresh = () => {
      if (guideIsOpen()) return;
      loadRequests({ silent: true });
    };
    window.addEventListener("focus", handleFocusRefresh);

    return () => {
      window.clearInterval(pollInterval);
      window.removeEventListener("focus", handleFocusRefresh);
    };
  }, [accountType, sessionAdminId, loadRequests]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleApprove = async (appointmentID) => {
    const normalizedAdminId = Number(user?.adminID);
    if (!Number.isInteger(normalizedAdminId) || normalizedAdminId <= 0) {
      throw new Error("Unable to detect admin account.");
    }
    const response = await fetch(`/admin-api/appointments/${appointmentID}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "CONFIRMED",
        adminID: normalizedAdminId,
      }),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseData.message || "Unable to approve appointment request.");
    }
    setRequests((current) => current.filter((item) => item.appointmentID !== appointmentID));
  };

  const handleDecline = async (appointmentID, declineReason = "") => {
    const normalizedAdminId = Number(user?.adminID);
    if (!Number.isInteger(normalizedAdminId) || normalizedAdminId <= 0) {
      throw new Error("Unable to detect admin account.");
    }
    const response = await fetch(`/admin-api/appointments/${appointmentID}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "CANCELLED",
        adminID: normalizedAdminId,
        declineReason,
      }),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseData.message || "Unable to decline appointment request.");
    }
    setRequests((current) => current.filter((item) => item.appointmentID !== appointmentID));
  };

  const handleConfirmAction = async () => {
    if (!confirmationAction) return;
    try {
      if (confirmationAction.type === "approve") {
        await handleApprove(confirmationAction.appointmentID);
        pushUiNotice("Appointment request approved.");
      } else {
        const customReason = declineCustomReason.trim();
        if (!selectedDeclineReason) {
          setDeclineReasonError("Please select a reason for declining.");
          return;
        }
        if (selectedDeclineReason === "Other reason" && !customReason) {
          setDeclineReasonError("Please enter the specific reason.");
          return;
        }
        const declineReason = selectedDeclineReason === "Other reason" ? customReason : selectedDeclineReason;
        await handleDecline(confirmationAction.appointmentID, declineReason);
        pushUiNotice("Appointment request declined.");
      }
      setSelectedDeclineReason(DECLINE_REASON_OPTIONS[0]);
      setDeclineCustomReason("");
      setDeclineReasonError("");
      setConfirmationAction(null);
    } catch (error) {
      setDeclineReasonError(error.message || "Unable to update appointment request.");
    }
  };

  const openConfirmationAction = (nextAction) => {
    setDeclineReasonError("");
    if (nextAction?.type === "decline") {
      setSelectedDeclineReason(DECLINE_REASON_OPTIONS[0]);
      setDeclineCustomReason("");
    }
    setConfirmationAction(nextAction);
  };

  const closeConfirmationAction = () => {
    setConfirmationAction(null);
    setDeclineReasonError("");
    setSelectedDeclineReason(DECLINE_REASON_OPTIONS[0]);
    setDeclineCustomReason("");
  };
  const updateRequestReviewStateLocally = useCallback((appointmentID, reviewState) => {
    const normalizedId = Number(appointmentID);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) return;
    const patch = {
      ...(reviewState?.reviewViewedAt !== undefined ? { reviewViewedAt: reviewState.reviewViewedAt } : {}),
      ...(reviewState?.reviewUnderReviewAt !== undefined ? { reviewUnderReviewAt: reviewState.reviewUnderReviewAt } : {}),
    };
    if (Object.keys(patch).length === 0) return;
    setRequests((current) =>
      current.map((item) => (Number(item?.appointmentID) === normalizedId ? { ...item, ...patch } : item)),
    );
    setSelectedRequestForDetails((current) =>
      Number(current?.appointmentID) === normalizedId ? { ...current, ...patch } : current,
    );
  }, []);
  const persistReviewState = useCallback(
    async (appointmentID, { markViewed = false, markUnderReview = false } = {}) => {
      const normalizedAppointmentId = Number(appointmentID);
      const normalizedAdminId = Number(sessionAdminId);
      if (!Number.isInteger(normalizedAppointmentId) || normalizedAppointmentId <= 0) return;
      if (!Number.isInteger(normalizedAdminId) || normalizedAdminId <= 0) return;
      const response = await fetch(`/admin-api/appointments/${normalizedAppointmentId}/review-state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminID: normalizedAdminId,
          markViewed: Boolean(markViewed),
          markUnderReview: Boolean(markUnderReview),
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to update review state.");
      }
      updateRequestReviewStateLocally(normalizedAppointmentId, {
        reviewViewedAt: responseData?.reviewViewedAt || null,
        reviewUnderReviewAt: responseData?.reviewUnderReviewAt || null,
      });
    },
    [sessionAdminId, updateRequestReviewStateLocally],
  );
  const openRequestDetails = (request) => {
    const requestId = Number(request?.appointmentID);
    setPreviewAttachment(null);
    setSelectedRequestForDetails(request);
    if (!Number.isInteger(requestId) || requestId <= 0 || isRequestViewed(request)) return;
    void persistReviewState(requestId, { markViewed: true }).catch(() => {
      // Keep details modal open; request remains unread until backend confirms.
    });
  };
  const markSelectedRequestAsUnderReview = async () => {
    const selectedId = Number(selectedRequestForDetails?.appointmentID);
    if (!Number.isInteger(selectedId) || selectedId <= 0) {
      setSelectedRequestForDetails(null);
      return;
    }
    try {
      await persistReviewState(selectedId, { markViewed: true, markUnderReview: true });
      setSelectedRequestForDetails(null);
    } catch (error) {
      setDeclineReasonError(error.message || "Unable to mark request as under review.");
    }
  };
  const isSelectedRequestUnderReview = isRequestUnderReview(selectedRequestForDetails);
  const activeCard = requestCards.find((card) => card.key === selectedRequestCardKey) || null;
  const selectedRequestCredentials =
    selectedRequestForDetails?.credentials && typeof selectedRequestForDetails.credentials === "object"
      ? selectedRequestForDetails.credentials
      : {};
  const brideBirthCertificateFileUrl = toSafeUrl(
    selectedRequestForDetails?.marriageBrideBirthCertificateFileUrl || selectedRequestCredentials?.brideBirthCertificateFileUrl,
  );
  const brideBirthCertificateFileName =
    String(
      selectedRequestForDetails?.marriageBrideBirthCertificateFileName || selectedRequestCredentials?.brideBirthCertificateFileName,
    ).trim() || "View Bride Birth Certificate";
  const groomBirthCertificateFileUrl = toSafeUrl(
    selectedRequestForDetails?.marriageGroomBirthCertificateFileUrl || selectedRequestCredentials?.groomBirthCertificateFileUrl,
  );
  const groomBirthCertificateFileName =
    String(
      selectedRequestForDetails?.marriageGroomBirthCertificateFileName || selectedRequestCredentials?.groomBirthCertificateFileName,
    ).trim() || "View Groom Birth Certificate";
  const additionalCredentialEntries =
    selectedRequestForDetails?.credentials && typeof selectedRequestForDetails.credentials === "object"
      ? Object.entries(selectedRequestForDetails.credentials).filter(([key]) => {
          if (FILE_LINK_CREDENTIAL_KEYS.has(key) || REDUNDANT_CREDENTIAL_KEYS.has(key) || key === "paymentRecords") return false;
          if (/(FileUrl|Url|FileName)$/.test(key)) return false;
          if (/Name$/.test(key) && FILE_NAME_PATTERN.test(String(selectedRequestForDetails.credentials?.[key] || ""))) return false;
          if (
            key === "address" &&
            String(selectedRequestForDetails.credentials?.deceasedAddress || "").trim()
          ) {
            return false;
          }
          const value = selectedRequestForDetails.credentials?.[key];
          if (value == null) return false;
          if (typeof value === "string") return value.trim().length > 0;
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === "object") return Object.keys(value).length > 0;
          return true;
        })
      : [];
  const isSelectedMarriageRequest =
    selectedRequestForDetails ? getRequestSubCategoryLabel(selectedRequestForDetails) === "Marriage" : false;
  const marriageBrideEntries = isSelectedMarriageRequest
    ? MARRIAGE_BRIDE_DETAIL_KEYS.map((key) =>
        getMarriageDetailEntry(additionalCredentialEntries, key, key === "brideAddress" ? "address" : ""),
      ).filter(Boolean)
    : [];
  const marriageGroomEntries = isSelectedMarriageRequest
    ? MARRIAGE_GROOM_DETAIL_KEYS.map((key) =>
        getMarriageDetailEntry(additionalCredentialEntries, key, key === "groomAddress" ? "address" : ""),
      ).filter(Boolean)
    : [];
  const nonMarriageSpecificEntries = sortCredentialEntries(
    isSelectedMarriageRequest
      ? additionalCredentialEntries.filter(
          ([key]) =>
            !MARRIAGE_SHARED_DETAIL_KEYS.includes(key) &&
            !MARRIAGE_BRIDE_DETAIL_KEYS.includes(key) &&
            !MARRIAGE_GROOM_DETAIL_KEYS.includes(key),
        )
      : additionalCredentialEntries,
    getResolvedServiceName(selectedRequestForDetails),
  );
  const requestFileAttachments = collectAppointmentFileAttachments(
    selectedRequestCredentials,
    getResolvedServiceName(selectedRequestForDetails),
  );
  const selectedServiceName = getResolvedServiceName(selectedRequestForDetails);
  const accountUserID = Number(selectedRequestForDetails?.accountUserID || selectedRequestForDetails?.userID);
  const submittedByName = String(selectedRequestForDetails?.accountFullName || "").trim() || "Walk-in";

  return (
    <main className="dashboard-layout">
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="admin" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero admin-list-hero">
            <div className="declined-hero-row">
              <div className="declined-hero-copy">
                <h2>Appointment Request <PageGuide pageKey="appointment-requests" /></h2>
              </div>
              <div className="view-mode-hero-actions">
                <button
                  type="button"
                  className="appointment-trash-nav"
                  onClick={() => navigate("/admin/declined-appointments")}
                  aria-label="Go to declined requests"
                  title="Go to declined requests"
                >
                  <Trash2 size={16} />
                  Declined Requests
                </button>
              </div>
            </div>
          </section>

          <section className="dashboard-panel appointment-requests-panel">
            <div className="request-type-cards-row" aria-label="Request category cards">
              <div className="request-type-cards">
                {visibleRequestCards.map((card) => (
                  <button
                    key={`request-card-${card.key}`}
                    type="button"
                    className={`request-type-card is-${toKebabCase(card.label)} ${selectedRequestCardKey === card.key ? "is-active" : ""}`}
                    onClick={() => setSelectedRequestCardKey(card.key)}
                  >
                    <span className="request-type-card-head">
                      <strong>{card.label}</strong>
                      <span className="request-type-card-notification" aria-label={`${card.count} requests`}>
                        {card.count}
                      </span>
                    </span>
                    <span className="request-type-card-body">
                      <span>{card.type}</span>
                      <em>{card.count} request{card.count === 1 ? "" : "s"}</em>
                    </span>
                  </button>
                ))}
              </div>
              {totalCardPages > 1 ? (
                <button
                  type="button"
                  className="request-cards-arrow"
                  aria-label="Next request cards"
                  onClick={() =>
                    setCardPage((currentPage) =>
                      currentPage === totalCardPages - 1 ? 0 : Math.min(totalCardPages - 1, currentPage + 1),
                    )
                  }
                >
                  <ChevronRight size={18} />
                </button>
              ) : null}
            </div>
            <div className="progress-tracker-toolbar appointment-requests-toolbar" aria-label="Search and sort requests">
              <label className="appointment-filter-field progress-tracker-search-field">
                <span className="sr-only">Search requests</span>
                <div className="progress-tracker-search-wrapper">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    className="appointment-search-input"
                    placeholder="Search requester or category"
                    aria-label="Search requests"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
              </label>
              <label className="appointment-filter-field progress-tracker-filter-field">
                <span>Review Status</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Filter by review status"
                  value={reviewFilter}
                  onChange={(event) => setReviewFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="unread">Unread</option>
                  <option value="read">Read</option>
                  <option value="under_review">Under review</option>
                </select>
              </label>
              <label className="appointment-filter-field progress-tracker-filter-field">
                <span>Sort By</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Sort by date"
                  value={sortByDate}
                  onChange={(event) => setSortByDate(event.target.value)}
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </label>
            </div>
            <div className="view-mode-content-bar">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            {requestsError ? (
              <p className="appointment-requests-empty">{requestsError}</p>
            ) : isLoadingRequests ? (
              <p className="appointment-requests-empty">Loading pending appointment requests...</p>
            ) : appointmentOnlyRequests.length === 0 ? (
              <div className="appointment-requests-empty-state" role="status">
                <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No pending appointment requests</h3>
                <p className="appointment-requests-empty-state-text">
                  When parishioners submit requests, they will appear here so you can approve or decline them.
                </p>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="appointment-requests-empty-state appointment-requests-empty-state--search" role="status">
                <div className="appointment-requests-empty-state-icon appointment-requests-empty-state-icon--muted" aria-hidden="true">
                  <Search size={34} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No matching requests</h3>
                <p className="appointment-requests-empty-state-text">
                  Try a different search term or clear the filter to see all pending requests.
                </p>
              </div>
            ) : (
              <>
                <ul className={`appointment-request-list${viewMode === "grid" ? " is-grid" : ""}`}>
                  {pagedFilteredRequests.map((request) => {
                  const requestDesign = getRequestDesign(request);
                  const requestTypeLabel = getRequestTypeLabel(request);
                  const requestSubCategoryLabel = getRequestSubCategoryLabel(request);
                  const requestTypeClass = `is-${toKebabCase(requestTypeLabel)}`;
                  const requestSubCategoryClass = `is-${toKebabCase(requestSubCategoryLabel)}`;
                  const isUnderReview = isRequestUnderReview(request);
                  const isViewed = isRequestViewed(request);
                  const requestReviewLabel = isUnderReview ? "Under Review" : isViewed ? "" : "Unread";
                  const isReadOnly = isViewed && !isUnderReview;

                  return (
                    <li
                      key={request.appointmentID}
                      className={`appointment-request-item has-card-block ${requestDesign.className} type-${toKebabCase(
                        requestTypeLabel,
                      )} ${isReadOnly ? "is-read" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openRequestDetails(request)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openRequestDetails(request);
                        }
                      }}
                    >
                      <span className="appointment-request-icon request-card-block" aria-label={requestDesign.iconLabel}>
                        <span className="request-card-block-glyph">{requestDesign.icon}</span>
                        {(() => {
                          const blockDate = request.createdAt ? new Date(request.createdAt) : null;
                          if (!blockDate || Number.isNaN(blockDate.getTime())) return null;
                          return (
                            <span className="request-card-block-date" aria-hidden="true">
                              <span>{blockDate.toLocaleString("en-US", { month: "short" })}</span>
                              <strong>{blockDate.getDate()}</strong>
                              <small>{blockDate.getFullYear()}</small>
                            </span>
                          );
                        })()}
                      </span>
                      <div className="appointment-request-details">
                        <div className="appointment-request-top">
                          <strong>{getRequestDisplayName(request)}</strong>
                        </div>
                        <div className="appointment-request-badges">
                          <span className={`appointment-badge appointment-type-badge ${requestTypeClass}`}>{requestTypeLabel}</span>
                          <span className={`appointment-badge appointment-category-badge ${requestSubCategoryClass}`}>
                            {requestSubCategoryLabel}
                          </span>
                          {requestReviewLabel ? (
                            <span className={`appointment-review-flag ${isUnderReview ? "is-under-review" : "is-unread"}`}>
                              {requestReviewLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="appointment-request-row">
                          <span>Requested at:</span>{" "}
                          {(() => {
                            const requestedDate = request.createdAt ? new Date(request.createdAt) : null;
                            return requestedDate && !Number.isNaN(requestedDate.getTime())
                              ? requestedDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                              : formatDateTime(request.createdAt);
                          })()}
                        </p>
                      </div>
                      <div className="appointment-request-actions">
                        <button
                          type="button"
                          className="approve-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openConfirmationAction({
                              type: "approve",
                              appointmentID: request.appointmentID,
                              requesterName: getRequestDisplayName(request) || "this requester",
                            });
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="decline-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openConfirmationAction({
                              type: "decline",
                              appointmentID: request.appointmentID,
                              requesterName: getRequestDisplayName(request) || "this requester",
                            });
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  );
                  })}
                </ul>
                {filteredRequests.length > 0 ? (
                  <div className="history-pagination" aria-label="Appointment requests pagination">
                    <button
                      type="button"
                      className="history-pagination-button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage <= 1}
                    >
                      Previous
                    </button>
                    <span className="history-pagination-label">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="history-pagination-button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </section>
      </div>

      {confirmationAction ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={closeConfirmationAction}>
          <section
            className={`appointment-confirm-modal${confirmationAction.type === "decline" ? " is-decline" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm appointment action"
            onClick={(event) => event.stopPropagation()}
          >
            {confirmationAction.type === "decline" ? (
              <header className="appointment-decline-header">
                <p>Appointment request</p>
                <h3>Decline this request</h3>
              </header>
            ) : (
              <h3>Approve Request?</h3>
            )}
            <div className={confirmationAction.type === "decline" ? "appointment-decline-body" : undefined}>
            <p>
              {confirmationAction.type === "approve"
                ? `Are you sure you want to approve ${confirmationAction.requesterName}'s request?`
                : `${confirmationAction.requesterName} will move to Declined Appointment Requests.`}
            </p>
            {confirmationAction.type === "decline" ? (
              <div className="appointment-decline-reason-block">
                <label htmlFor="declineReasonSelect">Reason for decline</label>
                <select
                  id="declineReasonSelect"
                  value={selectedDeclineReason}
                  onChange={(event) => {
                    setSelectedDeclineReason(event.target.value);
                    setDeclineReasonError("");
                  }}
                >
                  {DECLINE_REASON_OPTIONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
                {selectedDeclineReason === "Other reason" ? (
                  <textarea
                    rows={3}
                    placeholder="Enter other reason..."
                    value={declineCustomReason}
                    onChange={(event) => {
                      setDeclineCustomReason(event.target.value);
                      setDeclineReasonError("");
                    }}
                  />
                ) : null}
                {declineReasonError ? <p className="appointment-decline-error">{declineReasonError}</p> : null}
              </div>
            ) : null}
            <div className="appointment-confirm-actions">
              {confirmationAction.type === "decline" ? (
                <button type="button" className="secondary" onClick={closeConfirmationAction}>
                  Keep it
                </button>
              ) : null}
              <button
                type="button"
                className={confirmationAction.type === "approve" ? "approve-button" : "decline-button"}
                onClick={handleConfirmAction}
              >
                {confirmationAction.type === "decline" ? "Decline" : "Confirm"}
              </button>
              {confirmationAction.type === "approve" ? (
                <button type="button" className="secondary" onClick={closeConfirmationAction}>
                  Cancel
                </button>
              ) : null}
            </div>
            </div>
          </section>
        </div>
      ) : null}

      {selectedRequestForDetails ? (
        <div className="appointment-confirm-overlay" role="presentation" onClick={() => setSelectedRequestForDetails(null)}>
          <section
            className="appointment-confirm-modal appointment-details-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Request details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="appointment-details-shell">
            <div className="appointment-details-header">
              <div>
                <p className="appointment-details-kicker">Appointment request</p>
                <h3>Request Details</h3>
              </div>
              <span className="appointment-details-id">#{selectedRequestForDetails.appointmentID}</span>
            </div>
            <div className="appointment-details-meta">
              <span className="appointment-details-chip">{getRequestTypeLabel(selectedRequestForDetails)}</span>
              <span className="appointment-details-chip is-category">{getRequestSubCategoryLabel(selectedRequestForDetails)}</span>
            </div>
            <div className="appointment-details-content">
            {previewAttachment ? (
              <section className="appointment-file-viewer" aria-label={previewAttachment.label}>
                <div className="appointment-file-viewer-bar">
                  <strong>{previewAttachment.label}</strong>
                  <span>{previewAttachment.name}</span>
                </div>
                {previewAttachment.url && previewAttachment.kind === "image" ? (
                  <img className="appointment-file-viewer-image" src={previewAttachment.url} alt={previewAttachment.name} />
                ) : previewAttachment.url ? (
                  <iframe className="appointment-file-viewer-frame" title={previewAttachment.label} src={previewAttachment.url} />
                ) : (
                  <p className="appointment-file-missing">This file was not saved with the request, so it cannot be opened.</p>
                )}
              </section>
            ) : null}
            {!previewAttachment ? (
            <>
            <div className="appointment-details-grid">
              <div className="appointment-detail-item">
                <span className="appointment-detail-label">User ID</span>
                <p className="appointment-detail-value">{Number.isInteger(accountUserID) && accountUserID > 0 ? accountUserID : "—"}</p>
              </div>
              <div className="appointment-detail-item">
                <span className="appointment-detail-label">Submitted by</span>
                <p className="appointment-detail-value">{submittedByName}</p>
              </div>
              <div className="appointment-detail-item">
                <span className="appointment-detail-label">
                  {isChildNamedRequest(selectedRequestForDetails)
                    ? "Child"
                    : getRequestSubCategoryLabel(selectedRequestForDetails) === "Blessings"
                      ? "Blessing type"
                      : "Requester"}
                </span>
                <p className="appointment-detail-value">{getRequestDisplayName(selectedRequestForDetails)}</p>
              </div>
              <div className="appointment-detail-item">
                <span className="appointment-detail-label">Requested at</span>
                <p className="appointment-detail-value">{formatDateTime(selectedRequestForDetails.createdAt)}</p>
              </div>
            </div>
            <div className="appointment-detail-item is-full-width">
              <span className="appointment-detail-label">Note</span>
              <p className="appointment-detail-value">{getDisplayNote(selectedRequestForDetails)}</p>
            </div>
            {requestFileAttachments.length > 0 ? (
              <section className="appointment-attachments-section" aria-label="Uploaded files">
                <h4>Attachments</h4>
                <div className="appointment-details-grid">
                  {requestFileAttachments.map((attachment) => (
                    <div key={attachment.key} className="appointment-detail-item appointment-attachment-card">
                      <span className="appointment-detail-label">{attachment.label}</span>
                      <div className="appointment-attachment-action">
                        <button
                          type="button"
                          className="appointment-file-link"
                          onClick={() => setPreviewAttachment(attachment)}
                        >
                          {attachment.name}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {additionalCredentialEntries.length > 0 ? (
              <section className="appointment-extra-details-section" aria-label="Additional details">
                <h4>Details submitted</h4>
                {isSelectedMarriageRequest ? (
                  <>
                    <div className="appointment-marriage-groups-grid">
                      <section className="appointment-marriage-group" aria-label="Bride details">
                        <h5>Bride Details</h5>
                        <div className="appointment-marriage-group-items">
                          {marriageBrideEntries.length > 0 ? (
                            marriageBrideEntries.map(([key, value]) => (
                              <div key={`detail-credential-${key}`} className="appointment-detail-item">
                                <span className="appointment-detail-label">{getCredentialLabel(key, selectedServiceName)}</span>
                                <p className="appointment-detail-value">{formatCredentialDisplayValue(key, value)}</p>
                              </div>
                            ))
                          ) : (
                            <div className="appointment-detail-item">
                              <span className="appointment-detail-label">Bride Details</span>
                              <p className="appointment-detail-value">Not provided</p>
                            </div>
                          )}
                        </div>
                      </section>
                      <section className="appointment-marriage-group" aria-label="Groom details">
                        <h5>Groom Details</h5>
                        <div className="appointment-marriage-group-items">
                          {marriageGroomEntries.length > 0 ? (
                            marriageGroomEntries.map(([key, value]) => (
                              <div key={`detail-credential-${key}`} className="appointment-detail-item">
                                <span className="appointment-detail-label">{getCredentialLabel(key, selectedServiceName)}</span>
                                <p className="appointment-detail-value">{formatCredentialDisplayValue(key, value)}</p>
                              </div>
                            ))
                          ) : (
                            <div className="appointment-detail-item">
                              <span className="appointment-detail-label">Groom Details</span>
                              <p className="appointment-detail-value">Not provided</p>
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                    {nonMarriageSpecificEntries.length > 0 ? (
                      <div className="appointment-details-grid">
                        {nonMarriageSpecificEntries.map(([key, value]) => (
                          <div key={`detail-credential-${key}`} className="appointment-detail-item">
                            <span className="appointment-detail-label">{getCredentialLabel(key, selectedServiceName)}</span>
                            <p className="appointment-detail-value">{formatCredentialDisplayValue(key, value)}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="appointment-details-grid">
                    {nonMarriageSpecificEntries.map(([key, value]) => (
                      <div key={`detail-credential-${key}`} className="appointment-detail-item">
                        <span className="appointment-detail-label">{getCredentialLabel(key, selectedServiceName)}</span>
                                <p className="appointment-detail-value">{formatCredentialDisplayValue(key, value)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
            </>
            ) : null}
            </div>
            <div className={`appointment-details-actions${previewAttachment ? "" : " appointment-confirm-actions"}`}>
              {previewAttachment ? (
                <button type="button" className="appointment-details-back-button" onClick={() => setPreviewAttachment(null)}>
                  Back
                </button>
              ) : (
                <>
                  {!isSelectedRequestUnderReview ? (
                    <button
                      type="button"
                      className="under-review-button"
                      onClick={markSelectedRequestAsUnderReview}
                    >
                      Mark as Under Review
                    </button>
                  ) : null}
                  <button type="button" className="secondary" onClick={() => setSelectedRequestForDetails(null)}>
                    Close
                  </button>
                </>
              )}
            </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminAppointmentRequests;
