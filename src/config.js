function readNumberEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric env var ${name}: ${value}`);
  }
  return parsed;
}

function readRequiredEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function toIsoOrThrow(value, fieldName) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date value in ${fieldName}: ${value}`);
  }
  return d.toISOString();
}

function loadConfig() {
  const pollIntervalMs = readNumberEnv("POLL_INTERVAL_MS", 5 * 60 * 1000);
  const overlapMs = readNumberEnv("OVERLAP_MS", 2 * 60 * 1000);
  if (overlapMs > pollIntervalMs) {
    throw new Error("OVERLAP_MS should not exceed POLL_INTERVAL_MS");
  }

  const initialScanDateGT = process.env.INITIAL_SCAN_DATE_GT
    ? toIsoOrThrow(process.env.INITIAL_SCAN_DATE_GT, "INITIAL_SCAN_DATE_GT")
    : null;
  const initialScanDateLT = process.env.INITIAL_SCAN_DATE_LT
    ? toIsoOrThrow(process.env.INITIAL_SCAN_DATE_LT, "INITIAL_SCAN_DATE_LT")
    : null;

  if ((initialScanDateGT && !initialScanDateLT) || (!initialScanDateGT && initialScanDateLT)) {
    throw new Error("INITIAL_SCAN_DATE_GT and INITIAL_SCAN_DATE_LT must be provided together");
  }
  if (initialScanDateGT && initialScanDateLT && new Date(initialScanDateGT) >= new Date(initialScanDateLT)) {
    throw new Error("INITIAL_SCAN_DATE_GT must be earlier than INITIAL_SCAN_DATE_LT");
  }

  return {
    apiBaseUrl: readRequiredEnv("SCAN_API_URL", "https://portal.eventscloud.com/api/scan"),
    apiToken: readRequiredEnv("SCAN_API_TOKEN", "1f04984f4b1044a99e821001b503c184"),
    pollIntervalMs,
    overlapMs,
    requestTimeoutMs: readNumberEnv("REQUEST_TIMEOUT_MS", 30000),
    maxRetries: readNumberEnv("MAX_RETRIES", 3),
    bootstrapStartIso: toIsoOrThrow(
      readRequiredEnv("BOOTSTRAP_START_ISO", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      "BOOTSTRAP_START_ISO"
    ),
    initialScanDateGT,
    initialScanDateLT,
    dataDir: readRequiredEnv("DATA_DIR", "./data"),
    apiPort: readNumberEnv("API_PORT", 3000)
  };
}

module.exports = { loadConfig };
