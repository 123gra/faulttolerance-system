const express = require("express");
const db = require("./db");
const normalize = require("./normalize");
const fingerprint = require("./fingerprint");

const router = express.Router();

router.post("/ingest", (req, res) => {
  const raw = req.body;
  const simulateFailure = req.query.fail === "true";

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(
      `INSERT INTO raw_events (source, raw_payload, status)
       VALUES (?, ?, ?)`,
      [raw.source, JSON.stringify(raw), "RECEIVED"],
      function (err) {
        if (err) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: "Raw insert failed" });
        }

        try {
          const normalized = normalize(raw);
          const hash = fingerprint(normalized);

          if (simulateFailure) {
            throw new Error("Simulated DB failure");
          }

          db.run(
            `INSERT OR IGNORE INTO normalized_events
             (event_fingerprint, client_id, metric, amount, timestamp)
             VALUES (?, ?, ?, ?, ?)`,
            [
              hash,
              normalized.client_id,
              normalized.metric,
              normalized.amount,
              normalized.timestamp
            ]
          );

          db.run(
            `UPDATE raw_events SET status = 'NORMALIZED' WHERE id = ?`,
            [this.lastID]
          );

          db.run("COMMIT");
          res.json({ status: "processed" });

        } catch (e) {
          db.run("ROLLBACK");
          db.run(
            `UPDATE raw_events SET status = 'FAILED', error_message = ?
             WHERE id = ?`,
            [e.message, this.lastID]
          );
          res.status(500).json({ error: e.message });
        }
      }
    );
  });
});

router.get("/aggregates", (req, res) => {
  const { client, from, to } = req.query;

  let query = `
    SELECT client_id, COUNT(*) as count, SUM(amount) as total
    FROM normalized_events
    WHERE 1=1
  `;
  const params = [];

  if (client) {
    query += " AND client_id = ?";
    params.push(client);
  }
  if (from && to) {
    query += " AND timestamp BETWEEN ? AND ?";
    params.push(from, to);
  }

  query += " GROUP BY client_id";

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get("/events", (req, res) => {
  db.all(`SELECT * FROM raw_events ORDER BY created_at DESC`, (err, rows) => {
    res.json(rows);
  });
});

module.exports = router;
