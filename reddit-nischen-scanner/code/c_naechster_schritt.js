// Nächste Runde: weiter analysieren oder zur Clusterbildung wechseln
const cfg = $('Einstellungen').first().json;
const erg = $('Ergebnisse auswerten').first().json;
const naechsteRunde = cfg.runde + 1;
const budgetErreicht = naechsteRunde >= cfg.maxRundenProTag;
// Schlagen alle KI-Batches fehl (z. B. ungültiger OpenAI-Key), nicht weiter im Kreis laufen
const allesFehlgeschlagen = erg.fehlerBatches > 0 && erg.analysiert.length === 0;
const phase = erg.weitere && !budgetErreicht && !allesFehlgeschlagen ? 'analyse' : 'cluster';
if (allesFehlgeschlagen) throw new Error('Alle KI-Batches dieser Runde fehlgeschlagen (OpenAI-Zugang oder Antwortformat prüfen). Die Posts bleiben unanalysiert und werden beim nächsten Lauf erneut versucht.');
return [{ json: { phase, runde: phase === 'analyse' ? naechsteRunde : 0, budgetErreicht } }];
