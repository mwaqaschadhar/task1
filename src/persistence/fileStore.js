const fs = require("fs/promises");
const path = require("path");

const STATE_FILE = "state.json";
const COUNTS_FILE = "counts.json";
const KEYS_FILE = "processed-keys.ndjson";
const SCANS_FILE = "scans.ndjson";

class FileStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.statePath = path.join(dataDir, STATE_FILE);
    this.countsPath = path.join(dataDir, COUNTS_FILE);
    this.keysPath = path.join(dataDir, KEYS_FILE);
    this.scansPath = path.join(dataDir, SCANS_FILE);
    this.seenKeys = new Set();
    this.counts = new Map();
    this.state = null;
  }

  async init(defaultCursor) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.loadState(defaultCursor);
    await this.loadCounts();
    await this.loadKeys();
  }

  getState() {
    if (!this.state) throw new Error("Store not initialized");
    return this.state;
  }

  async setCursor(cursor) {
    const current = this.getState();
    this.state = { ...current, cursor, lastRunAt: new Date().toISOString() };
    await this.writeJsonAtomic(this.statePath, this.state);
  }

  getCountSnapshot() {
    return Object.fromEntries(this.counts.entries());
  }

  getPlayerCount(badgeId) {
    return this.counts.get(badgeId) ?? 0;
  }

  getTotalScans() {
    let total = 0;
    for (const count of this.counts.values()) total += count;
    return total;
  }

  getTotalPlayers() {
    return this.counts.size;
  }

  async applyBatch(scans) {
    if (scans.length === 0) return { inserted: 0, skippedDuplicates: 0 };

    let inserted = 0;
    let skippedDuplicates = 0;
    const scanLines = [];
    const keyLines = [];

    for (const scan of scans) {
      const key = `${scan.badgeId}|${scan.scanDate}`;
      if (this.seenKeys.has(key)) {
        skippedDuplicates += 1;
        continue;
      }
      this.seenKeys.add(key);
      inserted += 1;
      scanLines.push(JSON.stringify(scan));
      keyLines.push(JSON.stringify({ key }));
      this.counts.set(scan.badgeId, (this.counts.get(scan.badgeId) ?? 0) + 1);
    }

    if (inserted > 0) {
      await fs.appendFile(this.scansPath, `${scanLines.join("\n")}\n`, "utf8");
      await fs.appendFile(this.keysPath, `${keyLines.join("\n")}\n`, "utf8");
      await this.writeJsonAtomic(this.countsPath, this.getCountSnapshot());
    }
    return { inserted, skippedDuplicates };
  }

  async loadState(defaultCursor) {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed.cursor) throw new Error("state.cursor missing");
      this.state = parsed;
    } catch {
      this.state = { cursor: defaultCursor };
      await this.writeJsonAtomic(this.statePath, this.state);
    }
  }

  async loadCounts() {
    try {
      const raw = await fs.readFile(this.countsPath, "utf8");
      const parsed = JSON.parse(raw);
      for (const [badgeId, count] of Object.entries(parsed)) {
        if (typeof count === "number" && count >= 0) this.counts.set(badgeId, count);
      }
    } catch {
      await this.writeJsonAtomic(this.countsPath, {});
    }
  }

  async loadKeys() {
    try {
      const raw = await fs.readFile(this.keysPath, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = JSON.parse(trimmed);
        if (parsed.key) this.seenKeys.add(parsed.key);
      }
    } catch {
      await fs.writeFile(this.keysPath, "", "utf8");
    }
  }

  async writeJsonAtomic(targetPath, payload) {
    const tempPath = `${targetPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
    await fs.rename(tempPath, targetPath);
  }
}

module.exports = { FileStore };
