# HARVIK TECHNOLOGIES — SYSTEM HARNESS SPECIFICATION & INVARIANTS

**Document Version:** 1.0.0  
**Scope:** Complete End-to-End Verification, Control Layer Invariants, System Reconciliations, and Reliability Harness  
**Author:** HARVIK Engineering & Reliability Team  
**Last Verified:** October 2026  

---

## 1. System Architecture & Topology

The HARVIK Technologies Sales Intelligence & CRM platform operates on a layered, event-driven, single-source-of-truth architecture:

```text
[ USER / BROWSER CLIENT ]
          ↓  (REST API v1 / JSON / Bearer JWT)
[ EXPRESS.JS API GATEWAY (Port 5000) ]
   ├── Helmet / CORS / Compression / RateLimiter
   ├── Authentication & Role-Based Access Control (RBAC)
   ├── DTO Validation & Schema Sanitization
   └── Controller Execution Layer
          ↓
[ CONTROL LAYER SERVICES ]
   ├── LeadStateMachine (Strict Canonical Progression)
   ├── DealLifecycleController (Terminal State Protection)
   ├── AuditService (Immutable Event Recording)
   ├── ReconciliationService (Raw vs Aggregated Auditor)
   └── EventBus (Asynchronous Domain Event Dispatch)
          ├── [ REDIS 7 ] (Cache Layer / Invalidation Pub-Sub / TTL: 60s)
          ├── [ BULLMQ ] (In-memory & Redis Job Queue for Reminders)
          └── [ MONGODB COMMUNITY 7.x ] (Single Source of Truth)
```

---

## 2. Invariant Rules & Business Controls

### 2.1 Single Source of Truth
- **MongoDB** is the absolute source of truth.
- Frontend state, local caches, and intermediate buffers are never authoritative.
- Financial figures (Pipeline, Revenue, Targets, Achievement) must always be traceable directly to raw immutable documents (`Deal`, `Revenue`, `Customer`, `Target`).

### 2.2 Lead Lifecycle State Machine
Canonical Progression:
$$\text{NEW} \longrightarrow \text{CONTACTED} \longrightarrow \text{QUALIFIED} \longrightarrow \text{PROPOSAL} \longrightarrow \text{NEGOTIATION} \longrightarrow \text{WON / LOST}$$

- **Terminal States:** `WON` and `LOST` are strictly terminal. No transitions out of `WON` or `LOST` are permitted (`400 LEAD_ALREADY_CLOSED`).
- **No Skipping Stages:** Any transition that skips intermediate steps (e.g., `NEW` $\to$ `WON`, `NEW` $\to$ `NEGOTIATION`) must be rejected (`400 INVALID_STATUS_TRANSITION`).
- **Stage Gating:**
  - `CONTACTED`: Requires `contactPerson`, at least one contact channel (`email` or `phone`), and `assignedSalesperson`.
  - `QUALIFIED`: Requires `requirement`, `expectedValue > 0`, `nextFollowUpAt`, and `assignedSalesperson`.
  - `PROPOSAL`: Requires `productService`, `requirement`, `expectedValue > 0` or `proposalValue > 0`, and `expectedClosingDate`.
  - `NEGOTIATION`: Requires `proposalValue > 0`, `expectedClosingDate`, and `decisionMaker`.
  - `WON`: Requires `finalDealValue > 0`, `companyName`, `productService`, `closingDate`, and `assignedSalesperson`. Triggers automatic Deal and Customer generation.
  - `LOST`: Requires a valid `lossReason` from enum (`PRICE`, `COMPETITOR`, `NO_RESPONSE`, `BUDGET`, `TIMING`, `NOT_A_FIT`, `CUSTOMER_CANCELLED`, `OTHER`).

### 2.3 Opportunity / Deal Lifecycle
Stages:
$$\text{Lead} \longrightarrow \text{Qualified} \longrightarrow \text{Proposal} \longrightarrow \text{Negotiation} \longrightarrow \text{Won / Lost}$$

- **Pipeline Isolation:** Active pipeline value includes only deals where `stage` is **NOT IN** `['Won', 'Lost']`.
- **Won Stage Booking:** When a deal transitions to `Won`:
  - `wonAt` timestamp is stamped.
  - `probability` is locked to 100%.
  - Revenue record in `Revenue` collection is created idempotently (preventing duplicate revenue on repeated calls).
- **Lost Stage:** `probability` is set to 0%; `lostAt` timestamp is recorded.

### 2.4 Sales Activity Tracking
- Activity types: `Call`, `Meeting`, `Email`, `Demo`, `Follow-up`, `Proposal`, `Other`.
- Each activity must link to an assigned salesperson and lead/customer.
- Soft-deleted activities (`isDeleted: true`) are excluded from operational views and performance aggregates.

### 2.5 Security & Data Isolation (RBAC)
- **Roles:** `ADMIN`, `SALES_MANAGER`, `SALESPERSON`.
- **Isolation Rule:** Users with role `SALESPERSON` can strictly query and modify only records where they are the assigned salesperson (`assignedSalesperson` / `salesperson`). Attempts to access other salespersons' leads or opportunities return `403 FORBIDDEN`.
- **Reassignment Control:** Reassigning a lead or deal to another salesperson is restricted to `ADMIN` and `SALES_MANAGER`.

