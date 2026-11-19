import { workflow, node, trigger, sticky, newCredential, ifElse, languageModel, outputParser, expr } from '@n8n/workflow-sdk';

const TB_COMMUNITIES = { __rl: true, mode: 'id', value: 'EUU4889vTyNyeAqO', cachedResultName: 'reddit_communities' };
const TB_BUFFER = { __rl: true, mode: 'id', value: 'cyeRQFTdgntnM39D', cachedResultName: 'reddit_posts_buffer' };
const TB_PROBLEME = { __rl: true, mode: 'id', value: 'A9qF7seXnjO3IQkM', cachedResultName: 'reddit_problems' };
const TB_CLUSTER = { __rl: true, mode: 'id', value: 'hsFduYjOdrF0tvIH', cachedResultName: 'reddit_clusters' };

const aufruf = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: { name: 'Aufruf durch Collector / Folgerunde', parameters: { inputSource: 'passthrough' }, position: [0, 300] },
  output: [{ phase: 'analyse', runde: 0 }],
});

const manuell = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manuell starten', position: [0, 500] },
  output: [{}],
});

const einstellungen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Einstellungen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// ===== EINSTELLUNGEN – Workflow C (Problem Intelligence) =====\n// Läuft in Runden (je eigene Ausführung, wegen Laufzeitlimit). Phase \"analyse\" wiederholt sich,\n// bis alle neuen Posts analysiert sind oder das Tagesbudget erreicht ist; danach Phase \"cluster\".\nconst cfg = {\n  postsProBatch: 18,          // 15–20 kurze Posts pro KI-Aufruf\n  zeichenProBatch: 14000,     // zusätzliches Zeichenbudget pro Batch\n  maxZeichenProPost: 1800,    // lange Beiträge werden gekürzt\n  batchesProRunde: 4,         // KI-Batches pro Ausführung (Laufzeitlimit)\n  maxRundenProTag: 15,        // KI-Kostenlimit: 15 Runden x 4 Batches x 18 Posts ≈ 1.080 Posts\n  minConfidence: 0.70,        // ab hier: qualifiziertes Problem\n  pruefConfidence: 0.40,      // 0.40–0.69: niedrig priorisierte Prüfliste\n  maxKommentarThreads: 20,    // Kommentar-Vertiefungen pro Tag\n  maxProblemeProClusterlauf: 45,\n  problemeProClusterBatch: 15,\n  maxBekannteCluster: 200,    // so viele bestehende Cluster sieht das Cluster-Modell\n  userAgent: 'n8n:reddit-nischen-scanner:1.0 (by /u/DEIN_REDDIT_NAME)',\n};\nconst ein = $input.first()?.json || {};\nreturn [{ json: { ...cfg, phase: ein.phase === 'cluster' ? 'cluster' : 'analyse', runde: Number(ein.runde || 0) } }];\n" }, position: [220, 400] },
  output: [{ postsProBatch: 18, zeichenProBatch: 14000, maxZeichenProPost: 1800, batchesProRunde: 4, maxRundenProTag: 15, minConfidence: 0.7, pruefConfidence: 0.4, maxKommentarThreads: 20, maxProblemeProClusterlauf: 45, problemeProClusterBatch: 15, maxBekannteCluster: 200, userAgent: 'n8n:reddit-nischen-scanner:1.0', phase: 'analyse', runde: 0 }],
});

const phaseWeiche = ifElse({
  version: 2.2,
  config: {
    name: 'Phase: Analyse?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.phase }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'analyse' }],
        combinator: 'and',
      },
    },
    position: [440, 400],
  },
});

// ---------- Phase Analyse ----------
const ungepruefteLaden = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Ungeprüfte Posts laden',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TB_BUFFER,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'analyzed', condition: 'isFalse' }] },
      returnAll: false,
      limit: expr("{{ $('Einstellungen').first().json.postsProBatch * $('Einstellungen').first().json.batchesProRunde }}"),
      orderBy: true,
      orderByColumn: 'createdAt',
      orderByDirection: 'ASC',
    },
    position: [680, 200],
  },
  output: [{ id: 1, post_id: 't3_abc', subreddit: 'Beekeeping', title: 'How do you track hive inspections?', body: 'I keep everything in a notebook...', permalink: 'https://www.reddit.com/r/Beekeeping/comments/abc/', created_utc: 1794873600, analyzed: false }],
});

const batchesBilden = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Batches bilden', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Ungeprüfte Posts in KI-Batches aufteilen (nach Anzahl UND Zeichenbudget)\nconst cfg = $('Einstellungen').first().json;\nconst posts = $input.all().map((i) => i.json).filter((p) => p && p.post_id);\nif (!posts.length) return [{ json: { leer: true, batch_nr: 0, posts: [], anzahl: 0 } }];\n\nconst kuerzen = (s, n) => { s = String(s || '').replace(/\\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + ' …' : s; };\nconst batches = [];\nlet akt = []; let zeichen = 0;\nfor (const p of posts) {\n  const eintrag = { post_id: p.post_id, subreddit: p.subreddit, title: kuerzen(p.title, 300), body: kuerzen(p.body, cfg.maxZeichenProPost) };\n  const laenge = eintrag.title.length + eintrag.body.length + 60;\n  if (akt.length && (akt.length >= cfg.postsProBatch || zeichen + laenge > cfg.zeichenProBatch)) { batches.push(akt); akt = []; zeichen = 0; }\n  akt.push(eintrag); zeichen += laenge;\n}\nif (akt.length) batches.push(akt);\nreturn batches.slice(0, cfg.batchesProRunde).map((b, i) => ({ json: { leer: false, batch_nr: i + 1, anzahl: b.length, posts: b } }));\n" }, position: [900, 200] },
  output: [{ leer: false, batch_nr: 1, anzahl: 1, posts: [{ post_id: 't3_abc', subreddit: 'Beekeeping', title: 'How do you track hive inspections?', body: 'I keep everything in a notebook...' }] }],
});

