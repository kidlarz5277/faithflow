const PENDING_REQUESTS_KEY = "faithflow_admin_pending_requests";
const TRASHED_REQUESTS_KEY = "faithflow_admin_trashed_requests";

export const DEFAULT_PENDING_REQUESTS = [
  {
    appointmentID: 101,
    requesterFullName: "Maria Santos",
    sacramentName: "Marriage",
    requestType: "Appointment",
    createdAt: "2026-03-25T09:15:00",
    note: "Preferred schedule is Saturday morning.",
  },
  {
    appointmentID: 102,
    requesterFullName: "John Dela Cruz",
    sacramentName: "Marriage",
    requestType: "Appointment",
    createdAt: "2026-03-26T14:40:00",
    note: "Requirements are almost complete.",
  },
  {
    appointmentID: 103,
    requesterFullName: "Angela Reyes",
    sacramentName: "Marriage",
    requestType: "Appointment",
    createdAt: "2026-03-27T08:22:00",
    note: "",
  },
  {
    appointmentID: 104,
    requesterFullName: "Luis Mendoza",
    sacramentName: "Marriage",
    requestType: "Appointment",
    createdAt: "2026-03-27T11:08:00",
    note: "Family requested afternoon schedule if available.",
  },
  {
    appointmentID: 105,
    requesterFullName: "Carla Villanueva",
    sacramentName: "Marriage",
    requestType: "Appointment",
    createdAt: "2026-03-28T10:14:00",
    note: "Submitted updated seminar certificate.",
  },
  {
    appointmentID: 106,
    requesterFullName: "Paolo Garcia",
    sacramentName: "Marriage",
    requestType: "Appointment",
    createdAt: "2026-03-28T15:33:00",
    note: "Request for twin baptism appointment.",
  },
  {
    appointmentID: 107,
    requesterFullName: "Jasmine Cruz",
    sacramentName: "Kasalan ng Bayan",
    requestType: "Special Sacrament",
    createdAt: "2026-03-29T09:41:00",
    note: "Included in parish group wedding list.",
  },
  {
    appointmentID: 108,
    requesterFullName: "Mark Anthony Reyes",
    sacramentName: "Kasalan ng Bayan",
    requestType: "Special Sacrament",
    createdAt: "2026-03-29T13:57:00",
    note: "Family included in community christening batch.",
  },
  {
    appointmentID: 109,
    requesterFullName: "Rina Bautista",
    sacramentName: "Baptismal Certificate",
    requestType: "Certificate Request",
    createdAt: "2026-03-30T08:06:00",
    note: "Need copy for civil registry requirements.",
  },
  {
    appointmentID: 110,
    requesterFullName: "Enrico Flores",
    sacramentName: "Baptismal Certificate",
    requestType: "Certificate Request",
    createdAt: "2026-03-30T12:19:00",
    note: "Requested one original and one extra copy.",
  },
  {
    appointmentID: 111,
    requesterFullName: "Therese Lim",
    sacramentName: "Marriage",
    requestType: "Appointment",
    createdAt: "2026-03-30T15:42:00",
    note: "House blessing requested for next Friday afternoon.",
  },
  {
    appointmentID: 112,
    requesterFullName: "Roberto Manalo",
    sacramentName: "Kasalan ng Bayan",
    requestType: "Special Sacrament",
    createdAt: "2026-03-31T09:05:00",
    note: "Submitted to the upcoming community wedding batch.",
  },
];

const parseStoredArray = (rawValue, fallbackValue = []) => {
  if (!rawValue) return fallbackValue;
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : fallbackValue;
  } catch {
    return fallbackValue;
  }
};

const savePendingRequests = (requests) => {
  localStorage.setItem(PENDING_REQUESTS_KEY, JSON.stringify(requests));
};

const saveTrashedRequests = (requests) => {
  localStorage.setItem(TRASHED_REQUESTS_KEY, JSON.stringify(requests));
};

const getNextAppointmentId = (pending = [], trash = []) => {
  const all = [...pending, ...trash];
  const maxId = all.reduce((max, item) => {
    const candidate = Number(item?.appointmentID);
    return Number.isInteger(candidate) && candidate > max ? candidate : max;
  }, 100);
  return maxId + 1;
};

const normalizeRequestType = (request) => {
  const explicitType = String(request?.requestType || "").trim();
  if (explicitType) return explicitType;

  const sacrament = String(request?.sacramentName || request?.specialSacramentName || "")
    .trim()
    .toLowerCase();
  if (sacrament.includes("certificate")) return "Certificate Request";
  if (sacrament.includes("kasalan ng bayan") || sacrament.includes("binyagan ng bayan")) return "Special Sacrament";
  return "Appointment";
};

