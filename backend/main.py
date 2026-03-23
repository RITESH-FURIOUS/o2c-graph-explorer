"""
Order-to-Cash Graph Query System - FastAPI Backend
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import sqlite3
import json
import os
import re
import httpx

app = FastAPI(title="O2C Graph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "o2c.db")

LLM_PROVIDER = "openrouter"

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL   = "llama-3.3-70b-versatile"

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = "meta-llama/llama-3.3-8b-instruct:free"

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "YOUR_OPENAI_API_KEY_HERE")
OPENAI_MODEL   = "gpt-4o-mini"

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY_HERE")
GEMINI_MODEL   = "gemini-1.5-flash"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "YOUR_ANTHROPIC_API_KEY_HERE")
ANTHROPIC_MODEL   = "claude-haiku-4-5-20251001"

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL    = "llama3"

CUSTOM_API_URL = "https://your-endpoint/v1/chat/completions"
CUSTOM_API_KEY = "YOUR_CUSTOM_KEY_HERE"
CUSTOM_MODEL   = "your-model-name"

def _resolve(val):
    return val() if callable(val) else val

PROVIDER_CONFIGS = {
    "groq": {
        "url":   "https://api.groq.com/openai/v1/chat/completions",
        "key":   lambda: GROQ_API_KEY,
        "model": lambda: GROQ_MODEL,
        "style": "openai",
    },
    "openrouter": {
        "url":   "https://openrouter.ai/api/v1/chat/completions",
        "key":   lambda: OPENROUTER_API_KEY,
        "model": lambda: OPENROUTER_MODEL,
        "style": "openai",
        "extra_headers": {"HTTP-Referer": "https://o2c-graph.app", "X-Title": "O2C Graph Explorer"},
    },
    "openai": {
        "url":   "https://api.openai.com/v1/chat/completions",
        "key":   lambda: OPENAI_API_KEY,
        "model": lambda: OPENAI_MODEL,
        "style": "openai",
    },
    "gemini": {
        "url":   lambda: f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}",
        "key":   lambda: GEMINI_API_KEY,
        "model": lambda: GEMINI_MODEL,
        "style": "gemini",
    },
    "anthropic": {
        "url":   "https://api.anthropic.com/v1/messages",
        "key":   lambda: ANTHROPIC_API_KEY,
        "model": lambda: ANTHROPIC_MODEL,
        "style": "anthropic",
    },
    "ollama": {
        "url":   lambda: f"{OLLAMA_BASE_URL}/api/chat",
        "key":   lambda: "",
        "model": lambda: OLLAMA_MODEL,
        "style": "ollama",
    },
    "custom": {
        "url":   lambda: CUSTOM_API_URL,
        "key":   lambda: CUSTOM_API_KEY,
        "model": lambda: CUSTOM_MODEL,
        "style": "openai",
    },
}


def _get_provider():
    cfg = PROVIDER_CONFIGS.get(LLM_PROVIDER)
    if not cfg:
        raise HTTPException(400, f"Unknown LLM_PROVIDER '{LLM_PROVIDER}'.")
    key = cfg["key"]()
    if LLM_PROVIDER != "ollama" and any(p in str(key) for p in ["YOUR_", "_HERE"]):
        raise HTTPException(400, f"No API key set for '{LLM_PROVIDER}'.")
    return cfg, key


async def call_llm(messages: list, system: str = "") -> str:
    cfg, key = _get_provider()
    style   = cfg["style"]
    model   = cfg["model"]()
    url     = _resolve(cfg["url"])
    headers = {"Content-Type": "application/json"}
    headers.update(cfg.get("extra_headers", {}))

    if style == "openai":
        headers["Authorization"] = f"Bearer {key}"
        body = {
            "model": model,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "temperature": 0.1,
            "max_tokens": 1024,
        }
        async with httpx.AsyncClient(timeout=40) as c:
            r = await c.post(url, headers=headers, json=body)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

    elif style == "gemini":
        contents = [
            {"role": "user" if m["role"] == "user" else "model",
             "parts": [{"text": m["content"]}]}
            for m in messages
        ]
        body = {
            "contents": contents,
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1024},
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        async with httpx.AsyncClient(timeout=40) as c:
            r = await c.post(url, headers=headers, json=body)
            r.raise_for_status()
            return r.json()["candidates"][0]["content"]["parts"][0]["text"]

    elif style == "anthropic":
        headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
        body = {"model": model, "max_tokens": 1024, "system": system, "messages": messages, "temperature": 0.1}
        async with httpx.AsyncClient(timeout=40) as c:
            r = await c.post(url, headers=headers, json=body)
            r.raise_for_status()
            return r.json()["content"][0]["text"]

    elif style == "ollama":
        body = {
            "model": model, "stream": False,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "options": {"temperature": 0.1},
        }
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.post(url, headers=headers, json=body)
            r.raise_for_status()
            return r.json()["message"]["content"]

    raise HTTPException(500, f"Unsupported style: {style}")


DB_SCHEMA = """
Tables in the SAP Order-to-Cash SQLite database:

