const crypto = require("crypto");

const SESSION_COOKIE_NAME = "ff_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_VERSION = 1;
const MIN_SESSION_SECRET_LENGTH = 32;
const ACCOUNT_TYPES = new Set(["user", "priest", "admin"]);
const INTERNAL_SERVICE_HEADER = "x-faithflow-internal-mailer";

const getSessionSecret = () => {
  const secret = String(process.env.SESSION_SECRET || "").trim();
  return secret.length >= MIN_SESSION_SECRET_LENGTH ? secret : "";
};

const safeEqual = (left, right) => {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
};

const signPayload = (encodedPayload, secret) =>
  crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");

const createSessionToken = ({ accountType, accountID }, now = Date.now()) => {
  const secret = getSessionSecret();
  const normalizedType = String(accountType || "").trim().toLowerCase();
  const normalizedID = Number(accountID);
  if (!secret || !ACCOUNT_TYPES.has(normalizedType) || !Number.isInteger(normalizedID) || normalizedID <= 0) {
    return "";
  }
  const issuedAt = Math.floor(now / 1000);
  const encodedPayload = Buffer.from(
    JSON.stringify({
      v: SESSION_VERSION,
      type: normalizedType,
      id: normalizedID,
      iat: issuedAt,
      exp: issuedAt + SESSION_TTL_SECONDS,
    }),
  ).toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
};

const verifySessionToken = (token, now = Date.now()) => {
  const secret = getSessionSecret();
  const parts = String(token || "").split(".");
  if (!secret || parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!safeEqual(parts[1], signPayload(parts[0], secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const accountID = Number(payload?.id);
    const expiresAt = Number(payload?.exp);
    if (
      payload?.v !== SESSION_VERSION ||
      !ACCOUNT_TYPES.has(payload?.type) ||
      !Number.isInteger(accountID) ||
      accountID <= 0 ||
      !Number.isInteger(expiresAt) ||
      expiresAt <= Math.floor(now / 1000)
    ) {
      return null;
    }
    return { accountType: payload.type, accountID, expiresAt };
  } catch {
    return null;
  }
};

const readCookie = (cookieHeader, name) => {
  for (const part of String(cookieHeader || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return "";
};

const isSecureRequest = (req) =>
  process.env.NODE_ENV === "production" ||
  String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() === "https";

const buildSessionCookie = (req, value, maxAgeSeconds) =>
  [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    ...(isSecureRequest(req) ? ["Secure"] : []),
  ].join("; ");

const setSessionCookie = (req, res, account) => {
  const token = createSessionToken(account);
  if (!token) {
    console.warn("Login session was not created. Set SESSION_SECRET to at least 32 characters.");
    return false;
  }
  res.append("Set-Cookie", buildSessionCookie(req, token, SESSION_TTL_SECONDS));
  return true;
};

const clearSessionCookie = (req, res) => {
  res.append("Set-Cookie", buildSessionCookie(req, "", 0));
};

// Identifies the caller for later route checks. It does not block any request.
const attachSession = (req, _res, next) => {
  req.auth = verifySessionToken(readCookie(req.headers?.cookie, SESSION_COOKIE_NAME));
  next();
};

const sessionCookieHeaders = (req) => {
  const token = readCookie(req.headers?.cookie, SESSION_COOKIE_NAME);
  return token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {};
};

const internalServiceHeaders = () => {
  const token = String(process.env.INTERNAL_SERVICE_TOKEN || "").trim();
  return token ? { [INTERNAL_SERVICE_HEADER]: token } : {};
};

const isInternalServiceRequest = (req) => {
  const expected = String(process.env.INTERNAL_SERVICE_TOKEN || "").trim();
  const received = String(req.headers?.[INTERNAL_SERVICE_HEADER] || "").trim();
  return Boolean(expected && received) && safeEqual(received, expected);
};

module.exports = {
  INTERNAL_SERVICE_HEADER,
  SESSION_COOKIE_NAME,
  attachSession,
  clearSessionCookie,
  createSessionToken,
  internalServiceHeaders,
  isInternalServiceRequest,
  readCookie,
  sessionCookieHeaders,
  setSessionCookie,
  verifySessionToken,
};
