// Authorizes the parish Gmail for the Gmail API and saves the refresh token to backend/.env.
// Needs PRIEST_GMAIL_OAUTH_USER, PRIEST_GMAIL_OAUTH_CLIENT_ID, and PRIEST_GMAIL_OAUTH_CLIENT_SECRET in backend/.env.
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const dotenv = require("dotenv");

const envPath = path.join(__dirname, "..", ".env");
dotenv.config({ path: envPath, quiet: true });

const user = String(process.env.PRIEST_GMAIL_OAUTH_USER || "").trim();
const clientId = String(process.env.PRIEST_GMAIL_OAUTH_CLIENT_ID || "").trim();
const clientSecret = String(process.env.PRIEST_GMAIL_OAUTH_CLIENT_SECRET || "").trim();
const missing = [
  ["PRIEST_GMAIL_OAUTH_USER", user],
  ["PRIEST_GMAIL_OAUTH_CLIENT_ID", clientId],
  ["PRIEST_GMAIL_OAUTH_CLIENT_SECRET", clientSecret],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  console.error(`Add these to backend/.env first: ${missing.join(", ")}`);
  process.exit(1);
}

const saveRefreshToken = (token) => {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const newline = current.includes("\r\n") ? "\r\n" : "\n";
  const line = `PRIEST_GMAIL_OAUTH_REFRESH_TOKEN=${token}`;
  const pattern = /^PRIEST_GMAIL_OAUTH_REFRESH_TOKEN=.*$/m;
  const next = pattern.test(current)
    ? current.replace(pattern, () => line)
    : `${current}${current && !current.endsWith("\n") ? newline : ""}${line}${newline}`;
  fs.writeFileSync(envPath, next);
};

const state = crypto.randomBytes(24).toString("hex");
let redirectUri = "";

const finish = (res, statusCode, message, exitCode) => {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
  server.close();
  clearTimeout(timer);
  process.exitCode = exitCode;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404);
    res.end();
    return;
  }
  if (url.searchParams.get("state") !== state) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("This sign-in link is not valid. Run the command again.");
    return;
  }
  const authError = url.searchParams.get("error");
  if (authError) {
    console.error(`Google sign-in was not completed: ${authError}`);
    finish(res, 400, "Google sign-in was not completed. You can close this tab.", 1);
    return;
  }
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: url.searchParams.get("code") || "",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.refresh_token) {
      throw new Error(payload.error || `Google returned status ${response.status} without a refresh token`);
    }
    if (!String(payload.scope || "").includes("https://www.googleapis.com/auth/gmail.send")) {
      throw new Error("The gmail.send permission was not granted");
    }
    saveRefreshToken(payload.refresh_token);
    console.log("Saved PRIEST_GMAIL_OAUTH_REFRESH_TOKEN to backend/.env.");
    console.log("Copy it from backend/.env to the Render environment. Keep it private.");
    finish(res, 200, "Gmail is authorized. You can close this tab.", 0);
  } catch (error) {
    console.error(`Unable to authorize Gmail: ${error.message}`);
    finish(res, 500, "Unable to authorize Gmail. Check the terminal, then close this tab.", 1);
  }
});

const timer = setTimeout(() => {
  console.error("Timed out waiting for Google sign-in. Run the command again.");
  server.close();
  process.exitCode = 1;
}, 5 * 60 * 1000);

server.listen(0, "127.0.0.1", () => {
  redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    login_hint: user,
    state,
  }).toString();
  console.log(`Open this link and sign in as ${user}:\n\n${authUrl}\n`);
});
