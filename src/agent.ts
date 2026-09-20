import { DurableObject } from "cloudflare:workers";
import { TOOLS, TOOL_IMPL } from "./tools";

export interface Env { AI: Ai; OPS_AGENT: DurableObjectNamespace<OpsAgent>; }
type Msg = { role: "user" | "assistant"; content: string };

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const TOOL_DOC = TOOLS.map((t: any) => `- ${t.function.name}: ${t.function.description}`).join("\n");
const SYSTEM = `You are OpsAgent, an SRE assistant that investigates infrastructure incidents using tools.
To call a tool, reply with ONLY a JSON object and nothing else, e.g. {"tool":"get_latency","service":"auth-service"}
(list_services needs no service: {"tool":"list_services"}). Call one tool per reply.
Available tools:
${TOOL_DOC}
Tools check_cloudflare_status, probe_watchlist and probe_url return LIVE data. The other tools return SIMULATED data for demo internal services (api-gateway, auth-service, postgres-primary, raft-kv).
RULES: Answer ONLY what the user asked. For questions about Cloudflare or a public website/URL, use ONLY the live tools (check_cloudflare_status, probe_url) and never mention the demo services. Use the simulated tools only if the user asks about those demo services, asks generally what is unhealthy, or asks for an incident investigation, and then label them "simulated". For simple questions use at most 2 tool calls.
For an incident investigation, gather evidence (health, errors, latency, deploys) and check dependencies of failing services.
When you have enough evidence, reply in plain text (no JSON): 1) what is wrong, 2) likely root cause with evidence, 3) next steps. Never invent data.`;

// A tool call is a small JSON object in the model's reply, e.g. {"tool":"get_latency","service":"x"}
function parseCall(text: string): { tool: string; service?: string; url?: string } | null {
  const m = text.match(/\{[^{}]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    return o && typeof o.tool === "string" && TOOL_IMPL[o.tool] ? o : null;
  } catch { return null; }
}

// One Durable Object per chat session: it owns the memory and runs the agent loop.
export class OpsAgent extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    try {
      const path = new URL(req.url).pathname;
      if (path === "/history") return Response.json(await this.load());
      if (path === "/reset") { await this.ctx.storage.deleteAll(); return Response.json({ ok: true }); }

      const { message } = (await req.json()) as { message: string };
      const history = await this.load();
      history.push({ role: "user", content: message });

      const { reply, trace, checked } = await this.investigate(history);

      history.push({ role: "assistant", content: reply });
      await this.ctx.storage.put("history", history.slice(-30));
      await this.ctx.storage.put("checked", checked);
      return Response.json({ reply, trace });
    } catch (e: any) {
      return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
    }
  }

  private async load(): Promise<Msg[]> {
    return (await this.ctx.storage.get<Msg[]>("history")) ?? [];
  }

  private async investigate(history: Msg[]) {
    const checked = (await this.ctx.storage.get<string[]>("checked")) ?? [];
    const memory = checked.length ? `\nServices already investigated this session: ${checked.join(", ")}.` : "";
    const msgs: any[] = [{ role: "system", content: SYSTEM + memory }, ...history];
    const trace: string[] = [];

    for (let step = 0; step < 8; step++) {
      const res: any = await this.env.AI.run(MODEL as any, { messages: msgs, max_tokens: 700 } as any);
      const raw = res.response;
      const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
      const call = parseCall(text);
      if (!call) return { reply: text || "(no response)", trace, checked };

      const result = await TOOL_IMPL[call.tool]({ service: call.service, url: call.url });
      if (call.service && !checked.includes(call.service)) checked.push(call.service);
      trace.push(`${call.tool}(${call.service ?? call.url ?? ""})`);
      msgs.push({ role: "assistant", content: text });
      msgs.push({ role: "user", content: `TOOL RESULT for ${call.tool}: ${JSON.stringify(result)}\nCall another tool, or give your final answer in plain text.` });
    }
    return { reply: "Stopped after too many tool steps; ask me to continue.", trace, checked };
  }
}