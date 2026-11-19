// Nachprüfung: je Cluster die neuesten 100 Posts der (bis zu 2) wichtigsten Communities laden.
// Die KI-Suchbegriffe werden danach lokal abgeglichen (Arctic-Shift-Volltextsuche ist zu langsam).
const cfg = $('Einstellungen').first().json;
const kandidaten = $('Kandidaten wählen').all().map((i) => i.json);
const out = [];
$input.all().forEach((it, idx) => {
  const k = kandidaten[idx];
  if (!k) return;
  const queries = ((it.json.output && it.json.output.queries) || []).map((q) => String(q).trim()).filter(Boolean).slice(0, 3);
  const subs = [...new Set(k.belege.map((b) => b.subreddit).filter(Boolean))].slice(0, 2);
  for (const sub of subs) out.push({ json: { cluster_key: k.cluster_key, subreddit: sub, queries, userAgent: cfg.userAgent } });
});
return out;
