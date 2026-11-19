import { workflow, node, trigger, sticky, newCredential, ifElse, languageModel, outputParser, expr } from '@n8n/workflow-sdk';

const TB_PROBLEME = { __rl: true, mode: 'id', value: 'A9qF7seXnjO3IQkM', cachedResultName: 'reddit_problems' };
const TB_CLUSTER = { __rl: true, mode: 'id', value: 'hsFduYjOdrF0tvIH', cachedResultName: 'reddit_clusters' };
const TELEGRAM = { telegramApi: { id: 'Ht4VQc71JDuxdkcv', name: 'Telegram account' } };
const OPENAI = { openAiApi: { id: 'Iy7VcTn0kXCAU7tQ', name: 'OpenAI account' } };

const zeitplan = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: { name: 'Täglich 09:00', parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 9, triggerAtMinute: 0 }] } }, position: [0, 0] },
  output: [{}],
});

const manuell = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manuell starten', position: [0, 200] },
  output: [{}],
});

const einstellungen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Einstellungen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// ===== EINSTELLUNGEN – Workflow D (Opportunity Ranking) =====\nreturn [{ json: {\n  telegramChatId: '1347421874',\n  minScore: 75,            // ab hier ins Top-5-Ranking (zusätzlich Evidenzklasse >= B)\n  topN: 5,\n  maxPruefungen: 10,       // tiefere Nachprüfungen (Cluster) pro Tag\n  erneutBewertenNachTagen: 3, // Cluster ohne neue Belege erst nach X Tagen erneut bewerten\n  quellenProIdee: 5,\n  gewichte: { problem: 25, nachfrage: 20, zahlung: 20, erreichbar: 15, mvp: 10, luecke: 10 },\n  userAgent: 'n8n:reddit-nischen-scanner:1.0 (by /u/DEIN_REDDIT_NAME)',\n} }];\n" }, position: [220, 100] },
  output: [{ telegramChatId: '1347421874', minScore: 75, topN: 5, maxPruefungen: 10, erneutBewertenNachTagen: 3, quellenProIdee: 5, gewichte: { problem: 25, nachfrage: 20, zahlung: 20, erreichbar: 15, mvp: 10, luecke: 10 }, userAgent: 'n8n:reddit-nischen-scanner:1.0' }],
});

const clusterLaden = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Cluster laden',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: TB_CLUSTER, returnAll: true },
    position: [440, 100],
  },
  output: [{ id: 1, cluster_key: 'c1', title: 'Fehldruck-Dokumentation', problem: 'Fehldrucke werden manuell notiert', audience: 'Kleine 3D-Druck-Betriebe', evidence_count: 3, subreddit_count: 2, last_seen: '2026-11-16T00:00:00.000Z', last_ranked: '' }],
});

const belegeLaden = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Belege laden',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TB_PROBLEME,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'cluster_key', condition: 'isNotEmpty' }] },
      returnAll: true,
    },
    position: [660, 100],
  },
  output: [{ id: 1, post_id: 't3_abc', subreddit: '3Dprinting', permalink: 'https://www.reddit.com/r/3Dprinting/comments/abc/', post_created: '2026-11-15T00:00:00.000Z', cluster_key: 'c1', source: 'scan', problem: 'Fehldrucke werden manuell notiert' }],
});

