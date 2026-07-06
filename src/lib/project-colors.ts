import type { TaskPriority } from "@/lib/types";

// Gedeckte Palette, die auf Papier-Hell und Dunkel als weiche Tönung funktioniert.
export const PROJECT_COLORS = [
  "#d84b3f", // Rot
  "#2f6d5a", // Tanne
  "#c98a2d", // Ocker
  "#4a6fa5", // Blau
  "#8a4a6f", // Pflaume
  "#3a8a8c", // Petrol
  "#7a8a3a", // Oliv
  "#9a6b4f", // Braun
] as const;

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

export function withAlpha(hex: string | undefined, alpha: number) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
