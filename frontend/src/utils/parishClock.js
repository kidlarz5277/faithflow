let clockOffsetMs = 0;
let syncStarted = false;

export const getTrustedNow = () => new Date(Date.now() + clockOffsetMs);

export const syncParishClock = async () => {
  const startedAt = Date.now();
  const response = await fetch("/api/server-time", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to read server time.");
  const payload = await response.json();
  const serverMs = new Date(payload?.now || "").getTime();
  if (!Number.isFinite(serverMs)) throw new Error("Server time is invalid.");
  const latencyMs = Math.max(0, Date.now() - startedAt) / 2;
  clockOffsetMs = serverMs + latencyMs - Date.now();
};

export const startParishClock = () => {
  if (syncStarted || typeof window === "undefined") return;
  syncStarted = true;
  const sync = () => {
    syncParishClock().catch(() => {});
  };
  sync();
  window.setInterval(sync, 5 * 60 * 1000);
  window.addEventListener("focus", sync);
};
