import { loadSettings, sanitizeSettings, saveSettings } from "./storage";
import { AppSettings, ManagedPage } from "./types";

interface UserConfigPage {
  enabled: boolean;
  name: string;
  url: string;
  durationSec: number | null;
  zoomPercent: number;
  reloadEverySec: number | null;
  reloadOnHour: boolean;
  reloadOnDay: boolean;
  reopenEverySec: number | null;
  reopenOnHour: boolean;
  reopenOnDay: boolean;
}

interface UserConfig {
  pages: UserConfigPage[];
  globalDurationSec: number | null;
  globalReloadEverySec: number | null;
  globalReopenEverySec: number | null;
  focusWindowOnSwitch: boolean;
  pauseOnPageClick: boolean;
  autoStartOnBrowserLaunch: boolean;
}

const pageList = mustElement<HTMLTableSectionElement>("page-list");
const pageRowTemplate = mustElement<HTMLTemplateElement>("page-row-template");
const addPageButton = mustElement<HTMLButtonElement>("add-page-button");
const saveButton = mustElement<HTMLButtonElement>("save-button");
const globalDurationInput = mustElement<HTMLInputElement>("global-duration-input");
const globalReloadInput = mustElement<HTMLInputElement>("global-reload-input");
const globalReopenInput = mustElement<HTMLInputElement>("global-reopen-input");
const focusWindowCheckbox = mustElement<HTMLInputElement>("focus-window-checkbox");
const pauseOnPageClickCheckbox = mustElement<HTMLInputElement>("pause-on-page-click-checkbox");
const autoStartCheckbox = mustElement<HTMLInputElement>("auto-start-checkbox");
const shortcutSettingsButton = mustElement<HTMLButtonElement>("shortcut-settings-button");
const statusMessage = mustElement<HTMLParagraphElement>("status-message");
const exportButton = mustElement<HTMLButtonElement>("export-button");
const copyJsonButton = mustElement<HTMLButtonElement>("copy-json-button");
const importButton = mustElement<HTMLButtonElement>("import-button");
const importFileInput = mustElement<HTMLInputElement>("import-file-input");
const loadJsonButton = mustElement<HTMLButtonElement>("load-json-button");
const applyJsonButton = mustElement<HTMLButtonElement>("apply-json-button");
const jsonEditor = mustElement<HTMLTextAreaElement>("json-editor");
const jsonStatusMessage = mustElement<HTMLParagraphElement>("json-status-message");

let settings: AppSettings;
let invalidPageIndexes = new Set<number>();

void initialize();

addPageButton.addEventListener("click", () => {
  settings.pages.push(createEmptyPage());
  render();
});

saveButton.addEventListener("click", () => {
  void save();
});
exportButton.addEventListener("click", () => {
  exportConfig();
});
copyJsonButton.addEventListener("click", () => {
  void copyConfigToClipboard();
});
importButton.addEventListener("click", () => {
  importFileInput.click();
});
importFileInput.addEventListener("change", () => {
  void importConfigFromFile();
});
loadJsonButton.addEventListener("click", () => {
  loadJsonFromForm();
});
applyJsonButton.addEventListener("click", () => {
  applyJsonToForm();
});
shortcutSettingsButton.addEventListener("click", () => {
  void openShortcutSettings();
});

async function initialize(): Promise<void> {
  settings = await loadSettings();
  if (settings.pages.length === 0) {
    settings.pages = [createEmptyPage()];
  }
  render();
  loadJsonFromForm();
}

function render(): void {
  globalDurationInput.value = settings.globalDurationSec?.toString() ?? "";
  globalReloadInput.value = settings.globalReloadEverySec?.toString() ?? "";
  globalReopenInput.value = settings.globalReopenEverySec?.toString() ?? "";
  focusWindowCheckbox.checked = settings.focusWindowOnSwitch;
  pauseOnPageClickCheckbox.checked = settings.pauseOnPageClick;
  autoStartCheckbox.checked = settings.autoStartOnBrowserLaunch;
  pageList.replaceChildren(...settings.pages.map((page, index) => renderPageRow(page, index)));
}

