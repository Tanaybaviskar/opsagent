// All tools return LIVE data from real requests made at question time.
const WATCHLIST = [
  "https://www.cloudflare.com",
  "https://api.github.com",
  "https://www.wikipedia.org",
  "https://www.google.com",
];

const normalize = (u: unknown) => {
  const s = String(u ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

async function probe(input: string) {
  const url = normalize(input);
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(6000) });
    const h = (k: string) => r.headers.get(k) ?? undefined;
    return {
      url, status: r.status, ok: r.ok, ms: Date.now() - t,
      server: h("server"), cfCache: h("cf-cache-status"), cfRay: h("cf-ray"), contentType: h("content-type"),
    };
  } catch (e: any) {
    return { url, ok: false, ms: Date.now() - t, error: String(e?.message ?? e).slice(0, 100) };
  }
}

// DNS over HTTPS using Cloudflare's public 1.1.1.1 resolver.
async function dnsLookup(domain: string, type = "A") {
  const t = Date.now();
  try {
    const q = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`;
    const d: any = await (await fetch(q, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) })).json();
    const codes: Record<number, string> = { 0: "NOERROR", 2: "SERVFAIL", 3: "NXDOMAIN" };
    return {
      domain, type, result: codes[d.Status] ?? `code ${d.Status}`, ms: Date.now() - t,
      answers: (d.Answer ?? []).slice(0, 8).map((a: any) => ({ name: a.name, ttl: a.TTL, data: a.data })),
    };
  } catch (e: any) {
    return { domain, error: String(e?.message ?? e).slice(0, 100) };
  }
}

export const TOOL_IMPL: Record<string, (a: any) => unknown> = {
  check_cloudflare_status: async () => {
    try {
      const d: any = await (await fetch("https://www.cloudflarestatus.com/api/v2/summary.json", { signal: AbortSignal.timeout(5000) })).json();
      return {
        overall: d.status.description,
        notOperational: d.components.filter((c: any) => c.status !== "operational").map((c: any) => ({ name: c.name, status: c.status })).slice(0, 10),
      };
    } catch { return { error: "could not reach Cloudflare status API" }; }
  },
  probe_url: (a) => probe(a.url),
  probe_watchlist: () => Promise.all(WATCHLIST.map(probe)),
  dns_lookup: (a) => dnsLookup(String(a.domain ?? ""), a.type || "A"),
};

const fn = (name: string, description: string, parameters: object) => ({ type: "function", function: { name, description, parameters } });
const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, required });

export const TOOLS = [
  fn("check_cloudflare_status", "Live status of Cloudflare's own services from its public status page.", obj({})),
  fn("probe_url", "Send a real HTTP request to a site/URL; returns status code, response time (ms), and headers like server and cf-cache-status.", obj({ url: { type: "string" } }, ["url"])),
  fn("probe_watchlist", "Probe a fixed set of popular public sites (cloudflare.com, github, wikipedia, google) for status and latency.", obj({})),
  fn("dns_lookup", "Real DNS lookup via Cloudflare 1.1.1.1 (DNS-over-HTTPS). type is A, AAAA, MX, NS, TXT, or CNAME.", obj({ domain: { type: "string" }, type: { type: "string" } }, ["domain"])),
];