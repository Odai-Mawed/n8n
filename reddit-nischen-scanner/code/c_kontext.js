// Kommentar-Kontext an die Probleme hängen (Top-Kommentare, gekürzt)
const probleme = $('Neue Probleme laden').all().map((i) => i.json).filter((p) => p && p.post_id);
const kommentare = new Map();
try {
  const kandidaten = $('Kommentar-Kandidaten').all();
  const antworten = $('Kommentare abrufen').all();
  antworten.forEach((it, idx) => {
    const k = kandidaten[idx] && kandidaten[idx].json;
    const body = it.json && it.json.body;
    if (!k || !body) return;
    // Arctic Shift: { data: [kommentar, ...] } – Reddit: [post, { data: { children } }]
    const roh = Array.isArray(body.data) ? body.data.map((x) => ({ kind: 't1', data: x })) : Array.isArray(body) && body[1] ? (body[1].data && body[1].data.children) || [] : [];
    const liste = roh
      .filter((c) => c.kind === 't1' && c.data && c.data.body && !c.data.stickied && c.data.author !== 'AutoModerator' && !['[removed]', '[deleted]'].includes(c.data.body))
      .sort((a, b) => (b.data.score || 0) - (a.data.score || 0))
      .slice(0, 8)
      .map((c) => String(c.data.body).replace(/\s+/g, ' ').slice(0, 280));
    if (liste.length) kommentare.set(k.post_id, liste);
  });
} catch (e) { /* keine Kommentare abgerufen */ }
return [{ json: { probleme: probleme.map((p) => ({ ...p, kommentare: kommentare.get(p.post_id) || [] })), mitKommentaren: kommentare.size } }];
