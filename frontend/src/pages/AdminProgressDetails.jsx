import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  MessageSquare,
  Eye,
  Receipt,
  Upload,
  User,
  X,
} from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { pushUiNotice } from "../utils/uiNotice";
import { fetchPendingAppointmentChangeRequests } from "../components/AdminAppointmentChangeRequests";
import { isSpecialProgramAppointment, normalizeSpecialProgramSacramentalType } from "../utils/specialProgramProgress";
import {
  formatOccupiedSlotsLabel,
  getManilaDateKey,
  isFuneralMassSacrament,
  isScheduleSlotInThePast,
  resolveFuneralMassAdvanceDays,
} from "../utils/parishSchedule";
import AppointmentDetailsModal, { getAppointmentDisplayName } from "../components/AppointmentDetailsModal";
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

const resolveEventEndDate = (startDate, endValue) => {
  const endDate = endValue ? new Date(endValue) : null;
  if (endDate && !Number.isNaN(endDate.getTime()) && endDate > startDate) return endDate;
  return new Date(startDate.getTime() + 60 * 60 * 1000);
};

const formatEventScheduleRange = (dateValue, endValue = null, timeSlots = []) => {
  if (!dateValue) return "Not scheduled yet";
  const startDate = new Date(dateValue);
  if (Number.isNaN(startDate.getTime())) return "Not scheduled yet";
  const endDate = resolveEventEndDate(startDate, endValue);
  const dateLabel = startDate.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const slotsLabel = Array.isArray(timeSlots) && timeSlots.length ? formatOccupiedSlotsLabel(timeSlots) : "";
  if (slotsLabel) return `${dateLabel}, ${slotsLabel}`;
  const startLabel = formatManilaTime(startDate);
  const endLabel = formatManilaTime(endDate);
  if (!startLabel || !endLabel) return "Not scheduled yet";
  return `${dateLabel}, ${startLabel} to ${endLabel}`;
};

const getTodayPaymentDateKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const formatPaymentDateLabel = (dateKey) => {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const resolveProgressPaymentReceiptUrl = (fileUrl) => {
  const normalized = String(fileUrl || "").trim();
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("/uploads/")) return `/api${normalized}`;
  return normalized;
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

const PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS = 5;

const toDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const addDaysToDateKey = (days, fromDate = new Date()) => {
  const next = fromDate instanceof Date ? new Date(fromDate) : new Date();
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + Number(days));
  return toDateKey(next);
};

const normalizeScheduleMinAdvanceDays = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
    return PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS;
  }
  return parsed;
};

const getLockedThroughDateKey = (advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
  const days = normalizeScheduleMinAdvanceDays(advanceDays);
  if (days <= 0) return "";
  return addDaysToDateKey(days, new Date(`${getManilaDateKey()}T00:00:00`));
};

const getMinimumScheduleDateKey = (advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
  const days = normalizeScheduleMinAdvanceDays(advanceDays);
  const todayKey = getManilaDateKey();
  if (days <= 0) return todayKey;
  return addDaysToDateKey(days + 1, new Date(`${todayKey}T00:00:00`));
};

const isScheduleDateLocked = (dateKey, minDateKey = getMinimumScheduleDateKey()) =>
  String(dateKey || "").trim() < String(minDateKey || "").trim();

