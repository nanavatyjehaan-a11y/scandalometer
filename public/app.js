const $ = (id) => document.getElementById(id);
const COLORS = { red: "var(--red)", spicy: "var(--spicy)", simmer: "var(--simmer)", mild: "var(--mild)", beige: "var(--beige)" };
const ICONS = [["📱", "posting"], ["🥊", "feuds"], ["🐸", "memes"], ["🎤", "stunts"], ["📰", "headlines"]];
let data = { companies: [], tiers: [] };
let quotes = {};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function spark(pts, up) {
  if (!pts || pts.length < 2) return "";
  const min = Math.min(...pts), max = Math.max(...pts), r = max - min || 1;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * 110},${28 - ((v - min) / r) * 26 - 1}`).join(" ");
  return `<svg class="spark" viewBox="0 0 110 28"><polyline fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="1.5" points="${d}"/></svg>`;
}

function priceRow(sym) {
  const q = quotes[sym];
  if (!q) return `<div class="price meta">Loading price…</div>`;
  const up = (q.change ?? 0) >= 0;
  const pct = q.changePct == null ? "" : `${up ? "+" : ""}${q.changePct.toFixed(2)}%`;
  return `<div class="price"><span>$${q.price.toFixed(2)} <span class="${up ? "up" : "down"}">${pct}</span></span>${spark(q.spark, up)}</div>`;
}

function card(c) {
  if (!c.profiled) {
    return `<article class="card unprof"><div class="top"><div><div class="name">${esc(c.name)}</div>
      <div class="meta">${esc(c.symbol)} · ${esc(c.sector)} · ${esc(c.index)}</div></div>
      <div class="score"><small>Not profiled</small></div></div>${priceRow(c.symbol)}</article>`;
  }
  const color = COLORS[c.tier.id];
  const bars = ICONS.map(([icon, k]) => `<span title="${k}">${icon}</span><div class="bar"><i style="width:${c.metrics[k] * 10}%"></i></div><span>${c.metrics[k]}</span>`).join("");
  return `<article class="card" style="--c:${color}">
    <div class="top"><div><div class="name">${esc(c.name)}</div>
      <div class="meta">${esc(c.symbol)} · CEO ${esc(c.ceo)}</div>
      <div class="tier">${esc(c.tier.name)}</div></div>
      <div class="score"><b>${c.risk}</b><small>/ 100 risk</small></div></div>
    <p class="roast">“${esc(c.roast)}”</p>
    <div class="bars">${bars}</div>
    ${priceRow(c.symbol)}</article>`;
}

function filtered() {
  const q = $("q").value.trim().toLowerCase(), tier = $("tier").value, sector = $("sector").value, unprof = $("unprof").checked;
  let list = data.companies.filter((c) =>
    (unprof || c.profiled) &&
    (!tier || c.tier?.id === tier) &&
    (!sector || c.sector === sector) &&
    (!q || [c.name, c.symbol, c.ceo].some((v) => v && v.toLowerCase().includes(q))));
  const sort = $("sort").value;
  list.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "change") return (quotes[b.symbol]?.changePct ?? -1e9) - (quotes[a.symbol]?.changePct ?? -1e9);
    return (b.risk ?? -1) - (a.risk ?? -1) || a.name.localeCompare(b.name);
  });
  return list;
}

function render() {
  const list = filtered();
  $("grid").innerHTML = list.map(card).join("");
  $("count").textContent = `${list.length} compan${list.length === 1 ? "y" : "ies"} shown`;
}

async function loadQuotes() {
  const syms = filtered().map((c) => c.symbol).filter((s) => !quotes[s] || Date.now() - (quotes[s]._t || 0) > 60000);
  for (let i = 0; i < syms.length; i += 100) {
    try {
      const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(syms.slice(i, i + 100).join(","))}`);
      const j = await r.json();
      for (const [s, q] of Object.entries(j)) quotes[s] = { ...q, _t: Date.now() };
      render();
    } catch (e) { /* keep going */ }
  }
}

async function init() {
  data = await (await fetch("/api/companies")).json();
  if (data.mock) $("mockNote").hidden = false;
  for (const t of data.tiers) {
    $("tier").insertAdjacentHTML("beforeend", `<option value="${t.id}">${esc(t.name)}</option>`);
    $("legend").insertAdjacentHTML("beforeend", `<span class="pill"><span class="dot" style="background:${COLORS[t.id]}"></span>${esc(t.name)} ${t.min}+ · <span class="meta">${esc(t.tag)}</span></span>`);
  }
  [...new Set(data.companies.map((c) => c.sector))].sort().forEach((s) =>
    $("sector").insertAdjacentHTML("beforeend", `<option>${esc(s)}</option>`));
  render();
  loadQuotes();
  ["q", "tier", "sector", "sort", "unprof"].forEach((id) => $(id).addEventListener("input", () => { render(); loadQuotes(); }));
  setInterval(loadQuotes, 60000);
}
init();
