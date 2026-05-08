export interface ManagedPage {
  id: string;
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

export interface AppSettings {
  pages: ManagedPage[];
  globalDurationSec: number | null;
  globalReloadEverySec: number | null;
  globalReopenEverySec: number | null;
  focusWindowOnSwitch: boolean;
  pauseOnPageClick: boolean;
  autoStartOnBrowserLaunch: boolean;
  isRunning: boolean;
}

export interface RuntimeState {
  currentPageIndex: number;
  pageTabIds: Record<string, number>;
  lastReloadAtByPageId: Record<string, number>;
  lastHourlyReloadBucketByPageId: Record<string, number>;
  lastDailyReloadBucketByPageId: Record<string, number>;
  lastReopenAtByPageId: Record<string, number>;
  lastHourlyReopenBucketByPageId: Record<string, number>;
  lastDailyReopenBucketByPageId: Record<string, number>;
  lastSwitchedAt: number | null;
}

export interface PublicState {
  settings: AppSettings;
  runtime: RuntimeState;
  currentPage: ManagedPage | null;
}

export interface ExtensionMessage {
  type:
    | "getState"
    | "start"
    | "pause"
    | "toggleRun"
    | "next"
    | "previous"
    | "reloadCurrent"
    | "closeTabs"
    | "startOnly"
    | "pauseOnly"
    | "pageClicked"
    | "settingsUpdated";
}

export const DEFAULT_SETTINGS: AppSettings = {
  pages: [],
  globalDurationSec: 5,
  globalReloadEverySec: null,
  globalReopenEverySec: null,
  focusWindowOnSwitch: false,
  pauseOnPageClick: true,
  autoStartOnBrowserLaunch: false,
  isRunning: false
};

export const DEFAULT_RUNTIME: RuntimeState = {
  currentPageIndex: 0,
  pageTabIds: {},
  lastReloadAtByPageId: {},
  lastHourlyReloadBucketByPageId: {},
  lastDailyReloadBucketByPageId: {},
  lastReopenAtByPageId: {},
  lastHourlyReopenBucketByPageId: {},
  lastDailyReopenBucketByPageId: {},
  lastSwitchedAt: null
};
