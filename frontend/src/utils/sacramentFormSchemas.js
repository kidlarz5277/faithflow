import { DEFAULT_BAPTISM_GODPARENT_FIELDS, DEFAULT_GODPARENTS_FIELD, DEFAULT_MIN_LIST_ENTRIES } from "./listField";

const DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG = {
  version: 1,
  sacraments: {
    marriage: {
      label: "Marriage",
      aliases: ["marriage"],
      requirements: {
        documents: [
          "Cenomar",
          "Civil Marriage Contract",
          "Permit Mix Marriage",
          "Birth Certificate",
          "Confirmation Certificate",
          "Parish Permit",
          "Marriage Contract",
          "Marriage License",
        ],
        nonDocuments: ["Bec-Seminar", "Tawag", "Priest Interview", "Pre-Cana Seminar"],
      },
      fields: [
        { key: "brideName", label: "Bride Full Name", type: "text", required: true, placeholder: "Enter bride full name" },
        { key: "groomName", label: "Groom Full Name", type: "text", required: true, placeholder: "Enter groom full name" },
        { key: "brideAge", label: "Bride Age", type: "number", required: true, placeholder: "Enter bride age" },
        { key: "groomAge", label: "Groom Age", type: "number", required: true, placeholder: "Enter groom age" },
        { key: "bridePhoneNumber", label: "Bride Phone Number", type: "tel", required: true, placeholder: "Enter bride contact number" },
        { key: "groomPhoneNumber", label: "Groom Phone Number", type: "tel", required: true, placeholder: "Enter groom contact number" },
        { key: "brideAddress", label: "Bride Address", type: "text", required: true, placeholder: "Enter bride address" },
        { key: "groomAddress", label: "Groom Address", type: "text", required: true, placeholder: "Enter groom address" },
        { key: "brideBirthCertificateFile", label: "Bride Birth Certificate", type: "file", required: true, accept: ".pdf,.docx,image/*" },
        { key: "groomBirthCertificateFile", label: "Groom Birth Certificate", type: "file", required: true, accept: ".pdf,.docx,image/*" },
        { ...DEFAULT_GODPARENTS_FIELD },
      ],
    },
    baptism: {
      label: "Baptism",
      aliases: ["baptism", "christening"],
      requirements: {
        documents: ["Endorsement Form", "Birth Certificate", "Marriage Contract of Parents"],
        nonDocuments: ["Seminar 1", "Seminar 2"],
      },
      fields: [
        { key: "childFullName", label: "Child Full Name", type: "text", required: true, placeholder: "Enter child full name" },
        { key: "childBirthDate", label: "Birth Date", type: "date", required: true },
        { key: "fatherName", label: "Father's Name", type: "text", required: true, placeholder: "Enter father's name" },
        { key: "motherName", label: "Mother's Name", type: "text", required: true, placeholder: "Enter mother's name" },
        { key: "address", label: "Address", type: "text", required: true, placeholder: "Enter complete address" },
        { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number" },
        ...DEFAULT_BAPTISM_GODPARENT_FIELDS,
      ],
    },
    death_mass: {
      label: "Funeral Mass",
      aliases: ["funeral mass", "funeral-mass", "death mass", "death-mass"],
      requirements: {
        documents: ["Endorsement Form", "Death Certificate"],
        nonDocuments: [],
      },
      fields: [
        { key: "deceasedName", label: "Deceased Full Name", type: "text", required: true, placeholder: "Enter deceased full name" },
        { key: "dateOfDeath", label: "Date of Death", type: "date", required: true },
        { key: "familyContactName", label: "Family Contact Name", type: "text", required: true, placeholder: "Enter family contact name" },
        { key: "relationToDeceased", label: "Relationship to Deceased", type: "text", required: true, placeholder: "Enter relationship" },
        { key: "deceasedAddress", label: "Deceased Address", type: "text", required: true, placeholder: "Enter deceased address" },
        { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number" },
      ],
    },
    blessing: {
      label: "Blessing",
      aliases: ["blessing", "blessings"],
      requirements: {
        documents: [],
        nonDocuments: [],
      },
      fields: [
        {
          key: "blessingType",
          label: "Blessing Type",
          type: "select",
          required: true,
          options: ["House Blessing", "Vehicle Blessing", "Business Blessing", "Other Blessing"],
        },
        { key: "blessingTarget", label: "What will be blessed?", type: "text", required: true, placeholder: "Ex. New house at Zone 2" },
        { key: "address", label: "Address", type: "text", required: true, placeholder: "Enter complete address" },
        { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number" },
      ],
    },
    default: {
      label: "Default",
      aliases: [],
      requirements: {
        documents: [],
        nonDocuments: [],
      },
      fields: [
        { key: "address", label: "Address", type: "text", required: true, placeholder: "Enter complete address" },
        { key: "phoneNumber", label: "Phone Number", type: "tel", required: true, placeholder: "Enter contact number" },
      ],
    },
  },
};

const MARRIAGE_BRIDE_ADDRESS_FIELD = {
  key: "brideAddress",
  label: "Bride Address",
  type: "text",
  required: true,
  placeholder: "Enter bride address",
};
const MARRIAGE_GROOM_ADDRESS_FIELD = {
  key: "groomAddress",
  label: "Groom Address",
  type: "text",
  required: true,
  placeholder: "Enter groom address",
};

const ensureMarriageSeparateAddressFields = (fields) => {
  const nextFields = Array.isArray(fields) ? fields.map((field) => ({ ...(field || {}) })) : [];
  const keyOf = (field) => String(field?.key || "").trim();
  const existingBrideAddress = nextFields.find((field) => keyOf(field) === "brideAddress");
  const existingGroomAddress = nextFields.find((field) => keyOf(field) === "groomAddress");
  const withoutAddresses = nextFields.filter((field) => {
    const key = keyOf(field);
    return key !== "address" && key !== "brideAddress" && key !== "groomAddress";
  });
  const groomPhoneIndex = withoutAddresses.findIndex((field) => keyOf(field) === "groomPhoneNumber");
  const bridePhoneIndex = withoutAddresses.findIndex((field) => keyOf(field) === "bridePhoneNumber");
  const insertAt =
    groomPhoneIndex > -1 || bridePhoneIndex > -1
      ? Math.max(groomPhoneIndex, bridePhoneIndex) + 1
      : withoutAddresses.length;

  withoutAddresses.splice(
    insertAt,
    0,
    {
      ...MARRIAGE_BRIDE_ADDRESS_FIELD,
      ...(existingBrideAddress || {}),
      ...MARRIAGE_BRIDE_ADDRESS_FIELD,
    },
    {
      ...MARRIAGE_GROOM_ADDRESS_FIELD,
      ...(existingGroomAddress || {}),
      ...MARRIAGE_GROOM_ADDRESS_FIELD,
    },
  );
  return withoutAddresses;
};

const normalizeSchemaName = (value) => String(value || "").trim().toLowerCase();

const cloneDefaultSchemaConfig = () => JSON.parse(JSON.stringify(DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG));

const toSchemaKeyFromName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const sanitizeField = (field, index) => {
  const key = String(field?.key || "").trim();
  const label = String(field?.label || key || `Field ${index + 1}`).trim();
  const type = String(field?.type || "text").trim().toLowerCase();
  const sanitized = {
    key: key || `field_${index + 1}`,
    label: label || `Field ${index + 1}`,
    type: type || "text",
    required: field?.required !== false,
    placeholder: String(field?.placeholder || "").trim(),
    accept: String(field?.accept || "").trim(),
    options: Array.isArray(field?.options)
      ? field.options.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  };
  if (type === "list") {
    sanitized.minEntries = Math.max(1, Number(field?.minEntries) || DEFAULT_MIN_LIST_ENTRIES);
  }
  return sanitized;
};

// Pass includeDefaults: false to keep the config limited to what the server actually returned.
export const normalizeSacramentFormSchemaConfig = (rawConfig, { includeDefaults = true } = {}) => {
  const fallback = cloneDefaultSchemaConfig();
  if (!rawConfig || typeof rawConfig !== "object" || typeof rawConfig.sacraments !== "object") {
    if (!includeDefaults) return { version: fallback.version, sacraments: {}, archivedSacraments: {} };
    return { ...fallback, archivedSacraments: {} };
  }
  const rawArchivedSacraments =
    rawConfig.archivedSacraments && typeof rawConfig.archivedSacraments === "object"
      ? rawConfig.archivedSacraments
      : {};
  const archivedDefaultKeys = new Set(
    Object.keys(rawArchivedSacraments)
      .map((key) => toSchemaKeyFromName(key))
      .filter(Boolean),
  );

  const nextConfig = {
    version: Number(rawConfig.version) || fallback.version,
    sacraments: {},
    archivedSacraments: {},
  };
  const defaultEntries = Object.entries(fallback.sacraments);
  const resolveFieldSource = (rawFields, fallbackFields) => {
    if (Array.isArray(rawFields) && (rawFields.length > 0 || !includeDefaults)) return rawFields;
    return includeDefaults ? fallbackFields : [];
  };

  for (const [key, fallbackSchema] of defaultEntries) {
    if (key !== "default" && archivedDefaultKeys.has(key)) continue;
    const candidate = rawConfig.sacraments[key];
    if (!includeDefaults && !candidate) continue;
    const aliases = Array.isArray(candidate?.aliases)
      ? candidate.aliases.map((item) => normalizeSchemaName(item)).filter(Boolean)
      : fallbackSchema.aliases;
    const documents = Array.isArray(candidate?.requirements?.documents)
      ? candidate.requirements.documents.map((item) => String(item || "").trim()).filter(Boolean)
      : fallbackSchema.requirements.documents;
    const nonDocuments = Array.isArray(candidate?.requirements?.nonDocuments)
      ? candidate.requirements.nonDocuments.map((item) => String(item || "").trim()).filter(Boolean)
      : fallbackSchema.requirements.nonDocuments;
    const fieldSource = resolveFieldSource(candidate?.fields, fallbackSchema.fields);

    nextConfig.sacraments[key] = {
      label: String(candidate?.label || fallbackSchema.label).trim() || fallbackSchema.label,
      aliases: aliases.length > 0 || key === "default" ? aliases : fallbackSchema.aliases,
      requirements: { documents, nonDocuments },
      fields: fieldSource.map((field, index) => sanitizeField(field, index)),
    };
  }

  const customEntries = Object.entries(rawConfig.sacraments).filter(([key]) => !Object.prototype.hasOwnProperty.call(fallback.sacraments, key));
  for (const [rawKey, rawSchema] of customEntries) {
    const normalizedKey = toSchemaKeyFromName(rawKey);
    if (!normalizedKey || normalizedKey === "default") continue;
    if (Object.prototype.hasOwnProperty.call(nextConfig.sacraments, normalizedKey)) continue;
    const label = String(rawSchema?.label || rawKey).trim();
    const aliases = Array.isArray(rawSchema?.aliases)
      ? rawSchema.aliases.map((item) => normalizeSchemaName(item)).filter(Boolean)
      : [];
    const documents = Array.isArray(rawSchema?.requirements?.documents)
      ? rawSchema.requirements.documents.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const nonDocuments = Array.isArray(rawSchema?.requirements?.nonDocuments)
      ? rawSchema.requirements.nonDocuments.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const fieldSource = resolveFieldSource(rawSchema?.fields, fallback.sacraments.default.fields);
    nextConfig.sacraments[normalizedKey] = {
      label: label || rawKey,
      aliases: aliases.length > 0 ? aliases : [normalizeSchemaName(label || rawKey)],
      requirements: { documents, nonDocuments },
      fields: fieldSource.map((field, index) => sanitizeField(field, index)),
    };
  }

  for (const [rawKey, rawSchema] of Object.entries(rawArchivedSacraments)) {
    const normalizedKey = toSchemaKeyFromName(rawKey);
    if (!normalizedKey || normalizedKey === "default") continue;
    if (Object.prototype.hasOwnProperty.call(nextConfig.sacraments, normalizedKey)) continue;
    if (Object.prototype.hasOwnProperty.call(nextConfig.archivedSacraments, normalizedKey)) continue;
    const fallbackSchema = fallback.sacraments[normalizedKey] || fallback.sacraments.default;
    const label = String(rawSchema?.label || rawKey).trim();
    const aliases = Array.isArray(rawSchema?.aliases)
      ? rawSchema.aliases.map((item) => normalizeSchemaName(item)).filter(Boolean)
      : Array.isArray(fallbackSchema?.aliases)
        ? fallbackSchema.aliases
        : [];
    const documents = Array.isArray(rawSchema?.requirements?.documents)
      ? rawSchema.requirements.documents.map((item) => String(item || "").trim()).filter(Boolean)
      : Array.isArray(fallbackSchema?.requirements?.documents)
        ? fallbackSchema.requirements.documents
        : [];
    const nonDocuments = Array.isArray(rawSchema?.requirements?.nonDocuments)
      ? rawSchema.requirements.nonDocuments.map((item) => String(item || "").trim()).filter(Boolean)
      : Array.isArray(fallbackSchema?.requirements?.nonDocuments)
        ? fallbackSchema.requirements.nonDocuments
        : [];
    const fieldSource = resolveFieldSource(rawSchema?.fields, fallback.sacraments.default.fields);
    nextConfig.archivedSacraments[normalizedKey] = {
      label: label || rawKey,
      aliases: aliases.length > 0 ? aliases : [normalizeSchemaName(label || rawKey)],
      requirements: { documents, nonDocuments },
      fields: fieldSource.map((field, index) => sanitizeField(field, index)),
    };
  }

  return nextConfig;
};

export const getSacramentSchemaByName = (config, sacramentName) => {
  const normalized = normalizeSchemaName(sacramentName);
  const normalizedConfig = normalizeSacramentFormSchemaConfig(config, { includeDefaults: false });
  const entries = Object.entries(normalizedConfig.sacraments);
  for (const [key, schema] of entries) {
    const aliases = Array.isArray(schema.aliases) ? schema.aliases.map((item) => normalizeSchemaName(item)) : [];
    if (
      aliases.includes(normalized) ||
      normalizeSchemaName(key) === normalized ||
      normalizeSchemaName(schema.label) === normalized
    ) {
      if (key === "marriage" || normalized.includes("marriage")) {
        return { ...schema, fields: ensureMarriageSeparateAddressFields(schema.fields) };
      }
      return schema;
    }
    if (normalized === "christening" && key === "baptism") return schema;
  }
  return normalizedConfig.sacraments.default;
};

export const getRequirementItems = (config, schemaKey, requirementKey) => {
  const normalizedConfig = normalizeSacramentFormSchemaConfig(config);
  const target = normalizedConfig.sacraments[schemaKey] || normalizedConfig.sacraments.default;
  const values = target?.requirements?.[requirementKey];
  return Array.isArray(values) ? values : [];
};

export { DEFAULT_SACRAMENT_FORM_SCHEMA_CONFIG };
