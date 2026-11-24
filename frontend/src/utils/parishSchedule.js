export const PRIEST_BLOCK_REASONS = ["Seminar", "Sick", "Out of Town", "Personal Leave", "Church Meeting"];
export const PRIEST_BLOCK_OTHER_REASON = "__other__";

export const PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS = 5;
export const FUNERAL_MASS_MIN_ADVANCE_DAYS = 1;
import { getTrustedNow } from "./parishClock";

export const PARISH_TIMEZONE = "Asia/Manila";

export const PARISH_APPOINTMENT_TIME_SLOTS = [
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

export const SPECIAL_PROGRAM_DURATION_HOURS = [1, 2, 3, 4, 5, 6, 7, 8];
export const SPECIAL_PROGRAM_MAX_DURATION_HOURS = 8;

export const normalizeSpecialProgramDurationHours = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(SPECIAL_PROGRAM_MAX_DURATION_HOURS, parsed);
};

export const getParishHourSlotKey = (startTime, endTime) =>
  `${normalizeTimeToHHMM(startTime)}-${normalizeTimeToHHMM(endTime)}`;

export const isParishHourSlot = (startTime, endTime) =>
  PARISH_APPOINTMENT_TIME_SLOTS.some(
    (slot) => slot.startTime === normalizeTimeToHHMM(startTime) && slot.endTime === normalizeTimeToHHMM(endTime),
  );

export const normalizeOccupiedSlots = (rawSlots, startTime, endTime) => {
  const unique = [];
  const seen = new Set();
  const pushSlot = (slotStart, slotEnd) => {
    const normalizedStart = normalizeTimeToHHMM(slotStart);
    const normalizedEnd = normalizeTimeToHHMM(slotEnd);
    if (!isParishHourSlot(normalizedStart, normalizedEnd)) return;
    const key = getParishHourSlotKey(normalizedStart, normalizedEnd);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push({ startTime: normalizedStart, endTime: normalizedEnd });
  };

  (Array.isArray(rawSlots) ? rawSlots : []).forEach((slot) => {
    if (typeof slot === "string") {
      const [slotStart, slotEnd] = slot.split("-");
      pushSlot(slotStart, slotEnd);
      return;
    }
    pushSlot(slot?.startTime || slot?.start_time, slot?.endTime || slot?.end_time);
  });

  if (!unique.length) {
    const start = timeStringToMinutes(startTime);
    const end = timeStringToMinutes(endTime);
    if (start !== null && end !== null) {
      PARISH_APPOINTMENT_TIME_SLOTS.forEach((slot) => {
        const slotStart = timeStringToMinutes(slot.startTime);
        const slotEnd = timeStringToMinutes(slot.endTime);
        if (slotStart !== null && slotEnd !== null && slotStart >= start && slotEnd <= end) {
          pushSlot(slot.startTime, slot.endTime);
        }
      });
    }
  }

  unique.sort((left, right) => timeStringToMinutes(left.startTime) - timeStringToMinutes(right.startTime));
  return unique;
};

export const occupiedSlotsToFormTimes = (rawSlots, startTime, endTime) => {
  const occupiedSlots = normalizeOccupiedSlots(rawSlots, startTime, endTime);
  return {
    occupiedSlots,
    startTime: occupiedSlots[0]?.startTime || "",
    endTime: occupiedSlots[occupiedSlots.length - 1]?.endTime || "",
    durationHours: occupiedSlots.length || 1,
  };
};

export const toggleOccupiedHourSlot = (rawSlots, slot) => {
  const current = normalizeOccupiedSlots(rawSlots);
  const key = getParishHourSlotKey(slot?.startTime, slot?.endTime);
  if (!key || key === "-") return current;
  const exists = current.some((item) => getParishHourSlotKey(item.startTime, item.endTime) === key);
  const next = exists
    ? current.filter((item) => getParishHourSlotKey(item.startTime, item.endTime) !== key)
    : [...current, { startTime: normalizeTimeToHHMM(slot?.startTime), endTime: normalizeTimeToHHMM(slot?.endTime) }];
  return normalizeOccupiedSlots(next);
};

