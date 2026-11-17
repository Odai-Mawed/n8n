// ===== EINSTELLUNGEN – Workflow C (Problem Intelligence) =====
// Läuft in Runden (je eigene Ausführung, wegen Laufzeitlimit). Phase "analyse" wiederholt sich,
// bis alle neuen Posts analysiert sind oder das Tagesbudget erreicht ist; danach Phase "cluster".
const cfg = {
  postsProBatch: 18,          // 15–20 kurze Posts pro KI-Aufruf
  zeichenProBatch: 14000,     // zusätzliches Zeichenbudget pro Batch
  maxZeichenProPost: 1800,    // lange Beiträge werden gekürzt
  batchesProRunde: 4,         // KI-Batches pro Ausführung (Laufzeitlimit)
  maxRundenProTag: 15,        // KI-Kostenlimit: 15 Runden x 4 Batches x 18 Posts ≈ 1.080 Posts
  minConfidence: 0.70,        // ab hier: qualifiziertes Problem
  pruefConfidence: 0.40,      // 0.40–0.69: niedrig priorisierte Prüfliste
  maxKommentarThreads: 20,    // Kommentar-Vertiefungen pro Tag
  maxProblemeProClusterlauf: 45,
  problemeProClusterBatch: 15,
  maxBekannteCluster: 200,    // so viele bestehende Cluster sieht das Cluster-Modell
  userAgent: 'n8n:reddit-nischen-scanner:1.0 (by /u/DEIN_REDDIT_NAME)',
};
const ein = $input.first()?.json || {};
return [{ json: { ...cfg, phase: ein.phase === 'cluster' ? 'cluster' : 'analyse', runde: Number(ein.runde || 0) } }];
