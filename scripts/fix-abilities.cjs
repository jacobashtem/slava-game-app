const fs = require("fs");

// Polish word boundary: \b doesn't work with ę,ą,ó,ń,ł,ś,ź,ż,ć
// Use lookahead/lookbehind for whitespace/punctuation instead
const B = "(?=[\\s,.:;!=?()\\-—↔×½/]|$)";  // trailing boundary
const b = "(?<=^|[\\s,.:;!=?()\\-—↔×½/])";  // leading boundary

// ===== STEP 1: Reclassify REACTION triggers =====
const offensivePatterns = [
  /Po zadaniu obraż/i,
  /Przy ataku/i,
  /Przed atakiem/i,
  /W walce/i,
  /Po 2\. trafieniu/i,
];

function reclassifyTrigger(ability) {
  if (ability.trigger !== "REACTION") return;
  for (const pat of offensivePatterns) {
    if (pat.test(ability.text)) {
      if (/Przed atakiem|Przy ataku|W walce|Po 2\. trafieniu/i.test(ability.text)) {
        ability.trigger = "ON_ATTACK";
      } else {
        ability.trigger = "ON_DAMAGE_DEALT";
      }
      return;
    }
  }
}

// ===== STEP 2: Strip [TAG] prefixes =====
function stripTags(text) {
  // Remove [TAG ...] prefix, then leading ": " or ":"
  return text.replace(/^\[.*?\]\s*/g, "").replace(/^:\s*/, "").trim();
}

// ===== STEP 3: Apply icon tokens =====
// Build regex replacements with proper Polish boundaries
function r(pattern, replacement) {
  return [new RegExp(pattern, "g"), replacement];
}

