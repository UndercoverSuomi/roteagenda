"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Grundverhalten für Modal-Dialoge: initialer Fokus ins Panel, Tab bleibt
// im Dialog gefangen, Escape schließt, und beim Schließen kehrt der Fokus
// zum auslösenden Element zurück. Das Panel-Element braucht tabIndex={-1}.
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const panelRef = useRef<T | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () =>
      [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (element) => element.offsetParent !== null,
      );

    // Erstes Formularfeld bevorzugen (der Schließen-Button steht im DOM davor).
    const fields = panel.querySelectorAll<HTMLElement>(
      "input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
    );
    (fields[0] ?? focusables()[0] ?? panel).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, []);

  return panelRef;
}