export const expandScheduleBusyRanges = (entry) => {
  const occupiedSlots = normalizeOccupiedSlots(entry?.occupiedSlots);
  if (occupiedSlots.length) {
    return occupiedSlots
      .map((slot) => ({
        start: timeStringToMinutes(slot.startTime),
        end: timeStringToMinutes(slot.endTime),
        title: String(entry?.title || "Priest Schedule").trim() || "Priest Schedule",
      }))
      .filter((range) => range.start !== null && range.end !== null);
  }
  const start = timeStringToMinutes(entry?.startTime);
  const end = timeStringToMinutes(entry?.endTime);
  if (start === null || end === null) return [];
  return [
    {
      start,
      end,
      title: String(entry?.title || "Priest Schedule").trim() || "Priest Schedule",
    },
  ];
};

export const formatOccupiedSlotsLabel = (occupiedSlots, startTime, endTime) => {
  const slots = normalizeOccupiedSlots(occupiedSlots);
  if (!slots.length) {
    const startLabel = to12HourTime(startTime);
    const endLabel = to12HourTime(endTime);
    if (startLabel !== "Time not set" && endLabel !== "Time not set") return `${startLabel} - ${endLabel}`;
    return startLabel !== "Time not set" ? startLabel : "";
  }
  const ranges = [];
  slots.forEach((slot) => {
    const last = ranges[ranges.length - 1];
    if (last && last.endTime === slot.startTime) {
      last.endTime = slot.endTime;
      return;
    }
    ranges.push({ startTime: slot.startTime, endTime: slot.endTime });
  });
  return ranges.map((range) => `${to12HourTime(range.startTime)} - ${to12HourTime(range.endTime)}`).join(", ");
};

export const formatLongDate = (dateValue) => {
  if (!dateValue) return "Date not set";
  const parsedDate = new Date(`${String(dateValue).trim()}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "Date not set";
  return parsedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export const toDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const addDaysToDateKey = (days, fromDate = getTrustedNow()) => {
  const next = fromDate instanceof Date ? new Date(fromDate) : new Date();
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + Number(days));
  return toDateKey(next);
};

export const shiftDateKey = (dateKey, days) => {
  const parsed = new Date(`${String(dateKey || "").trim()}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(dateKey || "").trim();
  return addDaysToDateKey(Number(days) || 0, parsed);
};

export const normalizeScheduleMinAdvanceDays = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
    return PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS;
  }
  return parsed;
};

export const isFuneralMassSacrament = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "funeral mass" ||
    normalized === "funeral-mass" ||
    normalized.includes("funeral") ||
    normalized.includes("death mass") ||
    normalized.includes("death-mass")
  );
};

export const getLockedThroughDateKey = (advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
  const days = normalizeScheduleMinAdvanceDays(advanceDays);
  if (days <= 0) return "";
  return shiftDateKey(getManilaDateKey(), days);
};

export const getMinimumScheduleDateKey = (advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
  const days = normalizeScheduleMinAdvanceDays(advanceDays);
  const todayKey = getManilaDateKey();
  if (days <= 0) return todayKey;
  return shiftDateKey(todayKey, days + 1);
};

export const isScheduleDateLocked = (dateKey, minDateKey = getMinimumScheduleDateKey()) =>
  String(dateKey || "").trim() < String(minDateKey || "").trim();