const kandidaten = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Kandidaten wählen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Die interessantesten Problemcluster für die Nachprüfung auswählen\nconst cfg = $('Einstellungen').first().json;\nconst cluster = $('Cluster laden').all().map((i) => i.json).filter((c) => c && c.cluster_key);\nconst evidenz = $('Belege laden').all().map((i) => i.json).filter((p) => p && p.cluster_key);\nconst jetzt = Date.now();\nconst tage = (iso) => (iso ? (jetzt - Date.parse(iso)) / 864e5 : 9999);\n\nconst proCluster = new Map();\nfor (const p of evidenz) { if (!proCluster.has(p.cluster_key)) proCluster.set(p.cluster_key, []); proCluster.get(p.cluster_key).push(p); }\n\nconst kandidaten = cluster\n  .filter((c) => Number(c.evidence_count || 0) >= 1)\n  .filter((c) => !c.last_ranked || tage(c.last_ranked) >= cfg.erneutBewertenNachTagen || String(c.last_seen || '') > String(c.last_ranked || ''))\n  .map((c) => {\n    const neueBelege = !c.last_ranked || String(c.last_seen || '') > String(c.last_ranked || '');\n    const prio = Number(c.evidence_count || 0) * 3 + Number(c.subreddit_count || 0) * 2 + (neueBelege ? 5 : 0) + (tage(c.last_seen) <= 7 ? 3 : 0);\n    return { c, prio };\n  })\n  .sort((a, b) => b.prio - a.prio)\n  .slice(0, cfg.maxPruefungen)\n  .map(({ c }) => {\n    const belege = (proCluster.get(c.cluster_key) || [])\n      .sort((a, b) => (a.source === 'scan' ? -1 : 1) - (b.source === 'scan' ? -1 : 1) || String(b.post_created).localeCompare(String(a.post_created)))\n      .slice(0, 12)\n      .map((p) => ({ post_id: p.post_id, subreddit: p.subreddit, permalink: p.permalink, post_created: p.post_created, source: p.source, actor: p.actor, problem: p.problem, workaround: p.workaround, payment_signal: p.payment_signal, quote: p.evidence_quote, comment_insight: p.comment_insight }));\n    const subs = [...new Set(belege.map((b) => b.subreddit).filter(Boolean))];\n    return { json: { keine: false, cluster_key: c.cluster_key, title: c.title, problem: c.problem, audience: c.audience, workaround: c.workaround, haupt_subreddit: subs[0] || '', belege } };\n  });\nreturn kandidaten.length ? kandidaten : [{ json: { keine: true } }];\n" }, position: [880, 100] },
  output: [{ keine: false, cluster_key: 'c1', title: 'Fehldruck-Dokumentation', problem: 'Fehldrucke werden manuell notiert', audience: 'Kleine 3D-Druck-Betriebe', workaround: 'Excel', haupt_subreddit: '3Dprinting', belege: [{ post_id: 't3_abc', subreddit: '3Dprinting', permalink: 'https://www.reddit.com/r/3Dprinting/comments/abc/', post_created: '2026-11-15T00:00:00.000Z', source: 'scan', problem: 'Fehldrucke werden manuell notiert' }] }],
});

const hatKandidaten = ifElse({
  version: 2.2,
  config: {
    name: 'Kandidaten vorhanden?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.keine }}'), operator: { type: 'boolean', operation: 'false', singleValue: true } }],
        combinator: 'and',
      },
    },
    position: [1100, 100],
  },
});

const keineMeldung = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Meldung: noch keine Cluster',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr("{{ $('Einstellungen').first().json.telegramChatId }}"),
      text: '🔭 <b>Reddit Opportunity Radar</b>\nHeute gibt es noch keine neuen Problemcluster zum Bewerten. Der Scanner sammelt weiter.',
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
    },
    credentials: TELEGRAM,
    position: [1320, 300],
  },
  output: [{ ok: true }],
});

const modellSuche = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.2,
  config: { name: 'OpenAI (Suchbegriffe)', parameters: { model: { __rl: true, mode: 'list', value: 'gpt-5-mini' }, options: { reasoningEffort: 'low' } }, credentials: OPENAI, position: [1260, -80] },
});

const parserSuche = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: { name: 'Struktur: Suchbegriffe', parameters: { schemaType: 'manual', inputSchema: "{\"type\":\"object\",\"properties\":{\"queries\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}},\"required\":[\"queries\"]}\n" }, position: [1420, -80] },
});

const suchbegriffe = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.7,
  config: {
    name: 'Suchbegriffe erzeugen (KI)',
    onError: 'continueRegularOutput',
    parameters: {
      promptType: 'define',
      text: expr('Problemcluster: {{ $json.title }}\nProblem: {{ $json.problem }}\nZielgruppe: {{ $json.audience }}\nHauptcommunity: r/{{ $json.haupt_subreddit }}\nBeispiele:\n{{ JSON.stringify($json.belege.slice(0, 5).map(b => ({ subreddit: b.subreddit, problem: b.problem, quote: b.quote }))) }}'),
      hasOutputParser: true,
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "You help verify whether a problem found on Reddit is real and recurring.\nYou receive one problem cluster (German) with example evidence.\nWrite exactly 3 short English Reddit search queries (2–5 words each) that would find OTHER, independent posts where people describe the same problem in their own words.\n- Phrase them like users write (\"how do you track failed prints\", \"print failure log spreadsheet\"), not like marketing.\n- Do not use product names unless the evidence mentions them.\n- Query 1 and 2: broad, industry-agnostic phrasing of the underlying need.\n- Query 3: phrasing that fits the main community of the evidence.\n" }] },
      batching: { batchSize: 5, delayBetweenBatches: 0 },
    },
    subnodes: { model: modellSuche, outputParser: parserSuche },
    position: [1320, -280],
  },
  output: [{ output: { queries: ['tracking failed prints', 'print failure log spreadsheet', 'managing 3d printing jobs'] } }],
});

