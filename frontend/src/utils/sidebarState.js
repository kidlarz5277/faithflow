const SIDEBAR_STATE_KEY = "faithflow_sidebar_open";
const COMPACT_NAV_QUERY = "(max-width: 900px)";

export const isCompactNav = () =>
  typeof window !== "undefined" && window.matchMedia(COMPACT_NAV_QUERY).matches;

export const getInitialSidebarOpen = () => {
  if (typeof window === "undefined") return true;
  if (isCompactNav()) return false;
  try {
    const rawValue = window.localStorage.getItem(SIDEBAR_STATE_KEY);
    if (rawValue === null) return true;
    const parsedValue = JSON.parse(rawValue);
    return typeof parsedValue === "boolean" ? parsedValue : true;
  } catch {
    return true;
  }
};

export const toggleSidebarOpen = (currentValue) => {
  const nextValue = !currentValue;
  if (typeof window !== "undefined" && !isCompactNav()) {
    try {
      window.localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(nextValue));
    } catch {
      // Ignore storage errors and keep UI responsive.
    }
  }
  return nextValue;
};
