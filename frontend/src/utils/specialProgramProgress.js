export const resolveSpecialProgramBaseType = (programName) => {
  const normalized = String(programName || "").trim().toLowerCase();
  if (!normalized) return "";
  if (
    normalized.includes("kasalan") ||
    normalized.includes("kasal") ||
    normalized.includes("wedding") ||
    normalized.includes("marriage")
  ) {
    return "Marriage";
  }
  if (
    normalized.includes("binyagan") ||
    normalized.includes("binyag") ||
    normalized.includes("baptism") ||
    normalized.includes("christening")
  ) {
    return "Baptism";
  }
  return "";
};

export const isSpecialProgramAppointment = (item) => {
  if (Number(item?.s_sacramentID) > 0) return true;
  const requestType = String(item?.requestType || "").trim().toLowerCase();
  return requestType.includes("special sacrament");
};

export const normalizeSpecialProgramSacramentalType = (rawSacramentName) => {
  const rawValue = String(rawSacramentName || "").trim().toLowerCase();
  const aliased = resolveSpecialProgramBaseType(rawValue);
  if (aliased) return aliased;
  if (rawValue === "marriage") return "Marriage";
  if (rawValue === "funeral mass" || rawValue === "funeral-mass") return "Funeral Mass";
  if (rawValue === "baptism" || rawValue === "christening") return "Baptism";
  if (rawValue === "blessing" || rawValue === "blessings") return "Blessing";
  return "";
};