const suchanfragen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Suchanfragen bilden', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Nachprüfung: je Cluster die neuesten 100 Posts der (bis zu 2) wichtigsten Communities laden.\n// Die KI-Suchbegriffe werden danach lokal abgeglichen (Arctic-Shift-Volltextsuche ist zu langsam).\nconst cfg = $('Einstellungen').first().json;\nconst kandidaten = $('Kandidaten wählen').all().map((i) => i.json);\nconst out = [];\n$input.all().forEach((it, idx) => {\n  const k = kandidaten[idx];\n  if (!k) return;\n  const queries = ((it.json.output && it.json.output.queries) || []).map((q) => String(q).trim()).filter(Boolean).slice(0, 3);\n  const subs = [...new Set(k.belege.map((b) => b.subreddit).filter(Boolean))].slice(0, 2);\n  for (const sub of subs) out.push({ json: { cluster_key: k.cluster_key, subreddit: sub, queries, userAgent: cfg.userAgent } });\n});\nreturn out;\n" }, position: [1540, -280] },
  output: [{ cluster_key: 'c1', q: 'tracking failed prints', url: 'https://oauth.reddit.com/search', restrict_sr: '0', t: 'year', userAgent: 'n8n:reddit-nischen-scanner:1.0' }],
});

const redditSuche = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Reddit-Suche (Nachprüfung)',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: 'GET',
      url: expr('{{ $json.url }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'redditOAuth2Api',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [
        { name: 'q', value: expr('{{ $json.q }}') },
        { name: 'restrict_sr', value: expr('{{ $json.restrict_sr }}') },
        { name: 't', value: expr('{{ $json.t }}') },
        { name: 'sort', value: 'relevance' },
        { name: 'type', value: 'link' },
        { name: 'limit', value: '10' },
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
    position: [1760, -280],
  },
  output: [{ kind: 'Listing', data: { children: [{ kind: 't3', data: { name: 't3_def', subreddit: 'functionalprint', title: 'How do you log failed prints?', selftext: 'We run 12 printers...', permalink: '/r/functionalprint/comments/def/x/', created_utc: 1790000000, num_comments: 9 } }] } }],
});

const trefferBuendeln = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Suchtreffer bündeln', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Geladene Posts lokal mit den Suchbegriffen abgleichen und je Cluster bündeln\nconst kandidaten = $('Kandidaten wählen').all().map((i) => i.json);\nconst anfragen = $('Suchanfragen bilden').all().map((i) => i.json);\nconst STOPP = new Set(['with', 'your', 'from', 'that', 'this', 'what', 'have', 'does', 'they', 'them', 'into', 'about', 'when', 'where', 'which', 'there', 'their', 'manage', 'managing', 'handle']);\nconst woerter = (qs) => [...new Set(qs.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOPP.has(w)))];\nconst treffer = new Map(kandidaten.map((k) => [k.cluster_key, new Map()]));\n$input.all().forEach((it, idx) => {\n  const a = anfragen[idx];\n  if (!a || !treffer.has(a.cluster_key)) return;\n  const k = kandidaten.find((x) => x.cluster_key === a.cluster_key);\n  const bekannt = new Set(k.belege.map((b) => b.post_id));\n  const begriffe = woerter(a.queries || []);\n  const d0 = it.json && it.json.data;\n  const posts = Array.isArray(d0) ? d0 : ((d0 && d0.children) || []).map((c) => c.data);\n  for (const d of posts) {\n    if (!d) continue;\n    const id = d.name || (d.id ? 't3_' + d.id : '');\n    if (!id || bekannt.has(id) || d.over_18 || treffer.get(a.cluster_key).has(id)) continue;\n    if (['[removed]', '[deleted]'].includes(d.selftext)) continue;\n    const text = (String(d.title || '') + ' ' + String(d.selftext || '')).toLowerCase();\n    const passend = begriffe.filter((w) => text.includes(w)).length;\n    if (passend < 2) continue;\n    treffer.get(a.cluster_key).set(id, {\n      post_id: id, subreddit: d.subreddit, title: String(d.title || '').slice(0, 200),\n      text: String(d.selftext || '').replace(/\\s+/g, ' ').slice(0, 300),\n      permalink: 'https://www.reddit.com' + (d.permalink || ''),\n      created: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : '', num_comments: d.num_comments || 0, passend,\n    });\n  }\n});\nreturn kandidaten.map((k) => ({ json: { ...k, suchtreffer: [...treffer.get(k.cluster_key).values()].sort((a, b) => b.passend - a.passend).slice(0, 15) } }));\n" }, position: [1980, -280] },
  output: [{ keine: false, cluster_key: 'c1', title: 'Fehldruck-Dokumentation', problem: 'Fehldrucke werden manuell notiert', audience: 'Kleine 3D-Druck-Betriebe', haupt_subreddit: '3Dprinting', belege: [], suchtreffer: [{ post_id: 't3_def', subreddit: 'functionalprint', title: 'How do you log failed prints?', text: 'We run 12 printers...', permalink: 'https://www.reddit.com/r/functionalprint/comments/def/x/', created: '2026-09-01T00:00:00.000Z' }] }],
});

