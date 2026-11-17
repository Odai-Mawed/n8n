// Datenhaltung: Reddit-Rohtext höchstens 48 Stunden im Puffer behalten
const GRENZE_STUNDEN = 48;
const grenze = new Date(Date.now() - GRENZE_STUNDEN * 3600e3).toISOString();
return $input.all()
  .map((i) => i.json)
  .filter((r) => r && r.id && String(r.fetched_at || r.createdAt || '') < grenze)
  .map((r) => ({ json: { id: r.id } }));