const hatPosts = ifElse({
  version: 2.2,
  config: {
    name: 'Posts vorhanden?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.leer }}'), operator: { type: 'boolean', operation: 'false', singleValue: true } }],
        combinator: 'and',
      },
    },
    position: [1120, 200],
  },
});

const modellErkennung = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.2,
  config: {
    name: 'OpenAI (Erkennung)',
    parameters: { model: { __rl: true, mode: 'list', value: 'gpt-5-mini' }, options: { reasoningEffort: 'low', timeout: 120000 } },
    credentials: { openAiApi: { id: 'Iy7VcTn0kXCAU7tQ', name: 'OpenAI account' } },
    position: [1300, 420],
  },
});

const parserErkennung = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: { name: 'Struktur: Probleme', parameters: { schemaType: 'manual', inputSchema: "{\n  \"type\": \"object\",\n  \"properties\": {\n    \"posts\": {\n      \"type\": \"array\",\n      \"items\": {\n        \"type\": \"object\",\n        \"properties\": {\n          \"post_id\": { \"type\": \"string\" },\n          \"has_problem\": { \"type\": \"boolean\" },\n          \"actor\": { \"type\": \"string\" },\n          \"task\": { \"type\": \"string\" },\n          \"problem\": { \"type\": \"string\" },\n          \"workaround\": { \"type\": \"string\" },\n          \"frequency\": { \"type\": \"string\", \"enum\": [\"daily\", \"weekly\", \"monthly\", \"rare\", \"unknown\"] },\n          \"pain_type\": { \"type\": \"string\", \"enum\": [\"time\", \"money\", \"risk\", \"frustration\", \"compliance\", \"growth\", \"other\"] },\n          \"payment_signal\": { \"type\": \"string\", \"enum\": [\"none\", \"weak\", \"medium\", \"strong\"] },\n          \"evidence_quote\": { \"type\": \"string\" },\n          \"confidence\": { \"type\": \"number\" },\n          \"needs_comment_review\": { \"type\": \"boolean\" }\n        },\n        \"required\": [\"post_id\", \"has_problem\", \"actor\", \"task\", \"problem\", \"workaround\", \"frequency\", \"pain_type\", \"payment_signal\", \"evidence_quote\", \"confidence\", \"needs_comment_review\"]\n      }\n    }\n  },\n  \"required\": [\"posts\"]\n}\n" }, position: [1460, 420] },
});

const erkennung = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.7,
  config: {
    name: 'Problem-Erkennung (KI)',
    onError: 'continueRegularOutput',
    parameters: {
      promptType: 'define',
      text: expr('Analysiere diese Reddit-Posts:\n{{ JSON.stringify($json.posts) }}'),
      hasOutputParser: true,
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "You are a problem-discovery analyst. You read Reddit posts from niche communities (trades, hobbies, small businesses, specialist interests) and detect REAL, RECURRING problems that people have while doing a concrete task.\n\nYour job is ONLY to detect and describe problems. Do NOT invent products, software or business ideas.\n\nFor EVERY post in the input array return exactly one result object with the same post_id.\n\nA post \"has_problem\" only if the author (or people they describe) experiences a concrete obstacle, inefficiency, cost, risk or frustration in a task they actually perform. Typical signals:\n- manual, repetitive or error-prone work (\"I keep everything in a spreadsheet\", \"I have to call every customer\")\n- workarounds, hacks, duct-tape processes, juggling several tools\n- lost time, lost money, missed deadlines, customer complaints, compliance trouble\n- asking how others handle/manage/track/organize something\n- paying for something that does not fit, or saying they would pay\n\nNOT a problem (has_problem = false): memes, show-offs, pure opinions, news, generic beginner questions with a simple factual answer (\"what glue should I use?\"), one-off technical troubleshooting of a single broken item, relationship/personal drama, self-promotion.\n\nHidden problems matter most: a low-effort post with 2 upvotes describing an annoying manual process is MORE valuable than a popular complaint about prices.\n\nField rules:\n- actor: who has the problem, specific (e.g. \"Hobby-Imker mit 10+ Völkern\", \"Solo-Hochzeitsfotograf\"). German.\n- task: what they are trying to get done. German.\n- problem: the obstacle in one neutral sentence, no solution. German.\n- workaround: how they cope today (\"Excel\", \"WhatsApp-Gruppe\", \"Papiernotizen\", \"keiner\"). German.\n- frequency: daily | weekly | monthly | rare | unknown\n- pain_type: time | money | risk | frustration | compliance | growth | other\n- payment_signal: none | weak | medium | strong  (strong = they pay for a workaround/tool or explicitly say they would pay)\n- evidence_quote: a SHORT verbatim quote (max 200 chars) from the post that proves the problem. Never paraphrase here. Empty string if has_problem is false.\n- confidence: 0.0–1.0, how sure you are this is a real, recurring task problem (not how big the market is).\n- needs_comment_review: true if the comments probably contain more people with the same problem or describe current solutions.\n\nIf has_problem is false, fill text fields with empty strings, frequency \"unknown\", pain_type \"other\", payment_signal \"none\", confidence = your confidence that there is a problem (low).\n\nNever invent details that are not in the post.\n" }] },
      batching: { batchSize: 4, delayBetweenBatches: 0 },
    },
    subnodes: { model: modellErkennung, outputParser: parserErkennung },
    position: [1360, 100],
  },
  output: [{ output: { posts: [{ post_id: 't3_abc', has_problem: true, actor: 'Hobby-Imker', task: 'Stockkontrollen dokumentieren', problem: 'Kontrollen werden auf Papier notiert', workaround: 'Notizbuch', frequency: 'weekly', pain_type: 'time', payment_signal: 'none', evidence_quote: 'I keep everything in a notebook', confidence: 0.85, needs_comment_review: true }] } }],
});

