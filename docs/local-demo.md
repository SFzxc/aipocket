# Local Demo

This guide runs AIPocket and the demo website locally.

Demo video: [`docs/assets/videos/demo.mov`](assets/videos/demo.mov)

## 1. Install Dependencies

```sh
npm install
```

## 2. Build Workspaces

```sh
npm run build
```

## 3. Load Extension In Chrome

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select `apps/extension/dist`.

## 4. Configure Provider

1. Open AIPocket popup.
2. Open `Providers`.
3. Click `Add`.
4. Choose provider type.
5. Enter provider name and API key.
6. Enter endpoint when shown.
7. Optionally set `Max requests per session`.
8. Click `Check connection`.
9. Click `Save provider`.

For OpenAI-compatible local demo, the default provider id is `provider_openai`.

## 5. Run Demo Website

```sh
npm run dev -w @aipocket/demo-web
```

Open the local URL in the same Chrome profile where the extension is installed.

## 6. Try The Flow

1. Confirm provider id is `provider_openai`.
2. Click `Connect AIPocket`.
3. Approve requested model in the extension approval window.
4. Keep default prompt `1+2=?`.
5. Click `Send`.
6. Expected streamed output: `3`.

## Troubleshooting

- If `window.aiWallet` is missing, reload the demo tab after installing extension.
- If check fails, confirm API key and endpoint match the selected provider type.
- If stream fails, confirm approved model belongs to the same provider id.