const replacements = [
  // Domains
  r(`${b}Demonów${B}`, "{DEMON}"),
  r(`${b}Demonom${B}`, "{DEMON}"),
  r(`${b}Demonami${B}`, "{DEMON}"),
  r(`${b}Demonach${B}`, "{DEMON}"),
  r(`${b}Demona${B}`, "{DEMON}"),
  r(`${b}Demony${B}`, "{DEMON}"),
  r(`${b}Demon${B}`, "{DEMON}"),
  r(`${b}demonów${B}`, "{DEMON}"),
  r(`${b}demonom${B}`, "{DEMON}"),
  r(`${b}demonami${B}`, "{DEMON}"),
  r(`${b}demona${B}`, "{DEMON}"),
  r(`${b}demony${B}`, "{DEMON}"),
  r(`${b}demon${B}`, "{DEMON}"),
  r(`${b}Nieumarłych${B}`, "{UNDEAD}"),
  r(`${b}Nieumarłym${B}`, "{UNDEAD}"),
  r(`${b}Nieumarłymi${B}`, "{UNDEAD}"),
  r(`${b}Nieumarłe${B}`, "{UNDEAD}"),
  r(`${b}Nieumarłego${B}`, "{UNDEAD}"),
  r(`${b}Nieumarli${B}`, "{UNDEAD}"),
  r(`\\(Żywi\\)`, "({ZYVI})"),
  r(`${b}Żywych${B}`, "{ZYVI}"),
  r(`${b}Żywi${B}`, "{ZYVI}"),
  // Człowiek/Ludzie = domena Żywi
  r(`${b}Człowiekiem${B}`, "{ZYVI}"),
  r(`${b}Człowieka${B}`, "{ZYVI}"),
  r(`${b}Człowiek${B}`, "{ZYVI}"),
  r(`${b}Ludźmi${B}`, "{ZYVI}"),
  r(`${b}Ludzi${B}`, "{ZYVI}"),
  r(`${b}Ludzie${B}`, "{ZYVI}"),
  r(`${b}Peruna${B}`, "{PERUN}"),
  r(`${b}Perunem${B}`, "{PERUN}"),
  r(`${b}Perunowi${B}`, "{PERUN}"),
  r(`${b}Perun${B}`, "{PERUN}"),
  // Welesowcy = domena Weles
  r(`${b}Welesowców${B}`, "{WELES}"),
  r(`${b}Welesowcom${B}`, "{WELES}"),
  r(`${b}Welesowcami${B}`, "{WELES}"),
  r(`${b}Welesowca${B}`, "{WELES}"),
  r(`${b}Welesowcy${B}`, "{WELES}"),
  r(`${b}Welesa${B}`, "{WELES}"),
  r(`${b}Welesem${B}`, "{WELES}"),
  r(`${b}Welesowi${B}`, "{WELES}"),
  r(`${b}Weles${B}`, "{WELES}"),

  // Attack types
  r(`${b}Wręcz${B}`, "{MELEE}"),
  r(`${b}Żywiołem${B}`, "{ELEMENTAL}"),
  r(`${b}Żywiołu${B}`, "{ELEMENTAL}"),
  r(`${b}Żywioł${B}`, "{ELEMENTAL}"),
  r(`${b}Magią${B}`, "{MAGIC}"),
  r(`${b}Magię${B}`, "{MAGIC}"),
  r(`${b}Magii${B}`, "{MAGIC}"),
  r(`${b}Magia${B}`, "{MAGIC}"),
  r(`${b}Magików${B}`, "{MAGIC}"),
  r(`${b}Dystansowy${B}`, "{RANGED}"),
  r(`${b}Dystansem${B}`, "{RANGED}"),
  r(`${b}Dystans${B}`, "{RANGED}"),

  // Stats — longer forms first
  r(`${b}Atakiem${B}`, "{ATK}"),
  r(`${b}Atakowi${B}`, "{ATK}"),
  r(`${b}Ataków${B}`, "{ATK}"),
  r(`${b}Ataku${B}`, "{ATK}"),
  r(`${b}Ataki${B}`, "{ATK}"),
  r(`${b}Atak${B}`, "{ATK}"),
  r(`${b}atakiem${B}`, "{ATK}"),
  r(`${b}ataków${B}`, "{ATK}"),
  r(`${b}ataku${B}`, "{ATK}"),
  r(`${b}ataki${B}`, "{ATK}"),
  r(`${b}atak${B}`, "{ATK}"),
  r(`ATAK${B}`, "{ATK}"),
  r(`${b}Obronę${B}`, "{DEF}"),
  r(`${b}Obrony${B}`, "{DEF}"),
  r(`${b}Obronie${B}`, "{DEF}"),
  r(`${b}Obroną${B}`, "{DEF}"),
  r(`${b}Obrona${B}`, "{DEF}"),
  r(`${b}Obronę${B}`, "{DEF}"),
  r(`${b}obronę${B}`, "{DEF}"),
  r(`${b}obrony${B}`, "{DEF}"),
  r(`${b}obronie${B}`, "{DEF}"),
  r(`${b}obroną${B}`, "{DEF}"),
  r(`${b}obrona${B}`, "{DEF}"),
  r(`${b}obrażeniami${B}`, "{DMG}"),
  r(`${b}obrażeniom${B}`, "{DMG}"),
  r(`${b}obrażenia${B}`, "{DMG}"),
  r(`${b}obrażeń${B}`, "{DMG}"),
  r(`${b}Obrażeniami${B}`, "{DMG}"),
  r(`${b}Obrażeniom${B}`, "{DMG}"),
  r(`${b}Obrażenia${B}`, "{DMG}"),
  r(`${b}Obrażeń${B}`, "{DMG}"),

  // Flying
  r(`${b}latające${B}`, "{FLY}"),
  r(`${b}latających${B}`, "{FLY}"),
  r(`${b}latającego${B}`, "{FLY}"),
  r(`${b}latającym${B}`, "{FLY}"),
  r(`${b}latający${B}`, "{FLY}"),
  r(`${b}latającymi${B}`, "{FLY}"),
  r(`${b}Lot${B}`, "{FLY}"),

  // Gold
  [/(\d+)\s*PS\b/g, "$1 {GOLD}"],
  [/(\d+)\s*ZŁ\b/g, "$1 {GOLD}"],
  r(`${b}PS${B}`, "{GOLD}"),

  // Mechanics
  r(`${b}Truciznę${B}`, "{POISON}"),
  r(`${b}Trucizny${B}`, "{POISON}"),
  r(`${b}Trucizna${B}`, "{POISON}"),
  r(`${b}Truciznę${B}`, "{POISON}"),
  r(`${b}Trucizną${B}`, "{POISON}"),
  r(`${b}Truciźnie${B}`, "{POISON}"),
  r(`${b}Uciszony${B}`, "{SILENCE}"),
  r(`${b}Uciszenie${B}`, "{SILENCE}"),
  r(`${b}Uciszona${B}`, "{SILENCE}"),
  r(`${b}Ucisza${B}`, "{SILENCE}"),

  // Pozycja
  r(`Pozycję ${b}Ataku${B}`, "Pozycję {ATK}"),
  r(`Pozycji ${b}Ataku${B}`, "Pozycji {ATK}"),
  r(`Pozycję ${b}Obrony${B}`, "Pozycję {DEF}"),
  r(`Pozycji ${b}Obrony${B}`, "Pozycji {DEF}"),
];

