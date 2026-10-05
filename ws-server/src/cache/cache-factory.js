import { createClient } from "@redis/client";
import { MemoryCache } from "./memory-cache.js";
import { RedisCache } from "./redis-cache.js";

const REDIS_ENV_KEYS = [
  "MYCF_REDIS_URL",
  "MYCF_REDIS_HOST",
  "MYCF_REDIS_PORT",
  "MYCF_REDIS_TLS",
  "MYCF_REDIS_USERNAME",
  "MYCF_REDIS_USER",
  "MYCF_REDIS_PASSWORD",
  "MYCF_REDIS_DATABASE",
  "MYCF_REDIS_PREFIX",
];
const REDIS_RECONNECT_BASE_DELAY_MS = 100;
const REDIS_RECONNECT_MAX_DELAY_MS = 2000;
const REDIS_STARTUP_TIMEOUT_MS = 7000;

function redisReconnectStrategy(retries) {
  return Math.min(
    REDIS_RECONNECT_MAX_DELAY_MS,
    REDIS_RECONNECT_BASE_DELAY_MS * (2 ** Math.max(0, retries)),
  );
}

function optionalSetting(env, name) {
  const value = env[name];
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized.length ? normalized : undefined;
}

function rawSetting(env, name) {
  const value = env[name];
  if (value === undefined || value === null) return undefined;
  const normalized = String(value);
  return normalized.length ? normalized : undefined;
}

function parseInteger(value, name, { min, max = Number.MAX_SAFE_INTEGER }) {
  if (!/^\d+$/.test(value)) throw new TypeError(`${name} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new RangeError(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function parseBoolean(value, name) {
  if (value === undefined) return undefined;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new TypeError(`${name} must be true or false.`);
}

function parseRedisUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new TypeError("MYCF_REDIS_URL is not a valid URL."); }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new TypeError("MYCF_REDIS_URL must use redis:// or rediss://.");
  }
  if (!parsed.hostname) throw new TypeError("MYCF_REDIS_URL must include a host.");
  const path = parsed.pathname.replace(/^\//, "");
  const database = path ? parseInteger(path, "Redis URL database", { min: 0 }) : undefined;
  return {
    host: parsed.hostname.replace(/^\[|\]$/g, ""),
    port: parsed.port ? parseInteger(parsed.port, "Redis URL port", { min: 1, max: 65535 }) : 6379,
    tls: parsed.protocol === "rediss:",
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    database,
  };
}

export function resolveCacheConfig(env = process.env) {
  const hasRedisSettings = REDIS_ENV_KEYS.some(name => optionalSetting(env, name) !== undefined);
  if (!hasRedisSettings) return { backend: "memory" };

  const rawUrl = optionalSetting(env, "MYCF_REDIS_URL");
  const configuredHost = optionalSetting(env, "MYCF_REDIS_HOST");
  const configuredPort = optionalSetting(env, "MYCF_REDIS_PORT");
  if (Boolean(configuredHost) !== Boolean(configuredPort)) {
    throw new Error("MYCF_REDIS_HOST and MYCF_REDIS_PORT must be configured together.");
  }
  if (!rawUrl && !configuredHost) {
    throw new Error("Redis settings require MYCF_REDIS_URL or MYCF_REDIS_HOST with MYCF_REDIS_PORT.");
  }

  const urlConfig = rawUrl ? parseRedisUrl(rawUrl) : null;
  const pairConfig = configuredHost ? {
    host: configuredHost,
    port: parseInteger(configuredPort, "MYCF_REDIS_PORT", { min: 1, max: 65535 }),
  } : null;
  if (urlConfig && pairConfig
    && (urlConfig.host.toLowerCase() !== pairConfig.host.toLowerCase() || urlConfig.port !== pairConfig.port)) {
    throw new Error("MYCF_REDIS_URL and MYCF_REDIS_HOST/MYCF_REDIS_PORT describe different endpoints.");
  }

  const username = optionalSetting(env, "MYCF_REDIS_USERNAME");
  const legacyUsername = optionalSetting(env, "MYCF_REDIS_USER");
  if (username && legacyUsername && username !== legacyUsername) {
    throw new Error("MYCF_REDIS_USERNAME and MYCF_REDIS_USER must not conflict.");
  }
  const tls = parseBoolean(optionalSetting(env, "MYCF_REDIS_TLS"), "MYCF_REDIS_TLS");
  if (urlConfig && tls !== undefined && tls !== urlConfig.tls) {
    throw new Error("MYCF_REDIS_TLS conflicts with the MYCF_REDIS_URL protocol.");
  }
  const databaseSetting = optionalSetting(env, "MYCF_REDIS_DATABASE");
  const database = databaseSetting === undefined
    ? urlConfig?.database
    : parseInteger(databaseSetting, "MYCF_REDIS_DATABASE", { min: 0 });
  const endpoint = urlConfig || pairConfig;
  const clientOptions = {
    socket: {
      host: endpoint.host,
      port: endpoint.port,
      tls: tls ?? endpoint.tls ?? false,
      connectTimeout: 5000,
      reconnectStrategy: redisReconnectStrategy,
    },
    disableOfflineQueue: true,
  };
  const resolvedUsername = username || legacyUsername || urlConfig?.username;
  const password = rawSetting(env, "MYCF_REDIS_PASSWORD") ?? urlConfig?.password;
  if (resolvedUsername !== undefined) clientOptions.username = resolvedUsername;
  if (password !== undefined) clientOptions.password = password;
  if (database !== undefined) clientOptions.database = database;

  return {
    backend: "redis",
    prefix: env.MYCF_REDIS_PREFIX === undefined || env.MYCF_REDIS_PREFIX === null
      ? "mycf:"
      : String(env.MYCF_REDIS_PREFIX),
    clientOptions,
  };
}

export async function createCache({
  env = process.env,
  redisClientFactory = createClient,
  redisStartupTimeoutMs = REDIS_STARTUP_TIMEOUT_MS,
  memoryOptions,
  onError,
} = {}) {
  const config = resolveCacheConfig(env);
  if (config.backend === "memory") {
    const cache = new MemoryCache({ ...memoryOptions, onError: onError || memoryOptions?.onError });
    await cache.connect();
    return cache;
  }

  const client = redisClientFactory(config.clientOptions);
  const cache = new RedisCache({ client, prefix: config.prefix, onError });
  let startupTimer;
  try {
    await Promise.race([
      cache.connect(),
      new Promise((_, reject) => {
        startupTimer = setTimeout(
          () => reject(new Error("Redis startup connection timed out.")),
          redisStartupTimeoutMs,
        );
      }),
    ]);
  } catch (error) {
    cache.abort();
    await cache.close().catch(() => {});
    throw error;
  } finally {
    clearTimeout(startupTimer);
  }
  return cache;
}
