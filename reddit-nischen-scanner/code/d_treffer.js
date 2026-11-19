// Geladene Posts lokal mit den Suchbegriffen abgleichen und je Cluster bündeln
const kandidaten = $('Kandidaten wählen').all().map((i) => i.json);
const anfragen = $('Suchanfragen bilden').all().map((i) => i.json);
const STOPP = new Set(['with', 'your', 'from', 'that', 'this', 'what', 'have', 'does', 'they', 'them', 'into', 'about', 'when', 'where', 'which', 'there', 'their', 'manage', 'managing', 'handle']);
const woerter = (qs) => [...new Set(qs.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOPP.has(w)))];
const treffer = new Map(kandidaten.map((k) => [k.cluster_key, new Map()]));
$input.all().forEach((it, idx) => {
  const a = anfragen[idx];
  if (!a || !treffer.has(a.cluster_key)) return;
  const k = kandidaten.find((x) => x.cluster_key === a.cluster_key);
  const bekannt = new Set(k.belege.map((b) => b.post_id));
  const begriffe = woerter(a.queries || []);
  const d0 = it.json && it.json.data;
  const posts = Array.isArray(d0) ? d0 : ((d0 && d0.children) || []).map((c) => c.data);
  for (const d of posts) {
    if (!d) continue;
    const id = d.name || (d.id ? 't3_' + d.id : '');
    if (!id || bekannt.has(id) || d.over_18 || treffer.get(a.cluster_key).has(id)) continue;
    if (['[removed]', '[deleted]'].includes(d.selftext)) continue;
    const text = (String(d.title || '') + ' ' + String(d.selftext || '')).toLowerCase();
    const passend = begriffe.filter((w) => text.includes(w)).length;
    if (passend < 2) continue;
    treffer.get(a.cluster_key).set(id, {
      post_id: id, subreddit: d.subreddit, title: String(d.title || '').slice(0, 200),
      text: String(d.selftext || '').replace(/\s+/g, ' ').slice(0, 300),
      permalink: 'https://www.reddit.com' + (d.permalink || ''),
      created: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : '', num_comments: d.num_comments || 0, passend,
    });
  }
});
return kandidaten.map((k) => ({ json: { ...k, suchtreffer: [...treffer.get(k.cluster_key).values()].sort((a, b) => b.passend - a.passend).slice(0, 15) } }));
