// Mock infrastructure data + the tools the LLM can call.
type Svc = {
  status: "healthy" | "degraded" | "down"; p50: number; p99: number; errorRate: number;
  errors: string[]; deploys: { version: string; minutesAgo: number }[];
};

const SERVICES: Record<string, Svc> = {
  "api-gateway": {
    status: "healthy", p50: 42, p99: 180, errorRate: 0.4,
    errors: [], deploys: [{ version: "v2.14.1", minutesAgo: 2880 }],
  },
  "auth-service": {
    status: "degraded", p50: 310, p99: 2400, errorRate: 6.8,
    errors: [
      "ERROR connection pool exhausted (max=20) waiting for postgres-primary",
      "WARN slow query: SELECT * FROM sessions WHERE user_id=? (2.1s)",
      "ERROR request timeout after 2000ms on /v1/login",
    ],
    deploys: [{ version: "v5.3.0", minutesAgo: 35 }, { version: "v5.2.9", minutesAgo: 4300 }],
  },
  "postgres-primary": {
    status: "degraded", p50: 90, p99: 1900, errorRate: 2.1,
    errors: [
      "WARN active connections 198/200",
      "WARN missing index on sessions(user_id) causing sequential scans",
    ],
    deploys: [],
  },
  "raft-kv": {
    status: "degraded", p50: 12, p99: 240, errorRate: 1.2,
    errors: [
      "INFO node-2 lost heartbeat, election started (term 41)",
      "INFO node-3 elected leader in 131ms (term 41)",
      "WARN node-2 unreachable: connection refused 10.0.0.12:9002",
    ],
    deploys: [{ version: "v1.8.0", minutesAgo: 600 }],
  },
};

const lookup = (name: unknown) => {
  const key = String(name ?? "").toLowerCase().trim();
  return SERVICES[key] ? { key, svc: SERVICES[key] } : null;
};
const unknown = (name: unknown) => ({ error: `unknown service '${name}'`, known: Object.keys(SERVICES) });

// LIVE probes: real HTTP requests made from the Worker at question time.
const WATCHLIST = [
  "https://www.cloudflare.com",
  "https://api.github.com",
  "https://www.wikipedia.org",
  "https://httpbin.org/status/503", // intentionally failing test endpoint
];
async function probe(url: string) {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5000) });
    return { url, status: r.status, ok: r.ok, ms: Date.now() - t };
  } catch (e: any) {
    return { url, ok: false, error: String(e?.message ?? e).slice(0, 80), ms: Date.now() - t };
  }
}

export const TOOL_IMPL: Record<string, (a: any) => unknown> = {
  // REAL data: live status from Cloudflare's public status API
  check_cloudflare_status: async () => {
    try {
      const d: any = await (await fetch("https://www.cloudflarestatus.com/api/v2/summary.json")).json();
      return {
        overall: d.status.description,
        notOperational: d.components.filter((c: any) => c.status !== "operational").map((c: any) => ({ name: c.name, status: c.status })).slice(0, 10),
      };
    } catch (e) { return { error: "could not reach status API" }; }
  },
  probe_watchlist: () => Promise.all(WATCHLIST.map(probe)),
  probe_url: (a) => (/^https:\/\//.test(String(a.url ?? "")) ? probe(String(a.url)) : { error: "url must start with https://" }),
  list_services: () => Object.entries(SERVICES).map(([n, s]) => ({ name: n, status: s.status })),
  check_service_health: (a) => { const r = lookup(a.service); return r ? { service: r.key, status: r.svc.status, errorRatePercent: r.svc.errorRate } : unknown(a.service); },
  get_recent_errors: (a) => { const r = lookup(a.service); return r ? { service: r.key, errors: r.svc.errors } : unknown(a.service); },
  get_latency: (a) => { const r = lookup(a.service); return r ? { service: r.key, p50_ms: r.svc.p50, p99_ms: r.svc.p99 } : unknown(a.service); },
  get_recent_deploys: (a) => { const r = lookup(a.service); return r ? { service: r.key, deploys: r.svc.deploys } : unknown(a.service); },
};

const svcParam = { type: "object", properties: { service: { type: "string", description: "service name, e.g. auth-service" } }, required: ["service"] };
const fn = (name: string, description: string, parameters: object) => ({ type: "function", function: { name, description, parameters } });

export const TOOLS = [
  fn("check_cloudflare_status", "Get LIVE real-world status of Cloudflare's public services (not mock data).", { type: "object", properties: {} }),
  fn("probe_watchlist", "LIVE: send real HTTP requests to a watchlist of public endpoints and report status code and response time (ms).", { type: "object", properties: {} }),
  fn("probe_url", "LIVE: send a real HTTP request to any https URL and report status code and response time (ms).", { type: "object", properties: { url: { type: "string", description: "full https URL" } }, required: ["url"] }),
  fn("list_services", "List all services and their current status.", { type: "object", properties: {} }),
  fn("check_service_health", "Get health status and error rate of a service.", svcParam),
  fn("get_recent_errors", "Get recent error/warning log lines for a service.", svcParam),
  fn("get_latency", "Get p50/p99 latency in ms for a service.", svcParam),
  fn("get_recent_deploys", "Get recent deployments of a service (minutes ago).", svcParam),
];