const getScheduleDatePolicy = (advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
  const minAdvanceDays = normalizeScheduleMinAdvanceDays(advanceDays);
  const todayKey = getManilaDateKey();
  const minSelectableDateKey = getMinimumScheduleDateKey(minAdvanceDays);
  const lockedThroughDateKey = getLockedThroughDateKey(minAdvanceDays);
  return {
    minAdvanceDays,
    todayKey,
    lockedThroughDateKey,
    lockedThroughDateLabel: lockedThroughDateKey ? formatLongDate(lockedThroughDateKey) : "",
    minSelectableDateKey,
    minSelectableDateLabel: formatLongDate(minSelectableDateKey),
  };
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

const addOneHourToTime = (timeValue) => {
  const [hoursRaw, minutesRaw] = String(timeValue || "").split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "";
  const next = new Date(2000, 0, 1, hours, minutes, 0, 0);
  next.setHours(next.getHours() + 1);
  return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
};

const SCHEDULE_SLOT_DURATION_MINUTES = 60;

const PARISH_APPOINTMENT_TIME_SLOTS = [
  { startTime: "04:00", endTime: "05:00" },
  { startTime: "05:00", endTime: "06:00" },
  { startTime: "06:00", endTime: "07:00" },
  { startTime: "07:00", endTime: "08:00" },
  { startTime: "08:00", endTime: "09:00" },
  { startTime: "09:00", endTime: "10:00" },
  { startTime: "10:00", endTime: "11:00" },
  { startTime: "11:00", endTime: "12:00" },
  { startTime: "13:00", endTime: "14:00" },
  { startTime: "14:00", endTime: "15:00" },
  { startTime: "15:00", endTime: "16:00" },
  { startTime: "16:00", endTime: "17:00" },
];

const normalizeTimeToHHMM = (timeValue) => {
  const match = String(timeValue || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "";
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const formatPreferredScheduleRange = (dateValue, timeValue) => {
  const dateKey = String(dateValue || "").trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
  if (!dateKey) return "Not specified";
  const startTime = normalizeTimeToHHMM(timeValue);
  const matchedSlot = PARISH_APPOINTMENT_TIME_SLOTS.find((slot) => slot.startTime === startTime);
  const endTime = matchedSlot?.endTime || addOneHourToTime(startTime);
  const dateLabel = formatLongDate(dateKey);
  if (!startTime) return dateLabel;
  const startLabel = to12HourTime(startTime);
  const endLabel = endTime ? to12HourTime(endTime) : "";
  if (startLabel !== "Time not set" && endLabel && endLabel !== "Time not set") {
    return `${dateLabel}, ${startLabel} to ${endLabel}`;
  }
  if (startLabel !== "Time not set") return `${dateLabel}, ${startLabel}`;
  return dateLabel;
};

const timeStringToMinutes = (timeValue) => {
  const normalized = normalizeTimeToHHMM(timeValue);
  if (!normalized) return null;
  const [hoursRaw, minutesRaw] = normalized.split(":");
  return Number(hoursRaw) * 60 + Number(minutesRaw);
};

const minutesToTimeString = (minutes) => {
  const normalized = Number(minutes);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized >= 24 * 60) return "";
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const doScheduleRangesOverlap = (startA, endA, startB, endB) => startA < endB && startB < endA;

const buildParishAppointmentScheduleSlots = () =>
  PARISH_APPOINTMENT_TIME_SLOTS.map((slot) => {
    const startMinutes = timeStringToMinutes(slot.startTime);
    const endMinutes = timeStringToMinutes(slot.endTime);
    return {
      startTime: slot.startTime,
      endTime: slot.endTime,
      startMinutes,
      endMinutes,
      label: `${to12HourTime(slot.startTime)} - ${to12HourTime(slot.endTime)}`,
    };
  }).filter((slot) => slot.startMinutes !== null && slot.endMinutes !== null);

const toEventDateKey = (value) => String(value || "").trim().slice(0, 10);

const isPriestAssignedCalendarEntry = (entry, priestID) => {
  const type = String(entry?.scheduleType || "").trim().toLowerCase();
  return (
    (type === "priest_schedule" || type === "parish_event" || type === "priest_activity") &&
    Number(entry?.priestID) === Number(priestID)
  );
};

const getScheduleSlotsForDay = (dayEntries, excludeEntryId = null, { isDayOff = false, dateKey = "" } = {}) => {
  const busyEntries = (Array.isArray(dayEntries) ? dayEntries : [])
    .filter((entry) => excludeEntryId == null || Number(entry?.id) !== Number(excludeEntryId))
    .map((entry) => ({
      start: timeStringToMinutes(entry?.startTime),
      end: timeStringToMinutes(entry?.endTime),
      title: String(entry?.title || "Priest Schedule").trim() || "Priest Schedule",
    }))
    .filter((entry) => entry.start !== null && entry.end !== null);

  return buildParishAppointmentScheduleSlots().map((slot) => {
    const conflict = busyEntries.find((busy) =>
      doScheduleRangesOverlap(slot.startMinutes, slot.endMinutes, busy.start, busy.end),
    );
    const isPastSlot = isScheduleSlotInThePast(dateKey, slot.startTime);
    return {
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.label,
      available: !isDayOff && !conflict && !isPastSlot,
      conflictTitle: isPastSlot ? "This time has already passed." : conflict?.title || "",
    };
  });
};

const normalizeSacramentalType = (rawSacramentName) => {
  return normalizeSpecialProgramSacramentalType(rawSacramentName);
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

const toTitleCaseInput = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());

const normalizeChecklistSteps = (steps, sacramentalType) => {
  if (!Array.isArray(steps) || steps.length === 0) {
    return [];
  }
  const normalized = steps
    .map((step, index) => {
      const stepTitle = String(step?.title || `Step ${index + 1}`).trim();
      const stepTasks = Array.isArray(step?.tasks)
        ? step.tasks.map((task) => String(task || "").trim()).filter(Boolean)
        : [];
      return {
        title: stepTitle || `Step ${index + 1}`,
        tasks: stepTasks.length > 0 ? stepTasks : ["New task"],
      };
    })
    .filter((step) => Boolean(step.title));
  return normalized.length > 0 ? normalized : [];
};

const cloneChecklistSteps = (steps) =>
  (Array.isArray(steps) ? steps : []).map((step) => ({
    title: String(step?.title || "").trim() || "Untitled Step",
    tasks: Array.isArray(step?.tasks) ? step.tasks.map((task) => String(task || "").trim()).filter(Boolean) : [],
  }));

const clearAppointmentChecks = (checksMap, appointmentID) => {
  const prefix = `${String(appointmentID || "unknown")}:`;
  const next = {};
  for (const [key, value] of Object.entries(checksMap || {})) {
    if (!key.startsWith(prefix)) next[key] = value;
  }
  return next;
};

const clearAppointmentTaskSchedules = (schedulesMap, appointmentID) => {
  const prefix = `${String(appointmentID || "unknown")}:`;
  const next = {};
  for (const [key, value] of Object.entries(schedulesMap || {})) {
    if (!key.startsWith(prefix)) next[key] = value;
  }
  return next;
};

const hydrateChecklistFromApi = (checklist, sacramentalType, appointmentID) => {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    return { steps: [], checkedMap: {}, taskScheduleMap: {}, taskUncheckMetaMap: {} };
  }
  const normalizedSteps = checklist
    .map((step, stepIndex) => {
      const title = String(step?.title || `Step ${stepIndex + 1}`).trim() || `Step ${stepIndex + 1}`;
      const tasks = Array.isArray(step?.tasks) ? step.tasks : [];
      const normalizedTasks = tasks
        .map((task) => {
          if (typeof task === "string") return { label: task.trim(), done: false };
          return {
            label: String(task?.label || "").trim(),
            done: Boolean(task?.done),
            lastUncheckReason: String(task?.lastUncheckReason || "").trim(),
            lastUncheckedAt: String(task?.lastUncheckedAt || "").trim(),
          };
        })
        .filter((task) => Boolean(task.label));
      return { title, tasks: normalizedTasks };
    })
    .filter((step) => step.tasks.length > 0);
  if (normalizedSteps.length === 0) {
    return { steps: [], checkedMap: {}, taskScheduleMap: {}, taskUncheckMetaMap: {} };
  }
  const checkedMap = {};
  const taskScheduleMap = {};
  const taskUncheckMetaMap = {};
  const steps = normalizedSteps.map((step, stepIndex) => ({
    title: step.title,
    tasks: step.tasks.map((task, taskIndex) => {
      const key = buildChecklistKey(appointmentID, stepIndex, taskIndex);
      checkedMap[key] = Boolean(task.done);
      const parsedScheduleDate = parseScheduleDateTimeInput(task?.nextScheduleDateTime);
      taskScheduleMap[key] = parsedScheduleDate ? parsedScheduleDate.toISOString() : "";
      if (task.lastUncheckReason) {
        taskUncheckMetaMap[key] = {
          lastUncheckReason: task.lastUncheckReason,
          lastUncheckedAt: task.lastUncheckedAt || null,
        };
      }
      return task.label;
    }),
  }));
  return { steps, checkedMap, taskScheduleMap, taskUncheckMetaMap };
};

const buildChecklistPayload = (steps, checkedMap, appointmentID, taskScheduleMap = {}, taskUncheckMetaMap = {}) => {
  const normalizedSteps = normalizeChecklistSteps(steps, "Blessing");
  return normalizedSteps.map((step, stepIndex) => ({
    title: step.title,
    tasks: step.tasks
      .map((task, taskIndex) => {
        const checklistKey = buildChecklistKey(appointmentID, stepIndex, taskIndex);
        const uncheckMeta = taskUncheckMetaMap[checklistKey];
        const payloadTask = {
          label: String(task || "").trim(),
          done: Boolean(checkedMap[checklistKey]),
          nextScheduleDateTime: (() => {
            const rawValue = String(taskScheduleMap[checklistKey] || "").trim();
            if (!rawValue) return null;
            const parsed = parseScheduleDateTimeInput(rawValue);
            return parsed ? parsed.toISOString() : null;
          })(),
        };
        if (uncheckMeta?.lastUncheckReason) {
          payloadTask.lastUncheckReason = uncheckMeta.lastUncheckReason;
          if (uncheckMeta.lastUncheckedAt) {
            payloadTask.lastUncheckedAt = uncheckMeta.lastUncheckedAt;
          }
        }
        return payloadTask;
      })
      .filter((task) => Boolean(task.label)),
  }));
};

const buildTemplateStepsPayload = (steps) => {
  const normalizedSteps = normalizeChecklistSteps(steps, "Blessing");
  return normalizedSteps.map((step) => ({
    title: String(step.title || "").trim(),
    tasks: (Array.isArray(step.tasks) ? step.tasks : []).map((task) => String(task || "").trim()).filter(Boolean),
  }));
};

const createEmptyFinalDetails = () => ({
  scheduledEventDateTime: "",
  eventDone: false,
  conductedPriestID: null,
  priestName: "",
  paymentFee: 0,
  donationOffering: 0,
});

const toDateTimeLocalValue = (dateValue) => {
  if (!dateValue) return "";
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "";
  const timezoneOffsetMs = parsedDate.getTimezoneOffset() * 60 * 1000;
  return new Date(parsedDate.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const parseScheduleDateTimeInput = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const localDateTimeMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (localDateTimeMatch) {
    const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = localDateTimeMatch;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashDateMatch = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?)?$/,
  );
  if (slashDateMatch) {
    const [, firstRaw, secondRaw, yearRaw, hourRaw = "0", minuteRaw = "0", meridiemRaw = ""] = slashDateMatch;
    const first = Number(firstRaw);
    const second = Number(secondRaw);
    const year = Number(yearRaw);
    let day = first;
    let month = second;
    if (first <= 12 && second > 12) {
      month = first;
      day = second;
    }
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const meridiem = String(meridiemRaw || "").toLowerCase();
    if (meridiem) {
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
    }
    const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const normalizeFinalDetailsFromApi = (rawFinalDetails) => {
  const source = rawFinalDetails && typeof rawFinalDetails === "object" ? rawFinalDetails : {};
  const parsedDate = new Date(source?.scheduledEventDateTime || "");
  const parsedEndDate = new Date(source?.scheduledEventEndDateTime || "");
  const normalizedOfferings = Array.isArray(source?.giftOfferingsReceipts) ? source.giftOfferingsReceipts : [];
  const rawDonationOffering = Number(
    source?.donationOffering !== undefined && source?.donationOffering !== null
      ? source.donationOffering
      : normalizedOfferings[0],
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

const mergeFinalDetailsPreservingLocal = (apiDetails, localDetails) => {
  const api = normalizeFinalDetailsFromApi(apiDetails);
  const local = normalizeFinalDetailsFromApi(localDetails);
  return {
    ...local,
    ...api,
    conductedPriestID: api.conductedPriestID || null,
    priestName: api.conductedPriestID ? api.priestName || local.priestName || "" : "",
    scheduledEventDateTime: api.scheduledEventDateTime || "",
    scheduledEventEndDateTime: api.scheduledEventEndDateTime || "",
    programTimeSlots: api.programTimeSlots,
    eventDone: api.eventDone || local.eventDone,
    paymentFee: Number.isFinite(api.paymentFee) && api.paymentFee > 0 ? api.paymentFee : local.paymentFee,
    donationOffering:
      Number.isFinite(api.donationOffering) && api.donationOffering > 0 ? api.donationOffering : local.donationOffering,
  };
};

const buildFinalDetailsDraftKey = (appointmentID) => `faithflow_progress_final_details:${String(appointmentID || "unknown")}`;

const readFinalDetailsDraft = (appointmentID) => {
  if (typeof window === "undefined") return null;
  const key = buildFinalDetailsDraftKey(appointmentID);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return normalizeFinalDetailsFromApi(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writeFinalDetailsDraft = (appointmentID, details) => {
  if (typeof window === "undefined") return;
  if (!Number.isInteger(Number(appointmentID)) || Number(appointmentID) <= 0) return;
  const key = buildFinalDetailsDraftKey(appointmentID);
  try {
    localStorage.setItem(key, JSON.stringify(normalizeFinalDetailsFromApi(details)));
  } catch {
    // Ignore storage write errors.
  }
};

const sanitizeFinalDetailsForSave = (rawDetails) => {
  const normalized = normalizeFinalDetailsFromApi(rawDetails);
  return {
    scheduledEventDateTime: normalized.scheduledEventDateTime || null,
    eventDone: normalized.eventDone,
    conductedPriestID: normalized.conductedPriestID,
    priestName: normalized.priestName || "",
    priestComments: "",
    secretaryRemarks: "",
    giftAmount: Number.isFinite(Number(normalized.paymentFee)) ? Math.max(0, Number(normalized.paymentFee)) : 0,
    giftOfferingsReceipts:
      Number.isFinite(Number(normalized.donationOffering)) && Number(normalized.donationOffering) > 0
        ? [Number(normalized.donationOffering)]
        : [],
  };
};

const resolveFinalDetailsForSave = (rawDetails, selectedPriestForScheduling = "") => {
  const normalized = normalizeFinalDetailsFromApi(rawDetails);
  const fallbackPriestID = Number(selectedPriestForScheduling);
  const resolvedPriestID =
    Number.isInteger(normalized.conductedPriestID) && normalized.conductedPriestID > 0
      ? normalized.conductedPriestID
      : Number.isInteger(fallbackPriestID) && fallbackPriestID > 0
        ? fallbackPriestID
        : null;
  return {
    ...normalized,
    conductedPriestID: resolvedPriestID,
  };
};


// Blessing type picked on the form, e.g. "House Blessing". For "Other Blessing" it returns what
// the requester typed in the "if other" field instead.
const getBlessingTypeDetail = (item) => {
  const sacrament = String(item?.sacramentalType || item?.sacramentName || "").trim().toLowerCase();
  if (!sacrament.includes("blessing")) return "";
  const credentials = item?.credentials && typeof item.credentials === "object" ? item.credentials : {};
  const blessingType = String(credentials.blessingType || "").trim();
  if (!blessingType) return "";
  if (!/other/i.test(blessingType)) return blessingType;
  const otherKey = Object.keys(credentials).find((key) => /^ifother/i.test(key) && String(credentials[key] || "").trim());
  const otherText = String(
    (otherKey ? credentials[otherKey] : "") || credentials.blessingTarget || "",
  ).trim();
  return otherText || blessingType;
};

function AdminProgressDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { appointmentId } = useParams();
  const [searchParams] = useSearchParams();

  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [selectedProgressItem, setSelectedProgressItem] = useState(location.state?.progressItem || null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isTextEditingEnabled, setIsTextEditingEnabled] = useState(false);
  const [checklistSteps, setChecklistSteps] = useState([]);
  const [, setTemplateBaselineSteps] = useState([]);
  const [linkedTemplateID, setLinkedTemplateID] = useState(null);
  const [checkedTasks, setCheckedTasks] = useState({});
  const [taskSchedules, setTaskSchedules] = useState({});
  const [finalDetails, setFinalDetails] = useState(createEmptyFinalDetails);
  const [progressCompletionState, setProgressCompletionState] = useState({
    finishedAt: null,
    pendingHistory: false,
    historyEligibleAt: null,
  });
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleDateInput, setScheduleDateInput] = useState("");
  const [scheduleTimeInput, setScheduleTimeInput] = useState("");
  const [scheduleEndTimeInput, setScheduleEndTimeInput] = useState("");
  const [isSavingScheduleDateTime, setIsSavingScheduleDateTime] = useState(false);
  const [scheduleRemarks, setScheduleRemarks] = useState([]);
  const [priestRemarks, setPriestRemarks] = useState([]);
  const [isLoadingPriestRemarks, setIsLoadingPriestRemarks] = useState(false);
  const [priestRemarksError, setPriestRemarksError] = useState("");
  const [isMarkingPriestRemarkById, setIsMarkingPriestRemarkById] = useState({});
  const [pendingScheduleRemark, setPendingScheduleRemark] = useState(null);
  const [scheduleRemarkError, setScheduleRemarkError] = useState("");
  const [isPreferredScheduleConfirmOpen, setIsPreferredScheduleConfirmOpen] = useState(false);
  const [isApplyingPreferredSchedule, setIsApplyingPreferredSchedule] = useState(false);
  const scheduleRemarksCardRef = useRef(null);
  const [saveError, setSaveError] = useState("");
  const [finalDetailsError, setFinalDetailsError] = useState("");
  const [taskDeleteTarget, setTaskDeleteTarget] = useState(null);
  const [taskCheckToggleTarget, setTaskCheckToggleTarget] = useState(null);
  const [taskUncheckReason, setTaskUncheckReason] = useState("");
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAppointmentDetailsOpen, setIsAppointmentDetailsOpen] = useState(false);
  const [isPaymentUndoConfirmOpen, setIsPaymentUndoConfirmOpen] = useState(false);
  const [isUndoingPayment, setIsUndoingPayment] = useState(false);
  const [paymentInvoiceInput, setPaymentInvoiceInput] = useState("");
  const [paymentDateInput, setPaymentDateInput] = useState("");
  const [paymentReceiptFile, setPaymentReceiptFile] = useState(null);
  const [isSavingPaymentRecord, setIsSavingPaymentRecord] = useState(false);
  const [paymentFormError, setPaymentFormError] = useState("");
  const [cancelStep, setCancelStep] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [isCancellingAppointment, setIsCancellingAppointment] = useState(false);
  const [priestOptions, setPriestOptions] = useState([]);
  const [calendarEntries, setCalendarEntries] = useState([]);
  const [isPriestSelectionModalOpen, setIsPriestSelectionModalOpen] = useState(false);
  const [selectedPriestForScheduling, setSelectedPriestForScheduling] = useState("");
  const [isAssigningPriest, setIsAssigningPriest] = useState(false);
  const [priestSelectionError, setPriestSelectionError] = useState("");
  const [isPriestCalendarModalOpen, setIsPriestCalendarModalOpen] = useState(false);
  const [priestCalendarMonth, setPriestCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [dayOffWeekday, setDayOffWeekday] = useState(null);
  const [dayOffSpecificDates, setDayOffSpecificDates] = useState([]);
  const [halfDaySetting, setHalfDaySetting] = useState(null);
  const [scheduleMinAdvanceDays, setScheduleMinAdvanceDays] = useState(PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS);
  const [appointmentScheduleMinAdvanceDays, setAppointmentScheduleMinAdvanceDays] = useState(null);
  const [isLoadingScheduleSlots, setIsLoadingScheduleSlots] = useState(false);
  const [remoteDayAvailability, setRemoteDayAvailability] = useState(null);
  const checklistStepsRef = useRef(checklistSteps);
  const checkedTasksRef = useRef(checkedTasks);
  const taskSchedulesRef = useRef(taskSchedules);
  const taskUncheckMetaRef = useRef({});
  const skipCheckedTasksAutosaveRef = useRef(false);
  const finalStepCardRef = useRef(null);
  const lastSavedEventDetailsRef = useRef({ conductedPriestID: null, scheduledEventDateTime: "" });
  const pendingScheduleAfterPriestChangeRef = useRef(false);
  const reopenScheduleModalAfterCalendarRef = useRef(false);

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

  const [pendingUserChangeRequest, setPendingUserChangeRequest] = useState(null);

  useEffect(() => {
    document.title = "Faithflow - Progress Details";
  }, []);

  useEffect(() => {
    const adminID = Number(user?.adminID);
    const targetAppointmentID = Number(appointmentId);
    if (accountType !== "admin" || !Number.isInteger(adminID) || adminID <= 0 || !(targetAppointmentID > 0)) {
      return undefined;
    }
    let isCancelled = false;
    fetchPendingAppointmentChangeRequests(adminID)
      .then((requests) => {
        if (isCancelled) return;
        setPendingUserChangeRequest(
          requests.find((request) => Number(request.appointmentID) === targetAppointmentID) || null,
        );
      })
      .catch(() => {
        if (!isCancelled) setPendingUserChangeRequest(null);
      });
    return () => {
      isCancelled = true;
    };
  }, [accountType, appointmentId, user?.adminID]);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user, accountType]);

  useEffect(() => {
    checklistStepsRef.current = checklistSteps;
  }, [checklistSteps]);

  useEffect(() => {
    checkedTasksRef.current = checkedTasks;
  }, [checkedTasks]);

  useEffect(() => {
    taskSchedulesRef.current = taskSchedules;
  }, [taskSchedules]);

  useEffect(() => {
    if (selectedProgressItem) return;

    const normalizedAppointmentId = Number(appointmentId);
    if (!normalizedAppointmentId) {
      setLoadError("Invalid request ID.");
      return;
    }

    const loadProgressItem = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const [appointmentsResponse, sacramentsResponse, specialSacramentsResponse] = await Promise.all([
          fetch("/admin-api/appointments"),
          fetch("/admin-api/sacraments"),
          fetch("/admin-api/special-sacraments"),
        ]);

        const appointmentsData = await appointmentsResponse.json().catch(() => []);
        const sacramentsData = await sacramentsResponse.json().catch(() => []);
        const specialSacramentsData = await specialSacramentsResponse.json().catch(() => []);

        if (!appointmentsResponse.ok) throw new Error("Unable to load appointment details.");
        if (!sacramentsResponse.ok) throw new Error("Unable to load sacrament details.");
        if (!specialSacramentsResponse.ok) throw new Error("Unable to load special sacrament details.");

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
          (appointment) => Number(appointment?.appointmentID) === normalizedAppointmentId,
        );

        if (!matchingAppointment) {
          throw new Error("Request not found.");
        }

        const sacramentName =
          (matchingAppointment?.sacramentID
            ? sacramentNameMap.get(Number(matchingAppointment.sacramentID)) || ""
            : matchingAppointment?.s_sacramentID
              ? specialSacramentNameMap.get(Number(matchingAppointment.s_sacramentID)) ||
                String(matchingAppointment?.specialSacramentName || matchingAppointment?.s_sacramentName || "").trim()
              : "") || String(matchingAppointment?.sacramentName || "").trim();
        const sacramentalType = normalizeSacramentalType(sacramentName);

        setSelectedProgressItem({
          ...matchingAppointment,
          requesterFullName: String(matchingAppointment?.requesterFullName || "").trim() || "Unknown Account",
          sacramentName,
          sacramentalType: sacramentalType || String(sacramentName || "").trim() || "Blessing",
        });
      } catch (error) {
        setLoadError(error.message || "Unable to load progress details.");
      } finally {
        setIsLoading(false);
      }
    };

    loadProgressItem();
  }, [appointmentId, selectedProgressItem]);

  if (!user || accountType !== "admin") return null;

  const blessingTypeDetail = getBlessingTypeDetail(selectedProgressItem);
  const appointmentSubjectName = selectedProgressItem ? getAppointmentDisplayName(selectedProgressItem) : "";
  const appointmentRequesterName = String(selectedProgressItem?.requesterFullName || "").trim();

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const closeCancelAppointmentFlow = () => {
    if (isCancellingAppointment) return;
    setCancelStep(null);
    setCancelReason("");
    setCancelError("");
  };

  const handleConfirmCancelAppointment = async () => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    const adminID = Number(user?.adminID);
    const reason = String(cancelReason || "").trim();
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setCancelError("Unable to detect admin account.");
      return;
    }
    if (reason.length < 3) {
      setCancelError("Please enter a cancellation reason.");
      return;
    }
    setIsCancellingAppointment(true);
    setCancelError("");
    try {
      const response = await fetch(`/admin-api/appointments/${appointmentID}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminID,
          status: "CANCELLED",
          declineReason: reason,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to cancel this appointment.");
      }
      pushUiNotice("Appointment cancelled. The requester has been notified.");
      setCancelStep(null);
      setCancelReason("");
      navigate("/admin/progress-tracker", { replace: true });
    } catch (error) {
      setCancelError(error.message || "Unable to cancel this appointment.");
    } finally {
      setIsCancellingAppointment(false);
    }
  };

  const totalTaskCount = checklistSteps.reduce((sum, step) => sum + step.tasks.length, 0);
  const completedTaskCount = checklistSteps.reduce((sum, step, stepIndex) => {
    return (
      sum +
      step.tasks.reduce((taskSum, _task, taskIndex) => {
        const checklistKey = buildChecklistKey(selectedProgressItem?.appointmentID, stepIndex, taskIndex);
        return taskSum + (checkedTasks[checklistKey] ? 1 : 0);
      }, 0)
    );
  }, 0);
  const firstIncompleteStepIndex = checklistSteps.findIndex((step, stepIndex) => {
    const stepTotal = step.tasks.length;
    const stepCompleted = step.tasks.reduce((sum, _task, taskIndex) => {
      const checklistKey = buildChecklistKey(selectedProgressItem?.appointmentID, stepIndex, taskIndex);
      return sum + (checkedTasks[checklistKey] ? 1 : 0);
    }, 0);
    return stepCompleted < stepTotal;
  });
  const defaultStepIndex = firstIncompleteStepIndex === -1 ? Math.max(checklistSteps.length - 1, 0) : firstIncompleteStepIndex;
  const safeActiveStepIndex = Math.min(Math.max(activeStepIndex, 0), Math.max(checklistSteps.length - 1, 0));
  const activeStep = checklistSteps[safeActiveStepIndex] || null;
  const activeStepTaskCount = activeStep?.tasks?.length || 0;
  const activeStepCompletedCount = (activeStep?.tasks || []).reduce((sum, _task, taskIndex) => {
    const checklistKey = buildChecklistKey(selectedProgressItem?.appointmentID, safeActiveStepIndex, taskIndex);
    return sum + (checkedTasks[checklistKey] ? 1 : 0);
  }, 0);
  const isChecklistFullyCompleted = totalTaskCount > 0 && completedTaskCount >= totalTaskCount;
  const hasScheduledDateTime = Boolean(finalDetails.scheduledEventDateTime);
  const displayedScheduleRemark = pendingScheduleRemark || scheduleRemarks[0] || null;
  const isSpecialProgram = isSpecialProgramAppointment(selectedProgressItem);
  const isFuneralMass = isFuneralMassSacrament(
    selectedProgressItem?.sacramentalType || selectedProgressItem?.sacramentName,
  );
  const effectiveScheduleMinAdvanceDays = isFuneralMass
    ? resolveFuneralMassAdvanceDays(appointmentScheduleMinAdvanceDays)
    : Number.isInteger(Number(appointmentScheduleMinAdvanceDays)) && Number(appointmentScheduleMinAdvanceDays) >= 0
      ? Number(appointmentScheduleMinAdvanceDays)
      : scheduleMinAdvanceDays;
  const canRecordPayment = !isSpecialProgram && checklistSteps.length > 0 && checklistSteps.length <= 5;
  const activePaymentRecords = useMemo(
    () => paymentRecords.filter((record) => !record?.isArchived),
    [paymentRecords],
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
  const isPaymentMarkedPaid = paymentStatus === "paid" || recordedPaymentInvoices.length > 0 || totalRecordedPayment > 0;
  const canSetEventSchedule = isSpecialProgram || isPaymentMarkedPaid || !canRecordPayment;
  const displayPaymentStatusLabel = isSpecialProgram ? "Free" : isPaymentMarkedPaid ? "Paid" : "Unpaid";
  const displayPaymentStatusClass = isSpecialProgram ? "is-free" : isPaymentMarkedPaid ? "is-paid" : "is-unpaid";
  const showsPaymentStatus = isSpecialProgram || canRecordPayment;

  useEffect(() => {
    setActiveStepIndex(defaultStepIndex);
  }, [selectedProgressItem?.appointmentID, defaultStepIndex]);

  useEffect(() => {
    if (!selectedProgressItem?.appointmentID) return;
    let isCancelled = false;
    const appointmentID = selectedProgressItem.appointmentID;

    const loadProgressChecklist = async () => {
      try {
        const response = await fetch(`/admin-api/appointments/${appointmentID}/progress`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Unable to load checklist progress.");
        if (isCancelled) return;
        const hydrated = hydrateChecklistFromApi(payload?.checklist, selectedProgressItem.sacramentalType, appointmentID);
        const resolvedSteps = hydrated.steps;
        setChecklistSteps(resolvedSteps);
        setTemplateBaselineSteps(cloneChecklistSteps(resolvedSteps));
        setCheckedTasks((current) => ({
          ...clearAppointmentChecks(current, appointmentID),
          ...hydrated.checkedMap,
        }));
        setTaskSchedules((current) => ({
          ...clearAppointmentTaskSchedules(current, appointmentID),
          ...hydrated.taskScheduleMap,
        }));
        taskUncheckMetaRef.current = hydrated.taskUncheckMetaMap || {};
        const normalizedApiFinalDetails = normalizeFinalDetailsFromApi(payload?.finalDetails);
        const cachedFinalDetails = readFinalDetailsDraft(appointmentID);
        const resolvedFinalDetails = mergeFinalDetailsPreservingLocal(
          normalizedApiFinalDetails,
          cachedFinalDetails || normalizedApiFinalDetails,
        );
        setFinalDetails(resolvedFinalDetails);
        writeFinalDetailsDraft(appointmentID, resolvedFinalDetails);
        lastSavedEventDetailsRef.current = {
          conductedPriestID: resolvedFinalDetails.conductedPriestID,
          scheduledEventDateTime: resolvedFinalDetails.scheduledEventDateTime || "",
        };
        setLinkedTemplateID(Number.isInteger(Number(payload?.templateID)) ? Number(payload.templateID) : null);
        setPaymentRecords(Array.isArray(payload?.paymentRecords) ? payload.paymentRecords : []);
        setPaymentStatus(String(payload?.paymentStatus || "unpaid").trim().toLowerCase() === "paid" ? "paid" : "unpaid");
        const parsedAdvanceDays = Number(payload?.scheduleMinAdvanceDays);
        setAppointmentScheduleMinAdvanceDays(
          Number.isInteger(parsedAdvanceDays) && parsedAdvanceDays >= 0 ? parsedAdvanceDays : null,
        );
        setProgressCompletionState({
          finishedAt: payload?.finishedAt || null,
          pendingHistory: Boolean(payload?.pendingHistory),
          historyEligibleAt: payload?.historyEligibleAt || payload?.finalDetails?.scheduledEventDateTime || null,
        });
        const resolvedTotalPayment = Number(payload?.totalPaymentAmount ?? payload?.finalDetails?.giftAmount ?? 0);
        if (Number.isFinite(resolvedTotalPayment) && resolvedTotalPayment > 0) {
          setFinalDetails((current) => ({
            ...current,
            paymentFee: Math.max(0, resolvedTotalPayment),
          }));
        }
      } catch (_error) {
        if (isCancelled) return;
        setChecklistSteps([]);
        setTemplateBaselineSteps([]);
        setCheckedTasks((current) => clearAppointmentChecks(current, appointmentID));
        setTaskSchedules((current) => clearAppointmentTaskSchedules(current, appointmentID));
        setFinalDetails(readFinalDetailsDraft(appointmentID) || createEmptyFinalDetails());
        setScheduleDateInput("");
        setScheduleTimeInput("");
        setScheduleEndTimeInput("");
        setLinkedTemplateID(null);
        setAppointmentScheduleMinAdvanceDays(null);
      }
    };
    loadProgressChecklist();
    return () => {
      isCancelled = true;
    };
  }, [selectedProgressItem?.appointmentID, selectedProgressItem?.sacramentalType, selectedProgressItem?.updatedAt, selectedProgressItem?.createdAt]);

  useEffect(() => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      setScheduleRemarks([]);
      setPendingScheduleRemark(null);
      setScheduleRemarkError("");
      return undefined;
    }
    let isCancelled = false;
    const loadScheduleRemarks = async () => {
      try {
        const response = await fetch(`/admin-api/appointments/${appointmentID}/schedule-remarks`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Unable to load schedule remarks.");
        if (isCancelled) return;
        const remarks = Array.isArray(payload?.remarks) ? payload.remarks : [];
        setScheduleRemarks(remarks);
        setPendingScheduleRemark(payload?.pendingRemark || remarks.find((item) => item.status === "pending") || null);
        setScheduleRemarkError("");
      } catch (error) {
        if (isCancelled) return;
        setScheduleRemarks([]);
        setPendingScheduleRemark(null);
        setScheduleRemarkError(error.message || "Unable to load schedule remarks.");
      }
    };
    void loadScheduleRemarks();
    return () => {
      isCancelled = true;
    };
  }, [selectedProgressItem?.appointmentID, progressCompletionState.pendingHistory, finalDetails.scheduledEventDateTime]);

  useEffect(() => {
    const remarkID = Number(searchParams.get("remarkID"));
    if (!Number.isInteger(remarkID) || remarkID <= 0) return undefined;
    const timer = window.setTimeout(() => {
      const target =
        document.getElementById(`appointment-schedule-remark-${remarkID}`) ||
        scheduleRemarksCardRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchParams, pendingScheduleRemark, scheduleRemarks]);

  useEffect(() => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    const priestID = Number(finalDetails.conductedPriestID);
    const adminID = Number(user?.adminID);
    if (
      !Number.isInteger(appointmentID) ||
      appointmentID <= 0 ||
      !Number.isInteger(priestID) ||
      priestID <= 0 ||
      !Number.isInteger(adminID) ||
      adminID <= 0
    ) {
      setPriestRemarks([]);
      setPriestRemarksError("");
      return undefined;
    }
    let isCancelled = false;
    const loadPriestRemarks = async () => {
      setIsLoadingPriestRemarks(true);
      try {
        const response = await fetch(`/admin-api/priests/${priestID}/schedule-remarks?adminID=${adminID}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Unable to load priest remarks.");
        if (isCancelled) return;
        const remarks = Array.isArray(payload?.remarks) ? payload.remarks : [];
        setPriestRemarks(remarks.filter((item) => Number(item?.appointmentID) === appointmentID));
        setPriestRemarksError("");
      } catch (error) {
        if (isCancelled) return;
        setPriestRemarks([]);
        setPriestRemarksError(error.message || "Unable to load priest remarks.");
      } finally {
        if (!isCancelled) setIsLoadingPriestRemarks(false);
      }
    };
    void loadPriestRemarks();
    return () => {
      isCancelled = true;
    };
  }, [selectedProgressItem?.appointmentID, finalDetails.conductedPriestID, finalDetails.scheduledEventDateTime, user?.adminID]);

  const handleMarkPriestRemarkReviewed = async (remark) => {
    const remarkID = Number(remark?.remarkID);
    const priestID = Number(remark?.priestID);
    const adminID = Number(user?.adminID);
    if (!Number.isInteger(remarkID) || remarkID <= 0 || !Number.isInteger(priestID) || priestID <= 0) return;
    setPriestRemarksError("");
    setIsMarkingPriestRemarkById((current) => ({ ...current, [remarkID]: true }));
    try {
      const response = await fetch(
        `/admin-api/priests/${priestID}/schedule-remarks/${remarkID}/review?adminID=${adminID}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminID }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Unable to mark priest remark as reviewed.");
      setPriestRemarks((current) =>
        current.map((item) =>
          Number(item.remarkID) === remarkID
            ? {
                ...item,
                reviewedBySecretary: true,
                status: "reviewed_by_secretary",
                reviewedAt: payload?.remark?.reviewedAt || new Date().toISOString(),
              }
            : item,
        ),
      );
      pushUiNotice("Priest remark marked as reviewed.");
    } catch (error) {
      setPriestRemarksError(error.message || "Unable to mark priest remark as reviewed.");
    } finally {
      setIsMarkingPriestRemarkById((current) => ({ ...current, [remarkID]: false }));
    }
  };

  useEffect(() => {
    if (!selectedProgressItem?.appointmentID) {
      setLinkedTemplateID(null);
      setFinalDetails(createEmptyFinalDetails());
      setTaskSchedules({});
      setScheduleDateInput("");
      setScheduleTimeInput("");
      setScheduleEndTimeInput("");
      return;
    }
  }, [selectedProgressItem?.appointmentID]);

  useEffect(() => {
    const resolvedAdminID = Number(user?.adminID);
    if (!Number.isInteger(resolvedAdminID) || resolvedAdminID <= 0) {
      setPriestOptions([]);
      return;
    }
    let isCancelled = false;
    const loadPriestOptions = async () => {
      try {
        const response = await fetch(`/admin-api/priests?adminID=${resolvedAdminID}&includeInactive=true`);
        const responseData = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error("Unable to load priest options.");
        }
        if (isCancelled) return;
        const options = (Array.isArray(responseData) ? responseData : [])
          .filter((item) => Number.isInteger(Number(item?.priestID)) && Number(item.priestID) > 0)
          .sort((left, right) => String(left?.fullName || "").localeCompare(String(right?.fullName || "")));
        setPriestOptions(options);
      } catch {
        if (isCancelled) return;
        setPriestOptions([]);
      }
    };
    void loadPriestOptions();
    return () => {
      isCancelled = true;
    };
  }, [user?.adminID]);

  useEffect(() => {
    const assignedID = Number(finalDetails.conductedPriestID);
    if (!Number.isInteger(assignedID) || assignedID <= 0) return;
    if (!priestOptions.length) return;
    const priestStillExists = priestOptions.some((priest) => Number(priest.priestID) === assignedID);
    if (priestStillExists) return;
    const appointmentID = selectedProgressItem?.appointmentID;
    setFinalDetails((current) => {
      const next = { ...current, conductedPriestID: null, priestName: "" };
      if (appointmentID) writeFinalDetailsDraft(appointmentID, next);
      return next;
    });
    setSelectedPriestForScheduling((current) => (Number(current) === assignedID ? "" : current));
  }, [finalDetails.conductedPriestID, priestOptions, selectedProgressItem?.appointmentID]);

  const refreshCalendarEntries = async (adminIDOverride) => {
    const resolvedAdminID = Number(adminIDOverride ?? user?.adminID);
    if (!Number.isInteger(resolvedAdminID) || resolvedAdminID <= 0) {
      setCalendarEntries([]);
      return { ok: false };
    }
    try {
      const response = await fetch(`/admin-api/calendar-entries?adminID=${resolvedAdminID}`);
      const responseData = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error("Unable to load priest schedules.");
      }
      setCalendarEntries(Array.isArray(responseData) ? responseData : []);
      return { ok: true };
    } catch {
      setCalendarEntries([]);
      return { ok: false };
    }
  };

  useEffect(() => {
    void refreshCalendarEntries();
  }, [user?.adminID]);

  useEffect(() => {
    const resolvedAdminID = Number(user?.adminID);
    if (!Number.isInteger(resolvedAdminID) || resolvedAdminID <= 0) {
      setDayOffWeekday(null);
      setDayOffSpecificDates([]);
      setScheduleMinAdvanceDays(PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS);
      return;
    }
    let isCancelled = false;
    const loadDayOffSettings = async () => {
      try {
        const response = await fetch(`/admin-api/day-offs?adminID=${resolvedAdminID}`);
        const responseData = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error("Unable to load day-off settings.");
        }
        if (isCancelled) return;
        const weekdayRaw = responseData?.weekday;
        const parsedWeekday = weekdayRaw === null || weekdayRaw === undefined || weekdayRaw === "" ? null : Number(weekdayRaw);
        setDayOffWeekday(Number.isInteger(parsedWeekday) && parsedWeekday >= 0 && parsedWeekday <= 6 ? parsedWeekday : null);
        const dates = Array.isArray(responseData?.specificDates)
          ? responseData.specificDates
              .map((item) => String(item?.date || "").trim())
              .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
          : [];
        setDayOffSpecificDates(dates);
        const halfDayRaw = responseData?.halfDay;
        const halfDayWeekday = Number(halfDayRaw?.weekday);
        setHalfDaySetting(
          halfDayRaw && Number.isInteger(halfDayWeekday) && halfDayRaw.startTime && halfDayRaw.endTime
            ? { weekday: halfDayWeekday, startTime: String(halfDayRaw.startTime), endTime: String(halfDayRaw.endTime) }
            : null,
        );
        setScheduleMinAdvanceDays(normalizeScheduleMinAdvanceDays(responseData?.minAdvanceDays));
      } catch {
        if (isCancelled) return;
        setDayOffWeekday(null);
        setDayOffSpecificDates([]);
        setHalfDaySetting(null);
        setScheduleMinAdvanceDays(PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS);
      }
    };
    void loadDayOffSettings();
    return () => {
      isCancelled = true;
    };
  }, [user?.adminID]);

  useEffect(() => {
    setSelectedPriestForScheduling(finalDetails.conductedPriestID ? String(finalDetails.conductedPriestID) : "");
  }, [finalDetails.conductedPriestID, selectedProgressItem?.appointmentID]);

  const selectedPriestScheduleEntries = useMemo(() => {
    const selectedPriestID = Number(selectedPriestForScheduling);
    if (!Number.isInteger(selectedPriestID) || selectedPriestID <= 0) return [];
    return (Array.isArray(calendarEntries) ? calendarEntries : [])
      .filter((entry) => isPriestAssignedCalendarEntry(entry, selectedPriestID) && toEventDateKey(entry?.eventDate))
      .sort((left, right) => {
        const leftDateTime = `${toEventDateKey(left?.eventDate)}T${String(left?.startTime || "00:00")}:00`;
        const rightDateTime = `${toEventDateKey(right?.eventDate)}T${String(right?.startTime || "00:00")}:00`;
        return leftDateTime.localeCompare(rightDateTime);
      });
  }, [calendarEntries, selectedPriestForScheduling]);

  const isSelectedDateDayOff = useMemo(() => {
    if (!scheduleDateInput) return false;
    if (dayOffSpecificDates.includes(scheduleDateInput)) return true;
    if (!Number.isInteger(dayOffWeekday)) return false;
    const selectedDate = new Date(`${scheduleDateInput}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return false;
    return selectedDate.getDay() === dayOffWeekday;
  }, [scheduleDateInput, dayOffSpecificDates, dayOffWeekday]);

  const linkedPriestScheduleEntryId = useMemo(() => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) {
      return null;
    }
    const linked = (Array.isArray(calendarEntries) ? calendarEntries : []).find(
      (entry) => Number(entry?.appointmentID) === appointmentID,
    );
    return linked?.id ? Number(linked.id) : null;
  }, [calendarEntries, selectedProgressItem?.appointmentID]);

  const scheduleModalDayEntries = useMemo(() => {
    const priestID = Number(selectedPriestForScheduling) || Number(finalDetails.conductedPriestID);
    if (!scheduleDateInput || !Number.isInteger(priestID) || priestID <= 0) return [];
    const normalizedScheduleDate = String(scheduleDateInput).trim();
    if (remoteDayAvailability?.date === normalizedScheduleDate && Array.isArray(remoteDayAvailability.existingSchedules)) {
      return remoteDayAvailability.existingSchedules;
    }
    return (Array.isArray(calendarEntries) ? calendarEntries : []).filter((entry) => {
      const entryDate = toEventDateKey(entry?.eventDate);
      return isPriestAssignedCalendarEntry(entry, priestID) && entryDate === normalizedScheduleDate;
    });
  }, [
    calendarEntries,
    finalDetails.conductedPriestID,
    selectedPriestForScheduling,
    scheduleDateInput,
    remoteDayAvailability,
  ]);

  const scheduleSlotOptions = useMemo(() => {
    if (!scheduleDateInput) return [];
    if (remoteDayAvailability?.date === scheduleDateInput && Array.isArray(remoteDayAvailability.slots)) {
      return remoteDayAvailability.slots.map((slot) => ({
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: slot.label || `${to12HourTime(slot.startTime)} - ${to12HourTime(slot.endTime)}`,
        available:
          slot.available !== false &&
          !remoteDayAvailability.isDayOff &&
          !remoteDayAvailability.isLocked &&
          !isScheduleSlotInThePast(scheduleDateInput, slot.startTime),
        conflictTitle: isScheduleSlotInThePast(scheduleDateInput, slot.startTime)
          ? "This time has already passed."
          : slot.conflictTitle || "",
      }));
    }
    return getScheduleSlotsForDay(scheduleModalDayEntries, linkedPriestScheduleEntryId, {
      isDayOff: isSelectedDateDayOff,
      dateKey: scheduleDateInput,
    });
  }, [
    scheduleDateInput,
    remoteDayAvailability,
    scheduleModalDayEntries,
    linkedPriestScheduleEntryId,
    isSelectedDateDayOff,
  ]);

  const availableScheduleSlots = useMemo(
    () => scheduleSlotOptions.filter((slot) => slot.available),
    [scheduleSlotOptions],
  );

  useEffect(() => {
    if (!isScheduleModalOpen || !scheduleDateInput || isLoadingScheduleSlots) return;
    if (availableScheduleSlots.length === 0) {
      setScheduleTimeInput("");
      setScheduleEndTimeInput("");
      return;
    }
    const stillValid = availableScheduleSlots.some(
      (slot) => slot.startTime === scheduleTimeInput && slot.endTime === scheduleEndTimeInput,
    );
    if (!stillValid && scheduleTimeInput) {
      setScheduleTimeInput("");
      setScheduleEndTimeInput("");
    }
  }, [
    isScheduleModalOpen,
    scheduleDateInput,
    availableScheduleSlots,
    scheduleTimeInput,
    scheduleEndTimeInput,
    isLoadingScheduleSlots,
  ]);

  useEffect(() => {
    if (!isScheduleModalOpen) {
      setRemoteDayAvailability(null);
      setIsLoadingScheduleSlots(false);
      return;
    }
    const priestID = Number(selectedPriestForScheduling) || Number(finalDetails.conductedPriestID);
    const adminID = Number(user?.adminID);
    const dateKey = String(scheduleDateInput || "").trim();
    if (!Number.isInteger(priestID) || priestID <= 0 || !Number.isInteger(adminID) || adminID <= 0 || !dateKey) {
      setRemoteDayAvailability(null);
      setIsLoadingScheduleSlots(false);
      return;
    }

    let isCancelled = false;
    const loadPriestDayAvailability = async () => {
      setIsLoadingScheduleSlots(true);
      try {
        const params = new URLSearchParams({
          adminID: String(adminID),
          date: dateKey,
        });
        const appointmentID = Number(selectedProgressItem?.appointmentID);
        if (Number.isInteger(appointmentID) && appointmentID > 0) {
          params.set("appointmentID", String(appointmentID));
        }
        if (Number.isInteger(linkedPriestScheduleEntryId) && linkedPriestScheduleEntryId > 0) {
          params.set("excludeCalendarEntryID", String(linkedPriestScheduleEntryId));
        }
        const response = await fetch(`/admin-api/priests/${priestID}/available-slots?${params.toString()}`);
        const responseData = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(responseData?.message || "Unable to load priest availability.");
        }
        if (isCancelled) return;
        setRemoteDayAvailability(responseData && typeof responseData === "object" ? responseData : null);
      } catch {
        if (isCancelled) return;
        setRemoteDayAvailability(null);
      } finally {
        if (!isCancelled) setIsLoadingScheduleSlots(false);
      }
    };

    void loadPriestDayAvailability();
    return () => {
      isCancelled = true;
    };
  }, [
    isScheduleModalOpen,
    scheduleDateInput,
    finalDetails.conductedPriestID,
    selectedPriestForScheduling,
    user?.adminID,
    linkedPriestScheduleEntryId,
    selectedProgressItem?.appointmentID,
  ]);

  const clearChecksForAppointment = (appointmentID) => {
    setCheckedTasks((current) => {
      return clearAppointmentChecks(current, appointmentID);
    });
  };

  const markProgressSaved = async (
    appointmentID,
    showNotice = true,
    {
      stepsOverride,
      checkedTasksOverride,
      finalDetailsOverride,
      includeFinalDetails = false,
      finalizeAppointment = false,
      syncTemplate = false,
      successNotice = "Checklist saved.",
      taskUncheck = null,
      markAllStepIndex = null,
    } = {},
  ) => {
    if (!appointmentID) return { ok: false };
    const payload = buildChecklistPayload(
      stepsOverride || checklistStepsRef.current,
      checkedTasksOverride || checkedTasksRef.current,
      appointmentID,
      taskSchedulesRef.current,
      taskUncheckMetaRef.current,
    );
    const sanitizedFinalDetails = sanitizeFinalDetailsForSave(
      resolveFinalDetailsForSave(finalDetailsOverride || finalDetails, selectedPriestForScheduling),
    );
    setSaveError("");
    try {
      const requestBody = {
        checklist: payload,
      };
      if (taskUncheck && typeof taskUncheck === "object") {
        requestBody.taskUncheck = taskUncheck;
      }
      if (Number.isInteger(markAllStepIndex) && markAllStepIndex >= 0) {
        requestBody.markAllStepIndex = markAllStepIndex;
      }
      if (includeFinalDetails) {
        requestBody.finalDetails = sanitizedFinalDetails;
      }
      if (finalizeAppointment) {
        requestBody.finalizeAppointment = true;
      }
      const response = await fetch(`/admin-api/appointments/${appointmentID}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const responseData = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseData?.message || "Unable to save checklist.");
      const resolvedTemplateID = Number.isInteger(Number(responseData?.templateID))
        ? Number(responseData.templateID)
        : linkedTemplateID;
      setLinkedTemplateID(Number.isInteger(Number(resolvedTemplateID)) ? Number(resolvedTemplateID) : null);

      if (syncTemplate && Number.isInteger(Number(resolvedTemplateID)) && Number(resolvedTemplateID) > 0) {
        const templateSteps = buildTemplateStepsPayload(stepsOverride || checklistStepsRef.current);
        const templateResponse = await fetch(`/admin-api/progress-templates/${Number(resolvedTemplateID)}/steps`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steps: templateSteps }),
        });
        const templateResult = await templateResponse.json().catch(() => null);
        if (!templateResponse.ok) {
          throw new Error(templateResult?.message || "Checklist saved but template update failed.");
        }
      }
      const resolvedFinalDetails = mergeFinalDetailsPreservingLocal(
        responseData?.finalDetails || sanitizedFinalDetails,
        finalDetailsOverride || finalDetails,
      );
      setFinalDetails(resolvedFinalDetails);
      writeFinalDetailsDraft(appointmentID, resolvedFinalDetails);
      setProgressCompletionState({
        finishedAt: responseData?.finishedAt || null,
        pendingHistory: Boolean(responseData?.pendingHistory),
        historyEligibleAt: responseData?.historyEligibleAt || resolvedFinalDetails?.scheduledEventDateTime || null,
      });
      if (showNotice) {
        pushUiNotice(successNotice);
      }
      return { ok: true, data: responseData };
    } catch (error) {
      const errorMessage = error.message || "Unable to save checklist.";
      setSaveError(errorMessage);
      if (showNotice) {
        pushUiNotice(errorMessage, "error");
      }
      return { ok: false, errorMessage };
    }
  };

  useEffect(() => {
    if (!isEditMode) return undefined;
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return undefined;
    const timeoutId = window.setTimeout(() => {
      void markProgressSaved(appointmentID, false, {
        stepsOverride: checklistSteps,
        syncTemplate: true,
      });
    }, 280);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isEditMode, selectedProgressItem?.appointmentID, checklistSteps]);

  useEffect(() => {
    if (!isEditMode) return undefined;
    if (skipCheckedTasksAutosaveRef.current) {
      skipCheckedTasksAutosaveRef.current = false;
      return undefined;
    }
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return undefined;
    const timeoutId = window.setTimeout(() => {
      void markProgressSaved(appointmentID, false, {
        checkedTasksOverride: checkedTasks,
      });
    }, 280);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isEditMode, selectedProgressItem?.appointmentID, checkedTasks]);

  const findFirstIncompleteStepIndex = (steps, checkedMap, appointmentID) => {
    return steps.findIndex((step, stepIndex) =>
      step.tasks.some((_task, taskIndex) => {
        const key = buildChecklistKey(appointmentID, stepIndex, taskIndex);
        return !checkedMap[key];
      }),
    );
  };

  const handleConfirmDeleteTask = () => {
    if (!taskDeleteTarget) return;
    const { stepIndex, taskIndex } = taskDeleteTarget;
    setChecklistSteps((current) =>
      current.map((step, currentStepIndex) => {
        if (currentStepIndex !== stepIndex) return step;
        const nextTasks = step.tasks.filter((_existingTask, index) => index !== taskIndex);
        return {
          ...step,
          tasks: nextTasks.length > 0 ? nextTasks : ["New task"],
        };
      }),
    );
    if (selectedProgressItem?.appointmentID) {
      clearChecksForAppointment(selectedProgressItem.appointmentID);
      void markProgressSaved(selectedProgressItem.appointmentID, true, {
        successNotice: "Task deleted.",
      });
    }
    setTaskDeleteTarget(null);
  };

  const closeTaskCheckToggleModal = () => {
    setTaskCheckToggleTarget(null);
    setTaskUncheckReason("");
  };

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPaymentInvoiceInput("");
    setPaymentDateInput("");
    setPaymentReceiptFile(null);
    setPaymentFormError("");
  };

  const closePaymentUndoConfirmModal = () => {
    if (isUndoingPayment) return;
    setIsPaymentUndoConfirmOpen(false);
  };

  const handleUndoPayment = async () => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;

    setIsUndoingPayment(true);
    try {
      const response = await fetch(`/admin-api/appointments/${appointmentID}/progress/payment-records`, {
        method: "DELETE",
      });
      const responseText = await response.text();
      let payload = null;
      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const fallbackMessage =
          response.status === 404
            ? "Payment undo is unavailable. Restart the backend server, then try again."
            : "Unable to undo payment.";
        throw new Error(payload?.message || fallbackMessage);
      }

      setPaymentRecords(Array.isArray(payload?.paymentRecords) ? payload.paymentRecords : []);
      setPaymentStatus(String(payload?.paymentStatus || "unpaid").trim().toLowerCase() === "paid" ? "paid" : "unpaid");
      const resolvedTotalPayment = Number(payload?.totalPaymentAmount ?? payload?.finalDetails?.giftAmount ?? 0);
      setFinalDetails((current) => ({
        ...current,
        paymentFee: Number.isFinite(resolvedTotalPayment) ? Math.max(0, resolvedTotalPayment) : 0,
      }));
      pushUiNotice("Payment undone. This appointment is now marked as Unpaid and the requester has been notified.");
      setIsPaymentUndoConfirmOpen(false);
    } catch (error) {
      pushUiNotice(error.message || "Unable to undo payment.", "error");
    } finally {
      setIsUndoingPayment(false);
    }
  };

  const handleSavePaymentRecord = async () => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    const invoiceNumber = String(paymentInvoiceInput || "").trim();
    const paymentDate = String(paymentDateInput || "").trim();

    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;
    if (!invoiceNumber) {
      setPaymentFormError("Invoice or receipt number is required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setPaymentFormError("Date of payment is required.");
      return;
    }
    if (paymentDate > getTodayPaymentDateKey()) {
      setPaymentFormError("Date of payment cannot be in the future.");
      return;
    }

    setIsSavingPaymentRecord(true);
    setPaymentFormError("");
    try {
      const formData = new FormData();
      formData.append("invoiceNumber", invoiceNumber);
      formData.append("paymentDate", paymentDate);
      formData.append("stepIndex", String(safeActiveStepIndex));
      formData.append("adminID", String(user?.adminID || 1));
      if (paymentReceiptFile) {
        formData.append("receiptFile", paymentReceiptFile);
      }
      if (isPaymentMarkedPaid) {
        formData.append("editExisting", "true");
      }

      const response = await fetch(`/admin-api/appointments/${appointmentID}/progress/payment-records`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || (isPaymentMarkedPaid ? "Unable to update payment." : "Unable to record payment."));
      }

      setPaymentRecords(Array.isArray(payload?.paymentRecords) ? payload.paymentRecords : []);
      setPaymentStatus(String(payload?.paymentStatus || "paid").trim().toLowerCase() === "paid" ? "paid" : "unpaid");
      const resolvedTotalPayment = Number(payload?.totalPaymentAmount ?? payload?.finalDetails?.giftAmount ?? 0);
      setFinalDetails((current) => ({
        ...current,
        paymentFee: Number.isFinite(resolvedTotalPayment) ? Math.max(0, resolvedTotalPayment) : 0,
      }));
      pushUiNotice(
        isPaymentMarkedPaid
          ? "Payment updated. The invoice and receipt details were saved."
          : "Payment recorded. This appointment is now marked as Paid.",
      );
      closePaymentModal();
    } catch (error) {
      setPaymentFormError(error.message || "Unable to record payment.");
    } finally {
      setIsSavingPaymentRecord(false);
    }
  };

  const handleConfirmTaskCheckToggle = async () => {
    if (!taskCheckToggleTarget || !selectedProgressItem?.appointmentID) return;
    const { stepIndex, taskIndex, isNextChecked } = taskCheckToggleTarget;
    const trimmedUncheckReason = String(taskUncheckReason || "").trim();
    if (!isNextChecked && trimmedUncheckReason.length < 3) {
      pushUiNotice("Please provide a reason for unchecking this task.", "error");
      return;
    }

    const appointmentID = selectedProgressItem.appointmentID;
    const checklistKey = buildChecklistKey(appointmentID, stepIndex, taskIndex);
    const previousCheckedTasks = { ...checkedTasksRef.current };
    const nextCheckedTasks = {
      ...checkedTasksRef.current,
      [checklistKey]: isNextChecked,
    };

    if (isNextChecked) {
      const selectedStep = checklistSteps[stepIndex];
      const selectedStepTasks = Array.isArray(selectedStep?.tasks) ? selectedStep.tasks : [];
      const currentStepDone =
        selectedStepTasks.length > 0 &&
        selectedStepTasks.every((_task, index) => {
          const key = buildChecklistKey(appointmentID, stepIndex, index);
          return Boolean(nextCheckedTasks[key]);
        });
      if (currentStepDone) {
        const nextIncompleteStep = findFirstIncompleteStepIndex(checklistSteps, nextCheckedTasks, appointmentID);
        if (nextIncompleteStep !== -1 && nextIncompleteStep !== stepIndex) {
          setActiveStepIndex(nextIncompleteStep);
        }
      }
    }

    skipCheckedTasksAutosaveRef.current = true;
    setCheckedTasks(nextCheckedTasks);
    const saveOptions = {
      checkedTasksOverride: nextCheckedTasks,
      successNotice: isNextChecked ? "Task marked as completed." : "Task unchecked. The requester has been notified.",
    };
    if (!isNextChecked) {
      const selectedStep = checklistSteps[stepIndex];
      saveOptions.taskUncheck = {
        stepIndex,
        taskIndex,
        stepTitle: String(selectedStep?.title || "").trim(),
        taskLabel: String(taskCheckToggleTarget.label || "").trim() || "this task",
        reason: trimmedUncheckReason,
      };
      taskUncheckMetaRef.current = {
        ...taskUncheckMetaRef.current,
        [checklistKey]: {
          lastUncheckReason: trimmedUncheckReason,
          lastUncheckedAt: new Date().toISOString(),
        },
      };
    } else if (taskUncheckMetaRef.current[checklistKey]) {
      const nextUncheckMeta = { ...taskUncheckMetaRef.current };
      delete nextUncheckMeta[checklistKey];
      taskUncheckMetaRef.current = nextUncheckMeta;
    }
    const saveResult = await markProgressSaved(appointmentID, true, saveOptions);
    if (!saveResult?.ok) {
      setCheckedTasks(previousCheckedTasks);
    }
    closeTaskCheckToggleModal();
  };

  const handleMarkAllAsDone = async () => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;

    const previousCheckedTasks = { ...checkedTasksRef.current };
    const nextCheckedTasks = { ...checkedTasksRef.current };
    const currentStepTasks = Array.isArray(checklistSteps[safeActiveStepIndex]?.tasks)
      ? checklistSteps[safeActiveStepIndex].tasks
      : [];
    for (const [taskIndex] of currentStepTasks.entries()) {
      nextCheckedTasks[buildChecklistKey(appointmentID, safeActiveStepIndex, taskIndex)] = true;
    }

    setCheckedTasks(nextCheckedTasks);
    const saveResult = await markProgressSaved(appointmentID, true, {
      checkedTasksOverride: nextCheckedTasks,
      successNotice: "All tasks in this step marked as completed.",
      markAllStepIndex: safeActiveStepIndex,
    });
    if (!saveResult?.ok) {
      setCheckedTasks(previousCheckedTasks);
    }
  };

  const handleOpenScheduleModal = ({ preservePickedDate = false } = {}) => {
    const priestID = Number(finalDetails.conductedPriestID) || Number(selectedPriestForScheduling);
    if (Number.isInteger(priestID) && priestID > 0) {
      setSelectedPriestForScheduling(String(priestID));
    }
    const localDateTime = toDateTimeLocalValue(finalDetails.scheduledEventDateTime);
    const [datePart = "", timePart = ""] = localDateTime.split("T");
    let monthSource = "";
    if (datePart) {
      monthSource = datePart;
      setScheduleDateInput(datePart);
      setScheduleTimeInput(timePart);
      setScheduleEndTimeInput(timePart ? addOneHourToTime(timePart) : "");
    } else if (!preservePickedDate) {
      setScheduleDateInput("");
      setScheduleTimeInput("");
      setScheduleEndTimeInput("");
      monthSource = getScheduleDatePolicy(effectiveScheduleMinAdvanceDays).minSelectableDateKey;
    } else {
      monthSource = String(scheduleDateInput || "").trim() || getScheduleDatePolicy(effectiveScheduleMinAdvanceDays).minSelectableDateKey;
      setScheduleTimeInput("");
      setScheduleEndTimeInput("");
    }
    const pickedDate = new Date(`${monthSource}T00:00:00`);
    if (!Number.isNaN(pickedDate.getTime())) {
      setPriestCalendarMonth(new Date(pickedDate.getFullYear(), pickedDate.getMonth(), 1));
    }
    setFinalDetailsError("");
    setRemoteDayAvailability(null);
    setIsScheduleModalOpen(true);
    void refreshCalendarEntries();
  };

  const handleStartPriestSelectionFlow = () => {
    handleStartDateTimeSchedulingFlow();
  };

  const handleStartDateTimeSchedulingFlow = () => {
    if (!canSetEventSchedule) {
      setFinalDetailsError("Record payment first. Date and time can be set after this appointment is marked paid.");
      return;
    }
    const priestID = Number(finalDetails.conductedPriestID);
    setSelectedPriestForScheduling(Number.isInteger(priestID) && priestID > 0 ? String(priestID) : "");
    handleOpenScheduleModal();
  };

  const handleConfirmPriestSelection = async () => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;
    const priestID = Number(selectedPriestForScheduling);
    if (!Number.isInteger(priestID) || priestID <= 0) {
      setPriestSelectionError("Please select a priest before continuing.");
      return;
    }
    if (!String(scheduleDateInput || "").trim()) {
      setPriestSelectionError("Please pick a date from the priest calendar before continuing.");
      return;
    }
    if (isScheduleDateLocked(scheduleDateInput, scheduleDatePolicy.minSelectableDateKey)) {
      setPriestSelectionError(
        `Selected date is locked. Choose ${scheduleDatePolicy.minSelectableDateLabel} or later. ${scheduleDatePolicy.minAdvanceDays}-day interval through ${scheduleDatePolicy.lockedThroughDateLabel} is locked.`,
      );
      return;
    }
    if (isSelectedDateDayOff) {
      setPriestSelectionError("Selected date is marked as day off. Please choose another date.");
      return;
    }
    const nextFinalDetails = {
      ...finalDetails,
      conductedPriestID: priestID,
    };
    setFinalDetails(nextFinalDetails);
    writeFinalDetailsDraft(appointmentID, nextFinalDetails);
    setIsAssigningPriest(true);
    setPriestSelectionError("");
    const saveResult = await markProgressSaved(appointmentID, true, {
      finalDetailsOverride: nextFinalDetails,
      includeFinalDetails: true,
      successNotice: "Priest assigned. Continue with event date and time.",
    });
    if (!saveResult?.ok) {
      setPriestSelectionError("Saved in this screen, but backend save failed. Please click Confirm again.");
      setIsAssigningPriest(false);
      return;
    }
    const persistedFinalDetails = mergeFinalDetailsPreservingLocal(saveResult?.data?.finalDetails, nextFinalDetails);
    setFinalDetails(persistedFinalDetails);
    writeFinalDetailsDraft(appointmentID, persistedFinalDetails);
    syncLastSavedEventDetails(persistedFinalDetails);
    setIsAssigningPriest(false);
    setIsPriestSelectionModalOpen(false);
    handleOpenScheduleModal({ preservePickedDate: true });
  };

  const findLinkedPriestScheduleEntry = () => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return null;
    return (
      (Array.isArray(calendarEntries) ? calendarEntries : []).find(
        (entry) => Number(entry?.appointmentID) === appointmentID,
      ) || null
    );
  };

  const handleDeleteLinkedPriestScheduleEntry = async () => {
    const linkedEntry = findLinkedPriestScheduleEntry();
    const entryID = Number(linkedEntry?.id);
    const adminID = Number(user?.adminID);
    if (!Number.isInteger(entryID) || entryID <= 0) return;
    if (!Number.isInteger(adminID) || adminID <= 0) {
      throw new Error("Unable to detect admin account.");
    }
    const response = await fetch(`/admin-api/calendar-entries/${entryID}?adminID=${adminID}`, { method: "DELETE" });
    const responseData = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responseData?.message || "Unable to remove the previous priest schedule.");
    }
  };

  const syncLastSavedEventDetails = (details) => {
    const normalized = normalizeFinalDetailsFromApi(details);
    lastSavedEventDetailsRef.current = {
      conductedPriestID: normalized.conductedPriestID,
      scheduledEventDateTime: normalized.scheduledEventDateTime || "",
    };
  };

  const handleSelectScheduleDateFromCalendar = (dateString) => {
    if (isScheduleDateLocked(dateString, scheduleDatePolicy.minSelectableDateKey)) {
      setFinalDetailsError(
        `Dates through ${scheduleDatePolicy.lockedThroughDateLabel} are locked. Choose ${scheduleDatePolicy.minSelectableDateLabel} or later (${scheduleDatePolicy.minAdvanceDays}-day interval).`,
      );
      return;
    }
    setScheduleDateInput(dateString);
    setScheduleTimeInput("");
    setScheduleEndTimeInput("");
    if (finalDetailsError) setFinalDetailsError("");
    if (isScheduleModalOpen) {
      return;
    }
    setIsPriestCalendarModalOpen(false);
    if (pendingScheduleAfterPriestChangeRef.current) {
      pendingScheduleAfterPriestChangeRef.current = false;
      handleOpenScheduleModal({ preservePickedDate: true });
      return;
    }
    if (reopenScheduleModalAfterCalendarRef.current) {
      reopenScheduleModalAfterCalendarRef.current = false;
      handleOpenScheduleModal({ preservePickedDate: true });
    }
  };

  const handlePersistPriestScheduleEntry = async (appointmentID, priestID, eventDate, startTime, endTime) => {
    const adminID = Number(user?.adminID);
    if (!Number.isInteger(adminID) || adminID <= 0) {
      throw new Error("Unable to detect admin account.");
    }
    const payload = {
      adminID,
      appointmentID,
    };
    const response = await fetch("/admin-api/calendar-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseData = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responseData?.message || "Unable to save priest calendar schedule.");
    }
    return responseData;
  };

  const handleConfirmScheduleDateTime = async () => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return;
    const assignedPriestID =
      Number(selectedPriestForScheduling) > 0
        ? Number(selectedPriestForScheduling)
        : Number(finalDetails.conductedPriestID);
    if (!Number.isInteger(assignedPriestID) || assignedPriestID <= 0) {
      setFinalDetailsError("Please assign a priest before setting schedule date and time.");
      return;
    }
    if (!scheduleDateInput) {
      setFinalDetailsError("Please choose a date from the priest calendar.");
      return;
    }
    if (isSelectedDateDayOff || (remoteDayAvailability?.date === scheduleDateInput && remoteDayAvailability.isDayOff)) {
      setFinalDetailsError("Selected date is marked as day off. Please choose another date.");
      return;
    }
    if (isScheduleDateLocked(scheduleDateInput, scheduleDatePolicy.minSelectableDateKey)) {
      setFinalDetailsError(
        `Selected date is locked. Choose ${scheduleDatePolicy.minSelectableDateLabel} or later. ${scheduleDatePolicy.minAdvanceDays}-day interval through ${scheduleDatePolicy.lockedThroughDateLabel} is locked.`,
      );
      return;
    }
    if (!scheduleTimeInput || !scheduleEndTimeInput) {
      setFinalDetailsError("Please choose an available 1-hour time slot.");
      return;
    }
    const selectedSlot = availableScheduleSlots.find(
      (slot) => slot.startTime === scheduleTimeInput && slot.endTime === scheduleEndTimeInput,
    );
    if (!selectedSlot) {
      setFinalDetailsError("Selected time conflicts with this priest's existing schedule. Choose another slot.");
      return;
    }
    if (isScheduleSlotInThePast(scheduleDateInput, scheduleTimeInput)) {
      setFinalDetailsError("That time has already passed. Choose a later date or a later time slot.");
      return;
    }
    const manualCombinedDateTime = `${scheduleDateInput}T${scheduleTimeInput}`;
    const parsedDate =
      parseScheduleDateTimeInput(manualCombinedDateTime) ||
      parseScheduleDateTimeInput(`${scheduleDateInput} ${scheduleTimeInput}`);
    if (!parsedDate) {
      setFinalDetailsError("Please set a valid event date and time.");
      return;
    }
    const startMinutes = timeStringToMinutes(scheduleTimeInput);
    const endMinutes = timeStringToMinutes(scheduleEndTimeInput);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      setFinalDetailsError("Please choose a valid 1-hour time slot.");
      return;
    }
    const nextPriestName =
      priestOptions.find((priest) => Number(priest.priestID) === assignedPriestID)?.fullName ||
      String(finalDetails.priestName || "").trim();
    const nextFinalDetails = {
      ...finalDetails,
      conductedPriestID: assignedPriestID,
      priestName: nextPriestName,
      scheduledEventDateTime: parsedDate.toISOString(),
    };
    setFinalDetails(nextFinalDetails);
    writeFinalDetailsDraft(appointmentID, nextFinalDetails);
    setFinalDetailsError("");
    setIsSavingScheduleDateTime(true);
    const saveResult = await markProgressSaved(appointmentID, true, {
      finalDetailsOverride: nextFinalDetails,
      includeFinalDetails: true,
      successNotice: "",
    });
    if (!saveResult?.ok) {
      setFinalDetailsError("Saved in this screen, but backend save failed. Please click Confirm again.");
      setIsSavingScheduleDateTime(false);
      return;
    }
    try {
      await handlePersistPriestScheduleEntry(
        appointmentID,
        assignedPriestID,
        scheduleDateInput,
        scheduleTimeInput,
        scheduleEndTimeInput,
      );
    } catch (error) {
      setFinalDetailsError(error.message || "Unable to save priest calendar schedule.");
      setIsSavingScheduleDateTime(false);
      return;
    }
    const persistedFinalDetails = mergeFinalDetailsPreservingLocal(saveResult?.data?.finalDetails, nextFinalDetails);
    setFinalDetails(persistedFinalDetails);
    writeFinalDetailsDraft(appointmentID, persistedFinalDetails);
    syncLastSavedEventDetails(persistedFinalDetails);
    const nextCompletionState = {
      finishedAt: saveResult?.data?.finishedAt || null,
      pendingHistory: Boolean(saveResult?.data?.pendingHistory),
      historyEligibleAt: saveResult?.data?.historyEligibleAt || persistedFinalDetails.scheduledEventDateTime || null,
    };
    setProgressCompletionState(nextCompletionState);
    await refreshCalendarEntries();
    setIsScheduleModalOpen(false);
    setIsSavingScheduleDateTime(false);
    if (nextCompletionState.finishedAt) {
      pushUiNotice("Event schedule updated. This appointment is now in history.");
      navigate("/admin/history", { replace: true });
      return;
    }
    const scheduleNotice = nextCompletionState.pendingHistory
      ? `Event schedule updated. History will unlock after ${formatDateTime(nextCompletionState.historyEligibleAt)}.`
      : finalDetails.scheduledEventDateTime
        ? "Event schedule updated."
        : "Next event schedule saved.";
    pushUiNotice(scheduleNotice);
    setIsScheduleModalOpen(false);
    setIsSavingScheduleDateTime(false);
    window.setTimeout(() => {
      finalStepCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const handleApplyPreferredSchedule = async () => {
    const appointmentID = Number(selectedProgressItem?.appointmentID);
    const remarkID = Number(pendingScheduleRemark?.remarkID);
    const adminID = Number(user?.adminID);
    const preferredDate = String(pendingScheduleRemark?.preferredDate || "").trim();
    const preferredTime = normalizeTimeToHHMM(pendingScheduleRemark?.preferredTime);
    const preferredPriestID = Number(pendingScheduleRemark?.preferredPriestID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0 || !Number.isInteger(remarkID) || remarkID <= 0) {
      setScheduleRemarkError("Unable to identify this preferred schedule request.");
      return;
    }
    if (!Number.isInteger(adminID) || adminID <= 0) {
      setScheduleRemarkError("Unable to detect admin account.");
      return;
    }
    if (
      pendingScheduleRemark?.decision !== "preferred" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) ||
      !preferredTime ||
      !Number.isInteger(preferredPriestID) ||
      preferredPriestID <= 0
    ) {
      setScheduleRemarkError("This request is missing a valid preferred date, time, or priest.");
      return;
    }

    setIsApplyingPreferredSchedule(true);
    setScheduleRemarkError("");
    try {
      const response = await fetch(
        `/admin-api/appointments/${appointmentID}/schedule-remarks/${remarkID}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminID, applyPreferred: true }),
        },
      );
      const responseData = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseData?.message || "Unable to apply the preferred schedule.");
      }

      const preferredStart = new Date(`${preferredDate}T${preferredTime}:00+08:00`);
      const preferredEnd = new Date(preferredStart.getTime() + SCHEDULE_SLOT_DURATION_MINUTES * 60 * 1000);
      const nextFinalDetails = {
        ...finalDetails,
        conductedPriestID: preferredPriestID,
        priestName: String(pendingScheduleRemark.preferredPriestName || "").trim(),
        scheduledEventDateTime: preferredStart.toISOString(),
        scheduledEventEndDateTime: preferredEnd.toISOString(),
      };
      setFinalDetails(nextFinalDetails);
      setSelectedPriestForScheduling(String(preferredPriestID));
      writeFinalDetailsDraft(appointmentID, nextFinalDetails);
      syncLastSavedEventDetails(nextFinalDetails);

      const updatedRemarks = Array.isArray(responseData?.remarks) ? responseData.remarks : [];
      setScheduleRemarks(updatedRemarks);
      setPendingScheduleRemark(updatedRemarks.find((item) => item.status === "pending") || null);
      setIsPreferredScheduleConfirmOpen(false);
      await refreshCalendarEntries();
      pushUiNotice("The preferred date, time, and priest were applied successfully.");
    } catch (error) {
      setScheduleRemarkError(error.message || "Unable to apply the preferred schedule.");
    } finally {
      setIsApplyingPreferredSchedule(false);
    }
  };

  const handleChangeEventSchedule = () => {
    handleStartDateTimeSchedulingFlow();
  };

  const priestCalendarMonthLabel = priestCalendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const priestCalendarFirstDayIndex = new Date(priestCalendarMonth.getFullYear(), priestCalendarMonth.getMonth(), 1).getDay();
  const priestCalendarDaysInMonth = new Date(priestCalendarMonth.getFullYear(), priestCalendarMonth.getMonth() + 1, 0).getDate();
  const priestCalendarTodayKey = getManilaDateKey();
  const scheduleDatePolicy = (() => {
    const basePolicy = getScheduleDatePolicy(effectiveScheduleMinAdvanceDays);
    let minSelectableDateKey = basePolicy.minSelectableDateKey;
    for (let index = 0; index < 21; index += 1) {
      const candidate = new Date(`${minSelectableDateKey}T00:00:00`);
      if (Number.isNaN(candidate.getTime())) break;
      const isDayOff =
        dayOffSpecificDates.includes(minSelectableDateKey) ||
        (Number.isInteger(dayOffWeekday) && candidate.getDay() === dayOffWeekday);
      if (!isDayOff) break;
      minSelectableDateKey = addDaysToDateKey(1, candidate);
    }
    return {
      ...basePolicy,
      minSelectableDateKey,
      minSelectableDateLabel: formatLongDate(minSelectableDateKey),
    };
  })();
  const priestCalendarEntriesByDate = selectedPriestScheduleEntries.reduce((accumulator, entry) => {
    const dateKey = toEventDateKey(entry?.eventDate);
    if (!dateKey) return accumulator;
    accumulator[dateKey] = accumulator[dateKey] || [];
    accumulator[dateKey].push(entry);
    return accumulator;
  }, {});
  const assignedAppointmentPriestID = Number(finalDetails.conductedPriestID);
  const assignedAppointmentPriestName =
    Number.isInteger(assignedAppointmentPriestID) && assignedAppointmentPriestID > 0
      ? priestOptions.find((priest) => Number(priest.priestID) === assignedAppointmentPriestID)?.fullName ||
        String(finalDetails.priestName || "").trim()
      : "";
  const assignedSchedulePriestID = Number(selectedPriestForScheduling) || Number(finalDetails.conductedPriestID);
  const assignedSchedulePriestName =
    priestOptions.find((priest) => Number(priest.priestID) === assignedSchedulePriestID)?.fullName ||
    remoteDayAvailability?.priestName ||
    assignedAppointmentPriestName ||
    "Selected priest";
  const scheduleDayExistingEntries = scheduleModalDayEntries.filter(
    (entry) => Number(entry?.id) !== linkedPriestScheduleEntryId,
  );
  const isScheduleDayOff = Boolean(remoteDayAvailability?.date === scheduleDateInput && remoteDayAvailability.isDayOff) ||
    isSelectedDateDayOff;
  const isScheduleDayLocked = Boolean(remoteDayAvailability?.date === scheduleDateInput && remoteDayAvailability.isLocked);

  const renderPriestCalendarGrid = (onSelectDate) => (
    <>
      <p className="progress-priest-calendar-policy-note">
        {scheduleDatePolicy.minAdvanceDays > 0 ? (
          <>
            Today through the next {scheduleDatePolicy.minAdvanceDays} {scheduleDatePolicy.minAdvanceDays === 1 ? "day" : "days"} are locked (
            {scheduleDatePolicy.todayKey === scheduleDatePolicy.lockedThroughDateKey
              ? scheduleDatePolicy.lockedThroughDateLabel
              : `${formatLongDate(scheduleDatePolicy.todayKey)} - ${scheduleDatePolicy.lockedThroughDateLabel}`}
            ). Days off stay unavailable. Earliest selectable date: <strong>{scheduleDatePolicy.minSelectableDateLabel}</strong>.
          </>
        ) : (
          <>
            Past times and dates stay unavailable. Earliest selectable date: <strong>{scheduleDatePolicy.minSelectableDateLabel}</strong>.
          </>
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
          <span key={`calendar-head-${dayName}`} className="progress-priest-calendar-day-name">
            {dayName}
          </span>
        ))}
        {Array.from({ length: priestCalendarFirstDayIndex }).map((_, index) => (
          <span key={`calendar-empty-${index}`} className="progress-priest-calendar-date-cell is-empty" />
        ))}
        {Array.from({ length: priestCalendarDaysInMonth }).map((_, index) => {
          const dayNumber = index + 1;
          const dateKey = `${priestCalendarMonth.getFullYear()}-${String(priestCalendarMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
          const entryCount = (priestCalendarEntriesByDate[dateKey] || []).length;
          const dateDayOfWeek = new Date(
            priestCalendarMonth.getFullYear(),
            priestCalendarMonth.getMonth(),
            dayNumber,
          ).getDay();
          const isDayOff = dayOffSpecificDates.includes(dateKey) || (Number.isInteger(dayOffWeekday) && dayOffWeekday === dateDayOfWeek);
          const isLockedDate = isScheduleDateLocked(dateKey, scheduleDatePolicy.minSelectableDateKey);
          const isHalfDay = !isDayOff && Boolean(halfDaySetting) && halfDaySetting.weekday === dateDayOfWeek;
          return (
            <button
              key={`calendar-date-${dateKey}`}
              type="button"
              className={`progress-priest-calendar-date-cell ${isDayOff ? "is-day-off" : isLockedDate ? "is-locked" : entryCount > 0 ? "is-busy" : "is-free"}${
                isHalfDay && !isLockedDate ? " is-half-day" : ""
              } ${
                !isDayOff && !isLockedDate && scheduleDateInput === dateKey ? "is-selected" : ""
              } ${!isDayOff && !isLockedDate && priestCalendarTodayKey === dateKey ? "is-today" : ""}`}
              onClick={() => {
                if (isDayOff || isLockedDate) return;
                onSelectDate(dateKey);
              }}
              disabled={isDayOff || isLockedDate}
              aria-label={
                isDayOff
                  ? `${dayNumber}, day off`
                  : isLockedDate
                    ? `${dayNumber}, locked`
                    : `${dayNumber}, ${entryCount > 0 ? "with schedule" : "free"}`
              }
            >
              <span>{dayNumber}</span>
              {isDayOff ? (
                <small>Off</small>
              ) : isLockedDate ? (
                <small>Locked</small>
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
        {halfDaySetting ? <span><i className="is-half-day" /> Half day</span> : null}
        <span><i className="is-locked" /> Locked</span>
      </div>
    </>
  );

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
          <section className="dashboard-panel dashboard-hero progress-details-header">
            <div className="progress-details-hero-copy">
              <h2>Progress Checklist</h2>
            </div>
            <button
              type="button"
              className="progress-back-button progress-details-hero-action"
              onClick={() => {
                const fromProgram = Number(location.state?.fromProgram);
                if (Number.isInteger(fromProgram) && fromProgram > 0) {
                  navigate(`/admin/progress-tracker/program/${fromProgram}`);
                  return;
                }
                navigate("/admin/progress-tracker");
              }}
            >
              {Number(location.state?.fromProgram) > 0 ? "Back to Checklist" : "Back"}
            </button>
          </section>

          <section className="dashboard-panel progress-details-panel">
            {loadError ? (
              <p className="appointment-requests-empty">{loadError}</p>
            ) : isLoading ? (
              <p className="appointment-requests-empty">Loading request details...</p>
            ) : !selectedProgressItem ? (
              <p className="appointment-requests-empty">Request details not available.</p>
            ) : (
              <>
                {pendingUserChangeRequest ? (
                  <div className={`progress-change-request-banner is-${pendingUserChangeRequest.requestType}`} role="status">
                    <span className="progress-change-request-banner-icon" aria-hidden="true">
                      <CalendarX2 size={18} strokeWidth={2.2} />
                    </span>
                    <div className="progress-change-request-banner-copy">
                      <strong>
                        {pendingUserChangeRequest.requestType === "restore"
                          ? "The requester asked to restore this appointment"
                          : "The requester asked to cancel this appointment"}
                      </strong>
                      {pendingUserChangeRequest.reason ? <span>Reason: {pendingUserChangeRequest.reason}</span> : null}
                    </div>
                    <button
                      type="button"
                      className="progress-change-request-banner-action"
                      onClick={() => navigate("/admin/progress-tracker/cancellation-requests")}
                    >
                      Review Request
                    </button>
                  </div>
                ) : null}
                <header className="progress-main-header progress-main-header--with-actions">
                  <div className="progress-main-header-copy">
                    <p className="progress-main-header-service-row">
                      <span className="progress-service-type-label">Service Type :</span>{" "}
                      {Number(selectedProgressItem.s_sacramentID) > 0 ? (
                        <>
                          <strong className="progress-service-name">
                            {selectedProgressItem.sacramentName || "Special Sacrament"}
                          </strong>
                          {selectedProgressItem.sacramentalType ? (
                            <span className="progress-service-alias"> ({selectedProgressItem.sacramentalType})</span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <strong className="progress-service-name">{selectedProgressItem.sacramentalType}</strong>
                          {blessingTypeDetail ? (
                            <span className="progress-service-alias"> ({blessingTypeDetail})</span>
                          ) : null}
                        </>
                      )}
                      {showsPaymentStatus ? (
                        <span
                          className={`progress-payment-status-badge ${displayPaymentStatusClass}`}
                          aria-label={`Payment status: ${displayPaymentStatusLabel}`}
                        >
                          {displayPaymentStatusLabel}
                        </span>
                      ) : null}
                    </p>
                    {checklistSteps.length > 0 ? (
                      <section className="progress-stepper-wrap progress-stepper-wrap--inline" aria-label="Progress steps">
                        <ol className="progress-stepper-row">
                          {checklistSteps.map((step, stepIndex) => {
                            const stepTotal = step.tasks.length;
                            const stepCompleted = step.tasks.reduce((sum, _task, taskIndex) => {
                              const checklistKey = buildChecklistKey(selectedProgressItem.appointmentID, stepIndex, taskIndex);
                              return sum + (checkedTasks[checklistKey] ? 1 : 0);
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
                        <div className="progress-stepper-legend" aria-hidden="true">
                          <span><i className="dot is-done" /> Done / Checked</span>
                          <span><i className="dot is-ongoing" /> Ongoing</span>
                          <span><i className="dot is-not-started" /> Not Started</span>
                        </div>
                      </section>
                    ) : null}
                  </div>
                  <div className="progress-main-header-actions">
                  <button
                    type="button"
                    className="progress-record-payment-button progress-see-more-button is-paid-recorded"
                    onClick={() => setIsAppointmentDetailsOpen(true)}
                  >
                    <Eye size={14} aria-hidden="true" />
                    See More
                  </button>
                  {canRecordPayment ? (
                    <button
                      type="button"
                      className={`progress-record-payment-button${isPaymentMarkedPaid ? " is-paid-recorded" : ""}`}
                      onClick={() => {
                        const latestRecord = activePaymentRecords[activePaymentRecords.length - 1];
                        setPaymentInvoiceInput(
                          isPaymentMarkedPaid ? String(latestRecord?.invoiceNumber || "").trim() : "",
                        );
                        setPaymentDateInput(
                          (isPaymentMarkedPaid && String(latestRecord?.paymentDate || "").trim()) || getTodayPaymentDateKey(),
                        );
                        setPaymentReceiptFile(null);
                        setPaymentFormError("");
                        setIsPaymentModalOpen(true);
                      }}
                    >
                      <Receipt size={14} aria-hidden="true" />
                      {isPaymentMarkedPaid ? "Edit / Undo Payment" : "Record Payment"}
                    </button>
                  ) : null}
                  </div>
                </header>
                {saveError ? <p className="appointment-requests-empty">{saveError}</p> : null}

                <div className="progress-request-overview progress-request-overview--context" aria-label="Request overview">
                  <article className="progress-request-overview-item">
                    <span className="progress-request-overview-icon" aria-hidden="true">
                      <User size={16} strokeWidth={2.2} />
                    </span>
                    <div className="progress-request-overview-copy">
                      <p className="progress-request-overview-label">Requester</p>
                      <p className="progress-request-overview-value">
                        {selectedProgressItem.requesterFullName || "Unknown Account"}
                      </p>
                    </div>
                  </article>
                  <article className="progress-request-overview-item">
                    <span className="progress-request-overview-icon" aria-hidden="true">
                      <CalendarDays size={16} strokeWidth={2.2} />
                    </span>
                    <div className="progress-request-overview-copy">
                      <p className="progress-request-overview-label">Requested Date</p>
                      <p className="progress-request-overview-value">{formatDateTime(selectedProgressItem.createdAt)}</p>
                    </div>
                  </article>
                  {isSpecialProgram || hasScheduledDateTime ? (
                    <article className="progress-request-overview-item">
                      <span className="progress-request-overview-icon" aria-hidden="true">
                        <CalendarClock size={16} strokeWidth={2.2} />
                      </span>
                      <div className="progress-request-overview-copy">
                        <p className="progress-request-overview-label">Event Schedule</p>
                        <p className="progress-request-overview-value">
                          {hasScheduledDateTime
                            ? formatEventScheduleRange(
                                finalDetails.scheduledEventDateTime,
                                finalDetails.scheduledEventEndDateTime,
                                finalDetails.programTimeSlots,
                              )
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
                  {showsPaymentStatus ? (
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
                </div>

                {checklistSteps.length > 0 ? null : (
                  <section className="progress-empty-template-state" role="status" aria-live="polite">
                    <span className="progress-empty-template-icon" aria-hidden="true">
                      <AlertTriangle size={24} />
                    </span>
                    <h3>No steps available</h3>
                    <p>This request has no checklist template yet.</p>
                    <button type="button" className="progress-secondary-button" onClick={() => navigate("/admin/progress-templates")}>
                      Add a Template
                    </button>
                  </section>
                )}

                {activeStep ? (
                  <article className="progress-step-card">
                    <header className="progress-step-header">
                      <div className="progress-step-heading">
                        <h3>
                          Step {safeActiveStepIndex + 1}: {String(activeStep.title || "").toUpperCase()}
                        </h3>
                      </div>
                      <div className="progress-step-header-actions">
                        <button
                          type="button"
                          className="progress-edit-button"
                          onClick={handleMarkAllAsDone}
                          disabled={activeStepTaskCount === 0 || activeStepCompletedCount >= activeStepTaskCount}
                        >
                          Mark All as Done
                        </button>
                      </div>
                    </header>
                    {isEditMode ? (
                      <div className="progress-edit-toolbar" role="note" aria-label="Editing instructions">
                        <span>Tip: edit task text and use the action buttons below to manage tasks and steps.</span>
                      </div>
                    ) : null}
                    {isEditMode ? (
                      <div className="progress-edit-actions">
                        <button
                          type="button"
                          className="progress-secondary-button"
                          onClick={() => {
                            setChecklistSteps((current) =>
                              current.map((step, index) =>
                                index === safeActiveStepIndex
                                  ? { ...step, tasks: [...step.tasks, ""] }
                                  : step,
                              ),
                            );
                            setIsTextEditingEnabled(true);
                            clearChecksForAppointment(selectedProgressItem.appointmentID);
                            void markProgressSaved(selectedProgressItem.appointmentID, true, {
                              successNotice: "New task added.",
                            });
                          }}
                        >
                          Add New Task
                        </button>
                        <button
                          type="button"
                          className="progress-secondary-button"
                          onClick={() => {
                            setChecklistSteps((current) => [
                              ...current,
                              { title: `Step ${current.length + 1}`, tasks: ["New task 1"] },
                            ]);
                            setActiveStepIndex(checklistSteps.length);
                            clearChecksForAppointment(selectedProgressItem.appointmentID);
                            void markProgressSaved(selectedProgressItem.appointmentID, true, {
                              successNotice: "New step added.",
                            });
                          }}
                        >
                          Add New Step
                        </button>
                      </div>
                    ) : null}
                    <ul className="progress-task-list">
                      {activeStep.tasks.map((task, taskIndex) => {
                        const checklistKey = buildChecklistKey(selectedProgressItem.appointmentID, safeActiveStepIndex, taskIndex);
                        const isChecked = Boolean(checkedTasks[checklistKey]);
                        return (
                          <li key={checklistKey}>
                            <label
                              className={`progress-task-item ${isChecked ? "is-checked" : ""} ${
                                isEditMode && isTextEditingEnabled ? "is-editing" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(event) => {
                                  setTaskCheckToggleTarget({
                                    stepIndex: safeActiveStepIndex,
                                    taskIndex,
                                    isNextChecked: event.target.checked,
                                    label: String(task || "").trim() || "this task",
                                  });
                                }}
                              />
                              {isEditMode && isTextEditingEnabled ? (
                                <input
                                  type="text"
                                  className="progress-inline-input"
                                  value={task}
                                  autoFocus={taskIndex === activeStep.tasks.length - 1 && String(task || "").trim() === ""}
                                  onChange={(event) => {
                                    const nextTask = toTitleCaseInput(event.target.value);
                                    setChecklistSteps((current) =>
                                      current.map((step, stepIndex) => {
                                        if (stepIndex !== safeActiveStepIndex) return step;
                                        return {
                                          ...step,
                                          tasks: step.tasks.map((existingTask, index) =>
                                            index === taskIndex ? nextTask : existingTask,
                                          ),
                                        };
                                      }),
                                    );
                                  }}
                                />
                              ) : (
                                <span className="progress-task-text">
                                  {task}
                                </span>
                              )}
                              {isEditMode && isTextEditingEnabled ? (
                                <button
                                  type="button"
                                  className="progress-remove-button"
                                  onClick={() => {
                                    setTaskDeleteTarget({
                                      stepIndex: safeActiveStepIndex,
                                      taskIndex,
                                      label: String(task || "").trim() || "this task",
                                    });
                                  }}
                                >
                                  Delete Task
                                </button>
                              ) : null}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                ) : null}

                {isChecklistFullyCompleted ? (
                  <section ref={finalStepCardRef} className="progress-final-step-card" aria-live="polite">
                    <header className="progress-final-step-header">
                      <div className="progress-final-step-heading">
                        <h3>Scheduled Appointment</h3>
                      </div>
                      {!isSpecialProgram ? (
                        <span
                          title={
                            !canSetEventSchedule
                              ? "Record payment first. Date and time can be set after this appointment is marked paid."
                              : hasScheduledDateTime
                                ? "Edit schedule"
                                : "Set schedule"
                          }
                        >
                          <button
                            type="button"
                            className="progress-set-schedule-button progress-final-step-inline-button"
                            onClick={hasScheduledDateTime ? handleChangeEventSchedule : handleStartDateTimeSchedulingFlow}
                            disabled={isSavingScheduleDateTime || !canSetEventSchedule}
                            aria-disabled={isSavingScheduleDateTime || !canSetEventSchedule}
                          >
                            <CalendarClock size={16} aria-hidden="true" />
                            {hasScheduledDateTime ? "Edit Schedule" : "Set Schedule"}
                          </button>
                        </span>
                      ) : null}
                    </header>

                    {isSpecialProgram ? (
                      <p className="progress-final-step-note">
                        This applicant uses the special sacrament program schedule. Date, time, and priest come from the
                        program itself. Edit them on the Special Programs page or calendar, and every progress tracker under
                        this program updates together.
                      </p>
                    ) : null}

                    <div className="progress-final-step-facts">
                      <article className="progress-final-step-fact">
                        <span className="progress-final-step-fact-icon" aria-hidden="true">
                          <CalendarClock size={16} strokeWidth={2.2} />
                        </span>
                        <div className="progress-final-step-fact-copy">
                          <p className="progress-final-step-fact-label">Event Schedule</p>
                          <p className="progress-final-step-fact-value">
                            {hasScheduledDateTime
                              ? formatEventScheduleRange(
                                finalDetails.scheduledEventDateTime,
                                finalDetails.scheduledEventEndDateTime,
                                finalDetails.programTimeSlots,
                              )
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
                          <p className="progress-final-step-fact-value" aria-live="polite">
                            {assignedAppointmentPriestName || "Not assigned yet"}
                          </p>
                          <p className="progress-final-step-fact-hint">
                            {isSpecialProgram
                              ? "The assigned priest is the priest set on this special sacrament program."
                              : hasScheduledDateTime
                                ? "To assign a different priest, use Edit Schedule."
                                : "The assigned priest is set when you choose a date and time."}
                          </p>
                        </div>
                      </article>
                    </div>

                    {!canSetEventSchedule ? (
                      <div className="progress-final-step-footer">
                        <p className="progress-final-step-note is-warning">
                          Record payment first. Date and time can be set after this appointment is marked paid.
                        </p>
                      </div>
                    ) : hasScheduledDateTime && canRecordPayment && !isPaymentMarkedPaid ? (
                      <div className="progress-final-step-footer">
                        <p className="progress-final-step-note is-warning">
                          Record payment first. After this appointment is paid and scheduled, it stays here until the event time passes.
                        </p>
                      </div>
                    ) : null}
                    {finalDetailsError ? <p className="appointment-requests-empty">{finalDetailsError}</p> : null}
                  </section>
                ) : null}

                {isChecklistFullyCompleted && hasScheduledDateTime ? (
                  <section
                    ref={scheduleRemarksCardRef}
                    id="appointment-schedule-remarks"
                    className="progress-final-step-card progress-schedule-remarks-card"
                  >
                    <header className="progress-final-step-header">
                      <div className="progress-final-step-heading">
                        <h3>Schedule Feedback</h3>
                      </div>
                    </header>
                    {displayedScheduleRemark ? (
                      <article
                        id={`appointment-schedule-remark-${displayedScheduleRemark.remarkID}`}
                        className={`progress-schedule-remark-item ${
                          displayedScheduleRemark.status === "pending" ? "is-pending" : "is-reviewed"
                        }`}
                      >
                        <div className="progress-schedule-remark-item-head">
                          <span className="progress-schedule-remark-icon" aria-hidden="true">
                            <MessageSquare size={16} strokeWidth={2.2} />
                          </span>
                          <div>
                            <p className="progress-final-step-fact-label">
                              {displayedScheduleRemark.decision === "accepted"
                                ? "Confirmed the current schedule"
                                : displayedScheduleRemark.status === "pending"
                                  ? "Requested a preferred schedule"
                                  : displayedScheduleRemark.adminDecision === "updated"
                                    ? "Preferred schedule applied"
                                    : "Preferred schedule reviewed"}
                            </p>
                            <p className="progress-final-step-fact-value">{displayedScheduleRemark.message}</p>
                          </div>
                        </div>
                        {displayedScheduleRemark.decision === "preferred" ? (
                          <div className="progress-final-step-facts">
                            <article className="progress-final-step-fact">
                              <span className="progress-final-step-fact-icon" aria-hidden="true">
                                <CalendarClock size={16} strokeWidth={2.2} />
                              </span>
                              <div className="progress-final-step-fact-copy">
                                <p className="progress-final-step-fact-label">Preferred Date and Time</p>
                                <p className="progress-final-step-fact-value">
                                  {formatPreferredScheduleRange(
                                    displayedScheduleRemark.preferredDate,
                                    displayedScheduleRemark.preferredTime,
                                  )}
                                </p>
                              </div>
                            </article>
                            <article className="progress-final-step-fact">
                              <span className="progress-final-step-fact-icon" aria-hidden="true">
                                <User size={16} strokeWidth={2.2} />
                              </span>
                              <div className="progress-final-step-fact-copy">
                                <p className="progress-final-step-fact-label">Preferred Priest</p>
                                <p className="progress-final-step-fact-value">
                                  {displayedScheduleRemark.preferredPriestName || "Not specified"}
                                </p>
                              </div>
                            </article>
                          </div>
                        ) : null}
                        {pendingScheduleRemark?.remarkID === displayedScheduleRemark.remarkID &&
                        displayedScheduleRemark.decision === "preferred" ? (
                          <div className="progress-schedule-apply-actions">
                            <p>
                              Applying this request will update the appointment to the preferred priest and time. Availability
                              will be checked again before saving.
                            </p>
                            <button
                              type="button"
                              className="progress-schedule-apply-button"
                              onClick={() => {
                                setScheduleRemarkError("");
                                setIsPreferredScheduleConfirmOpen(true);
                              }}
                            >
                              <CalendarClock size={16} aria-hidden="true" />
                              Apply Preferred Schedule
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ) : (
                      <p className="progress-final-step-note">
                        {scheduleRemarks.some((item) => item.decision === "accepted")
                          ? "The requester confirmed this schedule. No pending remarks."
                          : "Waiting for the requester to confirm this schedule or send a preferred date, time, and priest."}
                      </p>
                    )}
                    {scheduleRemarkError ? <p className="appointment-requests-empty">{scheduleRemarkError}</p> : null}
                  </section>
                ) : null}

                {isChecklistFullyCompleted && hasScheduledDateTime && assignedAppointmentPriestID > 0 ? (
                  <section
                    id="appointment-priest-remarks"
                    className="progress-final-step-card progress-priest-remarks-card"
                  >
                    <header className="progress-final-step-header">
                      <div className="progress-final-step-heading">
                        <h3>Priest Remarks</h3>
                      </div>
                      {priestRemarks.length > 0 ? (
                        <span
                          className={`progress-priest-remarks-count${
                            priestRemarks.some((item) => !item.reviewedBySecretary) ? " is-alert" : ""
                          }`}
                        >
                          {priestRemarks.filter((item) => !item.reviewedBySecretary).length > 0
                            ? `${priestRemarks.filter((item) => !item.reviewedBySecretary).length} needs review`
                            : "All reviewed"}
                        </span>
                      ) : null}
                    </header>
                    {isLoadingPriestRemarks && priestRemarks.length === 0 ? (
                      <p className="progress-final-step-note">Loading priest remarks...</p>
                    ) : priestRemarks.length === 0 ? (
                      <p className="progress-final-step-note">
                        {assignedAppointmentPriestName || "The assigned priest"} has not sent remarks for this appointment yet.
                      </p>
                    ) : (
                      <ul className="progress-priest-remarks-list">
                        {priestRemarks.map((item) => {
                          const isMarking = Boolean(isMarkingPriestRemarkById[item.remarkID]);
                          return (
                            <li
                              key={`appointment-priest-remark-${item.remarkID}`}
                              className={`progress-schedule-remark-item progress-priest-remark-item ${
                                item.reviewedBySecretary ? "is-reviewed" : "is-pending"
                              }`}
                            >
                              <div className="progress-schedule-remark-item-head">
                                <span className="progress-schedule-remark-icon" aria-hidden="true">
                                  <MessageSquare size={16} strokeWidth={2.2} />
                                </span>
                                <div className="progress-priest-remark-copy">
                                  <p className="progress-final-step-fact-label">
                                    From {assignedAppointmentPriestName || "the assigned priest"}
                                    <span
                                      className={`progress-priest-remark-status ${
                                        item.reviewedBySecretary ? "is-reviewed" : "is-pending"
                                      }`}
                                    >
                                      {item.reviewedBySecretary ? "Reviewed" : "Needs Review"}
                                    </span>
                                  </p>
                                  <p className="progress-final-step-fact-value">
                                    {item.remarks || "No remark text was submitted."}
                                  </p>
                                </div>
                              </div>
                              <div className="progress-priest-remark-footer">
                                <p>
                                  Sent {formatDateTime(item.sentAt)}
                                  {item.updatedAt && item.sentAt && item.updatedAt !== item.sentAt && !item.reviewedBySecretary
                                    ? ` · Updated ${formatDateTime(item.updatedAt)}`
                                    : ""}
                                  {item.reviewedBySecretary ? ` · Reviewed ${formatDateTime(item.reviewedAt)}` : ""}
                                </p>
                                <button
                                  type="button"
                                  className="progress-priest-remark-review-button"
                                  onClick={() => void handleMarkPriestRemarkReviewed(item)}
                                  disabled={item.reviewedBySecretary || isMarking}
                                >
                                  <CircleCheckBig size={14} aria-hidden="true" />
                                  {item.reviewedBySecretary ? "Reviewed" : isMarking ? "Marking..." : "Mark as Reviewed"}
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {priestRemarksError ? <p className="appointment-requests-empty">{priestRemarksError}</p> : null}
                  </section>
                ) : null}

                <div className="progress-page-actions">
                  <button
                    type="button"
                    className="progress-cancel-appointment-button"
                    onClick={() => {
                      setCancelError("");
                      setCancelReason("");
                      setCancelStep("confirm");
                    }}
                  >
                    <span className="progress-cancel-appointment-icon" aria-hidden="true">
                      <CalendarX2 size={16} strokeWidth={2.2} />
                    </span>
                    Cancel Appointment
                  </button>
                </div>
              </>
            )}
          </section>
        </section>
      </div>
      {isScheduleModalOpen ? (
        <div
          className="progress-delete-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!isSavingScheduleDateTime) setIsScheduleModalOpen(false);
          }}
        >
          <section
            className="progress-delete-modal progress-delete-modal--schedule-split"
            role="dialog"
            aria-modal="true"
            aria-label="Set event date and time"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="progress-delete-modal-body progress-delete-modal-body--left">
              <span className="progress-delete-modal-icon progress-delete-modal-icon--schedule" aria-hidden="true">
                <CircleCheckBig size={26} strokeWidth={2.1} />
              </span>
              <h3>{hasScheduledDateTime ? "Update Event Schedule" : "Set Next Event Schedule"}</h3>
              <p>
                {assignedSchedulePriestID
                  ? <>Choose a date from <strong>{assignedSchedulePriestName}</strong>&apos;s calendar, then pick one available 1-hour slot (4:00 AM to 5:00 PM).</>
                  : "Select a priest first. Then choose a date on that priest's calendar and pick one available 1-hour slot (4:00 AM to 5:00 PM)."}
              </p>
              <label className="progress-final-step-field progress-final-step-field--modal progress-schedule-priest-field">
                <span>Assigned Priest</span>
                <select
                  value={selectedPriestForScheduling}
                  disabled={isSavingScheduleDateTime}
                  onChange={(event) => {
                    setSelectedPriestForScheduling(event.target.value);
                    setScheduleTimeInput("");
                    setScheduleEndTimeInput("");
                    setRemoteDayAvailability(null);
                    if (finalDetailsError) setFinalDetailsError("");
                  }}
                >
                  <option value="">Select priest</option>
                  {priestOptions.filter((priest) => priest.isActive !== false).map((priest) => (
                    <option key={`schedule-modal-priest-${priest.priestID}`} value={priest.priestID}>
                      {priest.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="progress-schedule-split-layout">
                <div className="progress-schedule-split-panel">
                  <h4>Priest Calendar</h4>
                  <p className="progress-schedule-split-priest">
                    {assignedSchedulePriestID ? assignedSchedulePriestName : "Select a priest to load the calendar"}
                  </p>
                  {assignedSchedulePriestID ? (
                    renderPriestCalendarGrid(handleSelectScheduleDateFromCalendar)
                  ) : (
                    <p className="progress-schedule-slot-empty">
                      Select a priest above to view available dates.
                    </p>
                  )}
                </div>
                <div className="progress-schedule-split-panel">
                  <h4>Available Time Slots</h4>
                  <p className="progress-picked-date-label">
                    Selected date: <strong>{scheduleDateInput ? formatLongDate(scheduleDateInput) : "Not set"}</strong>
                  </p>
                  {remoteDayAvailability?.date === scheduleDateInput && remoteDayAvailability?.isHalfDay ? (
                    <p className="progress-half-day-notice">{remoteDayAvailability.halfDayMessage}</p>
                  ) : null}
                  {!assignedSchedulePriestID ? (
                    <p className="progress-schedule-slot-empty">
                      Select a priest first, then click a date to load available time slots.
                    </p>
                  ) : !scheduleDateInput ? (
                    <p className="progress-schedule-slot-empty">
                      Click a date on the priest calendar to load available time slots.
                    </p>
                  ) : isLoadingScheduleSlots ? (
                    <p className="progress-schedule-slot-empty">Checking this priest&apos;s availability...</p>
                  ) : isScheduleDayOff ? (
                    <p className="progress-schedule-slot-empty">This date is marked as day off.</p>
                  ) : isScheduleDayLocked ? (
                    <p className="progress-schedule-slot-empty">
                      {remoteDayAvailability?.lockedMessage || "This date is locked. Choose a later date."}
                    </p>
                  ) : (
                    <>
                      <div className="progress-schedule-slot-grid" role="listbox" aria-label="Available time slots">
                        {scheduleSlotOptions.map((slot) => {
                          const isSelected =
                            slot.available &&
                            scheduleTimeInput === slot.startTime &&
                            scheduleEndTimeInput === slot.endTime;
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
                                setScheduleTimeInput(slot.startTime);
                                setScheduleEndTimeInput(slot.endTime);
                                if (finalDetailsError) setFinalDetailsError("");
                              }}
                            >
                              <span>{slot.label}</span>
                              {!slot.available ? (
                                <small>
                                  {slot.conflictTitle || (isScheduleSlotInThePast(scheduleDateInput, slot.startTime) ? "Passed" : "Unavailable")}
                                </small>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      {availableScheduleSlots.length === 0 ? (
                        <p className="progress-schedule-slot-empty">
                          No available 1-hour slots for this priest on the selected date.
                        </p>
                      ) : null}
                    </>
                  )}
                  {scheduleDateInput ? (
                    <div className="progress-priest-day-schedules">
                      <h4>Existing priest schedules on {formatLongDate(scheduleDateInput)}</h4>
                      {scheduleDayExistingEntries.length > 0 ? (
                        <ul>
                          {scheduleDayExistingEntries.map((entry) => (
                            <li key={`selected-day-schedule-${entry.id}`}>
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
              {finalDetailsError ? <p className="appointment-requests-empty">{finalDetailsError}</p> : null}
            </div>
            <div className="progress-delete-modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={isSavingScheduleDateTime}
                onClick={() => {
                  if (!isSavingScheduleDateTime) setIsScheduleModalOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  isSavingScheduleDateTime ||
                  isLoadingScheduleSlots ||
                  !assignedSchedulePriestID ||
                  !scheduleTimeInput
                }
                onClick={() => void handleConfirmScheduleDateTime()}
              >
                {isSavingScheduleDateTime ? "Saving..." : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isPreferredScheduleConfirmOpen && pendingScheduleRemark?.decision === "preferred" ? (
        <div
          className="progress-delete-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!isApplyingPreferredSchedule) setIsPreferredScheduleConfirmOpen(false);
          }}
        >
          <section
            className="progress-delete-modal progress-delete-modal--confirm progress-preferred-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Review preferred schedule"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="progress-delete-modal-body">
              <span className="progress-delete-modal-icon progress-delete-modal-icon--schedule" aria-hidden="true">
                <CalendarClock size={26} />
              </span>
              <h3>Review Preferred Schedule</h3>
              <p>Confirm the requested date, time, and priest before updating the appointment.</p>
              <div className="progress-final-step-facts">
                <article className="progress-final-step-fact">
                  <span className="progress-final-step-fact-icon" aria-hidden="true">
                    <CalendarClock size={16} />
                  </span>
                  <div className="progress-final-step-fact-copy">
                    <p className="progress-final-step-fact-label">Preferred Date and Time</p>
                    <p className="progress-final-step-fact-value">
                      {formatPreferredScheduleRange(
                        pendingScheduleRemark.preferredDate,
                        pendingScheduleRemark.preferredTime,
                      )}
                    </p>
                  </div>
                </article>
                <article className="progress-final-step-fact">
                  <span className="progress-final-step-fact-icon" aria-hidden="true">
                    <User size={16} />
                  </span>
                  <div className="progress-final-step-fact-copy">
                    <p className="progress-final-step-fact-label">Preferred Priest</p>
                    <p className="progress-final-step-fact-value">
                      {pendingScheduleRemark.preferredPriestName || "Not specified"}
                    </p>
                  </div>
                </article>
              </div>
              <p>
                The parish calendar will be checked again. If the priest is unavailable or the slot conflicts, the current
                schedule will remain unchanged.
              </p>
              {scheduleRemarkError ? <p className="progress-preferred-schedule-error" role="alert">{scheduleRemarkError}</p> : null}
            </div>
            <div className="progress-delete-modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={isApplyingPreferredSchedule}
                onClick={() => setIsPreferredScheduleConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={isApplyingPreferredSchedule}
                onClick={() => void handleApplyPreferredSchedule()}
              >
                {isApplyingPreferredSchedule ? "Checking and applying..." : "Apply Schedule"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isPriestSelectionModalOpen ? (
        <div
          className="progress-delete-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!isAssigningPriest) setIsPriestSelectionModalOpen(false);
          }}
        >
          <section
            className="progress-delete-modal progress-delete-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-label="Pick priest for event scheduling"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="progress-delete-modal-body progress-delete-modal-body--left">
              <span className="progress-delete-modal-icon progress-delete-modal-icon--schedule" aria-hidden="true">
                <CircleCheckBig size={26} strokeWidth={2.1} />
              </span>
              <h3>Pick Priest for this Event</h3>
              <p>
                Choose a priest, then open the priest calendar and pick a date before setting the final time.
                {scheduleDatePolicy.minAdvanceDays > 0 ? (
                  <>
                    {" "}
                    Dates through <strong>{scheduleDatePolicy.lockedThroughDateLabel}</strong> are locked. Days off stay unavailable. Earliest
                    available date: <strong>{scheduleDatePolicy.minSelectableDateLabel}</strong> (
                    {scheduleDatePolicy.minAdvanceDays}-day interval).
                  </>
                ) : (
                  <> Dates through <strong>{scheduleDatePolicy.lockedThroughDateLabel}</strong> are locked. Days off stay unavailable. Earliest available date: <strong>{scheduleDatePolicy.minSelectableDateLabel}</strong>.</>
                )}
              </p>
              <label className="progress-final-step-field progress-final-step-field--modal">
                <span>Assigned Priest</span>
                <select
                  value={selectedPriestForScheduling}
                  onChange={(event) => {
                    setSelectedPriestForScheduling(event.target.value);
                    if (priestSelectionError) setPriestSelectionError("");
                  }}
                >
                  <option value="">Select priest</option>
                  {priestOptions.filter((priest) => priest.isActive !== false).map((priest) => (
                    <option key={`schedule-priest-${priest.priestID}`} value={priest.priestID}>
                      {priest.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="progress-calendar-picker-button"
                disabled={!selectedPriestForScheduling}
                onClick={() => {
                  if (!selectedPriestForScheduling) return;
                  setIsPriestCalendarModalOpen(true);
                  if (scheduleDateInput) {
                    const pickedDate = new Date(`${scheduleDateInput}T00:00:00`);
                    if (!Number.isNaN(pickedDate.getTime())) {
                      setPriestCalendarMonth(new Date(pickedDate.getFullYear(), pickedDate.getMonth(), 1));
                    }
                  }
                }}
              >
                <CalendarDays size={16} aria-hidden="true" />
                Open Priest Calendar
              </button>
              {scheduleDateInput ? (
                <p className="progress-picked-date-label">
                  Selected date: <strong>{formatLongDate(scheduleDateInput)}</strong>
                </p>
              ) : null}
              {priestSelectionError ? <p className="appointment-requests-empty">{priestSelectionError}</p> : null}
            </div>
            <div className="progress-delete-modal-actions progress-delete-modal-actions--full">
              <button
                type="button"
                className="secondary"
                disabled={isAssigningPriest}
                onClick={() => {
                  if (!isAssigningPriest) setIsPriestSelectionModalOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={isAssigningPriest || !scheduleDateInput || isSelectedDateDayOff}
                onClick={() => void handleConfirmPriestSelection()}
              >
                {isAssigningPriest ? "Saving..." : "Confirm Priest"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isPriestCalendarModalOpen ? (
        <div
          className="progress-delete-modal-overlay"
          role="presentation"
          onClick={() => setIsPriestCalendarModalOpen(false)}
        >
          <section
            className="progress-delete-modal progress-delete-modal--calendar"
            role="dialog"
            aria-modal="true"
            aria-label="Priest calendar selection"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="progress-priest-calendar-modal-header">
              <h3>{`${assignedSchedulePriestName}'s Calendar`}</h3>
              <button type="button" className="progress-calendar-month-nav" onClick={() => setIsPriestCalendarModalOpen(false)}>
                Close
              </button>
            </header>
            {renderPriestCalendarGrid(handleSelectScheduleDateFromCalendar)}
          </section>
        </div>
      ) : null}
      {isPaymentModalOpen ? (
        <div className="progress-delete-modal-overlay" role="presentation" onClick={closePaymentModal}>
          <section
            className="progress-delete-modal progress-delete-modal--wide progress-delete-modal--payment"
            role="dialog"
            aria-modal="true"
            aria-label={isPaymentMarkedPaid ? "Edit or undo payment" : "Record payment"}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="progress-payment-modal-bar">
              <h3>{isPaymentMarkedPaid ? "Edit Payment" : "Record Payment"}</h3>
              <button
                type="button"
                className="progress-delete-modal-close"
                onClick={closePaymentModal}
                aria-label="Close"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </header>
            <div className="progress-delete-modal-body progress-delete-modal-body--left progress-payment-modal-body">
              <p>
                {isPaymentMarkedPaid
                  ? "Update the invoice or receipt. Undo keeps the old record as archived."
                  : "Enter the invoice number and attach a receipt if you have one."}
              </p>
              <div className="progress-payment-form">
                <label className="progress-payment-field">
                  <span>Invoice / Receipt Number</span>
                  <input
                    type="text"
                    value={paymentInvoiceInput}
                    onChange={(event) => setPaymentInvoiceInput(event.target.value)}
                    placeholder="Enter invoice or official receipt number"
                    maxLength={120}
                  />
                </label>
                <label className="progress-payment-field">
                  <span>Date of Payment</span>
                  <input
                    type="date"
                    value={paymentDateInput}
                    max={getTodayPaymentDateKey()}
                    onChange={(event) => setPaymentDateInput(event.target.value)}
                  />
                </label>
                <div className="progress-payment-field">
                  <span>Upload Receipt</span>
                  <div className="progress-payment-file">
                    <input
                      id="progress-payment-receipt-file"
                      className="progress-payment-file-input"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                      onChange={(event) => setPaymentReceiptFile(event.target.files?.[0] || null)}
                    />
                    <label htmlFor="progress-payment-receipt-file" className="progress-payment-file-trigger">
                      <Upload size={15} strokeWidth={2.2} />
                      Choose file
                    </label>
                    <span className={`progress-payment-file-name${paymentReceiptFile ? " is-selected" : ""}`}>
                      {paymentReceiptFile ? paymentReceiptFile.name : "No file chosen"}
                    </span>
                  </div>
                  <small>
                    {isPaymentMarkedPaid
                      ? "Optional. Leave empty to keep the current receipt."
                      : "Optional. PDF or image up to 10MB."}
                  </small>
                </div>
              </div>
              {paymentRecords.length > 0 ? (
                <div className="progress-payment-history">
                  <h4>Payment History</h4>
                  <ul>
                    {[...paymentRecords].reverse().map((record) => (
                      <li key={record.recordID} className={record.isArchived ? "is-archived" : "is-current"}>
                        <div>
                          <div className="progress-payment-history-title">
                            <strong>{record.invoiceNumber || "No invoice number"}</strong>
                            <em className={record.isArchived ? "is-archived" : "is-current"}>
                              {record.isArchived ? "Archived" : "Current"}
                            </em>
                          </div>
                          {record.paymentDate ? (
                            <small className="progress-payment-history-date">
                              Paid on {formatPaymentDateLabel(record.paymentDate)}
                            </small>
                          ) : null}
                        </div>
                        {record.receiptFileUrl ? (
                          <a
                            href={resolveProgressPaymentReceiptUrl(record.receiptFileUrl)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View receipt
                          </a>
                        ) : (
                          <span>No file</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {paymentFormError ? <p className="progress-payment-form-error">{paymentFormError}</p> : null}
            </div>
            <div className={`progress-delete-modal-actions${isPaymentMarkedPaid ? "" : " progress-delete-modal-actions--end"}`}>
              {isPaymentMarkedPaid ? (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    closePaymentModal();
                    setIsPaymentUndoConfirmOpen(true);
                  }}
                >
                  Undo Payment
                </button>
              ) : null}
              <button type="button" className="primary" onClick={handleSavePaymentRecord} disabled={isSavingPaymentRecord}>
                {isSavingPaymentRecord ? "Saving..." : isPaymentMarkedPaid ? "Save Changes" : "Save Payment"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isPaymentUndoConfirmOpen ? (
        <div className="progress-delete-modal-overlay" role="presentation" onClick={closePaymentUndoConfirmModal}>
          <section
            className="progress-delete-modal progress-delete-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Undo payment confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="progress-delete-modal-body">
              <span className="progress-delete-modal-icon" aria-hidden="true">
                <Receipt size={28} />
              </span>
              <h3>Undo payment?</h3>
              <p>
                This will remove the recorded payment for this appointment, mark it as{" "}
                <strong>Unpaid</strong>, and notify the requester.
              </p>
            </div>
            <div className="progress-delete-modal-actions">
              <button type="button" className="secondary" onClick={closePaymentUndoConfirmModal} disabled={isUndoingPayment}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleUndoPayment} disabled={isUndoingPayment}>
                {isUndoingPayment ? "Undoing..." : "Undo Payment"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {cancelStep === "confirm" ? (
        <div className="progress-delete-modal-overlay" role="presentation" onClick={closeCancelAppointmentFlow}>
          <section
            className="progress-delete-modal progress-delete-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Cancel appointment confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="progress-delete-modal-body">
              <span className="progress-delete-modal-icon" aria-hidden="true">
                <CalendarX2 size={24} strokeWidth={2.1} />
              </span>
              <h3>Are you sure you want to cancel the appointment?</h3>
              <p>This appointment will leave Progress Tracker, appear as Cancelled in Report Generation, and notify the requester.</p>
            </div>
            <div className="progress-delete-modal-actions">
              <button type="button" className="secondary" onClick={closeCancelAppointmentFlow}>
                No
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setCancelError("");
                  setCancelStep("reason");
                }}
              >
                Yes
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {cancelStep === "reason" ? (
        <div className="progress-delete-modal-overlay" role="presentation" onClick={closeCancelAppointmentFlow}>
          <section
            className="progress-delete-modal progress-delete-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Cancellation reason"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="progress-delete-modal-body">
              <span className="progress-delete-modal-icon" aria-hidden="true">
                <CalendarX2 size={24} strokeWidth={2.1} />
              </span>
              <h3>Reason for cancellation</h3>
              <p>Enter the reason the requester will see in their notification.</p>
              <label className="progress-cancel-reason-field">
                <span>Cancellation reason</span>
                <textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Enter the reason for cancelling this appointment"
                />
              </label>
              {cancelError ? <p className="progress-payment-form-error">{cancelError}</p> : null}
            </div>
            <div className="progress-delete-modal-actions">
              <button type="button" className="secondary" onClick={closeCancelAppointmentFlow} disabled={isCancellingAppointment}>
                Back
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void handleConfirmCancelAppointment()}
                disabled={isCancellingAppointment}
              >
                {isCancellingAppointment ? "Cancelling..." : "Cancel Appointment"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {taskDeleteTarget ? (
        <div className="progress-delete-modal-overlay" role="presentation" onClick={() => setTaskDeleteTarget(null)}>
          <section
            className="progress-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete task confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="progress-delete-modal-body">
              <span className="progress-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h3>Delete Task?</h3>
              <p>
                Remove <strong>{taskDeleteTarget.label}</strong> from this step?
              </p>
            </div>
            <div className="progress-delete-modal-actions">
              <button type="button" className="secondary" onClick={() => setTaskDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={handleConfirmDeleteTask}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {taskCheckToggleTarget ? (
        <div className="progress-delete-modal-overlay" role="presentation" onClick={closeTaskCheckToggleModal}>
          <section
            className={`progress-delete-modal progress-delete-modal--confirm${
              taskCheckToggleTarget.isNextChecked ? "" : " progress-delete-modal--wide"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Task status confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="progress-delete-modal-body">
              <span className="progress-delete-modal-icon" aria-hidden="true">
                <AlertTriangle size={24} />
              </span>
              <h3>{taskCheckToggleTarget.isNextChecked ? "Mark task as completed?" : "Uncheck task?"}</h3>
              <p>
                {taskCheckToggleTarget.isNextChecked ? "Mark" : "Remove completion for"}{" "}
                <strong>{taskCheckToggleTarget.label}</strong>?
              </p>
              {!taskCheckToggleTarget.isNextChecked ? (
                <label className="progress-uncheck-reason-field">
                  <span>Reason for unchecking</span>
                  <textarea
                    value={taskUncheckReason}
                    onChange={(event) => setTaskUncheckReason(event.target.value)}
                    placeholder="Explain why this task is being unchecked so the requester is informed."
                    rows={4}
                    maxLength={500}
                    autoFocus
                  />
                  <small>{taskUncheckReason.trim().length}/500 characters (minimum 3)</small>
                </label>
              ) : null}
            </div>
            <div className="progress-delete-modal-actions">
              <button type="button" className="secondary" onClick={closeTaskCheckToggleModal}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleConfirmTaskCheckToggle}
                disabled={!taskCheckToggleTarget.isNextChecked && taskUncheckReason.trim().length < 3}
              >
                Confirm
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isAppointmentDetailsOpen && selectedProgressItem ? (
        <AppointmentDetailsModal
          kicker="Appointment details"
          title={`${selectedProgressItem.sacramentName || selectedProgressItem.sacramentalType || "Appointment"}${
            blessingTypeDetail ? ` (${blessingTypeDetail})` : ""
          }`}
          appointmentID={selectedProgressItem.appointmentID}
          chips={[selectedProgressItem.status, showsPaymentStatus ? displayPaymentStatusLabel : ""]}
          summaryItems={[
            { label: "Name", value: appointmentSubjectName },
            appointmentRequesterName && appointmentRequesterName !== appointmentSubjectName
              ? { label: "Requested by", value: appointmentRequesterName }
              : null,
            { label: "Requested Date", value: formatDateTime(selectedProgressItem.createdAt) },
            {
              label: "Event Schedule",
              value: hasScheduledDateTime
                ? formatEventScheduleRange(
                    finalDetails.scheduledEventDateTime,
                    finalDetails.scheduledEventEndDateTime,
                    finalDetails.programTimeSlots,
                  )
                : "Not scheduled yet",
            },
            { label: "Assigned Priest", value: assignedAppointmentPriestName || "Not assigned yet" },
          ]}
          note={selectedProgressItem.note}
          noteLabel="Request note"
          credentials={selectedProgressItem.credentials}
          sacramentName={selectedProgressItem.sacramentName || selectedProgressItem.sacramentalType}
          onClose={() => setIsAppointmentDetailsOpen(false)}
        />
      ) : null}
    </main>
  );
}

export default AdminProgressDetails;
