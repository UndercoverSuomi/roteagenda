"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDialog } from "@/components/ui/use-dialog";
import { storage } from "@/lib/appwrite";
import { APPWRITE_MEDIA_BUCKET_ID } from "@/lib/appwrite-config";
import type { Translator } from "@/lib/i18n";

// Lädt das angehängte Foto als Blob — die Cookie-Session autorisiert den
// Abruf (ein nacktes <img src> hätte bei blockierten Drittanbieter-Cookies
// keine Berechtigung). Klick öffnet die Großansicht als Dialog.
export function NoteImage({ fileId, t }: { fileId: string; t: Translator }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;

    async function load() {
      try {
        // getFileView statt getFilePreview: Bild-Transformationen sind im
        // Appwrite-Free-Plan gesperrt (403); die Uploads sind ohnehin schon
        // clientseitig auf ≤1600 px komprimiert.
        const viewUrl = storage.getFileView({
          bucketId: APPWRITE_MEDIA_BUCKET_ID,
          fileId,
        });
        const response = await fetch(viewUrl.toString(), { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setUrl(objectUrl);
      } catch {
        if (active) setFailed(true);
      }
    }
    void load();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  // Datei nicht mehr vorhanden (z. B. nach Undo einer Löschung):
  // die Notiz bleibt ohne Bild nutzbar, kein Fehlerkasten nötig.
  if (failed) return null;

  if (!url) {
    return (
      <div className="mt-4 h-40 animate-pulse rounded-[8px] border border-[var(--line)] bg-[var(--surface-strong)]" />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("note.photoOpen")}
        className="mt-4 block w-full overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)] transition hover:opacity-90"
      >
        {/* Blob-Object-URL — der Next-Image-Optimizer kann damit nichts anfangen. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={t("note.photoAlt")}
          className="max-h-[320px] w-full object-contain"
        />
      </button>

      {open ? <Lightbox url={url} alt={t("note.photoAlt")} t={t} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Lightbox({
  url,
  alt,
  t,
  onClose,
}: {
  url: string;
  alt: string;
  t: Translator;
  onClose: () => void;
}) {
  const panelRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        tabIndex={-1}
        className="relative outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="max-h-[88vh] max-w-[92vw] rounded-[8px] shadow-2xl"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute -right-2 -top-2 grid h-9 w-9 place-items-center rounded-full bg-[var(--paper-soft)] text-[var(--ink)] shadow-lg"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
