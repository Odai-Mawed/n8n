// Reddit-Antworten in einheitliche Post-Objekte umwandeln, filtern, Duplikate entfernen
const auswahl = $('Communities auswählen').all().map((i) => i.json);
const antworten = $input.all();
const bekannt = new Set($('Puffer laden').all().map((i) => i.json.post_id).filter(Boolean));
const jetzt = Date.now();
const jetztIso = new Date().toISOString();

const posts = []; const updates = []; const gesehen = new Set();
const fehler = [];
antworten.forEach((it, idx) => {
  const c = auswahl[idx];
  if (!c) return;
  const kinder = (it.json && it.json.data && it.json.data.children) || null;
  if (!kinder) { fehler.push(c.name); return; }
  const grenze = jetzt / 1000 - c.zeitfensterStunden * 3600;

  // Aktivität: Posts pro Woche aus der Zeitspanne der neuesten Posts schätzen
  const zeiten = kinder.map((k) => Number(k.data && k.data.created_utc)).filter(Boolean).sort((a, b) => b - a);
  let ppw = 0;
  if (zeiten.length >= 2) {
    const spanneTage = Math.max((jetzt / 1000 - zeiten[zeiten.length - 1]) / 86400, 0.5);
    ppw = Math.round((zeiten.length / spanneTage) * 7 * 10) / 10;
  }
  const wenig = ppw < 10;  // Startheuristik: mind. 10 neue Posts pro Woche
  const lowCount = wenig ? c.low_activity_count + 1 : 0;
  updates.push({
    name: c.name,
    last_scanned: jetztIso,
    times_scanned: c.times_scanned + 1,
    posts_per_week: ppw,
    low_activity_count: lowCount,
    status: lowCount >= 2 ? 'inactive' : c.status,
  });

  for (const k of kinder) {
    const d = k.data || {};
    const id = d.name || (d.id ? 't3_' + d.id : '');
    if (!id || bekannt.has(id) || gesehen.has(id)) continue;
    if (Number(d.created_utc) < grenze) continue;
    if (d.stickied || d.over_18 || d.removed_by_category || d.author === 'AutoModerator') continue;
    const body = String(d.selftext || '');
    if (['[removed]', '[deleted]'].includes(body)) continue;
    if (!d.is_self && !body && !d.title) continue;
    gesehen.add(id);
    posts.push({
      post_id: id,
      subreddit: c.name,  // Schreibweise wie im Community-Pool (für Fundraten)
      title: String(d.title || '').slice(0, 300),
      body: body.slice(0, 4000),
      permalink: 'https://www.reddit.com' + (d.permalink || ''),
      created_utc: Number(d.created_utc) || 0,
      score: Number(d.score) || 0,
      num_comments: Number(d.num_comments) || 0,
      fetched_at: jetztIso,
      analyzed: false,
    });
  }
});
return [{ json: { posts, updates, neuePosts: posts.length, communities: auswahl.length, fehler } }];
