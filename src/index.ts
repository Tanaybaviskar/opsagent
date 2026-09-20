import { OpsAgent, Env } from "./agent";
import { HTML } from "./ui";
export { OpsAgent };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (["/chat", "/history", "/reset"].includes(url.pathname)) {
      const session = url.searchParams.get("session") || "default";
      const stub = env.OPS_AGENT.get(env.OPS_AGENT.idFromName(session));
      return stub.fetch(req);
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
