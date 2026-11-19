// Subreddits normalisieren, ungeeignete ausschließen, nur neue Communities zurückgeben
const MIN_ABONNENTEN = 300;        // sehr kleine, aber lebendige Communities bleiben erlaubt
const MAX_ABONNENTEN = 5000000;    // riesige Allgemein-Subs bringen selten Nischenprobleme
const MAX_NEUE_PRO_LAUF = 60;
const MAX_PRO_SUCHWORT = 4;        // nur die größten Treffer je Präfix (weniger Rauschen)
const SPERRLISTE = ['askreddit', 'pics', 'funny', 'news', 'worldnews', 'memes', 'gaming', 'videos', 'todayilearned', 'politics', 'nsfw'];
const ALLGEMEIN = /(meme|circlejerk|nsfw|porn|gonewild|onlyfans|shitpost|crypto|nft|giveaway|karma|simulator|games?$|gaming|fanart|fanfic|anime|cosplay|fuck)/i;

const themen = $('Suchthemen wählen').all();
const antworten = $('Reddit Community-Suche').all();
const bekannt = new Set($('Communities laden').all().map((i) => String(i.json.name || '').toLowerCase()).filter(Boolean));

const neu = new Map();
const verworfen = { privat: 0, nsfw: 0, klein: 0, gross: 0, bekannt: 0, allgemein: 0 };
antworten.forEach((it, idx) => {
  const thema = themen[idx] ? themen[idx].json : { nische: 'Unbekannt', modus: 'search', q: '' };
  const d0 = it.json && it.json.data;
  const kinder = (Array.isArray(d0) ? d0.map((x) => ({ data: x })) : (d0 && d0.children) || [])
    .sort((a, b) => Number((b.data || {}).subscribers || 0) - Number((a.data || {}).subscribers || 0));
  let proWort = 0;
  for (const k of kinder) {
    const s = k.data || {};
    const name = String(s.display_name || '').trim();
    const key = name.toLowerCase();
    if (!name) continue;
    if (bekannt.has(key) || neu.has(key)) { verworfen.bekannt++; continue; }
    if (s.subreddit_type !== 'public' || s.quarantine) { verworfen.privat++; continue; }
    if (s.over18) { verworfen.nsfw++; continue; }
    const abonnenten = Number(s.subscribers || 0);
    if (abonnenten < MIN_ABONNENTEN) { verworfen.klein++; continue; }
    if (abonnenten > MAX_ABONNENTEN || SPERRLISTE.includes(key)) { verworfen.gross++; continue; }
    if (ALLGEMEIN.test(name) || ALLGEMEIN.test(s.public_description || '')) { verworfen.allgemein++; continue; }
    if (proWort >= MAX_PRO_SUCHWORT) continue;
    proWort++;
    neu.set(key, {
      name,
      niche: thema.nische,
      status: 'explore',
      description: String(s.public_description || s.title || '').slice(0, 300),
      subscribers: abonnenten,
      discovered_via: 'prefix: ' + thema.q,
      posts_per_week: null,
      posts_scanned: 0,
      problems_found: 0,
      problem_yield: 0,
      times_scanned: 0,
      low_activity_count: 0,
      last_scanned: '',
      discovered_at: new Date().toISOString(),
    });
  }
});

const liste = [...neu.values()].slice(0, MAX_NEUE_PRO_LAUF);
return liste.length ? liste.map((c) => ({ json: c })) : [];
