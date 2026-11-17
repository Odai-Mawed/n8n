// Fundrate pro Community aktualisieren und Status anpassen (explore -> active / watchlist)
const stats = $('Ergebnisse auswerten').first().json.stats || {};
const rows = $input.all().map((i) => i.json).filter((r) => r && r.name);
const map = new Map(rows.map((r) => [r.name, r]));
const out = [];
for (const [name, s] of Object.entries(stats)) {
  const r = map.get(name);
  if (!r) continue;
  const gescannt = Number(r.posts_scanned || 0) + s.gescannt;
  const gefunden = Number(r.problems_found || 0) + s.gefunden;
  const rate = gescannt ? gefunden / gescannt : 0;
  let status = r.status || 'explore';
  if (status === 'explore' && gescannt >= 40 && rate >= 0.03) status = 'active';
  else if (status === 'explore' && gescannt >= 60 && rate < 0.03) status = 'watchlist';
  else if (status === 'active' && gescannt >= 150 && rate < 0.015) status = 'watchlist';
  else if (status === 'watchlist' && gescannt >= 40 && rate >= 0.03) status = 'active';
  out.push({ json: { name, posts_scanned: gescannt, problems_found: gefunden, problem_yield: Math.round(rate * 10000) / 10000, status } });
}
return out;
