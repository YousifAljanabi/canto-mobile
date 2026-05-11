import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReadingPosition } from '../types/epub';

const LIBRARY_KEY = 'canto_library';
const POSITION_PREFIX = 'canto_pos_';
const SETTINGS_KEY = 'canto_settings';

export interface LibraryEntry {
  filePath: string;
  title: string;
  author: string;
  coverBase64?: string;
  lastOpened: number;
  totalChapters: number;
}

export interface AppSettings {
  voiceId?: string;
  ttsRate: number;
  ttsPitch: number;
  kokoroServerUrl?: string;
  fontSize: number;
}

const defaultSettings: AppSettings = {
  ttsRate: 1.0,
  ttsPitch: 1.0,
  fontSize: 18,
};

export async function getLibrary(): Promise<LibraryEntry[]> {
  const raw = await AsyncStorage.getItem(LIBRARY_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addToLibrary(entry: LibraryEntry): Promise<void> {
  const lib = await getLibrary();
  const idx = lib.findIndex(e => e.filePath === entry.filePath);
  if (idx >= 0) lib[idx] = entry;
  else lib.unshift(entry);
  await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
}

export async function removeFromLibrary(filePath: string): Promise<void> {
  const lib = await getLibrary();
  await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(lib.filter(e => e.filePath !== filePath)));
}

export async function savePosition(filePath: string, pos: ReadingPosition): Promise<void> {
  await AsyncStorage.setItem(POSITION_PREFIX + filePath, JSON.stringify(pos));
}

export async function loadPosition(filePath: string): Promise<ReadingPosition | null> {
  const raw = await AsyncStorage.getItem(POSITION_PREFIX + filePath);
  return raw ? JSON.parse(raw) : null;
}

export async function getSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}
