import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const TB_COMMUNITIES = { __rl: true, mode: 'id', value: 'EUU4889vTyNyeAqO', cachedResultName: 'reddit_communities' };
const TB_BUFFER = { __rl: true, mode: 'id', value: 'cyeRQFTdgntnM39D', cachedResultName: 'reddit_posts_buffer' };

const zeitplan = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: { name: 'Täglich 06:00', parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 6, triggerAtMinute: 0 }] } }, position: [0, 0] },
  output: [{}],
});

const manuell = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manuell starten', position: [0, 200] },
  output: [{}],
});

const pufferLaden = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Puffer laden',
    alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: TB_BUFFER, returnAll: true },
    position: [240, 100],
  },
  output: [{ id: 1, post_id: 't3_abc', fetched_at: '2026-11-15T06:00:00.000Z' }],
});

const alteFinden = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Posts älter als 48 h', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Datenhaltung: Reddit-Rohtext höchstens 48 Stunden im Puffer behalten\nconst GRENZE_STUNDEN = 48;\nconst grenze = new Date(Date.now() - GRENZE_STUNDEN * 3600e3).toISOString();\nreturn $input.all()\n  .map((i) => i.json)\n  .filter((r) => r && r.id && String(r.fetched_at || r.createdAt || '') < grenze)\n  .map((r) => ({ json: { id: r.id } }));\n" }, position: [480, -100] },
  output: [{ id: 1 }],
});

const alteLoeschen = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Alte Posts löschen',
    parameters: {
      resource: 'row',
      operation: 'deleteRows',
      dataTableId: TB_BUFFER,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.id }}') }] },
    },
    position: [720, -100],
  },
  output: [{}],
});

const communitiesLaden = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Communities laden',
    executeOnce: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: TB_COMMUNITIES, returnAll: true },
    position: [480, 200],
  },
  output: [{ id: 1, name: 'Beekeeping', status: 'active', problem_yield: 0.05, last_scanned: '2026-11-16T06:00:00.000Z', times_scanned: 3, low_activity_count: 0 }],
});

const auswahl = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Communities auswählen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// ===== EINSTELLUNGEN – Workflow B (Collector) =====\nconst cfg = {\n  aktiveCommunities: 32,      // 80 %: bewährte Nischen\n  experimentelle: 8,          // 20 %: noch wenig untersuchte Nischen\n  postsProCommunity: 25,\n  zeitfensterStunden: 36,     // überlappendes Fenster gegen Lücken\n  userAgent: 'n8n:reddit-nischen-scanner:1.0 (by /u/DEIN_REDDIT_NAME)',\n};\n// Startphase: zum Testen z. B. aktiveCommunities: 10, experimentelle: 5 setzen\n\nconst pool = $input.all().map((i) => i.json).filter((c) => c && c.name && c.status !== 'inactive');\nconst jetzt = Date.now();\nconst tageSeit = (iso) => (iso ? Math.max(0, (jetzt - Date.parse(iso)) / 864e5) : 30);\n\n// Gewicht = Fundrate (+ kleiner Sockel) x Rotationsbonus (lange nicht gescannt) x Zufall\nconst gewicht = (c) => {\n  const rate = Number(c.problem_yield || 0) + 0.02;\n  const rotation = 1 + Math.min(tageSeit(c.last_scanned), 14) / 3;\n  const watch = c.status === 'watchlist' ? 0.3 : 1;\n  return rate * rotation * watch * (0.7 + Math.random() * 0.6);\n};\nconst bewaehrt = pool.filter((c) => c.status === 'active' || c.status === 'watchlist')\n  .map((c) => ({ c, w: gewicht(c) })).sort((a, b) => b.w - a.w).map((x) => x.c);\nconst neu = pool.filter((c) => c.status === 'explore')\n  .sort((a, b) => Number(a.times_scanned || 0) - Number(b.times_scanned || 0) || Math.random() - 0.5);\n\nconst gesamt = cfg.aktiveCommunities + cfg.experimentelle;\nconst auswahl = [];\nconst nimm = (liste, n) => { for (const c of liste) { if (n <= 0) break; if (!auswahl.includes(c)) { auswahl.push(c); n--; } } };\nnimm(bewaehrt, cfg.aktiveCommunities);\nnimm(neu, cfg.experimentelle);\nnimm(neu, gesamt - auswahl.length);       // zu wenige bewährte -> mit neuen auffüllen\nnimm(bewaehrt, gesamt - auswahl.length);  // zu wenige neue -> mit bewährten auffüllen\n\nreturn auswahl.map((c) => ({ json: { name: c.name, status: c.status, times_scanned: Number(c.times_scanned || 0), low_activity_count: Number(c.low_activity_count || 0), limit: cfg.postsProCommunity, zeitfensterStunden: cfg.zeitfensterStunden, userAgent: cfg.userAgent } }));\n" }, position: [720, 200] },
  output: [{ name: 'Beekeeping', status: 'active', times_scanned: 3, low_activity_count: 0, limit: 25, zeitfensterStunden: 36, userAgent: 'n8n:reddit-nischen-scanner:1.0' }],
});

