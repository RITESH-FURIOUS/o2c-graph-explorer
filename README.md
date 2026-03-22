# Order-to-Cash Graph Explorer

A graph-based data modeling and query system for SAP Order-to-Cash data.
Built with FastAPI + SQLite (backend) and React + react-force-graph-2d (frontend).

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  ┌───────────────────────┐  ┌──────────────────────┐   │
│  │  Force-Directed Graph  │  │   Chat Interface      │   │
│  │  (react-force-graph)   │  │   (NL → SQL → Answer) │   │
│  └───────────────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │ HTTP
┌─────────────────────────────────────────────────────────┐
│                   FastAPI Backend                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  /graph   → Graph nodes + edges for visualization │   │
│  │  /chat    → NL → Groq LLM → SQL → SQLite → NL    │   │
│  │  /stats   → Dashboard statistics                  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│         SQLite Database (o2c.db)                         │
│  sales_order_headers | sales_order_items                 │
│  outbound_delivery_headers | outbound_delivery_items     │
│  billing_document_headers | billing_document_items       │
│  journal_entries | payments                              │
│  business_partners | products | product_descriptions     │
└─────────────────────────────────────────────────────────┘
```

---

## Graph Model

### Nodes
| Entity | Color | Description |
|--------|-------|-------------|
| SalesOrder | Blue | Customer order header |
| Delivery | Green | Outbound delivery document |
| Billing | Yellow | Invoice/billing document |
| JournalEntry | Orange | Accounting entry |
| Customer | Purple | Business partner |

### Edges (Relationships)
- `Customer → SalesOrder` via `soldToParty`
- `SalesOrder → Delivery` via `outbound_delivery_items.referenceSdDocument`
- `Delivery → Billing` via `billing_document_items.referenceSdDocument`
- `Billing → JournalEntry` via `billing_document_headers.accountingDocument`

---

## Quick Start

### Step 1: Configure API Key

Open `backend/main.py` and find line ~20:
```python
GROQ_API_KEY = "YOUR_GROQ_API_KEY_HERE"
```
Replace with your free Groq key from https://console.groq.com

### Step 2: Add Dataset

Place your `o2c.db` file in the `backend/` folder.
(Already included if you ran the database build script)

### Step 3: Start Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Step 4: Start Frontend

```bash
cd frontend
npm install
npm start
```

Open http://localhost:3000

---

## Database Choice: SQLite

**Why SQLite over a native graph DB (Neo4j)?**

- Zero infrastructure — single file, no server
- The dataset fits entirely in memory (~5MB)
- SQL is well-understood by LLMs for query generation
- Graph traversal queries via JOINs are fast for this data size
- Deployable anywhere without extra services

**Tradeoff:** For datasets >1M nodes, a native graph DB (Neo4j, TigerGraph) would outperform.

---

## LLM Prompting Strategy

The LLM (Groq/Llama-3.3-70b) is used in two steps:

### Step 1: NL → SQL
System prompt includes:
- Full DB schema with column names and types
- ALL relationship mappings between tables
- Output format constraint: respond ONLY as JSON `{type, sql, explanation}`
- Guardrail instruction: respond with `{type: "off_topic"}` for non-O2C questions

### Step 2: SQL Results → Natural Language
A second LLM call takes raw query results and formats them as a human-readable answer.

---

## Guardrails

1. **Domain restriction**: System prompt explicitly instructs the LLM to reject non-O2C questions
2. **JSON-only output**: Forces structured responses, preventing hallucinated answers
3. **SQL safety check**: Regex blocks any DROP/DELETE/UPDATE/INSERT statements
4. **Data-grounded answers**: All answers go through actual SQL execution — no hallucination possible
5. **Error handling**: Query failures return clean error messages

---

## Deployment

### Backend (Render.com - Free)
1. Push to GitHub
2. Create new Web Service on render.com
3. Set root to `backend/`, build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add env variable: `GROQ_API_KEY=your_key`

### Frontend (Vercel - Free)
1. Set root to `frontend/`
2. Add env variable: `REACT_APP_API_URL=https://your-render-url.onrender.com`
3. Deploy

---

## Sample Queries

- "Which products are associated with the highest number of billing documents?"
- "Trace the full flow of billing document 90504259"
- "Which sales orders have been delivered but not billed?"
- "What is the total revenue per customer?"
- "Show me all cancelled billing documents"
- "Which customer has placed the most orders?"