const ergebnisse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Ergebnisse auswerten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// KI-Ergebnisse den Posts zuordnen, Qualität prüfen, Schreib-Listen bauen\nconst cfg = $('Einstellungen').first().json;\nconst batches = $('Batches bilden').all();\nconst ergebnisse = $input.all();\nconst quelle = new Map($('Ungeprüfte Posts laden').all().map((i) => [i.json.post_id, i.json]));\nconst jetzt = new Date().toISOString();\nconst PAIN = ['time', 'money', 'risk', 'frustration', 'compliance', 'growth', 'other'];\nconst FREQ = ['daily', 'weekly', 'monthly', 'rare', 'unknown'];\nconst PAY = ['none', 'weak', 'medium', 'strong'];\n\nconst probleme = []; const analysiert = []; const stats = {};\nlet fehlerBatches = 0;\nergebnisse.forEach((it, idx) => {\n  const batch = batches[idx] ? batches[idx].json.posts : [];\n  const out = it.json && it.json.output;\n  const liste = out && Array.isArray(out.posts) ? out.posts : null;\n  if (!liste) { fehlerBatches++; return; }              // Batch fehlgeschlagen -> Posts bleiben offen\n  const proPost = new Map(liste.map((r) => [String(r.post_id), r]));\n  for (const p of batch) {\n    analysiert.push({ post_id: p.post_id, analyzed: true });\n    const s = (stats[p.subreddit] = stats[p.subreddit] || { gescannt: 0, gefunden: 0 });\n    s.gescannt++;\n    const r = proPost.get(String(p.post_id));\n    if (!r || !r.has_problem) continue;\n    const conf = Math.max(0, Math.min(1, Number(r.confidence) || 0));\n    if (conf < cfg.pruefConfidence) continue;\n    const src = quelle.get(p.post_id) || {};\n    if (conf >= cfg.minConfidence) s.gefunden++;\n    probleme.push({\n      post_id: p.post_id,\n      subreddit: p.subreddit,\n      permalink: src.permalink || '',\n      post_created: src.created_utc ? new Date(Number(src.created_utc) * 1000).toISOString() : '',\n      actor: String(r.actor || '').slice(0, 200),\n      task: String(r.task || '').slice(0, 300),\n      problem: String(r.problem || '').slice(0, 600),\n      workaround: String(r.workaround || '').slice(0, 300),\n      frequency: FREQ.includes(r.frequency) ? r.frequency : 'unknown',\n      pain_type: PAIN.includes(r.pain_type) ? r.pain_type : 'other',\n      payment_signal: PAY.includes(r.payment_signal) ? r.payment_signal : 'none',\n      evidence_quote: String(r.evidence_quote || '').slice(0, 240),\n      confidence: conf,\n      needs_comment_review: !!r.needs_comment_review,\n      comment_insight: '',\n      status: conf >= cfg.minConfidence ? 'qualifiziert' : 'pruefen',\n      cluster_key: '',\n      source: 'scan',\n      found_at: jetzt,\n    });\n  }\n});\nconst ungeprueft = $('Ungeprüfte Posts laden').all().length;\nconst analysiertAnzahl = analysiert.length;\nconst weitere = ungeprueft > analysiertAnzahl || ungeprueft >= cfg.postsProBatch * cfg.batchesProRunde;\nreturn [{ json: { probleme, analysiert, stats, fehlerBatches, weitere, qualifiziert: probleme.filter((p) => p.status === 'qualifiziert').length } }];\n" }, position: [1640, 100] },
  output: [{ probleme: [{ post_id: 't3_abc', subreddit: 'Beekeeping', status: 'qualifiziert' }], analysiert: [{ post_id: 't3_abc', analyzed: true }], stats: { Beekeeping: { gescannt: 1, gefunden: 1 } }, fehlerBatches: 0, weitere: false, qualifiziert: 1 }],
});

const problemeAufteilen = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Probleme aufteilen', parameters: { fieldToSplitOut: 'probleme', include: 'noOtherFields' }, position: [1880, -100] },
  output: [{ post_id: 't3_abc', subreddit: 'Beekeeping', status: 'qualifiziert' }],
});

const problemeSpeichern = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Probleme speichern',
    parameters: { resource: 'row', operation: 'insert', dataTableId: TB_PROBLEME, columns: { mappingMode: 'autoMapInputData', value: null }, options: { optimizeBulk: true } },
    position: [2100, -100],
  },
  output: [{}],
});

const analysiertAufteilen = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Analysierte Posts aufteilen', parameters: { fieldToSplitOut: 'analysiert', include: 'noOtherFields' }, position: [1880, 60] },
  output: [{ post_id: 't3_abc', analyzed: true }],
});

