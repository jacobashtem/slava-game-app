const fs = require("fs");

const replacements = [
  // Domains (Demony = Weles/Undead faction)
  [/\bDemon(y|ów|om|ami|ach|a)?\b/g, "{DEMON}"],
  [/\bNieumarł(ych|ym|ymi|e|ego)\b/g, "{UNDEAD}"],
  [/\b\(Żywi\)/g, "({ZYVI})"],
  [/\bŻywi(ch)?\b/g, "{ZYVI}"],
  [/\bPerun(a|em|owi)?\b/g, "{PERUN}"],
  [/\bWeles(a|em|owi)?\b/g, "{WELES}"],
  // Attack types
  [/\bWręcz\b/g, "{MELEE}"],
  [/\bŻywioł(em|u)?\b/g, "{ELEMENTAL}"],
  [/\bMagi(ę|ą|i|a|ków)?\b/g, "{MAGIC}"],
  [/\bMagowie\b/g, "{MAGIC}owie"],
  [/\bDystans\b/g, "{RANGED}"],
  // Stats
  [/\bAtak(u|iem|owi|i|ów)?\b/g, "{ATK}"],
  [/\bObron(y|ę|ie|ą|a|ę)?\b/g, "{DEF}"],
  [/\bobraż(enia|eń|eniom|eniami)?\b/g, "{DMG}"],
  [/\bLot\b/g, "{FLY}"],
  [/\blatając(e|ych|ego|ym|y|ymi)?\b/g, "{FLY}"],
  // Resources
  [/(\d+)\s*PS\b/g, "$1 {GOLD}"],
  [/(\d+)\s*ZŁ\b/g, "$1 {GOLD}"],
  // Mechanics
  [/\bTrucizn(ę|y|a|ą|ie)?\b/g, "{POISON}"],
  [/\bUcisz(ony|enie|ona|a)?\b/g, "{SILENCE}"],
];

function applyTokens(text) {
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// Process creatures
const f1 = "./data/Slava_Vol2_Istoty.json";
const d1 = JSON.parse(fs.readFileSync(f1, "utf8"));
let changed1 = 0;
d1.forEach(c => {
  if (c.abilities) c.abilities.forEach(a => {
    const newText = applyTokens(a.text);
    if (newText !== a.text) { changed1++; a.text = newText; }
  });
});
fs.writeFileSync(f1, JSON.stringify(d1, null, 4), "utf8");

// Process adventures
const f2 = "./data/Slava_Vol2_KartyPrzygody.json";
const d2 = JSON.parse(fs.readFileSync(f2, "utf8"));
let changed2 = 0;
d2.forEach(c => {
  if (c.abilities) c.abilities.forEach(a => {
    const newText = applyTokens(a.text);
    if (newText !== a.text) { changed2++; a.text = newText; }
  });
});
fs.writeFileSync(f2, JSON.stringify(d2, null, 4), "utf8");

console.log(`Creatures: ${changed1} abilities tokenized`);
console.log(`Adventures: ${changed2} abilities tokenized`);

// Show samples
d1.slice(0, 8).forEach(c => {
  if (c.abilities) c.abilities.forEach(a => {
    if (a.text.includes("{")) console.log(`  ${c.name}: ${a.text.substring(0, 90)}`);
  });
});
