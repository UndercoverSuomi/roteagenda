---
name: browser-eval-testing
description: React-Web-Apps ohne Testframework per JavaScript-Eval im (Preview-)Browser end-to-end verifizieren — kontrollierte Inputs, Datei-Injektion, Async-Polling, Aufräum-Disziplin. Projekt-unabhängig einsetzbar.
---

# Browser-E2E per Konsolen-Eval (React)

## Eingaben, die React wirklich sieht

`el.value = "…"` feuert keine React-Updates. Immer den nativen Setter nutzen
und dann ein bubbelndes Event dispatchen:

```js
const setVal = (el, v) => {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement
              : el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, v);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
};
```

## Datei-Uploads ohne Dateisystem

Testbild im Canvas erzeugen und in den `<input type=file>` injizieren:

```js
const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
const dt = new DataTransfer();
dt.items.add(new File([blob], "test.png", { type: "image/png" }));
input.files = dt.files;
input.dispatchEvent(new Event("change", { bubbles: true }));
```

## Weitere Regeln

- **Auf Async pollen statt schlafen**: Schleife mit kurzem `setTimeout`, die
  auf den Zieltext/-zustand prüft und bei Fehlertexten abbricht — KI-/Netz-
  Antworten dauern variabel (Sekunden bis >30 s).
- **innerText ist CSS-transformiert** (`uppercase` → "ORIGINAL" statt
  "Original"): case-insensitiv matchen oder beide Varianten prüfen.
- **Zeitfenster beachten**: Toasts/Undo-Banner (typisch ~7 s) im selben Eval
  prüfen UND klicken — zwischen zwei Tool-Aufrufen sind sie weg.
- **Selektoren**: `:has-text()` u. Ä. sind Playwright-Syntax, kein CSS.
  Stattdessen `[...document.querySelectorAll("button")].find(b =>
  b.textContent.includes("…"))`.
- **Routing testen**: `history.back()` aufrufen und `location.search` plus
  sichtbaren Inhalt prüfen; Deep-Links via `location.reload()` verifizieren.
- **Direkt assertierbar**: `localStorage`, `caches.keys()/match()`,
  `navigator.serviceWorker.getRegistrations()` — oft aussagekräftiger als
  Screenshots.
- **Grenzen kennen**: Der App-Code (SDK-Module) ist aus dem Eval nicht
  erreichbar; gebundelte SDKs halten teils eigene `fetch`-Referenzen, ein
  `window.fetch`-Patch greift dann nicht.
- **Aufräumen gehört zum Test**: angelegte Daten löschen, abmelden, nach
  Prod-Tests Service Worker deregistrieren und Caches leeren.
