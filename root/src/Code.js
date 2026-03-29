// ===== Heimdall v2 =====
// Room lock management LINE bot — Google Apps Script + Google Sheets

// ===== Configuration =====
var LINE_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
var LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
var LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
var LINE_PROFILE_URL = "https://api.line.me/v2/bot/profile/";

// ===== Defaults =====
var DEFAULT_REMINDER_MINUTES = 180;
var DEFAULT_LOG_COUNT = 5;
var DEFAULT_LOG_MAX = 50;
var DATA_LOG_START_ROW = 4;
var FALLBACK_DISPLAY_NAME = "不明";
var TIMESTAMP_FORMAT = "MM/dd HH:mm";

// ===== Theme Colors =====
var COLOR_HEADER   = "#131c2e";
var COLOR_SUBTITLE = "#a0b3cc";
var COLOR_MUTED    = "#7a8ea6";
var COLOR_BOLD     = "#111827";
var COLOR_WHITE    = "#f0f4f8";
var COLOR_OPEN     = "#1aad7c";
var COLOR_CLOSED   = "#c95555";
var COLOR_ACCENT   = "#93a0f8";

// ===== Settings Label → Key Map =====
var SETTINGS_MAP = {
  "リマインダー（分）":   { type: "config", key: "reminder_minutes" },
  "ログ表示件数":         { type: "config", key: "log_default_count" },
  "ログ最大件数":         { type: "config", key: "log_max_count" },
  "開けた時の返信":       { type: "msg",    key: "open_reply" },
  "閉めた時の返信":       { type: "msg",    key: "close_reply" },
  "リマインダー通知":     { type: "msg",    key: "reminder" },
  "ウェルカム挨拶":       { type: "msg",    key: "welcome_greeting" },
  "ウェルカム説明":       { type: "msg",    key: "welcome_desc" }
};

// ===== Checklist Condition Map =====
var CHECKLIST_WHEN_MAP = {
  "開ける時": "open",
  "閉める時": "close",
  "両方": "both"
};

// ===== Default Messages (only user-facing editable ones) =====
var MESSAGE_DEFAULTS = {
  open_reply:        "🔓 部室を【開けました】",
  close_reply:       "🔒 部室を【閉めました】",
  reminder:          "⏰ {name}さん、部室が{reminder_minutes}分以上開いたままです。閉め忘れていませんか？",
  welcome_greeting:  "K'issへようこそ！",
  welcome_desc:      "このBotは部室のカギの開閉状態を管理・記録します。"
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

  if (event.type !== "message" || event.message.type !== "text") return;

  var text = event.message.text.trim().toLowerCase();
  var replyToken = event.replyToken;
  var userId = event.source.userId;

  var logMatch = text.match(/^logs?(?: (\d+))?$/);
  if (logMatch) {
    handleLog(replyToken, logMatch[1] ? parseInt(logMatch[1], 10) : null);
    return;
  }

  switch (text) {
    case "open":   handleOpen(replyToken, userId); break;
    case "close":  handleClose(replyToken, userId); break;
    case "done":
    case "checked": handleCheckedConfirmation(replyToken, userId); break;
    case "now":    handleNow(replyToken); break;
    case "help":   handleHelp(replyToken); break;
    case "welcome": replyFlex(replyToken, "🏠 Heimdall", buildWelcomeFlex()); break;
    default:
      replyMessage(replyToken, "そのコマンドは存在しません。「help」でコマンド一覧を確認できます。");
      break;
  }
}

// ===== Command Handlers =====

function handleFollow(replyToken, userId) {
  var displayName = getDisplayName(userId);
  addLog(userId, displayName, "follow");
  replyFlex(replyToken, "🏠 Heimdall", buildWelcomeFlex());
}