const alsAnalysiertMarkieren = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Als analysiert markieren',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TB_BUFFER,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'post_id', condition: 'eq', keyValue: expr('{{ $json.post_id }}') }] },
      columns: { mappingMode: 'autoMapInputData', value: null },
    },
    position: [2100, 60],
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
    position: [1880, 220],
  },
  output: [{ id: 1, name: 'Beekeeping', status: 'explore', posts_scanned: 10, problems_found: 1 }],
});

const fundraten = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fundraten berechnen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Fundrate pro Community aktualisieren und Status anpassen (explore -> active / watchlist)\nconst stats = $('Ergebnisse auswerten').first().json.stats || {};\nconst rows = $input.all().map((i) => i.json).filter((r) => r && r.name);\nconst map = new Map(rows.map((r) => [r.name, r]));\nconst out = [];\nfor (const [name, s] of Object.entries(stats)) {\n  const r = map.get(name);\n  if (!r) continue;\n  const gescannt = Number(r.posts_scanned || 0) + s.gescannt;\n  const gefunden = Number(r.problems_found || 0) + s.gefunden;\n  const rate = gescannt ? gefunden / gescannt : 0;\n  let status = r.status || 'explore';\n  if (status === 'explore' && gescannt >= 40 && rate >= 0.03) status = 'active';\n  else if (status === 'explore' && gescannt >= 60 && rate < 0.03) status = 'watchlist';\n  else if (status === 'active' && gescannt >= 150 && rate < 0.015) status = 'watchlist';\n  else if (status === 'watchlist' && gescannt >= 40 && rate >= 0.03) status = 'active';\n  out.push({ json: { name, posts_scanned: gescannt, problems_found: gefunden, problem_yield: Math.round(rate * 10000) / 10000, status } });\n}\nreturn out;\n" }, position: [2100, 220] },
  output: [{ name: 'Beekeeping', posts_scanned: 11, problems_found: 2, problem_yield: 0.18, status: 'explore' }],
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
    position: [2320, 220],
  },
  output: [{}],
});

const naechsterSchritt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Nächster Schritt', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Nächste Runde: weiter analysieren oder zur Clusterbildung wechseln\nconst cfg = $('Einstellungen').first().json;\nconst erg = $('Ergebnisse auswerten').first().json;\nconst naechsteRunde = cfg.runde + 1;\nconst budgetErreicht = naechsteRunde >= cfg.maxRundenProTag;\nconst phase = erg.weitere && !budgetErreicht ? 'analyse' : 'cluster';\nreturn [{ json: { phase, runde: phase === 'analyse' ? naechsteRunde : 0, budgetErreicht } }];\n" }, position: [1880, 400] },
  output: [{ phase: 'analyse', runde: 1, budgetErreicht: false }],
});

const zurClusterphase = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Weiter zur Clusterphase',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: { assignments: [
        { id: 'phase', name: 'phase', value: 'cluster', type: 'string' },
        { id: 'runde', name: 'runde', value: 0, type: 'number' },
      ] },
    },
    position: [1360, 320],
  },
  output: [{ phase: 'cluster', runde: 0 }],
});

const selbstStarten = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Nächste Runde starten',
    parameters: {
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: expr('{{ $workflow.id }}') },
      mode: 'once',
      options: { waitForSubWorkflow: false },
    },
    position: [2100, 400],
  },
  output: [{}],
});

// ---------- Phase Cluster ----------
const neueProblemeLaden = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Neue Probleme laden',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TB_PROBLEME,
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'status', condition: 'eq', keyValue: 'qualifiziert' },
        { keyName: 'cluster_key', condition: 'isEmpty' },
      ] },
      returnAll: false,
      limit: expr("{{ $('Einstellungen').first().json.maxProblemeProClusterlauf }}"),
      orderBy: true,
      orderByColumn: 'confidence',
      orderByDirection: 'DESC',
    },
    position: [680, 700],
  },
  output: [{ id: 1, post_id: 't3_abc', subreddit: 'Beekeeping', actor: 'Hobby-Imker', problem: 'Kontrollen auf Papier', confidence: 0.85, needs_comment_review: true, status: 'qualifiziert', cluster_key: '' }],
});

const kandidaten = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Kommentar-Kandidaten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Bis zu N qualifizierte Probleme auswählen, deren Diskussion vertieft werden soll\nconst cfg = $('Einstellungen').first().json;\nconst probleme = $input.all().map((i) => i.json).filter((p) => p && p.post_id);\nconst kandidaten = probleme\n  .filter((p) => p.needs_comment_review)\n  .sort((a, b) => Number(b.confidence) - Number(a.confidence))\n  .slice(0, cfg.maxKommentarThreads)\n  .map((p) => ({ json: { keine: false, post_id: p.post_id, artikel_id: String(p.post_id).replace(/^t3_/, ''), link_id: String(p.post_id), userAgent: cfg.userAgent } }));\nreturn kandidaten.length ? kandidaten : [{ json: { keine: true } }];\n" }, position: [900, 700] },
  output: [{ keine: false, post_id: 't3_abc', artikel_id: 'abc', userAgent: 'n8n:reddit-nischen-scanner:1.0' }],
});

const kommentareNoetig = ifElse({
  version: 2.2,
  config: {
    name: 'Kommentare abrufen?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.keine }}'), operator: { type: 'boolean', operation: 'false', singleValue: true } }],
        combinator: 'and',
      },
    },
    position: [1120, 700],
  },
});

