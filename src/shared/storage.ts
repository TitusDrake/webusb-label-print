import type { LabelRecord } from '../batch/batch';
import type { Density } from '../printer/label-printer';
import type { FitMode, Rotation } from '../pdf/placement';
import type { MediaKey } from '../printer/media';

export interface Settings {
  /** `auto` = read from the roll's NFC tag, falling back to 30336. */
  labelSize: 'auto' | MediaKey;
  fit: FitMode;
  rotate: Rotation;
  density: Density;
}

export const DEFAULT_SETTINGS: Settings = { labelSize: 'auto', fit: 'shrink', rotate: 90, density: 'normal' };

/** Progress for one PDF, keyed by its SHA-256. Kept so a closed window can pick up where it stopped. */
export interface SavedBatch {
  fingerprint: string;
  labels: LabelRecord[];
  updatedAt: number;
}

const SETTINGS_KEY = 'settings';
const BATCHES_KEY = 'batches';
const MAX_SAVED_BATCHES = 50;

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

async function loadBatches(): Promise<SavedBatch[]> {
  const stored = await chrome.storage.local.get(BATCHES_KEY);
  return (stored[BATCHES_KEY] as SavedBatch[] | undefined) ?? [];
}

export async function loadBatch(fingerprint: string): Promise<SavedBatch | undefined> {
  return (await loadBatches()).find(b => b.fingerprint === fingerprint);
}

export async function saveBatch(fingerprint: string, labels: LabelRecord[]): Promise<void> {
  const others = (await loadBatches()).filter(b => b.fingerprint !== fingerprint);
  const entry: SavedBatch = { fingerprint, labels, updatedAt: Date.now() };
  await chrome.storage.local.set({ [BATCHES_KEY]: [entry, ...others].slice(0, MAX_SAVED_BATCHES) });
}

export async function forgetBatch(fingerprint: string): Promise<void> {
  const remaining = (await loadBatches()).filter(b => b.fingerprint !== fingerprint);
  await chrome.storage.local.set({ [BATCHES_KEY]: remaining });
}