function handleOpen(replyToken, userId) {
  var props = PropertiesService.getScriptProperties();
  var pendingKey = "pending_check_" + userId;
  var items = getChecklistItems("open");

  if (items.length > 0) {
    props.setProperty(pendingKey, "open");
    replyFlex(replyToken, "📝 開室時チェック", buildChecklistFlex(items, "open"));
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
    replyFlex(replyToken, "📝 閉室時チェック", buildChecklistFlex(items, "close"));
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
    replyMessage(replyToken, "確認待ちのチェックリストはありません。");
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

  var msg = getMessage("open_reply", { name: displayName });
  replyFlex(replyToken, msg, buildActionReplyFlex("open", msg, displayName));
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

  var msg = getMessage("close_reply", { name: displayName });
  replyFlex(replyToken, msg, buildActionReplyFlex("close", msg, displayName));
}

function handleNow(replyToken) {
  var status = getCurrentStatus();
  replyFlex(replyToken, "🏠 部室の状態", buildStatusFlex(status));
}

function handleHelp(replyToken) {
  replyFlex(replyToken, "📋 コマンド一覧", buildHelpFlex());
}

function handleLog(replyToken, count) {
  var cfg = readSettings().config;
  var defaultCount = parseInt(cfg.log_default_count, 10) || DEFAULT_LOG_COUNT;
  var maxCount = parseInt(cfg.log_max_count, 10) || DEFAULT_LOG_MAX;

  if (!count) count = defaultCount;
  count = Math.min(Math.max(1, count), maxCount);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Data");
  if (!sheet) {
    replyMessage(replyToken, "ログがありません。");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_LOG_START_ROW) {
    replyMessage(replyToken, "ログがありません。");
    return;
  }

  var numRows = lastRow - DATA_LOG_START_ROW + 1;
  var data = sheet.getRange(DATA_LOG_START_ROW, 1, numRows, 4).getValues();
  var logs = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) logs.push(data[i]);
  }

  if (logs.length === 0) {
    replyMessage(replyToken, "ログがありません。");
    return;
  }

  var recent = logs.slice(-count).reverse();
  var entries = [];
  for (var i = 0; i < recent.length; i++) {
    entries.push({
      time: formatTimestamp(recent[i][0]),
      name: recent[i][2] || FALLBACK_DISPLAY_NAME,
      action: recent[i][3] || ""
    });
  }

  replyFlex(replyToken, "📋 最近のログ", buildLogFlex(entries));
}

// ===== Flex Message Builders =====

function buildWelcomeFlex() {
  var status = getCurrentStatus();
  var isOpen = status.value === "OPEN";
  var statusEmoji = isOpen ? "🔓" : "🔒";
  var statusText = isOpen ? "OPEN" : "CLOSED";
  var statusColor = isOpen ? COLOR_OPEN : COLOR_CLOSED;
  var updatedBy = status.updatedBy || "";
  var updatedAt = status.updatedAt ? formatTimestamp(status.updatedAt) : "";
  var statusLine = updatedBy ? (updatedBy + " / " + updatedAt) : "";

  var bodyContents = [
    { type: "text", text: getMessage("welcome_greeting"), weight: "bold", size: "md", wrap: true },
    { type: "text", text: getMessage("welcome_desc"), size: "sm", color: COLOR_MUTED, wrap: true, margin: "md" },
    { type: "separator", margin: "lg" }
  ];

  if (status.value === "OPEN" || status.value === "CLOSED") {
    bodyContents.push({
      type: "box", layout: "horizontal", margin: "lg", spacing: "sm",
      contents: [
        { type: "text", text: statusEmoji + " " + statusText, weight: "bold", size: "sm", color: statusColor, flex: 0 }
      ]
    });
    if (statusLine) {
      bodyContents.push({ type: "text", text: statusLine, size: "xs", color: COLOR_MUTED, margin: "xs" });
    }
  }

  return {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: COLOR_HEADER, paddingAll: "lg",
      contents: [
        { type: "text", text: "🏠 Heimdall", weight: "bold", size: "xl", color: COLOR_WHITE },
        { type: "text", text: "部室カギ管理Bot", size: "sm", color: COLOR_SUBTITLE, margin: "sm" }
      ]
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", paddingAll: "lg",
      contents: bodyContents
    },
    footer: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            { type: "button", style: "primary", color: COLOR_OPEN, action: { type: "message", label: "🔓 Open", text: "open" } },
            { type: "button", style: "primary", color: COLOR_CLOSED, action: { type: "message", label: "🔒 Close", text: "close" } }
          ]
        },
        { type: "button", style: "link", color: COLOR_MUTED, action: { type: "message", label: "📋 Help", text: "help" } }
      ]
    }
  };
}

