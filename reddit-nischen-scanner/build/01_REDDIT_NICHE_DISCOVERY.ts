import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const zeitplan = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: {
    name: 'Di & Fr 05:00',
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 5 * * 2,5' }] } },
    position: [0, 0],
  },
  output: [{}],
});

const manuell = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manuell starten', position: [0, 200] },
  output: [{}],
});

const suchthemen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Suchthemen wählen',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// ===== EINSTELLUNGEN – Workflow A (Nischen-Discovery) =====\nconst cfg = {\n  kategorienProLauf: 6,      // so viele Kategorien werden pro Lauf durchsucht (rotierend)\n  ergebnisseProSuche: 25,\n  userAgent: 'n8n:reddit-nischen-scanner:1.0 (by /u/DEIN_REDDIT_NAME)',\n};\n\n// Breite Nischen-Taxonomie: Kategorie -> englische Suchwörter\nconst taxonomie = [\n  ['Imkerei', ['beekeeping', 'apiary', 'honey production']],\n  ['Handwerk', ['woodworking', 'carpentry', 'cabinetmaking']],\n  ['Elektro & Installation', ['electricians', 'hvac', 'plumbing']],\n  ['Landwirtschaft', ['farming', 'homestead', 'agriculture']],\n  ['Viehhaltung', ['livestock', 'backyard chickens', 'goats']],\n  ['Haustierhaltung', ['dog training', 'cat care', 'reptile keeping']],\n  ['Pferde', ['equestrian', 'horse care', 'farrier']],\n  ['Aquaristik', ['aquarium', 'reef tank', 'aquascaping']],\n  ['Sportvereine', ['youth coaching', 'sports club management', 'referee']],\n  ['Fotografie', ['wedding photography', 'photography business', 'photo editing']],\n  ['Videoproduktion', ['videography', 'film production', 'video editing business']],\n  ['3D-Druck', ['3d printing', 'print farm', 'resin printing']],\n  ['CNC & Maker', ['cnc machining', 'laser engraving', 'maker space']],\n  ['Veranstaltungstechnik', ['live sound', 'stage lighting', 'event production']],\n  ['Eventplanung', ['wedding planning', 'event planning', 'catering business']],\n  ['Fahrzeugpflege', ['auto detailing', 'car wash business', 'paint correction']],\n  ['Kfz-Werkstatt', ['mechanic', 'auto repair shop', 'diesel mechanics']],\n  ['Gastronomie', ['restaurant owners', 'kitchen confidential', 'food truck']],\n  ['Bäckerei & Konditorei', ['baking business', 'cake decorating', 'cottage food']],\n  ['Musikunterricht', ['music teachers', 'piano teaching', 'guitar lessons']],\n  ['Tonstudio', ['audio engineering', 'home recording', 'mixing mastering']],\n  ['Textilhandwerk', ['sewing', 'quilting', 'embroidery business']],\n  ['Strick & Häkel', ['knitting', 'crochet', 'yarn dyeing']],\n  ['Gartenbau', ['landscaping business', 'lawn care', 'arborist']],\n  ['Gewächshaus & Pflanzen', ['greenhouse', 'plant nursery', 'hydroponics']],\n  ['Vermietung', ['landlords', 'property management', 'airbnb hosts']],\n  ['Bootssport', ['sailing', 'boat maintenance', 'kayak fishing']],\n  ['Angeln & Jagd', ['fly fishing', 'hunting', 'taxidermy']],\n  ['Sammler-Hobbys', ['coin collecting', 'trading card shop', 'vinyl collecting']],\n  ['Antiquitäten & Reselling', ['antique dealers', 'flipping', 'estate sales']],\n  ['Kleine Dienstleister', ['cleaning business', 'pressure washing', 'handyman']],\n  ['Werkstätten', ['small engine repair', 'bike mechanic', 'welding']],\n  ['Pflege & Gesundheit', ['physical therapy', 'dental office', 'home care agency']],\n  ['Beauty', ['hairstylist', 'nail technician', 'esthetician']],\n  ['Fitness-Trainer', ['personal trainer', 'yoga teachers', 'gym owners']],\n  ['Nachhilfe & Bildung', ['tutoring business', 'homeschooling', 'teachers']],\n  ['Kinderbetreuung', ['daycare', 'nanny', 'childcare providers']],\n  ['Logistik & Fahrer', ['truckers', 'courier', 'moving company']],\n  ['Bau & Renovierung', ['general contractor', 'roofing', 'drywall']],\n  ['Kunsthandwerk & Etsy', ['etsy sellers', 'candle making', 'pottery']],\n  ['Schmuck', ['jewelry making', 'silversmith', 'watch repair']],\n  ['Brauen & Getränke', ['homebrewing', 'winemaking', 'coffee roasting']],\n  ['Modellbau & Tabletop', ['miniature painting', 'model railroad', 'wargaming']],\n  ['Brettspiele & Spieleläden', ['board game cafe', 'game store owners', 'tabletop rpg gm']],\n  ['Tierarztpraxis', ['veterinary', 'vet techs', 'dog grooming']],\n  ['Bestattung & Nischenberufe', ['funeral directors', 'locksmith', 'pest control']],\n  ['Druck & Werbetechnik', ['screen printing', 'sign making', 'vinyl cutting']],\n  ['Dronen & Vermessung', ['drone pilots', 'land surveying', 'gis']],\n];\n\n// Rotation: jede Discovery-Runde (2x pro Woche) nimmt die nächsten Kategorien\nconst jetzt = new Date();\nconst runde = Math.floor(jetzt.getTime() / (3.5 * 864e5));\nconst start = (runde * cfg.kategorienProLauf) % taxonomie.length;\nconst out = [];\nfor (let i = 0; i < cfg.kategorienProLauf; i++) {\n  const [nische, woerter] = taxonomie[(start + i) % taxonomie.length];\n  // Arctic Shift sucht nach Subreddit-Namen (Präfix): 'dog training' -> 'dogtraining'\n  const praefixe = new Set(woerter.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')));\n  for (const q of praefixe) out.push({ json: { modus: 'search', q, nische, limit: cfg.ergebnisseProSuche, userAgent: cfg.userAgent } });\n}\nreturn out;\n" },
    position: [240, 100],
  },
  output: [{ modus: 'search', q: 'beekeeping', nische: 'Imkerei', limit: 25, userAgent: 'n8n:reddit-nischen-scanner:1.0' }],
});

