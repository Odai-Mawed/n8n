// KI-Ergebnisse den Posts zuordnen, Qualität prüfen, Schreib-Listen bauen
const cfg = $('Einstellungen').first().json;
const batches = $('Batches bilden').all();
const ergebnisse = $input.all();
const quelle = new Map($('Ungeprüfte Posts laden').all().map((i) => [i.json.post_id, i.json]));
const jetzt = new Date().toISOString();
const PAIN = ['time', 'money', 'risk', 'frustration', 'compliance', 'growth', 'other'];
const FREQ = ['daily', 'weekly', 'monthly', 'rare', 'unknown'];
const PAY = ['none', 'weak', 'medium', 'strong'];

const probleme = []; const analysiert = []; const stats = {};
let fehlerBatches = 0;
ergebnisse.forEach((it, idx) => {
  const batch = batches[idx] ? batches[idx].json.posts : [];
  const out = it.json && it.json.output;
  const liste = out && Array.isArray(out.posts) ? out.posts : null;
  if (!liste) { fehlerBatches++; return; }              // Batch fehlgeschlagen -> Posts bleiben offen
  const proPost = new Map(liste.map((r) => [String(r.post_id), r]));
  for (const p of batch) {
    analysiert.push({ post_id: p.post_id, analyzed: true });
    const s = (stats[p.subreddit] = stats[p.subreddit] || { gescannt: 0, gefunden: 0 });
    s.gescannt++;
    const r = proPost.get(String(p.post_id));
    if (!r || !r.has_problem) continue;
    const conf = Math.max(0, Math.min(1, Number(r.confidence) || 0));
    if (conf < cfg.pruefConfidence) continue;
    const src = quelle.get(p.post_id) || {};
    if (conf >= cfg.minConfidence) s.gefunden++;
    probleme.push({
      post_id: p.post_id,
      subreddit: p.subreddit,
      permalink: src.permalink || '',
      post_created: src.created_utc ? new Date(Number(src.created_utc) * 1000).toISOString() : '',
      actor: String(r.actor || '').slice(0, 200),
      task: String(r.task || '').slice(0, 300),
      problem: String(r.problem || '').slice(0, 600),
      workaround: String(r.workaround || '').slice(0, 300),
      frequency: FREQ.includes(r.frequency) ? r.frequency : 'unknown',
      pain_type: PAIN.includes(r.pain_type) ? r.pain_type : 'other',
      payment_signal: PAY.includes(r.payment_signal) ? r.payment_signal : 'none',
      evidence_quote: String(r.evidence_quote || '').slice(0, 240),
      confidence: conf,
      needs_comment_review: !!r.needs_comment_review,
      comment_insight: '',
      status: conf >= cfg.minConfidence ? 'qualifiziert' : 'pruefen',
      cluster_key: '',
      source: 'scan',
      found_at: jetzt,
    });
  }
});
const ungeprueft = $('Ungeprüfte Posts laden').all().length;
const analysiertAnzahl = analysiert.length;
const weitere = ungeprueft > analysiertAnzahl || ungeprueft >= cfg.postsProBatch * cfg.batchesProRunde;
return [{ json: { probleme, analysiert, stats, fehlerBatches, weitere, qualifiziert: probleme.filter((p) => p.status === 'qualifiziert').length } }];