function buildHelpFlex() {
  var cmds = [
    ["open",  "部室を開ける"],
    ["close", "部室を閉める"],
    ["now",   "現在の状態を確認"],
    ["help",  "コマンド一覧を表示"],
    ["log",   "最近のログを表示"]
  ];

  var rows = [];
  for (var i = 0; i < cmds.length; i++) {
    rows.push({
      type: "box", layout: "horizontal", margin: "md",
      action: { type: "message", label: cmds[i][0], text: cmds[i][0] },
      contents: [
        { type: "text", text: cmds[i][0], size: "sm", weight: "bold", flex: 2, color: COLOR_ACCENT },
        { type: "text", text: cmds[i][1], size: "sm", flex: 5, color: COLOR_MUTED, wrap: true }
      ]
    });
  }

  return {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: COLOR_HEADER, paddingAll: "lg",
      contents: [
        { type: "text", text: "📋 コマンド一覧", weight: "bold", size: "lg", color: COLOR_WHITE }
      ]
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", paddingAll: "lg",
      contents: rows
    }
  };
}

function buildChecklistFlex(items, operation) {
  var isOpen = operation === "open";
  var title = isOpen ? "📝 開室時..." : "📝 閉室時...";
  var btnColor = isOpen ? COLOR_OPEN : COLOR_CLOSED;

  var bodyContents = [
    { type: "text", text: "以下をすべて確認してください：", size: "sm", color: COLOR_MUTED, wrap: true }
  ];

  for (var i = 0; i < items.length; i++) {
    bodyContents.push({
      type: "box", layout: "horizontal", margin: "md",
      contents: [
        { type: "text", text: "☐", size: "md", flex: 0, color: COLOR_MUTED },
        { type: "text", text: items[i], size: "md", wrap: true, margin: "sm", flex: 5 }
      ]
    });
  }

  return {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: COLOR_HEADER, paddingAll: "lg",
      contents: [
        { type: "text", text: title, weight: "bold", size: "lg", color: COLOR_WHITE }
      ]
    },
    body: {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "lg",
      contents: bodyContents
    },
    footer: {
      type: "box", layout: "vertical",
      contents: [
        { type: "button", style: "primary", color: btnColor, action: { type: "message", label: "全て確認しました", text: "done" } }
      ]
    }
  };
}

function buildStatusFlex(status) {
  var isOpen = status.value === "OPEN";
  var isClosed = status.value === "CLOSED";
  var emoji = isOpen ? "🔓" : "🔒";
  var statusText = isOpen ? "OPEN" : (isClosed ? "CLOSED" : "UNKNOWN");
  var statusColor = isOpen ? COLOR_OPEN : (isClosed ? COLOR_CLOSED : COLOR_MUTED);
  var updatedBy = status.updatedBy || FALLBACK_DISPLAY_NAME;
  var updatedAt = status.updatedAt ? formatTimestamp(status.updatedAt) : "—";

  var bodyContents = [
    { type: "text", text: emoji + " " + statusText, weight: "bold", size: "xl", color: statusColor, align: "center" },
    { type: "separator", margin: "lg" },
    {
      type: "box", layout: "horizontal", margin: "md",
      contents: [
        { type: "text", text: "更新者", size: "xs", color: COLOR_MUTED, flex: 1 },
        { type: "text", text: updatedBy, size: "sm", weight: "bold", flex: 2, align: "end" }
      ]
    },
    {
      type: "box", layout: "horizontal",
      contents: [
        { type: "text", text: "更新日時", size: "xs", color: COLOR_MUTED, flex: 1 },
        { type: "text", text: updatedAt, size: "sm", flex: 2, align: "end" }
      ]
    }
  ];

  var footerContents = [];
  if (isOpen) {
    footerContents.push({ type: "button", style: "primary", color: COLOR_CLOSED, action: { type: "message", label: "🔒 Close", text: "close" } });
  } else if (isClosed) {
    footerContents.push({ type: "button", style: "primary", color: COLOR_OPEN, action: { type: "message", label: "🔓 Open", text: "open" } });
  }
  footerContents.push({ type: "button", style: "link", color: COLOR_MUTED, action: { type: "message", label: "📋 ログを見る", text: "log" } });

  return {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: COLOR_HEADER, paddingAll: "lg",
      contents: [
        { type: "text", text: "🏠 部室の状態", weight: "bold", size: "lg", color: COLOR_WHITE }
      ]
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", paddingAll: "lg",
      contents: bodyContents
    },
    footer: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: footerContents
    }
  };
}

