const express = require("express");
const { logger } = require("../logger");

class HttpServer {
  constructor({ port, store }) {
    this.port = port;
    this.store = store;
    this.app = express();
    this.server = null;
    this.registerRoutes();
  }

  registerRoutes() {
    this.app.get("/health", (req, res) => {
      res.json({ status: "ok", at: new Date().toISOString() });
    });

    this.app.get("/stats/overview", (req, res) => {
      const state = this.store.getState();
      res.json({
        totalPlayers: this.store.getTotalPlayers(),
        totalScans: this.store.getTotalScans(),
        cursor: state.cursor,
        lastRunAt: state.lastRunAt ?? null
      });
    });

    this.app.get("/stats/players", (req, res) => {
      res.json({ counts: this.store.getCountSnapshot() });
    });

    this.app.get("/stats/players/:badgeId", (req, res) => {
      const badgeId = req.params.badgeId;
      res.json({ badgeId, scanCount: this.store.getPlayerCount(badgeId) });
    });

    this.app.use((req, res) => {
      res.status(404).json({ error: "not_found" });
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info("HTTP API server started", { port: this.port });
        resolve();
      });
    });
  }

  stop() {
    if (!this.server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) return reject(error);
        resolve();
      });
    });
  }
}

module.exports = { HttpServer };
