# AIPocket MVP Gap Proposal

## Goal

Build first end-to-end MVP where a demo website connects to the AIPocket Chrome extension, gets an approved session, sends `1+2=?`, and renders streamed output from an OpenAI Responses API compatible endpoint.

## Current State

The repo already has a working scaffold:

- `packages/protocol`: shared model list, protocol types, session permission validator.
- `packages/connect-modal`: website helper APIs for connect and stream request delegation.
- `apps/demo-web`: basic React demo with connect, prompt input, send button, output area.
- `apps/extension`: MV3 manifest, content script, injected `window.aiWallet`, background placeholder, popup API key storage.

Current verification has passed before:

- `npm test`
- `npm run typecheck`
- `npm run build`

## Missing MVP Tasks

### Extension Settings

The extension must store both:

- `openAiApiKey`
- `aiServiceEndpoint`

Default endpoint:

```text
https://api.openai.com/v1/responses
```

The configured endpoint must be OpenAI Responses API compatible. The website must not choose or override the endpoint.

The settings UI must include a `Check` button before save. The extension should only save API key and endpoint after a successful compatibility check.

Check behavior:

- Validate endpoint is a valid HTTPS URL.
- Send a minimal OpenAI Responses API compatible request from the extension background.
- Use the entered API key in `Authorization: Bearer <key>`.
- Use `gpt-5.5` and a tiny prompt such as `1+1=?`.
- Confirm response can be parsed or streamed according to Responses API shape.
- Show clear success or failure message in popup.
- Do not expose API key or response details to website.

### Supported Models

The current scaffold still has older hardcoded models. MVP implementation must switch the supported model list and demo default to:

```text
gpt-5.5
```

Earlier `gpt-4.*` defaults are not suitable for this MVP because they do not support the required streaming behavior in the current target environment.

### Approval UI

The extension must show approval UI when a website calls `ai_requestAccounts`.

Approval UI must show:

- Requesting origin.
- Requested models.
- Requested reason.
- Approve button.
- Reject button.
- Model selection controls.

### Session Permission

The extension must create a session after approval:

```ts
type AiWalletPermission = {
  sessionId: string
  origin: string
  models: string[]
  expiresAt: string
}
```

For MVP, session should be scoped by:

- `origin`
- `tabId`
- `frameId`
- `sessionId`
- approved model list
- expiration time

Recommended MVP expiration:

```text
30 minutes or tab close, whichever happens first
```

### Provider Protocol

These methods must work end-to-end:

- `ai_requestAccounts`
- `ai_getPermissions`
- `ai_requestResponseStream`
- `ai_disconnect`

### Streaming Broker

The stream path must use a long-lived `chrome.runtime.Port`:

```text
page -> content script -> runtime.Port -> background -> AI endpoint -> background -> content script -> page
```

The background service worker must:

- Validate session before calling endpoint.
- Read API key and endpoint from extension storage.
- Call configured endpoint with Responses API request shape.
- Parse SSE events.
- Forward deltas back to website.
- Cancel upstream request when port disconnects.

### OpenAI-Compatible Client

Request shape:

```json
{
  "model": "gpt-5.5",
  "input": "1+2=?",
  "stream": true
}
```

Events to parse:

```text
response.output_text.delta
response.completed
response.error
```

### Demo Website

The demo must:

- Detect missing provider.
- Connect through `connectAiWallet()`.
- Display approved models/session state.
- Send prompt through `requestResponseStream()`.
- Append streamed deltas into a fixed output field.
- Show errors clearly.

### Tests

Minimum useful tests:

- Protocol validates origin/session/model/expiration.
- Session store creates, reads, revokes, expires sessions.
- SSE parser extracts deltas, completion, error.
- ConnectModal calls provider and handles stream callbacks.

### Docs

Docs must cover:

- Repo architecture.
- Diagrams for connect, approval, stream, validation, settings.
- Install extension locally.
- Configure API key and endpoint.
- Run demo website.
- Install/use ConnectModal package.
- Troubleshooting.

## Phase 1 Scope

Included:

- Hardcoded supported model list using stream-capable `gpt-5.5` target.
- Configurable OpenAI-compatible endpoint.
- API key stored in extension storage.
- Approval UI.
- Session permission.
- Streaming via port.
- Demo end-to-end response.

Out of scope:

- Custom model input.
- Multi-provider adapters.
- Non-compatible endpoint formats.
- Permission dashboard.
- Remember this site.
- Usage metering, billing, quotas.
- Production-grade key encryption.
- Firefox support.

## Recommended Build Order

1. Update hardcoded supported models and demo default to `gpt-5.5`.
2. Settings check flow for API key and endpoint.
3. Settings storage for checked API key and endpoint.
4. Session store and validation.
5. Approval request flow.
6. Stream transport from page to background.
7. OpenAI-compatible SSE client.
8. Demo streaming render.
9. Docs verification and troubleshooting.