1. sales_order_headers
   - salesOrder (PK), salesOrderType, salesOrganization, soldToParty (FK→business_partners),
     creationDate, totalNetAmount, overallDeliveryStatus, overallOrdReltdBillgStatus,
     transactionCurrency, requestedDeliveryDate, customerPaymentTerms

2. sales_order_items
   - salesOrder (FK), salesOrderItem, material (FK→products),
     requestedQuantity, netAmount, materialGroup, productionPlant, storageLocation

3. outbound_delivery_headers
   - deliveryDocument (PK), creationDate, shippingPoint,
     overallGoodsMovementStatus, overallPickingStatus, deliveryBlockReason

4. outbound_delivery_items
   - deliveryDocument (FK), deliveryDocumentItem,
     referenceSdDocument (FK→sales_order_headers.salesOrder),
     referenceSdDocumentItem, actualDeliveryQuantity, plant, storageLocation

5. billing_document_headers
   - billingDocument (PK), billingDocumentType, creationDate, billingDocumentDate,
     billingDocumentIsCancelled (0=active 1=cancelled), totalNetAmount,
     transactionCurrency, companyCode, fiscalYear,
     accountingDocument (FK→journal_entries), soldToParty (FK→business_partners)

6. billing_document_items
   - billingDocument (FK), billingDocumentItem, material (FK→products),
     billingQuantity, netAmount, transactionCurrency,
     referenceSdDocument (FK→outbound_delivery_headers.deliveryDocument)

7. journal_entries
   - accountingDocument (PK part), accountingDocumentItem, companyCode, fiscalYear,
     glAccount, referenceDocument (FK→billing_document_headers.billingDocument),
     transactionCurrency, amountInTransactionCurrency, postingDate, documentDate,
     accountingDocumentType, customer, clearingDate, clearingAccountingDocument

8. payments
   - accountingDocument (PK part), accountingDocumentItem, companyCode, fiscalYear,
     clearingDate, clearingAccountingDocument, amountInTransactionCurrency,
     transactionCurrency, customer, postingDate, documentDate, glAccount

9. business_partners
   - businessPartner (PK), customer, businessPartnerFullName, businessPartnerName,
     creationDate, businessPartnerIsBlocked

10. products
    - product (PK), productType, productOldId, grossWeight, weightUnit,
      productGroup, baseUnit, division, creationDate, isMarkedForDeletion

11. product_descriptions
    - product (FK→products), language, productDescription

KEY JOIN PATHS:
  SalesOrder → Delivery : outbound_delivery_items.referenceSdDocument = sales_order_headers.salesOrder
  Delivery   → Billing  : billing_document_items.referenceSdDocument = outbound_delivery_headers.deliveryDocument
  Billing    → Journal  : billing_document_headers.accountingDocument = journal_entries.accountingDocument
  Journal    → Payment  : journal_entries.clearingAccountingDocument = payments.accountingDocument
  Customer   → Order    : sales_order_headers.soldToParty = business_partners.businessPartner
"""

SYSTEM_PROMPT = f"""You are a specialized SQL query assistant for an SAP Order-to-Cash (O2C) business system.

{DB_SCHEMA}

RULES:
1. ONLY answer questions about this O2C dataset.
2. Off-topic question → respond ONLY with:
   {{"type":"off_topic","message":"This system is designed to answer questions related to the SAP Order-to-Cash dataset only."}}
3. Valid question → respond ONLY with:
   {{"type":"query","sql":"<SELECT ...>","explanation":"<one line>"}}