const modellAnalyse = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.2,
  config: { name: 'OpenAI (Opportunity)', parameters: { model: { __rl: true, mode: 'list', value: 'gpt-5-mini' }, options: { reasoningEffort: 'medium', timeout: 180000 } }, credentials: OPENAI, position: [2140, -80] },
});

const parserAnalyse = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: { name: 'Struktur: Bewertung', parameters: { schemaType: 'manual', inputSchema: "{\"type\":\"object\",\"properties\":{\"confirmed_hits\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"ratings\":{\"type\":\"object\",\"properties\":{\"problemstaerke\":{\"type\":\"integer\"},\"wiederholte_nachfrage\":{\"type\":\"integer\"},\"zahlungsbereitschaft\":{\"type\":\"integer\"},\"zielgruppe_erreichbar\":{\"type\":\"integer\"},\"mvp_umsetzbarkeit\":{\"type\":\"integer\"},\"marktluecke\":{\"type\":\"integer\"}},\"required\":[\"problemstaerke\",\"wiederholte_nachfrage\",\"zahlungsbereitschaft\",\"zielgruppe_erreichbar\",\"mvp_umsetzbarkeit\",\"marktluecke\"]},\"idea\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"},\"problem\":{\"type\":\"string\"},\"geschaeftsidee\":{\"type\":\"string\"},\"zielgruppe\":{\"type\":\"string\"},\"preis_hypothese\":{\"type\":\"string\"},\"mvp\":{\"type\":\"string\"},\"alternativen\":{\"type\":\"string\"},\"risiken\":{\"type\":\"string\"},\"naechster_schritt\":{\"type\":\"string\"}},\"required\":[\"name\",\"problem\",\"geschaeftsidee\",\"zielgruppe\",\"preis_hypothese\",\"mvp\",\"alternativen\",\"risiken\",\"naechster_schritt\"]},\"bewertung_kurz\":{\"type\":\"string\"},\"ausnahme\":{\"type\":\"boolean\"},\"ausnahme_grund\":{\"type\":\"string\"}},\"required\":[\"confirmed_hits\",\"ratings\",\"idea\",\"bewertung_kurz\",\"ausnahme\",\"ausnahme_grund\"]}\n" }, position: [2300, -80] },
});

