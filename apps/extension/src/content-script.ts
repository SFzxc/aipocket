const script = document.createElement("script");
script.src = chrome.runtime.getURL("inpageProvider.js");
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.target !== "ai-wallet-content") {
    return;
  }

  if (event.data.streamId) {
    const streamId = event.data.streamId;
    const port = chrome.runtime.connect({ name: "ai-wallet-stream" });
    let terminalReceived = false;

    port.onMessage.addListener((payload) => {
      if (payload?.type === "done" || payload?.type === "error") {
        terminalReceived = true;
      }

      window.postMessage(
        {
          target: "ai-wallet-page",
          streamId,
          payload
        },
        window.location.origin
      );
    });

    port.onDisconnect.addListener(() => {
      if (terminalReceived) {
        return;
      }

      window.postMessage(
        {
          target: "ai-wallet-page",
          streamId,
          payload: { type: "error", error: "AI Wallet stream disconnected" }
        },
        window.location.origin
      );
    });

    port.postMessage(event.data.payload);
    return;
  }

  chrome.runtime.sendMessage(event.data.payload, (response) => {
    window.postMessage(
      {
        target: "ai-wallet-page",
        id: event.data.id,
        payload: response
      },
      window.location.origin
    );
  });
});
