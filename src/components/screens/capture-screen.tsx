"use client";

import { ArrowLeft, Camera, Loader2, Mic, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/app-helpers";
import { SuggestionCard } from "@/components/ui/suggestion-card";
import { ScreenHeader } from "@/components/ui/primitives";
import { extractPhotoText, transcribeVoiceNote } from "@/lib/ai-client";
import { MAX_NOTE_LENGTH } from "@/lib/ai-models";
import { fileToJpegBase64 } from "@/lib/image";
import {
  blobToWavBase64,
  isRecordingSupported,
  MAX_RECORDING_SECONDS,
  startRecording,
  type ActiveRecording,
} from "@/lib/recorder";
import type { Locale, Translator } from "@/lib/i18n";
import type { AiSuggestion, Project } from "@/lib/types";

export function CaptureScreen({
  captureText,
  suggestions,
  projects,
  editingSuggestionId,
  modelLabel,
  error,
  notice,
  isProcessing,
  locale,
  t,
  onBack,
  onChangeText,
  onAppendText,
  onProcess,
  onAccept,
  onReject,
  onEditSuggestion,
  onUpdateSuggestion,
}: {
  captureText: string;
  suggestions: AiSuggestion[];
  projects: Project[];
  editingSuggestionId: string | null;
  modelLabel: string;
  error: string | null;
  notice: string | null;
  isProcessing: boolean;
  locale: Locale;
  t: Translator;
  onBack: () => void;
  onChangeText: (value: string) => void;
  onAppendText: (value: string) => void;
  onProcess: () => void;
  onAccept: (suggestion: AiSuggestion, createdBy?: "ai" | "user") => void;
  onReject: (suggestionId: string) => void;
  onEditSuggestion: (suggestionId: string | null) => void;
  onUpdateSuggestion: (suggestion: AiSuggestion) => void;
}) {
  const [micState, setMicState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [photoState, setPhotoState] = useState<"idle" | "processing">("idle");
  // Der Capture-Screen wird nie serverseitig gerendert,
  // daher ist die direkte Browser-Erkennung hydration-sicher.
  const [isMicSupported] = useState(() => isRecordingSupported());
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      recordingRef.current?.cancel();
      recordingRef.current = null;
    };
  }, []);

  // Sekundenzähler; stoppt die Aufnahme automatisch am Limit.
  useEffect(() => {
    if (micState !== "recording") return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) {
        void finishRecording();
      }
    }, 500);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micState]);

  async function beginRecording() {
    setMediaError(null);
    setElapsedSeconds(0);

    try {
      const recording = await startRecording();
      recordingRef.current = recording;
      setMicState("recording");
    } catch (recordError) {
      const denied =
        recordError instanceof DOMException &&
        (recordError.name === "NotAllowedError" || recordError.name === "SecurityError");
      setMediaError(t(denied ? "capture.mic.denied" : "capture.mic.error"));
    }
  }

  async function finishRecording() {
    const active = recordingRef.current;
    if (!active) return;
    recordingRef.current = null;
    setMicState("transcribing");

    try {
      const blob = await active.stop();
      const audioBase64 = await blobToWavBase64(blob);
      const text = await transcribeVoiceNote({ audioBase64, locale });
      onAppendText(text);
      setMicState("idle");
    } catch (transcribeError) {
      setMicState("idle");
      setMediaError(
        transcribeError instanceof Error && transcribeError.message
          ? transcribeError.message
          : t("capture.mic.error"),
      );
    }
  }

  function toggleRecording() {
    if (micState === "recording") {
      void finishRecording();
    } else if (micState === "idle") {
      void beginRecording();
    }
  }

  async function handlePhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Dieselbe Datei soll erneut wählbar sein.
    event.target.value = "";
    if (!file) return;

    setMediaError(null);
    setPhotoState("processing");

    try {
      const imageBase64 = await fileToJpegBase64(file);
      const text = await extractPhotoText({ imageBase64, locale });
      onAppendText(text);
      setPhotoState("idle");
    } catch (photoError) {
      setPhotoState("idle");
      setMediaError(
        photoError instanceof Error && photoError.message
          ? photoError.message
          : t("capture.photo.error"),
      );
    }
  }

  function formatSeconds(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  const mediaStatus =
    micState === "recording"
      ? `${t("capture.mic.listening")} (${formatSeconds(elapsedSeconds)} / ${formatSeconds(MAX_RECORDING_SECONDS)})`
      : micState === "transcribing"
        ? t("capture.mic.transcribing")
        : photoState === "processing"
          ? t("capture.photo.processing")
          : isMicSupported
            ? t("capture.mic.start")
            : t("capture.photo.start");

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("capture.title")}
        leftIcon={<ArrowLeft className="h-5 w-5" />}
        leftLabel={t("common.back")}
        onLeft={onBack}
        rightIcon={<Sparkles className="h-5 w-5" />}
      />

      <div className="mt-8 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4">
        <textarea
          value={captureText}
          onChange={(event) => onChangeText(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder={t("capture.placeholder")}
          className="min-h-44 w-full resize-none bg-transparent text-[16px] leading-7 outline-none placeholder:text-[var(--muted)]"
        />
        <div className="mt-2 flex items-center gap-3">
          {isMicSupported ? (
            <button
              type="button"
              onClick={toggleRecording}
              disabled={micState === "transcribing" || photoState === "processing"}
              aria-label={
                micState === "recording" ? t("capture.mic.stop") : t("capture.mic.start")
              }
              className={cx(
                "grid h-11 w-11 shrink-0 place-items-center rounded-full transition",
                micState === "recording"
                  ? "mic-recording bg-[var(--red)] text-white"
                  : "border border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--surface-strong)] disabled:opacity-60",
              )}
            >
              {micState === "transcribing" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoState === "processing" || micState !== "idle"}
            aria-label={t("capture.photo.start")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] text-[var(--ink)] transition hover:bg-[var(--surface-strong)] disabled:opacity-60"
          >
            {photoState === "processing" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelected}
          />
          <span className="text-[12px] leading-5 text-[var(--muted)]">{mediaStatus}</span>
        </div>
        {mediaError ? (
          <p className="mt-3 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--muted)]">
            {mediaError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onProcess}
          disabled={!captureText.trim() || isProcessing}
          className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--red)] px-5 text-[14px] font-bold text-white shadow-sm transition hover:bg-[var(--red-dark)] disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {isProcessing ? t("capture.processing") : t("capture.process", { model: modelLabel })}
        </button>
        {error ? (
          <p className="mt-3 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--red)]">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-3 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--ink-soft)]">
            {notice}
          </p>
        ) : null}
      </div>

      <div className="mt-6 space-y-4">
        {suggestions.length ? (
          suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              projects={projects}
              isEditing={editingSuggestionId === suggestion.id}
              locale={locale}
              t={t}
              onAccept={() => onAccept(suggestion)}
              onCreateTask={() => onAccept(suggestion, "user")}
              onReject={() => onReject(suggestion.id)}
              onEdit={() => onEditSuggestion(suggestion.id)}
              onCancelEdit={() => onEditSuggestion(null)}
              onUpdate={(updated) => {
                onUpdateSuggestion(updated);
                onEditSuggestion(null);
              }}
            />
          ))
        ) : (
          <div className="rounded-[7px] border border-dashed border-[var(--line-strong)] p-5 text-[13px] leading-6 text-[var(--muted)]">
            {t("capture.examples")}
          </div>
        )}
      </div>
    </div>
  );
}