const analyse = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.7,
  config: {
    name: 'Opportunity-Analyse (KI)',
    onError: 'continueRegularOutput',
    parameters: {
      promptType: 'define',
      text: expr('Problemcluster: {{ $json.title }}\nProblem: {{ $json.problem }}\nZielgruppe: {{ $json.audience }}\nTypischer Workaround: {{ $json.workaround }}\n\nbelege:\n{{ JSON.stringify($json.belege) }}\n\nsuchtreffer:\n{{ JSON.stringify($json.suchtreffer) }}'),
      hasOutputParser: true,
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "Du bist ein nüchterner Business-Opportunity-Analyst. Du bewertest ausschließlich anhand der gelieferten Belege. Erfinde keine Fakten, Marktgrößen, Wettbewerber oder Zitate.\n\nDu erhältst einen Problemcluster mit:\n- belege: bereits gefundene Reddit-Posts zu diesem Problem (inkl. Kommentar-Erkenntnissen)\n- suchtreffer: Ergebnisse einer zusätzlichen Reddit-Suche (Titel + Textanfang). Diese sind NICHT automatisch Belege.\n\nAufgaben:\n1. confirmed_hits: Liste die post_id jedes Suchtreffers, der eindeutig DASSELBE Problem aus eigener Erfahrung beschreibt. Im Zweifel nicht aufnehmen. Werbung, Produktvorstellungen und allgemeine Fragen zählen nicht.\n2. ratings: Bewerte jeweils 0–5 (ganze Zahlen):\n   - problemstaerke: Wie dringend, teuer oder frustrierend ist das Problem?\n   - wiederholte_nachfrage: Wie viele UNABHÄNGIGE Diskussionen belegen es? (Viele Kommentare unter einem Post zählen als ein Beleg.) 1 Beleg = 1, 2 = 2, 3–4 = 3, 5–7 = 4, 8+ = 5.\n   - zahlungsbereitschaft: Gibt es klare Kaufsignale, bezahlte Workarounds oder genannte Kosten? Ohne Signal höchstens 2.\n   - zielgruppe_erreichbar: Sind potenzielle Kunden identifizierbar und erreichbar (Communities, Verbände, Messen)?\n   - mvp_umsetzbarkeit: Kann ein kleines Produkt das Kernproblem in wenigen Wochen lösen?\n   - marktluecke: Gibt es Hinweise, dass bestehende Alternativen unzureichend sind? Ohne Hinweise höchstens 3.\n3. idea: Entwickle EINE konkrete, kleine Geschäftsidee (Deutsch):\n   - name: kurzer Arbeitstitel\n   - problem: das Problem in einem Satz\n   - geschaeftsidee: was angeboten wird (1–2 Sätze)\n   - zielgruppe: konkret\n   - preis_hypothese: z. B. \"29–59 €/Monat\" – klar als Hypothese\n   - mvp: kleinster sinnvoller Funktionsumfang\n   - alternativen: in den Belegen genannte Alternativen/Workarounds, sonst leerer String\n   - risiken: wichtigste offene Risiken (Wettbewerb ungeprüft, Zahlungsbereitschaft ungeprüft usw.)\n   - naechster_schritt: konkreter Validierungsschritt (z. B. \"Mit 5 Druckdienstleistern sprechen ...\")\n4. bewertung_kurz: 1–2 Sätze, warum der Cluster so bewertet wurde.\n5. ausnahme: true nur, wenn die Belege zwar wenige sind (unter 3), die Nische aber außergewöhnlich vielversprechend wirkt (starkes Kaufsignal, klar erreichbare Zielgruppe). ausnahme_grund: kurze Begründung, sonst leerer String.\n\nSei kritisch. Eine Idee ist nur dann gut, wenn die Belege sie tragen.\n" }] },
      batching: { batchSize: 5, delayBetweenBatches: 0 },
    },
    subnodes: { model: modellAnalyse, outputParser: parserAnalyse },
    position: [2200, -280],
  },
  output: [{ output: { confirmed_hits: ['t3_def'], ratings: { problemstaerke: 4, wiederholte_nachfrage: 3, zahlungsbereitschaft: 2, zielgruppe_erreichbar: 4, mvp_umsetzbarkeit: 5, marktluecke: 3 }, idea: { name: 'Auftragsmanagement für 3D-Druck-Farmen', problem: 'Fehldrucke werden manuell dokumentiert', geschaeftsidee: 'SaaS für Auftragsstatus und Fehlerdoku', zielgruppe: 'Kleine 3D-Druck-Betriebe', preis_hypothese: '29–59 €/Monat', mvp: 'Aufträge anlegen, Fehldrucke kategorisieren', alternativen: 'Excel', risiken: 'Wettbewerb ungeprüft', naechster_schritt: 'Mit 5 Druckdienstleistern sprechen' }, bewertung_kurz: 'Solide Belege', ausnahme: false, ausnahme_grund: '' } }],
});

