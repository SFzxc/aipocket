# Developer Integration

## Concept

AIPocket injects `window.aiWallet` into web pages. Websites request scoped provider/model access, then stream responses through the extension. The real provider API key stays inside the extension.

AIPocket is the public product name. `aiWallet` remains the provider protocol name for website integrations.

## Install

```sh
npm install @aipocket/connect-modal
```

For local workspace development, import from `packages/connect-modal` through the monorepo package build.

## Detect AIPocket

```ts
if (!window.aiWallet) {
  throw new Error("AIPocket extension is not installed or this tab needs reload");
}
```

The demo package wraps this detection in `AiWalletNotFoundError`.

## Connect

```ts
import { connectAiWallet } from "@aipocket/connect-modal";

const permission = await connectAiWallet({
  models: ["gpt-5.5"],
  reason: "Generate assistant replies for this chat UI"
});
```

The extension shows an approval window. User can approve or reject and choose allowed models.

## Stream

```ts
import { requestResponseStream } from "@aipocket/connect-modal";

await requestResponseStream({
  sessionId: permission.sessionId,
  providerId: permission.providerId,
  model: permission.models[0],
  input: "1+2=?",
  onDelta(delta) {
    appendToMessage(delta);
  },
  onDone() {
    markComplete();
  },
  onError(error) {
    showError(error);
  }
});
```

## Disconnect

```ts
import { disconnectAiWallet } from "@aipocket/connect-modal";

await disconnectAiWallet(permission.sessionId);
```

## Permission Shape

```ts
type AiWalletPermission = {
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

## Provider IDs

`providerId` is optional when requesting accounts. If omitted, AIPocket uses the first enabled provider. Pass a provider id only when a website needs a specific saved provider.

## Error Handling

Handle these cases in app UI:

- Extension missing or tab not reloaded.
- User rejected approval.
- Session expired.
- Provider missing or disabled.
- Provider mismatch.
- Model not approved.
- Request limit reached.
- Upstream stream failed.

## Security Boundary

Do not ask users to paste provider API keys into your website. AIPocket keeps keys inside extension storage and brokers requests after validating session scope.
