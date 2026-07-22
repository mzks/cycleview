import { AppSettings, DEFAULT_RUNTIME, DEFAULT_SETTINGS, ManagedPage, RuntimeState } from "./types";

const SETTINGS_KEY = "settings";
const RUNTIME_KEY = "runtime";
const BOOTSTRAP_VERSION_KEY = "bootstrapSettingsVersion";

export async function loadSettings(): Promise<AppSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return sanitizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: sanitizeSettings(settings) });
}

export async function loadRuntime(): Promise<RuntimeState> {
  const stored = await chrome.storage.local.get(RUNTIME_KEY);
  return sanitizeRuntime(stored[RUNTIME_KEY]);
}

export async function saveRuntime(runtime: RuntimeState): Promise<void> {
  await chrome.storage.local.set({ [RUNTIME_KEY]: sanitizeRuntime(runtime) });
}

export async function loadBootstrapSettingsVersion(): Promise<string | null> {
  const stored = await chrome.storage.local.get(BOOTSTRAP_VERSION_KEY);
  return typeof stored[BOOTSTRAP_VERSION_KEY] === "string" ? stored[BOOTSTRAP_VERSION_KEY] : null;
}

export async function saveBootstrapSettingsVersion(version: string): Promise<void> {
  await chrome.storage.local.set({ [BOOTSTRAP_VERSION_KEY]: version });
}

export function sanitizeSettings(input: unknown): AppSettings {
  const raw = typeof input === "object" && input ? (input as Partial<AppSettings>) : {};
  return {
    pages: Array.isArray(raw.pages) ? raw.pages.map(sanitizePage).filter(Boolean) as ManagedPage[] : [],
    globalDurationSec: sanitizeOptionalSec(raw.globalDurationSec),
    globalReloadEverySec: sanitizeOptionalSec(raw.globalReloadEverySec),
    globalReopenEverySec: sanitizeOptionalSec(raw.globalReopenEverySec),
    focusWindowOnSwitch: Boolean(raw.focusWindowOnSwitch),
    pauseOnPageClick: raw.pauseOnPageClick !== false,
    autoStartOnBrowserLaunch: Boolean(raw.autoStartOnBrowserLaunch),
    isRunning: Boolean(raw.isRunning)
  };
}

export function sanitizeRuntime(input: unknown): RuntimeState {
  const raw = typeof input === "object" && input ? (input as Partial<RuntimeState>) : {};
  return {
    currentPageIndex: sanitizeIndex(raw.currentPageIndex),
    pageTabIds: sanitizeNumberMap(raw.pageTabIds),
    lastReloadAtByPageId: sanitizeNumberMap(raw.lastReloadAtByPageId),
    lastHourlyReloadBucketByPageId: sanitizeNumberMap(raw.lastHourlyReloadBucketByPageId),
    lastDailyReloadBucketByPageId: sanitizeNumberMap(raw.lastDailyReloadBucketByPageId),
    lastReopenAtByPageId: sanitizeNumberMap(raw.lastReopenAtByPageId),
    lastHourlyReopenBucketByPageId: sanitizeNumberMap(raw.lastHourlyReopenBucketByPageId),
    lastDailyReopenBucketByPageId: sanitizeNumberMap(raw.lastDailyReopenBucketByPageId),
    lastSwitchedAt: typeof raw.lastSwitchedAt === "number" ? raw.lastSwitchedAt : null
  };
}

function sanitizePage(input: unknown): ManagedPage | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<ManagedPage>;
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!url) {
    return null;
  }

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : createId(),
    enabled: raw.enabled !== false,
    name: name || url,
    url,
    durationSec: sanitizeOptionalPositiveInt(raw.durationSec),
    zoomPercent: sanitizeZoomPercent(raw.zoomPercent),
    reloadEverySec: sanitizeOptionalSec(raw.reloadEverySec),
    reloadOnHour: Boolean(raw.reloadOnHour),
    reloadOnDay: Boolean(raw.reloadOnDay),
    reopenEverySec: sanitizeOptionalSec(raw.reopenEverySec),
    reopenOnHour: Boolean(raw.reopenOnHour),
    reopenOnDay: Boolean(raw.reopenOnDay)
  };
}

function sanitizeZoomPercent(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 25 || parsed > 500) {
    return 100;
  }

  return Math.floor(parsed);
}

function sanitizeOptionalSec(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function sanitizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function sanitizeOptionalPositiveInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.floor(parsed);
}

function sanitizeIndex(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function sanitizeNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, mapValue]) => typeof mapValue === "number" && Number.isFinite(mapValue))
  );
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `page-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function ensureStorageDefaults(): Promise<void> {
  const [settings, runtime] = await Promise.all([loadSettings(), loadRuntime()]);
  await Promise.all([
    chrome.storage.local.set({ [SETTINGS_KEY]: settings || DEFAULT_SETTINGS }),
    chrome.storage.local.set({ [RUNTIME_KEY]: runtime || DEFAULT_RUNTIME })
  ]);
}
