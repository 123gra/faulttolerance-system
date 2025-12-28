## Fault-Tolerant Data Processing System

A full-stack application for ingesting, normalizing, and processing unreliable data from multiple clients while ensuring data consistency, deduplication, and safe handling of partial failures.

## Project Structure

faulttolerance-system/
├── frontend/ # React UI for event submission and monitoring
│ ├── src/
│ ├── public/
│ └── package.json
│ ├── db.js # Database initialization
│ ├── server.js # Express server setup
│ ├── routes.js # API endpoints
│ ├── normalize.js # Data normalization layer
│ ├── dedup.js # Deduplication logic
│ └── package.json
├── data.db # SQLite database
└── README.md

## Features

### 1. Event Ingestion
- Accepts events from multiple clients with inconsistent schemas
- Handles missing fields, type mismatches, and extra fields
- Gracefully processes malformed data

### 2. Normalization Layer
- Converts raw events into canonical internal format
- Flexible handling of varying field names and types
- Configurable validation rules

### 3. Idempotency & Deduplication
- Prevents duplicate processing even without unique event IDs
- Uses composite keys (client + timestamp + metric) for deduplication
- Safe across client retries and partial failures

### 4. Partial Failure Handling
- Atomic operations to prevent inconsistent states
- Transaction rollback on database failures
- Graceful error messages for clients

### 5. Query Aggregation API
- Returns aggregated data (totals, counts, averages)
- Supports filtering by client and time range
- Consistent results despite retries

### 6. Frontend UI
- Manual event submission form
- Simulate failure toggle for testing
- View processed, rejected, and aggregated results
- Polished, responsive design

## Key Design Decisions

### Assumption 1: Composite Key for Deduplication
**Decision:** Use `(clientId, metric, timestamp, amount)` as a composite key to detect duplicates.

**Reasoning:**
- No guaranteed unique event ID from clients
- Timestamps may not be perfectly reliable, but combined with other fields, they're unique enough
- Allows detection of exact duplicate retries without breaking on minor variations

**Trade-off:** May not catch semantic duplicates (same event, slightly different timestamp). This is acceptable because clients will retry immediately with identical data.

### Assumption 2: Normalization Before Storage
**Decision:** Normalize data immediately upon ingestion, store only canonical format.

**Reasoning:**
- Single source of truth in database
- Simpler aggregation queries
- Clear separation between raw input and processed data

**Trade-off:** If normalization rules change, historical data may need migration. Acceptable for MVP.

### Assumption 3: SQLite for Persistence
**Decision:** Use SQLite with transactions for data consistency.

**Reasoning:**
- Simple, file-based database (no external dependencies)
- ACID transactions prevent partial failures
- Sufficient for single-server fault tolerance

**Trade-off:** Doesn't scale to distributed systems. Would need PostgreSQL + replication for production.

## How the System Prevents Double Counting

### 1. Database-Level Deduplication
CREATE TABLE events (
id INTEGER PRIMARY KEY,
clientId TEXT NOT NULL,
metric TEXT NOT NULL,
amount REAL NOT NULL,
timestamp TEXT NOT NULL,
status TEXT DEFAULT 'processed',
UNIQUE(clientId, metric, amount, timestamp)
);

### 2. Idempotent API Design
// Check if event already exists before inserting
const existing = db.get(
"SELECT id FROM events WHERE clientId=? AND metric=? AND amount=? AND timestamp=?",
[clientId, metric, amount, timestamp]
);

if (existing) {
return { success: true, message: "Event already processed" };
}

// Insert new event
db.run("INSERT INTO events (...) VALUES (...)", [...]);


### 3. Transaction Safety
- All operations (validate → normalize → insert → aggregate) happen in a single transaction
- If any step fails, entire transaction rolls back
- Client retries see consistent state

## What Happens if Database Fails Mid-Request

### Scenario: Insert fails after validation
1. Event passes normalization
2. Database connection drops during INSERT
3. Transaction automatically rolls back
4. Client receives error: `500 - Database Error`
5. Client retries with same event
6. On retry, composite key check prevents duplicate insertion
7. System returns success (idempotent)

