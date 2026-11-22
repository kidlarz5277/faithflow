const http = require("http");
const https = require("https");
const { INTERNAL_SERVICE_HEADER } = require("./session");

const decodePathForCheck = (value) => {
  let decoded = String(value || "").split(/[?#]/)[0].replace(/\\/g, "/");
  for (let round = 0; round < 3; round += 1) {
    const next = decodeURIComponent(decoded).replace(/\\/g, "/");
    if (next === decoded) break;
    decoded = next;
  }
  const segments = [];
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment.toLowerCase());
  }
  return `/${segments.join("/")}`;
};

const isInternalPath = (url) => {
  const path = decodePathForCheck(url);
  return path === "/internal" || path.startsWith("/internal/");
};

// In production only the main server's port is public, so requests for the admin
// server arrive as /admin-api/* and are streamed to it unchanged, including uploads.
const createAdminServiceProxy = (adminServiceBaseUrl) => {
  const base = new URL(adminServiceBaseUrl);
  const transport = base.protocol === "https:" ? https : http;

  return (req, res) => {
    let target;
    try {
      if (isInternalPath(req.url)) {
        return res.status(404).json({ message: "Not found." });
      }
      target = new URL(`${String(adminServiceBaseUrl).replace(/\/+$/, "")}${req.url}`);
      if (target.origin !== base.origin) {
        return res.status(400).json({ message: "Invalid request path." });
      }
    } catch {
      return res.status(400).json({ message: "Invalid request path." });
    }

    const headers = { ...req.headers, host: target.host };
    delete headers[INTERNAL_SERVICE_HEADER];
    delete headers["x-faithflow-write-source"];

    const proxyReq = transport.request(target, { method: req.method, headers }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on("error", (error) => {
      console.error("Admin service proxy error:", error.message);
      if (!res.headersSent) res.status(502).json({ message: "Admin service is unavailable." });
      else res.end();
    });
    return req.pipe(proxyReq);
  };
};

module.exports = { createAdminServiceProxy, isInternalPath };