### 2.6 Concurrency & Optimistic Locking
- Mutable resources (`Lead`, `Deal`, `Activity`, `Customer`) include a monotonically increasing `version` field.
- If a client supplies a stale version during an update, the backend rejects the transaction with `409 CONFLICT` (`LEAD_VERSION_CONFLICT` or `CONFLICT`).

### 2.7 Idempotency & Cache Coherence
- Mutating operations (`POST`, `PATCH`, `PUT`, `DELETE`) immediately invalidate related Redis cache keys (`sales_overview:*`, `deals_stats:*`, etc.).
- Multiple consecutive requests to mark a deal as `Won` produce exactly one financial revenue record.

---

## 3. Metric Definitions & Formulas

| Metric # | Name | Formula / Aggregation Definition | Source Collection |
| :--- | :--- | :--- | :--- |
| **M1** | Total Leads | Count of all leads matching filter where `isDeleted: false, isArchived: false` | `Lead` |
| **M2** | New Leads | Leads created within the current period interval $[t_{\text{start}}, t_{\text{end}}]$ | `Lead` |
| **M3** | Qualified Leads | Count of leads with status `QUALIFIED` | `Lead` |
| **M4** | Active Opportunities | Count of deals with stage $\notin \{\text{'Won'}, \text{'Lost'}\}$ and `isDeleted: false` | `Deal` |
| **M5** | Won Deals | Deals with stage = `Won` closed within the period | `Deal` |
| **M6** | Lost Deals | Deals with stage = `Lost` closed within the period | `Deal` |
| **M7** | Pipeline Value | $\sum \text{dealValue}$ for deals with stage $\notin \{\text{'Won'}, \text{'Lost'}\}$ | `Deal` |
| **M7b**| Weighted Pipeline | $\sum \lfloor (\text{dealValue} \times \text{probability}) / 100 \rfloor$ for active deals | `Deal` |
| **M8** | Won Revenue | $\sum \text{amount}$ from recognized records with `status = 'Paid'` or `'Valid'` | `Revenue` |
| **M9** | Monthly Revenue | $\sum \text{amount}$ recognized within the active month | `Revenue` |
| **M10**| Monthly Target | Configured quota in `Target` collection (or sum of active salespersons) | `Target` / `Salesperson` |
| **M11**| Target Achievement | $(\text{Monthly Revenue} / \text{Monthly Target}) \times 100\%$ (safely 0 if target is 0) | Computed |
| **M12**| Conversion Rate | $(\text{Won Deals} / \text{Qualified Leads}) \times 100\%$ (safely 0 if qualified is 0) | Computed |
| **M13**| Salesperson Leaderboard | Grouped by salesperson: Leads, Deals, Revenue, Targets, Achievement | Multi-collection |

---

## 4. End-to-End Verification Harness Test Scenarios

The automated test harness validates the following end-to-end tracks:

1. **Complete Sales Journey Track:**
   - Create Lead in `NEW` state.
   - Advance through canonical steps: `NEW` $\to$ `CONTACTED` $\to$ `QUALIFIED` $\to$ `PROPOSAL` $\to$ `NEGOTIATION` $\to$ `WON`.
   - Verify downstream Deal generation and Customer record linking.
   - Verify downstream Revenue generation in `Revenue` collection.
   - Trigger Dashboard Reconciliation and assert 100% check pass rate.

2. **Negative Transition & Invariant Violation Track:**
   - Attempt illegal stage skipping (`NEW` $\to$ `WON`, `NEW` $\to$ `NEGOTIATION`).
   - Attempt transition from terminal state (`WON` $\to$ `QUALIFIED`, `LOST` $\to$ `WON`).
   - Transition to `LOST` without `lossReason`.
   - Creation of lead with invalid email / negative value.

3. **Concurrency & Race Condition Track:**
   - Execute parallel updates with mismatched versions.
   - Verify optimistic lock rejection (`409`).

4. **Security & Data Isolation Track:**
   - Authenticate as Salesperson A.
   - Attempt access to Salesperson B's records; assert `403 FORBIDDEN`.
   - Query Lead listing; assert returned set contains exclusively Salesperson A's records.

5. **Reconciliation & Idempotency Track:**
   - Re-send `Won` stage update on already-won deal.
   - Assert zero duplicate revenue records created.
   - Run independent reconciliation service audit across pipeline, revenue, targets, and conversion.

---

## 5. Harness Execution Procedure

To execute the full verification harness:

```bash
# In backend directory
cd backend

# Execute all integration, unit, lifecycle, and gateway connectivity tests serially
npm run test
```

---

## 6. 502 API Gateway Incident & Diagnostic

### Symptoms

The frontend dashboard running on Vite port `5173` returned `502 Bad Gateway` for multiple API endpoints when requesting `/api/v1/*`.

### Affected Endpoints

