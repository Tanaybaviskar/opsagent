import { DurableObject } from "cloudflare:workers";
import { TOOLS, TOOL_IMPL } from "./tools";

export interface Env { AI: Ai; OPS_AGENT: DurableObjectNamespace<OpsAgent>; }
type Msg = { role: "user" | "assistant"; content: string };

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const TOOL_DOC = TOOLS.map((t: any) => `- ${t.function.name}: ${t.function.description}`).join("\n");
const SYSTEM = `You are OpsAgent, a friendly assistant that diagnoses website and internet-service problems using LIVE tools.
For greetings or general questions, reply normally in plain text with NO tool call, and briefly say what you can do (check if a site is up or slow, DNS lookups, Cloudflare status).
To call a tool, reply with ONLY a JSON object and nothing else, e.g. {"tool":"probe_url","url":"https://github.com"} or {"tool":"dns_lookup","domain":"github.com","type":"A"} or {"tool":"check_cloudflare_status"}.
One tool per reply, at most 3 tool calls per question.
Tools:
${TOOL_DOC}
Base conclusions only on tool results and never invent data. If you need a site or domain and the user did not give one, ask.
Final answers: short, say what you found, the likely cause, and next steps.`;

// A tool call is a small JSON object in the model's reply, e.g. {"tool":"get_latency","service":"x"}
function parseCall(text: string): Record<string, any> | null {
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
    const memory = checked.length ? `\nTargets already checked this session: ${checked.join(", ")}.` : "";
    const msgs: any[] = [{ role: "system", content: SYSTEM + memory }, ...history];
    const trace: string[] = [];

    for (let step = 0; step < 5; step++) {
      const res: any = await this.env.AI.run(MODEL as any, { messages: msgs, max_tokens: 700 } as any);
      const raw = res.response;
      const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
      const call = parseCall(text);
      if (!call) return { reply: text || "(no response)", trace, checked };

      const result = await TOOL_IMPL[call.tool](call);
      const target = call.url ?? call.domain;
      if (target && !checked.includes(target)) checked.push(target);
      trace.push(`${call.tool}(${call.url ?? call.domain ?? ""})`);
      msgs.push({ role: "assistant", content: text });
      msgs.push({ role: "user", content: `TOOL RESULT for ${call.tool}: ${JSON.stringify(result)}\nCall another tool, or give your final answer in plain text.` });
    }
    return { reply: "Stopped after too many tool steps; ask me to continue.", trace, checked };
  }
}