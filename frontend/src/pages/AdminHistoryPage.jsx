import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheckBig, Cross, Inbox, Search, X } from "lucide-react";
import PageGuide from "../components/PageGuide";
import ViewModeToggle, { useViewMode } from "../components/ViewModeToggle";
import HistoryRecordCard from "../components/HistoryRecordCard";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { formatCertificatePickupLabel } from "../utils/parishSchedule";
import { formatListForDisplay, isListCredentialValue } from "../utils/listField";
import { describeCredentialFiles, isRedundantFileUrlKey } from "../utils/credentialFiles";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminAppointmentRequests.css";
import "./AdminProgressTracker.css";
import "./UserHistoryPage.css";

const APPOINTMENT_HISTORY_FILTER_OPTIONS = ["Marriage", "Funeral Mass", "Baptism", "Blessing"];

const formatCertificateTypeOption = (value) => {
  const label = String(value || "").trim();
  if (!label) return "";
  return /certificate/i.test(label) ? label : `${label} Certificate`;
};

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

const formatDurationBetween = (startAt, endAt, durationSecondsOverride = null) => {
  const startDate = new Date(startAt || "");
  const endDate = new Date(endAt || "");
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return "Not available";
  const formatDateRangePart = (dateValue) =>
    dateValue
      .toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
      .replace(",", "");
  return `${formatDateRangePart(startDate)}-${formatDateRangePart(endDate)}`;
};

const getHistoryStatusDesign = (statusValue) => {
  const normalized = String(statusValue || "").trim().toLowerCase();
  if (normalized === "cancelled" || normalized === "canceled") {
    return {
      label: "Declined",
      className: "is-declined",
      icon: <Cross size={18} />,
    };
  }
  return {
    label: "Completed",
    className: "is-scheduled",
    icon: <CircleCheckBig size={18} />,
  };
};

const toKebabCase = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const toLabel = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const HIDDEN_CREDENTIAL_KEYS = new Set([
  "paymentrecords",
  "scheduledeventdatetime",
  "paymentstatus",
  "receiptfileurl",
  "isarchived",
  "archivedat",
  "recordid",
  "recordedat",
  "recordedatstep",
]);

const parseCredentialJson = (value) => {
  if (typeof value !== "string") return value;
  const trimmedValue = value.trim();
  if (!(trimmedValue.startsWith("{") || trimmedValue.startsWith("["))) return value;
  try {
    return JSON.parse(trimmedValue);
  } catch {
    return value;
  }
};

const formatCredentialDisplayValue = (inputValue) => {
  const value = parseCredentialJson(inputValue);
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "object") return String(value).trim() || "Not provided";
  if (isListCredentialValue(value)) return formatListForDisplay(value);
  if (Array.isArray(value)) {
    const entries = value.filter((entry) => entry !== null && entry !== undefined && entry !== "");
    return entries.length
      ? entries.map((entry, index) => `${index + 1}. ${formatCredentialDisplayValue(entry)}`).join("\n")
      : "Not provided";
  }
  const entries = Object.entries(value).filter(
    ([key, entryValue]) =>
      !HIDDEN_CREDENTIAL_KEYS.has(String(key || "").toLowerCase()) &&
      entryValue !== null &&
      entryValue !== undefined &&
      entryValue !== "",
  );
  return entries.length
    ? entries.map(([key, entryValue]) => `${toLabel(key)}: ${formatCredentialDisplayValue(entryValue)}`).join("\n")
    : "Not provided";
};

const flattenCredentialDetails = (value, prefix = "") => {
  const parsedValue = parseCredentialJson(value);
  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) return [];
  const hasSplitMarriageAddress = Boolean(
    String(parsedValue.brideAddress || "").trim() || String(parsedValue.groomAddress || "").trim(),
  );
  const hasDeceasedAddress = Boolean(String(parsedValue.deceasedAddress || "").trim());
  return Object.entries(parsedValue).flatMap(([key, entryValue]) => {
    if (HIDDEN_CREDENTIAL_KEYS.has(String(key || "").toLowerCase())) return [];
    if (!prefix && (hasSplitMarriageAddress || hasDeceasedAddress) && key === "address") return [];
    if (!prefix && isRedundantFileUrlKey(key, parsedValue)) return [];
    const label = prefix ? `${prefix} - ${toLabel(key)}` : toLabel(key);
    const parsedEntryValue = parseCredentialJson(entryValue);
    const files = describeCredentialFiles(parsedEntryValue, parsedValue, key);
    if (files.length > 0) {
      return [{ label: label.replace(/\s+(Url|File Url|File Name|Name)$/i, ""), value: files.map((file) => file.name).join(", "), files }];
    }
    if (parsedEntryValue && typeof parsedEntryValue === "object" && !Array.isArray(parsedEntryValue)) {
      return flattenCredentialDetails(parsedEntryValue, label);
    }
    if (Array.isArray(parsedEntryValue) || isListCredentialValue(parsedEntryValue)) {
      return [{ label, value: formatCredentialDisplayValue(parsedEntryValue), wide: true }];
    }
    return [{ label, value: formatCredentialDisplayValue(parsedEntryValue) }];
  });
};

