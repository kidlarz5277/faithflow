const AUTH_STORAGE_KEY = "faithflow_auth";

// Every logout removes this saved login, so the secure session cookie is cleared at the same time.
export const installSessionLogoutBridge = () => {
  if (typeof Storage === "undefined" || Storage.prototype.__faithflowLogoutBridge) return;
  const removeItem = Storage.prototype.removeItem;
  Object.defineProperty(Storage.prototype, "__faithflowLogoutBridge", { value: true });
  Storage.prototype.removeItem = function removeItemWithSessionLogout(key) {
    const wasSignedIn = key === AUTH_STORAGE_KEY && this.getItem(key) !== null;
    removeItem.call(this, key);
    if (wasSignedIn) {
      void fetch("/api/logout", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {});
    }
  };
};