const scoreReport = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Score berechnen & Report bauen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Gewichteten Score berechnen, Evidenzklasse vergeben, Top-Ideen wählen, Telegram-Report bauen\nconst cfg = $('Einstellungen').first().json;\nconst W = cfg.gewichte;\nconst kandidaten = $('Suchtreffer bündeln').all().map((i) => i.json);\nconst jetzt = new Date();\nconst jetztIso = jetzt.toISOString();\nconst esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');\nconst datum = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '');\nconst r05 = (x) => Math.max(0, Math.min(5, Math.round(Number(x) || 0)));\nconst nachfrageDeckel = (n) => (n >= 8 ? 5 : n >= 5 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1);\n\nconst bewertet = [];\nconst neueBelege = [];\n$input.all().forEach((it, idx) => {\n  const k = kandidaten[idx];\n  const o = it.json && it.json.output;\n  if (!k || !o || !o.idea) return;\n  const trefferMap = new Map((k.suchtreffer || []).map((t) => [t.post_id, t]));\n  const bestaetigt = [...new Set((o.confirmed_hits || []).map(String))].filter((id) => trefferMap.has(id)).map((id) => trefferMap.get(id));\n\n  // Unabhängige Diskussionen = unterschiedliche Posts (Kommentare zählen nicht extra)\n  const quellen = [\n    ...k.belege.map((b) => ({ post_id: b.post_id, subreddit: b.subreddit, permalink: b.permalink, datum: b.post_created, art: b.source })),\n    ...bestaetigt.map((t) => ({ post_id: t.post_id, subreddit: t.subreddit, permalink: t.permalink, datum: t.created, art: 'verifikation' })),\n  ];\n  const ids = new Set(quellen.map((q) => q.post_id));\n  const subs = new Set(quellen.map((q) => String(q.subreddit || '').toLowerCase()).filter(Boolean));\n  const zeiten = quellen.map((q) => Date.parse(q.datum)).filter((x) => !isNaN(x)).sort();\n  const spanneTage = zeiten.length > 1 ? (zeiten[zeiten.length - 1] - zeiten[0]) / 864e5 : 0;\n  const n = ids.size;\n  const klasse = n >= 5 && (subs.size >= 2 || spanneTage >= 30) ? 'A' : n >= 3 ? 'B' : 'C';\n\n  const r = {\n    problem: r05(o.ratings && o.ratings.problemstaerke),\n    nachfrage: Math.min(r05(o.ratings && o.ratings.wiederholte_nachfrage), nachfrageDeckel(n)),\n    zahlung: r05(o.ratings && o.ratings.zahlungsbereitschaft),\n    erreichbar: r05(o.ratings && o.ratings.zielgruppe_erreichbar),\n    mvp: r05(o.ratings && o.ratings.mvp_umsetzbarkeit),\n    luecke: r05(o.ratings && o.ratings.marktluecke),\n  };\n  const score = Math.round(Object.keys(W).reduce((s, key) => s + (r[key] / 5) * W[key], 0));\n  let status = 'beobachten';\n  if (score >= cfg.minScore && klasse !== 'C') status = 'top5';\n  else if (o.ausnahme && score >= cfg.minScore - 5) status = 'ausnahme';\n\n  bewertet.push({ k, o, r, score, klasse, n, subs: subs.size, quellen, status });\n  for (const t of bestaetigt) {\n    neueBelege.push({\n      post_id: t.post_id, subreddit: t.subreddit, permalink: t.permalink, post_created: t.created,\n      actor: k.audience || '', problem: k.problem || '', evidence_quote: t.title, status: 'zugeordnet',\n      cluster_key: k.cluster_key, source: 'verifikation', found_at: jetztIso, confidence: null,\n    });\n  }\n});\n\nbewertet.sort((a, b) => b.score - a.score);\nconst top = bewertet.filter((b) => b.status === 'top5').slice(0, cfg.topN);\nconst ausnahme = bewertet.find((b) => b.status === 'ausnahme');\nconst beobachten = bewertet.filter((b) => !top.includes(b) && b !== ausnahme);\n\nconst ideeText = (b, titel) => {\n  const i = b.o.idea || {};\n  const L = [];\n  L.push(titel + ' · <b>' + b.score + '/100</b>');\n  L.push('Evidenzklasse: <b>' + b.klasse + '</b> (' + b.n + ' unabhängige Diskussionen in ' + b.subs + ' Communities)');\n  L.push('');\n  L.push('<b>Problem:</b> ' + esc(i.problem || b.k.problem));\n  L.push('<b>Geschäftsidee:</b> ' + esc(i.geschaeftsidee));\n  L.push('<b>Zielgruppe:</b> ' + esc(i.zielgruppe || b.k.audience));\n  L.push('<b>Preishypothese:</b> ' + esc(i.preis_hypothese));\n  L.push('<b>MVP:</b> ' + esc(i.mvp));\n  if (i.alternativen) L.push('<b>Bekannte Alternativen:</b> ' + esc(i.alternativen));\n  L.push('<b>Offene Risiken:</b> ' + esc(i.risiken));\n  L.push('<b>Nächster Schritt:</b> ' + esc(i.naechster_schritt));\n  L.push('');\n  L.push('<i>Problem ' + b.r.problem + '/5 · Nachfrage ' + b.r.nachfrage + '/5 · Zahlung ' + b.r.zahlung + '/5 · Erreichbar ' + b.r.erreichbar + '/5 · MVP ' + b.r.mvp + '/5 · Lücke ' + b.r.luecke + '/5</i>');\n  L.push('');\n  L.push('<b>Quellen:</b>');\n  const gesehen = new Set();\n  for (const q of b.quellen) {\n    if (gesehen.size >= cfg.quellenProIdee || !q.permalink || gesehen.has(q.post_id)) continue;\n    gesehen.add(q.post_id);\n    L.push('• <a href=\"' + esc(q.permalink) + '\">r/' + esc(q.subreddit) + '</a> – ' + datum(q.datum) + (q.art === 'verifikation' ? ' (Nachprüfung)' : ''));\n  }\n  let t = L.join('\\n');\n  return t.length > 4000 ? t.slice(0, 3990) + '\\n…' : t;\n};\n\nconst nachrichten = [];\nconst kopf = [];\nkopf.push('<b>🔭 Reddit Opportunity Radar – ' + datum(jetztIso) + '</b>');\nkopf.push(bewertet.length + ' Problemcluster geprüft · ' + top.length + ' Top-Ideen · ' + beobachten.length + ' auf der Beobachtungsliste');\nif (!top.length) kopf.push('\\nHeute keine Idee mit ≥ ' + cfg.minScore + ' Punkten und Evidenzklasse ≥ B.');\nif (beobachten.length) {\n  kopf.push('\\n<b>Beobachtungsliste:</b>');\n  for (const b of beobachten.slice(0, 5)) kopf.push('• ' + esc(b.o.idea.name || b.k.title) + ' – ' + b.score + '/100, Klasse ' + b.klasse);\n}\nnachrichten.push({ text: kopf.join('\\n') });\ntop.forEach((b, i) => nachrichten.push({ text: ideeText(b, '<b>#' + (i + 1) + ' – ' + esc(b.o.idea.name || b.k.title) + '</b>') }));\nif (ausnahme) nachrichten.push({ text: ideeText(ausnahme, '⚠️ <b>Vielversprechende Ausnahme (nicht validiert): ' + esc(ausnahme.o.idea.name || ausnahme.k.title) + '</b>\\n<i>' + esc(ausnahme.o.ausnahme_grund) + '</i>') });\n\nconst clusterUpdates = bewertet.map((b) => ({\n  cluster_key: b.k.cluster_key,\n  score: b.score,\n  evidence_grade: b.klasse,\n  evidence_count: b.n,\n  subreddit_count: b.subs,\n  idea: JSON.stringify({ ...b.o.idea, ratings: b.r, bewertung: b.o.bewertung_kurz || '' }),\n  report_status: b.status,\n  last_ranked: jetztIso,\n  ...(top.includes(b) || b === ausnahme ? { last_reported: jetztIso } : {}),\n}));\nreturn [{ json: { nachrichten, clusterUpdates, neueBelege, top: top.length } }];\n" }, position: [2480, -280] },
  output: [{ nachrichten: [{ text: '<b>🔭 Reddit Opportunity Radar</b>' }], clusterUpdates: [{ cluster_key: 'c1', score: 68, evidence_grade: 'B', report_status: 'beobachten' }], neueBelege: [{ post_id: 't3_def', cluster_key: 'c1', source: 'verifikation' }], top: 0 }],
});

