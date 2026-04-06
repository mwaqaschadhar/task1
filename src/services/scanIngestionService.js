const { logger } = require("../logger");
const { assertIso, midpointIso, subtractMs } = require("../utils/time");

const API_BATCH_LIMIT = 1000;

class ScanIngestionService {
  constructor(client, store, options) {
    this.client = client;
    this.store = store;
    this.options = options;
    this.timer = null;
    this.inFlight = false;
  }

  async start() {
    logger.info("Starting scan ingestion service");
    await this.pollOnce();
    this.timer = setInterval(() => {
      this.pollOnce().catch((error) => logger.error("Unhandled poll error", { error: error.message }));
    }, this.options.pollIntervalMs);
  }

  async runRange(scanDateGT, scanDateLT) {
    return this.ingestRange(scanDateGT, scanDateLT, "Initial range run completed");
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollOnce() {
    if (this.inFlight) {
      logger.warn("Previous poll is still running, skipping this tick");
      return;
    }
    this.inFlight = true;
    try {
      const state = this.store.getState();
      const nowIso = new Date().toISOString();
      const startIso = subtractMs(state.cursor, this.options.overlapMs);
      await this.ingestRange(startIso, nowIso, "Poll completed");
    } catch (error) {
      logger.error("Poll failed", { error: error.message });
    } finally {
      this.inFlight = false;
    }
  }

  async ingestRange(startIso, endIso, logMessage) {
    const rawScans = await this.fetchRangeRecursively(startIso, endIso);
    const normalizedScans = this.normalize(rawScans);
    const result = await this.store.applyBatch(normalizedScans);
    await this.store.setCursor(endIso);

    logger.info(logMessage, {
      rangeStart: startIso,
      rangeEnd: endIso,
      fetched: rawScans.length,
      normalized: normalizedScans.length,
      inserted: result.inserted,
      skippedDuplicates: result.skippedDuplicates,
      playersTracked: this.store.getTotalPlayers()
    });
  }

  async fetchRangeRecursively(startIso, endIso) {
    if (new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      return [];
    }
    const records = await this.client.fetchScans({ scanDateGT: startIso, scanDateLT: endIso });
    if (records.length < API_BATCH_LIMIT) return records;

    const midIso = midpointIso(startIso, endIso);
    if (!midIso) {
      throw new Error(`Cannot split overloaded interval further. start=${startIso} end=${endIso}`);
    }
    logger.warn("Hit API record cap, splitting interval");
    const left = await this.fetchRangeRecursively(startIso, midIso);
    const right = await this.fetchRangeRecursively(midIso, endIso);
    return [...left, ...right];
  }

  normalize(records) {
    const result = [];
    for (const record of records) {
      const badgeId = typeof record.badgeId === "string" ? record.badgeId.trim() : "";
      const boothName = this.extractBoothName(record);
      const scanDate = typeof record.scanDate === "string" ? record.scanDate.trim() : "";
      if (!badgeId || !boothName || !scanDate) continue;
      try {
        result.push({ badgeId, boothName, scanDate: assertIso(scanDate, "scanDate"), raw: record });
      } catch {
        // ignore malformed date rows
      }
    }
    return result;
  }

  extractBoothName(record) {
    const topLevel = record["Booth Name"];
    if (typeof topLevel === "string" && topLevel.trim()) return topLevel.trim();

    const customFields = record.customFields;
    if (!Array.isArray(customFields)) return "";

    for (const item of customFields) {
      if (!item || typeof item !== "object") continue;
      const booth = item["Booth Name"];
      if (typeof booth === "string" && booth.trim()) return booth.trim();
    }
    return "";
  }
}

module.exports = { ScanIngestionService };
