# Contributing

Thanks for your interest in AI Wallet.

## Development Setup

```sh
npm install
npm run build
```

## Verification

Run these before opening a pull request:

```sh
npm run test
npm run typecheck
npm run build
```

## Project Layout

- `apps/extension`: Chrome MV3 extension.
- `apps/demo-web`: local demo website.
- `packages/connect-modal`: website integration helper.
- `packages/protocol`: shared types and validation.

## Security

Do not log, expose, or send provider API keys to websites. All website requests must be validated against origin, session, provider, approved model, expiration, and request limits.