const kommentareAbrufen = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Kommentare abrufen',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: 'GET',
      url: expr('https://oauth.reddit.com/comments/{{ $json.artikel_id }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'redditOAuth2Api',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [
        { name: 'limit', value: '30' },
        { name: 'depth', value: '2' },
        { name: 'sort', value: 'top' },
        { name: 'raw_json', value: '1' },
      ] },
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'User-Agent', value: expr('{{ $json.userAgent }}') }] },
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 2500 } },
        response: { response: { fullResponse: true, neverError: true } },
        timeout: 20000,
      },
    },
    credentials: { redditOAuth2Api: newCredential('Reddit OAuth2') },
    position: [1340, 620],
  },
  output: [{ statusCode: 200, body: [{ kind: 'Listing' }, { kind: 'Listing', data: { children: [{ kind: 't1', data: { body: 'Same here, I use a spreadsheet', score: 12 } }] } }] }],
});

const kontext = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Kommentar-Kontext bündeln', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Kommentar-Kontext an die Probleme hängen (Top-Kommentare, gekürzt)\nconst probleme = $('Neue Probleme laden').all().map((i) => i.json).filter((p) => p && p.post_id);\nconst kommentare = new Map();\ntry {\n  const kandidaten = $('Kommentar-Kandidaten').all();\n  const antworten = $('Kommentare abrufen').all();\n  antworten.forEach((it, idx) => {\n    const k = kandidaten[idx] && kandidaten[idx].json;\n    const body = it.json && it.json.body;\n    if (!k || !body) return;\n    // Arctic Shift: { data: [kommentar, ...] } – Reddit: [post, { data: { children } }]\n    const roh = Array.isArray(body.data) ? body.data.map((x) => ({ kind: 't1', data: x })) : Array.isArray(body) && body[1] ? (body[1].data && body[1].data.children) || [] : [];\n    const liste = roh\n      .filter((c) => c.kind === 't1' && c.data && c.data.body && !c.data.stickied && c.data.author !== 'AutoModerator' && !['[removed]', '[deleted]'].includes(c.data.body))\n      .sort((a, b) => (b.data.score || 0) - (a.data.score || 0))\n      .slice(0, 8)\n      .map((c) => String(c.data.body).replace(/\\s+/g, ' ').slice(0, 280));\n    if (liste.length) kommentare.set(k.post_id, liste);\n  });\n} catch (e) { /* keine Kommentare abgerufen */ }\nreturn [{ json: { probleme: probleme.map((p) => ({ ...p, kommentare: kommentare.get(p.post_id) || [] })), mitKommentaren: kommentare.size } }];\n" }, position: [1560, 700] },
  output: [{ probleme: [{ post_id: 't3_abc', subreddit: 'Beekeeping', problem: 'Kontrollen auf Papier', kommentare: ['Same here'] }], mitKommentaren: 1 }],
});

const clusterLaden = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Cluster laden',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: TB_CLUSTER, returnAll: true },
    position: [1780, 700],
  },
  output: [{ id: 1, cluster_key: 'c1', title: 'Stockkarten digital', problem: 'Kontrollen auf Papier', audience: 'Imker', last_seen: '2026-11-16T00:00:00.000Z' }],
});

const zuordnungenLaden = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Alle Zuordnungen laden',
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
    position: [2000, 700],
  },
  output: [{ id: 2, post_id: 't3_xyz', subreddit: 'beekeeping', cluster_key: 'c1', source: 'scan', post_created: '2026-11-10T00:00:00.000Z' }],
});

const clusterBatches = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Cluster-Batches bilden', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Neue Probleme + kompakte Liste bestehender Cluster in Batches für das Cluster-Modell\nconst cfg = $('Einstellungen').first().json;\nconst probleme = $('Kommentar-Kontext bündeln').first().json.probleme || [];\nconst cluster = $('Cluster laden').all().map((i) => i.json).filter((c) => c && c.cluster_key)\n  .sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')))\n  .slice(0, cfg.maxBekannteCluster)\n  .map((c) => ({ cluster_key: c.cluster_key, title: c.title, problem: c.problem, audience: c.audience }));\nconst out = [];\nfor (let i = 0; i < probleme.length; i += cfg.problemeProClusterBatch) {\n  const teil = probleme.slice(i, i + cfg.problemeProClusterBatch).map((p) => ({\n    post_id: p.post_id, subreddit: p.subreddit, actor: p.actor, task: p.task, problem: p.problem,\n    workaround: p.workaround, frequency: p.frequency, pain_type: p.pain_type, payment_signal: p.payment_signal,\n    evidence_quote: p.evidence_quote, top_comments: p.kommentare || [],\n  }));\n  out.push({ json: { batch_nr: out.length + 1, neue_probleme: teil, bestehende_cluster: cluster } });\n}\nreturn out;\n" }, position: [2220, 700] },
  output: [{ batch_nr: 1, neue_probleme: [{ post_id: 't3_abc', problem: 'Kontrollen auf Papier' }], bestehende_cluster: [{ cluster_key: 'c1', title: 'Stockkarten digital' }] }],
});

const modellCluster = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.2,
  config: {
    name: 'OpenAI (Cluster)',
    parameters: { model: { __rl: true, mode: 'list', value: 'gpt-5-mini' }, options: { reasoningEffort: 'medium', timeout: 180000 } },
    credentials: { openAiApi: { id: 'Iy7VcTn0kXCAU7tQ', name: 'OpenAI account' } },
    position: [2380, 920],
  },
});

