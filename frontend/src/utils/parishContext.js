export const DEFAULT_PARISH_ADMIN_ID = 1;

export function resolveParishAdminID(parishId) {
  const parsed = Number(parishId);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return DEFAULT_PARISH_ADMIN_ID;
}
