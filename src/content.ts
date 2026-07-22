let port: chrome.runtime.Port | null = null;
let heartbeatTimer: number | null = null;
let reconnectTimer: number | null = null;

connect();
document.addEventListener("click", handleClick, { capture: true });
window.addEventListener("pagehide", teardown);

function connect(): void {
  if (!canUseRuntime()) {
    teardown();
    return;
  }

  try {
    port = chrome.runtime.connect({ name: "cycleview-heartbeat" });
    port.onDisconnect.addListener(() => {
      port = null;
      if (canUseRuntime()) {
        scheduleReconnect();
      } else {
        teardown();
      }
    });
    startHeartbeat();
  } catch {
    if (canUseRuntime()) {
      scheduleReconnect();
    } else {
      teardown();
    }
  }
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    if (!canUseRuntime()) {
      teardown();
      return;
    }

    try {
      port?.postMessage({ type: "heartbeat", url: location.href });
    } catch {
      stopHeartbeat();
      if (canUseRuntime()) {
        scheduleReconnect();
      } else {
        teardown();
      }
    }
  }, 20000);
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleReconnect(): void {
  stopHeartbeat();
  if (reconnectTimer !== null) {
    return;
  }

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

function handleClick(event: MouseEvent): void {
  // Dashboard pages can dispatch synthetic click events while initializing.
  // Only a physical user interaction should pause rotation.
  if (!event.isTrusted) {
    return;
  }

  if (!canUseRuntime()) {
    teardown();
    return;
  }

  try {
    void chrome.runtime.sendMessage({ type: "pageClicked" }).catch(() => {
      // Ignore messaging failures.
    });
  } catch {
    teardown();
  }
}

function canUseRuntime(): boolean {
  try {
    return typeof chrome !== "undefined" && typeof chrome.runtime?.id === "string";
  } catch {
    return false;
  }
}

function teardown(): void {
  stopHeartbeat();
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    port?.disconnect();
  } catch {
    // Ignore disconnect failures after invalidation.
  }
  port = null;
}
