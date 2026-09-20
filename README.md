# OpsAgent

A chat agent that helps investigate infrastructure problems, built on Cloudflare Workers AI and Durable Objects.

**Live demo:** [<PASTE YOUR workers.dev LINK HERE>](https://opsagent.tanaybaviskar.workers.dev)

<img width="995" height="763" alt="image" src="https://github.com/user-attachments/assets/57ce34eb-3f67-4df8-b581-7b28a01b761f" />

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

## Tools (all live; no mock data)
- `check_cloudflare_status`: Cloudflare's public status API
- `probe_url`: real HTTP request to any site; status, latency (ms), and headers such as server and cf-cache-status
- `probe_watchlist`: probes a set of popular public sites
- `dns_lookup`: real DNS lookups via Cloudflare's 1.1.1.1 DNS-over-HTTPS

Latency is measured from the Worker's network location, not from the user's browser.

## Design notes and limitations

- Tool calls use a prompt-based JSON protocol (the model replies with `{"tool": "...", ...}`) instead of native function calling. My first attempt with native tool calling returned an internal error from Workers AI, so I switched to this simpler approach.
- The model does not always follow the rules in the system prompt; scoping questions to the right tools is best-effort.
- Tools cover public internet endpoints only, not private infrastructure.
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