function buildLogFlex(entries) {
  var rows = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var action = e.action.replace("missed_close", "close").replace("missed_open", "open");
    var icon = "📝";
    var actionColor = COLOR_ACCENT;

    if (action === "open") {
      icon = "🔓";
      actionColor = COLOR_OPEN;
    } else if (action === "close") {
      icon = "🔒";
      actionColor = COLOR_CLOSED;
    } else if (action === "follow") {
      icon = "👋";
    }

    rows.push({
      type: "box", layout: "horizontal", spacing: "md", margin: i > 0 ? "sm" : "none",
      contents: [
        { type: "text", text: icon, size: "sm", flex: 0 },
        { type: "text", text: e.name, size: "sm", weight: "bold", flex: 2 },
        { type: "text", text: action, size: "sm", color: actionColor, flex: 2 },
        { type: "text", text: e.time, size: "xs", color: COLOR_MUTED, flex: 3, align: "end" }
      ]
    });
  }

  return {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: COLOR_HEADER, paddingAll: "lg",
      contents: [
        { type: "text", text: "📋 最近のログ", weight: "bold", size: "md", color: COLOR_WHITE }
      ]
    },
    body: {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "lg",
      contents: rows
    }
  };
}

function buildActionReplyFlex(action, message, displayName) {
  var isOpen = action === "open";
  var emoji = isOpen ? "🔓" : "🔒";
  var statusText = isOpen ? "OPEN" : "CLOSED";
  var accentColor = isOpen ? COLOR_OPEN : COLOR_CLOSED;
  var oppositeLabel = isOpen ? "🔒 Close" : "🔓 Open";
  var oppositeCmd = isOpen ? "close" : "open";
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), TIMESTAMP_FORMAT);

  return {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: COLOR_HEADER, paddingAll: "lg",
      contents: [
        { type: "text", text: message, weight: "bold", size: "md", color: COLOR_WHITE, wrap: true }
      ]
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", paddingAll: "lg",
      contents: [
        { type: "text", text: emoji + " " + statusText, weight: "bold", size: "xl", color: accentColor, align: "center" },
        { type: "separator", margin: "lg" },
        {
          type: "box", layout: "horizontal", margin: "md",
          contents: [
            { type: "text", text: "操作者", size: "xs", color: COLOR_MUTED, flex: 1 },
            { type: "text", text: displayName, size: "sm", weight: "bold", flex: 2, align: "end" }
          ]
        },
        {
          type: "box", layout: "horizontal",
          contents: [
            { type: "text", text: "時刻", size: "xs", color: COLOR_MUTED, flex: 1 },
            { type: "text", text: now, size: "sm", flex: 2, align: "end" }
          ]
        }
      ]
    },
    footer: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [
        { type: "button", style: "primary", color: accentColor, action: { type: "message", label: oppositeLabel, text: oppositeCmd } },
        { type: "button", style: "link", color: COLOR_MUTED, action: { type: "message", label: "📋 ログを見る", text: "log" } }
      ]
    }
  };
}

// ===== Helpers =====

function formatTimestamp(ts) {
  if (ts instanceof Date) {
    return Utilities.formatDate(ts, Session.getScriptTimeZone(), TIMESTAMP_FORMAT);
  }
  return String(ts);
}

// ===== Settings Reader =====

var _settingsCache = null;

function readSettings() {
  if (_settingsCache) return _settingsCache;

  var result = { config: {}, messages: {} };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("設定");
  if (!sheet) return result;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return result;

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    var label = String(data[i][0]).trim();
    var value = String(data[i][1]);
    var mapping = SETTINGS_MAP[label];
    if (!mapping) continue;

    if (mapping.type === "config") {
      result.config[mapping.key] = value;
    } else if (mapping.type === "msg") {
      result.messages[mapping.key] = value;
    }
  }

  _settingsCache = result;
  return result;
}

function getConfig(key) {
  return readSettings().config[key] || null;
}

// ===== Message Loader =====

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
  var settings = readSettings();
  var msg = settings.messages[key];
  if (msg === undefined || msg === null) {
    msg = MESSAGE_DEFAULTS[key] !== undefined ? MESSAGE_DEFAULTS[key] : key;
  }

  // Convert literal \n to real newlines
  msg = msg.replace(/\\n/g, "\n");

  // Explicit replacements first
  if (replacements) {
    for (var k in replacements) {
      msg = msg.replace(new RegExp("\\{" + k + "\\}", "g"), String(replacements[k] || ""));
    }
  }

  // Global replacements for remaining placeholders
  var globals = getGlobalReplacements();
  for (var k in globals) {
    msg = msg.replace(new RegExp("\\{" + k + "\\}", "g"), String(globals[k] || ""));
  }

  return msg;
}

// ===== Checklist Loader =====

