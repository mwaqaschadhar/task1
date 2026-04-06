const { loadConfig } = require("./config");
const { ScanClient } = require("./api/scanClient");
const { HttpServer } = require("./api/httpServer");
const { FileStore } = require("./persistence/fileStore");
const { ScanIngestionService } = require("./services/scanIngestionService");
const { logger } = require("./logger");

async function main() {
  const config = loadConfig();
  const store = new FileStore(config.dataDir);
  await store.init(config.bootstrapStartIso);

  const client = new ScanClient({
    baseUrl: config.apiBaseUrl,
    token: config.apiToken,
    requestTimeoutMs: config.requestTimeoutMs,
    maxRetries: config.maxRetries
  });

  const service = new ScanIngestionService(client, store, {
    pollIntervalMs: config.pollIntervalMs,
    overlapMs: config.overlapMs
  });
  const httpServer = new HttpServer({ port: config.apiPort, store });

  await httpServer.start();
  if (config.initialScanDateGT && config.initialScanDateLT) {
    logger.info("Running with provided initial scan date range", {
      scanDateGT: config.initialScanDateGT,
      scanDateLT: config.initialScanDateLT
    });
    await service.runRange(config.initialScanDateGT, config.initialScanDateLT);
  }
  await service.start();

  const shutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down`);
    service.stop();
    httpServer.stop().finally(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error("Fatal startup error", { error: error.message });
  process.exit(1);
});
