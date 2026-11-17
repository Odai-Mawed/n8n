// Die interessantesten Problemcluster für die Nachprüfung auswählen
const cfg = $('Einstellungen').first().json;
const cluster = $('Cluster laden').all().map((i) => i.json).filter((c) => c && c.cluster_key);
const evidenz = $('Belege laden').all().map((i) => i.json).filter((p) => p && p.cluster_key);
const jetzt = Date.now();
const tage = (iso) => (iso ? (jetzt - Date.parse(iso)) / 864e5 : 9999);

const proCluster = new Map();
for (const p of evidenz) { if (!proCluster.has(p.cluster_key)) proCluster.set(p.cluster_key, []); proCluster.get(p.cluster_key).push(p); }

const kandidaten = cluster
  .filter((c) => Number(c.evidence_count || 0) >= 1)
  .filter((c) => !c.last_ranked || tage(c.last_ranked) >= cfg.erneutBewertenNachTagen || String(c.last_seen || '') > String(c.last_ranked || ''))
  .map((c) => {
    const neueBelege = !c.last_ranked || String(c.last_seen || '') > String(c.last_ranked || '');
    const prio = Number(c.evidence_count || 0) * 3 + Number(c.subreddit_count || 0) * 2 + (neueBelege ? 5 : 0) + (tage(c.last_seen) <= 7 ? 3 : 0);
    return { c, prio };
  })
  .sort((a, b) => b.prio - a.prio)
  .slice(0, cfg.maxPruefungen)
  .map(({ c }) => {
    const belege = (proCluster.get(c.cluster_key) || [])
      .sort((a, b) => (a.source === 'scan' ? -1 : 1) - (b.source === 'scan' ? -1 : 1) || String(b.post_created).localeCompare(String(a.post_created)))
      .slice(0, 12)
      .map((p) => ({ post_id: p.post_id, subreddit: p.subreddit, permalink: p.permalink, post_created: p.post_created, source: p.source, actor: p.actor, problem: p.problem, workaround: p.workaround, payment_signal: p.payment_signal, quote: p.evidence_quote, comment_insight: p.comment_insight }));
    const subs = [...new Set(belege.map((b) => b.subreddit).filter(Boolean))];
    return { json: { keine: false, cluster_key: c.cluster_key, title: c.title, problem: c.problem, audience: c.audience, workaround: c.workaround, haupt_subreddit: subs[0] || '', belege } };
  });
return kandidaten.length ? kandidaten : [{ json: { keine: true } }];
