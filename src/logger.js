function log(level, message, context) {
  const ts = new Date().toISOString();
  const payload = context ? ` ${JSON.stringify(context)}` : "";
  console.log(`[${ts}] [${level}] ${message}${payload}`);
}

const logger = {
  info: (message, context) => log("INFO", message, context),
  warn: (message, context) => log("WARN", message, context),
  error: (message, context) => log("ERROR", message, context)
};

module.exports = { logger };
