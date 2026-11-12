// Scandal-o-Meter: zero-dependency Node server (Node 18+).
//   node server.js            -> live Yahoo Finance quotes
//   MOCK=1 node server.js     -> fake prices (offline demo)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const MOCK = process.env.MOCK === "1";
const PUBLIC = path.join(__dirname, "public");
const profiles = require("./data/profiles.js");

// Non-S&P AI & chip names to include
const EXTRAS = [
  ["TSM", "Taiwan Semiconductor (TSMC)", "Information Technology", "Semiconductors"],
  ["ASML", "ASML Holding", "Information Technology", "Semiconductor Equipment"],
  ["ARM", "Arm Holdings", "Information Technology", "Semiconductors"],
  ["SNOW", "Snowflake", "Information Technology", "Application Software"],
  ["TTD", "The Trade Desk", "Communication Services", "Advertising"],
  ["CRWV", "CoreWeave", "Information Technology", "AI Cloud"],
  ["NBIS", "Nebius Group", "Information Technology", "AI Cloud"],
  ["ALAB", "Astera Labs", "Information Technology", "Semiconductors"],
  ["CRDO", "Credo Technology", "Information Technology", "Semiconductors"],
  ["SOUN", "SoundHound AI", "Information Technology", "Application Software"],
  ["IONQ", "IonQ", "Information Technology", "Quantum Computing"],
  ["RGTI", "Rigetti Computing", "Information Technology", "Quantum Computing"],
  ["AI", "C3.ai", "Information Technology", "Application Software"],
  ["WBD", "Warner Bros. Discovery", "Communication Services", "Movies & Entertainment"],
  ["PSKY", "Paramount Skydance", "Communication Services", "Movies & Entertainment"],
];

// ── Scoring ──────────────────────────────────────────────
const WEIGHTS = [0.2, 0.25, 0.15, 0.15, 0.25]; // posting, feuds, memes, stunts, headlines
const TIERS = [
  { min: 75, id: "red", name: "Code Red", tag: "PR team sleeps with their phone on" },
  { min: 55, id: "spicy", name: "Spicy", tag: "One podcast away from trending" },
  { min: 35, id: "simmer", name: "Simmering", tag: "Handle with oven mitts" },
  { min: 15, id: "mild", name: "Mostly Harmless", tag: "Press-release energy" },
  { min: 0, id: "beige", name: "Beige Mode", tag: "Legally boring" },
];
const score = (s) => Math.round(s.reduce((a, v, i) => a + v * WEIGHTS[i], 0) * 10);
const tierFor = (n) => TIERS.find((t) => n >= t.min);

function parseCSV(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const cells = [];
    let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

function buildCompanies() {
  const sp = parseCSV(fs.readFileSync(path.join(__dirname, "data/sp500.csv"), "utf8"))
    .map(([symbol, name, sector, industry]) => ({ symbol, name, sector, industry, index: "S&P 500" }));
  const have = new Set(sp.map((c) => c.symbol));
  const extras = EXTRAS.filter(([s]) => !have.has(s)).map(([symbol, name, sector, industry]) => ({ symbol, name, sector, industry, index: "AI & Chips" }));
  return [...sp, ...extras].map((c) => {
    const p = profiles[c.symbol];
    if (!p) return { ...c, profiled: false, risk: null, tier: null };
    const risk = score(p.s);
    return {
      ...c, profiled: true, ceo: p.ceo, roast: p.roast, notes: p.notes,
      metrics: { posting: p.s[0], feuds: p.s[1], memes: p.s[2], stunts: p.s[3], headlines: p.s[4] },
      risk, tier: tierFor(risk),
    };
  });
}
const COMPANIES = buildCompanies();

// ── Quotes (Yahoo Finance) ───────────────────────────────
const yahooSym = (s) => s.replace(/\./g, "-"); // BRK.B -> BRK-B
const cache = new Map(); // symbol -> { t, data }
const TTL = 60_000;
const UA = { "User-Agent": "Mozilla/5.0 (scandal-o-meter)" };

function fromChart(r) {
  const m = r.meta || r.response?.[0]?.meta;
  const body = r.response?.[0] || r;
  const closes = (body.indicators?.quote?.[0]?.close || []).filter((x) => x != null);
  const price = m?.regularMarketPrice ?? closes.at(-1);
  const prev = m?.chartPreviousClose ?? m?.previousClose;
  if (price == null) return null;
  return {
    price, prev, change: prev ? price - prev : null,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    currency: m?.currency || "USD", spark: closes.slice(-60), marketTime: m?.regularMarketTime,
  };
}

async function fetchChart(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym(sym))}?range=1d&interval=5m`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`chart ${sym} ${r.status}`);
  const j = await r.json();
  return fromChart(j.chart.result[0]);
}

async function fetchSparkBatch(syms) {
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${syms.map(yahooSym).join(",")}&range=1d&interval=5m`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`spark ${r.status}`);
  const j = await r.json();
  const out = {};
  for (const res of j.spark?.result || []) {
    const orig = syms.find((s) => yahooSym(s) === res.symbol);
    const q = orig && fromChart(res);
    if (q) out[orig] = q;
  }
  return out;
}

function mockQuote(sym) {
  let h = 0; for (const c of sym) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const base = 20 + (h % 900);
  const spark = []; let v = base;
  for (let i = 0; i < 60; i++) { v *= 1 + ((Math.sin(h + i * 0.15 + Date.now() / 6e4) + Math.sin(h * 7 + i * 0.6) * 0.5) * 0.002); spark.push(+v.toFixed(2)); }
  const price = spark.at(-1);
  return { price, prev: base, change: price - base, changePct: ((price - base) / base) * 100, currency: "USD", spark, mock: true };
}

async function getQuotes(symbols) {
  const now = Date.now(), out = {}, need = [];
  for (const s of symbols) {
    const c = cache.get(s);
    if (c && now - c.t < TTL) out[s] = c.data; else need.push(s);
  }
  if (MOCK) { for (const s of need) out[s] = mockQuote(s); return out; }

  // Batch via spark (20 per call), fall back to per-symbol chart calls
  const batches = [];
  for (let i = 0; i < need.length; i += 20) batches.push(need.slice(i, i + 20));
  await Promise.all(batches.map(async (b) => {
    let got = {};
    try { got = await fetchSparkBatch(b); } catch (e) { /* fall through */ }
    const missing = b.filter((s) => !got[s]);
    for (let i = 0; i < missing.length; i += 5) {
      await Promise.all(missing.slice(i, i + 5).map(async (s) => {
        try { const q = await fetchChart(s); if (q) got[s] = q; } catch (e) { /* skip */ }
      }));
    }
    for (const [s, q] of Object.entries(got)) { cache.set(s, { t: now, data: q }); out[s] = q; }
  }));
  return out;
}

// ── HTTP ─────────────────────────────────────────────────
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/companies") return json(res, 200, { tiers: TIERS, weights: WEIGHTS, companies: COMPANIES, mock: MOCK });
  if (url.pathname === "/api/quotes") {
    const syms = (url.searchParams.get("symbols") || "").split(",").filter(Boolean).slice(0, 600);
    try { return json(res, 200, await getQuotes(syms)); } catch (e) { return json(res, 502, { error: e.message }); }
  }
  const file = path.join(PUBLIC, path.normalize(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Scandal-o-Meter running at http://localhost:${PORT}${MOCK ? "  (MOCK prices)" : ""}`));
