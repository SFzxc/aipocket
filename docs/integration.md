# Developer Integration

## Concept

AI Wallet injects `window.aiWallet` into web pages. Websites request scoped provider/model access, then stream responses through the extension. The real provider API key stays inside the extension.

## Install

```sh
npm install @ai-wallet/connect-modal
```

For local workspace development, import from `packages/connect-modal` through the monorepo package build.

## Detect AI Wallet

```ts
if (!window.aiWallet) {
  throw new Error("AI Wallet extension is not installed or this tab needs reload");
}
```

The demo package wraps this detection in `AiWalletNotFoundError`.

## Connect

```ts
import { connectAiWallet } from "@ai-wallet/connect-modal";

const permission = await connectAiWallet({
  providerId: "provider_openai",
  models: ["gpt-5.5"],
  reason: "Generate assistant replies for this chat UI"
});
```

The extension shows an approval window. User can approve or reject and choose allowed models.

## Stream

```ts
import { requestResponseStream } from "@ai-wallet/connect-modal";

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
import { disconnectAiWallet } from "@ai-wallet/connect-modal";

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

Current local demo uses `provider_openai` for migrated/default OpenAI-compatible provider config. Future provider discovery helpers should make provider selection easier for websites.

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

Do not ask users to paste provider API keys into your website. AI Wallet keeps keys inside extension storage and brokers requests after validating session scope.
