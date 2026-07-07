---
name: appwrite-schema-changes
description: Schema-Änderungen an den Appwrite-Collections sicher durchführen — drei Code-Stellen, MariaDB-Zeilenlimit/TEXT-Trick, Rollout-Reihenfolge. Immer nutzen, wenn ein Feld oder eine Collection dazukommt oder sich ändert.
---

# Appwrite: Schema sicher ändern

## Drei Stellen pro Feld

1. `src/lib/types.ts` — Interface erweitern.
2. `scripts/setup-appwrite.mjs` — Attribut in der COLLECTIONS-Definition
   ergänzen (**immer optional/`false`**, sonst brechen Bestandsdokumente).
3. `src/lib/appwrite-documents.ts` → `restoreNullableFields` — Default per
   `??=` setzen (gilt für Laden UND Realtime-Events).

Zusätzlich alle Konstruktions-Stellen (Orchestrator: createBlank*/accept*)
mit dem neuen Feld befüllen — TypeScript findet sie.

## Rollout-Reihenfolge (wichtig!)

`toAppwriteData` strippt nur `null` vor dem Schreiben. Nicht-null-Defaults
(`""`, `[]`, `false`) werden mitgesendet und scheitern vor dem Script-Lauf mit
**„Invalid document structure: Unknown attribute"** (sichtbar im Sync-Banner,
per „Verwerfen" überspringbar). Deshalb: Script-Lauf ist Teil des Rollouts —
den Nutzer explizit darauf hinweisen. Das Script ist idempotent (ergänzt nur
Fehlendes, löscht nie); Windows-Aufruf: `node scripts/setup-appwrite.mjs
--key=<api-key>` (die `VAR=x cmd`-Syntax funktioniert in PowerShell nicht).

## MariaDB-Zeilenlimit (~64 KB) — am 2026-07-07 live gelernt

- String-Attribute **< 16384 Zeichen** werden als VARCHAR gespeichert:
  **4 Bytes pro Zeichen** zählen gegen das Zeilenlimit der Collection.
  `content` (8192) + `enhanced` (8192) = 64 KB → „The maximum number or size
  of attributes … has been reached".
- String-Attribute **≥ 16384 Zeichen** werden als TEXT-Spalte gespeichert und
  zählen praktisch nicht. Große Textfelder daher bewusst groß deklarieren
  (z. B. 20000) — kontraintuitiv, aber korrekt.
- Array-Attribute werden als JSON/TEXT gespeichert (zeilen-billig).

## Sonstiges

- App-Key und Collection-ID dürfen abweichen: `notes` → historische ID
  `rawNotes` (Mapping in `src/lib/appwrite-config.ts`).
- Dokument-Rechte setzt die App pro Dokument (`read/update/delete` für den
  Nutzer); Collections haben nur `create("users")` + Document Security.
- Nach Schema-Arbeit: `docs/appwrite-hosting.md` (Schema-Referenz) mitziehen.
