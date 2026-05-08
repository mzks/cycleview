# Contributing

## Development Setup

```bash
npm install
npm run typecheck
npm run build
```

Load `dist/` as an unpacked extension from `chrome://extensions`.

## Before Opening a Change

- Keep the extension Manifest V3 compatible
- Keep permissions minimal
- Avoid adding external services or telemetry
- Preserve local-only storage behavior
- Test changes with `npm run typecheck` and `npm run build`

## Scope

In scope:

- Rotation logic
- Settings UI
- Popup UI
- Manifest and packaging
- Documentation

Out of scope:

- Automatic login
- Password storage
- DOM scraping
- External API communication
- Cross-device sync

## Pull Request Notes

- Describe the user-visible behavior change
- Note any permission changes
- Note any kiosk-mode implications
- Include manual test notes for popup, settings, and rotation behavior
