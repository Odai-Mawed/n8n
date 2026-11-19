// ===== EINSTELLUNGEN – Workflow A (Nischen-Discovery) =====
const cfg = {
  kategorienProLauf: 6,      // so viele Kategorien werden pro Lauf durchsucht (rotierend)
  ergebnisseProSuche: 25,
  userAgent: 'n8n:reddit-nischen-scanner:1.0 (by /u/DEIN_REDDIT_NAME)',
};

// Breite Nischen-Taxonomie: Kategorie -> englische Suchwörter
const taxonomie = [
  ['Imkerei', ['beekeeping', 'apiary', 'honey production']],
  ['Handwerk', ['woodworking', 'carpentry', 'cabinetmaking']],
  ['Elektro & Installation', ['electricians', 'hvac', 'plumbing']],
  ['Landwirtschaft', ['farming', 'homestead', 'agriculture']],
  ['Viehhaltung', ['livestock', 'backyard chickens', 'goats']],
  ['Haustierhaltung', ['dog training', 'cat care', 'reptile keeping']],
  ['Pferde', ['equestrian', 'horse care', 'farrier']],
  ['Aquaristik', ['aquarium', 'reef tank', 'aquascaping']],
  ['Sportvereine', ['youth coaching', 'sports club management', 'referee']],
  ['Fotografie', ['wedding photography', 'photography business', 'photo editing']],
  ['Videoproduktion', ['videography', 'film production', 'video editing business']],
  ['3D-Druck', ['3d printing', 'print farm', 'resin printing']],
  ['CNC & Maker', ['cnc machining', 'laser engraving', 'maker space']],
  ['Veranstaltungstechnik', ['live sound', 'stage lighting', 'event production']],
  ['Eventplanung', ['wedding planning', 'event planning', 'catering business']],
  ['Fahrzeugpflege', ['auto detailing', 'car wash business', 'paint correction']],
  ['Kfz-Werkstatt', ['mechanic', 'auto repair shop', 'diesel mechanics']],
  ['Gastronomie', ['restaurant owners', 'kitchen confidential', 'food truck']],
  ['Bäckerei & Konditorei', ['baking business', 'cake decorating', 'cottage food']],
  ['Musikunterricht', ['music teachers', 'piano teaching', 'guitar lessons']],
  ['Tonstudio', ['audio engineering', 'home recording', 'mixing mastering']],
  ['Textilhandwerk', ['sewing', 'quilting', 'embroidery business']],
  ['Strick & Häkel', ['knitting', 'crochet', 'yarn dyeing']],
  ['Gartenbau', ['landscaping business', 'lawn care', 'arborist']],
  ['Gewächshaus & Pflanzen', ['greenhouse', 'plant nursery', 'hydroponics']],
  ['Vermietung', ['landlords', 'property management', 'airbnb hosts']],
  ['Bootssport', ['sailing', 'boat maintenance', 'kayak fishing']],
  ['Angeln & Jagd', ['fly fishing', 'hunting', 'taxidermy']],
  ['Sammler-Hobbys', ['coin collecting', 'trading card shop', 'vinyl collecting']],
  ['Antiquitäten & Reselling', ['antique dealers', 'flipping', 'estate sales']],
  ['Kleine Dienstleister', ['cleaning business', 'pressure washing', 'handyman']],
  ['Werkstätten', ['small engine repair', 'bike mechanic', 'welding']],
  ['Pflege & Gesundheit', ['physical therapy', 'dental office', 'home care agency']],
  ['Beauty', ['hairstylist', 'nail technician', 'esthetician']],
  ['Fitness-Trainer', ['personal trainer', 'yoga teachers', 'gym owners']],
  ['Nachhilfe & Bildung', ['tutoring business', 'homeschooling', 'teachers']],
  ['Kinderbetreuung', ['daycare', 'nanny', 'childcare providers']],
  ['Logistik & Fahrer', ['truckers', 'courier', 'moving company']],
  ['Bau & Renovierung', ['general contractor', 'roofing', 'drywall']],
  ['Kunsthandwerk & Etsy', ['etsy sellers', 'candle making', 'pottery']],
  ['Schmuck', ['jewelry making', 'silversmith', 'watch repair']],
  ['Brauen & Getränke', ['homebrewing', 'winemaking', 'coffee roasting']],
  ['Modellbau & Tabletop', ['miniature painting', 'model railroad', 'wargaming']],
  ['Brettspiele & Spieleläden', ['board game cafe', 'game store owners', 'tabletop rpg gm']],
  ['Tierarztpraxis', ['veterinary', 'vet techs', 'dog grooming']],
  ['Bestattung & Nischenberufe', ['funeral directors', 'locksmith', 'pest control']],
  ['Druck & Werbetechnik', ['screen printing', 'sign making', 'vinyl cutting']],
  ['Dronen & Vermessung', ['drone pilots', 'land surveying', 'gis']],
];

// Rotation: jede Discovery-Runde (2x pro Woche) nimmt die nächsten Kategorien
const jetzt = new Date();
const runde = Math.floor(jetzt.getTime() / (3.5 * 864e5));
const start = (runde * cfg.kategorienProLauf) % taxonomie.length;
const out = [];
for (let i = 0; i < cfg.kategorienProLauf; i++) {
  const [nische, woerter] = taxonomie[(start + i) % taxonomie.length];
  // Arctic Shift sucht nach Subreddit-Namen (Präfix): 'dog training' -> 'dogtraining'
  const praefixe = new Set(woerter.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')));
  for (const q of praefixe) out.push({ json: { modus: 'search', q, nische, limit: cfg.ergebnisseProSuche, userAgent: cfg.userAgent } });
}
return out;
