// ===== Configuration =====
var LINE_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
var LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
var LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
var LINE_PROFILE_URL = "https://api.line.me/v2/bot/profile/";

// ===== Defaults =====
var DEFAULT_REMINDER_MINUTES = 180;
var LOG_DEFAULT_COUNT = 5;
var LOG_MAX_COUNT = 50;
var DATA_LOG_START_ROW = 4;
var FALLBACK_DISPLAY_NAME = "不明";
var TIMESTAMP_FORMAT = "MM/dd HH:mm";

// ===== Theme Colors =====
var COLOR_HEADER = "#111827";
var COLOR_BUTTON = "#1F2937";
var COLOR_SUBTITLE = "#9CA3AF";
var COLOR_MUTED = "#6B7280";
var COLOR_BOLD = "#111827";
var COLOR_WHITE = "#FFFFFF";

// ===== Default Messages =====
// All user-facing text. Editable via the Settings sheet (columns G-H); these are fallback defaults.
// Placeholders: {name}, {time}, {reminder_minutes}, {count}
var MESSAGE_DEFAULTS = {
  // Command replies
  open_reply:             "🔓 部室を【開けました】",
  close_reply:            "🔒 部室を【閉めました】",
  now_open:               "🔓 部室は現在【開いています】",
  now_closed:             "🔒 部室は現在【閉まっています】\n（最終更新: {name} / {time}）",
  now_unknown:            "状態不明",
  reminder:               "⏰ {name}さん、部室が{reminder_minutes}分以上開いたままです。閉め忘れていませんか？",
  no_pending:             "確認待ちのチェックリストはありません。",
  // Log
  log_title:              "📋 最近のログ ({count}件)",
  log_empty:              "ログがありません。",
  // Welcome Flex
  welcome_title:          "🏠 Heimdall",
  welcome_subtitle:       "部室カギ管理Bot",
  welcome_greeting:       "K'issへようこそ！",
  welcome_desc:           "このBotは部室のカギの開閉状態を管理・記録します。",
  // Help Flex
  help_title:             "📋 コマンド一覧",
  // Command descriptions (used in Flex Messages)
  cmd_open:               "部室を開ける",
  cmd_close:              "部室を閉める",
  cmd_now:                "現在の状態を確認",
  cmd_help:               "コマンド一覧を表示",
  cmd_log:                "最近のログを表示 (log 10)",
  // Welcome Flex
  welcome_help_hint:      "「help」と送信するとコマンド一覧を表示します。",
  // Checklist Flex
  checklist_close_title:  "📝 閉室時...",
  checklist_open_title:   "📝 開室時...",
  checklist_instruction:  "以下をすべて確認してください：",
  checklist_confirm:      "全て確認しました",
  // Button labels
  btn_check_status:       "状態を確認する"
};

// ===== Entry Point =====

function doGet(e) {
  return ContentService.createTextOutput("Heimdall is running.");
}

function doPost(e) {
  ensureSheetStructure();

  var contents = JSON.parse(e.postData.contents);
  var events = contents.events;

  for (var i = 0; i < events.length; i++) {
    handleWebhookEvent(events[i]);
  }

  return ContentService.createTextOutput("OK");
}

// ===== Event Router =====

function handleWebhookEvent(event) {
  if (event.type === "follow") {
    handleFollow(event.replyToken, event.source.userId);
    return;
  }

  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }

  var text = event.message.text.trim().toLowerCase();
  var replyToken = event.replyToken;
  var userId = event.source.userId;

  // Handle commands with arguments (before switch)
  var logMatch = text.match(/^logs?(?: (\d+))?$/);
  if (logMatch) {
    handleLog(replyToken, logMatch[1] ? parseInt(logMatch[1], 10) : null);
    return;
  }

  switch (text) {
    case "open":
      handleOpen(replyToken, userId);
      break;
    case "close":
      handleClose(replyToken, userId);
      break;
    case "done":
    case "checked":
      handleCheckedConfirmation(replyToken, userId);
      break;
    case "now":
      handleNow(replyToken);
      break;
    case "help":
      handleHelp(replyToken);
      break;
    case "welcome":
      replyFlex(replyToken, getMessage("welcome_title"), buildWelcomeFlex());
      break;
    default:
      break;
  }
}

// ===== Command Handlers =====

function handleFollow(replyToken, userId) {
  var displayName = getDisplayName(userId);
  addLog(userId, displayName, "follow");

  replyFlex(replyToken, getMessage("welcome_title"), buildWelcomeFlex());
}

