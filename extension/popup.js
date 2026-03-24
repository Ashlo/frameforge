const sourceStatus = document.getElementById("sourceStatus");
const armCurrentTabBtn = document.getElementById("armCurrentTabBtn");
const disarmBtn = document.getElementById("disarmBtn");

function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        origin: "frameforge",
        type,
        payload,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || `Failed: ${type}`));
          return;
        }
        resolve(response.payload || {});
      }
    );
  });
}

function updateStatus(payload) {
  if (!payload?.armed) {
    sourceStatus.textContent = "not armed";
    return;
  }

  if (payload.sourceTabTitle) {
    sourceStatus.textContent = `armed: ${payload.sourceTabTitle}`;
    return;
  }

  sourceStatus.textContent = `armed: tab ${payload.sourceTabId ?? "unknown"}`;
}

async function refreshStatus() {
  try {
    const status = await sendMessage("DEMO_GET_STATUS");
    updateStatus(status);
  } catch (error) {
    sourceStatus.textContent = `error: ${error instanceof Error ? error.message : "unavailable"}`;
  }
}

armCurrentTabBtn.addEventListener("click", async () => {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      throw new Error("No active tab.");
    }
    await sendMessage("FF_ARM_SOURCE", { tabId: activeTab.id });
    await refreshStatus();
  } catch (error) {
    sourceStatus.textContent = `error: ${error instanceof Error ? error.message : "arm failed"}`;
  }
});

disarmBtn.addEventListener("click", async () => {
  try {
    await sendMessage("DEMO_DISARM");
    await refreshStatus();
  } catch (error) {
    sourceStatus.textContent = `error: ${error instanceof Error ? error.message : "disarm failed"}`;
  }
});

refreshStatus();
