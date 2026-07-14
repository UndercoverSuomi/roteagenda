import type { TaskPriority } from "./types.ts";

// Gedeckte Palette, die auf Papier-Hell und Dunkel als weiche Tönung
// funktioniert — organisiert als Familien entlang des Farbkreises:
// Töne einer Familie gehören zusammen, benachbarte Familien sind sich
// ähnlich (Rot ↔ Terrakotta), weit entfernte klar unterscheidbar.
// Die acht ursprünglichen Farben bleiben als Anker ihrer Familie erhalten.
export const PROJECT_COLOR_FAMILIES: readonly (readonly string[])[] = [
  ["#d84b3f", "#b03a30", "#e07a63"], // Rot
  ["#cd6a33", "#a85528", "#e08b52"], // Terrakotta
  ["#c98a2d", "#a06e24", "#d9a852"], // Ocker
  ["#7a8a3a", "#5f6e2c", "#96a558"], // Oliv
  ["#2f6d5a", "#245445", "#4d8a74"], // Tanne
  ["#3a8a8c", "#2c6b6d", "#5aa6a8"], // Petrol
  ["#4a6fa5", "#385580", "#6c8fc0"], // Blau
  ["#5f5a9e", "#4a4680", "#7f7ab8"], // Indigo
  ["#8a4a6f", "#6d3a58", "#a86a8e"], // Pflaume
  ["#b85560", "#934450", "#cf7a82"], // Rosé
  ["#9a6b4f", "#7a5540", "#b3876a"], // Braun
  ["#6e7b86", "#56616a", "#8b97a1"], // Schiefer
];

export const PROJECT_COLORS: readonly string[] = PROJECT_COLOR_FAMILIES.flat();

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: "#d84b3f",
  medium: "#c98a2d",
  low: "#8a8174",
};

export function pickProjectColor(index: number) {
  return PROJECT_COLORS[Math.abs(index) % PROJECT_COLORS.length];
}

// Stabile Standardfarbe für Projekte, die noch keine gespeicherte Farbe haben.
export function colorForId(id: string) {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return pickProjectColor(hash);
}

function familyIndexOfColor(color: string): number {
  const needle = color.toLowerCase();
  return PROJECT_COLOR_FAMILIES.findIndex((family) =>
    family.some((tone) => tone.toLowerCase() === needle),
  );
}

// Zyklische Distanz zweier Familien auf dem Farbkreis.
function familyDistance(a: number, b: number): number {
  const count = PROJECT_COLOR_FAMILIES.length;
  const direct = Math.abs(a - b);
  return Math.min(direct, count - direct);
}

// Wählt die Farbe für ein neues Projekt:
// - Mit relatedColors (Farben thematisch verwandter Projekte) beginnt
//   die Suche in deren Familie und wandert dann zu den Nachbarfamilien —
//   so bekommen z. B. zwei Coding-Projekte Rot und Terrakotta.
// - Ohne Verwandte gewinnt die am wenigsten genutzte Familie mit dem
//   größten Abstand zu den bereits belegten — maximal unterscheidbar.
// Innerhalb einer Familie wird immer der erste noch freie Ton genommen.
export function pickRelatedProjectColor(
  existingColors: string[],
  relatedColors: string[] = [],
): string {
  const usedTones = new Set(existingColors.map((color) => color.toLowerCase()));
  const usagePerFamily = PROJECT_COLOR_FAMILIES.map(() => 0);
  for (const color of existingColors) {
    const family = familyIndexOfColor(color);
    if (family !== -1) usagePerFamily[family] += 1;
  }

  const relatedFamilies = Array.from(
    new Set(
      relatedColors
        .map((color) => familyIndexOfColor(color))
        .filter((family) => family !== -1),
    ),
  );

  let searchOrder: number[];
  if (relatedFamilies.length) {
    // Von der Verwandten-Familie aus in wachsender Farbkreis-Distanz suchen.
    const start = relatedFamilies[0];
    searchOrder = PROJECT_COLOR_FAMILIES.map((_, family) => family).sort((a, b) => {
      const byDistance = familyDistance(a, start) - familyDistance(b, start);
      if (byDistance !== 0) return byDistance;
      return a - b;
    });
  } else {
    const usedFamilies = usagePerFamily.flatMap((count, family) =>
      count > 0 ? [family] : [],
    );
    const minDistanceToUsed = (family: number) =>
      usedFamilies.length
        ? Math.min(...usedFamilies.map((used) => familyDistance(family, used)))
        : PROJECT_COLOR_FAMILIES.length;
    searchOrder = PROJECT_COLOR_FAMILIES.map((_, family) => family).sort((a, b) => {
      const byUsage = usagePerFamily[a] - usagePerFamily[b];
      if (byUsage !== 0) return byUsage;
      const byDistance = minDistanceToUsed(b) - minDistanceToUsed(a);
      if (byDistance !== 0) return byDistance;
      return a - b;
    });
  }

  for (const family of searchOrder) {
    const free = PROJECT_COLOR_FAMILIES[family].find(
      (tone) => !usedTones.has(tone.toLowerCase()),
    );
    if (free) return free;
  }

  // Alle 36 Töne belegt: rotierend in der Startfamilie weiterverteilen.
  const fallbackFamily = searchOrder[0] ?? 0;
  const tones = PROJECT_COLOR_FAMILIES[fallbackFamily];
  return tones[usagePerFamily[fallbackFamily] % tones.length];
}

export function withAlpha(hex: string | undefined, alpha: number) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
