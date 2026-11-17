// Neue Probleme + kompakte Liste bestehender Cluster in Batches für das Cluster-Modell
const cfg = $('Einstellungen').first().json;
const probleme = $('Kommentar-Kontext bündeln').first().json.probleme || [];
const cluster = $('Cluster laden').all().map((i) => i.json).filter((c) => c && c.cluster_key)
  .sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')))
  .slice(0, cfg.maxBekannteCluster)
  .map((c) => ({ cluster_key: c.cluster_key, title: c.title, problem: c.problem, audience: c.audience }));
const out = [];
for (let i = 0; i < probleme.length; i += cfg.problemeProClusterBatch) {
  const teil = probleme.slice(i, i + cfg.problemeProClusterBatch).map((p) => ({
    post_id: p.post_id, subreddit: p.subreddit, actor: p.actor, task: p.task, problem: p.problem,
    workaround: p.workaround, frequency: p.frequency, pain_type: p.pain_type, payment_signal: p.payment_signal,
    evidence_quote: p.evidence_quote, top_comments: p.kommentare || [],
  }));
  out.push({ json: { batch_nr: out.length + 1, neue_probleme: teil, bestehende_cluster: cluster } });
}
return out;
