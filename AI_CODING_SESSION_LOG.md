# AI Coding Session Log — O2C Graph Explorer
**Candidate:** RITESH-FURIOUS  
**Assignment:** Dodge AI — Forward Deployed Engineer  
**Date:** March 23, 2026  
**Primary AI Tool:** Claude (Anthropic) via claude.ai

---

## Overview

I used Claude as my primary AI assistant throughout this project — for architecture decisions, code generation, debugging, and deployment. Below is a structured log of the key sessions and prompts used during development.

---

## Session 1 — Architecture & Planning

**Goal:** Understand the SAP O2C dataset and design the system architecture.

**Key Prompts:**
- "I have SAP Order-to-Cash CSV data with sales orders, deliveries, billing docs, journal entries and payments. What's the best way to model this as a graph?"
- "Should I use Neo4j or SQLite for this assignment? What are the tradeoffs?"
- "Design a FastAPI backend that serves graph data and supports natural language queries via an LLM."

**Claude's Key Suggestions:**
- Use SQLite instead of Neo4j — zero infrastructure, easier deployment, LLMs already know SQL well
- Model 5 node types: SalesOrder, Delivery, Billing, JournalEntry, Customer
- Use a 2-step LLM pipeline: NL→SQL first, then results→NL answer
- Separate graph endpoint from chat endpoint for clean architecture

**Decision Made:** SQLite + FastAPI + React with force-directed graph visualization

---

## Session 2 — Database Design & Data Loading

**Goal:** Parse the SAP CSV files and build the SQLite schema.

**Key Prompts:**
- "Here are my CSV column names for sales_order_headers. Write me a SQLite CREATE TABLE statement with appropriate types."
- "Write a Python script to load all 11 CSV files into SQLite with proper foreign key relationships."
- "The billing document items reference delivery documents, not sales orders directly. How should I model the join path?"

**Debugging Iteration:**
- Initial load script had encoding issues with SAP export files
- Prompt: "I'm getting UnicodeDecodeError on some CSV files. Fix my build_db.py to handle latin-1 encoding."
- Claude identified that SAP exports often use latin-1 encoding and fixed the script

**Result:** 11 tables, ~1200 rows total, all relationships working

---

## Session 3 — FastAPI Backend

**Goal:** Build the REST API with graph, stats, and chat endpoints.

**Key Prompts:**
- "Write a FastAPI endpoint GET /graph that queries SQLite and returns nodes and edges for a force-directed graph visualization. Include 5 node types."
- "Write a POST /chat endpoint that takes a natural language question, calls an LLM to generate SQL, executes it on SQLite, then calls the LLM again to convert results to plain English."
- "Add guardrails: reject non-O2C questions at the LLM level, and block DROP/DELETE/UPDATE at the regex level."
- "Make the LLM provider configurable — I want to support Groq, OpenRouter, OpenAI, Gemini, Anthropic and Ollama from a single config variable."

**Key Debug Session:**
- Prompt: "My LLM is returning SQL wrapped in markdown code fences like ```sql. My JSON parser is breaking. Fix the parse_llm_json function."
- Claude wrote a regex-based cleaner that strips markdown fences before JSON parsing

**Result:** Clean FastAPI backend with 6 endpoints, multi-provider LLM support, SQL guardrails

---

## Session 4 — React Frontend

**Goal:** Build the graph visualization UI with chat interface.

**Key Prompts:**
- "Build a React component using react-force-graph-2d that renders nodes with 5 different colors by type and shows edges between them."
- "Add a click handler so clicking a node shows a side panel with all its properties and line items fetched from /graph/node/{id}."
- "Add filter pills at the top to show/hide node types. Add a search box that highlights matching nodes."
- "Build a chat UI on the right side with tabs for Chat, Flow diagram, and About. Show sample question chips on load."
- "When the LLM answer references a node ID, highlight that node in the graph with a glow effect for 8 seconds."

**Styling Prompts:**
- "Apply a dark theme. Use these colors: SalesOrder=blue, Delivery=green, Billing=yellow, JournalEntry=orange, Customer=purple."
- "Add a revenue badge in the bottom right and a broken flows counter."

**Key Debug:**
- Prompt: "The graph re-renders on every state change causing performance issues. How do I memoize the graph data?"
- Claude suggested useMemo for nodes/edges and useCallback for event handlers

---

## Session 5 — Deployment & DevOps

**Goal:** Deploy to GitHub, Render.com (backend), and Vercel (frontend).

