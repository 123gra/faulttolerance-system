function normalizeEvent(raw) {
  return {
    client_id: raw.source || "unknown",
    metric: raw.payload?.metric || "unknown",
    amount: Number(raw.payload?.amount || 0),
    timestamp: safeDate(raw.payload?.timestamp)
  };
}

function safeDate(value) {
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = normalizeEvent;
