import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export const KOKORO_SERVER_URL = 'https://tts.sleepyrust.com';
export const DEFAULT_KOKORO_VOICE = 'af_sarah';

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  quality?: string;
  isKokoro?: boolean;
}

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  onDone?: () => void;
  onError?: (err: string) => void;
  onStart?: () => void;
}

// Active expo-av sound instance and in-flight fetch controller
let activeSound: Audio.Sound | null = null;
let activeFetchController: AbortController | null = null;

// ─── Kokoro (primary) ───────────────────────────────────────────────────────

export async function getKokoroVoices(): Promise<VoiceInfo[]> {
  try {
    const res = await fetch(`${KOKORO_SERVER_URL}/v1/audio/voices`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    const voices: string[] = data.voices ?? [];
    return voices.map(id => ({
      id,
      name: formatKokoroVoiceName(id),
      language: id.startsWith('b') ? 'en-GB' : 'en-US',
      isKokoro: true,
    }));
  } catch {
    return [];
  }
}

function formatKokoroVoiceName(id: string): string {
  // af_sarah → Sarah (F · US),  bm_george → George (M · UK)
  const genderMap: Record<string, string> = { f: 'F', m: 'M' };
  const regionMap: Record<string, string> = { a: 'US', b: 'UK', e: 'ES' };
  const parts = id.split('_');
  if (parts.length < 2) return id;
  const prefix = parts[0]; // af, am, bf, bm ...
  const region = regionMap[prefix[0]] ?? '';
  const gender = genderMap[prefix[1]] ?? '';
  const name = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  return `${name} (${gender} · ${region})`;
}

export async function speakKokoro(text: string, options: TTSOptions = {}): Promise<void> {
  // Cancel any in-flight request and stop current playback immediately
  activeFetchController?.abort();
  activeFetchController = null;
  await stopKokoro();

  const controller = new AbortController();
  activeFetchController = controller;

  options.onStart?.();

  try {
    const response = await fetch(`${KOKORO_SERVER_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice: options.voice ?? DEFAULT_KOKORO_VOICE,
        speed: options.rate ?? 1.0,
        response_format: 'mp3',
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Kokoro ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const uri = `data:audio/mp3;base64,${base64}`;

    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
    activeSound = sound;

    activeFetchController = null;
    sound.setOnPlaybackStatusUpdate(status => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        sound.unloadAsync();
        activeSound = null;
        options.onDone?.();
      }
    });
  } catch (err: any) {
    activeFetchController = null;
    activeSound = null;
    // Aborted = intentional skip, don't fall back
    if (err?.name === 'AbortError') return;
    speakSystem(text, options);
  }
}

export async function stopKokoro(): Promise<void> {
  activeFetchController?.abort();
  activeFetchController = null;
  if (activeSound) {
    try { await activeSound.stopAsync(); await activeSound.unloadAsync(); } catch {}
    activeSound = null;
  }
}

// ─── System TTS (fallback) ──────────────────────────────────────────────────

export async function getSystemVoices(): Promise<VoiceInfo[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.map(v => ({
      id: v.identifier,
      name: v.name,
      language: v.language,
      quality: v.quality,
      isKokoro: false,
    }));
  } catch {
    return [];
  }
}

export function speakSystem(text: string, options: TTSOptions = {}): void {
  Speech.stop();
  Speech.speak(text, {
    voice: options.voice,
    rate: options.rate ?? 1.0,
    pitch: options.pitch ?? 1.0,
    onDone: options.onDone,
    onError: err => options.onError?.(String(err)),
    onStart: options.onStart,
  });
}

export async function stopSystem(): Promise<void> {
  await Speech.stop();
}

// ─── Unified API used by the app ────────────────────────────────────────────

export async function getAvailableVoices(): Promise<VoiceInfo[]> {
  const [kokoro, system] = await Promise.all([getKokoroVoices(), getSystemVoices()]);
  // Kokoro voices first if server is reachable, else fall back to system
  return kokoro.length > 0 ? kokoro : system;
}

export async function speak(text: string, options: TTSOptions = {}): Promise<void> {
  const isKokoro = !options.voice || options.voice.includes('_');
  const kokoroReachable = isKokoro;

  if (kokoroReachable) {
    await speakKokoro(text, options);
  } else {
    speakSystem(text, options);
  }
}

export async function stop(): Promise<void> {
  await stopKokoro();
  await stopSystem();
}

export async function pause(): Promise<void> {
  if (activeSound) {
    try { await activeSound.pauseAsync(); } catch {}
  } else if (Platform.OS === 'ios') {
    await Speech.pause();
  }
}

export async function resume(): Promise<void> {
  if (activeSound) {
    try { await activeSound.playAsync(); } catch {}
  } else if (Platform.OS === 'ios') {
    await Speech.resume();
  }
}

export function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

// ─── Util ───────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
