// Gewichteten Score berechnen, Evidenzklasse vergeben, Top-Ideen wählen, Telegram-Report bauen
const cfg = $('Einstellungen').first().json;
const W = cfg.gewichte;
const kandidaten = $('Suchtreffer bündeln').all().map((i) => i.json);
const jetzt = new Date();
const jetztIso = jetzt.toISOString();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const datum = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '');
const r05 = (x) => Math.max(0, Math.min(5, Math.round(Number(x) || 0)));
const nachfrageDeckel = (n) => (n >= 8 ? 5 : n >= 5 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1);

const bewertet = [];
const neueBelege = [];
$input.all().forEach((it, idx) => {
  const k = kandidaten[idx];
  const o = it.json && it.json.output;
  if (!k || !o || !o.idea) return;
  const trefferMap = new Map((k.suchtreffer || []).map((t) => [t.post_id, t]));
  const bestaetigt = [...new Set((o.confirmed_hits || []).map(String))].filter((id) => trefferMap.has(id)).map((id) => trefferMap.get(id));

  // Unabhängige Diskussionen = unterschiedliche Posts (Kommentare zählen nicht extra)
  const quellen = [
    ...k.belege.map((b) => ({ post_id: b.post_id, subreddit: b.subreddit, permalink: b.permalink, datum: b.post_created, art: b.source })),
    ...bestaetigt.map((t) => ({ post_id: t.post_id, subreddit: t.subreddit, permalink: t.permalink, datum: t.created, art: 'verifikation' })),
  ];
  const ids = new Set(quellen.map((q) => q.post_id));
  const subs = new Set(quellen.map((q) => String(q.subreddit || '').toLowerCase()).filter(Boolean));
  const zeiten = quellen.map((q) => Date.parse(q.datum)).filter((x) => !isNaN(x)).sort();
  const spanneTage = zeiten.length > 1 ? (zeiten[zeiten.length - 1] - zeiten[0]) / 864e5 : 0;
  const n = ids.size;
  const klasse = n >= 5 && (subs.size >= 2 || spanneTage >= 30) ? 'A' : n >= 3 ? 'B' : 'C';

  const r = {
    problem: r05(o.ratings && o.ratings.problemstaerke),
    nachfrage: Math.min(r05(o.ratings && o.ratings.wiederholte_nachfrage), nachfrageDeckel(n)),
    zahlung: r05(o.ratings && o.ratings.zahlungsbereitschaft),
    erreichbar: r05(o.ratings && o.ratings.zielgruppe_erreichbar),
    mvp: r05(o.ratings && o.ratings.mvp_umsetzbarkeit),
    luecke: r05(o.ratings && o.ratings.marktluecke),
  };
  const score = Math.round(Object.keys(W).reduce((s, key) => s + (r[key] / 5) * W[key], 0));
  let status = 'beobachten';
  if (score >= cfg.minScore && klasse !== 'C') status = 'top5';
  else if (o.ausnahme && score >= cfg.minScore - 5) status = 'ausnahme';

  bewertet.push({ k, o, r, score, klasse, n, subs: subs.size, quellen, status });
  for (const t of bestaetigt) {
    neueBelege.push({
      post_id: t.post_id, subreddit: t.subreddit, permalink: t.permalink, post_created: t.created,
      actor: k.audience || '', problem: k.problem || '', evidence_quote: t.title, status: 'zugeordnet',
      cluster_key: k.cluster_key, source: 'verifikation', found_at: jetztIso, confidence: null,
    });
  }
});

bewertet.sort((a, b) => b.score - a.score);
const top = bewertet.filter((b) => b.status === 'top5').slice(0, cfg.topN);
const ausnahme = bewertet.find((b) => b.status === 'ausnahme');
const beobachten = bewertet.filter((b) => !top.includes(b) && b !== ausnahme);