**Key Prompts:**
- "My git push is being rejected because my Groq API key is hardcoded in main.py. How do I fix this without losing my commit history?"
- "GitHub push protection blocked my push due to a secret in the code. Walk me through fixing this."
- "Render is installing Python 3.14 but pydantic-core fails to build on it. How do I force Python 3.11?"
- "My Vercel deployment shows a blank white page. The console says Unexpected token '<'. What's wrong?"
- "CORS is blocking my /chat POST endpoint but /graph GET works fine. Why would CORS affect only POST?"

**Key Debugging Session — CORS:**
- Identified that `allow_credentials=True` combined with `allow_origins=["*"]` is invalid per the CORS spec
- Fix: set `allow_credentials=False` and add explicit OPTIONS handler for /chat
- Also added explicit `Access-Control-Allow-Origin: *` header on JSONResponse returns

**Deployment Issues Resolved:**
1. GitHub secret scanning blocked push → removed hardcoded key, used os.environ.get()
2. Render Python 3.14 incompatible with pydantic-core → forced Python 3.11 via PYTHON_VERSION env var
3. Vercel blank page → removed `"proxy"` field from package.json, added vercel.json rewrites
4. SQLite database not on Render → o2c.db was in .gitignore, force-added with git add -f
5. CORS blocking POST /chat → fixed credentials setting and added OPTIONS handler

---

## Session 6 — Testing & Refinement

**Goal:** Test all features end-to-end and fix edge cases.

**Test Queries Used:**
- "What is the total revenue per customer?" → verified SQL JOIN across 3 tables
- "Which sales orders have been delivered but not billed?" → verified subquery logic
- "Show me all payments made in April 2025" → verified date filtering
- "What is the weather today?" → verified off-topic rejection working

**Refinements Based on Testing:**
- Prompt: "The graph loads 500+ nodes which makes it slow. Add a limit parameter and cap at 200 nodes by default."
- Prompt: "Add connection count to each node so the frontend can size nodes by their degree."
- Prompt: "The node side panel is showing raw SAP field names. Can you format them more readably?"

---

## LLM Provider Journey

During development and deployment, I cycled through multiple LLM providers:

| Provider | Status | Reason |
|---|---|---|
| Groq (llama-3.3-70b) | ✅ Used locally | Fast, free, excellent SQL generation |
| Groq (deployed) | ❌ Key rotated | Had to rotate after accidental GitHub exposure |
| Gemini 1.5 Flash | ❌ Quota exhausted | Free tier limit hit during testing |
| OpenRouter (llama-3.3-8b) | ✅ Final choice | Free tier, reliable |

---

## Key Architectural Decisions (AI-Assisted)

| Decision | Rationale (from AI discussion) |
|---|---|
| SQLite over Neo4j | Zero infra, LLMs know SQL natively, easier Render deployment |
| 2-step LLM pipeline | Separation of concerns: SQL generation vs. result interpretation |
| react-force-graph-2d | Best React library for force-directed graphs, GPU accelerated |
| Temperature 0.1 | Low temperature for deterministic SQL generation |
| Conversation memory (last 6 turns) | Balance between context and token cost |

---

## Total AI Interactions Estimate

| Category | Approximate Prompts |
|---|---|
| Architecture & design | ~15 |
| Backend code generation | ~30 |
| Frontend code generation | ~25 |
| Debugging & fixes | ~40 |
| Deployment issues | ~20 |
| **Total** | **~130 prompts** |

---

## Sample Raw Prompt → Response Examples

### Prompt 1 (Architecture)
> "I have SAP O2C data with 11 related tables. Should I build a proper graph database or is SQLite good enough for a demo? The assignment asks for graph-based data modeling."

**Claude's Response Summary:** Recommended SQLite with graph visualization on top — argued that "graph-based modeling" means modeling the relationships conceptually, not necessarily using a graph database. SQLite is better for demos because it's serverless, the schema is transparent, and any LLM can write SQL against it without special graph query language training.

### Prompt 2 (Debugging)
> "My React app deployed to Vercel shows a blank white page. Console error: Uncaught SyntaxError: Unexpected token '<'. The same build works locally."

**Claude's Response Summary:** This error means the JS bundle URL is returning HTML (the index.html 404 page) instead of JavaScript. Root cause: the `"proxy": "http://localhost:8000"` field in package.json interferes with Vercel's static hosting. Also needed a vercel.json with rewrites to handle client-side routing.

---

*Log generated: March 23, 2026*  
*Project: O2C Graph Explorer — https://github.com/RITESH-FURIOUS/o2c-graph-explorer*