const abrufen = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Neueste Posts abrufen',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: 'GET',
      url: expr('https://oauth.reddit.com/r/{{ $json.name }}/new'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'redditOAuth2Api',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [
        { name: 'limit', value: expr('{{ $json.limit }}') },
        { name: 'raw_json', value: '1' },
      ] },
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
    position: [960, 200],
  },
  output: [{ kind: 'Listing', data: { children: [{ kind: 't3', data: { name: 't3_abc', id: 'abc', subreddit: 'Beekeeping', title: 'How do you track hive inspections?', selftext: 'I keep everything in a notebook', permalink: '/r/Beekeeping/comments/abc/x/', created_utc: 1794873600, score: 2, num_comments: 4, is_self: true } }] } }],
});

const normalisieren = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Posts normalisieren', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Reddit-Antworten in einheitliche Post-Objekte umwandeln, filtern, Duplikate entfernen\nconst auswahl = $('Communities auswählen').all().map((i) => i.json);\nconst antworten = $input.all();\nconst bekannt = new Set($('Puffer laden').all().map((i) => i.json.post_id).filter(Boolean));\nconst jetzt = Date.now();\nconst jetztIso = new Date().toISOString();\n\nconst posts = []; const updates = []; const gesehen = new Set();\nconst fehler = [];\nantworten.forEach((it, idx) => {\n  const c = auswahl[idx];\n  if (!c) return;\n  const kinder = (it.json && it.json.data && it.json.data.children) || null;\n  if (!kinder) { fehler.push(c.name); return; }\n  const grenze = jetzt / 1000 - c.zeitfensterStunden * 3600;\n\n  // Aktivität: Posts pro Woche aus der Zeitspanne der neuesten Posts schätzen\n  const zeiten = kinder.map((k) => Number(k.data && k.data.created_utc)).filter(Boolean).sort((a, b) => b - a);\n  let ppw = 0;\n  if (zeiten.length >= 2) {\n    const spanneTage = Math.max((jetzt / 1000 - zeiten[zeiten.length - 1]) / 86400, 0.5);\n    ppw = Math.round((zeiten.length / spanneTage) * 7 * 10) / 10;\n  }\n  const wenig = ppw < 10;  // Startheuristik: mind. 10 neue Posts pro Woche\n  const lowCount = wenig ? c.low_activity_count + 1 : 0;\n  updates.push({\n    name: c.name,\n    last_scanned: jetztIso,\n    times_scanned: c.times_scanned + 1,\n    posts_per_week: ppw,\n    low_activity_count: lowCount,\n    status: lowCount >= 2 ? 'inactive' : c.status,\n  });\n\n  for (const k of kinder) {\n    const d = k.data || {};\n    const id = d.name || (d.id ? 't3_' + d.id : '');\n    if (!id || bekannt.has(id) || gesehen.has(id)) continue;\n    if (Number(d.created_utc) < grenze) continue;\n    if (d.stickied || d.over_18 || d.removed_by_category || d.author === 'AutoModerator') continue;\n    const body = String(d.selftext || '');\n    if (['[removed]', '[deleted]'].includes(body)) continue;\n    if (!d.is_self && !body && !d.title) continue;\n    gesehen.add(id);\n    posts.push({\n      post_id: id,\n      subreddit: c.name,  // Schreibweise wie im Community-Pool (für Fundraten)\n      title: String(d.title || '').slice(0, 300),\n      body: body.slice(0, 4000),\n      permalink: 'https://www.reddit.com' + (d.permalink || ''),\n      created_utc: Number(d.created_utc) || 0,\n      score: Number(d.score) || 0,\n      num_comments: Number(d.num_comments) || 0,\n      fetched_at: jetztIso,\n      analyzed: false,\n    });\n  }\n});\nreturn [{ json: { posts, updates, neuePosts: posts.length, communities: auswahl.length, fehler } }];\n" }, position: [1200, 200] },
  output: [{ posts: [{ post_id: 't3_abc', subreddit: 'Beekeeping', title: 'How do you track hive inspections?', body: 'I keep everything in a notebook', permalink: 'https://www.reddit.com/r/Beekeeping/comments/abc/x/', created_utc: 1794873600, score: 2, num_comments: 4, fetched_at: '2026-11-17T06:00:00.000Z', analyzed: false }], updates: [{ name: 'Beekeeping', last_scanned: '2026-11-17T06:00:00.000Z', times_scanned: 4, posts_per_week: 30, low_activity_count: 0, status: 'active' }], neuePosts: 1, communities: 1, fehler: [] }],
});