const suche = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Reddit Community-Suche',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: 'GET',
      url: expr("{{ $json.modus === 'new' ? 'https://oauth.reddit.com/subreddits/new' : 'https://oauth.reddit.com/subreddits/search' }}"),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'redditOAuth2Api',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: {
        parameters: [
          { name: 'q', value: expr('{{ $json.q }}') },
          { name: 'sort', value: 'activity' },
          { name: 'limit', value: expr('{{ $json.limit }}') },
          { name: 'raw_json', value: '1' },
        ],
      },
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'User-Agent', value: expr('{{ $json.userAgent }}') }] },
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 2500 } },
        response: { response: { neverError: true } },
        timeout: 20000,
      },
    },
    credentials: { redditOAuth2Api: newCredential('Reddit OAuth2') },
    position: [480, 100],
  },
  output: [{ kind: 'Listing', data: { children: [{ kind: 't5', data: { display_name: 'Beekeeping', subscribers: 250000, subreddit_type: 'public', over18: false, public_description: 'All about bees' } }] } }],
});

const communitiesLaden = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Communities laden',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'id', value: 'EUU4889vTyNyeAqO', cachedResultName: 'reddit_communities' },
      returnAll: true,
    },
    position: [720, 100],
  },
  output: [{ id: 1, name: 'Beekeeping', status: 'active' }],
});

