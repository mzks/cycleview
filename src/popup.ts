import { PublicState } from "./types";

const runStateElement = mustElement<HTMLHeadingElement>("run-state");
const currentPageElement = mustElement<HTMLParagraphElement>("current-page");
const toggleButton = mustElement<HTMLButtonElement>("toggle-button");
const previousButton = mustElement<HTMLButtonElement>("previous-button");
const nextButton = mustElement<HTMLButtonElement>("next-button");
const optionsButton = mustElement<HTMLButtonElement>("options-button");
const shortcutList = mustElement<HTMLDivElement>("shortcut-list");
const popupPort = chrome.runtime.connect({ name: "cycleview-popup" });

void popupPort;

void refreshState();
void renderShortcuts();

toggleButton.addEventListener("click", () => {
  void sendActionAndClose("toggleRun");
});
previousButton.addEventListener("click", () => {
  void sendAction("previous");
});
nextButton.addEventListener("click", () => {
  void sendAction("next");
});
optionsButton.addEventListener("click", () => {
  void openOptionsAndClose();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "stateChanged") {
    renderState(message.state as PublicState);
  }
});

async function refreshState(): Promise<void> {
  const state = await chrome.runtime.sendMessage({ type: "getState" }) as PublicState;
  renderState(state);
}

async function sendAction(type: string): Promise<void> {
  const state = await chrome.runtime.sendMessage({ type }) as PublicState;
  renderState(state);
}

async function sendActionAndClose(type: string): Promise<void> {
  await chrome.runtime.sendMessage({ type });
  window.close();
}

async function openOptionsAndClose(): Promise<void> {
  await chrome.runtime.openOptionsPage();
  window.close();
}

function renderState(state: PublicState): void {
  const currentPage = state.currentPage;
  const isRunning = state.settings.isRunning;
  runStateElement.textContent = isRunning ? "Status: running" : "Status: paused";
  const durationSec = currentPage?.durationSec ?? state.settings.globalDurationSec ?? 20;
  currentPageElement.textContent = currentPage
    ? `${currentPage.name} (${durationSec}s)`
    : "No page configured";
  toggleButton.textContent = isRunning ? "Pause" : "Start";
  toggleButton.classList.toggle("is-running", isRunning);
  toggleButton.classList.toggle("is-paused", !isRunning);
  const hasPage = Boolean(currentPage);
  previousButton.disabled = !hasPage;
  nextButton.disabled = !hasPage;
}

async function renderShortcuts(): Promise<void> {
  const commands = await chrome.commands.getAll();
  const commandMap = new Map(commands.map((command) => [command.name, command.shortcut || "Not set"]));
  const rows = [
    ["Start / Pause", commandMap.get("toggle-run") || "Not set"],
    ["Start", commandMap.get("start-run") || "Not set"],
    ["Pause", commandMap.get("pause-run") || "Not set"],
    ["Next", commandMap.get("next-page") || "Not set"],
    ["Previous", commandMap.get("previous-page") || "Not set"]
  ];

  shortcutList.replaceChildren(
    ...rows.map(([label, shortcut]) => {
      const row = document.createElement("div");
      row.className = "shortcut-row";
      const left = document.createElement("span");
      left.textContent = label;
      const right = document.createElement("span");
      right.textContent = shortcut;
      row.append(left, right);
      return row;
    })
  );
}

function mustElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}
