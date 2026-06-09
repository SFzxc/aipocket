# Setup Guide

## Requirements

- Node.js with npm.
- Chrome or Chromium browser.
- OpenAI API key or API key accepted by an OpenAI Responses API compatible proxy.
- Optional proxy endpoint compatible with `POST /v1/responses` streaming.

## Install Dependencies

From repo root:

```sh
npm install
```

## Build All Workspaces

```sh
npm run build
```

## Run Tests

```sh
npm test
```

## Typecheck

```sh
npm run typecheck
```

## Build Extension

```sh
npm run build -w @ai-wallet/extension
```

Chrome extension output:

```text
apps/extension/dist
```

## Install Extension Locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select `apps/extension/dist`.
6. Open extension popup.
7. Click `Providers`.
8. Click `Add provider`.
9. Choose provider type: `OpenAI-compatible`, `Anthropic-compatible`, `OpenRouter`, or `Gemini`.
10. Enter provider name and API key.
11. Enter endpoint when provider type shows endpoint field.
12. Optionally set `Max requests per session`.
13. Click `Check connection`.
14. Click `Save provider` after check succeeds.
15. Use popup `Connected sites` section to refresh active sessions or revoke one session.

Request limit is per approved website session. Empty limit means no request-count cap.

Default endpoint:

```text
https://api.openai.com/v1/responses
```

Proxy endpoint requirement:

```text
OpenAI Responses API compatible streaming endpoint
```

The extension derives Responses and Models endpoints from one configured URL. If the path ends with `/responses`, the models endpoint is sibling `/models`; otherwise the extension appends `/responses` and `/models` to the configured path.

```text
https://proxy.example/openai -> https://proxy.example/openai/responses
https://proxy.example/openai -> https://proxy.example/openai/models
https://api.openai.com/v1/responses -> https://api.openai.com/v1/models
```

During `Check`, the extension calls the resolved `/models` endpoint first. If model discovery fails, it uses fallback MVP models, shows a warning, then still verifies the Responses endpoint with a pong check.

## Run Demo Website

```sh
npm run dev -w @ai-wallet/demo-web
```

Open shown localhost URL in Chrome where extension is installed.

Expected MVP flow:

1. Click `Connect AI Wallet`.
2. Approve requested model in extension approval UI.
3. Keep default prompt `1+2=?`.
4. Click `Send`.
5. Output field streams answer, expected `3`.
6. Click `Disconnect AI Wallet` to revoke current session and clear demo output.

Approved sessions last 30 minutes. They are stored in extension `chrome.storage.local` under `aiWalletSessions`, so `ai_getPermissions` and streaming can restore them after a MV3 service worker restart until expiration or revoke.

## Use ConnectModal Package

Install package in a website app once package publishing/linking is configured:

```sh
npm install @ai-wallet/connect-modal
```

Use connect API:

```ts
import { connectAiWallet, disconnectAiWallet, getAiWalletModels, getAiWalletPermissions, requestResponseStream } from "@ai-wallet/connect-modal"

const modelInfo = await getAiWalletModels()
const existing = await getAiWalletPermissions()
const permission = existing[0] ?? await connectAiWallet({
  providerId: "provider_openai",
  models: modelInfo.models,
  reason: "Demo conversation needs AI response access"
})

await requestResponseStream({
  sessionId: permission.sessionId,
  providerId: permission.providerId,
  model: permission.models[0],
  input: "1+2=?",
  onDelta(delta) {
    setOutput((previous) => previous + delta)
  }
})

await disconnectAiWallet(permission.sessionId)
```

## Troubleshooting

### Provider Missing

If website cannot find `window.aiWallet`:

- Confirm extension is installed and enabled.
- Confirm current page matches content script permissions.
- Reload website tab after installing extension.

### Missing API Key

Open extension popup and save API key.

### Wrong Endpoint

Use default endpoint or an OpenAI Responses API compatible proxy endpoint.

Run popup `Check` again after changing endpoint or API key.

### Check Failed

Common causes:

- Endpoint is not HTTPS.
- Endpoint is not OpenAI Responses API compatible.
- API key is invalid for that endpoint.
- Model `gpt-5.5` is unavailable on that endpoint.
- Proxy does not support requested streaming/non-streaming mode.

### Stream Stops Early

Common causes:

- Tab navigated.
- Tab closed.
- Port disconnected.
- MV3 service worker was interrupted.
- Upstream endpoint closed connection.

### Model Rejected

Use MVP supported stream-capable model:

```text
gpt-5.5
```
