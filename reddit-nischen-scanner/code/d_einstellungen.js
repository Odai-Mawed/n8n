// ===== EINSTELLUNGEN – Workflow D (Opportunity Ranking) =====
return [{ json: {
  telegramChatId: '1347421874',
  minScore: 75,            // ab hier ins Top-5-Ranking (zusätzlich Evidenzklasse >= B)
  topN: 5,
  maxPruefungen: 10,       // tiefere Nachprüfungen (Cluster) pro Tag
  erneutBewertenNachTagen: 3, // Cluster ohne neue Belege erst nach X Tagen erneut bewerten
  quellenProIdee: 5,
  gewichte: { problem: 25, nachfrage: 20, zahlung: 20, erreichbar: 15, mvp: 10, luecke: 10 },
  userAgent: 'n8n:reddit-nischen-scanner:1.0 (by /u/DEIN_REDDIT_NAME)',
} }];
