# Heimdall Deployment Guide

Follow these steps to get the bot running. You need a Google account and a LINE Developer account.

> Menu names are shown as **English / Japanese (日本語)**.

---

## Step 1: Create a LINE Bot

1. Go to [LINE Developers Console](https://developers.line.biz/) and log in.
2. Create a new **Provider / プロバイダー** (or use an existing one).
3. Create a new **Messaging API Channel / Messaging APIチャネル**.
   - Fill in the required fields: **チャネル名**, **チャネル説明**, etc.
4. In the channel settings, go to the **Messaging API** tab.
5. Scroll to **Channel access token / チャネルアクセストークン** and click **Issue / 発行**. Copy this token — you'll need it in Step 3.
6. Under **LINE Official Account features / LINE公式アカウント機能**, click **Edit / 編集** next to "Auto-reply messages / 応答メッセージ" and **disable / オフ** it (so the bot handles all replies, not LINE's default auto-reply).

---

## Step 2: Set Up Google Sheets + Apps Script

1. Go to [Google Sheets](https://sheets.google.com/) and create a **new blank spreadsheet / 空白のスプレッドシート**.
   - Name it something like "Heimdall Bot".
2. In the spreadsheet, go to **Extensions / 拡張機能 > Apps Script**.
3. This opens the Apps Script editor. You should see a default `Code.gs` file.
4. **Delete** all the default code in `Code.gs`.
5. **Copy** the entire contents of `root/src/Code.js` from this repository and **paste** it into `Code.gs`.
6. Click **Save / 保存** (Ctrl+S / Cmd+S).

---

## Step 3: Set the LINE Token

1. In the Apps Script editor, click the **gear icon / 歯車アイコン** (**Project Settings / プロジェクトの設定**) in the left sidebar.
2. Scroll down to **Script Properties / スクリプト プロパティ**.
3. Click **Add script property / スクリプト プロパティを追加** and enter:
   - **Property / プロパティ**: `LINE_CHANNEL_ACCESS_TOKEN`
   - **Value / 値**: *(paste the channel access token from Step 1)*
4. Click **Save script properties / スクリプト プロパティを保存**.

---

## Step 4: Run Initial Setup

1. In the Apps Script editor, make sure `setup` is selected in the function dropdown (top toolbar).
2. Click **Run / 実行**.
3. You will be prompted to **authorize / 承認** the script. Click through:
   - **Review Permissions / 権限を確認** > Choose your Google account > **Advanced / 詳細** > **Go to [project name] (unsafe) / [プロジェクト名]（安全ではないページ）に移動** > **Allow / 許可**.
   - This grants the script access to your spreadsheet and to make external HTTP requests (for LINE API).
4. Check the **Execution log / 実行ログ** — it should say `Setup complete.`
5. Go back to your spreadsheet — you should now see 2 tabs: **Settings** and **Data**.

---

## Step 5: Deploy as Web App

1. In the Apps Script editor, click **Deploy / デプロイ > New deployment / 新しいデプロイ**.
2. Click the gear icon next to **Select type / 種類の選択** and choose **Web app / ウェブアプリ**.
3. Set the following:
   - **Description / 説明**: "Heimdall v1" (or anything you like)
   - **Execute as / 次のユーザーとして実行**: **Me / 自分** (your Google account)
   - **Who has access / アクセスできるユーザー**: **Anyone / 全員**
4. Click **Deploy / デプロイ**.
5. **Copy the Web app URL / ウェブアプリのURL** — it looks like `https://script.google.com/macros/s/.../exec`.

---

## Step 6: Connect LINE Webhook

1. Go back to the [LINE Developers Console](https://developers.line.biz/).
2. Open your Messaging API channel.
3. Go to the **Messaging API** tab.
4. Under **Webhook settings / Webhook設定**:
   - Paste the Web app URL from Step 5 into the **Webhook URL** field.
   - Click **Verify / 検証** — it should show **Success / 成功**.
   - Toggle **Use webhook / Webhookの利用** to **ON / オン**.

---

## Step 7: Test It

1. On the **Messaging API** tab in LINE Developers Console, scan the **QR code / QRコード** to add the bot as a friend on LINE.
2. You should receive the **welcome message** automatically.
3. Try sending these messages:
   - `open` — should reply that the room is now OPEN
   - `now` — should reply with current status
   - `close` — should reply that the room is now CLOSED (may show checklist first)
   - `help` — should show the command list
   - `log` — should show recent activity log
4. Check your Google Sheet — the **Data** tab should show log entries for each action.

---

## Customization (Optional)

Everything is in **2 sheets**. Edit the **Settings** sheet directly — no code changes needed.

### Settings Sheet Layout

All editable config lives in one sheet, organized side-by-side:

| Columns | Section | What It Does |
|---------|---------|-------------|
| A-B | **設定 / 値** | Config key-value pairs (e.g. `reminder_minutes`) |
| D-E | **チェック項目 / 条件** | Checklist items and when they appear |
| G-H | **キー / メッセージ** | All bot messages (editable text) |
| J-L | **変数名 / 説明 / 対象キー** | Placeholder reference (auto-generated, read-only) |

#### Config (columns A-B)

| Key | What It Does | Default |
|-----|-------------|---------|
| `reminder_minutes` | Minutes after "open" before "forgot to close?" reminder | `180` |

#### Checklist (columns D-E)

The `条件` (when) column controls when each item appears:

| Value | Meaning |
|-------|---------|
| `close` | Show only when closing (default if left blank) |
| `open` | Show only when opening |
| `both` | Show for both open and close |

Delete all data rows to disable the checklist.

#### Messages (columns G-H)

Every message the bot sends is editable. Use placeholders like `{name}`, `{time}`, `{reminder_minutes}`, `{count}`. Use `\n` or Alt+Enter for line breaks. Clear a value to send nothing for that message.

If you delete a row, the bot uses the built-in default. Running `setup()` again will re-add missing keys without overwriting your edits.

#### Variables (columns J-L)

Read-only reference regenerated on each `setup()` run. Lists all available placeholders and checklist `条件` values so you can see them while editing messages.

### Data Sheet

The bot writes here — you don't need to edit this.

| Row | Content |
|-----|---------|
| Row 1 | Current room status (状態, value, timestamp, user) |
| Row 3 | Log headers |
| Row 4+ | Activity log entries |

---

## Updating the Code

If you need to update the bot code later:

1. Open your Google Sheet > **Extensions / 拡張機能 > Apps Script**.
2. Replace the contents of `Code.gs` with the updated `root/src/Code.js`.
3. Click **Save / 保存**.
4. Go to **Deploy / デプロイ > Manage deployments / デプロイを管理**.
5. Click the **pencil icon / 鉛筆アイコン** to edit the active deployment.
6. Change **Version / バージョン** to **New version / 新バージョン**.
7. Click **Deploy / デプロイ**.

The Webhook URL stays the same — no need to update LINE settings.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot doesn't respond | Check that **Use webhook / Webhookの利用** is ON in LINE Developers Console |
| "Verify" shows 302 error | This is normal for GAS — ignore it. The bot still works. Test by sending a message instead |
| Authorization error | Re-run `setup()` and complete the authorization flow (**権限を確認**) |
| "forgot to close" reminder not working | Push messages require the LINE channel to have the Messaging API plan (free tier works). Check that `reminder_minutes` is set in the Settings sheet (column A-B) |
| Bot replies "Unknown" as display name | The bot needs to be friends with the user, and the user's privacy settings must allow profile access |