const nachrichtenAufteilen = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Nachrichten aufteilen', parameters: { fieldToSplitOut: 'nachrichten', include: 'noOtherFields' }, position: [2720, -480] },
  output: [{ text: '<b>🔭 Reddit Opportunity Radar</b>' }],
});

const telegram = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Report per Telegram senden',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr("{{ $('Einstellungen').first().json.telegramChatId }}"),
      text: expr('{{ $json.text }}'),
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
    },
    credentials: TELEGRAM,
    position: [2940, -480],
  },
  output: [{ ok: true }],
});

const updatesAufteilen = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Bewertungen aufteilen', parameters: { fieldToSplitOut: 'clusterUpdates', include: 'noOtherFields' }, position: [2720, -280] },
  output: [{ cluster_key: 'c1', score: 68, evidence_grade: 'B', report_status: 'beobachten' }],
});

const bewertungenSpeichern = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Bewertungen speichern',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TB_CLUSTER,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'cluster_key', condition: 'eq', keyValue: expr('{{ $json.cluster_key }}') }] },
      columns: { mappingMode: 'autoMapInputData', value: null },
    },
    position: [2940, -280],
  },
  output: [{}],
});

const belegeAufteilen = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Neue Belege aufteilen', parameters: { fieldToSplitOut: 'neueBelege', include: 'noOtherFields' }, position: [2720, -80] },
  output: [{ post_id: 't3_def', cluster_key: 'c1', source: 'verifikation' }],
});

