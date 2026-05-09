# Chrome Web Store Submission Notes

This document is the working draft for the Chrome Web Store listing, privacy answers, and reviewer notes for cycleview.

## Extension Name

`cycleview`

## Summary

cycleview rotates saved web pages across tabs without reloading on normal tab switches.

## Single Purpose

cycleview has a single purpose:

Rotate a user-defined set of saved web pages across browser tabs for unattended display and kiosk-style browser use.

## Short Description

Rotate saved web pages across tabs without reloading on switch.

## Detailed Description

cycleview helps users display a fixed set of saved web pages in rotation inside Chrome or Chromium.

Users can:

- Save a list of page URLs
- Choose the display order
- Set per-page or global display duration
- Move to the next or previous page manually
- Pause and resume rotation
- Set reload and close-and-reopen timing separately
- Set hourly and daily reload / reopen triggers
- Apply per-page zoom settings

The extension stores settings locally on the device and does not send settings or browsing data to external servers.

## Category Suggestions

- Productivity
- Utilities

## Privacy Practices Draft

### Does the extension collect or transmit user data?

No.

### Authentication information

Not collected.

### Personal communications

Not collected.

### Location

Not collected.

### Web history

Not collected for analytics or transmission.

Note:
The extension reads tab URLs locally in order to match, reuse, reload, reopen, and rotate user-configured pages. That information remains local to the browser and is not transmitted externally.

### User activity

Not collected for analytics or transmission.

### Website content

Not collected or transmitted.

Note:
The extension injects a lightweight content script into pages only to:

- Keep the MV3 background worker responsive for timer-based rotation
- Detect user clicks when the optional "Pause rotation when a page is clicked" setting is enabled

The extension does not parse page DOM contents for extraction or external reporting.

## Permission Justification Draft

### `storage`

Used to save page settings, rotation timing, popup state, and runtime metadata locally in `chrome.storage.local`.

### `tabs`

Used to create, reuse, activate, zoom, reload, and close managed tabs that belong to the user-configured rotation list.

### `host_permissions: <all_urls>`

Used because the extension allows the user to register arbitrary web pages for rotation. The extension must be able to open and manage any user-supplied page URL.

### `content_scripts` on `<all_urls>`

Used for two extension-only behaviors on managed pages:

- A lightweight heartbeat to help MV3 timer reliability while pages are open
- Optional click detection for "Pause rotation when a page is clicked"

The script does not send page content, credentials, or analytics data anywhere.

## Reviewer Notes

cycleview is intended for rotating user-specified pages in kiosk-like or unattended display environments.

Key behaviors to verify:

1. Open the extension settings page
2. Add two or more web page URLs
3. Save settings
4. Start rotation from the popup
5. Confirm that the extension opens or reuses tabs and switches between them without reloading on each switch
6. Confirm that manual `Previous` and `Next` work
7. Confirm that reload and reopen timers only affect the configured pages

Important implementation notes:

- The extension does not auto-fill login forms
- The extension does not store passwords
- The extension does not communicate with external APIs
- The extension stores settings locally only

## Store Listing Checklist

- Extension icon uploaded
- Screenshots captured from the current UI
- Short description entered
- Detailed description entered
- Category selected
- Privacy answers entered
- Permission justifications entered
- Support site or repository link added
- Privacy policy URL added if required by the dashboard setup