### Scenario: Aggregation query fails
1. `/api/aggregate` endpoint requested
2. Database temporarily unavailable
3. Return cached last-known aggregates (if available)
4. Or return 503 Service Unavailable with retry hint

### Safety Guarantee
- **No data loss:** Events in transaction either fully commit or fully rollback
- **No duplicates:** Composite UNIQUE constraint prevents partial inserts
- **Consistency:** Aggregates are computed from consistent snapshot

## What Would Break First at Scale

### Current Bottlenecks (Scaling Challenges)

#### 1. Single SQLite Database
**Issue:** SQLite is single-writer, so concurrent event ingestion serializes.
- At ~100 events/sec, SQLite becomes the bottleneck
- **Fix:** Switch to PostgreSQL with connection pooling

#### 2. In-Memory Aggregation
**Issue:** Computing aggregates from full table scan on every query
- At 1M+ events, query latency becomes unacceptable
- **Fix:** Maintain materialized views or pre-computed aggregates

#### 3. No Event Queue
**Issue:** Requests wait for database response (synchronous processing)
- At high load, requests queue up and timeout
- **Fix:** Use message queue (Redis, RabbitMQ) for async processing

#### 4. No Horizontal Scaling
**Issue:** Single Node.js process/server can't handle high concurrency
- Typical limit: ~1000 concurrent connections
- **Fix:** Load balancer + multiple server instances + shared database

#### 5. Time-Series Storage
**Issue:** Storing all events forever; database grows unbounded
- Query performance degrades over time
- **Fix:** Partition data by time, archive old events

### Recommended Production Architecture
Load Balancer
↓
[Server 1] [Server 2] [Server 3] ← Horizontal scaling
↓ ↓ ↓
PostgreSQL (Replicated) ← Persistence
↓
Redis Cache ← Aggregates & sessions
↓
Message Queue (RabbitMQ) ← Async processing

## API Endpoints

### POST /api/events
Submit a raw event
{
"source": "clientA",
"payload": {
"metric": "sales",
"value": 1200,
"timestamp": "2024-01-01"
}
}

### GET /api/events
List all processed events
GET /api/events?status=processed&limit=10

### GET /api/aggregate
Get aggregated results
GET /api/aggregate?clientId=clientA&startDate=2024-01-01&endDate=2024-01-31


### POST /api/simulate-failure
Toggle failure simulation for testing

## Testing the System

### Test 1: Duplicate Event Handling
curl -X POST http://localhost:3000/api/events
-H "Content-Type: application/json"
-d '{"source": "clientA", "payload": {"metric": "sales", "value": 1200, "timestamp": "2024-01-01"}}'

Send same request again (should return success, not duplicate)
curl -X POST http://localhost:3000/api/events
-H "Content-Type: application/json"
-d '{"source": "clientA", "payload": {"metric": "sales", "value": 1200, "timestamp": "2024-01-01"}}'

### Test 2: Schema Variation
Different field names
curl -X POST http://localhost:3000/api/events
-H "Content-Type: application/json"
-d '{"source": "clientB", "payload": {"amt": "1200", "ts": "2024-01-02"}}'

Missing fields (should normalize gracefully)
curl -X POST http://localhost:3000/api/events
-H "Content-Type: application/json"
-d '{"source": "clientC", "payload": {"metric": "views"}}'

### Test 3: Simulate Failure
Toggle failure simulation
curl -X POST http://localhost:3000/api/simulate-failure

Submit event (should fail)
Retry (should succeed due to idempotency)
text

## Running the Project

### Backend
cd backend
npm install
npm start

Server runs on http://localhost:3000

### Frontend
cd frontend
npm install
npm start

UI runs on http://localhost:3000

## Tech Stack

**Backend:**
- Node.js + Express
- SQLite (data persistence)
- Nodemon (development)

**Frontend:**
- React
- Axios (HTTP client)
- CSS (styling)

## Key Takeaways

**System Thinking:** Designed for failure, not assuming perfect clients
**Data Modeling:** Composite keys for deduplication without relying on fragile assumptions
**Failure Handling:** Transactions ensure consistency; idempotency enables safe retries
**Trade-offs:** SQLite for simplicity; PostgreSQL for scale
**Extensibility:** Clear separation of concerns (normalization, deduplication, aggregation)