function handleOpen(replyToken, userId) {
  var props = PropertiesService.getScriptProperties();
  var pendingKey = "pending_check_" + userId;
  var items = getChecklistItems("open");

  if (items.length > 0) {
    props.setProperty(pendingKey, "open");
    replyFlex(replyToken, getMessage("checklist_open_title"),
      buildChecklistFlex(items, "open"));
    return;
  }

  props.deleteProperty(pendingKey);
  executeOpen(replyToken, userId);
}

function handleClose(replyToken, userId) {
  var props = PropertiesService.getScriptProperties();
  var pendingKey = "pending_check_" + userId;
  var items = getChecklistItems("close");

  if (items.length > 0) {
    props.setProperty(pendingKey, "close");
    replyFlex(replyToken, getMessage("checklist_close_title"),
      buildChecklistFlex(items, "close"));
    return;
  }

  props.deleteProperty(pendingKey);
  executeClose(replyToken, userId);
}

function handleCheckedConfirmation(replyToken, userId) {
  var props = PropertiesService.getScriptProperties();
  var pendingKey = "pending_check_" + userId;
  var pending = props.getProperty(pendingKey);

  if (!pending) {
    replyMessage(replyToken, getMessage("no_pending"));
    return;
  }

  props.deleteProperty(pendingKey);

  if (pending === "open") {
    executeOpen(replyToken, userId);
  } else {
    executeClose(replyToken, userId);
  }
}

function executeOpen(replyToken, userId) {
  var displayName = getDisplayName(userId);
  var currentStatus = getCurrentStatus();

  if (currentStatus.value === "OPEN") {
    var prevUser = currentStatus.updatedBy || FALLBACK_DISPLAY_NAME;
    addLog("", prevUser, "missed_close");
  }

  updateStatus("OPEN", displayName);
  addLog(userId, displayName, "open");
  PropertiesService.getScriptProperties().setProperty("last_opener_name", displayName);
  scheduleForgotToCloseReminder(userId);

  replyMessage(replyToken, getMessage("open_reply", { name: displayName }));
}

function executeClose(replyToken, userId) {
  var displayName = getDisplayName(userId);
  var currentStatus = getCurrentStatus();

  if (currentStatus.value === "CLOSED") {
    addLog(userId, displayName, "missed_open");
  }

  updateStatus("CLOSED", displayName);
  addLog(userId, displayName, "close");
  PropertiesService.getScriptProperties().setProperty("last_closer_name", displayName);
  clearForgotToCloseTriggers();

  replyMessage(replyToken, getMessage("close_reply", { name: displayName }));
}

function handleNow(replyToken) {
  var status = getCurrentStatus();
  var msg;

  if (status.value === "OPEN") {
    msg = getMessage("now_open");
  } else if (status.value === "CLOSED") {
    msg = getMessage("now_closed", { name: status.updatedBy || "", time: status.updatedAt || "" });
  } else {
    msg = getMessage("now_unknown");
  }

  replyMessage(replyToken, msg);
}

function handleHelp(replyToken) {
  replyFlex(replyToken, getMessage("help_title"), buildHelpFlex());
}

function handleLog(replyToken, count) {
  if (!count) count = LOG_DEFAULT_COUNT;
  count = Math.min(Math.max(1, count), LOG_MAX_COUNT);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Data");
  if (!sheet) {
    replyMessage(replyToken, getMessage("log_empty"));
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_LOG_START_ROW) {
    replyMessage(replyToken, getMessage("log_empty"));
    return;
  }

  var numRows = lastRow - DATA_LOG_START_ROW + 1;
  var data = sheet.getRange(DATA_LOG_START_ROW, 1, numRows, 4).getValues();
  var logs = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) logs.push(data[i]);
  }

  if (logs.length === 0) {
    replyMessage(replyToken, getMessage("log_empty"));
    return;
  }

  var recent = logs.slice(-count).reverse();
  var lines = [getMessage("log_title", { count: recent.length }), "─────────────"];

  for (var i = 0; i < recent.length; i++) {
    var ts = recent[i][0];
    var name = recent[i][2] || FALLBACK_DISPLAY_NAME;
    var action = recent[i][3] || "";
    var displayAction = action.replace("missed_close", "close").replace("missed_open", "open");
    var dateStr = formatTimestamp(ts);
    lines.push(dateStr + "  " + name + " — " + displayAction);
  }

  replyMessage(replyToken, lines.join("\n"));
}

// ===== Flex Message Builders =====