function renderPageRow(page: ManagedPage, index: number): HTMLElement {
  const fragment = pageRowTemplate.content.cloneNode(true) as DocumentFragment;
  const root = fragment.querySelector(".page-row") as HTMLElement;
  const enabledInput = fragment.querySelector<HTMLInputElement>('[data-field="enabled"]')!;
  const nameInput = fragment.querySelector<HTMLInputElement>('[data-field="name"]')!;
  const urlInput = fragment.querySelector<HTMLInputElement>('[data-field="url"]')!;
  const durationInput = fragment.querySelector<HTMLInputElement>('[data-field="durationSec"]')!;
  const zoomInput = fragment.querySelector<HTMLInputElement>('[data-field="zoomPercent"]')!;
  const reloadInput = fragment.querySelector<HTMLInputElement>('[data-field="reloadEverySec"]')!;
  const reloadOnHourInput = fragment.querySelector<HTMLInputElement>('[data-field="reloadOnHour"]')!;
  const reloadOnDayInput = fragment.querySelector<HTMLInputElement>('[data-field="reloadOnDay"]')!;
  const reopenInput = fragment.querySelector<HTMLInputElement>('[data-field="reopenEverySec"]')!;
  const reopenOnHourInput = fragment.querySelector<HTMLInputElement>('[data-field="reopenOnHour"]')!;
  const reopenOnDayInput = fragment.querySelector<HTMLInputElement>('[data-field="reopenOnDay"]')!;
  const upButton = fragment.querySelector<HTMLButtonElement>('[data-action="move-up"]')!;
  const downButton = fragment.querySelector<HTMLButtonElement>('[data-action="move-down"]')!;
  const removeButton = fragment.querySelector<HTMLButtonElement>('[data-action="remove"]')!;

  root.classList.toggle("invalid", invalidPageIndexes.has(index));
  enabledInput.checked = page.enabled;
  nameInput.value = page.name;
  urlInput.value = page.url;
  durationInput.value = page.durationSec?.toString() ?? "";
  zoomInput.value = page.zoomPercent.toString();
  reloadInput.value = page.reloadEverySec?.toString() ?? "";
  reloadOnHourInput.checked = page.reloadOnHour;
  reloadOnDayInput.checked = page.reloadOnDay;
  reopenInput.value = page.reopenEverySec?.toString() ?? "";
  reopenOnHourInput.checked = page.reopenOnHour;
  reopenOnDayInput.checked = page.reopenOnDay;

  enabledInput.addEventListener("input", () => {
    page.enabled = enabledInput.checked;
  });
  nameInput.addEventListener("input", () => {
    page.name = nameInput.value;
  });
  urlInput.addEventListener("input", () => {
    page.url = urlInput.value;
  });
  durationInput.addEventListener("input", () => {
    page.durationSec = parseOptionalSeconds(durationInput.value);
  });
  zoomInput.addEventListener("input", () => {
    page.zoomPercent = parseZoomPercent(zoomInput.value);
  });
  reloadInput.addEventListener("input", () => {
    page.reloadEverySec = parseOptionalSeconds(reloadInput.value);
  });
  reloadOnHourInput.addEventListener("input", () => {
    page.reloadOnHour = reloadOnHourInput.checked;
  });
  reloadOnDayInput.addEventListener("input", () => {
    page.reloadOnDay = reloadOnDayInput.checked;
  });
  reopenInput.addEventListener("input", () => {
    page.reopenEverySec = parseOptionalSeconds(reopenInput.value);
  });
  reopenOnHourInput.addEventListener("input", () => {
    page.reopenOnHour = reopenOnHourInput.checked;
  });
  reopenOnDayInput.addEventListener("input", () => {
    page.reopenOnDay = reopenOnDayInput.checked;
  });

  upButton.disabled = index === 0;
  downButton.disabled = index === settings.pages.length - 1;

  upButton.addEventListener("click", () => {
    movePage(index, -1);
  });
  downButton.addEventListener("click", () => {
    movePage(index, 1);
  });
  removeButton.addEventListener("click", () => {
    settings.pages.splice(index, 1);
    if (settings.pages.length === 0) {
      settings.pages.push(createEmptyPage());
    }
    render();
  });

  return root;
}

