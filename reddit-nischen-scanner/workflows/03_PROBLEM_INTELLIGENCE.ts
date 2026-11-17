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
  config: { name: 'Einstellungen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:c_einstellungen.js__" }, position: [220, 400] },
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
  config: { name: 'Batches bilden', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:c_batches.js__" }, position: [900, 200] },
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
  config: { name: 'Struktur: Probleme', parameters: { schemaType: 'manual', inputSchema: "__TXT:s1_problem_detection.json__" }, position: [1460, 420] },
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
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "__TXT:p1_problem_detection.md__" }] },
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
  config: { name: 'Ergebnisse auswerten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:c_ergebnisse.js__" }, position: [1640, 100] },
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
  config: { name: 'Fundraten berechnen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:c_fundraten.js__" }, position: [2100, 220] },
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
  config: { name: 'Nächster Schritt', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:c_naechster_schritt.js__" }, position: [1880, 400] },
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
  config: { name: 'Kommentar-Kandidaten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:c_kommentar_kandidaten.js__" }, position: [900, 700] },
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
  config: { name: 'Kommentar-Kontext bündeln', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:c_kontext.js__" }, position: [1560, 700] },
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
  config: { name: 'Cluster-Batches bilden', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:c_cluster_batches.js__" }, position: [2220, 700] },
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
  config: { name: 'Struktur: Cluster', parameters: { schemaType: 'manual', inputSchema: "__TXT:s2_cluster_matching.json__" }, position: [2540, 920] },
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
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "__TXT:p2_cluster_matching.md__" }] },
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
  config: { name: 'Cluster anwenden', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:c_cluster_anwenden.js__" }, position: [2720, 700] },
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