- `/api/v1/dashboard/overview`
- `/api/v1/dashboard/person-performance`
- `/api/v1/dashboard/recent-activities`
- `/api/v1/revenue/trend`
- `/api/v1/dashboard/upcoming-followups`
- `/api/v1/deals/pipeline/summary`

### Root Cause

1. **Proxy Target Connectivity**: The frontend Vite dev server on port `5173` proxies `/api` requests to upstream backend at `http://localhost:5000`. When the Node.js / Express backend process on port `5000` is offline, the Vite development proxy encounters `ECONNREFUSED` and returns `502 Bad Gateway` to the browser.
2. **Missing Endpoint Alias & Health Endpoints**: `/api/v1/dashboard/person-performance` was only mapped under `/salesperson-performance`, and `/api/v1/health` was not surfaced with upstream dependency breakdowns (MongoDB & Redis).

### Fix

1. **Route Alignment & Aliases**: Added `/person-performance` alias to `backend/src/routes/dashboard.js` alongside `/salesperson-performance`.
2. **Unified Health Check Endpoints**: Implemented `/health`, `/api/health`, and `/api/v1/health` with real-time MongoDB and Redis status reporting.
3. **Pipeline Summary & Trend Handlers**: Verified and guarded MongoDB aggregations for `getPipelineSummary` and `getRevenueTrend`.
4. **Automated Regression Suite**: Created `backend/test/gatewayConnectivity.test.js` validating all 6 dashboard endpoints and health endpoints against real databases.

### Verification

- Backend direct request: **PASS**
- Vite proxy request: **PASS**
- MongoDB connection: **PASS** (`harvik_sales`)
- Redis / Fallback: **PASS** (Redis 7 & in-memory graceful fallback)
- Dashboard overview: **PASS** (`200 OK`)
- Person performance: **PASS** (`200 OK`)
- Recent activities: **PASS** (`200 OK`)
- Revenue trend: **PASS** (`200 OK`)
- Upcoming follow-ups: **PASS** (`200 OK`)
- Pipeline summary: **PASS** (`200 OK`)

### Regression Test

```bash
cd backend && npm run test
# Result: 212 passed, 0 failed across 84 test suites
```

---

## 7. Authentication & User Profile Control

### User Source of Truth

MongoDB `User` / `Salesperson` collection (`harvik_sales`).

### Login

`POST /api/v1/auth/login`
- Accepts `{ email, password }`
- Bcrypt password hash comparison (cost factor 10)
- Rate limiting protection on brute-force attempts
- Audit logging (`LOGIN_SUCCESS`, `LOGIN_FAILURE`)
- Signs and returns JWT Bearer token (7d expiration) + safe user object without password or hash

### Current User Profile

`GET /api/v1/auth/me`
- Requires Bearer JWT token
- Queries MongoDB for active user record
- Returns dynamic user profile: `{ userId, name, email, role, displayRole, department, phone, status, lastLoginAt }`

### Logout

`POST /api/v1/auth/logout`
- Invalidation and audit logging (`LOGOUT`)

### Roles & Presentation Mapping

| System Role (`systemRole`) | Presentation Role (`displayRole`) | Default Permissions |
| :--- | :--- | :--- |
| `ADMIN` | Administrator | Full CRUD across all records, reassignments, audits, reconciliations |
| `SALES_MANAGER` | Sales Manager | CRUD across all sales records, reassignments, audits, reconciliations |
| `SALESPERSON` | Salesperson | Scoped strictly to assigned leads, opportunities, activities; no reassignment |

### Profile UI Dynamic Binding

The sidebar profile widget dynamically binds to the authenticated user from `/api/v1/auth/me`:
- **Initials:** Derived dynamically (e.g., "Admin Manager" $\to$ `AM`, "Rahul Mehta" $\to$ `RM`, "Arjun Sharma" $\to$ `AS`)
- **Display Name:** Bound to `user.name`
- **Display Role:** Bound to `user.displayRole || user.role`
- **User Profile Modal:** Opens on clicking the profile section, displaying User ID, Email, Role, Department, Status (Active), Last Login timestamp, and Sign Out action.

### Security Invariants

- Passwords are never stored in plaintext (bcrypt 10 rounds)
- Passwords and password hashes are strictly excluded from all API responses
- Unauthenticated requests to protected endpoints return `401 AUTH_REQUIRED`
- Unauthorized role actions return `403 FORBIDDEN`

### Verification Summary

- Valid login (`Admin Manager`): **PASS** (`200 OK`)
- Valid login (`Salesperson`): **PASS** (`200 OK`)
- Invalid password: **PASS** (`401 AUTH_REQUIRED`)
- Unknown email: **PASS** (`401 AUTH_REQUIRED`)
- Disabled user account: **PASS** (`403 ACCOUNT_DISABLED`)
- Current user retrieval (`GET /auth/me`): **PASS** (`200 OK`)
- User logout (`POST /auth/logout`): **PASS** (`200 OK`)
- Password exposure prevention: **PASS** (`password` / `passwordHash` strictly `undefined`)
- Role authorization & data isolation: **PASS**

