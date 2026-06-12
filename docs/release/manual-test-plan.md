# Manual Release Test Plan

## Install

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Click Load unpacked.
5. Select `apps/extension/dist`.

## Provider Setup

1. Open AIPocket popup.
2. Add a provider.
3. Enter provider name and API key.
4. Run Check connection.
5. Save provider after check succeeds.

## Happy Path

1. Open demo website.
2. Leave `Provider ID` blank so the demo uses the first saved provider.
3. Click connect.
4. Confirm approval window shows origin, reason, provider, and models.
5. Approve one model.
6. Send `1+2=?`.
7. Confirm streamed response appears.

## Security Paths

1. Reject an approval request and confirm no session is created.
2. Try an unapproved model and confirm request is rejected.
3. Revoke a session and confirm later stream requests fail.
4. Disable or remove a provider and confirm stream requests fail.
5. Confirm website JavaScript never receives provider API key.

## Package Check

1. Run `npm run package -w @aipocket/extension`.
2. Confirm `apps/extension/release/aipocket-0.1.0.zip` exists.
3. Confirm zip root contains `manifest.json`.
4. Confirm zip does not include source files, `node_modules`, `.env`, or secrets.