4. SQLite syntax. Always LIMIT ≤ 100. Never DROP/DELETE/UPDATE/INSERT/ALTER.
5. Respond with ONLY the JSON object — no markdown, no extra text."""

ANSWER_SYSTEM = "You are a concise business analyst. Summarize SQL query results in plain English. Use bullet points for lists. Never mention SQL or databases."


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def run_sql(sql: str):
    if re.search(r'\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|ATTACH|DETACH)\b', sql, re.IGNORECASE):
        raise ValueError("Only SELECT queries are allowed")
    conn = get_db()
    try:
        cur = conn.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        return cols, [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def parse_llm_json(raw: str) -> dict:
    clean = raw.strip()
    if clean.startswith("```"):
        clean = re.sub(r"```[a-z]*\n?", "", clean).strip("` \n")
    m = re.search(r'\{.*\}', clean, re.DOTALL)
    if m:
        return json.loads(m.group(0))
    return json.loads(clean)


class ChatRequest(BaseModel):
    message: str
    history: list = []


@app.get("/health")
async def health():
    cfg = PROVIDER_CONFIGS.get(LLM_PROVIDER, {})
    return {
        "status": "ok",
        "db": os.path.exists(DB_PATH),
        "provider": LLM_PROVIDER,
        "model": cfg.get("model", lambda: "?")() if cfg else "?",
    }


@app.options("/chat")
async def chat_options():
    response = JSONResponse(content={})
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response


@app.post("/chat")
async def chat(req: ChatRequest):
    history = [{"role": t["role"], "content": t["content"]} for t in req.history[-6:]]
    history.append({"role": "user", "content": req.message})

    raw = await call_llm(history, system=SYSTEM_PROMPT)
    try:
        parsed = parse_llm_json(raw)
    except Exception:
        return JSONResponse(content={"type": "off_topic", "message": "This system only answers questions about the SAP Order-to-Cash dataset."})

    if parsed.get("type") == "off_topic":
        return JSONResponse(content=parsed)
    if parsed.get("type") != "query" or not parsed.get("sql"):
        return JSONResponse(content={"type": "error", "message": "Could not generate a valid query."})

    sql = parsed["sql"]
    try:
        cols, rows = run_sql(sql)
    except Exception as e:
        return JSONResponse(content={"type": "error", "message": str(e), "sql": sql})

    summary = f'User asked: "{req.message}"\nSQL: {sql}\nRows ({len(rows)}): {json.dumps(rows[:20], indent=2)}'
    answer = await call_llm([{"role": "user", "content": summary}], system=ANSWER_SYSTEM)

    result = {
        "type": "answer",
        "answer": answer,
        "sql": sql,
        "explanation": parsed.get("explanation", ""),
        "row_count": len(rows),
        "columns": cols,
        "data": rows[:50],
    }
    response = JSONResponse(content=result)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@app.get("/graph")
async def get_graph(limit: int = 200):
    conn = get_db()
    nodes, edges = {}, []

    def add(nid, label, ntype, props):
        if nid not in nodes:
            nodes[nid] = {"id": nid, "label": label, "type": ntype, "properties": props}

    try:
        q = limit // 4
        for r in conn.execute(f"SELECT * FROM sales_order_headers LIMIT {q}"):
            r = dict(r); add(f"SO_{r['salesOrder']}", f"SO {r['salesOrder']}", "SalesOrder", r)

        for r in conn.execute(f"""
            SELECT DISTINCT odh.*, odi.referenceSdDocument FROM outbound_delivery_headers odh
            JOIN outbound_delivery_items odi ON odh.deliveryDocument=odi.deliveryDocument
            WHERE odi.referenceSdDocument IN (SELECT salesOrder FROM sales_order_headers LIMIT {q}) LIMIT {q}"""):
            r = dict(r); nid = f"DEL_{r['deliveryDocument']}"
            add(nid, f"DEL {r['deliveryDocument']}", "Delivery", r)
            src = f"SO_{r['referenceSdDocument']}"
            if src in nodes: edges.append({"source": src, "target": nid, "label": "DELIVERED_VIA"})

        for r in conn.execute(f"""
            SELECT DISTINCT bdh.*, bdi.referenceSdDocument as dd FROM billing_document_headers bdh
            JOIN billing_document_items bdi ON bdh.billingDocument=bdi.billingDocument
            WHERE bdi.referenceSdDocument IN (SELECT deliveryDocument FROM outbound_delivery_headers LIMIT {q}) LIMIT {q}"""):
            r = dict(r); nid = f"BILL_{r['billingDocument']}"
            add(nid, f"BILL {r['billingDocument']}", "Billing", r)
            src = f"DEL_{r['dd']}"
            if src in nodes: edges.append({"source": src, "target": nid, "label": "BILLED_AS"})

        for r in conn.execute(f"""
            SELECT DISTINCT je.* FROM journal_entries je
            WHERE je.referenceDocument IN (SELECT billingDocument FROM billing_document_headers LIMIT {q}) LIMIT {q//2}"""):
            r = dict(r); nid = f"JE_{r['accountingDocument']}_{r['accountingDocumentItem']}"
            add(nid, f"JE {r['accountingDocument']}", "JournalEntry", r)
            src = f"BILL_{r['referenceDocument']}"
            if src in nodes: edges.append({"source": src, "target": nid, "label": "JOURNAL_ENTRY"})

        for r in conn.execute("SELECT * FROM business_partners"):
            r = dict(r)
            add(f"CUST_{r['businessPartner']}", r['businessPartnerName'][:20], "Customer", r)

        for n in list(nodes.values()):
            if n["type"] == "SalesOrder":
                cp = n["properties"].get("soldToParty")
                if cp and f"CUST_{cp}" in nodes:
                    edges.append({"source": f"CUST_{cp}", "target": n["id"], "label": "PLACED_ORDER"})
    finally:
        conn.close()

    cc = {}
    for e in edges:
        cc[e["source"]] = cc.get(e["source"], 0) + 1
        cc[e["target"]] = cc.get(e["target"], 0) + 1
    for n in nodes.values():
        n["connections"] = cc.get(n["id"], 0)

    return {"nodes": list(nodes.values()), "edges": edges}


@app.get("/graph/node/{node_id}")
async def get_node_details(node_id: str):
    conn = get_db()
    try:
        prefix, entity_id = node_id.split("_", 1)
        result = {"node_id": node_id, "details": {}}
        if prefix == "SO":
            r = conn.execute("SELECT * FROM sales_order_headers WHERE salesOrder=?", (entity_id,)).fetchone()
            if r: result["details"] = dict(r)
            result["items"] = [dict(x) for x in conn.execute("SELECT * FROM sales_order_items WHERE salesOrder=?", (entity_id,))]
        elif prefix == "DEL":
            r = conn.execute("SELECT * FROM outbound_delivery_headers WHERE deliveryDocument=?", (entity_id,)).fetchone()
            if r: result["details"] = dict(r)
            result["items"] = [dict(x) for x in conn.execute("SELECT * FROM outbound_delivery_items WHERE deliveryDocument=?", (entity_id,))]
        elif prefix == "BILL":
            r = conn.execute("SELECT * FROM billing_document_headers WHERE billingDocument=?", (entity_id,)).fetchone()
            if r: result["details"] = dict(r)
            result["items"] = [dict(x) for x in conn.execute("SELECT * FROM billing_document_items WHERE billingDocument=?", (entity_id,))]
        elif prefix == "CUST":
            r = conn.execute("SELECT * FROM business_partners WHERE businessPartner=?", (entity_id,)).fetchone()
            if r: result["details"] = dict(r)
            result["orders"] = [dict(x) for x in conn.execute("SELECT * FROM sales_order_headers WHERE soldToParty=? LIMIT 10", (entity_id,))]
        elif prefix == "JE":
            doc_id = entity_id.split("_")[0]
            rows = conn.execute("SELECT * FROM journal_entries WHERE accountingDocument=?", (doc_id,)).fetchall()
            if rows: result["details"] = dict(rows[0]); result["items"] = [dict(x) for x in rows]
        return result
    finally:
        conn.close()


@app.get("/stats")
async def get_stats():
    conn = get_db()
    try:
        out = {}
        for k, q in [
            ("sales_orders",  "SELECT COUNT(*) FROM sales_order_headers"),
            ("deliveries",    "SELECT COUNT(*) FROM outbound_delivery_headers"),
            ("billing_docs",  "SELECT COUNT(*) FROM billing_document_headers WHERE billingDocumentIsCancelled=0"),
            ("payments",      "SELECT COUNT(*) FROM payments"),
            ("customers",     "SELECT COUNT(*) FROM business_partners"),
            ("products",      "SELECT COUNT(*) FROM products"),
            ("total_revenue", "SELECT ROUND(SUM(totalNetAmount),2) FROM billing_document_headers WHERE billingDocumentIsCancelled=0"),
            ("broken_flows",  "SELECT COUNT(DISTINCT odi.referenceSdDocument) FROM outbound_delivery_items odi LEFT JOIN billing_document_items bdi ON odi.deliveryDocument=bdi.referenceSdDocument WHERE bdi.billingDocument IS NULL"),
        ]:
            out[k] = conn.execute(q).fetchone()[0] or 0
        return out
    finally:
        conn.close()


@app.get("/sample-queries")
async def sample_queries():
    return {"queries": [
        "Which products are associated with the highest number of billing documents?",
        "Show me the complete flow for billing document 90504259",
        "Which sales orders have been delivered but not billed?",
        "What is the total revenue per customer?",
        "Show me all cancelled billing documents",
        "Which customer has placed the most orders?",
        "What are the top 10 sales orders by amount?",
        "Show me all payments made in April 2025",
    ]}