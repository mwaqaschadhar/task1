const { logger } = require("../logger");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toApiDateTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value provided for API query param: ${dateValue}`);
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

class ScanClient {
  constructor(opts) {
    this.baseUrl = opts.baseUrl;
    this.token = opts.token;
    this.requestTimeoutMs = opts.requestTimeoutMs;
    this.maxRetries = opts.maxRetries;
  }

  async fetchScans(params) {
    const url = new URL(this.baseUrl);
    if (params.scanDateGT) {
      url.searchParams.set("scanDateGT", toApiDateTime(params.scanDateGT));
    }
    if (params.scanDateLT) {
      url.searchParams.set("scanDateLT", toApiDateTime(params.scanDateLT));
    }

    let attempt = 0;
    while (true) {
      attempt += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      try {
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: this.token }),
          signal: controller.signal
        });

        if (!res.ok) {
          throw new Error(`Scan API failed: ${res.status} ${res.statusText}`);
        }
        const body = await res.json();
        if (!Array.isArray(body)) {
          throw new Error("Unexpected response format: expected array of scans");
        }
        return body;
      } catch (error) {
        if (attempt > this.maxRetries) throw error;
        const backoffMs = 500 * 2 ** (attempt - 1);
        logger.warn("Scan API request failed. Retrying.", {
          attempt,
          maxRetries: this.maxRetries,
          backoffMs,
          error: error.message
        });
        await sleep(backoffMs);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}

module.exports = { ScanClient };
