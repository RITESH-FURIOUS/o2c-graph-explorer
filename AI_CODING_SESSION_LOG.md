# AI Coding Session Log
## Tool: Claude (claude.ai)
## Project: O2C Graph Explorer — Dodge AI Assignment

---

### Session 1 — Architecture & Dataset Exploration

**Prompt:** Explain what we need to build for this assignment in simple terms

**Response summary:** Claude broke down the 3 core parts:
1. Graph construction from SAP JSONL dataset
2. Force-directed graph visualization in React
3. NL → SQL → NL chat interface with guardrails

**Decisions made:**
- SQLite over Neo4j: simpler deployment, LLMs know SQL better
- Groq (llama-3.3-70b) for LLM: fastest free tier, great for SQL
- react-force-graph-2d for visualization: lightweight, physics-based
- FastAPI + uvicorn for backend: async, fast, clean

---

### Session 2 — Dataset Schema Exploration

**Prompt:** Examine the ZIP dataset and identify all tables, fields, and relationships

**Claude actions:**
- Unzipped dataset and read JSONL files from 12 folders
- Identified primary keys and foreign key relationships:
  - `outbound_delivery_items.referenceSdDocument → sales_order_headers.salesOrder`
  - `billing_document_items.referenceSdDocument → outbound_delivery_headers.deliveryDocument`
  - `billing_document_headers.accountingDocument → journal_entries.accountingDocument`
  - `journal_entries.clearingAccountingDocument → payments.accountingDocument`

**Key insight:** The billing → journal entry link uses `accountingDocument` as a shared key, not a direct foreign key column. This is an SAP-specific pattern.

---

### Session 3 — Database Build Script

**Prompt:** Build SQLite DB from the JSONL dataset

**Iterations:**
1. First attempt used `jsonlines` library → failed (no network in container)
2. Second attempt used only `json` stdlib → succeeded
3. Added type coercion for numeric fields (REAL vs TEXT)
4. Added `INSERT OR IGNORE` for deduplication

**Result:** 11 tables, ~1,300 total rows

---

### Session 4 — Backend API Design

**Prompt:** Build FastAPI backend with /graph, /chat, /stats endpoints

**Design decisions:**
- `/graph` endpoint builds node/edge lists dynamically from SQL JOINs
  - Avoids storing graph structure separately — single source of truth
- `/chat` uses two LLM calls:
  - Call 1: NL → SQL (structured JSON output forced)
  - Call 2: SQL results → NL answer
- Connection counting for node sizing in graph
- Regex-based SQL injection guard

**Guardrail design:**
- System prompt explicitly instructs off-topic rejection
- LLM must return `{type: "off_topic"}` JSON — never free text for rejections
- Backend validates JSON shape before executing SQL
- All SQL run as read-only (SELECT only, forbidden keywords blocked)

---

### Session 5 — Frontend Graph + Chat UI

**Prompt:** Build React app with dark theme, force graph, chat panel

**Design choices:**
- Dark theme (#0a0c10 background) — professional data tool aesthetic
- Space Mono for monospace labels, DM Sans for body — distinct pairing
- Node colors: blue=orders, green=delivery, yellow=billing, orange=journal, purple=customer
- Tooltip on hover with key properties
- Click node → side panel with full details + line items
- Filter buttons to isolate entity types
- Two-step LLM pipeline reflected in UI: user sees "View SQL" toggle

**Iterations:**
1. Initial graph too dense → added filter controls
2. Node labels cluttered at full zoom → only show labels at zoom > 2x or for Customer nodes
3. Chat messages needed markdown rendering → added react-markdown
4. Added conversation history (last 6 turns) for context

---

### Session 6 — Deployment Config

**Prompt:** Add render.yaml, vercel.json, .env files, README

**Files created:**
- `render.yaml` for backend on Render.com (free tier)
- `frontend/vercel.json` for Vercel static hosting
- `.env.development` and `.env.production` with `REACT_APP_API_URL`
- `.gitignore` excluding o2c.db and node_modules
- Full `README.md` with architecture diagram, design decisions, deployment guide

---

### Debugging Notes

**Issue 1:** `sqlite3.OperationalError: unable to open database file`
- Cause: directory didn't exist
- Fix: `os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)`

**Issue 2:** JSONL files have boolean fields (Python `True`/`False`) that SQLite can't store directly
- Fix: `if isinstance(v, bool): v = int(v)` in insert loop

**Issue 3:** Some fields are nested dicts (e.g., `creationTime: {hours: 6, minutes: 49}`)
- Fix: `elif isinstance(v, dict): v = None` — not needed for core analysis

**Issue 4:** LLM sometimes returns SQL wrapped in markdown ```sql fences
- Fix: Strip markdown code fences before `json.loads()`

---

### Prompting Strategy Summary

**For SQL generation:**
```
System prompt = full schema + relationship map + output format constraint + guardrail rule
User message = natural language question
Temperature = 0.1 (low, for deterministic SQL)
```

**For answer formatting:**
```
System prompt = "helpful business analyst, concise, use bullet points"
User message = SQL + results JSON + original question
Temperature = 0.3 (slightly higher for natural prose)
```

**Why JSON-only output for SQL generation:**
Forcing `{type, sql, explanation}` output means the backend can always parse the response reliably. Free-text SQL extraction via regex is fragile. JSON is cleaner and safer.
