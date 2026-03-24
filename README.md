<p align="center">
  <img src="logo/logo.png" alt="Heimdall" width="120">
</p>

<h1 align="center">Heimdall</h1>

<p align="center">
  <b>Room lock management bot for LINE</b><br>
  Built on Google Apps Script + Google Sheets — free, serverless, zero maintenance.
</p>

<p align="center">
  <img src="logo/banner.png" alt="Banner" width="600">
</p>

---

Members message the bot to report when they open or close a shared room. Heimdall tracks the current state, keeps a full audit log, sends reminders if someone forgets to close up, and walks users through configurable checklists before each action.

Everything is editable from the spreadsheet. No code changes needed.

## Features

| | Feature | Description |
|---|---------|-------------|
| :unlock: | **Open / Close** | Update room status with a single message |
| :mag: | **Status check** | Ask the bot whether the room is open or closed |
| :scroll: | **Activity log** | Timestamped audit trail of every action |
| :bell: | **Forgot-to-close reminder** | Push notification after the room has been open too long |
| :clipboard: | **Checklists** | Require confirmation of custom items before opening or closing |
| :pencil2: | **Editable messages** | Every bot response is customizable from the spreadsheet |
| :wave: | **Welcome tutorial** | Automatic greeting when a new user adds the bot |
| :art: | **Rich UI** | LINE Flex Messages for help, welcome, and checklists |

## Commands

```
open       Report that the room is now open
close      Report that the room is now closed
now        Check current room status
log [N]    Show recent activity log (default 5, max 50)
help       Show command list
```

## Architecture

```
LINE App  ──webhook──▶  Google Apps Script  ──read/write──▶  Google Sheets
                         (Code.gs)                            (Settings + Data tabs)
```

| Component | Technology |
|-----------|-----------|
| Runtime | Google Apps Script (V8) |
| Database | Google Sheets |
| Messaging | LINE Messaging API |
| Cost | Free |

## Getting Started

1. Create a **LINE Messaging API** channel and issue a channel access token
2. Create a **Google Sheet** → Extensions → Apps Script
3. Paste [`root/src/Code.js`](root/src/Code.js) into `Code.gs`
4. Add `LINE_CHANNEL_ACCESS_TOKEN` as a **Script Property**
5. Run the `setup` function to initialize the sheet structure
6. **Deploy** as a Web App and set the URL as your LINE webhook

> For full step-by-step instructions (English + Japanese), see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Customization

All configuration lives in the **Settings** sheet tab:

| Columns | Section | What you edit |
|---------|---------|---------------|
| A–B | **Config** | Key-value settings (`reminder_minutes`, etc.) |
| D–E | **Checklist** | Items shown before open/close (`open` / `close` / `both`) |
| G–H | **Messages** | All bot text — supports placeholders like `{name}`, `{time}` |
| J–K | **Variables** | Read-only reference for available placeholders |

The **Data** tab stores current room status (row 1) and the activity log (row 4+). The bot writes here automatically.

## License

MIT
