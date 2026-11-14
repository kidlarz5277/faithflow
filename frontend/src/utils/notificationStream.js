const listeners = new Set();
let eventSource = null;
let currentUrl = "";

const emit = (type, event) => {
  listeners.forEach((listener) => {
    if (type === "connected") {
      listener.onConnected?.(event);
      return;
    }
    listener.onNotification?.(event);
  });
};

const connect = (url) => {
  if (eventSource && currentUrl === url) return;
  eventSource?.close();
  currentUrl = url;
  eventSource = new EventSource(url);
  eventSource.addEventListener("connected", (event) => emit("connected", event));
  eventSource.addEventListener("notification", (event) => emit("notification", event));
};

const disconnectIfIdle = () => {
  if (listeners.size > 0) return;
  eventSource?.close();
  eventSource = null;
  currentUrl = "";
};

export function subscribeNotificationStream(url, handlers = {}) {
  if (!url) return () => {};
  listeners.add(handlers);
  connect(url);
  return () => {
    listeners.delete(handlers);
    disconnectIfIdle();
  };
}
