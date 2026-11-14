import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CalendarClock, CalendarDays, CalendarX2, ChevronLeft, ChevronRight, Circle, CircleCheck, CircleCheckBig, Receipt, ShieldCheck, User, X } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { isSpecialProgramAppointment } from "../utils/specialProgramProgress";
import { formatOccupiedSlotsLabel } from "../utils/parishSchedule";
import { pushUiNotice } from "../utils/uiNotice";
import { CancelAppointmentModal, ConfirmActionDialog } from "../components/AppointmentCancellation";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressDetails.css";

const formatDateTime = (dateValue) => {
  if (!dateValue) return "Not available";
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "Not available";
  return parsedDate.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatManilaTime = (dateValue) => {
  const parsedDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return parsedDate.toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatScheduleTimeRange = (dateValue, endValue = null) => {
  if (!dateValue) return "Not set";
  const startDate = new Date(dateValue);
  if (Number.isNaN(startDate.getTime())) return "Not set";
  const parsedEndDate = endValue ? new Date(endValue) : null;
  const endDate =
    parsedEndDate && !Number.isNaN(parsedEndDate.getTime()) && parsedEndDate > startDate
      ? parsedEndDate
      : new Date(startDate.getTime() + 60 * 60 * 1000);
  const startLabel = formatManilaTime(startDate);
  const endLabel = formatManilaTime(endDate);
  if (!startLabel || !endLabel) return "Not set";
  return `${startLabel} to ${endLabel}`;
};

const formatEventScheduleRange = (dateValue, endValue = null) => {
  if (!dateValue) return "Not scheduled yet";
  const startDate = new Date(dateValue);
  if (Number.isNaN(startDate.getTime())) return "Not scheduled yet";
  const dateLabel = startDate.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${dateLabel}, ${formatScheduleTimeRange(startDate, endValue)}`;
};

const formatLongDate = (dateValue) => {
  if (!dateValue) return "Date not set";
  const parsedDate = new Date(`${String(dateValue).trim()}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "Date not set";
  return parsedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatScheduleDate = (dateValue) => {
  if (!dateValue) return "Not scheduled";
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "Not scheduled";
  return parsedDate.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatScheduleTime = (dateValue, endValue = null) => formatScheduleTimeRange(dateValue, endValue);

const formatFinalDetailsTime = (details) => {
  const slotsLabel = details?.programTimeSlots?.length ? formatOccupiedSlotsLabel(details.programTimeSlots) : "";
  return slotsLabel || formatScheduleTime(details?.scheduledEventDateTime, details?.scheduledEventEndDateTime);
};

const formatFinalDetailsSchedule = (details) => {
  const slotsLabel = details?.programTimeSlots?.length ? formatOccupiedSlotsLabel(details.programTimeSlots) : "";
  const startDate = new Date(details?.scheduledEventDateTime || "");
  if (!slotsLabel || Number.isNaN(startDate.getTime())) {
    return formatEventScheduleRange(details?.scheduledEventDateTime, details?.scheduledEventEndDateTime);
  }
  const dateLabel = startDate.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${dateLabel}, ${slotsLabel}`;
};

const to12HourTime = (timeValue) => {
  if (!timeValue) return "Time not set";
  const [hoursRaw, minutesRaw] = String(timeValue).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "Time not set";
  const normalizedHours = ((hours % 24) + 24) % 24;
  const period = normalizedHours >= 12 ? "PM" : "AM";
  const twelveHour = normalizedHours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${period}`;
};

const formatPreferredScheduleRange = (dateValue, timeValue) => {
  const dateKey = String(dateValue || "").trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
  if (!dateKey) return "Not specified";
  const timeParts = String(timeValue || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!timeParts) return formatLongDate(dateKey);
  const timeKey = `${String(Number(timeParts[1])).padStart(2, "0")}:${timeParts[2]}`;
  const startDate = new Date(`${dateKey}T${timeKey}:00+08:00`);
  if (Number.isNaN(startDate.getTime())) {
    return `${formatLongDate(dateKey)}, ${to12HourTime(timeKey)}`;
  }
  return formatEventScheduleRange(startDate);
};

const toDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const toMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const isScheduleDateLocked = (dateKey, minDateKey) =>
  String(dateKey || "").trim() < String(minDateKey || "").trim();

const getProgressStatusMeta = (status) => {
  const normalized = String(status || "").trim();
  if (normalized === "Paid") return { className: "is-paid", label: "Paid" };
  if (normalized === "Free") return { className: "is-free", label: "Free" };
  if (normalized === "Unpaid") return { className: "is-unpaid", label: "Unpaid" };
  if (normalized === "Completed") return { className: "is-completed", label: "Completed" };
  if (normalized === "Declined") return { className: "is-declined", label: "Declined" };
  if (normalized === "Ongoing") return { className: "is-ongoing", label: "Ongoing" };
  return { className: "is-pending", label: normalized || "Pending" };
};

const CHECKLIST_TEMPLATES = {
  Marriage: [
    {
      title: "Initial Request Review",
      tasks: ["Review requester profile details", "Confirm marriage service request", "Check preferred schedule notes"],
    },
    {
      title: "Documents",
      tasks: ["Cenomar submitted", "Birth certificate submitted", "Baptismal certificate submitted", "Marriage license submitted"],
    },
    {
      title: "Canonical Interview",
      tasks: ["Schedule canonical interview", "Record interview findings", "Confirm no canonical impediments"],
    },
    {
      title: "Scheduling and Preparation",
      tasks: ["Assign officiating priest", "Finalize church and time slot", "Prepare ceremony logistics"],
    },
    {
      title: "Final Confirmation",
      tasks: ["Send final confirmation to requester", "Archive approved documents", "Mark marriage request completed"],
    },
  ],
  "Funeral Mass": [
    {
      title: "Initial Review",
      tasks: ["Verify family request details", "Check required documents", "Confirm preferred mass schedule"],
    },
    {
      title: "Service Preparation",
      tasks: ["Coordinate with priest", "Confirm church availability", "Prepare liturgical requirements"],
    },
    {
      title: "Family Coordination",
      tasks: ["Confirm family attendance details", "Set final wake or mass details", "Share reminders with requester"],
    },
    {
      title: "Mass Day Preparation",
      tasks: ["Prepare church materials", "Coordinate support volunteers", "Validate day-of schedule"],
    },
    {
      title: "Completion",
      tasks: ["Notify family of final schedule", "Record service details", "Mark request as completed"],
    },
  ],
  Baptism: [
    {
      title: "Request Validation",
      tasks: ["Validate child and guardian details", "Review baptismal requirements", "Check parish eligibility"],
    },
    {
      title: "Program Scheduling",
      tasks: ["Assign baptism schedule", "Confirm catechism or seminar completion", "Coordinate officiating priest"],
    },
    {
      title: "Documents and Registry",
      tasks: ["Verify church record details", "Prepare baptism registry data", "Validate names and sponsors"],
    },
    {
      title: "Ceremony Preparation",
      tasks: ["Confirm ceremony checklist", "Coordinate priest and schedule", "Prepare liturgical needs"],
    },
    {
      title: "Finalization",
      tasks: ["Confirm baptism details with requester", "Prepare church registry entry", "Complete post-service update"],
    },
  ],
  Blessing: [
    {
      title: "Request Intake",
      tasks: ["Confirm blessing type and purpose", "Review requester details", "Verify supporting notes"],
    },
    {
      title: "Schedule Setup",
      tasks: ["Set blessing date and time", "Assign priest", "Coordinate location and materials"],
    },
    {
      title: "Preparation",
      tasks: ["Review final blessing details", "Confirm logistical support", "Prepare needed items"],
    },
    {
      title: "Service Delivery",
      tasks: ["Conduct blessing service", "Record service outcome", "Confirm requester acknowledgement"],
    },
    {
      title: "Wrap-up",
      tasks: ["Notify requester of schedule", "Record completion notes", "Close blessing request"],
    },
  ],
};

const getChecklistSteps = (sacramentalType) => CHECKLIST_TEMPLATES[sacramentalType] || CHECKLIST_TEMPLATES.Blessing;

const buildChecklistKey = (appointmentID, stepIndex, taskIndex) =>
  `${String(appointmentID || "unknown")}:${stepIndex}:${taskIndex}`;

const getProgressPercent = (state) => {
  if (state === "Completed") return 100;
  if (state === "Declined") return 100;
  if (state === "Scheduled") return 75;
  return 25;
};

const normalizeProgressState = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending" || normalized === "for review" || normalized === "for-review") return "Pending";
  if (normalized === "scheduled" || normalized === "confirmed" || normalized === "approved" || normalized === "ongoing") {
    return "Ongoing";
  }
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "declined") return "Declined";
  if (normalized === "completed") return "Completed";
  return "Pending";
};

const normalizeChecklistFromApi = (checklist, sacramentalType) => {
  const fallback = getChecklistSteps(sacramentalType);
  if (!Array.isArray(checklist) || checklist.length === 0) return fallback;
  const normalized = checklist
    .map((step, stepIndex) => {
      const title = String(step?.title || `Step ${stepIndex + 1}`).trim() || `Step ${stepIndex + 1}`;
      const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
      const normalizedTasks = tasks
        .map((task) => {
          if (typeof task === "string") return task.trim();
          return String(task?.label || "").trim();
        })
        .filter(Boolean);
      return {
        title,
        tasks: normalizedTasks.length > 0 ? normalizedTasks : ["New task"],
      };
    })
    .filter((step) => Boolean(step.title));
  return normalized.length > 0 ? normalized : fallback;
};

const extractCheckedMapFromApiChecklist = (checklist, appointmentID) => {
  if (!Array.isArray(checklist) || checklist.length === 0) return {};
  const checkedMap = {};
  checklist.forEach((step, stepIndex) => {
    const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
    tasks.forEach((task, taskIndex) => {
      const key = buildChecklistKey(appointmentID, stepIndex, taskIndex);
      checkedMap[key] = typeof task === "object" && task !== null ? Boolean(task.done) : false;
    });
  });
  return checkedMap;
};

const extractTaskScheduleMapFromApiChecklist = (checklist, appointmentID) => {
  if (!Array.isArray(checklist) || checklist.length === 0) return {};
  const taskScheduleMap = {};
  checklist.forEach((step, stepIndex) => {
    const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
    tasks.forEach((task, taskIndex) => {
      const key = buildChecklistKey(appointmentID, stepIndex, taskIndex);
      if (typeof task !== "object" || task === null) {
        taskScheduleMap[key] = "";
        return;
      }
      const parsed = new Date(task?.nextScheduleDateTime || "");
      taskScheduleMap[key] = Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
    });
  });
  return taskScheduleMap;
};

const extractTaskUncheckMapFromApiChecklist = (checklist, appointmentID) => {
  if (!Array.isArray(checklist) || checklist.length === 0) return {};
  const taskUncheckMap = {};
  checklist.forEach((step, stepIndex) => {
    const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
    tasks.forEach((task, taskIndex) => {
      const key = buildChecklistKey(appointmentID, stepIndex, taskIndex);
      if (typeof task !== "object" || task === null) {
        taskUncheckMap[key] = null;
        return;
      }
      const reason = String(task?.lastUncheckReason || "").trim();
      const uncheckedAt = String(task?.lastUncheckedAt || "").trim();
      taskUncheckMap[key] = reason
        ? {
            reason,
            uncheckedAt: uncheckedAt || null,
          }
        : null;
    });
  });
  return taskUncheckMap;
};

const buildSummaryFromChecklistAndFinalDetails = (checklist, finalDetails, finishedAt = null) => {
  const normalizedChecklist = Array.isArray(checklist) ? checklist : [];
  let totalTasks = 0;
  let completedTasks = 0;
  let currentStep = normalizedChecklist.length > 0 ? normalizedChecklist.length : 1;

  for (let stepIndex = 0; stepIndex < normalizedChecklist.length; stepIndex += 1) {
    const step = normalizedChecklist[stepIndex];
    const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
    const stepTotal = tasks.length;
    const stepCompleted = tasks.reduce((sum, task) => {
      if (typeof task === "string") return sum;
      return sum + (Boolean(task?.done) ? 1 : 0);
    }, 0);
    totalTasks += stepTotal;
    completedTasks += stepCompleted;
    if (stepTotal > 0 && stepCompleted < stepTotal) {
      currentStep = stepIndex + 1;
      break;
    }
  }

  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const hasSchedule = Boolean(finalDetails?.scheduledEventDateTime);
  const progressState = finishedAt
    ? "Completed"
    : progressPercent > 0 || hasSchedule
      ? "Ongoing"
      : "Pending";
  return {
    totalTasks,
    completedTasks,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    progressState,
    currentStep: Math.max(1, currentStep),
    hasSchedule,
    finalEventDone: Boolean(finalDetails?.eventDone),
    scheduledEventDateTime: finalDetails?.scheduledEventDateTime || null,
  };
};

const normalizeFinalDetailsFromApi = (rawFinalDetails) => {
  const source = rawFinalDetails && typeof rawFinalDetails === "object" ? rawFinalDetails : {};
  const parsedDate = new Date(source?.scheduledEventDateTime || "");
  const parsedEndDate = new Date(source?.scheduledEventEndDateTime || "");
  const offerings = Array.isArray(source?.giftOfferingsReceipts) ? source.giftOfferingsReceipts : [];
  const rawDonationOffering = Number(
    source?.donationOffering !== undefined && source?.donationOffering !== null
      ? source.donationOffering
      : offerings[0],
  );
  return {
    scheduledEventDateTime: Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString(),
    scheduledEventEndDateTime: Number.isNaN(parsedEndDate.getTime()) ? "" : parsedEndDate.toISOString(),
    programTimeSlots: Array.isArray(source?.programTimeSlots) ? source.programTimeSlots : [],
    eventDone: Boolean(source?.eventDone),
    conductedPriestID: (() => {
      const rawPriestID = Number(source?.conductedPriestID ?? source?.priestID);
      return Number.isInteger(rawPriestID) && rawPriestID > 0 ? rawPriestID : null;
    })(),
    priestName: String(source?.priestName || "").trim(),
    paymentFee: Number.isFinite(Number(source?.giftAmount)) ? Math.max(0, Number(source.giftAmount)) : 0,
    donationOffering: Number.isFinite(rawDonationOffering) ? Math.max(0, rawDonationOffering) : 0,
  };
};

function UserProgressDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { appointmentId } = useParams();

  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [dbChecklist, setDbChecklist] = useState(null);
  const [dbFinalDetails, setDbFinalDetails] = useState(() => normalizeFinalDetailsFromApi(null));
  const [dbProgressSummary, setDbProgressSummary] = useState(null);
  const [dbPaymentRecords, setDbPaymentRecords] = useState([]);
  const [dbPaymentStatus, setDbPaymentStatus] = useState("unpaid");
  const [dbChecklistError, setDbChecklistError] = useState("");
  const [progressSyncTick, setProgressSyncTick] = useState(0);
  const [fallbackProgressItem, setFallbackProgressItem] = useState(null);
  const [dbFinishedAt, setDbFinishedAt] = useState(null);
  const [scheduleRemarkPayload, setScheduleRemarkPayload] = useState(null);
  const [isScheduleDetailsOpen, setIsScheduleDetailsOpen] = useState(false);
  const [scheduleDetailsView, setScheduleDetailsView] = useState("overview");
  const [preferredPriestID, setPreferredPriestID] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [preferredMessage, setPreferredMessage] = useState("");
  const [priestCalendarMonth, setPriestCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [monthCalendar, setMonthCalendar] = useState(null);
  const [dayAvailability, setDayAvailability] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [isSubmittingRemark, setIsSubmittingRemark] = useState(false);
  const [isPreferredConfirmOpen, setIsPreferredConfirmOpen] = useState(false);
  const [remarkError, setRemarkError] = useState("");
  const [remarkNotice, setRemarkNotice] = useState("");
  const [cancellationInfo, setCancellationInfo] = useState(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isWithdrawingCancel, setIsWithdrawingCancel] = useState(false);
  const [isWithdrawConfirmOpen, setIsWithdrawConfirmOpen] = useState(false);
  const [cancellationSyncTick, setCancellationSyncTick] = useState(0);

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
  const selectedProgressItem = location.state?.progressItem || null;
  const effectiveProgressItem = selectedProgressItem || fallbackProgressItem;
  const safeAppointmentID = Number(appointmentId || effectiveProgressItem?.appointmentID);
  const sacramentalType = effectiveProgressItem?.sacramentalType || "Appointment";
  const checklistSteps = useMemo(
    () => normalizeChecklistFromApi(dbChecklist, sacramentalType),
    [dbChecklist, sacramentalType],
  );

  const effectiveChecks = useMemo(() => {
    if (dbChecklist && Number.isInteger(safeAppointmentID) && safeAppointmentID > 0) {
      return extractCheckedMapFromApiChecklist(dbChecklist, safeAppointmentID);
    }

    const fallbackChecks = {};
    const totalTasks = checklistSteps.reduce((sum, step) => sum + step.tasks.length, 0);
    const targetCompleted = Math.round((totalTasks * getProgressPercent(effectiveProgressItem?.progressState)) / 100);
    let remaining = targetCompleted;
    checklistSteps.forEach((step, stepIndex) => {
      step.tasks.forEach((_task, taskIndex) => {
        const key = buildChecklistKey(safeAppointmentID, stepIndex, taskIndex);
        fallbackChecks[key] = remaining > 0;
        if (remaining > 0) remaining -= 1;
      });
    });
    return fallbackChecks;
  }, [dbChecklist, checklistSteps, safeAppointmentID, effectiveProgressItem?.progressState]);

  const effectiveTaskSchedules = useMemo(() => {
    if (!dbChecklist || !Number.isInteger(safeAppointmentID) || safeAppointmentID <= 0) return {};
    return extractTaskScheduleMapFromApiChecklist(dbChecklist, safeAppointmentID);
  }, [dbChecklist, safeAppointmentID]);

  const effectiveTaskUncheckNotes = useMemo(() => {
    if (!dbChecklist || !Number.isInteger(safeAppointmentID) || safeAppointmentID <= 0) return {};
    return extractTaskUncheckMapFromApiChecklist(dbChecklist, safeAppointmentID);
  }, [dbChecklist, safeAppointmentID]);

  const completedTaskCount = checklistSteps.reduce((sum, step, stepIndex) => {
    return (
      sum +
      step.tasks.reduce((taskSum, _task, taskIndex) => {
        const checklistKey = buildChecklistKey(safeAppointmentID, stepIndex, taskIndex);
        return taskSum + (effectiveChecks[checklistKey] ? 1 : 0);
      }, 0)
    );
  }, 0);
  const totalTaskCount = checklistSteps.reduce((sum, step) => sum + step.tasks.length, 0);
  const activePaymentRecords = useMemo(
    () => dbPaymentRecords.filter((record) => !record?.isArchived),
    [dbPaymentRecords],
  );
  const totalRecordedPayment = useMemo(
    () =>
      activePaymentRecords.reduce((sum, record) => {
        const amount = Number(record?.amount);
        return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
      }, 0),
    [activePaymentRecords],
  );
  const recordedPaymentInvoices = useMemo(
    () =>
      activePaymentRecords
        .map((record) => String(record?.invoiceNumber || "").trim())
        .filter(Boolean),
    [activePaymentRecords],
  );
  const isPaymentMarkedPaid =
    String(dbPaymentStatus || "").trim().toLowerCase() === "paid" ||
    recordedPaymentInvoices.length > 0 ||
    totalRecordedPayment > 0 ||
    Number(dbFinalDetails?.paymentFee || 0) > 0;
  const tracksPaymentStatus =
    isSpecialProgramAppointment(effectiveProgressItem) ||
    (checklistSteps.length > 0 && checklistSteps.length <= 5);
  const displayPaymentStatusLabel = isSpecialProgramAppointment(effectiveProgressItem)
    ? "Free"
    : isPaymentMarkedPaid
      ? "Paid"
      : "Unpaid";
  const displayPaymentStatusClass = isSpecialProgramAppointment(effectiveProgressItem)
    ? "is-free"
    : isPaymentMarkedPaid
      ? "is-paid"
      : "is-unpaid";
  const firstIncompleteStepIndex = checklistSteps.findIndex((step, stepIndex) => {
    const stepTotal = step.tasks.length;
    const stepCompleted = step.tasks.reduce((sum, _task, taskIndex) => {
      const checklistKey = buildChecklistKey(safeAppointmentID, stepIndex, taskIndex);
      return sum + (effectiveChecks[checklistKey] ? 1 : 0);
    }, 0);
    return stepCompleted < stepTotal;
  });
  const defaultStepIndex = firstIncompleteStepIndex === -1 ? Math.max(checklistSteps.length - 1, 0) : firstIncompleteStepIndex;
  const safeActiveStepIndex = Math.min(Math.max(activeStepIndex, 0), Math.max(checklistSteps.length - 1, 0));
  const activeStep = checklistSteps[safeActiveStepIndex] || null;
  const effectiveSummary =
    dbProgressSummary && typeof dbProgressSummary === "object"
      ? dbProgressSummary
      : buildSummaryFromChecklistAndFinalDetails(dbChecklist, dbFinalDetails, dbFinishedAt);
  const displayProgressStatus = useMemo(() => {
    const declinedState = String(effectiveProgressItem?.progressState || "").trim().toLowerCase();
    if (declinedState === "declined") return "Declined";
    if (dbFinishedAt) return "Completed";

    const baseState = String(
      effectiveSummary?.progressState || effectiveProgressItem?.progressState || "Pending",
    ).trim();
    if (baseState === "Completed") return "Completed";

    const normalizedPaymentStatus = String(dbPaymentStatus || "").trim().toLowerCase();
    const recordedAmount = Math.max(
      totalRecordedPayment,
      Number(dbFinalDetails?.paymentFee || 0),
    );
    if (
      !isSpecialProgramAppointment(effectiveProgressItem) &&
      (normalizedPaymentStatus === "paid" || recordedAmount > 0)
    ) {
      return "Paid";
    }

    return baseState || "Pending";
  }, [
    dbFinalDetails?.paymentFee,
    dbPaymentStatus,
    effectiveProgressItem?.progressState,
    effectiveProgressItem?.requestType,
    effectiveProgressItem?.s_sacramentID,
    dbFinishedAt,
    effectiveSummary?.progressState,
    totalRecordedPayment,
  ]);

  const progressStatusMeta = getProgressStatusMeta(displayProgressStatus);
  const assignedPriestName = String(
    dbFinalDetails.priestName || effectiveProgressItem?.priestName || "",
  ).trim();
  const isSpecialProgram = isSpecialProgramAppointment(effectiveProgressItem);
  const showFinalStepDetails =
    isSpecialProgram ||
    Boolean(dbFinalDetails.scheduledEventDateTime) ||
    Boolean(assignedPriestName) ||
    Number(dbFinalDetails.conductedPriestID) > 0;

  useEffect(() => {
    if (selectedProgressItem) return;
    if (!Number.isInteger(safeAppointmentID) || safeAppointmentID <= 0) return;
    let isCancelled = false;

    const loadFallbackProgressItem = async () => {
      try {
        const [appointmentsResponse, sacramentsResponse, specialSacramentsResponse] = await Promise.all([
          fetch("/api/appointments"),
          fetch("/api/sacraments"),
          fetch("/api/special-sacraments"),
        ]);
        const appointmentsData = await appointmentsResponse.json().catch(() => []);
        const sacramentsData = await sacramentsResponse.json().catch(() => []);
        const specialSacramentsData = await specialSacramentsResponse.json().catch(() => []);
        if (!appointmentsResponse.ok || !sacramentsResponse.ok || !specialSacramentsResponse.ok) return;
        if (isCancelled) return;

        const sacramentNameMap = new Map(
          (Array.isArray(sacramentsData) ? sacramentsData : []).map((item) => [Number(item.sacramentID), String(item.sacramentName || "")]),
        );
        const specialSacramentNameMap = new Map(
          (Array.isArray(specialSacramentsData) ? specialSacramentsData : []).map((item) => [
            Number(item.s_sacramentID),
            String(item.s_sacramentName || ""),
          ]),
        );
        const matchingAppointment = (Array.isArray(appointmentsData) ? appointmentsData : []).find(
          (appointment) => Number(appointment?.appointmentID) === safeAppointmentID,
        );
        if (!matchingAppointment) return;

        const sacramentName = String(
          matchingAppointment?.resolvedSacramentName ||
            matchingAppointment?.sacramentName ||
            matchingAppointment?.specialSacramentName ||
            (matchingAppointment?.sacramentID
              ? sacramentNameMap.get(Number(matchingAppointment.sacramentID)) || ""
              : matchingAppointment?.s_sacramentID
                ? specialSacramentNameMap.get(Number(matchingAppointment.s_sacramentID)) || ""
                : ""),
        ).trim();

        setFallbackProgressItem({
          appointmentID: matchingAppointment.appointmentID,
          s_sacramentID: Number(matchingAppointment?.s_sacramentID) || null,
          requestType: String(matchingAppointment?.requestType || "").trim(),
          sacramentalType: sacramentName || "Appointment",
          createdAt: matchingAppointment.createdAt,
          progressState: normalizeProgressState(matchingAppointment.status),
          declineReason: String(matchingAppointment?.note || "").trim() || "",
          priestName: String(matchingAppointment?.priestName || "").trim(),
          priestID: Number(matchingAppointment?.priestID) || null,
        });
        if (String(matchingAppointment?.priestName || "").trim()) {
          setDbFinalDetails((current) => ({
            ...current,
            priestName: current.priestName || String(matchingAppointment.priestName || "").trim(),
            conductedPriestID:
              current.conductedPriestID ||
              (Number.isInteger(Number(matchingAppointment.priestID)) && Number(matchingAppointment.priestID) > 0
                ? Number(matchingAppointment.priestID)
                : null),
          }));
        }
      } catch {
        // Keep view-only page usable even when fallback details fail.
      }
    };

    loadFallbackProgressItem();
    return () => {
      isCancelled = true;
    };
  }, [selectedProgressItem, safeAppointmentID]);

  useEffect(() => {
    document.title = "Faithflow - Progress Details";
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType === "admin") {
      navigate("/admin/progress-tracker", { replace: true });
      return;
    }
  }, [navigate, user, accountType]);

  useEffect(() => {
    if (!user || accountType === "admin") return;
    const refreshProgress = () => setProgressSyncTick((value) => value + 1);
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      refreshProgress();
    }, 60000);
    const handleFocus = () => refreshProgress();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshProgress();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, accountType]);

  useEffect(() => {
    setActiveStepIndex(defaultStepIndex);
  }, [defaultStepIndex, safeAppointmentID]);

  const currentUserID = Number(user?.userID ?? user?.userId ?? user?.id ?? user?.accountID) || null;

  useEffect(() => {
    if (!currentUserID || !Number.isInteger(safeAppointmentID) || safeAppointmentID <= 0) return undefined;
    let isCancelled = false;
    const loadCancellationInfo = async () => {
      try {
        const response = await fetch(`/api/appointments/${safeAppointmentID}/change-request?userID=${currentUserID}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (isCancelled) return;
        setCancellationInfo(response.ok ? payload : null);
      } catch {
        if (!isCancelled) setCancellationInfo(null);
      }
    };
    loadCancellationInfo();
    return () => {
      isCancelled = true;
    };
  }, [currentUserID, safeAppointmentID, progressSyncTick, cancellationSyncTick]);

  const handleWithdrawCancellation = async () => {
    if (!currentUserID) return;
    setIsWithdrawingCancel(true);
    try {
      const response = await fetch(`/api/appointments/${safeAppointmentID}/change-request?userID=${currentUserID}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Unable to withdraw your request.");
      pushUiNotice(payload.message || "Your request was withdrawn.");
      setIsWithdrawConfirmOpen(false);
      setCancellationSyncTick((value) => value + 1);
    } catch (error) {
      pushUiNotice(error.message || "Unable to withdraw your request.", "error");
    } finally {
      setIsWithdrawingCancel(false);
    }
  };

  useEffect(() => {
    if (!Number.isInteger(safeAppointmentID) || safeAppointmentID <= 0) return;
    if (String(effectiveProgressItem?.progressState || "").trim().toLowerCase() === "declined") {
      setDbChecklistError("");
      setDbChecklist(null);
      setDbFinalDetails(normalizeFinalDetailsFromApi(null));
      setDbProgressSummary(null);
      return;
    }
    let isCancelled = false;
    const loadProgressChecklist = async () => {
      setDbChecklistError("");
      try {
        const response = await fetch(`/api/appointments/${safeAppointmentID}/progress`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Unable to load checklist.");
        if (isCancelled) return;
        setDbChecklist(Array.isArray(payload?.checklist) ? payload.checklist : null);
        setDbPaymentRecords(Array.isArray(payload?.paymentRecords) ? payload.paymentRecords : []);
        setDbPaymentStatus((() => {
          const normalized = String(payload?.paymentStatus || "unpaid").trim().toLowerCase();
          if (normalized === "paid" || normalized === "free") return normalized;
          return "unpaid";
        })());
        const normalizedFinalDetails = normalizeFinalDetailsFromApi(payload?.finalDetails);
        setDbFinalDetails((current) => ({
          ...normalizedFinalDetails,
          priestName: normalizedFinalDetails.priestName || current.priestName || "",
          conductedPriestID: normalizedFinalDetails.conductedPriestID || current.conductedPriestID,
        }));
        setDbFinishedAt(payload?.finishedAt || null);
        const apiSummary =
          payload?.summary && typeof payload.summary === "object"
            ? payload.summary
            : buildSummaryFromChecklistAndFinalDetails(payload?.checklist, normalizedFinalDetails, payload?.finishedAt);
        setDbProgressSummary(apiSummary);
      } catch (error) {
        if (isCancelled) return;
        setDbChecklist(null);
        setDbPaymentRecords([]);
        setDbPaymentStatus("unpaid");
        setDbFinalDetails(normalizeFinalDetailsFromApi(null));
        setDbProgressSummary(null);
        setDbFinishedAt(null);
        setDbChecklistError(error.message || "Unable to load checklist.");
      }
    };
    loadProgressChecklist();
    return () => {
      isCancelled = true;
    };
  }, [safeAppointmentID, effectiveProgressItem?.progressState, progressSyncTick]);

  useEffect(() => {
    if (!Number.isInteger(safeAppointmentID) || safeAppointmentID <= 0) return undefined;
    let isCancelled = false;
    const loadScheduleRemarks = async () => {
      try {
        const response = await fetch(`/api/appointments/${safeAppointmentID}/schedule-remarks`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Unable to load schedule remarks.");
        if (isCancelled) return;
        setScheduleRemarkPayload(payload);
        setPreferredPriestID((current) => {
          if (current) return current;
          const currentPriestID = Number(payload?.currentSchedule?.priestID || dbFinalDetails.conductedPriestID);
          return Number.isInteger(currentPriestID) && currentPriestID > 0 ? String(currentPriestID) : current;
        });
        setRemarkError("");
      } catch (error) {
        if (isCancelled) return;
        setScheduleRemarkPayload(null);
        setRemarkError(error.message || "Unable to load schedule remarks.");
      }
    };
    void loadScheduleRemarks();
    return () => {
      isCancelled = true;
    };
  }, [safeAppointmentID, progressSyncTick, dbFinalDetails.conductedPriestID]);

  useEffect(() => {
    const priestID = Number(preferredPriestID);
    if (!isScheduleDetailsOpen || scheduleDetailsView !== "preferred") return undefined;
    if (!Number.isInteger(safeAppointmentID) || safeAppointmentID <= 0) return undefined;
    if (!Number.isInteger(priestID) || priestID <= 0) {
      setMonthCalendar(null);
      return undefined;
    }
    let isCancelled = false;
    const loadMonthCalendar = async () => {
      try {
        const response = await fetch(
          `/api/appointments/${safeAppointmentID}/preferred-slots?priestID=${priestID}&month=${toMonthKey(priestCalendarMonth)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Unable to load priest calendar.");
        if (isCancelled) return;
        setMonthCalendar(payload);
      } catch {
        if (!isCancelled) setMonthCalendar(null);
      }
    };
    void loadMonthCalendar();
    return () => {
      isCancelled = true;
    };
  }, [isScheduleDetailsOpen, scheduleDetailsView, safeAppointmentID, preferredPriestID, priestCalendarMonth]);

  useEffect(() => {
    const priestID = Number(preferredPriestID);
    if (!isScheduleDetailsOpen || scheduleDetailsView !== "preferred") return undefined;
    if (!Number.isInteger(safeAppointmentID) || safeAppointmentID <= 0) return undefined;
    if (!Number.isInteger(priestID) || priestID <= 0 || !preferredDate) {
      setDayAvailability(null);
      return undefined;
    }
    let isCancelled = false;
    const loadSlots = async () => {
      setSlotsLoading(true);
      try {
        const response = await fetch(
          `/api/appointments/${safeAppointmentID}/preferred-slots?priestID=${priestID}&date=${encodeURIComponent(preferredDate)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Unable to load available time slots.");
        if (isCancelled) return;
        setDayAvailability(payload);
        if (preferredTime && !(payload?.slots || []).some((slot) => slot.startTime === preferredTime && slot.available)) {
          setPreferredTime("");
        }
      } catch {
        if (!isCancelled) setDayAvailability(null);
      } finally {
        if (!isCancelled) setSlotsLoading(false);
      }
    };
    void loadSlots();
    return () => {
      isCancelled = true;
    };
  }, [isScheduleDetailsOpen, scheduleDetailsView, safeAppointmentID, preferredPriestID, preferredDate, preferredTime]);

  useEffect(() => {
    setIsPreferredConfirmOpen(false);
  }, [preferredPriestID, preferredDate, preferredTime]);

  if (!user || accountType === "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const canRemarkOnSchedule = Boolean(scheduleRemarkPayload?.canRemark);
  const canRequestPreferred = Boolean(scheduleRemarkPayload?.canRequestPreferred);
  const pendingRemark = scheduleRemarkPayload?.pendingRemark || null;
  const latestRemark = scheduleRemarkPayload?.latestRemark || null;
  const preferredRequest = scheduleRemarkPayload?.preferredRequest || null;
  const preferredRequestState = !preferredRequest
    ? ""
    : preferredRequest.status === "pending"
      ? "pending"
      : preferredRequest.adminDecision === "updated"
        ? "approved"
        : "kept";
  const preferredRequestSummary = preferredRequest
    ? `${
        preferredRequest.preferredDate
          ? formatPreferredScheduleRange(preferredRequest.preferredDate, preferredRequest.preferredTime)
          : "another date and time"
      }${preferredRequest.preferredPriestName ? ` with ${preferredRequest.preferredPriestName}` : ""}`
    : "";
  const preferredRequestStatusText =
    preferredRequestState === "pending"
      ? `Your preferred schedule request (${preferredRequestSummary}) is waiting for the parish office's review. Only one request is allowed per appointment, so it can no longer be changed.`
      : preferredRequestState === "approved"
        ? `The parish office approved your preferred schedule (${preferredRequestSummary}). The schedule shown is now final.`
        : preferredRequestState === "kept"
          ? `The parish office kept the original schedule. You already used your one preferred schedule request (${preferredRequestSummary}).`
          : "";
  const remarkPriests = Array.isArray(scheduleRemarkPayload?.priests) ? scheduleRemarkPayload.priests : [];
  const preferredSlots = Array.isArray(dayAvailability?.slots) ? dayAvailability.slots : [];
  const preferredDayEntries = Array.isArray(dayAvailability?.existingSchedules)
    ? dayAvailability.existingSchedules
    : [];
  const priestCalendarMonthLabel = priestCalendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const priestCalendarFirstDayIndex = new Date(priestCalendarMonth.getFullYear(), priestCalendarMonth.getMonth(), 1).getDay();
  const priestCalendarDaysInMonth = new Date(priestCalendarMonth.getFullYear(), priestCalendarMonth.getMonth() + 1, 0).getDate();
  const scheduleDatePolicy = {
    minAdvanceDays: Number.isInteger(Number(monthCalendar?.minAdvanceDays))
      ? Number(monthCalendar.minAdvanceDays)
      : 5,
    todayKey: String(monthCalendar?.todayKey || toDateKey(new Date())),
    lockedThroughDateKey: String(monthCalendar?.lockedThroughDateKey || ""),
    minSelectableDateKey: String(monthCalendar?.minSelectableDateKey || ""),
  };
  const monthEntriesByDate = (Array.isArray(monthCalendar?.entries) ? monthCalendar.entries : []).reduce((grouped, entry) => {
    const dateKey = String(entry?.eventDate || "").slice(0, 10);
    if (!dateKey) return grouped;
    grouped[dateKey] = grouped[dateKey] || [];
    grouped[dateKey].push(entry);
    return grouped;
  }, {});
  const selectedPriestName =
    remarkPriests.find((priest) => String(priest.priestID) === String(preferredPriestID))?.fullName ||
    monthCalendar?.priestName ||
    assignedPriestName ||
    "Selected priest";

  const openScheduleDetails = (view = "overview") => {
    setRemarkError("");
    setRemarkNotice("");
    setScheduleDetailsView(view);
    setIsPreferredConfirmOpen(false);
    setIsScheduleDetailsOpen(true);
    if (view === "preferred" && !preferredPriestID && Number(dbFinalDetails.conductedPriestID) > 0) {
      setPreferredPriestID(String(dbFinalDetails.conductedPriestID));
    }
  };

  const closeScheduleDetails = () => {
    if (isSubmittingRemark) return;
    setIsScheduleDetailsOpen(false);
    setIsPreferredConfirmOpen(false);
    setScheduleDetailsView("overview");
  };

  const submitScheduleRemark = async (decision) => {
    const userID = Number(user?.userID);
    if (!Number.isInteger(safeAppointmentID) || safeAppointmentID <= 0) return;
    if (!Number.isInteger(userID) || userID <= 0) return;
    setIsSubmittingRemark(true);
    setRemarkError("");
    setRemarkNotice("");
    try {
      const body = {
        userID,
        decision,
        message:
          decision === "accepted"
            ? preferredMessage.trim() || "I'm okay with that scheduled."
            : preferredMessage.trim() || "Please consider my preferred date, time, and priest.",
      };
      if (decision === "preferred") {
        body.preferredPriestID = Number(preferredPriestID);
        body.preferredDate = preferredDate;
        body.preferredTime = preferredTime;
        if (!body.preferredPriestID || !body.preferredDate || !body.preferredTime) {
          throw new Error("Choose a priest, an open date, and an available time slot.");
        }
      }
      const response = await fetch(`/api/appointments/${safeAppointmentID}/schedule-remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Unable to send schedule remarks.");
      setScheduleRemarkPayload((current) => ({
        ...(current || {}),
        latestRemark: payload?.remark || null,
        pendingRemark: payload?.remark || null,
        remarks: Array.isArray(payload?.remarks) ? payload.remarks : current?.remarks || [],
        canRequestPreferred:
          typeof payload?.canRequestPreferred === "boolean" ? payload.canRequestPreferred : current?.canRequestPreferred,
        preferredRequestUsed: Boolean(payload?.preferredRequestUsed ?? current?.preferredRequestUsed),
        preferredRequest: payload?.preferredRequest ?? current?.preferredRequest ?? null,
      }));
      setIsPreferredConfirmOpen(false);
      setRemarkNotice(
        decision === "accepted"
          ? "The parish office has been notified that you are okay with this schedule."
          : "Your preferred date, time, and priest were sent to the parish office. You'll be notified once they review it.",
      );
      setPreferredMessage("");
      setScheduleDetailsView("overview");
      setIsScheduleDetailsOpen(false);
    } catch (error) {
      setRemarkError(error.message || "Unable to send schedule remarks.");
      setIsPreferredConfirmOpen(false);
    } finally {
      setIsSubmittingRemark(false);
    }
  };

  return (
    <main className="dashboard-layout">
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onSettings={() => navigate("/dashboard/settings")}
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="user" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero progress-details-header">
            <button
              type="button"
              className="progress-back-button progress-details-hero-action"
              onClick={() => navigate("/dashboard/status")}
            >
              Back
            </button>
            <h2>Progress Checklist</h2>
          </section>

          <section className="dashboard-panel progress-details-panel progress-details-panel--user-readonly">
            {!effectiveProgressItem ? (
              <p className="appointment-requests-empty">Request details not available. Open a request from Status page.</p>
            ) : (
              <>
                <header className="progress-main-header">
                  <h2>Progress Tracker</h2>
                  <p className="progress-main-header-service-row">
                    <strong>Service Type :</strong> {effectiveProgressItem.sacramentalType}
                    {tracksPaymentStatus ? (
                      <span
                        className={`progress-payment-status-badge ${displayPaymentStatusClass}`}
                        aria-label={`Payment status: ${displayPaymentStatusLabel}`}
                      >
                        {displayPaymentStatusLabel}
                      </span>
                    ) : null}
                  </p>
                </header>
                {String(effectiveProgressItem?.progressState || "").trim().toLowerCase() === "declined" ? (
                  <p className="progress-user-decline-reason">
                    <strong>Decline Reason:</strong>{" "}
                    {String(effectiveProgressItem?.declineReason || "").trim() || "No reason was provided by the parish office."}
                  </p>
                ) : null}
                <div className="progress-request-overview progress-request-overview--context" aria-label="Request overview">
                  <article className={`progress-request-overview-item is-status ${progressStatusMeta.className}`}>
                    <span className="progress-request-overview-icon" aria-hidden="true">
                      <ShieldCheck size={16} strokeWidth={2.2} />
                    </span>
                    <div className="progress-request-overview-copy">
                      <p className="progress-request-overview-label">Status</p>
                      <p className={`progress-status-pill ${progressStatusMeta.className}`}>{progressStatusMeta.label}</p>
                    </div>
                  </article>
                  {tracksPaymentStatus ? (
                    <article className={`progress-request-overview-item is-payment ${displayPaymentStatusClass}`}>
                      <span className="progress-request-overview-icon" aria-hidden="true">
                        <Receipt size={16} strokeWidth={2.2} />
                      </span>
                      <div className="progress-request-overview-copy">
                        <p className="progress-request-overview-label">Payment Status</p>
                        <p className={`progress-status-pill ${displayPaymentStatusClass}`}>{displayPaymentStatusLabel}</p>
                      </div>
                    </article>
                  ) : null}
                  <article className="progress-request-overview-item">
                    <span className="progress-request-overview-icon" aria-hidden="true">
                      <CalendarDays size={16} strokeWidth={2.2} />
                    </span>
                    <div className="progress-request-overview-copy">
                      <p className="progress-request-overview-label">Requested Date</p>
                      <p className="progress-request-overview-value">{formatDateTime(effectiveProgressItem?.createdAt)}</p>
                    </div>
                  </article>
                  {isSpecialProgram || dbFinalDetails.scheduledEventDateTime ? (
                    <article className="progress-request-overview-item">
                      <span className="progress-request-overview-icon" aria-hidden="true">
                        <CalendarClock size={16} strokeWidth={2.2} />
                      </span>
                      <div className="progress-request-overview-copy">
                        <p className="progress-request-overview-label">Event Schedule</p>
                        <p className="progress-request-overview-value">
                          {dbFinalDetails.scheduledEventDateTime
                            ? formatFinalDetailsSchedule(dbFinalDetails)
                            : "Not scheduled yet"}
                        </p>
                      </div>
                    </article>
                  ) : null}
                  <article className="progress-request-overview-item is-metric">
                    <span className="progress-request-overview-icon" aria-hidden="true">
                      <CircleCheckBig size={16} strokeWidth={2.2} />
                    </span>
                    <div className="progress-request-overview-copy">
                      <p className="progress-request-overview-label">Completed Tasks</p>
                      <p className="progress-request-overview-value">
                        {completedTaskCount} / {totalTaskCount}
                      </p>
                    </div>
                  </article>
                </div>
                {dbChecklistError ? <p className="appointment-requests-empty">{dbChecklistError}</p> : null}

                <section className="progress-stepper-wrap" aria-label="Progress steps">
                  <ol className="progress-stepper-row">
                    {checklistSteps.map((step, stepIndex) => {
                      const stepTotal = step.tasks.length;
                      const stepCompleted = step.tasks.reduce((sum, _task, taskIndex) => {
                        const checklistKey = buildChecklistKey(safeAppointmentID, stepIndex, taskIndex);
                        return sum + (effectiveChecks[checklistKey] ? 1 : 0);
                      }, 0);
                      const isDone = stepTotal > 0 && stepCompleted === stepTotal;
                      const isOngoing = !isDone && (stepCompleted > 0 || stepIndex === defaultStepIndex);
                      const stepStatusClass = isDone ? "is-done" : isOngoing ? "is-ongoing" : "is-not-started";
                      return (
                        <li key={`${step.title}-${stepIndex}`} className={`progress-stepper-item ${stepStatusClass}`}>
                          <button
                            type="button"
                            className={`progress-stepper-button ${safeActiveStepIndex === stepIndex ? "is-active" : ""}`}
                            onClick={() => setActiveStepIndex(stepIndex)}
                            aria-current={safeActiveStepIndex === stepIndex ? "step" : undefined}
                          >
                            {stepIndex + 1}
                          </button>
                          {stepIndex < checklistSteps.length - 1 ? <span className="progress-stepper-line" aria-hidden="true" /> : null}
                        </li>
                      );
                    })}
                  </ol>
                </section>

                {activeStep ? (
                  <article className="progress-step-card">
                    <header className="progress-step-header">
                      <div className="progress-step-heading">
                        <h3>
                          Step {safeActiveStepIndex + 1}: {String(activeStep.title || "").toUpperCase()}
                        </h3>
                        <p className="progress-step-readonly-note">Parish office updates only — you cannot change these items.</p>
                      </div>
                    </header>
                    <ul className="progress-task-list progress-task-list--readonly" aria-label="Checklist items, view only">
                      {activeStep.tasks.map((task, taskIndex) => {
                        const checklistKey = buildChecklistKey(safeAppointmentID, safeActiveStepIndex, taskIndex);
                        const isChecked = Boolean(effectiveChecks[checklistKey]);
                        const taskScheduleDateTime = effectiveTaskSchedules[checklistKey] || "";
                        const taskUncheckNote = effectiveTaskUncheckNotes[checklistKey];
                        return (
                          <li key={`${checklistKey}-${task}`}>
                            <div
                              className={`progress-task-readonly-item ${isChecked ? "is-complete" : "is-pending"}`}
                              aria-label={`${task}. ${isChecked ? "Completed by parish office." : "Not yet completed."}`}
                            >
                              <span className="progress-task-readonly-status" aria-hidden="true">
                                {isChecked ? <CircleCheck size={20} strokeWidth={2.2} /> : <Circle size={18} strokeWidth={1.8} />}
                              </span>
                              <span className="progress-task-text progress-task-text--stacked">
                                <span>{task}</span>
                                {taskScheduleDateTime ? (
                                  <small className="progress-task-schedule-readonly">
                                    <strong>{formatDateTime(taskScheduleDateTime)}</strong>
                                  </small>
                                ) : null}
                                {!isChecked && taskUncheckNote?.reason ? (
                                  <small className="progress-task-uncheck-note">
                                    <strong>Reason for update:</strong> {taskUncheckNote.reason}
                                  </small>
                                ) : null}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                ) : null}

                {showFinalStepDetails ? (
                  <section className="progress-final-step-card" id="appointment-schedule-remarks">
                    <header className="progress-final-step-header">
                      <div className="progress-final-step-heading">
                        <p className="progress-final-step-kicker">Event Schedule</p>
                        <h3>Scheduled Appointment</h3>
                      </div>
                      {dbFinalDetails.scheduledEventDateTime ? (
                        <button
                          type="button"
                          className="progress-secondary-button progress-final-step-inline-button"
                          onClick={() => openScheduleDetails("overview")}
                        >
                          View Full Schedule Details
                        </button>
                      ) : null}
                    </header>
                    <div className="progress-final-step-facts">
                      <article className="progress-final-step-fact">
                        <span className="progress-final-step-fact-icon" aria-hidden="true">
                          <CalendarClock size={16} strokeWidth={2.2} />
                        </span>
                        <div className="progress-final-step-fact-copy">
                          <p className="progress-final-step-fact-label">Event Schedule</p>
                          <p className="progress-final-step-fact-value">
                            {dbFinalDetails.scheduledEventDateTime
                              ? formatFinalDetailsSchedule(dbFinalDetails)
                              : "Not scheduled yet"}
                          </p>
                        </div>
                      </article>
                      <article className="progress-final-step-fact">
                        <span className="progress-final-step-fact-icon" aria-hidden="true">
                          <User size={16} strokeWidth={2.2} />
                        </span>
                        <div className="progress-final-step-fact-copy">
                          <p className="progress-final-step-fact-label">Assigned Priest</p>
                          <p className="progress-final-step-fact-value">
                            {assignedPriestName || "Not assigned yet"}
                          </p>
                        </div>
                      </article>
                    </div>
                    {preferredRequestStatusText ? (
                      <p className={`progress-final-step-note progress-preferred-request-note is-${preferredRequestState}`}>
                        {preferredRequestStatusText}
                      </p>
                    ) : pendingRemark?.decision === "accepted" ? (
                      <p className="progress-final-step-note">
                        You confirmed this schedule. Waiting for the parish office to review.
                      </p>
                    ) : latestRemark?.decision === "accepted" ? (
                      <p className="progress-final-step-note">You already confirmed this schedule.</p>
                    ) : dbFinalDetails.scheduledEventDateTime ? (
                      <p className="progress-final-step-note">
                        {canRequestPreferred
                          ? "Open full schedule details to review this assignment. You can request a different priest, date, and time once."
                          : "Open full schedule details to review this assignment."}
                      </p>
                    ) : null}
                    {remarkNotice ? <p className="progress-final-step-note">{remarkNotice}</p> : null}
                    {remarkError && !isScheduleDetailsOpen ? <p className="appointment-requests-empty">{remarkError}</p> : null}
                  </section>
                ) : null}

                {cancellationInfo?.pendingChangeRequest?.requestType === "cancel" ? (
                  <section className="progress-cancel-card is-pending" aria-label="Cancellation request">
                    <div className="progress-cancel-card-copy">
                      <h3>Cancellation Requested</h3>
                      <p>
                        You asked to cancel this appointment. It stays active until the parish office approves or
                        declines your request.
                      </p>
                      {cancellationInfo.pendingChangeRequest.reason ? (
                        <p className="progress-cancel-card-reason">
                          <strong>Your reason:</strong> {cancellationInfo.pendingChangeRequest.reason}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="change-request-button is-secondary"
                      onClick={() => setIsWithdrawConfirmOpen(true)}
                      disabled={isWithdrawingCancel}
                    >
                      Withdraw Request
                    </button>
                  </section>
                ) : cancellationInfo?.canCancel ? (
                  <div className="progress-page-actions progress-cancel-appointment-row is-user">
                    <button
                      type="button"
                      className="progress-cancel-appointment-button"
                      onClick={() => setIsCancelModalOpen(true)}
                    >
                      <span className="progress-cancel-appointment-icon" aria-hidden="true">
                        <CalendarX2 size={16} strokeWidth={2.2} />
                      </span>
                      Cancel Appointment
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </section>
      </div>
      {isWithdrawConfirmOpen ? (
        <ConfirmActionDialog
          message="Withdraw your cancellation request? Your appointment will stay active and the parish office will no longer review the request."
          confirmLabel="Yes, Withdraw"
          isBusy={isWithdrawingCancel}
          onConfirm={() => void handleWithdrawCancellation()}
          onClose={() => setIsWithdrawConfirmOpen(false)}
        />
      ) : null}
      {isCancelModalOpen && effectiveProgressItem ? (
        <CancelAppointmentModal
          appointment={{ ...effectiveProgressItem, appointmentID: safeAppointmentID }}
          userID={currentUserID}
          onClose={() => setIsCancelModalOpen(false)}
          onDone={() => {
            setIsCancelModalOpen(false);
            setCancellationSyncTick((value) => value + 1);
          }}
        />
      ) : null}
      {isScheduleDetailsOpen ? (
        <div
          className="progress-delete-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!isSubmittingRemark) closeScheduleDetails();
          }}
        >
          <section
            className={`progress-schedule-details-modal${scheduleDetailsView === "preferred" ? " is-preferred" : " is-overview"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="progress-schedule-details-modal-header">
              <div>
                <h3 id="schedule-details-title">
                  {scheduleDetailsView === "preferred" ? "Request Preferred Schedule" : "Schedule Confirmation"}
                </h3>
              </div>
              <button
                type="button"
                className="progress-schedule-details-close"
                onClick={closeScheduleDetails}
                disabled={isSubmittingRemark}
                aria-label="Close schedule details"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </header>
            <div className="progress-schedule-details-modal-body">
              {scheduleDetailsView === "overview" ? (
                <>
                  <p className="progress-schedule-details-lead">
                    Please review the date, time, and priest assigned by the parish office. If this assignment does not
                    work, you may request another open schedule.
                  </p>
                  <dl className="progress-schedule-details-summary">
                    <div>
                      <dt>Date</dt>
                      <dd>{formatScheduleDate(dbFinalDetails.scheduledEventDateTime)}</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>{formatFinalDetailsTime(dbFinalDetails)}</dd>
                    </div>
                    <div>
                      <dt>Officiating Priest</dt>
                      <dd>{assignedPriestName || "Not assigned yet"}</dd>
                    </div>
                  </dl>
                  {preferredRequestStatusText ? (
                    <p className={`progress-schedule-details-status progress-preferred-request-note is-${preferredRequestState}`}>
                      {preferredRequestStatusText}
                    </p>
                  ) : pendingRemark?.decision === "accepted" ? (
                    <p className="progress-schedule-details-status">
                      Your confirmation has been sent and is awaiting parish office review.
                    </p>
                  ) : null}
                  {preferredRequest ? null : canRequestPreferred ? (
                    <div className="progress-schedule-details-actions">
                      <button
                        type="button"
                        className="progress-schedule-details-secondary"
                        disabled={isSubmittingRemark}
                        onClick={() => openScheduleDetails("preferred")}
                      >
                        Request a preferred date, time, and priest
                      </button>
                      <small className="progress-preferred-once-hint">You can send this request only once.</small>
                    </div>
                  ) : canRemarkOnSchedule ? (
                    <p className="progress-schedule-details-status">
                      This special sacrament follows the program schedule. The date and priest remain with the parish office.
                    </p>
                  ) : (
                    <p className="progress-schedule-details-status">
                      This appointment remains on Status until after {formatDateTime(dbFinalDetails.scheduledEventDateTime)}.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="progress-preferred-once-banner" role="note">
                    <strong>One-time request.</strong> You can request a different schedule only once for this
                    appointment. After you send it, it can&apos;t be changed, and the parish office will approve it or
                    keep the current schedule.
                  </p>
                  <p className="progress-schedule-details-lead">
                    Select a priest, then choose a date from that priest&apos;s calendar and one available 1-hour slot
                    (4:00 AM to 5:00 PM). Locked dates follow the parish 5-day interval.
                  </p>
                  <label className="progress-final-step-field progress-final-step-field--modal progress-schedule-priest-field">
                    <span>Officiating Priest</span>
                    <select
                      value={preferredPriestID}
                      disabled={isSubmittingRemark}
                      onChange={(event) => {
                        setPreferredPriestID(event.target.value);
                        setPreferredDate("");
                        setPreferredTime("");
                        setDayAvailability(null);
                        setRemarkError("");
                      }}
                    >
                      <option value="">Select priest</option>
                      {remarkPriests.map((priest) => (
                        <option key={`preferred-priest-${priest.priestID}`} value={priest.priestID}>
                          {priest.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="progress-schedule-split-layout">
                    <div className="progress-schedule-split-panel">
                      <h4>Priest Calendar</h4>
                      <p className="progress-schedule-split-priest">
                        {preferredPriestID ? selectedPriestName : "Select a priest to load the calendar"}
                      </p>
                      {preferredPriestID ? (
                        <>
                          <p className="progress-priest-calendar-policy-note">
                            {scheduleDatePolicy.minAdvanceDays > 0 ? (
                              <>
                                Today through the next {scheduleDatePolicy.minAdvanceDays} days are locked
                                {scheduleDatePolicy.lockedThroughDateKey
                                  ? ` (${formatLongDate(scheduleDatePolicy.todayKey)} - ${formatLongDate(scheduleDatePolicy.lockedThroughDateKey)})`
                                  : ""}
                                .
                                {scheduleDatePolicy.minSelectableDateKey ? (
                                  <>
                                    {" "}
                                    Earliest selectable date:{" "}
                                    <strong>{formatLongDate(scheduleDatePolicy.minSelectableDateKey)}</strong>.
                                  </>
                                ) : null}
                              </>
                            ) : (
                              <>Funeral Mass uses a 1-day interval. Days off stay unavailable. Past times cannot be booked.</>
                            )}
                          </p>
                          <div className="progress-priest-calendar-month">
                            <button
                              type="button"
                              className="progress-calendar-month-nav"
                              onClick={() =>
                                setPriestCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                              }
                            >
                              <ChevronLeft size={14} aria-hidden="true" />
                            </button>
                            <strong>{priestCalendarMonthLabel}</strong>
                            <button
                              type="button"
                              className="progress-calendar-month-nav"
                              onClick={() =>
                                setPriestCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                              }
                            >
                              <ChevronRight size={14} aria-hidden="true" />
                            </button>
                          </div>
                          <div className="progress-priest-calendar-grid">
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                              <span key={`user-cal-head-${dayName}`} className="progress-priest-calendar-day-name">
                                {dayName}
                              </span>
                            ))}
                            {Array.from({ length: priestCalendarFirstDayIndex }).map((_, index) => (
                              <span key={`user-cal-empty-${index}`} className="progress-priest-calendar-date-cell is-empty" />
                            ))}
                            {Array.from({ length: priestCalendarDaysInMonth }).map((_, index) => {
                              const dayNumber = index + 1;
                              const dateKey = `${priestCalendarMonth.getFullYear()}-${String(priestCalendarMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
                              const entryCount = (monthEntriesByDate[dateKey] || []).length;
                              const dateDayOfWeek = new Date(
                                priestCalendarMonth.getFullYear(),
                                priestCalendarMonth.getMonth(),
                                dayNumber,
                              ).getDay();
                              const isDayOff =
                                (Array.isArray(monthCalendar?.dayOffDates) && monthCalendar.dayOffDates.includes(dateKey)) ||
                                (Number.isInteger(Number(monthCalendar?.recurringWeekday)) &&
                                  Number(monthCalendar.recurringWeekday) === dateDayOfWeek);
                              const isLockedDate = isScheduleDateLocked(dateKey, scheduleDatePolicy.minSelectableDateKey);
                              const isHalfDay =
                                !isDayOff &&
                                !isLockedDate &&
                                Number.isInteger(Number(monthCalendar?.halfDay?.weekday)) &&
                                Number(monthCalendar.halfDay.weekday) === dateDayOfWeek;
                              return (
                                <button
                                  key={`user-cal-date-${dateKey}`}
                                  type="button"
                                  className={`progress-priest-calendar-date-cell ${isLockedDate ? "is-locked" : isDayOff ? "is-day-off" : entryCount > 0 ? "is-busy" : "is-free"}${isHalfDay ? " is-half-day" : ""} ${
                                    !isLockedDate && preferredDate === dateKey ? "is-selected" : ""
                                  } ${!isLockedDate && scheduleDatePolicy.todayKey === dateKey ? "is-today" : ""}`}
                                  onClick={() => {
                                    if (isDayOff || isLockedDate) return;
                                    setPreferredDate(dateKey);
                                    setPreferredTime("");
                                    setRemarkError("");
                                  }}
                                  disabled={isDayOff || isLockedDate}
                                  aria-label={
                                    isLockedDate
                                      ? `${dayNumber}, locked`
                                      : isDayOff
                                        ? `${dayNumber}, day off`
                                        : `${dayNumber}, ${entryCount > 0 ? "with schedule" : "free"}`
                                  }
                                >
                                  <span>{dayNumber}</span>
                                  {isLockedDate ? (
                                    <small>Locked</small>
                                  ) : isDayOff ? (
                                    <small>Off</small>
                                  ) : isHalfDay ? (
                                    <small>Half</small>
                                  ) : entryCount > 0 ? (
                                    <small>{entryCount}</small>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                          <div className="progress-priest-calendar-modal-legend">
                            <span><i className="is-free" /> Free day</span>
                            <span><i className="is-busy" /> With schedule</span>
                            <span><i className="is-day-off" /> Day off</span>
                            {monthCalendar?.halfDay ? <span><i className="is-half-day" /> Half day</span> : null}
                            <span><i className="is-locked" /> Locked</span>
                          </div>
                        </>
                      ) : (
                        <p className="progress-schedule-slot-empty">Select a priest above to view available dates.</p>
                      )}
                    </div>
                    <div className="progress-schedule-split-panel">
                      <h4>Available Time Slots</h4>
                      <p className="progress-picked-date-label">
                        Selected date: <strong>{preferredDate ? formatLongDate(preferredDate) : "Not set"}</strong>
                      </p>
                      {!preferredPriestID ? (
                        <p className="progress-schedule-slot-empty">Select a priest first, then click a date to load available time slots.</p>
                      ) : !preferredDate ? (
                        <p className="progress-schedule-slot-empty">Click a date on the priest calendar to load available time slots.</p>
                      ) : slotsLoading ? (
                        <p className="progress-schedule-slot-empty">Checking this priest&apos;s availability...</p>
                      ) : dayAvailability?.isDayOff ? (
                        <p className="progress-schedule-slot-empty">This date is marked as day off.</p>
                      ) : dayAvailability?.isLocked ? (
                        <p className="progress-schedule-slot-empty">
                          {dayAvailability?.lockedMessage || "This date is locked. Choose a later date."}
                        </p>
                      ) : (
                        <>
                          <div className="progress-schedule-slot-grid" role="listbox" aria-label="Available time slots">
                            {preferredSlots.map((slot) => {
                              const isSelected = slot.available && preferredTime === slot.startTime;
                              return (
                                <button
                                  key={`${slot.startTime}-${slot.endTime}`}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  disabled={!slot.available}
                                  title={slot.available ? slot.label : slot.conflictTitle || "Unavailable"}
                                  className={`progress-schedule-slot-button${isSelected ? " is-selected" : ""}${
                                    slot.available ? "" : " is-unavailable"
                                  }`}
                                  onClick={() => {
                                    if (!slot.available) return;
                                    setPreferredTime(slot.startTime);
                                    setRemarkError("");
                                  }}
                                >
                                  <span>{slot.label || `${to12HourTime(slot.startTime)} - ${to12HourTime(slot.endTime)}`}</span>
                                  {!slot.available && slot.conflictTitle ? <small>{slot.conflictTitle}</small> : null}
                                </button>
                              );
                            })}
                          </div>
                          {preferredSlots.every((slot) => !slot.available) ? (
                            <p className="progress-schedule-slot-empty">No available 1-hour slots for this priest on the selected date.</p>
                          ) : null}
                        </>
                      )}
                      {preferredDate ? (
                        <div className="progress-priest-day-schedules">
                          <h4>Existing priest schedules on {formatLongDate(preferredDate)}</h4>
                          {preferredDayEntries.length > 0 ? (
                            <ul>
                              {preferredDayEntries.map((entry) => (
                                <li key={`user-day-schedule-${entry.id || `${entry.startTime}-${entry.title}`}`}>
                                  <strong>{entry.title || "Priest Schedule"}</strong>
                                  <span>
                                    {to12HourTime(entry.startTime)} - {to12HourTime(entry.endTime)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>No other priest schedule entries for this day.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <label className="progress-final-step-field">
                    <span>Note to the parish office</span>
                    <textarea
                      rows={3}
                      value={preferredMessage}
                      onChange={(event) => setPreferredMessage(event.target.value)}
                      placeholder="Add a short note for the parish office."
                    />
                  </label>
                </>
              )}
              {remarkError ? <p className="progress-schedule-details-error">{remarkError}</p> : null}
            </div>
            {scheduleDetailsView === "preferred" && isPreferredConfirmOpen ? (
              <footer className="progress-schedule-details-modal-footer progress-preferred-confirm">
                <div className="progress-preferred-confirm-copy">
                  <strong>Send this request?</strong>
                  <span>
                    {preferredDate && preferredTime
                      ? `${formatPreferredScheduleRange(preferredDate, preferredTime)} with ${selectedPriestName}.`
                      : ""}{" "}
                    This is your only preferred schedule request and can&apos;t be changed after sending.
                  </span>
                </div>
                <div className="progress-preferred-confirm-actions">
                  <button
                    type="button"
                    className="progress-schedule-details-ghost"
                    disabled={isSubmittingRemark}
                    onClick={() => setIsPreferredConfirmOpen(false)}
                  >
                    Review again
                  </button>
                  <button
                    type="button"
                    className="progress-schedule-details-primary"
                    disabled={isSubmittingRemark}
                    onClick={() => void submitScheduleRemark("preferred")}
                  >
                    {isSubmittingRemark ? "Sending request..." : "Yes, send request"}
                  </button>
                </div>
              </footer>
            ) : scheduleDetailsView === "preferred" ? (
              <footer className="progress-schedule-details-modal-footer">
                <button
                  type="button"
                  className="progress-schedule-details-ghost"
                  disabled={isSubmittingRemark}
                  onClick={() => setScheduleDetailsView("overview")}
                >
                  Back to confirmation
                </button>
                <button
                  type="button"
                  className="progress-schedule-details-primary"
                  disabled={isSubmittingRemark || slotsLoading || !preferredPriestID || !preferredDate || !preferredTime}
                  onClick={() => {
                    setRemarkError("");
                    setIsPreferredConfirmOpen(true);
                  }}
                >
                  Submit preferred schedule
                </button>
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default UserProgressDetails;