const postsAufteilen = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Posts aufteilen', parameters: { fieldToSplitOut: 'posts', include: 'noOtherFields' }, position: [1440, 100] },
  output: [{ post_id: 't3_abc', subreddit: 'Beekeeping', analyzed: false }],
});

const postsSpeichern = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Posts im Puffer speichern',
    parameters: { resource: 'row', operation: 'insert', dataTableId: TB_BUFFER, columns: { mappingMode: 'autoMapInputData', value: null }, options: { optimizeBulk: true } },
    position: [1680, 100],
  },
  output: [{}],
});

const updatesAufteilen = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Community-Updates aufteilen', parameters: { fieldToSplitOut: 'updates', include: 'noOtherFields' }, position: [1440, 300] },
  output: [{ name: 'Beekeeping', last_scanned: '2026-11-17T06:00:00.000Z', times_scanned: 4, posts_per_week: 30, low_activity_count: 0, status: 'active' }],
});

const communitiesAktualisieren = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Communities aktualisieren',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TB_COMMUNITIES,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'name', condition: 'eq', keyValue: expr('{{ $json.name }}') }] },
      columns: { mappingMode: 'autoMapInputData', value: null },
    },
    position: [1680, 300],
  },
  output: [{}],
});

const analyseStarten = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Problem-Analyse starten',
    executeOnce: true,
    parameters: {
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: 'tthOOibC9ntknYWM', cachedResultName: '03_PROBLEM_INTELLIGENCE' },
      mode: 'once',
      options: { waitForSubWorkflow: false },
    },
    position: [1920, 300],
  },
  output: [{}],
});

const notiz = sticky(
  '## 02 – Reddit-Collector\nTäglich 06:00: löscht Puffer-Posts älter als 48 h (Datenhaltung), wählt **32 bewährte + 8 experimentelle** Communities (gewichtet nach Fundrate, mit Rotationsbonus), holt je die 25 neuesten Posts (`/r/{sub}/new`), filtert auf ein 36-h-Fenster ohne Popularitätsfilter, entfernt Duplikate und startet danach **03_PROBLEM_INTELLIGENCE**.\n\nCommunities mit < 10 Posts/Woche bei zwei Scans hintereinander werden `inactive`.\n\nAnpassen: Node **Communities auswählen**.',
  [pufferLaden, communitiesLaden, auswahl],
  { color: 4 },
);

export default workflow('reddit-collector', '02_REDDIT_COLLECTOR')
  .add(zeitplan)
  .to(pufferLaden)
  .to(alteFinden)
  .to(alteLoeschen)
  .add(pufferLaden)
  .to(communitiesLaden)
  .to(auswahl)
  .to(abrufen)
  .to(normalisieren)
  .to(postsAufteilen)
  .to(postsSpeichern)
  .add(normalisieren)
  .to(updatesAufteilen)
  .to(communitiesAktualisieren)
  .to(analyseStarten)
  .add(manuell)
  .to(pufferLaden)
  .add(notiz)
  .group('Aufräumen', [alteFinden, alteLoeschen], { description: 'Reddit-Rohtext nach 48 Stunden aus dem Puffer löschen' })
  .group('Sammeln', [communitiesLaden, auswahl, abrufen, normalisieren], { description: '32 bewährte + 8 neue Communities wählen, je 25 neueste Posts holen, auf 36 h filtern, Duplikate entfernen' })
  .group('Posts speichern', [postsAufteilen, postsSpeichern], { description: 'Neue Posts als unanalysiert im Puffer speichern' })
  .group('Communities & Analyse', [updatesAufteilen, communitiesAktualisieren, analyseStarten], { description: 'Scan-Zeitpunkt und Aktivität je Community speichern, dann die Problem-Analyse starten' });
