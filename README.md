# Heimdall

<p align="center">
  <img src="logo/banner.png" alt="Heimdall Banner" width="600">
</p>

A LINE chatbot built on Google Apps Script + Google Sheets that manages and logs the open/closed status of a shared room.

Members message the bot to report when they open or close the room. The bot tracks the current state, keeps an audit log, sends reminders if someone forgets to close, and presents configurable checklists before each action — all editable from the spreadsheet with zero code changes.

## Features

- **Open / Close** — update room status with a single message
- **Status check** — ask the bot if the room is currently open or closed
- **Activity log** — timestamped audit trail of every action
- **Forgot-to-close reminder** — configurable push notification after the room has been open too long
- **Checklists** — require confirmation of custom checklist items before opening or closing
- **Editable messages** — every bot response is customizable from the spreadsheet
- **Welcome tutorial** — automatic greeting when a new user adds the bot
- **Rich UI** — LINE Flex Messages for help, welcome, and checklists

## Architecture

| Component | Technology |
|-----------|-----------|
| Runtime | Google Apps Script (V8) |
| Database | Google Sheets |
| Messaging | LINE Messaging API |
| Cost | Free |

All configuration, messages, and checklists live in the **Settings** sheet tab. The **Data** tab stores current status and the activity log.

## Quick Start

1. Create a LINE Messaging API channel and issue a channel access token
2. Create a Google Sheet, open Extensions > Apps Script
3. Paste the contents of [`root/src/Code.js`](root/src/Code.js) into `Code.gs`
4. Add `LINE_CHANNEL_ACCESS_TOKEN` as a Script Property
5. Run the `setup` function to initialize sheet structure
6. Deploy as a Web App and set the URL as your LINE webhook

See [**DEPLOYMENT.md**](DEPLOYMENT.md) for detailed step-by-step instructions with screenshots guidance in English and Japanese.

## Commands

| Command | Description |
|---------|-------------|
| `open` | Report that the room is now open |
| `close` | Report that the room is now closed |
| `now` | Check current room status |
| `log` / `log N` | Show recent activity log (default 5, max 50) |
| `help` | Show command list |

## Customization

Edit the **Settings** sheet directly — no code changes needed:

| Columns | Section | Purpose |
|---------|---------|---------|
| A–B | Config | Key-value settings (e.g. `reminder_minutes`) |
| D–E | Checklist | Items and when they appear (`open` / `close` / `both`) |
| G–H | Messages | All bot text, with placeholder support (`{name}`, `{time}`, etc.) |
| J–K | Variables | Read-only placeholder reference |

## License

MIT
