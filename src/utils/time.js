function assertIso(value, field) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date in ${field}: ${value}`);
  }
  return d.toISOString();
}

function subtractMs(iso, deltaMs) {
  const d = new Date(iso);
  return new Date(d.getTime() - deltaMs).toISOString();
}

function midpointIso(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (end - start <= 1) return null;
  return new Date(Math.floor((start + end) / 2)).toISOString();
}

module.exports = { assertIso, subtractMs, midpointIso };
