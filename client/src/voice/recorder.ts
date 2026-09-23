import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { uuid } from "@/lib/ids";
import { idbDelete, idbGet, idbPut } from "@/lib/idb";

// One recorder API for the app. On iPhone it's the native VoiceNote plugin
// (m4a file + on-device speech recognition, works with no signal). In a
// browser it falls back to MediaRecorder + Web Speech, for development.

type PermissionState = "granted" | "denied" | "prompt";

interface VoiceNotePlugin {
  checkPermissions(): Promise<{ microphone: PermissionState; speechRecognition: PermissionState }>;
  requestPermissions(): Promise<{ microphone: PermissionState; speechRecognition: PermissionState }>;
  start(options: {
    contextualStrings?: string[];
    locale?: string;
    allowServerRecognition?: boolean;
  }): Promise<{ fileName: string; transcribing: boolean; onDevice: boolean }>;
  stop(): Promise<RecordingResult>;
  cancel(): Promise<void>;
  getRecordingPath(options: { fileName: string }): Promise<{ path: string; exists: boolean }>;
  deleteRecording(options: { fileName: string }): Promise<void>;
  addListener(event: "partialTranscript", fn: (e: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "interrupted", fn: (e: { reason: string }) => void): Promise<PluginListenerHandle>;
}

const VoiceNote = registerPlugin<VoiceNotePlugin>("VoiceNote");

export interface RecordingResult {
  fileName: string;
  mimeType: string;
  durationMs: number;
  transcript: string;
  onDevice: boolean;
}

export interface StartInfo {
  transcribing: boolean;
  onDevice: boolean;
}

export interface RecorderCallbacks {
  onPartial(text: string): void;
  onInterrupted(): void;
}

export interface Recorder {
  // Returns false if the microphone is not allowed.
  ensurePermission(): Promise<boolean>;
  start(hints: string[], callbacks: RecorderCallbacks): Promise<StartInfo>;
  stop(): Promise<RecordingResult>;
  cancel(): Promise<void>;
}

export const isNative = () => Capacitor.isNativePlatform();

// ------------------------------------------------------------------ native

function nativeRecorder(): Recorder {
  let handles: PluginListenerHandle[] = [];
  const clear = async () => {
    await Promise.all(handles.map((h) => h.remove()));
    handles = [];
  };
  return {
    async ensurePermission() {
      let perms = await VoiceNote.checkPermissions();
      if (perms.microphone !== "granted" || perms.speechRecognition === "prompt") {
        perms = await VoiceNote.requestPermissions();
      }
      return perms.microphone === "granted";
    },
    async start(hints, callbacks) {
      await clear();
      handles.push(await VoiceNote.addListener("partialTranscript", (e) => callbacks.onPartial(e.text)));
      handles.push(await VoiceNote.addListener("interrupted", () => callbacks.onInterrupted()));
      try {
        const info = await VoiceNote.start({ contextualStrings: hints.slice(0, 100), locale: "en-US" });
        return { transcribing: info.transcribing, onDevice: info.onDevice };
      } catch (err) {
        await clear();
        throw err;
      }
    },
    async stop() {
      try {
        return await VoiceNote.stop();
      } finally {
        await clear();
      }
    },
    async cancel() {
      await clear();
      await VoiceNote.cancel();
    },
  };
}

// ------------------------------------------------------------------ browser

function webRecorder(): Recorder {
  let media: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let recognition: any = null;
  let finalText = "";
  let interimText = "";
  let startedAt = 0;

  const SpeechRecognitionCtor =
    typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  function pickMime() {
    for (const type of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  }

  function release() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    try {
      recognition?.stop();
    } catch {
      /* already stopped */
    }
    recognition = null;
  }

  return {
    async ensurePermission() {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return false;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
        return true;
      } catch {
        return false;
      }
    },
    async start(_hints, callbacks) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks = [];
      media.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      media.start(1000);
      startedAt = Date.now();
      finalText = "";
      interimText = "";
      if (SpeechRecognitionCtor) {
        recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event: any) => {
          interimText = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalText += `${text} `;
            else interimText += text;
          }
          callbacks.onPartial(`${finalText}${interimText}`.trim());
        };
        recognition.onerror = () => undefined;
        try {
          recognition.start();
        } catch {
          recognition = null;
        }
      }
      return { transcribing: !!recognition, onDevice: false };
    },
    async stop() {
      const recorder = media;
      if (!recorder) throw new Error("Not recording");
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.stop();
      await stopped;
      release();
      const mimeType = (recorder.mimeType || "audio/webm").split(";")[0];
      const ext = mimeType.includes("mp4") ? "m4a" : "webm";
      const fileName = `${uuid()}.${ext}`;
      await idbPut("audio", fileName, new Blob(chunks, { type: mimeType }));
      media = null;
      return {
        fileName,
        mimeType,
        durationMs: Date.now() - startedAt,
        transcript: `${finalText}${interimText}`.trim(),
        onDevice: false,
      };
    },
    async cancel() {
      media?.stop();
      media = null;
      release();
    },
  };
}

export const recorder: Recorder = isNative() ? nativeRecorder() : webRecorder();

export class AudioReadError extends Error {}

// Returns null only when the recording file doesn't exist. Any other failure
// throws AudioReadError with details, so the cause shows up in Settings.
export async function readAudio(fileName: string): Promise<Blob | null> {
  if (isNative()) {
    const { path, exists } = await VoiceNote.getRecordingPath({ fileName });
    if (!exists) return null;
    let res: Response;
    try {
      res = await fetch(Capacitor.convertFileSrc(path));
    } catch (err) {
      throw new AudioReadError(`fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Capacitor serves media files (.m4a) with a plain, non-HTTP response, so
    // the status can be 0 even though the bytes arrive. Judge by the bytes.
    const blob = await res.blob();
    if (blob.size === 0) {
      throw new AudioReadError(`empty read (status ${res.status}, type ${res.type || "-"})`);
    }
    return new Blob([blob], { type: "audio/mp4" });
  }
  return (await idbGet<Blob>("audio", fileName)) ?? null;
}

export async function deleteAudio(fileName: string) {
  try {
    if (isNative()) await VoiceNote.deleteRecording({ fileName });
    else await idbDelete("audio", fileName);
  } catch {
    // Best effort; a leftover file only costs disk space.
  }
}
