# OpsAgent

A chat agent that helps investigate infrastructure problems, built on Cloudflare Workers AI and Durable Objects.

**Live demo:** https://opsagent.tanaybaviskar.workers.dev



## How it maps to the assignment

| Requirement | Implementation |
|---|---|
| LLM | Llama 3.3 70B on Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| Workflow / coordination | A Durable Object per session runs an agent loop: model reply -> parse tool call -> run tool -> feed result back -> repeat (max 8 steps) |
| User input | Chat UI served by the Worker |
| Memory / state | Durable Object storage keeps the conversation history and the services already investigated |

## Architecture

Browser -> Worker (routes by session id) -> Durable Object (memory + agent loop) -> Workers AI, and tools.

- `src/index.ts`: routes requests and serves the chat page
- `src/agent.ts`: the Durable Object, system prompt, and tool loop
- `src/tools.ts`: tool definitions and implementations
- `src/ui.ts`: chat UI

## Tools

**Live** (real requests at question time):
- `check_cloudflare_status`: Cloudflare's public status API
- `probe_watchlist`: HTTP requests to a watchlist of public endpoints (status code and latency, measured from the Worker's location); one endpoint is an intentionally failing test URL
- `probe_url`: same for any https URL you ask about

**Simulated** (hardcoded demo data for internal services: `api-gateway`, `auth-service`, `postgres-primary`, `raft-kv`):
`list_services`, `check_service_health`, `get_recent_errors`, `get_latency`, `get_recent_deploys`

The agent is instructed to label simulated findings as simulated.

## Design notes and limitations

- Tool calls use a prompt-based JSON protocol (the model replies with `{"tool": "...", ...}`) instead of native function calling. My first attempt with native tool calling returned an internal error from Workers AI, so I switched to this simpler approach.
- The model does not always follow the rules in the system prompt; scoping questions to the right tools is best-effort.
- The internal-service data is mock data, not real telemetry.
- No authentication or rate limiting.

## Run locally

```
npm install
npx wrangler login
npm run dev
npm run deploy
```

## Development history

I used an AI assistant while building this. See [PROMPTS.md](PROMPTS.md) for the prompts and what I ran, debugged, and changed.