// Nimmt Audio über MediaRecorder auf und wandelt es client-seitig in ein
// kompaktes 16-kHz-Mono-WAV um (Base64), das die Transkriptions-Route
// an ein audiofähiges Modell weiterreicht.

const TARGET_SAMPLE_RATE = 16_000;
export const MAX_RECORDING_SECONDS = 60;

export function isRecordingSupported() {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export type ActiveRecording = {
  stop: () => Promise<Blob>;
  cancel: () => void;
};

export async function startRecording(): Promise<ActiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: Blob[] = [];

  function cleanup() {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.start();
  } catch (error) {
    // Startet der Recorder gar nicht erst, hat der Aufrufer keine Referenz
    // zum Aufräumen — das Mikrofon muss hier wieder freigegeben werden.
    cleanup();
    throw error;
  }

  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          cleanup();
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (!blob.size) {
            reject(new Error("Es wurde kein Ton aufgenommen."));
            return;
          }
          resolve(blob);
        };
        recorder.onerror = () => {
          cleanup();
          reject(new Error("Die Aufnahme ist fehlgeschlagen."));
        };
        recorder.stop();
      }),
    cancel: () => {
      try {
        recorder.stop();
      } catch {
        // Bereits gestoppt.
      }
      cleanup();
    },
  };
}

export async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();

  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Audio-Verarbeitung wird von diesem Browser nicht unterstützt.");
  }

  const decodeContext = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(arrayBuffer);
  } finally {
    void decodeContext.close();
  }

  if (!decoded.duration || decoded.duration < 0.3) {
    throw new Error("Die Aufnahme war zu kurz.");
  }

  // Auf 16 kHz mono herunterrechnen – klein genug für den Upload,
  // mehr braucht Spracherkennung nicht.
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * TARGET_SAMPLE_RATE),
    TARGET_SAMPLE_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  const wavBuffer = encodePcm16Wav(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
  return bufferToBase64(wavBuffer);
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt-Chunk-Größe
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte-Rate
  view.setUint16(32, 2, true); // Block-Align
  view.setUint16(34, 16, true); // Bits pro Sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}
