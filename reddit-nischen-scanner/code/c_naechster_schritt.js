// Nächste Runde: weiter analysieren oder zur Clusterbildung wechseln
const cfg = $('Einstellungen').first().json;
const erg = $('Ergebnisse auswerten').first().json;
const naechsteRunde = cfg.runde + 1;
const budgetErreicht = naechsteRunde >= cfg.maxRundenProTag;
const phase = erg.weitere && !budgetErreicht ? 'analyse' : 'cluster';
return [{ json: { phase, runde: phase === 'analyse' ? naechsteRunde : 0, budgetErreicht } }];
