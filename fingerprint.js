const crypto = require("crypto");

function fingerprint(event) {
  const str = `${event.client_id}|${event.metric}|${event.amount}|${event.timestamp}`;
  return crypto.createHash("sha256").update(str).digest("hex");
}

module.exports = fingerprint;