const normalisieren = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalisieren & filtern',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Subreddits normalisieren, ungeeignete ausschließen, nur neue Communities zurückgeben\nconst MIN_ABONNENTEN = 300;        // sehr kleine, aber lebendige Communities bleiben erlaubt\nconst MAX_ABONNENTEN = 5000000;    // riesige Allgemein-Subs bringen selten Nischenprobleme\nconst MAX_NEUE_PRO_LAUF = 60;\nconst MAX_PRO_SUCHWORT = 4;        // nur die größten Treffer je Präfix (weniger Rauschen)\nconst SPERRLISTE = ['askreddit', 'pics', 'funny', 'news', 'worldnews', 'memes', 'gaming', 'videos', 'todayilearned', 'politics', 'nsfw'];\nconst ALLGEMEIN = /(meme|circlejerk|nsfw|porn|gonewild|onlyfans|shitpost|crypto|nft|giveaway|karma|simulator|games?$|gaming|fanart|fanfic|anime|cosplay|fuck)/i;\n\nconst themen = $('Suchthemen wählen').all();\nconst antworten = $('Reddit Community-Suche').all();\nconst bekannt = new Set($('Communities laden').all().map((i) => String(i.json.name || '').toLowerCase()).filter(Boolean));\n\nconst neu = new Map();\nconst verworfen = { privat: 0, nsfw: 0, klein: 0, gross: 0, bekannt: 0, allgemein: 0 };\nantworten.forEach((it, idx) => {\n  const thema = themen[idx] ? themen[idx].json : { nische: 'Unbekannt', modus: 'search', q: '' };\n  const d0 = it.json && it.json.data;\n  const kinder = (Array.isArray(d0) ? d0.map((x) => ({ data: x })) : (d0 && d0.children) || [])\n    .sort((a, b) => Number((b.data || {}).subscribers || 0) - Number((a.data || {}).subscribers || 0));\n  let proWort = 0;\n  for (const k of kinder) {\n    const s = k.data || {};\n    const name = String(s.display_name || '').trim();\n    const key = name.toLowerCase();\n    if (!name) continue;\n    if (bekannt.has(key) || neu.has(key)) { verworfen.bekannt++; continue; }\n    if (s.subreddit_type !== 'public' || s.quarantine) { verworfen.privat++; continue; }\n    if (s.over18) { verworfen.nsfw++; continue; }\n    const abonnenten = Number(s.subscribers || 0);\n    if (abonnenten < MIN_ABONNENTEN) { verworfen.klein++; continue; }\n    if (abonnenten > MAX_ABONNENTEN || SPERRLISTE.includes(key)) { verworfen.gross++; continue; }\n    if (ALLGEMEIN.test(name) || ALLGEMEIN.test(s.public_description || '')) { verworfen.allgemein++; continue; }\n    if (proWort >= MAX_PRO_SUCHWORT) continue;\n    proWort++;\n    neu.set(key, {\n      name,\n      niche: thema.nische,\n      status: 'explore',\n      description: String(s.public_description || s.title || '').slice(0, 300),\n      subscribers: abonnenten,\n      discovered_via: 'prefix: ' + thema.q,\n      posts_per_week: null,\n      posts_scanned: 0,\n      problems_found: 0,\n      problem_yield: 0,\n      times_scanned: 0,\n      low_activity_count: 0,\n      last_scanned: '',\n      discovered_at: new Date().toISOString(),\n    });\n  }\n});\n\nconst liste = [...neu.values()].slice(0, MAX_NEUE_PRO_LAUF);\nreturn liste.length ? liste.map((c) => ({ json: c })) : [];\n" },
    position: [960, 100],
  },
  output: [{ name: 'Apiary', niche: 'Imkerei', status: 'explore', description: 'Bees', subscribers: 1200, discovered_via: 'search: apiary', posts_per_week: null, posts_scanned: 0, problems_found: 0, problem_yield: 0, times_scanned: 0, low_activity_count: 0, last_scanned: '', discovered_at: '2026-11-17T05:00:00.000Z' }],
});

const speichern = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Neue Communities speichern',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'id', value: 'EUU4889vTyNyeAqO', cachedResultName: 'reddit_communities' },
      columns: { mappingMode: 'autoMapInputData', value: null },
      options: { optimizeBulk: true },
    },
    position: [1200, 100],
  },
  output: [{}],
});

const notiz = sticky(
  '## 01 – Nischen-Discovery\nDi & Fr 05:00: wählt rotierend 6 Kategorien aus der Taxonomie (Node **Suchthemen wählen**), sucht passende Subreddits (`/subreddits/search`) plus `/subreddits/new` und speichert nur **neue**, öffentliche, nicht-NSFW Communities mit Status `explore`.\n\nVor dem ersten Lauf: Credential **Reddit OAuth2** verbinden und im Node *Suchthemen wählen* den `userAgent` mit deinem Reddit-Namen anpassen. Ersten Lauf manuell starten, damit der Pool gefüllt ist.',
  [suchthemen, suche, communitiesLaden, normalisieren, speichern],
  { color: 4 },
);

export default workflow('reddit-niche-discovery', '01_REDDIT_NICHE_DISCOVERY')
  .add(zeitplan)
  .to(suchthemen)
  .to(suche)
  .to(communitiesLaden)
  .to(normalisieren)
  .to(speichern)
  .add(manuell)
  .to(suchthemen)
  .add(notiz)
  .group('Suchen', [suchthemen, suche], { description: 'Rotierende Nischen-Kategorien wählen und Reddit nach passenden Subreddits durchsuchen' })
  .group('Filtern & speichern', [communitiesLaden, normalisieren, speichern], { description: 'Bekannte, private, NSFW und Allgemein-Subs aussortieren; neue Communities als explore speichern' });