function movePage(index: number, direction: number): void {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= settings.pages.length) {
    return;
  }

  const [page] = settings.pages.splice(index, 1);
  settings.pages.splice(nextIndex, 0, page);
  render();
}

async function save(): Promise<void> {
  statusMessage.textContent = "";
  invalidPageIndexes = new Set();
  const normalizedSettings = normalizeFormSettings();
  const validationError = validateSettings(normalizedSettings);
  if (validationError) {
    statusMessage.textContent = validationError;
    render();
    return;
  }

  settings = normalizedSettings;
  await saveSettings(settings);
  await chrome.runtime.sendMessage({ type: "settingsUpdated" });
  loadJsonFromForm();
  statusMessage.textContent = "Saved.";
}

function validateSettings(candidate: AppSettings): string | null {
  if (candidate.pages.length === 0) {
    return "Add at least one page URL.";
  }

  for (const [index, page] of candidate.pages.entries()) {
    if (!page.name && !page.url) {
      continue;
    }

    if (!page.url) {
      invalidPageIndexes.add(index);
      return `Page ${index + 1}: Enter a URL.`;
    }

    if (!isValidUrl(page.url)) {
      invalidPageIndexes.add(index);
      if (looksLikeUrl(page.name)) {
        return `Page ${index + 1}: Name and URL may be swapped.`;
      }
      return `Page ${index + 1}: URL format is invalid.`;
    }
  }

  return null;
}

function parseOptionalSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function normalizeFormSettings(): AppSettings {
  const normalizedPages = settings.pages.map((page) => ({
    ...page,
    enabled: Boolean(page.enabled),
    name: page.name.trim(),
    url: page.url.trim(),
    durationSec: parseOptionalSeconds(String(page.durationSec ?? "")),
    zoomPercent: parseZoomPercent(String(page.zoomPercent ?? "")),
    reloadEverySec: parseOptionalSeconds(String(page.reloadEverySec ?? "")),
    reloadOnHour: Boolean(page.reloadOnHour),
    reloadOnDay: Boolean(page.reloadOnDay),
    reopenEverySec: parseOptionalSeconds(String(page.reopenEverySec ?? "")),
    reopenOnHour: Boolean(page.reopenOnHour),
    reopenOnDay: Boolean(page.reopenOnDay)
  })).filter((page) => page.url);

  return {
    ...settings,
    pages: normalizedPages,
    globalDurationSec: parseOptionalSeconds(globalDurationInput.value),
    globalReloadEverySec: parseOptionalSeconds(globalReloadInput.value),
    globalReopenEverySec: parseOptionalSeconds(globalReopenInput.value),
    focusWindowOnSwitch: focusWindowCheckbox.checked,
    pauseOnPageClick: pauseOnPageClickCheckbox.checked,
    autoStartOnBrowserLaunch: autoStartCheckbox.checked
  };
}

function loadJsonFromForm(): void {
  jsonStatusMessage.textContent = "";
  jsonEditor.value = serializeUserConfig(normalizeFormSettings());
}

function applyJsonToForm(): void {
  invalidPageIndexes = new Set();
  statusMessage.textContent = "";
  jsonStatusMessage.textContent = "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonEditor.value);
  } catch {
    jsonStatusMessage.textContent = "JSON syntax is invalid.";
    return;
  }

  const candidate = sanitizeImportedSettings(parsed);
  const validationError = validateSettings(candidate);
  if (validationError) {
    jsonStatusMessage.textContent = validationError;
    render();
    return;
  }

  settings = ensureNonEmptySettings(candidate);
  render();
  jsonStatusMessage.textContent = "Applied JSON to the form.";
}

async function importConfigFromFile(): Promise<void> {
  const file = importFileInput.files?.[0];
  if (!file) {
    return;
  }

  jsonStatusMessage.textContent = "";

  try {
    const text = await file.text();
    jsonEditor.value = text;
    applyJsonToForm();
  } finally {
    importFileInput.value = "";
  }
}

