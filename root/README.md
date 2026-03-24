# Heimdall - Clubroom Lock Bot

A LINE chatbot built on Google Apps Script (GAS) + Google Sheets to manage and log the status of a clubroom lock (Open/Closed).

## Architecture

- **Runtime**: Google Apps Script (V8)
- **Database**: Google Sheets (tabs: Status, Logs, Config)
- **Messaging**: LINE Messaging API

## Deployment

This is a Google Apps Script project. To deploy:

1. **Manual**: Copy the contents of `src/Code.js` into a new project at [script.google.com](https://script.google.com).
2. **Via clasp**: Use [clasp](https://github.com/google/clasp) to push the `src/` directory to your GAS project.

   ```bash
   npm install -g @google/clasp
   clasp login
   clasp clone <SCRIPT_ID> # or clasp create
   clasp push
   ```

3. Deploy as a **Web App** (Execute as: Me, Access: Anyone).
4. Set the Web App URL as the **Webhook URL** in the LINE Messaging API console.
