// Ungeprüfte Posts in KI-Batches aufteilen (nach Anzahl UND Zeichenbudget)
const cfg = $('Einstellungen').first().json;
const posts = $input.all().map((i) => i.json).filter((p) => p && p.post_id);
if (!posts.length) return [{ json: { leer: true, batch_nr: 0, posts: [], anzahl: 0 } }];

const kuerzen = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + ' …' : s; };
const batches = [];
let akt = []; let zeichen = 0;
for (const p of posts) {
  const eintrag = { post_id: p.post_id, subreddit: p.subreddit, title: kuerzen(p.title, 300), body: kuerzen(p.body, cfg.maxZeichenProPost) };
  const laenge = eintrag.title.length + eintrag.body.length + 60;
  if (akt.length && (akt.length >= cfg.postsProBatch || zeichen + laenge > cfg.zeichenProBatch)) { batches.push(akt); akt = []; zeichen = 0; }
  akt.push(eintrag); zeichen += laenge;
}
if (akt.length) batches.push(akt);
return batches.slice(0, cfg.batchesProRunde).map((b, i) => ({ json: { leer: false, batch_nr: i + 1, anzahl: b.length, posts: b } }));