export const getScheduleDatePolicy = (advanceDays = PROGRESS_SCHEDULE_MIN_ADVANCE_DAYS) => {
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

export const to12HourTime = (timeValue) => {
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

export const normalizeTimeToHHMM = (timeValue) => {
  const match = String(timeValue || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "";
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const timeStringToMinutes = (timeValue) => {
  const normalized = normalizeTimeToHHMM(timeValue);
  if (!normalized) return null;
  const [hoursRaw, minutesRaw] = normalized.split(":");
  return Number(hoursRaw) * 60 + Number(minutesRaw);
};

export const getManilaDateKey = (date = getTrustedNow()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: PARISH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export const getManilaMinutesNow = (date = getTrustedNow()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARISH_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 0;
  return hour * 60 + minute;
};

export const isScheduleSlotInThePast = (dateKey, startTime, now = getTrustedNow()) => {
  const normalizedDateKey = String(dateKey || "").trim();
  const startMinutes = timeStringToMinutes(startTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateKey) || startMinutes === null) return false;
  const todayKey = getManilaDateKey(now);
  if (normalizedDateKey < todayKey) return true;
  if (normalizedDateKey > todayKey) return false;
  return startMinutes <= getManilaMinutesNow(now);
};

export const resolveFuneralMassAdvanceDays = (value) => {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= FUNERAL_MASS_MIN_ADVANCE_DAYS && parsed <= 365) {
    return parsed;
  }
  return FUNERAL_MASS_MIN_ADVANCE_DAYS;
};

export const doScheduleRangesOverlap = (startA, endA, startB, endB) => startA < endB && startB < endA;

export const buildParishAppointmentScheduleSlots = () =>
  PARISH_APPOINTMENT_TIME_SLOTS.map((slot) => {
    const startMinutes = timeStringToMinutes(slot.startTime);
    const endMinutes = timeStringToMinutes(slot.endTime);
    return {
      startTime: slot.startTime,
      endTime: slot.endTime,
      startMinutes,
      endMinutes,
      durationHours: 1,
      label: `${to12HourTime(slot.startTime)} - ${to12HourTime(slot.endTime)}`,
    };
  }).filter((slot) => slot.startMinutes !== null && slot.endMinutes !== null);

export const buildSpecialProgramScheduleSlots = (durationHours = 2) => {
  const hours = normalizeSpecialProgramDurationHours(durationHours);
  const hourSlots = buildParishAppointmentScheduleSlots();
  const slots = [];
  for (let index = 0; index < hourSlots.length; index += 1) {
    const startSlot = hourSlots[index];
    const endSlot = hourSlots[index + hours - 1];
    if (!endSlot) continue;
    if (endSlot.endMinutes - startSlot.startMinutes !== hours * 60) continue;
    slots.push({
      startTime: startSlot.startTime,
      endTime: endSlot.endTime,
      startMinutes: startSlot.startMinutes,
      endMinutes: endSlot.endMinutes,
      durationHours: hours,
      label: `${to12HourTime(startSlot.startTime)} - ${to12HourTime(endSlot.endTime)}`,
    });
  }
  return slots;
};

export const toEventDateKey = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString("en-CA");
  }
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return parsedDate.toLocaleDateString("en-CA");
};

export const formatEventDateTimeLabel = (eventDate, startTime, endTime, occupiedSlots) => {
  const dateLabel = formatLongDate(toEventDateKey(eventDate) || eventDate);
  const timeLabel = formatOccupiedSlotsLabel(occupiedSlots, startTime, endTime);
  const hasDate = Boolean(dateLabel) && dateLabel !== "Date not set";
  const hasTime = Boolean(timeLabel);
  if (hasDate && hasTime) return `${dateLabel}, ${timeLabel}`;
  if (hasDate) return dateLabel;
  return hasTime ? timeLabel : "Date not set";
};

export const formatCertificatePickupLabel = (pickupDate, pickupTime, pickupEndTime) => {
  const dateKey = toEventDateKey(pickupDate);
  const dateLabel = dateKey ? formatLongDate(dateKey) : "";
  const start = normalizeTimeToHHMM(pickupTime);
  const matchedSlot = PARISH_APPOINTMENT_TIME_SLOTS.find((slot) => slot.startTime === start);
  const end = normalizeTimeToHHMM(pickupEndTime) || matchedSlot?.endTime || "";
  const startLabel = start ? to12HourTime(start) : "";
  const endLabel = end ? to12HourTime(end) : "";
  const hasDate = Boolean(dateLabel) && dateLabel !== "Date not set";
  const hasStart = Boolean(startLabel) && startLabel !== "Time not set";
  const hasEnd = Boolean(endLabel) && endLabel !== "Time not set";
  if (hasDate && hasStart && hasEnd) return `${dateLabel}, ${startLabel} - ${endLabel}`;
  if (hasDate && hasStart) return `${dateLabel}, ${startLabel}`;
  if (hasStart && hasEnd) return `${startLabel} - ${endLabel}`;
  return hasDate ? dateLabel : hasStart ? startLabel : "";
};

export const getCalendarEntryLocationLabel = (entry, { emptyLabel = "Not set" } = {}) => {
  const specialID = Number(entry?.s_sacramentID ?? entry?.sSacramentID);
  if (Number.isInteger(specialID) && specialID > 0) return emptyLabel;
  const type = String(entry?.scheduleType || "").trim().toLowerCase();
  if (type === "parish_event") return "Parish";
  const location = String(entry?.location || "").trim();
  return location || emptyLabel;
};

export const isPriestAssignedCalendarEntry = (entry, priestID) => {
  const type = String(entry?.scheduleType || "").trim().toLowerCase();
  return (
    (type === "priest_schedule" || type === "parish_event" || type === "priest_activity") &&
    Number(entry?.priestID) === Number(priestID)
  );
};

export const isAppointmentCalendarEntry = (entry) => {
  const appointmentID = Number(entry?.appointmentID);
  if (Number.isInteger(appointmentID) && appointmentID > 0) return true;
  return /^appointment\s*#\s*\d+/i.test(String(entry?.title || "").trim());
};

/** Special-sacrament calendar color. Keep in sync with `.is-special` CSS. Not stored in the database. */
export const SPECIAL_SACRAMENT_CALENDAR_COLOR = "#C4B5FD";

export const isSpecialSacramentCalendarEntry = (entry) => {
  if (!entry || isAppointmentCalendarEntry(entry)) return false;
  const specialID = Number(entry?.s_sacramentID ?? entry?.sSacramentID);
  return Number.isInteger(specialID) && specialID > 0;
};

export const formatPriestHonorificName = (priest = {}) => {
  const priestName = String(priest?.fullName || priest?.priestName || "").trim();
  if (!priestName) return "";
  const religiousOrderCode = String(priest?.religiousOrderCode || "").trim().toUpperCase();
  return ["Fr.", priestName, religiousOrderCode].filter(Boolean).join(" ");
};

export const sanitizeScheduleNotes = (notes) => {
  const cleaned = String(notes || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (/auto-generated from progress tracker/i.test(cleaned)) return "";
  const normalized = cleaned.toLowerCase().replace(/[.:!]+$/g, "");
  if (normalized === "yes" || normalized === "y") return "";
  return cleaned;
};

export const getCalendarEntryDisplayTitle = (entry) => {
  const raw = String(entry?.sacramentName || entry?.title || "").trim();
  const stripped = raw.replace(/^appointment\s*#\s*\d+\s*[-–:]\s*/i, "").trim();
  if (stripped) return stripped;
  if (isAppointmentCalendarEntry(entry)) return "Appointment";
  return raw || "Schedule";
};

export const sortCalendarEntriesByStartTime = (dayEntries) =>
  [...(Array.isArray(dayEntries) ? dayEntries : [])].sort((left, right) => {
    const leftTime = normalizeTimeToHHMM(left?.startTime) || "99:99";
    const rightTime = normalizeTimeToHHMM(right?.startTime) || "99:99";
    const timeCompare = leftTime.localeCompare(rightTime);
    if (timeCompare !== 0) return timeCompare;
    return Number(left?.id || left?.calendarEntryID || 0) - Number(right?.id || right?.calendarEntryID || 0);
  });

export const getCalendarEntryColorClass = (entry) => {
  if (!entry) return "";
  if (isAppointmentCalendarEntry(entry)) return "is-appointment";
  if (isSpecialSacramentCalendarEntry(entry)) return "is-special";
  const type = String(entry?.scheduleType || "").trim().toLowerCase();
  if (type === "parish_event") return "is-church";
  if (type === "priest_schedule") return "is-priest";
  if (type === "priest_activity") return "is-activity";
  return "";
};

export const isPriestActivityCalendarEntry = (entry) =>
  String(entry?.scheduleType || "").trim().toLowerCase() === "priest_activity";

export const getCalendarEntryKind = (entry) => {
  if (isAppointmentCalendarEntry(entry)) {
    return { id: "appointment", label: "Appointment", className: "is-appointment-schedule", badgeClass: "is-appointment" };
  }
  if (isSpecialSacramentCalendarEntry(entry)) {
    return {
      id: "special",
      label: "Special Sacrament Program",
      className: "is-special-event",
      badgeClass: "is-special",
    };
  }
  const type = String(entry?.scheduleType || "").trim().toLowerCase();
  if (type === "priest_schedule") {
    return { id: "priest", label: "Priest Schedule", className: "is-priest-schedule", badgeClass: "is-priest" };
  }
  if (type === "priest_activity") {
    return { id: "activity", label: "Priest Unavailability", className: "is-priest-activity", badgeClass: "is-activity" };
  }
  return { id: "parish", label: "Parish Event", className: "is-parish-event", badgeClass: "is-parish" };
};

export const summarizeCalendarDayEntries = (entries = []) =>
  (Array.isArray(entries) ? entries : []).reduce(
    (summary, entry) => {
      summary.total += 1;
      const kind = getCalendarEntryKind(entry).id;
      if (Object.prototype.hasOwnProperty.call(summary, kind)) summary[kind] += 1;
      return summary;
    },
    { total: 0, appointment: 0, priest: 0, activity: 0, parish: 0, special: 0 },
  );

export const formatCalendarWeekday = (dateKey) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return "";
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
};

const normalizeCredentialKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const readCredentialByKeyMatch = (credentials, predicate) => {
  const source = credentials && typeof credentials === "object" && !Array.isArray(credentials) ? credentials : {};
  for (const [key, value] of Object.entries(source)) {
    if (!predicate(normalizeCredentialKey(key))) continue;
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

export const resolveChildDisplayName = (credentials) => {
  const firstName = readCredentialByKeyMatch(
    credentials,
    (key) => key.includes("child") && (key.includes("first") || key.includes("given")),
  );
  const lastName = readCredentialByKeyMatch(
    credentials,
    (key) => key.includes("child") && (key.includes("last") || key.includes("sur") || key.includes("family")),
  );
  const composed = [firstName, lastName].filter(Boolean).join(" ");
  if (composed) return composed;
  return readCredentialByKeyMatch(credentials, (key) => key === "childfullname" || key === "childname");
};

const composeRoleName = (credentials, role) => {
  const full = readCredentialByKeyMatch(
    credentials,
    (key) => key === `${role}name` || key === `${role}fullname`,
  );
  if (full && !/\.(png|jpe?g|pdf|webp|docx?)$/i.test(full)) return full;
  const first = readCredentialByKeyMatch(
    credentials,
    (key) => key.includes(role) && (key.includes("first") || key.includes("given")),
  );
  const last = readCredentialByKeyMatch(
    credentials,
    (key) => key.includes(role) && (key.includes("last") || key.includes("sur") || key.includes("family")),
  );
  return [first, last].filter(Boolean).join(" ");
};

const FILE_NAME_LIKE = /\.(png|jpe?g|pdf|webp|gif|docx?)$/i;

// The name(s) typed into the appointment form, ignoring the account holder's name.
// Marriage returns both partners ("Groom & Bride"). Returns "" when the form has no name field
// (e.g. Blessing), so callers can fall back to the requester.
export const getCredentialSubjectName = (appointment) => {
  const credentials = appointment?.credentials && typeof appointment.credentials === "object" ? appointment.credentials : {};
  const groomName = composeRoleName(credentials, "groom");
  const brideName = composeRoleName(credentials, "bride");
  if (groomName || brideName) return [groomName, brideName].filter(Boolean).join(" & ");
  const childName = resolveChildDisplayName(credentials);
  if (childName) return childName;
  const deceasedName = readCredentialByKeyMatch(
    credentials,
    (key) => key === "deceasedname" || key === "deceasedfullname",
  );
  if (deceasedName) return deceasedName;
  const fullName = String(credentials.fullName || "").trim();
  return fullName && !FILE_NAME_LIKE.test(fullName) ? fullName : "";
};

export const getAppointmentSubjectName = (appointment) => {
  const credentials = appointment?.credentials && typeof appointment.credentials === "object" ? appointment.credentials : {};
  const sacramentName = String(
    appointment?.resolvedSacramentName || appointment?.sacramentName || appointment?.specialSacramentName || "",
  ).toLowerCase();
  if (sacramentName.includes("marriage") || sacramentName.includes("kasalan")) {
    const groomName = composeRoleName(credentials, "groom");
    const brideName = composeRoleName(credentials, "bride");
    const coupleName = [groomName, brideName].filter(Boolean).join(" & ");
    if (coupleName) return coupleName;
  }
  const childName = resolveChildDisplayName(credentials);
  if (childName) return childName;
  const storedName = String(appointment?.requesterFullName || "").trim();
  if (storedName && !storedName.includes(" & ")) return storedName;
  const groomName = String(credentials.groomName || credentials.groomFullName || "").trim();
  const brideName = String(credentials.brideName || credentials.brideFullName || "").trim();
  if (groomName && brideName) return `${groomName} & ${brideName}`;
  return (
    String(
      credentials.deceasedName ||
        credentials.deceasedFullName ||
        credentials.childFullName ||
        credentials.fullName ||
        credentials.blessingTarget ||
        "",
    ).trim() || storedName
  );
};

export const getCalendarRequesterName = (entry) => {
  const subjectName = getAppointmentSubjectName(entry);
  if (subjectName) return subjectName;
  const direct = String(entry?.requesterFullName || "").trim();
  if (direct) return direct;
  const credentials = entry?.credentials && typeof entry.credentials === "object" ? entry.credentials : {};
  const groomName = String(credentials.groomName || credentials.groomFullName || "").trim();
  const brideName = String(credentials.brideName || credentials.brideFullName || "").trim();
  if (groomName && brideName) return `${groomName} & ${brideName}`;
  return String(
    credentials.deceasedName ||
      credentials.deceasedFullName ||
      credentials.childFullName ||
      credentials.fullName ||
      credentials.blessingTarget ||
      "",
  ).trim();
};

export const getManilaDateKeyAndMinutes = (now = getTrustedNow()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const readPart = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    dateKey: `${readPart("year")}-${readPart("month")}-${readPart("day")}`,
    minutes: Number(readPart("hour")) * 60 + Number(readPart("minute")),
  };
};

export const getActiveOrNextCalendarEntry = (dayEntries, dateKey, now = getTrustedNow()) => {
  const sorted = sortCalendarEntriesByStartTime(dayEntries);
  if (sorted.length === 0) return null;

  const manila = getManilaDateKeyAndMinutes(now);
  const dayKey = String(dateKey || "").trim();
  if (dayKey && dayKey > manila.dateKey) return sorted[0];
  if (dayKey && dayKey < manila.dateKey) return sorted[sorted.length - 1];

  const current = sorted.find((entry) =>
    expandScheduleBusyRanges(entry).some((range) => manila.minutes >= range.start && manila.minutes < range.end),
  );
  if (current) return current;

  const upcoming = sorted.find((entry) => {
    const ranges = expandScheduleBusyRanges(entry);
    return ranges.some((range) => range.start > manila.minutes);
  });
  return upcoming || sorted[sorted.length - 1];
};

export const getCalendarDateColorClass = (dayEntries, dateKey = "", now = getTrustedNow()) =>
  getCalendarEntryColorClass(getActiveOrNextCalendarEntry(dayEntries, dateKey, now));

export const getScheduleSlotsForDay = (dayEntries, excludeEntryId = null, { isDayOff = false } = {}) => {
  const busyEntries = (Array.isArray(dayEntries) ? dayEntries : [])
    .filter((entry) => excludeEntryId == null || Number(entry?.id) !== Number(excludeEntryId))
    .flatMap((entry) => expandScheduleBusyRanges(entry));

  return buildParishAppointmentScheduleSlots().map((slot) => {
    const conflict = busyEntries.find((busy) =>
      doScheduleRangesOverlap(slot.startMinutes, slot.endMinutes, busy.start, busy.end),
    );
    return {
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationHours: 1,
      label: slot.label,
      available: !isDayOff && !conflict,
      conflictTitle: conflict?.title || "",
    };
  });
};
