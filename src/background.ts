import { ensureStorageDefaults, loadRuntime, loadSettings, sanitizeSettings, saveRuntime, saveSettings } from "./storage";
import { AppSettings, ExtensionMessage, ManagedPage, PublicState, RuntimeState } from "./types";

let settings: AppSettings;
let runtime: RuntimeState;
let initialized = false;
let rotationTimer: number | null = null;
let maintenanceTimer: number | null = null;
let popupOpenCount = 0;
let mutationQueue = Promise.resolve();

void serialized(initialize);

chrome.runtime.onInstalled.addListener(() => {
  void serialized(initialize);
});

chrome.runtime.onStartup.addListener(() => {
  void serialized(async () => {
    await initialize();
    if (settings.autoStartOnBrowserLaunch) {
      await startRotation();
    }
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "cycleview-heartbeat") {
    port.onMessage.addListener(() => {
      // Heartbeat messages keep the service worker warm for short interval timers.
    });
    return;
  }

  if (port.name === "cycleview-popup") {
    popupOpenCount += 1;
    clearRotationTimer();
    port.onDisconnect.addListener(() => {
      popupOpenCount = Math.max(0, popupOpenCount - 1);
      if (popupOpenCount === 0) {
        scheduleRotationTimer();
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  void serialized(async () => {
    await ensureInitialized();

    switch (message.type) {
      case "getState":
        sendResponse(await getPublicState());
        return;
      case "start":
        await startRotation();
        break;
      case "pause":
        await pauseRotation();
        break;
      case "toggleRun":
        if (settings.isRunning) {
          await pauseRotation();
        } else {
          await startRotation();
        }
        break;
      case "startOnly":
        await startRotation();
        break;
      case "pauseOnly":
        await pauseRotation();
        break;
      case "next":
        await moveRelative(1);
        break;
      case "previous":
        await moveRelative(-1);
        break;
      case "reloadCurrent":
        await reloadCurrentPage();
        break;
      case "closeTabs":
        await closeManagedTabs();
        break;
      case "pageClicked":
        if (settings.pauseOnPageClick && settings.isRunning) {
          await pauseRotation();
        }
        break;
      case "settingsUpdated":
        await handleSettingsUpdated();
        break;
      default:
        break;
    }

    sendResponse(await getPublicState());
  });

  return true;
});

chrome.commands.onCommand.addListener((command) => {
  void serialized(async () => {
    await ensureInitialized();

    switch (command) {
      case "toggle-run":
        await toggleRun();
        break;
      case "start-run":
        await startRotation();
        break;
      case "pause-run":
        await pauseRotation();
        break;
      case "next-page":
        await moveRelative(1);
        break;
      case "previous-page":
        await moveRelative(-1);
        break;
      case "reload-current":
        await reloadCurrentPage();
        break;
      default:
        break;
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void serialized(async () => {
    await ensureInitialized();

    const removedPageIds = Object.entries(runtime.pageTabIds)
      .filter(([, mappedTabId]) => mappedTabId === tabId)
      .map(([pageId]) => pageId);

    if (removedPageIds.length > 0) {
      runtime.pageTabIds = Object.fromEntries(
        Object.entries(runtime.pageTabIds).filter(([, mappedTabId]) => mappedTabId !== tabId)
      );
      await saveRuntime(runtime);
      scheduleMaintenanceTimer();
    }
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !("settings" in changes)) {
    return;
  }

  void serialized(handleSettingsUpdated);
});

async function initialize(): Promise<void> {
  await ensureStorageDefaults();
  settings = await loadSettings();
  runtime = await loadRuntime();
  const bootstrapped = await maybeBootstrapSettings();

  if (!settings.isRunning && !settings.autoStartOnBrowserLaunch) {
    runtime.pageTabIds = {};
  }

  runtime.currentPageIndex = clampIndex(runtime.currentPageIndex, settings.pages.length);
  await saveRuntime(runtime);
  initialized = true;

  if (getEnabledPages().length > 0 && (settings.isRunning || Object.keys(runtime.pageTabIds).length > 0)) {
    await ensureManagedTabs();
  }

  if (settings.isRunning && getEnabledPages().length > 0) {
    await activatePage(runtime.currentPageIndex);
  } else {
    settings.isRunning = false;
    clearRotationTimer();
  }

  if (bootstrapped && settings.autoStartOnBrowserLaunch && getEnabledPages().length > 0) {
    await startRotation();
    return;
  }

  scheduleMaintenanceTimer();
  await updateActionBadge();
  await broadcastState();
}

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await initialize();
  }
}

async function maybeBootstrapSettings(): Promise<boolean> {
  if (settings.pages.length > 0) {
    return false;
  }

  try {
    const response = await fetch(chrome.runtime.getURL("bootstrap-settings.json"));
    if (!response.ok) {
      return false;
    }

    const parsed = await response.json();
    const imported = sanitizeSettings(parsed);
    if (imported.pages.length === 0) {
      return false;
    }

    settings = {
      ...imported,
      isRunning: false
    };
    await saveSettings(settings);
    return true;
  } catch {
    return false;
  }
}

async function startRotation(): Promise<void> {
  if (getEnabledPages().length === 0) {
    settings.isRunning = false;
    await saveSettings(settings);
    await broadcastState();
    return;
  }

  settings.isRunning = true;
  await saveSettings(settings);
  await ensureManagedTabs();
  await activatePage(runtime.currentPageIndex);
}

async function pauseRotation(): Promise<void> {
  settings.isRunning = false;
  await saveSettings(settings);
  clearRotationTimer();
  await updateActionBadge();
  await broadcastState();
}

async function toggleRun(): Promise<void> {
  if (settings.isRunning) {
    await pauseRotation();
  } else {
    await startRotation();
  }
}

async function moveRelative(direction: number): Promise<void> {
  const enabledIndexes = getEnabledPageIndexes();
  if (enabledIndexes.length === 0) {
    return;
  }

  const currentEnabledIndex = getClosestEnabledIndex(runtime.currentPageIndex) ?? enabledIndexes[0];
  const currentPosition = enabledIndexes.indexOf(currentEnabledIndex);
  const nextIndex = enabledIndexes[mod(currentPosition + direction, enabledIndexes.length)];
  await ensureManagedTabs();
  await activatePage(nextIndex);
}

async function reloadCurrentPage(): Promise<void> {
  const currentPage = settings.pages[runtime.currentPageIndex];
  if (!currentPage?.enabled) {
    return;
  }

  await reloadPage(currentPage);
}

async function closeManagedTabs(): Promise<void> {
  settings.isRunning = false;
  await saveSettings(settings);
  clearRotationTimer();
  clearMaintenanceTimer();

  const tabIds = await collectManagedTabIds();
  if (tabIds.length > 0) {
    try {
      await chrome.tabs.remove(tabIds);
    } catch {
      for (const tabId of tabIds) {
        try {
          await chrome.tabs.remove(tabId);
        } catch {
          // Ignore missing tabs.
        }
      }
    }
  }

  runtime.pageTabIds = {};
  runtime.lastSwitchedAt = null;
  await saveRuntime(runtime);
  await updateActionBadge();
  await broadcastState();
}

async function handleSettingsUpdated(): Promise<void> {
  const previousCurrentPage = settings?.pages?.[runtime?.currentPageIndex]?.id ?? null;
  settings = await loadSettings();
  runtime = await loadRuntime();

  if (previousCurrentPage) {
    const nextIndex = settings.pages.findIndex((page) => page.id === previousCurrentPage);
    runtime.currentPageIndex = nextIndex >= 0 ? nextIndex : clampIndex(runtime.currentPageIndex, settings.pages.length);
  } else {
    runtime.currentPageIndex = clampIndex(runtime.currentPageIndex, settings.pages.length);
  }

  if (getEnabledPages().length === 0) {
    runtime.currentPageIndex = 0;
    settings.isRunning = false;
    clearRotationTimer();
    clearMaintenanceTimer();
    await saveRuntime(runtime);
    await broadcastState();
    return;
  }

  await ensureManagedTabs();
  await saveRuntime(runtime);

  if (settings.isRunning && getEnabledPages().length > 0) {
    await activatePage(runtime.currentPageIndex);
  } else {
    settings.isRunning = false;
    scheduleMaintenanceTimer();
    await broadcastState();
  }
}

async function ensureManagedTabs(): Promise<void> {
  const openTabs = await chrome.tabs.query({});
  const managedPages = getEnabledPages();
  const livePageIds = new Set(managedPages.map((page) => page.id));
  const claimedTabIds = new Set<number>();

  for (const page of managedPages) {
    let tab = await getExistingMappedTab(page);

    if (!tab) {
      tab = findReusableTabForPage(openTabs, page, claimedTabIds);
    }

    if (!tab) {
      tab = await chrome.tabs.create({ url: page.url, active: false });
    }

    if (tab.id !== undefined) {
      runtime.pageTabIds[page.id] = tab.id;
      claimedTabIds.add(tab.id);
      runtime.lastReloadAtByPageId[page.id] ??= Date.now();
      runtime.lastReopenAtByPageId[page.id] ??= Date.now();
    }
  }

  runtime.pageTabIds = Object.fromEntries(
    Object.entries(runtime.pageTabIds).filter(([pageId]) => livePageIds.has(pageId))
  );
  runtime.lastReloadAtByPageId = Object.fromEntries(
    Object.entries(runtime.lastReloadAtByPageId).filter(([pageId]) => livePageIds.has(pageId))
  );
  runtime.lastHourlyReloadBucketByPageId = Object.fromEntries(
    Object.entries(runtime.lastHourlyReloadBucketByPageId).filter(([pageId]) => livePageIds.has(pageId))
  );
  runtime.lastDailyReloadBucketByPageId = Object.fromEntries(
    Object.entries(runtime.lastDailyReloadBucketByPageId).filter(([pageId]) => livePageIds.has(pageId))
  );
  runtime.lastReopenAtByPageId = Object.fromEntries(
    Object.entries(runtime.lastReopenAtByPageId).filter(([pageId]) => livePageIds.has(pageId))
  );
  runtime.lastHourlyReopenBucketByPageId = Object.fromEntries(
    Object.entries(runtime.lastHourlyReopenBucketByPageId).filter(([pageId]) => livePageIds.has(pageId))
  );
  runtime.lastDailyReopenBucketByPageId = Object.fromEntries(
    Object.entries(runtime.lastDailyReopenBucketByPageId).filter(([pageId]) => livePageIds.has(pageId))
  );
  await saveRuntime(runtime);
}

async function activatePage(index: number): Promise<void> {
  runtime.currentPageIndex = clampIndex(index, settings.pages.length);
  const page = settings.pages[runtime.currentPageIndex];

  if (!page?.enabled) {
    const nextEnabledIndex = getClosestEnabledIndex(runtime.currentPageIndex);
    if (nextEnabledIndex !== null && nextEnabledIndex !== runtime.currentPageIndex) {
      await activatePage(nextEnabledIndex);
    } else {
      clearRotationTimer();
    }
    return;
  }

  if (!page) {
    clearRotationTimer();
    return;
  }

  const tab = await ensurePageTab(page);
  if (!tab?.id) {
    return;
  }

  const readyTab = await ensureTabLocation(tab, page);
  if (!readyTab?.id) {
    return;
  }

  if (settings.focusWindowOnSwitch && readyTab.windowId !== undefined) {
    await chrome.windows.update(readyTab.windowId, { focused: true });
  }

  await applyTabZoom(readyTab.id, page);
  await chrome.tabs.update(readyTab.id, { active: true });
  runtime.lastSwitchedAt = Date.now();
  await saveRuntime(runtime);
  scheduleRotationTimer();
  scheduleMaintenanceTimer();
  await broadcastState();
}

async function ensurePageTab(page: ManagedPage): Promise<chrome.tabs.Tab | null> {
  const existingMappedTab = await getExistingMappedTab(page);
  if (existingMappedTab) {
    return existingMappedTab;
  }

  const matchingTabs = await chrome.tabs.query({});
  const excludedTabIds = new Set(
    Object.entries(runtime.pageTabIds)
      .filter(([pageId]) => pageId !== page.id)
      .map(([, tabId]) => tabId)
  );
  const found = findReusableTabForPage(matchingTabs, page, excludedTabIds);
  if (found?.id !== undefined) {
    runtime.pageTabIds[page.id] = found.id;
    await saveRuntime(runtime);
    return found;
  }

  const created = await chrome.tabs.create({ url: page.url, active: false });
  if (created.id !== undefined) {
    runtime.pageTabIds[page.id] = created.id;
    runtime.lastReloadAtByPageId[page.id] ??= Date.now();
    runtime.lastReopenAtByPageId[page.id] ??= Date.now();
    await saveRuntime(runtime);
  }

  return created;
}

async function getExistingMappedTab(page: ManagedPage): Promise<chrome.tabs.Tab | null> {
  const tabId = runtime.pageTabIds[page.id];
  if (tabId === undefined) {
    return null;
  }

  try {
    return await chrome.tabs.get(tabId);
  } catch {
    delete runtime.pageTabIds[page.id];
  }

  return null;
}

function scheduleRotationTimer(): void {
  clearRotationTimer();

  if (!settings.isRunning || settings.pages.length === 0 || popupOpenCount > 0) {
    return;
  }

  const currentPage = settings.pages[runtime.currentPageIndex];
  if (!currentPage) {
    return;
  }

  rotationTimer = self.setTimeout(() => {
    void serialized(() => moveRelative(1));
  }, getDurationSec(currentPage) * 1000);
}

function scheduleMaintenanceTimer(): void {
  clearMaintenanceTimer();

  const nextDelayMs = getNextMaintenanceDelayMs();
  if (nextDelayMs === null) {
    return;
  }

  maintenanceTimer = self.setTimeout(() => {
    void serialized(handleDueMaintenance);
  }, nextDelayMs);
}

function getNextMaintenanceDelayMs(): number | null {
  if (getEnabledPages().length === 0) {
    return null;
  }

  const now = Date.now();
  let nextDelay: number | null = null;

  for (const page of getEnabledPages()) {
    if (!(page.id in runtime.pageTabIds)) {
      continue;
    }

    const reloadIntervalSec = getReloadIntervalSec(page);
    if (reloadIntervalSec) {
      const lastReloadAt = runtime.lastReloadAtByPageId[page.id] ?? now;
      const reloadDelay = Math.max(1000, lastReloadAt + reloadIntervalSec * 1000 - now);
      nextDelay = nextDelay === null ? reloadDelay : Math.min(nextDelay, reloadDelay);
    }

    if (page.reloadOnHour || page.reloadOnDay || page.reopenOnHour || page.reopenOnDay) {
      const hourlyDelay = Math.max(1000, getNextHourBoundary(now) - now);
      nextDelay = nextDelay === null ? hourlyDelay : Math.min(nextDelay, hourlyDelay);
    }

    const reopenIntervalSec = getReopenIntervalSec(page);
    if (reopenIntervalSec) {
      const lastReopenAt = runtime.lastReopenAtByPageId[page.id] ?? now;
      const reopenDelay = Math.max(1000, lastReopenAt + reopenIntervalSec * 1000 - now);
      nextDelay = nextDelay === null ? reopenDelay : Math.min(nextDelay, reopenDelay);
    }

  }

  return nextDelay;
}

async function handleDueMaintenance(): Promise<void> {
  if (getEnabledPages().length === 0) {
    return;
  }

  const now = Date.now();
  const hourBucket = getHourBucket(now);
  const dayBucket = getDayBucket(now);
  let didChange = false;

  for (const page of getEnabledPages()) {
    if (!(page.id in runtime.pageTabIds)) {
      continue;
    }

    const reloadIntervalSec = getReloadIntervalSec(page);
    const lastReloadAt = runtime.lastReloadAtByPageId[page.id] ?? now;
    const lastHourlyReloadBucket = runtime.lastHourlyReloadBucketByPageId[page.id] ?? -1;
    const lastDailyReloadBucket = runtime.lastDailyReloadBucketByPageId[page.id] ?? -1;
    if (page.reloadOnDay && isTopOfDay(now) && lastDailyReloadBucket !== dayBucket) {
      await reloadPage(page);
      runtime.lastDailyReloadBucketByPageId[page.id] = dayBucket;
      runtime.lastHourlyReloadBucketByPageId[page.id] = hourBucket;
      didChange = true;
      continue;
    }
    if (page.reloadOnHour && isTopOfHour(now) && lastHourlyReloadBucket !== hourBucket) {
      await reloadPage(page);
      runtime.lastHourlyReloadBucketByPageId[page.id] = hourBucket;
      didChange = true;
      continue;
    }
    if (reloadIntervalSec && now - lastReloadAt >= reloadIntervalSec * 1000) {
      await reloadPage(page);
      didChange = true;
      continue;
    }

    const reopenIntervalSec = getReopenIntervalSec(page);
    const lastReopenAt = runtime.lastReopenAtByPageId[page.id] ?? now;
    const lastHourlyReopenBucket = runtime.lastHourlyReopenBucketByPageId[page.id] ?? -1;
    const lastDailyReopenBucket = runtime.lastDailyReopenBucketByPageId[page.id] ?? -1;
    if (page.reopenOnDay && isTopOfDay(now) && lastDailyReopenBucket !== dayBucket) {
      await reopenPage(page);
      runtime.lastDailyReopenBucketByPageId[page.id] = dayBucket;
      runtime.lastHourlyReopenBucketByPageId[page.id] = hourBucket;
      didChange = true;
      continue;
    }
    if (page.reopenOnHour && isTopOfHour(now) && lastHourlyReopenBucket !== hourBucket) {
      await reopenPage(page);
      runtime.lastHourlyReopenBucketByPageId[page.id] = hourBucket;
      didChange = true;
      continue;
    }
    if (reopenIntervalSec && now - lastReopenAt >= reopenIntervalSec * 1000) {
      await reopenPage(page);
      didChange = true;
    }
  }

  if (didChange) {
    await saveRuntime(runtime);
    await broadcastState();
  }

  scheduleMaintenanceTimer();
}

async function reloadPage(page: ManagedPage): Promise<void> {
  const tab = await ensurePageTab(page);
  if (!tab?.id) {
    return;
  }

  const readyTab = await ensureTabLocation(tab, page);
  if (!readyTab?.id) {
    return;
  }

  try {
    await chrome.tabs.reload(readyTab.id);
    await applyTabZoom(readyTab.id, page);
    runtime.lastReloadAtByPageId[page.id] = Date.now();
  } catch {
    await reopenPage(page);
    return;
  }

  await saveRuntime(runtime);
  scheduleMaintenanceTimer();
}

async function reopenPage(page: ManagedPage): Promise<void> {
  const currentTabId = runtime.pageTabIds[page.id];
  const shouldActivate = settings.pages[runtime.currentPageIndex]?.id === page.id;

  if (currentTabId !== undefined) {
    try {
      await chrome.tabs.remove(currentTabId);
    } catch {
      // Ignore already-closed tabs and recreate below.
    }
  }

  const created = await createPageTab(page, shouldActivate);
  if (!created?.id) {
    return;
  }

  runtime.pageTabIds[page.id] = created.id;
  const now = Date.now();
  runtime.lastReloadAtByPageId[page.id] = now;
  runtime.lastReopenAtByPageId[page.id] = now;

  if (shouldActivate) {
    runtime.lastSwitchedAt = now;
  }

  await saveRuntime(runtime);
  scheduleMaintenanceTimer();
}

async function ensureTabLocation(tab: chrome.tabs.Tab, page: ManagedPage): Promise<chrome.tabs.Tab | null> {
  if (tab.id === undefined) {
    return null;
  }

  const currentUrl = tab.pendingUrl ?? tab.url;
  if (!currentUrl || doesTabBelongToPage(currentUrl, page)) {
    await applyTabZoom(tab.id, page);
    return tab;
  }

  try {
    const updatedTab = await chrome.tabs.update(tab.id, { url: page.url });
    await applyTabZoom(tab.id, page);
    return updatedTab;
  } catch {
    await reopenPage(page);
    return getExistingMappedTab(page);
  }
}

function getReloadIntervalSec(page: ManagedPage): number | null {
  return page.reloadEverySec ?? settings.globalReloadEverySec;
}

function getReopenIntervalSec(page: ManagedPage): number | null {
  return page.reopenEverySec ?? settings.globalReopenEverySec;
}

function getDurationSec(page: ManagedPage): number {
  return page.durationSec || settings.globalDurationSec || 5;
}

function getEnabledPages(): ManagedPage[] {
  return settings.pages.filter((page) => page.enabled);
}

function getEnabledPageIndexes(): number[] {
  return settings.pages.flatMap((page, index) => page.enabled ? [index] : []);
}

function getClosestEnabledIndex(fromIndex: number): number | null {
  const enabledIndexes = getEnabledPageIndexes();
  if (enabledIndexes.length === 0) {
    return null;
  }

  const nextIndex = enabledIndexes.find((index) => index >= fromIndex);
  return nextIndex ?? enabledIndexes[0];
}

function getHourBucket(timestamp: number): number {
  return Math.floor(timestamp / (60 * 60 * 1000));
}

function getDayBucket(timestamp: number): number {
  return Math.floor(timestamp / (24 * 60 * 60 * 1000));
}

function isTopOfHour(timestamp: number): boolean {
  const date = new Date(timestamp);
  return date.getMinutes() === 0;
}

function isTopOfDay(timestamp: number): boolean {
  const date = new Date(timestamp);
  return date.getHours() === 0 && date.getMinutes() === 0;
}

function getNextHourBoundary(timestamp: number): number {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.getTime();
}

async function collectManagedTabIds(): Promise<number[]> {
  const tabIds = new Set<number>(Object.values(runtime.pageTabIds));
  const allTabs = await chrome.tabs.query({});

  for (const page of getEnabledPages()) {
    for (const tab of allTabs) {
      if (tab.id === undefined || !tab.url) {
        continue;
      }
      if (doesTabBelongToPage(tab.url, page)) {
        tabIds.add(tab.id);
      }
    }
  }

  return [...tabIds];
}

async function getPublicState(): Promise<PublicState> {
  return {
    settings,
    runtime,
    currentPage: settings.pages[runtime.currentPageIndex] ?? null
  };
}

async function broadcastState(): Promise<void> {
  const state = await getPublicState();
  try {
    await chrome.runtime.sendMessage({ type: "stateChanged", state });
  } catch {
    // No extension page is listening.
  }
  await updateActionBadge();
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const nextTask = mutationQueue.then(task, task);
  mutationQueue = nextTask.then(() => undefined, () => undefined);
  return nextTask;
}

function clearRotationTimer(): void {
  if (rotationTimer !== null) {
    clearTimeout(rotationTimer);
    rotationTimer = null;
  }
}

function clearMaintenanceTimer(): void {
  if (maintenanceTimer !== null) {
    clearTimeout(maintenanceTimer);
    maintenanceTimer = null;
  }
}

function findReusableTabForPage(
  tabs: chrome.tabs.Tab[],
  page: ManagedPage,
  excludedTabIds: Set<number>
): chrome.tabs.Tab | null {
  for (const tab of tabs) {
    if (tab.id === undefined || excludedTabIds.has(tab.id) || !tab.url) {
      continue;
    }

    if (doesTabBelongToPage(tab.url, page)) {
      return tab;
    }
  }

  return null;
}

function doesTabBelongToPage(actualUrl: string, page: ManagedPage): boolean {
  return isManagedUrlMatch(actualUrl, page.url);
}

function isManagedUrlMatch(actualUrl: string, targetUrl: string): boolean {
  if (normalizeComparableUrl(actualUrl) === normalizeComparableUrl(targetUrl)) {
    return true;
  }

  try {
    const actual = new URL(actualUrl);
    const target = new URL(targetUrl);

    actual.hash = "";
    target.hash = "";

    if (actual.origin !== target.origin) {
      return false;
    }

    if (actual.search !== target.search) {
      return false;
    }

    return isRootPath(target.pathname);
  } catch {
    return false;
  }
}

function normalizeComparableUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

function isRootPath(pathname: string): boolean {
  return pathname === "" || pathname === "/";
}

function clampIndex(index: number, pageCount: number): number {
  if (pageCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), pageCount - 1);
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

async function createPageTab(page: ManagedPage, active: boolean): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.create({ url: page.url, active });
  if (active && settings.focusWindowOnSwitch && tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  return tab;
}

async function updateActionBadge(): Promise<void> {
  const hasTabs = Object.keys(runtime.pageTabIds).length > 0;
  const text = settings.isRunning ? "ON" : hasTabs ? "OFF" : "";
  await chrome.action.setBadgeText({ text });

  if (text) {
    const color = settings.isRunning ? "#2e7d32" : "#666666";
    await chrome.action.setBadgeBackgroundColor({ color });
  }

  await updateActionIcon(settings.isRunning ? "running" : hasTabs ? "paused" : "idle");
}

async function updateActionIcon(state: "running" | "paused" | "idle"): Promise<void> {
  try {
    await chrome.action.setIcon({
      imageData: {
        16: createActionIconImageData(16, state),
        32: createActionIconImageData(32, state)
      }
    });
  } catch {
    // Ignore icon rendering failures and keep the badge as fallback.
  }
}

function createActionIconImageData(size: number, state: "running" | "paused" | "idle"): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Missing 2d context");
  }

  context.clearRect(0, 0, size, size);
  context.fillStyle = state === "running" ? "#2e7d32" : state === "paused" ? "#666666" : "#9aa0a6";
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#ffffff";
  if (state === "running") {
    context.beginPath();
    context.moveTo(size * 0.38, size * 0.28);
    context.lineTo(size * 0.72, size * 0.5);
    context.lineTo(size * 0.38, size * 0.72);
    context.closePath();
    context.fill();
  } else if (state === "paused") {
    context.fillRect(size * 0.32, size * 0.28, size * 0.12, size * 0.44);
    context.fillRect(size * 0.56, size * 0.28, size * 0.12, size * 0.44);
  } else {
    context.fillRect(size * 0.28, size * 0.46, size * 0.44, size * 0.08);
  }

  return context.getImageData(0, 0, size, size);
}

async function applyTabZoom(tabId: number, page: ManagedPage): Promise<void> {
  try {
    await chrome.tabs.setZoomSettings(tabId, {
      mode: "automatic",
      scope: "per-tab"
    });
    await chrome.tabs.setZoom(tabId, page.zoomPercent / 100);
  } catch {
    // Some pages do not support zoom changes.
  }
}
