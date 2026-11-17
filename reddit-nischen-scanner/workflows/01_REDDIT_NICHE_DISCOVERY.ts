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
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:a_suchthemen.js__" },
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
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__JS:a_normalisieren.js__" },
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
