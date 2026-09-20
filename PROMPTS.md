# Prompt history and development notes

I used Claude (Anthropic) as a coding assistant for this project. This file lists how I directed it, what I ran and debugged myself, and what I changed. The initial code was AI-generated. I ran, tested, and modified it, and I can explain each part.

## How I worked

1. **Picked the project.** I asked what to build for Cloudflare's assignment, then chose an infra incident agent, because the role is infrastructure tooling and I already had observability and distributed-systems projects (ghost-observer, RaftKV).
2. **Generated a first version.** Prompt: *"infra ops chat agent... give me all the files, then tell me how to do everything after I have the code."*
3. **Set up and ran it myself.** Created the folder and files, installed dependencies, logged into Wrangler, and checked what permissions it requested and whether it would cost anything.
4. **Debugged real errors.** I hit two:
   - *"You need to register a workers.dev subdomain"*: registered one in the Cloudflare dashboard.
   - *`InferenceUpstreamError: internal error`* (shown in the UI as `JSON.parse: unexpected character`): the Workers AI call failed. I pasted the full log; the fix was to replace native tool calling with a prompt-based JSON tool protocol and return readable errors to the UI.
5. **Asked how it works before trusting it.** Examples:
   - *"on what is this running, actual cloudflare source code or what, where are these requests going?"* Learned: Worker and Durable Object run locally in Miniflare during `wrangler dev`, while the Workers AI call goes to Cloudflare remotely.
   - *"when I ask what's unhealthy, what does it check?"* Learned: the tools return hardcoded mock data in `src/tools.ts`, so I document this as a limitation.
6. **Tested the live tools and caught a behavior problem.** I asked "whats wrong with cloudflare right now" and "is api.github.com slow?". The agent called the live tools but then also investigated the simulated auth-service and mixed the two. I recognized the auth-service output was simulated data and fixed the system prompt so live questions use only live tools, simulated tools are labeled, and simple questions use at most 2 tool calls.
7. **Re-read the assignment requirements** and mapped each one to a component (see README).

## Prompts (chronological, lightly trimmed)

- "what should i add here" (pasting Cloudflare's assignment text)
- "go through my github and tell me properly"
- "i dont even know what that is but sure go on and we will build that, give me all the files"
- "i just created a folder named it opsagent, and pasted the codes there, now what"
- "i logged into wrangler it asked for perms for 26 things, is it all free of cost, will i be billed?"
- "what after run dev, what should i expect"
- (pasted the workers.dev subdomain error)
- (pasted the InferenceUpstreamError log)
- "on what is this running... where are these requests going"
- "so when i ask whats unhealthy, what does it check?"
- "what does cloudflare want when it says this" (the assignment text)
- "so this fits perfectly? or could it be better?" then "what changes do i do to the code"
- "i hope now its not hardcoded or anything?" then "it wants a live one so more live"
- (pasted a chat transcript and asked whether the auth-service output was fake data)

## Changes and decisions I made

<!-- Fill in only what you actually did. Delete lines you did not do. -->
- [ ] Replaced one mock tool with a live data source: ______
- [ ] Added tests for tool-call parsing: ______
- [ ] Tested on the deployed Worker and confirmed: ______

## What I would improve next

- Replace all mock data with real telemetry sources.
- Use the model's native tool calling once the request format is verified against Workers AI.
- Add streaming responses and per-session rate limiting.