const belegeSpeichern = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Belege aus Nachprüfung speichern',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TB_PROBLEME,
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'post_id', condition: 'eq', keyValue: expr('{{ $json.post_id }}') },
        { keyName: 'source', condition: 'eq', keyValue: 'verifikation' },
      ] },
      columns: { mappingMode: 'autoMapInputData', value: null },
    },
    position: [2940, -80],
  },
  output: [{}],
});

const notiz = sticky(
  '## 04 – Opportunity Ranking\nTäglich 09:00 (nach Collector + Analyse): wählt bis zu **10** vielversprechende Problemcluster, lässt die KI Suchbegriffe erzeugen und sucht auf Reddit nach **unabhängigen** Zusatzbelegen. Danach entwickelt die KI je Cluster eine Geschäftsidee und bewertet 6 Kriterien (0–5).\n\nScore = Σ Bewertung/5 × Gewicht (25/20/20/15/10/10). Nachfrage wird durch die echte Belegzahl gedeckelt. Evidenzklasse: **A** ≥ 5 Diskussionen (mehrere Communities oder ≥ 30 Tage), **B** ≥ 3, **C** sonst.\n\nTop-5 nur ab **75 Punkten und Klasse ≥ B**; sonst Beobachtungsliste. Report per Telegram mit echten Quellen-Links.\n\nAnpassen: Node **Einstellungen**.',
  [einstellungen, clusterLaden, belegeLaden, kandidaten],
  { color: 4 },
);

export default workflow('reddit-opportunity-ranking', '04_OPPORTUNITY_RANKING')
  .add(zeitplan)
  .to(einstellungen)
  .to(clusterLaden)
  .to(belegeLaden)
  .to(kandidaten)
  .to(hatKandidaten
    .onTrue(suchbegriffe.to(suchanfragen).to(redditSuche).to(trefferBuendeln).to(analyse).to(scoreReport))
    .onFalse(keineMeldung))
  .add(manuell)
  .to(einstellungen)
  .add(scoreReport)
  .to(nachrichtenAufteilen)
  .to(telegram)
  .add(scoreReport)
  .to(updatesAufteilen)
  .to(bewertungenSpeichern)
  .add(scoreReport)
  .to(belegeAufteilen)
  .to(belegeSpeichern)
  .add(notiz)
  .group('Kandidaten', [clusterLaden, belegeLaden, kandidaten], { description: 'Cluster und Belege laden, bis zu 10 Cluster mit den stärksten bzw. neuesten Belegen auswählen' })
  .group('Nachfrage prüfen', [suchbegriffe, modellSuche, parserSuche, suchanfragen, redditSuche, trefferBuendeln], { description: 'KI erzeugt Suchbegriffe; Reddit-Suche nach unabhängigen Zusatzbelegen' })
  .group('Idee & Score', [analyse, modellAnalyse, parserAnalyse, scoreReport], { description: 'KI entwickelt Geschäftsidee und Bewertung; gewichteter Score, Evidenzklasse, Top-5 und Report' })
  .group('Report senden', [nachrichtenAufteilen, telegram], { description: 'Tagesreport als einzelne Telegram-Nachrichten senden' })
  .group('Bewertungen speichern', [updatesAufteilen, bewertungenSpeichern], { description: 'Score, Evidenzklasse, Idee und Status je Cluster speichern' })
  .group('Belege speichern', [belegeAufteilen, belegeSpeichern], { description: 'Bestätigte Treffer der Nachprüfung als Evidenz-Links speichern' });
