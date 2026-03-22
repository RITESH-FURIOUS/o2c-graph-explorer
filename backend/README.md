# Backend - O2C Graph API

## Setup

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## API Endpoints

- `GET /health` — Health check
- `GET /stats` — Dashboard statistics
- `GET /graph` — Full graph data (nodes + edges)
- `GET /graph/node/{node_id}` — Node details
- `POST /chat` — Conversational query
- `GET /sample-queries` — Sample questions

## Configure API Key

Open `main.py` and replace `YOUR_GROQ_API_KEY_HERE` with your Groq key.
Get a free key at https://console.groq.com
