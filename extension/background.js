const state = {
  recorderTabId: null,
  sourceTabId: null,
  sourceTabTitle: "",
  sourceArmed: false,
};

function swallowLastError() {
  void chrome.runtime.lastError;
}

function sendStatusToRecorder() {
  if (!Number.isInteger(state.recorderTabId)) {
    return;
  }

  chrome.tabs.sendMessage(
    state.recorderTabId,
    {
      channel: "frameforge",
      type: "DEMO_STATUS",
      payload: {
        connected: true,
        armed: state.sourceArmed,
        sourceTabId: state.sourceTabId,
        sourceTabTitle: state.sourceTabTitle,
      },
    },
    swallowLastError
  );
}

function sendArmedStateToSource(tabId, armed) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  chrome.tabs.sendMessage(
    tabId,
    {
      channel: "frameforge",
      type: "FF_SET_ARMED",
      payload: { armed: Boolean(armed) },
    },
    swallowLastError
  );
}

function disarmSourceTab() {
  if (Number.isInteger(state.sourceTabId)) {
    sendArmedStateToSource(state.sourceTabId, false);
  }
  state.sourceTabId = null;
  state.sourceTabTitle = "";
  state.sourceArmed = false;
}

function armSourceTab(tabId) {
  if (!Number.isInteger(tabId)) {
    return { ok: false, error: "Invalid source tab." };
  }

  if (Number.isInteger(state.sourceTabId) && state.sourceTabId !== tabId) {
    sendArmedStateToSource(state.sourceTabId, false);
  }

  state.sourceTabId = tabId;
  state.sourceArmed = true;
  sendArmedStateToSource(tabId, true);

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      state.sourceTabTitle = "";
      sendStatusToRecorder();
      return;
    }
    state.sourceTabTitle = tab?.title || "";
    sendStatusToRecorder();
  });

  return {
    ok: true,
    payload: {
      armed: true,
      sourceTabId: state.sourceTabId,
      sourceTabTitle: state.sourceTabTitle,
    },
  };
}

function getStatusPayload() {
  return {
    connected: true,
    armed: state.sourceArmed,
    sourceTabId: state.sourceTabId,
    sourceTabTitle: state.sourceTabTitle,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.origin !== "frameforge") {
    return false;
  }

  const senderTabId = sender.tab?.id ?? null;
  const payload = message.payload || {};

  if (message.type === "DEMO_CONNECT") {
    state.recorderTabId = senderTabId;
    sendStatusToRecorder();
    sendResponse({ ok: true, payload: getStatusPayload() });
    return true;
  }

  if (message.type === "DEMO_GET_STATUS") {
    sendResponse({ ok: true, payload: getStatusPayload() });
    return true;
  }

  if (message.type === "DEMO_DISARM") {
    disarmSourceTab();
    sendStatusToRecorder();
    sendResponse({ ok: true, payload: getStatusPayload() });
    return true;
  }

  if (message.type === "DEMO_ARM_SOURCE_TAB" || message.type === "FF_ARM_SOURCE") {
    const result = armSourceTab(payload.tabId);
    sendStatusToRecorder();
    sendResponse(result);
    return true;
  }

  if (message.type === "FF_SOURCE_EVENT") {
    if (!state.sourceArmed || senderTabId !== state.sourceTabId) {
      sendResponse({ ok: false, error: "Source tab is not armed." });
      return true;
    }

    if (Number.isInteger(state.recorderTabId)) {
      chrome.tabs.sendMessage(
        state.recorderTabId,
        {
          channel: "frameforge",
          type: "DEMO_EVENT",
          payload,
        },
        swallowLastError
      );
    }

    sendResponse({ ok: true });
    return true;
  }

  sendResponse({ ok: false, error: `Unsupported message type: ${message.type}` });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === state.recorderTabId) {
    state.recorderTabId = null;
  }
  if (tabId === state.sourceTabId) {
    disarmSourceTab();
    sendStatusToRecorder();
  }
});