function buildWelcomeFlex() {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLOR_HEADER,
      paddingAll: "lg",
      contents: [
        { type: "text", text: getMessage("welcome_title"), weight: "bold", size: "xl", color: COLOR_WHITE },
        { type: "text", text: getMessage("welcome_subtitle"), size: "sm", color: COLOR_SUBTITLE, margin: "sm" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "lg",
      contents: [
        { type: "text", text: getMessage("welcome_greeting"), weight: "bold", size: "md", wrap: true },
        { type: "text", text: getMessage("welcome_desc"), size: "sm", color: COLOR_MUTED, wrap: true, margin: "md" },
        { type: "separator", margin: "lg" },
        { type: "text", text: getMessage("welcome_help_hint"), size: "sm", color: COLOR_MUTED, wrap: true, margin: "lg" }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: COLOR_BUTTON,
          action: { type: "message", label: getMessage("btn_check_status"), text: "now" }
        }
      ]
    }
  };
}

function buildHelpFlex() {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLOR_HEADER,
      paddingAll: "lg",
      contents: [
        { type: "text", text: getMessage("help_title"), weight: "bold", size: "lg", color: COLOR_WHITE }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "lg",
      contents: [
        buildCommandRow("open", getMessage("cmd_open")),
        buildCommandRow("close", getMessage("cmd_close")),
        buildCommandRow("now", getMessage("cmd_now")),
        buildCommandRow("help", getMessage("cmd_help")),
        buildCommandRow("log", getMessage("cmd_log"))
      ]
    }
  };
}

function buildChecklistFlex(items, operation) {
  var titleKey = operation === "open" ? "checklist_open_title" : "checklist_close_title";

  var bodyContents = [
    { type: "text", text: getMessage("checklist_instruction"), size: "sm", color: COLOR_MUTED, wrap: true }
  ];

  for (var i = 0; i < items.length; i++) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        { type: "text", text: "☐", size: "md", flex: 0, color: COLOR_MUTED },
        { type: "text", text: items[i], size: "md", wrap: true, margin: "sm", flex: 5 }
      ]
    });
  }

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLOR_HEADER,
      paddingAll: "lg",
      contents: [
        { type: "text", text: getMessage(titleKey), weight: "bold", size: "lg", color: COLOR_WHITE }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "lg",
      contents: bodyContents
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: COLOR_BUTTON,
          action: { type: "message", label: getMessage("checklist_confirm"), text: "done" }
        }
      ]
    }
  };
}

function buildCommandRow(cmd, desc) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "md",
    contents: [
      { type: "text", text: cmd, size: "sm", weight: "bold", flex: 2, color: COLOR_BOLD },
      { type: "text", text: desc, size: "sm", flex: 5, color: COLOR_MUTED, wrap: true }
    ]
  };
}

// ===== Helpers =====

function formatTimestamp(ts) {
  if (ts instanceof Date) {
    return Utilities.formatDate(ts, Session.getScriptTimeZone(), TIMESTAMP_FORMAT);
  }
  return String(ts);
}

// ===== Message Loader =====

var _messagesCache = null;
var _globalReplacementsCache = null;

function getGlobalReplacements() {
  if (!_globalReplacementsCache) {
    var props = PropertiesService.getScriptProperties();
    _globalReplacementsCache = {
      reminder_minutes: getConfig("reminder_minutes") || String(DEFAULT_REMINDER_MINUTES),
      last_opener: props.getProperty("last_opener_name") || "",
      last_closer: props.getProperty("last_closer_name") || ""
    };
  }
  return _globalReplacementsCache;
}

function getMessage(key, replacements) {
  var msg = readMessageFromSheet(key);
  if (msg === null) {
    msg = MESSAGE_DEFAULTS[key] !== undefined ? MESSAGE_DEFAULTS[key] : key;
  }

  // Convert literal \n typed in sheet cells to real newlines
  msg = msg.replace(/\\n/g, "\n");

  // Explicit replacements first (take priority)
  if (replacements) {
    for (var k in replacements) {
      msg = msg.replace(new RegExp("\\{" + k + "\\}", "g"), String(replacements[k] || ""));
    }
  }

  // Global replacements for any remaining placeholders
  var globals = getGlobalReplacements();
  for (var k in globals) {
    msg = msg.replace(new RegExp("\\{" + k + "\\}", "g"), String(globals[k] || ""));
  }

  return msg;
}

function readMessageFromSheet(key) {
  if (!_messagesCache) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Settings");
    _messagesCache = {};
    if (!sheet) return null;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var data = sheet.getRange(2, 7, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      var k = String(data[i][0]).trim();
      var v = String(data[i][1]);
      if (k) _messagesCache[k] = v;
    }
  }
  return _messagesCache.hasOwnProperty(key) ? _messagesCache[key] : null;
}

