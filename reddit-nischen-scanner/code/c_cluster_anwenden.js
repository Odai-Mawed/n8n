// Cluster-Entscheidungen anwenden: neue Cluster anlegen, Probleme zuordnen, Evidenz neu zählen
const batches = $('Cluster-Batches bilden').all();
const bekannt = new Map($('Cluster laden').all().map((i) => i.json).filter((c) => c && c.cluster_key).map((c) => [c.cluster_key, c]));
const original = new Map($('Neue Probleme laden').all().map((i) => [i.json.post_id, i.json]));
const basisZeit = Date.now().toString(36);
const updates = new Map();   // post_id -> Problem-Update
const neueCluster = new Map(); // cluster_key -> Cluster

$input.all().forEach((it, bi) => {
  const out = it.json && it.json.output;
  if (!out || !Array.isArray(out.results)) return;
  const neuRef = new Map();
  for (const nc of out.new_clusters || []) {
    const key = 'c' + basisZeit + '_' + bi + '_' + String(nc.new_ref || neuRef.size).replace(/[^a-zA-Z0-9]/g, '');
    neuRef.set(String(nc.new_ref), key);
    neueCluster.set(key, { cluster_key: key, title: String(nc.title || '').slice(0, 150), problem: String(nc.problem || '').slice(0, 600), audience: String(nc.audience || '').slice(0, 200), workaround: String(nc.workaround || '').slice(0, 300) });
  }
  const erlaubt = new Set(batches[bi] ? batches[bi].json.neue_probleme.map((p) => p.post_id) : []);
  for (const r of out.results) {
    const pid = String(r.post_id || '');
    if (!erlaubt.has(pid) || !original.has(pid)) continue;
    const o = original.get(pid);
    const ref = r.refined || {};
    let key = '';
    if (r.keep !== false) {
      const a = r.assignment || {};
      if (a.type === 'existing' && bekannt.has(a.cluster_key)) key = a.cluster_key;
      else if (a.type === 'new' && neuRef.has(String(a.new_ref))) key = neuRef.get(String(a.new_ref));
      else {
        key = 'c' + basisZeit + '_' + bi + '_s' + updates.size;
        neueCluster.set(key, { cluster_key: key, title: String(ref.problem || o.problem).slice(0, 150), problem: String(ref.problem || o.problem).slice(0, 600), audience: String(ref.actor || o.actor || '').slice(0, 200), workaround: String(ref.workaround || o.workaround || '').slice(0, 300) });
      }
    }
    updates.set(pid, {
      post_id: pid,
      source: 'scan',
      status: key ? 'zugeordnet' : 'verworfen',
      cluster_key: key,
      actor: String(ref.actor || o.actor || '').slice(0, 200),
      problem: String(ref.problem || o.problem || '').slice(0, 600),
      workaround: String(ref.workaround || o.workaround || '').slice(0, 300),
      payment_signal: ['none', 'weak', 'medium', 'strong'].includes(ref.payment_signal) ? ref.payment_signal : o.payment_signal,
      comment_insight: String(ref.comment_insight || '').slice(0, 400),
    });
  }
});

// Evidenz je Cluster neu zählen: unabhängige Diskussionen = unterschiedliche Posts
const alle = new Map();
for (const i of $('Alle Zuordnungen laden').all()) { const p = i.json; if (p && p.post_id && p.cluster_key) alle.set(p.post_id + '|' + (p.source || 'scan'), p); }
for (const u of updates.values()) { const o = original.get(u.post_id) || {}; alle.set(u.post_id + '|scan', { ...o, ...u }); }
const betroffen = new Set([...updates.values()].map((u) => u.cluster_key).filter(Boolean));
const cluster = [];
for (const key of betroffen) {
  const ev = [...alle.values()].filter((p) => p.cluster_key === key);
  const posts = new Set(ev.map((p) => p.post_id));
  const subs = [...new Set(ev.map((p) => p.subreddit).filter(Boolean))];
  const zeiten = ev.map((p) => p.post_created || p.found_at).filter(Boolean).sort();
  const basis = neueCluster.get(key) || bekannt.get(key) || { cluster_key: key };
  const row = {
    cluster_key: key, title: basis.title || '', problem: basis.problem || '', audience: basis.audience || '', workaround: basis.workaround || '',
    subreddits: subs.join(', '), evidence_count: posts.size, subreddit_count: subs.length,
    first_seen: basis.first_seen || zeiten[0] || new Date().toISOString(), last_seen: zeiten[zeiten.length - 1] || new Date().toISOString(),
  };
  if (neueCluster.has(key)) row.report_status = 'neu';
  cluster.push(row);
}
return [{ json: { problemUpdates: [...updates.values()], cluster, neueCluster: neueCluster.size, zugeordnet: [...updates.values()].filter((u) => u.cluster_key).length } }];
