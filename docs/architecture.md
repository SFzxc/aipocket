# AIPocket Architecture

## Overview

AIPocket is a Chrome MV3 extension that lets websites request approved AI model access without receiving the user's AI provider API keys.

The website talks to `window.aiWallet`. The extension owns provider API key storage, provider configuration, approval, session validation, upstream API calls, and stream forwarding.

## Packages

```text
apps/extension
  Chrome MV3 extension. Stores providers, injects provider API, handles approval, validates sessions, brokers streams.

apps/demo-web
  Demo React website. Connects to AIPocket and renders streamed response.

packages/connect-modal
  Website-facing helper library. Calls window.aiWallet methods and exposes convenient connect/stream APIs.

packages/protocol
  Shared protocol types and validation helpers.
```

## Trust Boundary

The website is untrusted.

Website can receive:

- `sessionId`
- origin/session metadata
- provider id
- approved model list
- expiration time
- request usage metadata
- streamed output text

Website must never receive:

- provider API keys
- extension storage values
- unrestricted endpoint control

The extension validates every stream request against stored provider and session state.

## Provider Registry

The extension stores multiple provider configs under `aiWalletProviders`.

Provider config shape:

```ts
type ProviderConfig = {
  id: string;
  type: "openai-compatible" | "anthropic-compatible" | "openrouter" | "gemini";
  name: string;
  apiKey: string;
  endpoint?: string;
  models: string[];
  enabled: boolean;
  requestLimit?: number;
};
```

Provider types:

- `openai-compatible`
- `anthropic-compatible`
- `openrouter`
- `gemini`

The background service worker routes provider checks, model discovery, and streams through provider adapters. Websites cannot choose arbitrary endpoints per request.

## Protocol Methods

```ts
type AiWalletMethod =
  | "ai_requestAccounts"
  | "ai_getPermissions"
  | "ai_getModels"
  | "ai_requestResponseStream"
  | "ai_disconnect";
```

### `ai_requestAccounts`

Website requests permission for one provider and one or more models.

```ts
await window.aiWallet.request({
  method: "ai_requestAccounts",
  params: {
    models: ["gpt-5.5"],
    reason: "Demo conversation needs AI response access"
  }
});
```

Extension shows approval UI. If approved, extension returns an `AiWalletPermission`.

### `ai_getPermissions`

Website asks for active permissions for current origin/tab/frame.

### `ai_getModels`

Website asks for currently available model inventory. This is discovery metadata and not a stream permission.

### `ai_requestResponseStream`

Website requests a streamed response using an approved `sessionId`, `providerId`, and model.

### `ai_disconnect`

Website revokes its current session.

## Session Model

Sessions are temporary capabilities.

```ts
type StoredSession = {
  sessionId: string;
  origin: string;
  tabId: number;
  frameId: number;
  providerId: string;
  models: string[];
  expiresAt: string;
  requestLimit?: number;
  requestCount: number;
};
```

Validation checks:

- origin matches
- tabId matches
- frameId matches
- sessionId exists
- session not expired
- provider id matches
- provider exists and is enabled
- model is approved for session
- model exists in provider model list
- request limit is not reached

## Stream Broker

The stream broker lives in the background service worker.

It receives stream requests over a `chrome.runtime.Port`, validates provider/session state, calls the selected provider adapter, parses stream events, and forwards deltas back to the content script.

## MV3 Lifecycle Notes

Chrome MV3 background runs as a service worker. It can stop when idle.

For streaming, the port helps keep the worker alive while stream is active. The implementation must still handle disconnects and abort the upstream fetch when the page navigates, tab closes, or port disconnects.

## Error Handling

Extension should return structured errors for:

- missing extension provider
- missing provider
- disabled provider
- invalid provider config
- endpoint/API key compatibility check failed
- unsupported model
- unapproved model
- missing session
- expired session
- origin mismatch
- provider mismatch
- request limit reached
- upstream request failure
- upstream stream error event
- port disconnect

## MVP Success Criteria

1. User loads unpacked extension.
2. User adds and checks a provider.
3. User runs demo website.
4. Demo calls `connectAiWallet()` with `providerId` and requested models.
5. Extension shows approval UI.
6. User approves model access.
7. Demo sends `1+2=?`.
8. Extension calls configured provider without exposing API key.
9. Demo renders streamed result, expected answer `3`.
