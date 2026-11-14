import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Cross, Droplets, FileText, Handshake, Sparkles, Users } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { deleteFromTrash, getTrashedRequests, restoreFromTrash } from "../utils/appointmentRequestStorage";
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

const getResolvedServiceName = (request) =>
  String(
    request?.resolvedSacramentName ||
      request?.specialSacramentName ||
      request?.s_sacramentName ||
      request?.sacramentName ||
      "",
  ).trim();

const toCertificateCategory = (rawType) => {
  const normalized = String(rawType || "").trim().toLowerCase();
  if (normalized.includes("marriage")) return "Marriage Certificate";
  if (normalized.includes("baptism")) return "Baptismal Certificate";
  return String(rawType || "").trim();
};

function AdminAppointmentTrash() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [trashRequests, setTrashRequests] = useState(() => getTrashedRequests());
  const [searchQuery, setSearchQuery] = useState("");
  const [trashActionError, setTrashActionError] = useState("");

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
  const sourcePage = String(location.state?.fromPage || "").trim().toLowerCase();
  const normalizedTrashFilter = String(location.state?.trashFilter || "").trim().toLowerCase();
  const showCertificateTrashOnly = normalizedTrashFilter === "certificate";
  const showAppointmentTrashOnly = normalizedTrashFilter === "appointment";
  const backPath = sourcePage === "certificate-requests" ? "/admin/certificate-requests" : "/admin/appointment-requests";
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const getRequestTypeLabel = (request) => {
    const explicitType = String(request.requestType || "").trim();
    if (explicitType) return explicitType;

    const sacrament = getResolvedServiceName(request).toLowerCase();
    if (sacrament.includes("certificate")) return "Certificate Request";
    if (sacrament.includes("kasalan ng bayan") || sacrament.includes("binyagan ng bayan")) return "Special Sacrament";
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
    if (requestType === "Special Sacrament") {
      if (normalizedSacrament === "kasalan ng bayan") return "Kasalan ng Bayan";
      if (normalizedSacrament === "binyagan ng bayan") return "Binyagan ng Bayan";
      return "Special Sacrament";
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
    if (subCategory === "Kasalan ng Bayan" || subCategory === "Binyagan ng Bayan") {
      return { className: "is-special", icon: <Users size={20} />, iconLabel: "Special sacrament request icon" };
    }
    return { className: "is-certificate", icon: <FileText size={20} />, iconLabel: "Certificate request icon" };
  };
  const scopedTrashRequests = useMemo(() => {
    if (!showCertificateTrashOnly && !showAppointmentTrashOnly) return trashRequests;
    return trashRequests.filter((request) => {
      const requestType = String(request?.requestType || "")
        .trim()
        .toLowerCase();
      if (showCertificateTrashOnly) return requestType === "certificate request";
      return requestType !== "certificate request";
    });
  }, [trashRequests, showCertificateTrashOnly, showAppointmentTrashOnly]);
  const filteredTrashRequests = scopedTrashRequests.filter((request) => {
    if (!normalizedSearch) return true;
    const fullName = String(request.requesterFullName || "").toLowerCase();
    const sacrament = getResolvedServiceName(request).toLowerCase();
    return fullName.includes(normalizedSearch) || sacrament.includes(normalizedSearch);
  });

  useEffect(() => {
    document.title = "Faithflow - Declined Requests";
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user, accountType]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const handleRestore = async (request) => {
    const appointmentID = Number(request?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;
    setTrashActionError("");

    const requestType = String(request?.requestType || "").trim().toLowerCase();
    const isCertificateRequest = requestType === "certificate request";
    let certificateRequestId = Number(request?.id);

    try {
      if (isCertificateRequest) {
        if (!Number.isInteger(certificateRequestId) || certificateRequestId <= 0) {
          const allCertificateRequestsResponse = await fetch("/admin-api/certificate-requests");
          const allCertificateRequests = await allCertificateRequestsResponse.json().catch(() => []);
          if (!allCertificateRequestsResponse.ok) {
            throw new Error("Unable to restore this certificate request.");
          }
          const normalizedCreatedAt = String(request?.createdAt || "").trim();
          const normalizedRequester = String(request?.requesterFullName || request?.fullName || "").trim().toLowerCase();
          const normalizedContact = String(request?.contactNumber || "").trim();
          const normalizedCategory = toCertificateCategory(request?.sacramentName || request?.certificateType || "").toLowerCase();
          const matchedRequest = (Array.isArray(allCertificateRequests) ? allCertificateRequests : []).find((item) => {
            const itemStatus = String(item?.status || "").trim().toLowerCase();
            if (itemStatus !== "declined") return false;
            const itemRequester = String(item?.fullName || "").trim().toLowerCase();
            const itemContact = String(item?.contactNumber || "").trim();
            const itemCategory = toCertificateCategory(item?.certificateType || "").toLowerCase();
            if (itemRequester !== normalizedRequester) return false;
            if (normalizedContact && itemContact !== normalizedContact) return false;
            if (normalizedCategory && itemCategory !== normalizedCategory) return false;
            if (!normalizedCreatedAt) return true;
            const requestTime = new Date(normalizedCreatedAt).getTime();
            const itemTime = new Date(String(item?.createdAt || "")).getTime();
            if (Number.isNaN(requestTime) || Number.isNaN(itemTime)) return true;
            return Math.abs(requestTime - itemTime) <= 90_000;
          });
          certificateRequestId = Number(matchedRequest?.id);
        }
        if (!Number.isInteger(certificateRequestId) || certificateRequestId <= 0) {
          throw new Error("Unable to restore this certificate request. Missing request reference.");
        }
        const response = await fetch(`/admin-api/certificate-requests/${certificateRequestId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "pending" }),
        });
        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(responseData.message || "Unable to restore certificate request.");
        }
      }
      const nextTrash = restoreFromTrash(appointmentID);
      setTrashRequests(nextTrash);
    } catch (error) {
      setTrashActionError(error.message || "Unable to restore request.");
    }
  };

  const handleDelete = (appointmentID) => {
    const nextTrash = deleteFromTrash(appointmentID);
    setTrashRequests(nextTrash);
  };

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
          <section className="dashboard-panel dashboard-hero">
            <div className="declined-hero-row">
              <div className="declined-hero-copy">
                <h2>{showCertificateTrashOnly ? "Declined Certificate Requests" : "Declined Requests"}</h2>
                <p>
                  {showCertificateTrashOnly
                    ? "Declined certificate requests are stored here until restored or permanently deleted."
                    : "Declined appointment requests are stored here until restored or permanently deleted."}
                </p>
              </div>
              <button
                type="button"
                className="appointment-back-button"
                onClick={() => navigate(backPath)}
              >
                Back
              </button>
            </div>
          </section>

          <section className="dashboard-panel appointment-requests-panel">
            <div className="appointment-search-row" aria-label="Search trashed requests">
              <label className="appointment-filter-field">
                <span className="sr-only">Search trashed requests</span>
                <input
                  type="search"
                  className="appointment-search-input"
                  placeholder="Search requester or category"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
            </div>
            {trashActionError ? <p className="appointment-requests-error">{trashActionError}</p> : null}

            {scopedTrashRequests.length === 0 ? (
              <p className="appointment-requests-empty">Trash is empty.</p>
            ) : filteredTrashRequests.length === 0 ? (
              <p className="appointment-requests-empty">No matching trashed requests found.</p>
            ) : (
              <ul className="appointment-request-list">
                {filteredTrashRequests.map((request) => {
                  const requestTypeLabel = getRequestTypeLabel(request);
                  const requestSubCategoryLabel = getRequestSubCategoryLabel(request);
                  const requestDesign = getRequestDesign(request);
                  const requestTypeClass = `is-${toKebabCase(requestTypeLabel)}`;
                  const requestSubCategoryClass = `is-${toKebabCase(requestSubCategoryLabel)}`;

                  return (
                    <li
                      key={request.appointmentID}
                      className={`appointment-request-item trash-request-item ${requestDesign.className} type-${toKebabCase(requestTypeLabel)}`}
                    >
                      <span className="appointment-request-icon" aria-label={requestDesign.iconLabel}>
                        {requestDesign.icon}
                      </span>
                      <div className="appointment-request-details">
                        <div className="appointment-request-top">
                          <strong>{request.requesterFullName || "Unknown Account"}</strong>
                        </div>
                        <div className="appointment-request-badges">
                          <span className={`appointment-badge appointment-type-badge ${requestTypeClass}`}>{requestTypeLabel}</span>
                          <span className={`appointment-badge appointment-category-badge ${requestSubCategoryClass}`}>
                            {requestSubCategoryLabel}
                          </span>
                        </div>
                        <p className="appointment-request-row">
                          <span>Requested at:</span> {formatDateTime(request.createdAt)}
                        </p>
                        <p className="appointment-request-row">
                          <span>Declined at:</span> {formatDateTime(request.declinedAt)}
                        </p>
                      </div>

                      <div className="appointment-request-actions">
                        <span className="trash-request-id">#{request.appointmentID}</span>
                        <button type="button" className="restore-button" onClick={() => void handleRestore(request)}>
                          Restore
                        </button>
                        <button type="button" className="delete-button" onClick={() => handleDelete(request.appointmentID)}>
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

export default AdminAppointmentTrash;