const parserCluster = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: { name: 'Struktur: Cluster', parameters: { schemaType: 'manual', inputSchema: "{\n  \"type\": \"object\",\n  \"properties\": {\n    \"results\": {\n      \"type\": \"array\",\n      \"items\": {\n        \"type\": \"object\",\n        \"properties\": {\n          \"post_id\": { \"type\": \"string\" },\n          \"keep\": { \"type\": \"boolean\" },\n          \"refined\": {\n            \"type\": \"object\",\n            \"properties\": {\n              \"actor\": { \"type\": \"string\" },\n              \"problem\": { \"type\": \"string\" },\n              \"workaround\": { \"type\": \"string\" },\n              \"payment_signal\": { \"type\": \"string\", \"enum\": [\"none\", \"weak\", \"medium\", \"strong\"] },\n              \"comment_insight\": { \"type\": \"string\" }\n            },\n            \"required\": [\"actor\", \"problem\", \"workaround\", \"payment_signal\", \"comment_insight\"]\n          },\n          \"assignment\": {\n            \"type\": \"object\",\n            \"properties\": {\n              \"type\": { \"type\": \"string\", \"enum\": [\"existing\", \"new\"] },\n              \"cluster_key\": { \"type\": \"string\" },\n              \"new_ref\": { \"type\": \"string\" }\n            },\n            \"required\": [\"type\", \"cluster_key\", \"new_ref\"]\n          }\n        },\n        \"required\": [\"post_id\", \"keep\", \"refined\", \"assignment\"]\n      }\n    },\n    \"new_clusters\": {\n      \"type\": \"array\",\n      \"items\": {\n        \"type\": \"object\",\n        \"properties\": {\n          \"new_ref\": { \"type\": \"string\" },\n          \"title\": { \"type\": \"string\" },\n          \"problem\": { \"type\": \"string\" },\n          \"audience\": { \"type\": \"string\" },\n          \"workaround\": { \"type\": \"string\" }\n        },\n        \"required\": [\"new_ref\", \"title\", \"problem\", \"audience\", \"workaround\"]\n      }\n    }\n  },\n  \"required\": [\"results\", \"new_clusters\"]\n}\n" }, position: [2540, 920] },
});

const clustern = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.7,
  config: {
    name: 'Präzisieren & Clustern (KI)',
    onError: 'continueRegularOutput',
    parameters: {
      promptType: 'define',
      text: expr('neue_probleme:\n{{ JSON.stringify($json.neue_probleme) }}\n\nbestehende_cluster:\n{{ JSON.stringify($json.bestehende_cluster) }}'),
      hasOutputParser: true,
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "You are a careful analyst that maintains a catalogue of recurring problems (\"clusters\") discovered on Reddit.\n\nYou receive:\n1. neue_probleme: newly detected problems, each with post_id, subreddit, actor, task, problem, workaround, payment signal, a verbatim quote and optionally top_comments from the discussion.\n2. bestehende_cluster: the existing problem clusters (cluster_key, title, problem, audience).\n\nFor EACH new problem:\nA) Refine it using the comment context: sharpen actor, problem and workaround; update payment_signal if comments show paid tools/workarounds; write comment_insight (German, max 2 sentences: what the comments add, e.g. \"Mehrere Nutzer bestätigen das Problem; genannte Tools: X, Y – zu teuer/zu allgemein\"). Empty string if there are no comments.\nB) Decide keep: false if, in light of the comments, it is not a real recurring task problem (e.g. solved by a simple known answer). Otherwise keep: true.\nC) Assign it:\n   - type \"existing\" with the cluster_key, if an existing cluster describes the SAME underlying need: same kind of job to be done AND a solution for one would clearly serve the other. Different industries are allowed (e.g. client/booking management for solo photographers, dog trainers and music teachers can be one cluster \"Kunden- und Terminverwaltung für Solo-Dienstleister\"), but do NOT merge needs that only share a keyword (e.g. \"inventory of honey jars\" vs \"inventory of car parts in a workshop\" only if the workflow is truly similar).\n   - type \"new\" with a new_ref (e.g. \"N1\"), if no existing cluster fits. Several new problems in this batch may share the same new_ref if they describe the same need.\n\nFor every new_ref, add one entry to new_clusters with:\n- title: short German name of the need (max 10 words), e.g. \"Fehldruck-Dokumentation in kleinen 3D-Druck-Betrieben\"\n- problem: one neutral German sentence describing the shared problem, no solution\n- audience: German description of who has it\n- workaround: typical current workaround (German)\n\nBe conservative: merging different needs is worse than creating a new cluster. Only use cluster_keys that appear in bestehende_cluster. Return a result for every post_id in neue_probleme.\n" }] },
      batching: { batchSize: 1, delayBetweenBatches: 0 },
    },
    subnodes: { model: modellCluster, outputParser: parserCluster },
    position: [2440, 700],
  },
  output: [{ output: { results: [{ post_id: 't3_abc', keep: true, refined: { actor: 'Hobby-Imker', problem: 'Kontrollen auf Papier', workaround: 'Notizbuch', payment_signal: 'none', comment_insight: '' }, assignment: { type: 'existing', cluster_key: 'c1', new_ref: '' } }], new_clusters: [] } }],
});

