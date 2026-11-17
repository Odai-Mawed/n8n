// ===== EINSTELLUNGEN – Workflow B (Collector) =====
const cfg = {
  aktiveCommunities: 32,      // 80 %: bewährte Nischen
  experimentelle: 8,          // 20 %: noch wenig untersuchte Nischen
  postsProCommunity: 25,
  zeitfensterStunden: 36,     // überlappendes Fenster gegen Lücken
  userAgent: 'n8n:reddit-nischen-scanner:1.0 (by /u/DEIN_REDDIT_NAME)',
};
// Startphase: zum Testen z. B. aktiveCommunities: 10, experimentelle: 5 setzen

const pool = $input.all().map((i) => i.json).filter((c) => c && c.name && c.status !== 'inactive');
const jetzt = Date.now();
const tageSeit = (iso) => (iso ? Math.max(0, (jetzt - Date.parse(iso)) / 864e5) : 30);

// Gewicht = Fundrate (+ kleiner Sockel) x Rotationsbonus (lange nicht gescannt) x Zufall
const gewicht = (c) => {
  const rate = Number(c.problem_yield || 0) + 0.02;
  const rotation = 1 + Math.min(tageSeit(c.last_scanned), 14) / 3;
  const watch = c.status === 'watchlist' ? 0.3 : 1;
  return rate * rotation * watch * (0.7 + Math.random() * 0.6);
};
const bewaehrt = pool.filter((c) => c.status === 'active' || c.status === 'watchlist')
  .map((c) => ({ c, w: gewicht(c) })).sort((a, b) => b.w - a.w).map((x) => x.c);
const neu = pool.filter((c) => c.status === 'explore')
  .sort((a, b) => Number(a.times_scanned || 0) - Number(b.times_scanned || 0) || Math.random() - 0.5);

const gesamt = cfg.aktiveCommunities + cfg.experimentelle;
const auswahl = [];
const nimm = (liste, n) => { for (const c of liste) { if (n <= 0) break; if (!auswahl.includes(c)) { auswahl.push(c); n--; } } };
nimm(bewaehrt, cfg.aktiveCommunities);
nimm(neu, cfg.experimentelle);
nimm(neu, gesamt - auswahl.length);       // zu wenige bewährte -> mit neuen auffüllen
nimm(bewaehrt, gesamt - auswahl.length);  // zu wenige neue -> mit bewährten auffüllen

return auswahl.map((c) => ({ json: { name: c.name, status: c.status, times_scanned: Number(c.times_scanned || 0), low_activity_count: Number(c.low_activity_count || 0), limit: cfg.postsProCommunity, zeitfensterStunden: cfg.zeitfensterStunden, userAgent: cfg.userAgent } }));
