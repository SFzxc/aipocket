# Chrome Web Store Listing

## Name

AIPocket

## Short Description

Connect apps to your AI providers without exposing keys.

## Full Description

AIPocket is an AI access wallet for the browser. It lets websites request user-approved access to AI models while keeping real provider API keys inside the extension.

Use AIPocket to connect apps to OpenAI-compatible providers, Anthropic-compatible providers, OpenRouter, Gemini, and compatible custom endpoints. When a website requests access, AIPocket shows the requesting origin, requested models, and reason. You choose what to approve.

Key features:

- Connect websites to approved AI providers and models.
- Keep provider API keys private inside extension storage.
- Approve or reject access per website origin.
- Choose allowed models for each session.
- Revoke active sessions from the extension popup.
- Stream responses back to websites without exposing provider keys.
- Optional request limits per approved session.

AIPocket is free. It does not sell API access, provide billing, or process payments. Users bring their own provider accounts and API keys.

## Category

Productivity

## Screenshot Checklist

- Popup home showing providers and connected sites.
- Provider management screen.
- Website approval screen with origin and models.
- Demo website streaming a response.

## Reviewer Instructions

1. Load AIPocket.
2. Open the popup and add a provider API key.
3. Open the demo website in the same Chrome profile.
4. Click connect in the demo.
5. Approve model access in AIPocket.
6. Send `1+2=?` and confirm a streamed response appears.
7. Revoke the session from the popup.

## Known v0.1.0 Limitations

- Users must bring their own provider API keys.
- Custom provider endpoints must be compatible with the selected provider mode.
- MV3 service worker lifecycle can interrupt very long streams.
