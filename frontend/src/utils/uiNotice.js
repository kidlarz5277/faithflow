const UI_NOTICE_STORAGE_KEY = "faithflow_ui_notice";
const UI_NOTICE_EVENT_NAME = "faithflow-ui-notice";

const normalizeNotice = (notice) => {
  const message = String(notice?.message || "").trim();
  if (!message) return null;
  const type = String(notice?.type || "success").trim().toLowerCase();
  return {
    message,
    type: type === "error" ? "error" : "success",
    createdAt: Date.now(),
  };
};

export const pushUiNotice = (message, type = "success") => {
  if (typeof window === "undefined") return;
  const payload = normalizeNotice({ message, type });
  if (!payload) return;
  try {
    sessionStorage.setItem(UI_NOTICE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures; in-memory event still works.
  }
  window.dispatchEvent(new CustomEvent(UI_NOTICE_EVENT_NAME, { detail: payload }));
};

export const consumeStoredUiNotice = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(UI_NOTICE_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(UI_NOTICE_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    return normalizeNotice(parsed);
  } catch {
    return null;
  }
};

export const uiNoticeEventName = UI_NOTICE_EVENT_NAME;
