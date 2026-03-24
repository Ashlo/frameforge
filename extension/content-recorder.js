const CHANNEL_TO_EXTENSION = "frameforge:page-to-extension";
const CHANNEL_FROM_EXTENSION = "frameforge:extension-to-page";

function postToPage(message) {
  window.postMessage(
    {
      channel: CHANNEL_FROM_EXTENSION,
      ...message,
    },
    "*"
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || data.channel !== CHANNEL_TO_EXTENSION || typeof data.id !== "string") {
    return;
  }

  chrome.runtime.sendMessage(
    {
      origin: "frameforge",
      type: data.type,
      payload: data.payload || {},
    },
    (response) => {
      if (chrome.runtime.lastError) {
        postToPage({
          replyTo: data.id,
          ok: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }

      if (response?.ok === false) {
        postToPage({
          replyTo: data.id,
          ok: false,
          error: response.error || "Extension request failed.",
        });
        return;
      }

      postToPage({
        replyTo: data.id,
        ok: true,
        payload: response?.payload || {},
      });
    }
  );
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.channel !== "frameforge") {
    return;
  }

  postToPage({
    type: message.type,
    payload: message.payload || {},
  });
});