function getChecklistItems(operation) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("チェックリスト");
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var items = [];
  for (var i = 0; i < data.length; i++) {
    var item = String(data[i][0]).trim();
    if (!item) continue;
    var whenJa = String(data[i][1] || "").trim();
    var when = CHECKLIST_WHEN_MAP[whenJa] || "close";
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

// ===== Sheet Structure (Non-Destructive) =====

function ensureSheetStructure() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- 設定 tab ----
  var settings = ss.getSheetByName("設定");
  if (!settings) {
    settings = ss.insertSheet("設定");
    initSettingsSheet(settings);
  }

  // ---- チェックリスト tab ----
  var checklist = ss.getSheetByName("チェックリスト");
  if (!checklist) {
    checklist = ss.insertSheet("チェックリスト");
    initChecklistSheet(checklist);
  }

  // ---- Data tab ----
  var dataSheet = ss.getSheetByName("Data");
  if (!dataSheet) {
    dataSheet = ss.insertSheet("Data");
    initDataSheet(dataSheet);
  }
}

function initSettingsSheet(sheet) {
  // Config section
  sheet.getRange(1, 1, 1, 3).setValues([["設定項目", "値", "説明"]]);
  sheet.getRange(1, 1, 1, 3).setFontWeight("bold");

  sheet.getRange(2, 1, 3, 3).setValues([
    ["リマインダー（分）", DEFAULT_REMINDER_MINUTES, "開けたまま放置した時の通知までの時間"],
    ["ログ表示件数",       DEFAULT_LOG_COUNT,         "「log」コマンドのデフォルト表示件数"],
    ["ログ最大件数",       DEFAULT_LOG_MAX,           "「log N」の最大値"]
  ]);

  // Spacer row 5
  // Custom text section
  sheet.getRange(6, 1, 1, 3).setValues([["カスタムテキスト", "テキスト", "説明"]]);
  sheet.getRange(6, 1, 1, 3).setFontWeight("bold");

  sheet.getRange(7, 1, 5, 3).setValues([
    ["開けた時の返信",   MESSAGE_DEFAULTS.open_reply,        "{name}でユーザー名を挿入"],
    ["閉めた時の返信",   MESSAGE_DEFAULTS.close_reply,       "{name}でユーザー名を挿入"],
    ["リマインダー通知", MESSAGE_DEFAULTS.reminder,          "閉め忘れ通知。{name}=名前, {reminder_minutes}=分"],
    ["ウェルカム挨拶",   MESSAGE_DEFAULTS.welcome_greeting,  "友達追加時の挨拶文"],
    ["ウェルカム説明",   MESSAGE_DEFAULTS.welcome_desc,      "友達追加時の説明文"]
  ]);

  // Column widths
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 300);
  sheet.setColumnWidth(3, 280);
}

function initChecklistSheet(sheet) {
  sheet.getRange(1, 1, 1, 2).setValues([["チェック項目", "いつ"]]);
  sheet.getRange(1, 1, 1, 2).setFontWeight("bold");

  sheet.getRange(2, 1, 4, 2).setValues([
    ["タスク1", "閉める時"],
    ["タスク2", "閉める時"],
    ["タスク3", "開ける時"],
    ["タスク4", "開ける時"]
  ]);

  // Data validation dropdown on column B
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["開ける時", "閉める時", "両方"], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 2, 100, 1).setDataValidation(rule);

  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 120);
}

function initDataSheet(sheet) {
  // Row 1: Status
  sheet.getRange(1, 1, 1, 4).setValues([["状態", "CLOSED", "", ""]]);
  sheet.getRange(1, 1).setFontWeight("bold");

  // Row 3: Log headers
  sheet.getRange(3, 1, 1, 4).setValues([["timestamp", "user_id", "user_name", "action"]]);
  sheet.getRange(3, 1, 1, 4).setFontWeight("bold");
}

// ===== LINE API Helpers =====

function replyMessage(replyToken, text) {
  UrlFetchApp.fetch(LINE_REPLY_URL, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: "text", text: text }]
    })
  });
}

function replyFlex(replyToken, altText, flexContents) {
  UrlFetchApp.fetch(LINE_REPLY_URL, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: "flex", altText: altText, contents: flexContents }]
    })
  });
}

function pushMessage(userId, text) {
  UrlFetchApp.fetch(LINE_PUSH_URL, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: text }]
    })
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

// ===== Setup (Non-Destructive) =====

function setup() {
  ensureSheetStructure();
  Logger.log("Setup complete. Tabs: 設定, チェックリスト, Data.");
}
