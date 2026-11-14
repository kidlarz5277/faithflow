export const DEFAULT_MIN_LIST_ENTRIES = 3;

export const DEFAULT_GODPARENTS_FIELD = {
  key: "godparents",
  label: "Godparents (Ninong & Ninang)",
  type: "list",
  required: true,
  minEntries: DEFAULT_MIN_LIST_ENTRIES,
};

export const DEFAULT_BAPTISM_GODPARENT_FIELDS = [
  {
    key: "ninong",
    label: "Ninong (Godfathers)",
    type: "list",
    required: true,
    minEntries: 2,
  },
  {
    key: "ninang",
    label: "Ninang (Godmothers)",
    type: "list",
    required: true,
    minEntries: 2,
  },
];

const createEmptyEntry = () => ({ name: "", phone: "" });

export const createDefaultListValue = (minEntries = DEFAULT_MIN_LIST_ENTRIES) =>
  Array.from({ length: Math.max(1, minEntries) }, createEmptyEntry);

// Records saved before the single-list change stored two named groups.
const toEntryArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const legacyGroups = [value.godfathers, value.godmothers, value.entries].filter(Array.isArray);
    if (legacyGroups.length > 0) return legacyGroups.flat();
  }
  return [];
};

export const normalizeListValue = (value, minEntries = DEFAULT_MIN_LIST_ENTRIES) => {
  const entries = toEntryArray(value).map((entry) => ({
    name: String(entry?.name || "").trim(),
    phone: String(entry?.phone || "").trim(),
  }));
  while (entries.length < Math.max(1, minEntries)) {
    entries.push(createEmptyEntry());
  }
  return entries;
};

export const parseListFieldConfig = (field = {}) => ({
  minEntries: Math.max(1, Number(field?.minEntries) || DEFAULT_MIN_LIST_ENTRIES),
});

export const validateListValue = (value, { minEntries, phoneRegex, fieldLabel = "List" }) => {
  const normalized = normalizeListValue(value, minEntries);
  const filled = normalized.filter((entry) => entry.name.length > 0);

  if (filled.length < minEntries) {
    return `Please enter at least ${minEntries} ${fieldLabel} entr${minEntries === 1 ? "y" : "ies"}.`;
  }
  for (const entry of normalized) {
    if (!entry.name && entry.phone) {
      return `${fieldLabel}: a phone number requires a name on the same entry.`;
    }
    if (entry.phone && phoneRegex && !phoneRegex.test(entry.phone)) {
      return `${fieldLabel}: phone numbers must be 11 digits and start with 09.`;
    }
  }

  return "";
};

export const sanitizeListForSubmission = (value, minEntries = DEFAULT_MIN_LIST_ENTRIES) =>
  normalizeListValue(value, minEntries)
    .filter((entry) => entry.name.length > 0)
    .map((entry) => ({
      name: entry.name,
      ...(entry.phone ? { phone: entry.phone } : {}),
    }));

export const isListCredentialValue = (value) => {
  if (Array.isArray(value)) return value.every((entry) => entry && typeof entry === "object" && "name" in entry);
  if (value && typeof value === "object") {
    return Array.isArray(value.godfathers) || Array.isArray(value.godmothers) || Array.isArray(value.entries);
  }
  return false;
};

export const formatListForDisplay = (value) => {
  const entries = toEntryArray(value);
  if (entries.length === 0) return "Not provided";
  return entries
    .map((entry, index) => {
      const name = String(entry?.name || "").trim() || "Not provided";
      const phone = String(entry?.phone || "").trim();
      return `${index + 1}. ${name}${phone ? ` (${phone})` : ""}`;
    })
    .join("\n");
};

export const isGodparentsSacramentKey = (key) => {
  const normalized = String(key || "").trim().toLowerCase();
  return normalized === "marriage" || normalized === "baptism" || normalized === "christening";
};

export const ensureListField = (fields) => (Array.isArray(fields) ? [...fields] : []);
