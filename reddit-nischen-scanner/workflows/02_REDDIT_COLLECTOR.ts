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
  config: { name: 'Posts älter als 48 h', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:b_aufraeumen.js__" }, position: [480, -100] },
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
  config: { name: 'Communities auswählen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:b_auswahl.js__" }, position: [720, 200] },
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
  config: { name: 'Posts normalisieren', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:b_posts.js__" }, position: [1200, 200] },
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