const clusterAnwenden = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Cluster anwenden', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Cluster-Entscheidungen anwenden: neue Cluster anlegen, Probleme zuordnen, Evidenz neu zählen\nconst batches = $('Cluster-Batches bilden').all();\nconst bekannt = new Map($('Cluster laden').all().map((i) => i.json).filter((c) => c && c.cluster_key).map((c) => [c.cluster_key, c]));\nconst original = new Map($('Neue Probleme laden').all().map((i) => [i.json.post_id, i.json]));\nconst basisZeit = Date.now().toString(36);\nconst updates = new Map();   // post_id -> Problem-Update\nconst neueCluster = new Map(); // cluster_key -> Cluster\n\n$input.all().forEach((it, bi) => {\n  const out = it.json && it.json.output;\n  if (!out || !Array.isArray(out.results)) return;\n  const neuRef = new Map();\n  for (const nc of out.new_clusters || []) {\n    const key = 'c' + basisZeit + '_' + bi + '_' + String(nc.new_ref || neuRef.size).replace(/[^a-zA-Z0-9]/g, '');\n    neuRef.set(String(nc.new_ref), key);\n    neueCluster.set(key, { cluster_key: key, title: String(nc.title || '').slice(0, 150), problem: String(nc.problem || '').slice(0, 600), audience: String(nc.audience || '').slice(0, 200), workaround: String(nc.workaround || '').slice(0, 300) });\n  }\n  const erlaubt = new Set(batches[bi] ? batches[bi].json.neue_probleme.map((p) => p.post_id) : []);\n  for (const r of out.results) {\n    const pid = String(r.post_id || '');\n    if (!erlaubt.has(pid) || !original.has(pid)) continue;\n    const o = original.get(pid);\n    const ref = r.refined || {};\n    let key = '';\n    if (r.keep !== false) {\n      const a = r.assignment || {};\n      if (a.type === 'existing' && bekannt.has(a.cluster_key)) key = a.cluster_key;\n      else if (a.type === 'new' && neuRef.has(String(a.new_ref))) key = neuRef.get(String(a.new_ref));\n      else {\n        key = 'c' + basisZeit + '_' + bi + '_s' + updates.size;\n        neueCluster.set(key, { cluster_key: key, title: String(ref.problem || o.problem).slice(0, 150), problem: String(ref.problem || o.problem).slice(0, 600), audience: String(ref.actor || o.actor || '').slice(0, 200), workaround: String(ref.workaround || o.workaround || '').slice(0, 300) });\n      }\n    }\n    updates.set(pid, {\n      post_id: pid,\n      source: 'scan',\n      status: key ? 'zugeordnet' : 'verworfen',\n      cluster_key: key,\n      actor: String(ref.actor || o.actor || '').slice(0, 200),\n      problem: String(ref.problem || o.problem || '').slice(0, 600),\n      workaround: String(ref.workaround || o.workaround || '').slice(0, 300),\n      payment_signal: ['none', 'weak', 'medium', 'strong'].includes(ref.payment_signal) ? ref.payment_signal : o.payment_signal,\n      comment_insight: String(ref.comment_insight || '').slice(0, 400),\n    });\n  }\n});\n\n// Evidenz je Cluster neu zählen: unabhängige Diskussionen = unterschiedliche Posts\nconst alle = new Map();\nfor (const i of $('Alle Zuordnungen laden').all()) { const p = i.json; if (p && p.post_id && p.cluster_key) alle.set(p.post_id + '|' + (p.source || 'scan'), p); }\nfor (const u of updates.values()) { const o = original.get(u.post_id) || {}; alle.set(u.post_id + '|scan', { ...o, ...u }); }\nconst betroffen = new Set([...updates.values()].map((u) => u.cluster_key).filter(Boolean));\nconst cluster = [];\nfor (const key of betroffen) {\n  const ev = [...alle.values()].filter((p) => p.cluster_key === key);\n  const posts = new Set(ev.map((p) => p.post_id));\n  const subs = [...new Set(ev.map((p) => p.subreddit).filter(Boolean))];\n  const zeiten = ev.map((p) => p.post_created || p.found_at).filter(Boolean).sort();\n  const basis = neueCluster.get(key) || bekannt.get(key) || { cluster_key: key };\n  const row = {\n    cluster_key: key, title: basis.title || '', problem: basis.problem || '', audience: basis.audience || '', workaround: basis.workaround || '',\n    subreddits: subs.join(', '), evidence_count: posts.size, subreddit_count: subs.length,\n    first_seen: basis.first_seen || zeiten[0] || new Date().toISOString(), last_seen: zeiten[zeiten.length - 1] || new Date().toISOString(),\n  };\n  if (neueCluster.has(key)) row.report_status = 'neu';\n  cluster.push(row);\n}\nreturn [{ json: { problemUpdates: [...updates.values()], cluster, neueCluster: neueCluster.size, zugeordnet: [...updates.values()].filter((u) => u.cluster_key).length } }];\n" }, position: [2720, 700] },
  output: [{ problemUpdates: [{ post_id: 't3_abc', source: 'scan', status: 'zugeordnet', cluster_key: 'c1' }], cluster: [{ cluster_key: 'c1', title: 'Stockkarten digital', evidence_count: 2, subreddit_count: 1 }], neueCluster: 0, zugeordnet: 1 }],
});

const updatesAufteilen = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Problem-Updates aufteilen', parameters: { fieldToSplitOut: 'problemUpdates', include: 'noOtherFields' }, position: [2940, 600] },
  output: [{ post_id: 't3_abc', source: 'scan', status: 'zugeordnet', cluster_key: 'c1' }],
});

