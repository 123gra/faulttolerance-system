import React, { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [jsonInput, setJsonInput] = useState(`{
  "source": "client_A",
  "payload": {
    "metric": "sales",
    "amount": "1200",
    "timestamp": "2024/01/01"
  }
}`);
  const [simulateFail, setSimulateFail] = useState(false);
  const [events, setEvents] = useState([]);
  const [aggregates, setAggregates] = useState([]);

  // Submit event
  const submitEvent = async () => {
    try {
      const res = await fetch(
        `http://localhost:3000/api/ingest${simulateFail ? "?fail=true" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: jsonInput
        }
      );

      const data = await res.json();
      alert(JSON.stringify(data));

      loadEvents();
      loadAggregates();
    } catch (err) {
      alert("Failed to submit event");
    }
  };

  // Load raw events
  const loadEvents = async () => {
    const res = await fetch("http://localhost:3000/api/events");
    const data = await res.json();
    setEvents(data);
  };

  // Load aggregates
  const loadAggregates = async () => {
    const res = await fetch("http://localhost:3000/api/aggregates");
    const data = await res.json();
    setAggregates(data);
  };

  useEffect(() => {
    loadEvents();
    loadAggregates();
  }, []);

  return (
    <div className="container">
      <h2>Fault-Tolerant Data Processing System</h2>

      {/* Submit Section */}
      <h3>Submit Raw Event</h3>
      <textarea
        rows="10"
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
      />

      <div>
        <label>
          <input
            type="checkbox"
            checked={simulateFail}
            onChange={() => setSimulateFail(!simulateFail)}
          />
          Simulate Failure
        </label>
      </div>

      <button onClick={submitEvent}>Submit Event</button>

      {/* Raw Events */}
      <h3>Raw Events</h3>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Status</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.source}</td>
              <td>{e.status}</td>
              <td>{e.error_message}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Aggregates */}
      <h3>Aggregated Results</h3>
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Event Count</th>
            <th>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          {aggregates.map((a, idx) => (
            <tr key={idx}>
              <td>{a.client_id}</td>
              <td>{a.count}</td>
              <td>{a.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
