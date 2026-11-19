// Bis zu N qualifizierte Probleme auswählen, deren Diskussion vertieft werden soll
const cfg = $('Einstellungen').first().json;
const probleme = $input.all().map((i) => i.json).filter((p) => p && p.post_id);
const kandidaten = probleme
  .filter((p) => p.needs_comment_review)
  .sort((a, b) => Number(b.confidence) - Number(a.confidence))
  .slice(0, cfg.maxKommentarThreads)
  .map((p) => ({ json: { keine: false, post_id: p.post_id, artikel_id: String(p.post_id).replace(/^t3_/, ''), link_id: String(p.post_id), userAgent: cfg.userAgent } }));
return kandidaten.length ? kandidaten : [{ json: { keine: true } }];
