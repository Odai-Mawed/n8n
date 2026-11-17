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
  config: { name: 'Einstellungen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:d_einstellungen.js__" }, position: [220, 100] },
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
  config: { name: 'Kandidaten wählen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:d_kandidaten.js__" }, position: [880, 100] },
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
  config: { name: 'Struktur: Suchbegriffe', parameters: { schemaType: 'manual', inputSchema: "__TXT:s3_suchbegriffe.json__" }, position: [1420, -80] },
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
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "__TXT:p3_suchbegriffe.md__" }] },
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
  config: { name: 'Suchanfragen bilden', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:d_suchanfragen.js__" }, position: [1540, -280] },
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
  config: { name: 'Suchtreffer bündeln', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:d_treffer.js__" }, position: [1980, -280] },
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
  config: { name: 'Struktur: Bewertung', parameters: { schemaType: 'manual', inputSchema: "__TXT:s4_opportunity.json__" }, position: [2300, -80] },
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
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "__TXT:p4_opportunity.md__" }] },
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
  config: { name: 'Score berechnen & Report bauen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:d_score_report.js__" }, position: [2480, -280] },
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
