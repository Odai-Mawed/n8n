// Aus den KI-Suchbegriffen Reddit-Suchanfragen bauen (2x Reddit-weit, 1x in der Hauptcommunity)
const cfg = $('Einstellungen').first().json;
const kandidaten = $('Kandidaten wählen').all().map((i) => i.json);
const out = [];
$input.all().forEach((it, idx) => {
  const k = kandidaten[idx];
  if (!k) return;
  const qs = ((it.json.output && it.json.output.queries) || []).map((q) => String(q).trim()).filter(Boolean).slice(0, 3);
  qs.forEach((q, qi) => {
    const lokal = qi === 2 && k.haupt_subreddit;
    out.push({ json: {
      cluster_key: k.cluster_key, q,
      url: lokal ? 'https://oauth.reddit.com/r/' + k.haupt_subreddit + '/search' : 'https://oauth.reddit.com/search',
      restrict_sr: lokal ? '1' : '0', t: lokal ? 'all' : 'year', userAgent: cfg.userAgent,
    } });
  });
});
return out;