function AdminHistoryPage() {
  const PAGE_SIZE = 10;
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [viewMode, setViewMode] = useViewMode("admin-history");
  const [historyItems, setHistoryItems] = useState([]);
  const [appointmentTypeOptions, setAppointmentTypeOptions] = useState(APPOINTMENT_HISTORY_FILTER_OPTIONS);
  const [specialProgramTypeOptions, setSpecialProgramTypeOptions] = useState(["Kasalan Ng Bayan", "Binyagan Ng Bayan"]);
  const [certificateManagerTypeOptions, setCertificateManagerTypeOptions] = useState([]);
  const [certificateHistoryTypeOptions, setCertificateHistoryTypeOptions] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequestTypeFilter, setSelectedRequestTypeFilter] = useState("all");
  const [selectedSpecificTypeFilter, setSelectedSpecificTypeFilter] = useState("all");
  const [selectedSort, setSelectedSort] = useState("date_desc");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [summaryCounts, setSummaryCounts] = useState({
    total: 0,
    completed: 0,
    cancelled: 0,
  });
  const [selectedAppointmentDetails, setSelectedAppointmentDetails] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [isLoadingAppointmentDetails, setIsLoadingAppointmentDetails] = useState(false);
  const [appointmentDetailsError, setAppointmentDetailsError] = useState("");

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
  const certificateTypeOptions = [...new Set([
    ...certificateManagerTypeOptions,
    ...certificateHistoryTypeOptions,
  ])].sort((left, right) => left.localeCompare(right));
  const specificTypeOptions = selectedRequestTypeFilter === "appointment"
    ? appointmentTypeOptions
    : selectedRequestTypeFilter === "special_program"
      ? specialProgramTypeOptions
      : selectedRequestTypeFilter === "certificate"
        ? certificateTypeOptions
        : [...new Set([...appointmentTypeOptions, ...specialProgramTypeOptions, ...certificateTypeOptions])].sort((left, right) => left.localeCompare(right));
  const specificTypeLabel = selectedRequestTypeFilter === "appointment"
    ? "Appointment"
    : selectedRequestTypeFilter === "special_program"
      ? "Special Program"
      : selectedRequestTypeFilter === "certificate"
        ? "Certificate Request"
        : "Appointment or Certificate";

  useEffect(() => {
    document.title = "Faithflow - History";
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
    if (!user || accountType !== "admin" || !Number.isInteger(adminID) || adminID <= 0) return undefined;
    let isCurrent = true;
    const loadCertificateManagerTypes = async () => {
      try {
        const response = await fetch("/admin-api/certificate-types");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const options = (Array.isArray(payload?.items) ? payload.items : [])
          .map((item) => formatCertificateTypeOption(item?.certTypeName || item?.formSchema?.label || item?.label))
          .filter(Boolean);
        if (isCurrent) {
          setCertificateManagerTypeOptions([...new Set(options)].sort((left, right) => left.localeCompare(right)));
        }
      } catch {
        if (isCurrent) setCertificateManagerTypeOptions([]);
      }
    };

    void loadCertificateManagerTypes();
    return () => {
      isCurrent = false;
    };
  }, [accountType, adminID, user]);

  useEffect(() => {
    if (!user || accountType !== "admin") return;
    if (!Number.isInteger(adminID) || adminID <= 0) return;

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      setHistoryError("");
      try {
        const params = new URLSearchParams({
          adminID: String(adminID),
          page: String(currentPage),
          pageSize: String(PAGE_SIZE),
          sort: selectedSort,
          status: selectedStatusFilter,
        });
        if (selectedRequestTypeFilter !== "all") {
          params.set("requestType", selectedRequestTypeFilter);
        }
        if (selectedSpecificTypeFilter !== "all") {
          params.set("type", selectedSpecificTypeFilter);
        }
        if (searchQuery.trim()) {
          params.set("search", searchQuery.trim());
        }

        const response = await fetch(`/admin-api/history/admin?${params.toString()}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) {
          throw new Error(payload?.message || "Unable to load history records.");
        }

        const nextItems = Array.isArray(payload?.items) ? payload.items : [];
        const nextAppointmentTypeOptions = Array.isArray(payload?.appointmentTypeOptions)
          ? payload.appointmentTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        const nextSpecialProgramTypeOptions = Array.isArray(payload?.specialProgramTypeOptions)
          ? payload.specialProgramTypeOptions.map((type) => String(type || "").trim()).filter(Boolean)
          : [];
        const nextCertificateTypeOptions = Array.isArray(payload?.certificateTypeOptions)
          ? payload.certificateTypeOptions.map(formatCertificateTypeOption).filter(Boolean)
          : [];
        const nextPagination = payload?.pagination && typeof payload.pagination === "object" ? payload.pagination : {};
        const nextSummary = payload?.summary && typeof payload.summary === "object" ? payload.summary : {};

        setHistoryItems(nextItems);
        setAppointmentTypeOptions(
          nextAppointmentTypeOptions.length > 0 ? nextAppointmentTypeOptions : APPOINTMENT_HISTORY_FILTER_OPTIONS,
        );
        if (nextSpecialProgramTypeOptions.length) setSpecialProgramTypeOptions(nextSpecialProgramTypeOptions);
        setCertificateHistoryTypeOptions(nextCertificateTypeOptions);
        setPagination({
          page: Number(nextPagination.page) > 0 ? Number(nextPagination.page) : 1,
          pageSize: Number(nextPagination.pageSize) > 0 ? Number(nextPagination.pageSize) : PAGE_SIZE,
          totalItems: Math.max(0, Number(nextPagination.totalItems) || 0),
          totalPages: Math.max(1, Number(nextPagination.totalPages) || 1),
          hasPreviousPage: Boolean(nextPagination.hasPreviousPage),
          hasNextPage: Boolean(nextPagination.hasNextPage),
        });
        setSummaryCounts({
          total: Math.max(0, Number(nextSummary.total) || 0),
          completed: Math.max(0, Number(nextSummary.completed) || 0),
          cancelled: Math.max(0, Number(nextSummary.cancelled) || 0),
        });
      } catch (error) {
        setHistoryItems([]);
        setAppointmentTypeOptions(APPOINTMENT_HISTORY_FILTER_OPTIONS);
        setCertificateHistoryTypeOptions([]);
        setPagination({
          page: 1,
          pageSize: PAGE_SIZE,
          totalItems: 0,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        });
        setHistoryError(error.message || "Unable to load history records.");
      } finally {
        setIsLoadingHistory(false);
      }
    };

    void loadHistory();
  }, [PAGE_SIZE, accountType, adminID, currentPage, searchQuery, selectedRequestTypeFilter, selectedSpecificTypeFilter, selectedSort, selectedStatusFilter, user]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRequestTypeFilter, selectedSpecificTypeFilter, selectedSort, selectedStatusFilter]);

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const openAppointmentDetails = async (historyItem) => {
    const appointmentID = Number(historyItem?.referenceId);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;
    setAppointmentDetailsError("");
    setIsLoadingAppointmentDetails(true);
    try {
      const response = await fetch(`/admin-api/appointments/${appointmentID}/history-details?adminID=${adminID}`);
      const payload = await response.json().catch(() => null);
      if (response.ok && payload) {
        setSelectedAppointmentDetails(payload);
        return;
      }

      // Fallback path: build complete details using existing DB-backed APIs.
      const [appointmentsResponse, sacramentsResponse, specialSacramentsResponse, progressResponse, priestsResponse] = await Promise.all([
        fetch("/admin-api/appointments"),
        fetch("/admin-api/sacraments"),
        fetch("/admin-api/special-sacraments"),
        fetch(`/admin-api/appointments/${appointmentID}/progress`),
        fetch(`/admin-api/priests?adminID=${adminID}&includeInactive=true`),
      ]);
      const appointmentsData = await appointmentsResponse.json().catch(() => []);
      const sacramentsData = await sacramentsResponse.json().catch(() => []);
      const specialSacramentsData = await specialSacramentsResponse.json().catch(() => []);
      const progressPayload = await progressResponse.json().catch(() => null);
      const priestsData = await priestsResponse.json().catch(() => []);

      if (!appointmentsResponse.ok) throw new Error("Unable to load appointment records.");
      if (!sacramentsResponse.ok) throw new Error("Unable to load sacrament records.");
      if (!specialSacramentsResponse.ok) throw new Error("Unable to load special sacrament records.");
      if (!progressResponse.ok) throw new Error("Unable to load appointment progress details.");

      const matchingAppointment = (Array.isArray(appointmentsData) ? appointmentsData : []).find(
        (item) => Number(item?.appointmentID) === appointmentID,
      );
      if (!matchingAppointment) throw new Error("The selected appointment was not found.");

      const sacramentNameMap = new Map(
        (Array.isArray(sacramentsData) ? sacramentsData : []).map((item) => [Number(item.sacramentID), String(item.sacramentName || "")]),
      );
      const specialSacramentNameMap = new Map(
        (Array.isArray(specialSacramentsData) ? specialSacramentsData : []).map((item) => [
          Number(item.s_sacramentID),
          String(item.s_sacramentName || ""),
        ]),
      );
      const priestNameMap = new Map(
        (Array.isArray(priestsData) ? priestsData : []).map((item) => [Number(item.priestID), String(item.fullName || "").trim()]),
      );
      const fallbackConductedPriestID = Number(progressPayload?.finalDetails?.conductedPriestID);
      const resolvedConductedPriestID = Number.isInteger(fallbackConductedPriestID) && fallbackConductedPriestID > 0
        ? fallbackConductedPriestID
        : matchingAppointment?.priestID
          ? Number(matchingAppointment.priestID)
          : null;

      setSelectedAppointmentDetails({
        appointmentID: Number(matchingAppointment?.appointmentID),
        userID: matchingAppointment?.userID ? Number(matchingAppointment.userID) : null,
        sacramentID: matchingAppointment?.sacramentID ? Number(matchingAppointment.sacramentID) : null,
        s_sacramentID: matchingAppointment?.s_sacramentID ? Number(matchingAppointment.s_sacramentID) : null,
        progressID: matchingAppointment?.progressID ? Number(matchingAppointment.progressID) : null,
        status: String(matchingAppointment?.status || ""),
        adminID: matchingAppointment?.adminID ? Number(matchingAppointment.adminID) : null,
        priestID: resolvedConductedPriestID,
        priestName:
          String(progressPayload?.finalDetails?.priestName || "").trim() ||
          String(matchingAppointment?.priestName || "").trim() ||
          (resolvedConductedPriestID ? String(priestNameMap.get(resolvedConductedPriestID) || "").trim() : ""),
        requesterFullName: String(matchingAppointment?.requesterFullName || ""),
        requestType: String(matchingAppointment?.requestType || "Appointment"),
        credentials:
          matchingAppointment?.credentials && typeof matchingAppointment.credentials === "object" ? matchingAppointment.credentials : {},
        createdAt: matchingAppointment?.createdAt || null,
        finishedAt: matchingAppointment?.finishedAt || null,
        historyStartAt: matchingAppointment?.historyStartAt || matchingAppointment?.createdAt || null,
        historyEndAt: matchingAppointment?.historyEndAt || matchingAppointment?.finishedAt || matchingAppointment?.createdAt || null,
        historyDurationSeconds: Number.isFinite(Number(matchingAppointment?.historyDurationSeconds))
          ? Number(matchingAppointment.historyDurationSeconds)
          : null,
        note: String(matchingAppointment?.note || ""),
        sacramentName: sacramentNameMap.get(Number(matchingAppointment?.sacramentID)) || "",
        specialSacramentName: specialSacramentNameMap.get(Number(matchingAppointment?.s_sacramentID)) || "",
        finalDetails: {
          scheduledEventDateTime: progressPayload?.finalDetails?.scheduledEventDateTime || null,
          eventDone: Boolean(progressPayload?.finalDetails?.eventDone),
          conductedPriestID: resolvedConductedPriestID,
          priestName: String(progressPayload?.finalDetails?.priestName || "").trim(),
          priestComments: String(progressPayload?.finalDetails?.priestComments || "").trim(),
          secretaryRemarks: String(progressPayload?.finalDetails?.secretaryRemarks || "").trim(),
        },
      });
    } catch (error) {
      setSelectedAppointmentDetails(null);
      setAppointmentDetailsError(error.message || "Unable to load appointment details from database.");
    } finally {
      setIsLoadingAppointmentDetails(false);
    }
  };

  const openCertificateDetails = async (historyItem) => {
    const certificateRequestID = Number(historyItem?.referenceId);
    if (!Number.isInteger(certificateRequestID) || certificateRequestID <= 0) return;
    setAppointmentDetailsError("");
    setIsLoadingAppointmentDetails(true);
    try {
      const response = await fetch(`/admin-api/certificate-requests/${certificateRequestID}/history-details?adminID=${adminID}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error(payload?.message || "Unable to load certificate request details from database.");
      }
      setSelectedAppointmentDetails({
        ...payload,
        referenceId: Number(payload?.id) || certificateRequestID,
        requesterFullName: String(payload?.fullName || historyItem?.requesterName || "").trim() || "Unknown requester",
        sacramentName: String(payload?.certificateType || historyItem?.sacramentName || "Certificate Request"),
        historyStartAt: payload?.historyStartAt || payload?.createdAt || null,
        historyEndAt: payload?.historyEndAt || payload?.finishedAt || payload?.createdAt || null,
        historyDurationSeconds: Number.isFinite(Number(payload?.historyDurationSeconds)) ? Number(payload.historyDurationSeconds) : null,
      });
    } catch (error) {
      setSelectedAppointmentDetails(null);
      setAppointmentDetailsError(error.message || "Unable to load certificate request details from database.");
    } finally {
      setIsLoadingAppointmentDetails(false);
    }
  };

  const openHistoryDetails = async (historyItem) => {
    if (historyItem?.requestTypeKey === "certificate") {
      await openCertificateDetails(historyItem);
      return;
    }
    await openAppointmentDetails(historyItem);
  };

  const selectedAppointmentDetailView = useMemo(() => {
    if (!selectedAppointmentDetails) {
      return { title: "Appointment Details", chips: [], sections: [] };
    }
    const normalizedRequestType = String(selectedAppointmentDetails?.requestType || "").trim().toLowerCase();
    const statusLabel = selectedAppointmentDetails.status || "Unknown";
    const formRows = flattenCredentialDetails(selectedAppointmentDetails.credentials);

    if (normalizedRequestType === "certificate") {
      const normalizedStatus = String(statusLabel).trim().toLowerCase();
      const pickupLabel =
        String(selectedAppointmentDetails?.pickupSchedule || "").trim() ||
        formatCertificatePickupLabel(
          selectedAppointmentDetails?.pickupDate,
          selectedAppointmentDetails?.pickupTime,
          selectedAppointmentDetails?.pickupEndTime,
        );
      const receiptNumber = String(
        selectedAppointmentDetails?.receiptNumber || selectedAppointmentDetails?.credentials?.receiptNumber || "",
      ).trim();
      const timelineRows = [
        { label: "Start Date", value: formatDateTime(selectedAppointmentDetails.historyStartAt || selectedAppointmentDetails.createdAt) },
        { label: "End Date", value: formatDateTime(selectedAppointmentDetails.historyEndAt || selectedAppointmentDetails.finishedAt) },
        {
          label: "Duration",
          value: formatDurationBetween(
            selectedAppointmentDetails.historyStartAt || selectedAppointmentDetails.createdAt,
            selectedAppointmentDetails.historyEndAt || selectedAppointmentDetails.finishedAt,
            selectedAppointmentDetails.historyDurationSeconds,
          ),
        },
      ];
      if (pickupLabel) timelineRows.push({ label: "Pickup Schedule", value: pickupLabel });
      if (receiptNumber) timelineRows.push({ label: "Receipt Number", value: receiptNumber });
      const sections = [
        {
          title: "Request",
          rows: [
            { label: "Request ID", value: `#${selectedAppointmentDetails.referenceId || selectedAppointmentDetails.id || "N/A"}` },
            { label: "Requester", value: selectedAppointmentDetails.requesterFullName || "Unknown requester" },
            { label: "Certificate Type", value: selectedAppointmentDetails.sacramentName || "Certificate Request" },
            { label: "Status", value: statusLabel },
          ],
        },
        { title: "Timeline", rows: timelineRows },
      ];
      if (normalizedStatus === "cancelled" || normalizedStatus === "declined") {
        sections.push({
          title: "Decline Reason",
          rows: [
            {
              label: "Reason",
              value:
                String(selectedAppointmentDetails?.declineReason || selectedAppointmentDetails?.note || "").trim() ||
                "No decline reason was provided by the admin.",
              wide: true,
            },
          ],
        });
      }
      if (formRows.length > 0) sections.push({ title: "Request Form", rows: formRows });
      return {
        title: "Certificate Request Details",
        chips: ["Certificate", selectedAppointmentDetails.sacramentName || "Certificate Request", statusLabel],
        sections,
      };
    }

    const serviceLabel =
      selectedAppointmentDetails.sacramentName ||
      selectedAppointmentDetails.specialSacramentName ||
      "Appointment";
    const sections = [
      {
        title: "Request",
        rows: [
          { label: "Appointment ID", value: `#${selectedAppointmentDetails.appointmentID}` },
          {
            label: String(selectedAppointmentDetails.requestType || "").toLowerCase().includes("special") ? "Requesters" : "Requester",
            value: selectedAppointmentDetails.requesterFullName || "Unknown requester",
            wide: String(selectedAppointmentDetails.requestType || "").toLowerCase().includes("special"),
          },
          { label: "Service", value: serviceLabel },
          { label: "Status", value: statusLabel },
          {
            label: "Priest Who Conducted",
            value:
              String(selectedAppointmentDetails?.finalDetails?.priestName || selectedAppointmentDetails.priestName || "").trim() ||
              (selectedAppointmentDetails?.finalDetails?.conductedPriestID || selectedAppointmentDetails.priestID
                ? `ID #${selectedAppointmentDetails?.finalDetails?.conductedPriestID || selectedAppointmentDetails.priestID}`
                : "Not assigned"),
          },
        ],
      },
      {
        title: "Schedule",
        rows: [
          { label: "Start Date", value: formatDateTime(selectedAppointmentDetails.historyStartAt || selectedAppointmentDetails.createdAt) },
          { label: "End Date", value: formatDateTime(selectedAppointmentDetails.historyEndAt || selectedAppointmentDetails.finishedAt) },
          {
            label: "Duration",
            value: formatDurationBetween(
              selectedAppointmentDetails.historyStartAt || selectedAppointmentDetails.createdAt,
              selectedAppointmentDetails.historyEndAt || selectedAppointmentDetails.finishedAt,
              selectedAppointmentDetails.historyDurationSeconds,
            ),
          },
          {
            label: "Event Schedule",
            value: formatDateTime(selectedAppointmentDetails?.finalDetails?.scheduledEventDateTime),
          },
        ],
      },
    ];
    if (formRows.length > 0) sections.push({ title: "Request Form", rows: formRows });
    sections.push({
        title: "Notes",
        rows: [
          {
            label: "Priest Comments",
            value: String(selectedAppointmentDetails?.finalDetails?.priestComments || "").trim() || "No comments",
            wide: true,
          },
          {
            label: "Secretary Remarks",
            value: String(selectedAppointmentDetails?.finalDetails?.secretaryRemarks || "").trim() || "No remarks",
            wide: true,
          },
          {
            label: "Note",
            value: String(selectedAppointmentDetails?.note || "").trim() || "No note provided.",
            wide: true,
          },
        ],
    });
    return {
      title: "Appointment Details",
      chips: [selectedAppointmentDetails.requestType || "Appointment", serviceLabel, statusLabel],
      sections,
    };
  }, [selectedAppointmentDetails]);

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
            <h2>History <PageGuide pageKey="admin-history" /></h2>
          </section>

          <section className="dashboard-panel priest-history-panel">
            <div className="priest-page-toolbar priest-history-toolbar" aria-label="History filters">
              <label className="appointment-filter-field">
                <span>Search</span>
                <input
                  type="search"
                  className="appointment-search-input"
                  placeholder="Search requester, sacrament, type, status, or ID"
                  aria-label="Search history records"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <label className="appointment-filter-field">
                <span>Type</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Filter by history type"
                  value={selectedRequestTypeFilter}
                  onChange={(event) => {
                    setSelectedRequestTypeFilter(event.target.value);
                    setSelectedSpecificTypeFilter("all");
                  }}
                >
                  <option value="all">All</option>
                  <option value="appointment">Appointment</option>
                  <option value="special_program">Special Program</option>
                  <option value="certificate">Certificate Request</option>
                </select>
              </label>
              <label className="appointment-filter-field">
                <span>{specificTypeLabel}</span>
                <select
                  className="appointment-filter-select"
                  aria-label={`Filter by ${specificTypeLabel.toLowerCase()} type`}
                  value={selectedSpecificTypeFilter}
                  onChange={(event) => setSelectedSpecificTypeFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  {specificTypeOptions.map((type) => (
                    <option key={`history-specific-type-${type}`} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="appointment-filter-field">
                <span>Sort By</span>
                <select
                  className="appointment-filter-select"
                  aria-label="Sort history records"
                  value={selectedSort}
                  onChange={(event) => setSelectedSort(event.target.value)}
                >
                  <option value="date_desc">Newest</option>
                  <option value="date_asc">Oldest</option>
                </select>
              </label>
            </div>

            <div className="priest-history-summary" role="group" aria-label="Filter history by status">
              <button
                type="button"
                className={selectedStatusFilter === "all" ? "is-active" : ""}
                onClick={() => setSelectedStatusFilter("all")}
                aria-pressed={selectedStatusFilter === "all"}
              >
                <span>All Records</span>
                <strong>{summaryCounts.total}</strong>
              </button>
              <button
                type="button"
                className={`is-completed${selectedStatusFilter === "completed" ? " is-active" : ""}`}
                onClick={() => setSelectedStatusFilter("completed")}
                aria-pressed={selectedStatusFilter === "completed"}
              >
                <span>Completed</span>
                <strong>{summaryCounts.completed}</strong>
              </button>
              <button
                type="button"
                className={`is-cancelled${selectedStatusFilter === "declined" ? " is-active" : ""}`}
                onClick={() => setSelectedStatusFilter("declined")}
                aria-pressed={selectedStatusFilter === "declined"}
              >
                <span>Declined</span>
                <strong>{summaryCounts.cancelled}</strong>
              </button>
            </div>

            <div className="view-mode-content-bar">
              {!isLoadingHistory && !historyError ? (
                <p className="priest-history-result-count">
                  Showing {historyItems.length} of {pagination.totalItems} record{pagination.totalItems === 1 ? "" : "s"}
                </p>
              ) : null}
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>

            {historyError ? (
              <p className="priest-dashboard-error">{historyError}</p>
            ) : isLoadingHistory ? (
              <p className="priest-page-empty">Loading history records...</p>
            ) : historyItems.length === 0 && summaryCounts.total === 0 ? (
              <div className="appointment-requests-empty-state" role="status">
                <div className="appointment-requests-empty-state-icon" aria-hidden="true">
                  <Inbox size={36} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No history yet</h3>
                <p className="appointment-requests-empty-state-text">
                  Completed user requests from appointments and certificate requests will appear here.
                </p>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="appointment-requests-empty-state appointment-requests-empty-state--search" role="status">
                <div className="appointment-requests-empty-state-icon appointment-requests-empty-state-icon--muted" aria-hidden="true">
                  <Search size={34} strokeWidth={1.5} />
                </div>
                <h3 className="appointment-requests-empty-state-title">No matching records</h3>
                <p className="appointment-requests-empty-state-text">Try a different search term or filter.</p>
              </div>
            ) : (
              <ul className={`priest-history-list${viewMode === "grid" ? " is-grid" : ""}`}>
                {historyItems.map((item) => {
                  const isCancelled = String(item.status || "").trim().toLowerCase().startsWith("cancel");
                  const isCancelledAppointment = isCancelled && Boolean(item.isCancelledAppointment);
                  const isCertificate = item.requestTypeKey === "certificate";
                  return (
                    <HistoryRecordCard
                      key={item.id}
                      dateValue={item.endAt || item.resolvedAt || item.createdAt}
                      title={item.sacramentName || "Sacramental Activity"}
                      status={isCancelled ? "cancelled" : "completed"}
                      statusLabel={isCancelledAppointment ? "Cancelled" : getHistoryStatusDesign(item.status).label}
                      facts={[
                        {
                          label: item.requestTypeKey === "special_program" ? "Requesters" : "Requester",
                          value: item.requesterName || "Unknown requester",
                        },
                        { label: "Submitted", value: formatDateTime(item.createdAt || item.startAt) },
                        {
                          label: isCancelledAppointment ? "Cancelled" : isCancelled ? "Declined" : "Finished",
                          value: formatDateTime(item.endAt || item.resolvedAt),
                        },
                        { label: "Request Type", value: item.typeLabel || (isCertificate ? "Certificate Request" : "Appointment") },
                      ]}
                      compact
                      onView={() => void openHistoryDetails(item)}
                    />
                  );
                })}
              </ul>
            )}
            {!isLoadingHistory && pagination.totalItems > 0 ? (
              <div className="history-pagination" aria-label="History pagination">
                <button
                  type="button"
                  className="history-pagination-button"
                  onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                  disabled={!pagination.hasPreviousPage}
                >
                  Previous
                </button>
                <span className="history-pagination-label">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="history-pagination-button"
                  onClick={() => setCurrentPage((current) => Math.min(pagination.totalPages, current + 1))}
                  disabled={!pagination.hasNextPage}
                >
                  Next
                </button>
              </div>
            ) : null}
          </section>
        </section>
      </div>
      {isLoadingAppointmentDetails ? (
        <div className="user-history-modal-overlay" role="presentation">
          <section className="user-history-modal" role="dialog" aria-modal="true" aria-label="Loading appointment details">
            <section className="user-history-modal-section">
              <h4>Loading request details...</h4>
            </section>
          </section>
        </div>
      ) : null}
      {appointmentDetailsError ? (
        <div className="user-history-modal-overlay" role="presentation" onClick={() => setAppointmentDetailsError("")}>
          <section
            className="user-history-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Request details error"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="user-history-modal-section">
              <h4>Unable to load details</h4>
              <p>{appointmentDetailsError}</p>
            </section>
            <button type="button" className="user-history-view-button" onClick={() => setAppointmentDetailsError("")}>
              Close
            </button>
          </section>
        </div>
      ) : null}
      {selectedAppointmentDetails ? (
        <div className="user-history-modal-overlay" role="presentation" onClick={() => { setSelectedAppointmentDetails(null); setPreviewFile(null); }}>
          <section
            className="user-history-modal admin-history-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="History request details"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="user-history-modal-header">
              <div>
                <span className="admin-history-detail-kicker">History Record</span>
                <h3>{selectedAppointmentDetailView.title}</h3>
                <p>
                  {`Record #${selectedAppointmentDetails.referenceId || selectedAppointmentDetails.appointmentID || selectedAppointmentDetails.id || "N/A"} | ${selectedAppointmentDetails.requesterFullName || "Unknown requester"}`}
                </p>
              </div>
              <button
                type="button"
                className="user-history-modal-close"
                onClick={() => { setSelectedAppointmentDetails(null); setPreviewFile(null); }}
                aria-label="Close appointment details"
              >
                <X size={18} />
              </button>
            </header>
            {selectedAppointmentDetailView.chips.length > 0 ? (
              <div className="user-history-modal-chips">
                {selectedAppointmentDetailView.chips.map((chip, index) => (
                  <span
                    key={`${chip}-${index}`}
                    className={`user-history-modal-chip${index === 2 ? ` is-status is-${toKebabCase(chip)}` : ""}`}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="user-history-modal-body">
              {previewFile ? (
                <section className="appointment-file-viewer" aria-label={previewFile.name}>
                  <div className="appointment-file-viewer-bar">
                    <strong>{previewFile.name}</strong>
                    <button type="button" className="appointment-file-link" onClick={() => setPreviewFile(null)}>
                      Back to details
                    </button>
                  </div>
                  {previewFile.kind === "image" ? (
                    <img className="appointment-file-viewer-image" src={previewFile.url} alt={previewFile.name} />
                  ) : (
                    <iframe className="appointment-file-viewer-frame" title={previewFile.name} src={previewFile.url} />
                  )}
                </section>
              ) : (
                selectedAppointmentDetailView.sections.map((section) => (
                  <section key={section.title} className="user-history-modal-section">
                    <h4>{section.title}</h4>
                    <div className="user-history-modal-grid">
                      {section.rows.map((detail) => (
                        <p
                          key={`${section.title}-${detail.label}-${detail.value}`}
                          className={detail.wide ? "is-wide" : undefined}
                        >
                          <span>{detail.label}</span>
                          {Array.isArray(detail.files) && detail.files.length > 0 ? (
                            <strong className="history-file-links">
                              {detail.files.map((file) => (
                                <button
                                  key={`${file.url}-${file.name}`}
                                  type="button"
                                  className="appointment-file-link"
                                  onClick={() => setPreviewFile(file)}
                                >
                                  {file.name}
                                </button>
                              ))}
                            </strong>
                          ) : (
                            <strong>{detail.value}</strong>
                          )}
                        </p>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminHistoryPage;
