# cycleview

cycleview is a Manifest V3 Chrome / Chromium extension that rotates saved web pages across tabs without reloading on normal tab switches.

It is intended for unattended displays and kiosk-style browser setups that keep a fixed set of pages open and cycle through them on a schedule.

## Features

- Rotate enabled pages in saved order
- Reuse existing tabs when possible
- Switch tabs without reloading during normal rotation
- Start, pause, move to previous, and move to next from the popup
- Apply per-page or global reload timing
- Apply per-page or global close-and-reopen timing
- Apply per-page hourly and daily reload / reopen triggers
- Configure per-page zoom
- Pause rotation when a managed page is clicked
- Show current status and shortcuts in the popup
- Import, export, and copy settings as JSON
- Store settings locally in `chrome.storage.local`

## For Users

Most users should not run `npm run build`.

Use one of these instead:

- Install from the Chrome Web Store when published
- Download the built `cycleview.zip` from GitHub Releases
- Load a prebuilt `dist/` folder if one is provided

If you install from source manually, then building is required. That is mainly for development and local testing.

## Installation From GitHub Release

1. Download `cycleview.zip` from the latest GitHub Release
2. Unzip it
3. Open `chrome://extensions`
4. Enable `Developer mode`
5. Choose `Load unpacked`
6. Select the unzipped folder

## CLI Install For Kiosk Setup

This repository includes [install-cycleview.sh](./install-cycleview.sh).

It can:

- Download `cycleview.zip` from GitHub Releases
- Unpack the extension
- Create a kiosk launcher script
- Optionally stage a settings JSON file for automatic first-launch import

Example:

```bash
./install-cycleview.sh \
  --repo <owner>/<repo> \
  --settings ./cycleview-settings.json
```

One-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/install-cycleview.sh | \
  bash -s -- --repo <owner>/<repo> --settings ./cycleview-settings.json
```

If `--settings` is provided, the installer copies that file to `bootstrap-settings.json` inside the unpacked extension directory.

On first launch, cycleview imports that JSON automatically only when its local settings are still empty. Existing local settings are not overwritten.

## Chrome Web Store

Store submission notes are in [docs/chrome-web-store.md](./docs/chrome-web-store.md).

That file includes:

- Short and detailed listing copy
- Single-purpose wording
- Privacy practices draft
- Permission justification draft
- Reviewer notes
- Submission checklist

## Settings

Global settings:

- Default duration in seconds
- Default reload interval in seconds
- Default close-and-reopen interval in seconds
- Activate window on page switch
- Pause rotation when a managed page is clicked
- Start automatically when Chrome launches

Per-page settings:

- Enabled
- Name
- URL
- Duration in seconds
- Zoom percentage
- Reload interval in seconds
- Hourly Reload
- Daily Reload
- Close-and-reopen interval in seconds
- Hourly Reopen
- Daily Reopen

If a page duration is blank, cycleview uses the global default duration. The default global duration is `5` seconds.

## Popup

The popup provides:

- `Start` / `Pause`
- `Previous`
- `Next`
- `Settings`
- Current status
- Current page name and effective duration
- Shortcut display

When the popup is open, automatic rotation is temporarily held so cycleview does not switch tabs out from under the popup itself.

## Keyboard Shortcuts

The extension provides commands for:

- Start / Pause toggle
- Start
- Pause
- Next page
- Previous page

Shortcuts can be reviewed or changed in `chrome://extensions/shortcuts`.

## JSON Config

The settings page supports:

- Export to JSON file
- Import from JSON file
- Copy JSON to clipboard
- Load current form values into the JSON editor
- Apply JSON editor contents back to the form

The JSON format is user-facing. It does not include internal runtime-only values such as page IDs, tab IDs, or running state.

## Typical Kiosk Usage

cycleview works well when Chromium is launched directly in kiosk-style mode, for example:

```bash
chromium-browser \
  --kiosk \
  --start-fullscreen \
  --disable-session-crashed-bubble \
  --no-first-run \
  --disable-infobars
```

On macOS, a typical launch command is:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --kiosk \
  --start-fullscreen \
  --disable-session-crashed-bubble \
  --no-first-run \
  --disable-infobars
```

Recommended flow:

1. Start Chrome or Chromium normally once
2. Install cycleview
3. Open Settings and save the page list
4. Enable `Start automatically when Chrome launches` if needed
5. Restart the browser in kiosk mode

cycleview cannot enable Chrome's startup-only `--kiosk` mode after the browser has already launched.

## Permissions

- `storage`: save settings locally
- `tabs`: create, reuse, switch, zoom, reload, and remove managed tabs
- `host_permissions <all_urls>`: open and manage arbitrary page URLs

## Privacy

Settings are stored locally only. See [PRIVACY.md](./PRIVACY.md).

## For Developers

### Local Setup

```bash
npm install
npm run typecheck
npm run build
```

This writes the unpacked extension to `dist/`.

### Local Release Zip

```bash
npm run zip
```

This writes `release/cycleview.zip`.

### Load Unpacked

1. Run `npm install`
2. Run `npm run build`
3. Open `chrome://extensions`
4. Enable `Developer mode`
5. Choose `Load unpacked`
6. Select `dist/`

## GitHub Actions

This repository includes two GitHub Actions workflows:

- `CI`: runs `npm ci`, `npm run typecheck`, and `npm run build` on pushes to `main` and on pull requests
- `Release`: runs the same checks, builds `release/cycleview.zip`, uploads it as an artifact, and attaches it to a GitHub Release when a tag like `v0.1.2` is pushed


To publish a release:

1. Update the version in [package.json](./package.json) and [public/manifest.json](./public/manifest.json)
2. Commit the change
3. Create and push a tag such as `v0.1.2`
4. Let the `Release` workflow publish `cycleview.zip`

## Public Repository Files

This repository includes:

- [LICENSE](./LICENSE)
- [PRIVACY.md](./PRIVACY.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [docs/chrome-web-store.md](./docs/chrome-web-store.md)

## Development Notes

- The extension uses a lightweight content-script heartbeat to help MV3 background timing stay responsive during long-running rotation
- The popup is intentionally small and transient; it is not a persistent control surface
- Authentication, password storage, DOM parsing, external APIs, and cross-device sync are out of scope