async function copyConfigToClipboard(): Promise<void> {
  try {
    await navigator.clipboard.writeText(serializeUserConfig(normalizeFormSettings()));
    jsonStatusMessage.textContent = "Copied JSON to clipboard.";
  } catch {
    jsonStatusMessage.textContent = "Could not copy JSON to clipboard.";
  }
}

async function openShortcutSettings(): Promise<void> {
  try {
    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  } catch {
    statusMessage.textContent = "Could not open shortcut settings.";
  }
}

function exportConfig(): void {
  const payload = serializeUserConfig(normalizeFormSettings());
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cycleview-settings.json";
  link.click();
  URL.revokeObjectURL(url);
  jsonStatusMessage.textContent = "Exported JSON.";
}

function serializeUserConfig(candidate: AppSettings): string {
  return JSON.stringify(
    {
      pages: candidate.pages.map((page) => ({
        name: page.name,
        url: page.url,
        durationSec: page.durationSec ?? null,
        zoomPercent: page.zoomPercent,
        enabled: page.enabled,
        reloadEverySec: page.reloadEverySec,
        reloadOnHour: page.reloadOnHour,
        reloadOnDay: page.reloadOnDay,
        reopenEverySec: page.reopenEverySec,
        reopenOnHour: page.reopenOnHour,
        reopenOnDay: page.reopenOnDay
      })),
      globalDurationSec: candidate.globalDurationSec,
      globalReloadEverySec: candidate.globalReloadEverySec,
      globalReopenEverySec: candidate.globalReopenEverySec,
      focusWindowOnSwitch: candidate.focusWindowOnSwitch,
      pauseOnPageClick: candidate.pauseOnPageClick,
      autoStartOnBrowserLaunch: candidate.autoStartOnBrowserLaunch
    },
    null,
    2
  );
}

function sanitizeImportedSettings(input: unknown): AppSettings {
  const raw = typeof input === "object" && input ? input as Partial<UserConfig> : {};
  const normalizedInput = {
    pages: Array.isArray(raw.pages)
      ? raw.pages.map((page) => ({
          enabled: page?.enabled,
          name: typeof page?.name === "string" ? page.name : "",
          url: typeof page?.url === "string" ? page.url : "",
          durationSec: page?.durationSec ?? undefined,
          zoomPercent: page?.zoomPercent,
          reloadEverySec: page?.reloadEverySec,
          reloadOnHour: page?.reloadOnHour,
          reloadOnDay: page?.reloadOnDay,
          reopenEverySec: page?.reopenEverySec,
          reopenOnHour: page?.reopenOnHour,
          reopenOnDay: page?.reopenOnDay
        }))
      : [],
    globalReloadEverySec: raw.globalReloadEverySec,
    globalDurationSec: raw.globalDurationSec,
    globalReopenEverySec: raw.globalReopenEverySec,
    focusWindowOnSwitch: raw.focusWindowOnSwitch,
    pauseOnPageClick: raw.pauseOnPageClick,
    autoStartOnBrowserLaunch: raw.autoStartOnBrowserLaunch,
    isRunning: false
  };

  return sanitizeSettings(normalizedInput);
}

function ensureNonEmptySettings(candidate: AppSettings): AppSettings {
  if (candidate.pages.length > 0) {
    return candidate;
  }

  return {
    ...candidate,
    pages: [createEmptyPage()]
  };
}

function createEmptyPage(): ManagedPage {
  return {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `page-${Date.now()}`,
    enabled: true,
    name: "",
    url: "",
    durationSec: null,
    zoomPercent: 100,
    reloadEverySec: null,
    reloadOnHour: false,
    reloadOnDay: false,
    reopenEverySec: null,
    reopenOnHour: false,
    reopenOnDay: false
  };
}

function parseZoomPercent(value: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 25 || parsed > 500) {
    return 100;
  }

  return Math.floor(parsed);
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function looksLikeUrl(value: string): boolean {
  return isValidUrl(value) || /^(https?:\/\/|chrome-extension:\/\/)/i.test(value);
}

function mustElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}
