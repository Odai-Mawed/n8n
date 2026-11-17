# Reddit Nischen-Scanner (n8n)

KI-gestützte Problem-Discovery-Engine: findet versteckte Probleme in ungewöhnlichen Reddit-Communities, gruppiert ähnliche Probleme zu Clustern, prüft sie mit unabhängigen Belegen nach und meldet täglich die besten Geschäftsideen per Telegram.

## Workflows (n8n-Ordner „Reddit Nischen-Scanner“)

| Workflow | Zeitplan | Aufgabe |
| --- | --- | --- |
| `01_REDDIT_NICHE_DISCOVERY` | Di & Fr 05:00 | Rotierende Nischen-Taxonomie (48 Kategorien) → `/subreddits/search` + `/subreddits/new` → neue Communities als `explore` |
| `02_REDDIT_COLLECTOR` | täglich 06:00 | 32 bewährte + 8 experimentelle Communities, je 25 neueste Posts, 36-h-Fenster, keine Popularitätsfilter, 48-h-Puffer; startet 03 |
| `03_PROBLEM_INTELLIGENCE` | von 02 gestartet | **Analyse** in Runden (4 Batches × 18 Posts pro Ausführung, max. 15 Runden/Tag) → **Cluster**: bis 20 Kommentar-Threads vertiefen, KI ordnet Probleme bestehenden/neuen Clustern zu |
| `04_OPPORTUNITY_RANKING` | täglich 09:00 | bis 10 Cluster per Reddit-Suche nachprüfen, Idee + 6 Bewertungen, Score + Evidenzklasse, Top 5 per Telegram |

## Abweichungen von der Architektur-Vorlage

- **Speicher: n8n Data Tables statt PostgreSQL.** Tabellen: `reddit_communities`, `reddit_posts_buffer`, `reddit_problems` (Probleme + Evidenz-Links, `source` = `scan` / `verifikation`), `reddit_clusters`.
- **Clustering ohne PGVector:** Das Cluster-Modell bekommt die bis zu 200 zuletzt aktiven Cluster als kompakte Liste und entscheidet „bestehend“ oder „neu“. Bei sehr vielen Clustern später auf Embeddings umstellen.
- **Runden statt eines langen Laufs:** wegen des Laufzeitlimits startet sich 03 selbst neu. Das Tagesbudget (`maxRundenProTag`) ist das KI-Kostenlimit; Reste werden am nächsten Tag zuerst analysiert.
- **Report per Code statt LLM:** Der Telegram-Report wird deterministisch aus den strukturierten Daten gebaut, damit keine Quellen erfunden werden.
- **Nachfrage-Deckel:** Die KI-Bewertung „wiederholte Nachfrage“ wird auf die tatsächliche Zahl unabhängiger Posts begrenzt. Bestätigte Suchtreffer zählen nur, wenn ihre ID wirklich in den Suchergebnissen vorkam.

## Bewertung

Score = Σ (Bewertung / 5 × Gewicht), Gewichte 25/20/20/15/10/10.
Evidenzklasse: **A** ≥ 5 unabhängige Diskussionen (≥ 2 Communities oder ≥ 30 Tage Spanne), **B** ≥ 3, **C** sonst.
Top 5 nur ab 75 Punkten **und** Klasse ≥ B; zusätzlich höchstens eine als „nicht validiert“ markierte Ausnahme.

## Inbetriebnahme

1. Reddit-API-Zugang genehmigen lassen (für kommerzielle Nutzung ist eine schriftliche Freigabe nötig) und in n8n ein Credential **Reddit OAuth2** anlegen. Es in den HTTP-Nodes aller vier Workflows auswählen.
2. In den Einstellungs-Nodes (`Suchthemen wählen`, `Communities auswählen`, `Einstellungen` in 03/04) den `userAgent` auf deinen Reddit-Namen setzen.
3. `01` einmal manuell starten → Pool füllt sich.
4. Zum Start in `02 › Communities auswählen` z. B. 10 + 5 Communities einstellen, `02` manuell starten und die Ergebnisse in `reddit_problems` prüfen.
5. Danach 32 + 8 einstellen und alle vier Workflows aktivieren.
6. Nach 7 Tagen auswerten: qualifizierte Probleme pro 100 Posts, Fehlerquote, Kosten pro brauchbarem Cluster, Anteil Ideen, die manuell interessant bleiben.

## Dateien

- `workflows/*.ts`: n8n-Workflow-SDK-Quellen mit Platzhaltern `"__JS:…__"` / `"__TXT:…__"`
- `code/*.js`: Code-Nodes · `prompts/*.md`: System-Prompts · `prompts/*.json`: Output-Schemas
- `python3 build.py` → `build/*.ts` (vollständige SDK-Dateien wie in n8n eingespielt)
