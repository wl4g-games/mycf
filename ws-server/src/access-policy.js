const DEFAULT_BROWSER_ORIGINS = Object.freeze([
  "https://wl4g-games.github.io",
  "https://mycf.wl4g.com",
]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function firstHeaderValue(value) {
  return String(value || "").split(",", 1)[0].trim();
}

function normalizeOrigin(value) {
  if (!value) return "";
  try {
    const origin = new URL(value).origin;
    return origin === "null" ? "" : origin;
  } catch {
    return "";
  }
}

function normalizeHost(value) {
  if (!value) return "";
  try { return new URL(`http://${value}`).hostname.replace(/^\[|\]$/g, ""); } catch { return ""; }
}

function normalizeAddress(value) {
  return firstHeaderValue(value).replace(/^::ffff:/, "") || "unknown";
}

export function requestIp(request = {}) {
  const directAddress = normalizeAddress(request.socket?.remoteAddress);
  const trustedProxy = process.env.VERCEL === "1" || LOOPBACK_HOSTS.has(directAddress);
  if (trustedProxy && request.headers?.["x-forwarded-for"]) {
    return normalizeAddress(request.headers["x-forwarded-for"]);
  }
  return directAddress;
}

export function browserOriginAllowed(request = {}, configuredOrigins = process.env.MYCF_ALLOWED_ORIGINS || "") {
  const rawOrigin = firstHeaderValue(request.headers?.origin);
  if (!rawOrigin) return true;
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) return false;

  const originUrl = new URL(origin);
  const requestHost = firstHeaderValue(request.headers?.["x-forwarded-host"] || request.headers?.host);
  if (requestHost && originUrl.host === requestHost.toLowerCase()) return true;
  if (LOOPBACK_HOSTS.has(originUrl.hostname) && LOOPBACK_HOSTS.has(normalizeHost(requestHost))) return true;

  const allowed = new Set(DEFAULT_BROWSER_ORIGINS);
  const configured = Array.isArray(configuredOrigins) ? configuredOrigins : String(configuredOrigins).split(",");
  for (const value of configured) {
    const normalized = normalizeOrigin(String(value).trim());
    if (normalized) allowed.add(normalized);
  }
  return allowed.has(origin);
}