const problemeAktualisieren = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Probleme aktualisieren',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TB_PROBLEME,
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'post_id', condition: 'eq', keyValue: expr('{{ $json.post_id }}') },
        { keyName: 'source', condition: 'eq', keyValue: expr('{{ $json.source }}') },
      ] },
      columns: { mappingMode: 'autoMapInputData', value: null },
    },
    position: [3160, 600],
  },
  output: [{}],
});

const clusterAufteilen = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Cluster aufteilen', parameters: { fieldToSplitOut: 'cluster', include: 'noOtherFields' }, position: [2940, 800] },
  output: [{ cluster_key: 'c1', title: 'Stockkarten digital', evidence_count: 2, subreddit_count: 1 }],
});

const clusterSpeichern = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Cluster speichern',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TB_CLUSTER,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'cluster_key', condition: 'eq', keyValue: expr('{{ $json.cluster_key }}') }] },
      columns: { mappingMode: 'autoMapInputData', value: null },
    },
    position: [3160, 800],
  },
  output: [{}],
});

const notiz = sticky(
  '## 03 – Problem Intelligence\nWird vom Collector gestartet und läuft in **Runden** (je eigene Ausführung, wegen Laufzeitlimit).\n\n**Phase Analyse:** bis zu 4 Batches à 18 Posts pro Runde → KI erkennt Probleme (ohne Geschäftsideen). ≥ 0.70 = qualifiziert, 0.40–0.69 = Prüfliste. Fundraten pro Community werden aktualisiert. Danach startet sich der Workflow selbst neu, bis alles analysiert ist oder das Tagesbudget (15 Runden) erreicht ist.\n\n**Phase Cluster:** bis zu 20 Diskussionen werden über die Kommentare vertieft, dann ordnet die KI jedes Problem einem bestehenden oder neuen Problemcluster zu. Evidenz = Anzahl **unabhängiger Posts**, nicht Kommentare.\n\nAnpassen: Node **Einstellungen**.',
  [einstellungen, phaseWeiche],
  { color: 4 },
);

export default workflow('reddit-problem-intelligence', '03_PROBLEM_INTELLIGENCE')
  .add(aufruf)
  .to(einstellungen)
  .to(phaseWeiche
    .onTrue(ungepruefteLaden.to(batchesBilden).to(hatPosts
      .onTrue(erkennung.to(ergebnisse))
      .onFalse(zurClusterphase.to(selbstStarten))))
    .onFalse(neueProblemeLaden.to(kandidaten).to(kommentareNoetig
      .onTrue(kommentareAbrufen.to(kontext))
      .onFalse(kontext))))
  .add(manuell)
  .to(einstellungen)
  .add(ergebnisse)
  .to(problemeAufteilen)
  .to(problemeSpeichern)
  .add(ergebnisse)
  .to(analysiertAufteilen)
  .to(alsAnalysiertMarkieren)
  .add(ergebnisse)
  .to(communitiesLaden)
  .to(fundraten)
  .to(communitiesAktualisieren)
  .add(ergebnisse)
  .to(naechsterSchritt)
  .to(selbstStarten)
  .add(kontext)
  .to(clusterLaden)
  .to(zuordnungenLaden)
  .to(clusterBatches)
  .to(clustern)
  .to(clusterAnwenden)
  .add(clusterAnwenden)
  .to(updatesAufteilen)
  .to(problemeAktualisieren)
  .add(clusterAnwenden)
  .to(clusterAufteilen)
  .to(clusterSpeichern)
  .add(notiz)
  .group('Analyse: Posts laden', [ungepruefteLaden, batchesBilden], { description: 'Noch nicht analysierte Posts (älteste zuerst) laden und in KI-Batches nach Anzahl und Zeichenbudget aufteilen' })
  .group('Analyse: Problem-Erkennung', [erkennung, modellErkennung, parserErkennung, ergebnisse], { description: 'KI erkennt versteckte Probleme pro Post; Ergebnisse prüfen und nach Confidence einordnen' })
  .group('Analyse: Probleme speichern', [problemeAufteilen, problemeSpeichern], { description: 'Qualifizierte Probleme und Prüfliste in reddit_problems speichern' })
  .group('Analyse: Posts abhaken', [analysiertAufteilen, alsAnalysiertMarkieren], { description: 'Erfolgreich analysierte Posts im Puffer als analysiert markieren' })
  .group('Analyse: Fundraten', [communitiesLaden, fundraten, communitiesAktualisieren], { description: 'Problem-Fundrate pro Community fortschreiben; explore → active / watchlist' })
  .group('Cluster: Kommentare vertiefen', [neueProblemeLaden, kandidaten, kommentareNoetig, kommentareAbrufen, kontext], { description: 'Neue qualifizierte Probleme laden und bis zu 20 Diskussionen über die Top-Kommentare vertiefen' })
  .group('Cluster: Zuordnen', [clusterLaden, zuordnungenLaden, clusterBatches, clustern, modellCluster, parserCluster, clusterAnwenden], { description: 'KI präzisiert Probleme und ordnet sie bestehenden oder neuen Clustern zu; Evidenz neu zählen' })
  .group('Cluster: Speichern', [updatesAufteilen, problemeAktualisieren], { description: 'Zuordnung und präzisierte Felder in reddit_problems schreiben' })
  .group('Cluster: Cluster speichern', [clusterAufteilen, clusterSpeichern], { description: 'Neue und aktualisierte Problemcluster in reddit_clusters schreiben' });