function applyTokens(text) {
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double tokens like {ATK}{ATK}
  result = result.replace(/\{ATK\}\{ATK\}/g, "{ATK}");
  return result;
}

// ===== PROCESS =====
const f1 = "./data/Slava_Vol2_Istoty.json";
const d1 = JSON.parse(fs.readFileSync(f1, "utf8"));
let triggerChanges = 0, tagStrips = 0, tokenChanges = 0;

d1.forEach(c => {
  if (!c.abilities) return;
  c.abilities.forEach(a => {
    const oldTrigger = a.trigger;
    reclassifyTrigger(a);
    if (a.trigger !== oldTrigger) triggerChanges++;

    const stripped = stripTags(a.text);
    if (stripped !== a.text) { tagStrips++; a.text = stripped; }

    const tokenized = applyTokens(a.text);
    if (tokenized !== a.text) { tokenChanges++; a.text = tokenized; }
  });
});
fs.writeFileSync(f1, JSON.stringify(d1, null, 4), "utf8");

const f2 = "./data/Slava_Vol2_KartyPrzygody.json";
const d2 = JSON.parse(fs.readFileSync(f2, "utf8"));
let tagStrips2 = 0, tokenChanges2 = 0;

d2.forEach(c => {
  if (!c.abilities) return;
  c.abilities.forEach(a => {
    const stripped = stripTags(a.text);
    if (stripped !== a.text) { tagStrips2++; a.text = stripped; }
    const tokenized = applyTokens(a.text);
    if (tokenized !== a.text) { tokenChanges2++; a.text = tokenized; }
  });
});
fs.writeFileSync(f2, JSON.stringify(d2, null, 4), "utf8");

console.log("=== Creatures ===");
console.log(`  Triggers reclassified: ${triggerChanges}`);
console.log(`  Tags stripped: ${tagStrips}`);
console.log(`  Abilities tokenized: ${tokenChanges}`);
console.log("\n=== Adventures ===");
console.log(`  Tags stripped: ${tagStrips2}`);
console.log(`  Abilities tokenized: ${tokenChanges2}`);

// Show ALL tokenized abilities
console.log("\n=== All tokenized creature abilities ===");
d1.forEach(c => {
  if (!c.abilities) return;
  c.abilities.forEach(a => {
    if (a.text.includes("{")) {
      console.log(`  [${a.trigger}] ${c.name}: ${a.text}`);
    }
  });
});

console.log("\n=== All tokenized adventure abilities ===");
d2.forEach(c => {
  if (!c.abilities) return;
  c.abilities.forEach(a => {
    if (a.text.includes("{")) {
      console.log(`  [${a.trigger}] ${c.name}: ${a.text}`);
    }
  });
});

// Check for broken tokens (partial matches)
console.log("\n=== Potential issues ===");
const allTexts = [...d1, ...d2].flatMap(c => (c.abilities || []).map(a => a.text));
const issues = allTexts.filter(t =>
  /\{[A-Z]+\}[a-ząęóśłżźćń]/i.test(t) ||  // token followed by Polish char
  /[a-ząęóśłżźćń]\{[A-Z]+\}/i.test(t)       // Polish char before token
);
if (issues.length) {
  issues.forEach(t => console.log("  ISSUE:", t));
} else {
  console.log("  No broken tokens found!");
}