const ideeText = (b, titel) => {
  const i = b.o.idea || {};
  const L = [];
  L.push(titel + ' · <b>' + b.score + '/100</b>');
  L.push('Evidenzklasse: <b>' + b.klasse + '</b> (' + b.n + ' unabhängige Diskussionen in ' + b.subs + ' Communities)');
  L.push('');
  L.push('<b>Problem:</b> ' + esc(i.problem || b.k.problem));
  L.push('<b>Geschäftsidee:</b> ' + esc(i.geschaeftsidee));
  L.push('<b>Zielgruppe:</b> ' + esc(i.zielgruppe || b.k.audience));
  L.push('<b>Preishypothese:</b> ' + esc(i.preis_hypothese));
  L.push('<b>MVP:</b> ' + esc(i.mvp));
  if (i.alternativen) L.push('<b>Bekannte Alternativen:</b> ' + esc(i.alternativen));
  L.push('<b>Offene Risiken:</b> ' + esc(i.risiken));
  L.push('<b>Nächster Schritt:</b> ' + esc(i.naechster_schritt));
  L.push('');
  L.push('<i>Problem ' + b.r.problem + '/5 · Nachfrage ' + b.r.nachfrage + '/5 · Zahlung ' + b.r.zahlung + '/5 · Erreichbar ' + b.r.erreichbar + '/5 · MVP ' + b.r.mvp + '/5 · Lücke ' + b.r.luecke + '/5</i>');
  L.push('');
  L.push('<b>Quellen:</b>');
  const gesehen = new Set();
  for (const q of b.quellen) {
    if (gesehen.size >= cfg.quellenProIdee || !q.permalink || gesehen.has(q.post_id)) continue;
    gesehen.add(q.post_id);
    L.push('• <a href="' + esc(q.permalink) + '">r/' + esc(q.subreddit) + '</a> – ' + datum(q.datum) + (q.art === 'verifikation' ? ' (Nachprüfung)' : ''));
  }
  let t = L.join('\n');
  return t.length > 4000 ? t.slice(0, 3990) + '\n…' : t;
};

const nachrichten = [];
const kopf = [];
kopf.push('<b>🔭 Reddit Opportunity Radar – ' + datum(jetztIso) + '</b>');
kopf.push(bewertet.length + ' Problemcluster geprüft · ' + top.length + ' Top-Ideen · ' + beobachten.length + ' auf der Beobachtungsliste');
if (!top.length) kopf.push('\nHeute keine Idee mit ≥ ' + cfg.minScore + ' Punkten und Evidenzklasse ≥ B.');
if (beobachten.length) {
  kopf.push('\n<b>Beobachtungsliste:</b>');
  for (const b of beobachten.slice(0, 5)) kopf.push('• ' + esc(b.o.idea.name || b.k.title) + ' – ' + b.score + '/100, Klasse ' + b.klasse);
}
nachrichten.push({ text: kopf.join('\n') });
top.forEach((b, i) => nachrichten.push({ text: ideeText(b, '<b>#' + (i + 1) + ' – ' + esc(b.o.idea.name || b.k.title) + '</b>') }));
if (ausnahme) nachrichten.push({ text: ideeText(ausnahme, '⚠️ <b>Vielversprechende Ausnahme (nicht validiert): ' + esc(ausnahme.o.idea.name || ausnahme.k.title) + '</b>\n<i>' + esc(ausnahme.o.ausnahme_grund) + '</i>') });

const clusterUpdates = bewertet.map((b) => ({
  cluster_key: b.k.cluster_key,
  score: b.score,
  evidence_grade: b.klasse,
  evidence_count: b.n,
  subreddit_count: b.subs,
  idea: JSON.stringify({ ...b.o.idea, ratings: b.r, bewertung: b.o.bewertung_kurz || '' }),
  report_status: b.status,
  last_ranked: jetztIso,
  ...(top.includes(b) || b === ausnahme ? { last_reported: jetztIso } : {}),
}));
return [{ json: { nachrichten, clusterUpdates, neueBelege, top: top.length } }];
