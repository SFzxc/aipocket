# Permission Justifications

## storage

Used to save user-configured AI provider settings, provider API keys, and approved website sessions in Chrome extension storage.

## tabs

Used to scope approved sessions to the requesting browser tab and revoke or clean up sessions when tabs close.

## host_permissions: https://*/*

Used to send approved AI requests from the extension background service worker to user-configured AI provider endpoints. This keeps provider API keys inside the extension while allowing users to connect multiple providers and compatible custom endpoints.

## content_scripts: <all_urls>

Used to inject the AIPocket provider into websites so they can request user-approved AI access. AIPocket does not automatically collect page content. Requests are initiated by websites through the provider protocol and approved by the user.