// ===== Checklist Loader =====

/**
 * Reads checklist items for the given operation ("open" or "close").
 * Settings sheet columns D-E: item, when (open/close/both).
 * If "when" column is empty, defaults to "close".
 */
function getChecklistItems(operation) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 4, lastRow - 1, 2).getValues();
  var items = [];
  for (var i = 0; i < data.length; i++) {
    var item = String(data[i][0]).trim();
    if (!item) continue;
    var when = String(data[i][1] || "").trim().toLowerCase();
    if (!when) when = "close";
    if (when === operation || when === "both") {
      items.push(item);
    }
  }
  return items;
}

// ===== "Forgot to Close" Reminder =====

function scheduleForgotToCloseReminder(userId) {
  clearForgotToCloseTriggers();

  var minutes = parseInt(getConfig("reminder_minutes"), 10) || DEFAULT_REMINDER_MINUTES;
  PropertiesService.getScriptProperties().setProperty("last_opener_user_id", userId);

  ScriptApp.newTrigger("checkForgotToClose")
    .timeBased()
    .after(minutes * 60 * 1000)
    .create();
}

function checkForgotToClose() {
  var status = getCurrentStatus();
  if (status.value !== "OPEN") return;

  var userId = PropertiesService.getScriptProperties().getProperty("last_opener_user_id");
  if (!userId) return;

  var displayName = getDisplayName(userId);
  var minutes = getConfig("reminder_minutes") || String(DEFAULT_REMINDER_MINUTES);
  pushMessage(userId, getMessage("reminder", { name: displayName, reminder_minutes: minutes }));
}

function clearForgotToCloseTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "checkForgotToClose") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

// ===== Config Loader =====

function getConfig(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) return null;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) return String(data[i][1]);
  }
  return null;
}

// ===== Sheet Helpers =====

function getCurrentStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Data");
  if (!sheet) return { value: "UNKNOWN", updatedAt: "", updatedBy: "" };

  var row = sheet.getRange(1, 2, 1, 3).getValues()[0];
  return {
    value: String(row[0] || "UNKNOWN"),
    updatedAt: row[1] || "",
    updatedBy: row[2] || ""
  };
}

function updateStatus(newStatus, displayName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Data");
  sheet.getRange(1, 2, 1, 3).setValues([[newStatus, new Date(), displayName]]);
}

function addLog(userId, displayName, action) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Data");
  sheet.appendRow([new Date(), userId, displayName, action]);
}

function ensureSheetStructure() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- Settings sheet ----
  var settings = ss.getSheetByName("Settings");
  if (!settings) settings = ss.insertSheet("Settings");
  if (String(settings.getRange(1, 1).getValue()).trim() !== "設定") {
    initSettingsSheet(settings);
  }

  // ---- Data sheet ----
  var dataSheet = ss.getSheetByName("Data");
  if (!dataSheet) dataSheet = ss.insertSheet("Data");
  if (String(dataSheet.getRange(1, 1).getValue()).trim() !== "状態") {
    initDataSheet(dataSheet);
  }
}

function initSettingsSheet(sheet) {
  sheet.clearContents();

  // Row 1: Section headers
  sheet.getRange(1, 1, 1, 11).setValues([[
    "設定", "値", "",
    "チェック項目", "条件", "",
    "キー", "メッセージ", "",
    "変数名", "説明"
  ]]);
  sheet.getRange(1, 1, 1, 11).setFontWeight("bold");

  // Config defaults (A2:B2)
  sheet.getRange(2, 1, 1, 2).setValues([
    ["reminder_minutes", DEFAULT_REMINDER_MINUTES]
  ]);

  // Checklist defaults (D2:E5)
  sheet.getRange(2, 4, 4, 2).setValues([
    ["タスク1", "close"],
    ["タスク2", "close"],
    ["タスク3", "open"],
    ["タスク4", "open"]
  ]);

  // Message defaults (G2:H(n))
  var msgKeys = Object.keys(MESSAGE_DEFAULTS);
  var msgData = [];
  for (var i = 0; i < msgKeys.length; i++) {
    msgData.push([msgKeys[i], MESSAGE_DEFAULTS[msgKeys[i]]]);
  }
  sheet.getRange(2, 7, msgData.length, 2).setValues(msgData);

  // Variables reference (J2:L(n))
  writeVariablesReference(sheet);

  // Narrow spacer columns
  sheet.setColumnWidth(3, 20);
  sheet.setColumnWidth(6, 20);
  sheet.setColumnWidth(9, 20);
}

