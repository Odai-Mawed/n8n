// Suchtreffer je Cluster bündeln (ohne bereits bekannte Belege)
const kandidaten = $('Kandidaten wählen').all().map((i) => i.json);
const anfragen = $('Suchanfragen bilden').all().map((i) => i.json);
const treffer = new Map(kandidaten.map((k) => [k.cluster_key, new Map()]));
$input.all().forEach((it, idx) => {
  const a = anfragen[idx];
  if (!a || !treffer.has(a.cluster_key)) return;
  const k = kandidaten.find((x) => x.cluster_key === a.cluster_key);
  const bekannt = new Set(k.belege.map((b) => b.post_id));
  const kinder = (it.json && it.json.data && it.json.data.children) || [];
  for (const c of kinder) {
    const d = c.data || {};
    const id = d.name || (d.id ? 't3_' + d.id : '');
    if (!id || bekannt.has(id) || d.over_18 || treffer.get(a.cluster_key).has(id)) continue;
    if (['[removed]', '[deleted]'].includes(d.selftext)) continue;
    treffer.get(a.cluster_key).set(id, {
      post_id: id, subreddit: d.subreddit, title: String(d.title || '').slice(0, 200),
      text: String(d.selftext || '').replace(/\s+/g, ' ').slice(0, 300),
      permalink: 'https://www.reddit.com' + (d.permalink || ''),
      created: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : '', num_comments: d.num_comments || 0, query: a.q,
    });
  }
});
return kandidaten.map((k) => ({ json: { ...k, suchtreffer: [...treffer.get(k.cluster_key).values()].slice(0, 15) } }));