const hasMixedDemoTypes = (requests) => {
  let hasAppointment = false;
  let hasCertificate = false;

  for (const request of requests) {
    const type = normalizeRequestType(request);
    if (type === "Appointment") hasAppointment = true;
    if (type === "Certificate Request") hasCertificate = true;
  }

  return hasAppointment && hasCertificate;
};

export const getPendingRequests = () => {
  const stored = parseStoredArray(localStorage.getItem(PENDING_REQUESTS_KEY), null);
  if (stored) {
    const hasUserSubmittedRequests = stored.some(
      (item) => item?.source === "user" || (item?.credentials && typeof item.credentials === "object"),
    );
    const isLegacyDataset = stored.length > 0 && stored.every((item) => !item?.requestType);
    const shouldRestoreDemoList =
      !hasUserSubmittedRequests && (isLegacyDataset || stored.length < 10 || !hasMixedDemoTypes(stored));
    if (shouldRestoreDemoList) {
      savePendingRequests(DEFAULT_PENDING_REQUESTS);
      return DEFAULT_PENDING_REQUESTS;
    }
    return stored;
  }
  savePendingRequests(DEFAULT_PENDING_REQUESTS);
  return DEFAULT_PENDING_REQUESTS;
};

export const getTrashedRequests = () => parseStoredArray(localStorage.getItem(TRASHED_REQUESTS_KEY), []);

export const approveRequest = (appointmentID) => {
  const pending = getPendingRequests().filter((item) => item.appointmentID !== appointmentID);
  savePendingRequests(pending);
  return pending;
};

export const addPendingRequest = (requestPayload = {}) => {
  const pending = getPendingRequests();
  const trash = getTrashedRequests();
  const nextRequest = {
    appointmentID: getNextAppointmentId(pending, trash),
    requesterFullName: String(requestPayload.requesterFullName || "").trim() || "Unknown Account",
    sacramentName: String(requestPayload.sacramentName || requestPayload.specialSacramentName || "").trim() || "Appointment",
    requestType: String(requestPayload.requestType || "").trim() || "Appointment",
    createdAt: new Date().toISOString(),
    note: String(requestPayload.note || "").trim(),
    source: "user",
    ...requestPayload,
  };
  const nextPending = [nextRequest, ...pending];
  savePendingRequests(nextPending);
  return nextPending;
};

export const declineRequestToTrash = (appointmentID, declineReason = "") => {
  const pending = getPendingRequests();
  const target = pending.find((item) => item.appointmentID === appointmentID);
  const nextPending = pending.filter((item) => item.appointmentID !== appointmentID);
  const trash = getTrashedRequests();

  if (target) {
    const trashedItem = {
      ...target,
      declinedAt: new Date().toISOString(),
      declineReason: String(declineReason || "").trim(),
    };
    saveTrashedRequests([trashedItem, ...trash]);
  }

  savePendingRequests(nextPending);
  return nextPending;
};

export const addTrashedRequest = (requestPayload = {}, declineReason = "") => {
  const trash = getTrashedRequests();
  const pending = getPendingRequests();
  const nextRequest = {
    appointmentID: getNextAppointmentId(pending, trash),
    requesterFullName: String(requestPayload.requesterFullName || "").trim() || "Unknown Account",
    sacramentName: String(requestPayload.sacramentName || requestPayload.specialSacramentName || "").trim() || "Request",
    requestType: String(requestPayload.requestType || "").trim() || "Appointment",
    createdAt: requestPayload.createdAt || new Date().toISOString(),
    note: String(requestPayload.note || "").trim(),
    source: "admin",
    ...requestPayload,
    declinedAt: new Date().toISOString(),
    declineReason: String(declineReason || "").trim(),
  };
  saveTrashedRequests([nextRequest, ...trash]);
  return nextRequest;
};

export const restoreFromTrash = (appointmentID) => {
  const trash = getTrashedRequests();
  const target = trash.find((item) => item.appointmentID === appointmentID);
  const nextTrash = trash.filter((item) => item.appointmentID !== appointmentID);
  saveTrashedRequests(nextTrash);

  if (!target) return nextTrash;

  const pending = getPendingRequests();
  const restoredItem = { ...target };
  delete restoredItem.declinedAt;
  savePendingRequests([restoredItem, ...pending]);
  return nextTrash;
};

export const deleteFromTrash = (appointmentID) => {
  const nextTrash = getTrashedRequests().filter((item) => item.appointmentID !== appointmentID);
  saveTrashedRequests(nextTrash);
  return nextTrash;
};