function initDataSheet(sheet) {
  sheet.clearContents();

  // Row 1: Status
  sheet.getRange(1, 1, 1, 4).setValues([["状態", "CLOSED", "", ""]]);
  sheet.getRange(1, 1).setFontWeight("bold");

  // Row 3: Log headers
  sheet.getRange(3, 1, 1, 4).setValues([["timestamp", "user_id", "user_name", "action"]]);
  sheet.getRange(3, 1, 1, 4).setFontWeight("bold");
}

// ===== LINE API Helpers =====

function replyMessage(replyToken, text) {
  var payload = {
    replyToken: replyToken,
    messages: [{ type: "text", text: text }]
  };

  UrlFetchApp.fetch(LINE_REPLY_URL, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify(payload)
  });
}

function replyFlex(replyToken, altText, flexContents) {
  var payload = {
    replyToken: replyToken,
    messages: [{ type: "flex", altText: altText, contents: flexContents }]
  };

  UrlFetchApp.fetch(LINE_REPLY_URL, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify(payload)
  });
}

function pushMessage(userId, text) {
  var payload = {
    to: userId,
    messages: [{ type: "text", text: text }]
  };

  UrlFetchApp.fetch(LINE_PUSH_URL, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify(payload)
  });
}

function getDisplayName(userId) {
  try {
    var response = UrlFetchApp.fetch(LINE_PROFILE_URL + userId, {
      method: "get",
      headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN }
    });
    var profile = JSON.parse(response.getContentText());
    return profile.displayName;
  } catch (e) {
    return FALLBACK_DISPLAY_NAME;
  }
}

// ===== Setup =====

function setup() {
  ensureSheetStructure();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settings = ss.getSheetByName("Settings");

  // Refresh variables reference (always regenerate, clear 3 cols to clean up old 対象キー)
  var lastRow = settings.getLastRow();
  if (lastRow >= 1) {
    var clearRows = Math.max(lastRow, 1);
    settings.getRange(1, 12, clearRows, 1).clearContent();
  }
  if (lastRow >= 2) {
    settings.getRange(2, 10, lastRow - 1, 2).clearContent();
  }
  writeVariablesReference(settings);

  // Add missing message keys without overwriting existing ones
  lastRow = settings.getLastRow();
  var msgColData = lastRow >= 2 ? settings.getRange(2, 7, lastRow - 1, 1).getValues() : [];
  var existing = {};
  var lastMsgRow = 1;
  for (var i = 0; i < msgColData.length; i++) {
    var k = String(msgColData[i][0]).trim();
    if (k) {
      existing[k] = true;
      lastMsgRow = i + 2;
    }
  }
  var msgKeys = Object.keys(MESSAGE_DEFAULTS);
  var missing = [];
  for (var i = 0; i < msgKeys.length; i++) {
    if (!existing[msgKeys[i]]) {
      missing.push([msgKeys[i], MESSAGE_DEFAULTS[msgKeys[i]]]);
    }
  }
  if (missing.length > 0) {
    settings.getRange(lastMsgRow + 1, 7, missing.length, 2).setValues(missing);
  }

  // Clean up old sheets from previous versions
  var oldNames = ["Status", "Logs", "Config", "Checklist", "Messages", "Variables", "Sheet1", "シート1"];
  for (var i = 0; i < oldNames.length; i++) {
    var old = ss.getSheetByName(oldNames[i]);
    if (old) {
      try { ss.deleteSheet(old); } catch (e) {}
    }
  }

  Logger.log("Setup complete. Settings sheet and Data sheet are ready.");
}

/**
 * Writes the variables reference (in Japanese) to the Settings sheet, columns J-L.
 */
function writeVariablesReference(sheet) {
  var vars = [
    ["{name}", "操作したユーザーの表示名"],
    ["{time}", "最終更新の日時"],
    ["{reminder_minutes}", "リマインダー時間（分）"],
    ["{count}", "表示ログ件数"],
    ["{last_opener}", "最後に開けた人の名前"],
    ["{last_closer}", "最後に閉めた人の名前"],
    ["", ""],
    ["── チェック条件 ──", ""],
    ["open", "開室時のみ表示"],
    ["close", "閉室時のみ（デフォルト）"],
    ["both", "両方で表示"]
  ];
  sheet.getRange(2, 10, vars.length, 2).setValues(vars);
}
