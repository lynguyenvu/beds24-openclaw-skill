#!/usr/bin/env node
/**
 * Beds24 Heartbeat Handler
 * Xử lý heartbeat tasks: check messages và gửi báo cáo
 * Dùng CLI tools thay vì agent tools
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { isNoRoomMessage, verifyNoRoomAlert } from "./utils/availability-checker.mjs";

const TELEGRAM_TOKEN_FILE = "/root/.clawdbot/secrets/telegram-token.txt";
const TELEGRAM_CHAT_ID = "6393249637";

/**
 * Get Gemini API key from credentials file
 */
function getGeminiApiKey() {
  try {
    const credsPath = `${homedir()}/.openclaw/credentials/postgres.enc`;
    const creds = readFileSync(credsPath, "utf-8");
    const line = creds.split("\n").find((l) => l.startsWith("gemini_api_key="));
    if (!line) return null;
    const encoded = line.split("=")[1];
    return Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * AI-based intention analysis using Gemini
 */
async function analyzeIntentionWithAI(message) {
  if (!message) return "normal";

  const prompt = `Analyze this customer message and return ONLY one intention: complaint, urgent, cancel, problem, question, or normal.
Message: "${message}"
Intention:`;

  try {
    const response = execSync(
      `curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=\${getGeminiApiKey()}" \
        -H "Content-Type: application/json" \
        -d '{"contents":[{"parts":[{"text":"${prompt.replace(/"/g, '\\"')}"}]}]}'`,
      { encoding: "utf-8", timeout: 10000 },
    );
    const result = JSON.parse(response);
    const text =
      result.candidates?.[0]?.content?.parts?.[0]?.text?.toLowerCase()?.trim() || "normal";
    if (["complaint", "urgent", "cancel", "problem", "question"].includes(text)) return text;
    return "normal";
  } catch {
    // Fallback to keyword-based
    return analyzeIntentionKeywords(message);
  }
}

// Đọc Telegram token
function getTelegramToken() {
  try {
    return readFileSync(TELEGRAM_TOKEN_FILE, "utf-8").trim();
  } catch {
    console.error("Cannot read Telegram token");
    return null;
  }
}

/**
 * Format thờigian từ PostgreSQL (đã là GMT+7)
 */
function formatTime(dateStr) {
  try {
    const date = new Date(dateStr);

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${hours}:${minutes} ${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Format thờigian từ Pancake (UTC, cần +7h)
 */
function formatPancakeTime(dateStr) {
  try {
    // Pancake trả về UTC nhưng không có Z, cần add 7h
    const date = new Date(dateStr);
    const gmt7Date = new Date(date.getTime() + 7 * 3600000);

    const hours = String(gmt7Date.getHours()).padStart(2, "0");
    const minutes = String(gmt7Date.getMinutes()).padStart(2, "0");
    const day = String(gmt7Date.getDate()).padStart(2, "0");
    const month = String(gmt7Date.getMonth() + 1).padStart(2, "0");
    const year = gmt7Date.getFullYear();

    return `${hours}:${minutes} ${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Format current time
 * Server đã ở GMT+7, format trực tiếp
 */
function formatCurrentTime() {
  const now = new Date();

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  return `${hours}:${minutes} ${day}/${month}/${year}`;
}

/**
 * Lấy danh sách conversations từ Pancake
 */
function getPancakeConversations() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const since = now - 7200;
    const cmd = `bash /clawdbot/skills/pancake/scripts/pancake.sh conversations-list 113099207089395 "?since=${since}&until=${now}"`;

    const output = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
    const data = JSON.parse(output);

    if (!data.success || !data.conversations) {
      return { total: 0, unread: 0, items: [] };
    }

    const items = [];
    let unread = 0;

    for (const conv of data.conversations) {
      const isUnread = !conv.seen && conv.snippet;
      if (isUnread) unread++;

      items.push({
        id: conv.id,
        name: conv.from?.name || "Khách",
        time: conv.updated_at ? formatPancakeTime(conv.updated_at) : "",
        snippet: conv.snippet || "",
        unread: isUnread,
      });
    }

    return {
      total: data.conversations.length,
      unread,
      items,
    };
  } catch (error) {
    console.error("Error fetching Pancake conversations:", error.message);
    return { total: 0, unread: 0, items: [] };
  }
}

/**
 * Parse Pancake output
 */
function parsePancakeOutput(output) {
  const lines = output.split("\n");
  let total = 0;
  let unread = 0;
  const items = [];

  for (const line of lines) {
    if (line.includes("✗") && line.includes("INBOX")) {
      unread++;
      const parts = line.split(/\s{2,}/);
      if (parts.length >= 6) {
        items.push({
          name: parts[2]?.trim(),
          time: parts[3]?.trim(),
          tag: parts[4]?.trim(),
          snippet: parts[6]?.trim(),
        });
      }
    }
  }

  const totalMatch = output.match(/Tổng:\s*(\d+)\s*conversations/);
  if (totalMatch) total = parseInt(totalMatch[1]);

  return { total, unread, items };
}

/**
 * Get password from credentials file
 */
function getPostgresPassword() {
  try {
    const credsPath = `${homedir()}/.openclaw/credentials/postgres.enc`;
    const creds = readFileSync(credsPath, "utf-8");
    const line = creds.split("\n").find((l) => l.startsWith("agent_monitor_ro="));
    if (!line) throw new Error("agent_monitor_ro not found in credentials");
    const encoded = line.split("=")[1];
    return Buffer.from(encoded, "base64").toString("utf-8");
  } catch (error) {
    console.error("Failed to read postgres password:", error.message);
    return null;
  }
}

/**
 * Load custom risk patterns from config file
 */
function loadRiskPatterns() {
  try {
    const patternsPath = `${homedir()}/.openclaw/credentials/risk-patterns.json`;
    const content = readFileSync(patternsPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    // Return default patterns if file not found
    return { customPatterns: [], watchList: { bookings: [], guests: [] } };
  }
}

// Load patterns once at startup
const riskConfig = loadRiskPatterns();

/**
 * Query PostgreSQL trực tiếp qua psql
 */
function queryPostgres(sql) {
  try {
    const password = getPostgresPassword();
    if (!password) throw new Error("Could not get postgres password");
    const connStr = `postgresql://agent_monitor_ro:${password}@36.50.177.146:5433/beds24?sslmode=disable`;
    const cmd = `psql "${connStr}" -t -A -F"|" -c "${sql.replace(/"/g, '\\"')}"`;

    const output = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
    return parsePsqlOutput(output);
  } catch (error) {
    console.error("PostgreSQL query error:", error.message);
    return [];
  }
}

/**
 * Parse psql output (pipe-delimited)
 */
function parsePsqlOutput(output) {
  const lines = output
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  return lines.map((line) => {
    const parts = line.split("|");
    return {
      booking_id: parts[0]?.trim(),
      last_time: parts[1]?.trim(),
      message: parts[2]?.trim(),
      source: parts[3]?.trim(),
      guest_name: parts[4]?.trim(),
      ota: parts[5]?.trim(),
      arrival: parts[6]?.trim(),
      departure: parts[7]?.trim(),
      property_name: parts[8]?.trim(),
    };
  });
}

/**
 * Query Beds24 messages
 */
function getBeds24Messages() {
  try {
    // Query for unreplied messages
    const unrepliedQuery = `WITH LastMessages AS (
      SELECT m.id, m.booking_id, m.msg_time, m.message, m.source,
        ROW_NUMBER() OVER(PARTITION BY m.booking_id ORDER BY m.msg_time DESC) as rn
      FROM beds24.messages m
      WHERE m.msg_time >= NOW() - INTERVAL '2 hours'
        AND m.msg_time <= NOW() + INTERVAL '1 minute'
    )
    SELECT lm.booking_id, lm.msg_time AS last_time,
      REPLACE(REPLACE(lm.message, '\n', ' '), '|', '/') as message,
      lm.source,
      CONCAT(b.first_name, ' ', b.last_name) as guest_name,
      COALESCE(b.api_source, b.channel, 'Unknown') as ota,
      b.arrival::text, b.departure::text,
      COALESCE(p.name, 'Chưa phân loại') as property_name
    FROM LastMessages lm
    JOIN beds24.bookings b ON lm.booking_id = b.booking_id
    LEFT JOIN beds24.property p ON b.property_id = p.id
    WHERE lm.rn = 1 AND lm.source = 'guest';`;

    // Query for risk messages
    const riskQuery = `SELECT m.booking_id, m.msg_time AS last_time,
      REPLACE(REPLACE(m.message, '\n', ' '), '|', '/') as message,
      m.source,
      CONCAT(b.first_name, ' ', b.last_name) as guest_name,
      COALESCE(b.api_source, b.channel, 'Unknown') as ota,
      b.arrival::text, b.departure::text,
      COALESCE(p.name, 'Chưa phân loại') as property_name
    FROM beds24.messages m
    JOIN beds24.bookings b ON m.booking_id = b.booking_id
    LEFT JOIN beds24.property p ON b.property_id = p.id
    WHERE m.msg_time >= NOW() - INTERVAL '2 hours'
      AND m.source = 'guest';`;

    const unreplied = queryPostgres(unrepliedQuery);
    const risk = queryPostgres(riskQuery);

    return { unreplied, risk };
  } catch (error) {
    console.error("Error fetching Beds24 messages:", error.message);
    return { unreplied: [], risk: [] };
  }
}

/**
 * Phân tích intention của tin nhắn (với custom patterns)
 */
function analyzeIntentionKeywords(message) {
  if (!message) return "normal";

  const msg = message.toLowerCase();

  // Check custom patterns first (higher priority)
  for (const pattern of riskConfig.customPatterns || []) {
    for (const keyword of pattern.keywords || []) {
      if (msg.includes(keyword.toLowerCase())) {
        return pattern.intention || "complaint";
      }
    }
  }

  // Complaint keywords
  if (
    msg.includes("problem") ||
    msg.includes("issue") ||
    msg.includes("complaint") ||
    msg.includes("phàn nàn") ||
    msg.includes("khiếu nại") ||
    msg.includes("không hài lòng") ||
    msg.includes("tệ") ||
    msg.includes("kém") ||
    msg.includes("illegal")
  ) {
    return "complaint";
  }

  // Urgent keywords
  if (
    msg.includes("urgent") ||
    msg.includes("emergency") ||
    msg.includes("gấp") ||
    msg.includes("khẩn") ||
    msg.includes("ngay") ||
    msg.includes("sớm") ||
    msg.includes("on my way") ||
    msg.includes("arriving")
  ) {
    return "urgent";
  }

  // Cancel keywords
  if (
    msg.includes("cancel") ||
    msg.includes("hủy") ||
    msg.includes("refund") ||
    msg.includes("hoàn tiền")
  ) {
    return "cancel";
  }

  // Question keywords
  if (
    msg.includes("?") ||
    msg.includes("hỏi") ||
    msg.includes("check") ||
    msg.includes("available") ||
    msg.includes("confirm")
  ) {
    return "question";
  }

  return "normal";
}

/**
 * Chuyển intention thành icon
 */
function getIntentionIcon(intention) {
  const icons = {
    complaint: "🚨",
    urgent: "⚡",
    cancel: "❌",
    question: "❓",
    normal: "✓",
  };
  return icons[intention] || "•";
}

/**
 * Chuyển OTA/channel thành tên đầy đủ
 */
function getOtaLabel(ota) {
  const otaLower = ota?.toLowerCase() || "";
  if (otaLower.includes("airbnb")) return "Airbnb";
  if (otaLower.includes("booking.com")) return "Booking.com";
  if (otaLower.includes("agoda")) return "Agoda";
  if (otaLower.includes("expedia")) return "Expedia";
  if (otaLower.includes("traveloka")) return "Traveloka";
  if (otaLower.includes("trip.com")) return "Trip.com";
  if (otaLower.includes("direct")) return "Direct";
  if (otaLower.includes("website")) return "Website";
  return "Khác";
}

/**
 * Kiểm tra tin nhắn có phải hỏi đặt phòng không
 */
function isBookingInquiry(message) {
  if (!message) return false;
  const msg = message.toLowerCase();
  return (
    msg.includes("available") ||
    msg.includes("booking") ||
    msg.includes("phòng") ||
    msg.includes("đặt phòng") ||
    msg.includes("còn phòng") ||
    msg.includes("giá") ||
    msg.includes("price") ||
    msg.includes("check in") ||
    msg.includes("nhận phòng")
  );
}

/**
 * Lấy ngày từ tin nhắn (đơn giản)
 */
function extractDatesFromMessage(message) {
  // Pattern: DD/MM hoặc DD-MM
  const datePattern = /(\d{1,2})[\/\-](\d{1,2})/g;
  const matches = [];
  let match;
  while ((match = datePattern.exec(message)) !== null) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = new Date().getFullYear();
    matches.push(`${year}-${month}-${day}`);
  }
  return matches;
}

/**
 * Tạo Pancake report - tách phần chưa đọc và rủi ro
 */
function generatePancakeReport(data) {
  const now = formatCurrentTime();

  let report = `[Pancake Report - ${now} (GMT+7)]\n\n`;
  report += `🥞 Pancake (2h qua):\n`;
  report += `- ${data.total} cuộc hội thoại\n`;

  // Cảnh báo rủi ro (complaint, urgent, cancel)
  const riskItems = data.items.filter((item) => {
    const intention = analyzeIntentionKeywords(item.snippet);
    return ["complaint", "urgent", "cancel"].includes(intention);
  });

  report += `- ${riskItems.length} cảnh báo rủi ro:\n`;

  if (riskItems.length === 0) {
    report += `  Không có\n`;
  } else {
    for (const item of riskItems) {
      const intention = analyzeIntentionKeywords(item.snippet);
      report += `\n\`\`\`\n`;
      report += `${getIntentionIcon(intention)} ${item.name}\n`;
      report += `⏰ ${item.time}\n`;
      report += `💬 ${item.snippet}\n`;
      report += `\`\`\`\n`;
    }
  }

  return { report, items: data.items };
}

/**
 * Tạo Beds24 report - gom theo cơ sở -> kênh OTA
 */
function generateBeds24Report(data) {
  const now = formatCurrentTime();

  let report = `[Beds24 Report - ${now} (GMT+7)]\n\n`;
  report += `🏨 Beds24 (2h qua):\n`;

  // Unreplied bookings - gom theo cơ sở -> kênh
  const unreplied = data.unreplied || [];
  const unrepliedByProperty = {};
  for (const item of unreplied) {
    const property = item.property_name || "Cơ sở";
    const otaLabel = getOtaLabel(item.ota || "Unknown");
    if (!unrepliedByProperty[property]) unrepliedByProperty[property] = {};
    if (!unrepliedByProperty[property][otaLabel]) unrepliedByProperty[property][otaLabel] = [];
    unrepliedByProperty[property][otaLabel].push(item);
  }

  report += `- ${unreplied.length} đặt phòng chưa phản hồi:\n`;
  for (const [property, otaGroups] of Object.entries(unrepliedByProperty)) {
    report += `\n📍 ${property}\n`;
    for (const [label, items] of Object.entries(otaGroups)) {
      report += `  📌 ${label} (${items.length}):\n`;
      for (const item of items) {
        const guestName = item.guest_name || "Khách";
        let lastMessage = item.message?.replace(/\n/g, " ") || "";
        if (lastMessage.includes("<img") || lastMessage.includes("<a href=")) {
          lastMessage = lastMessage.replace(
            /<a[^>]*href="[^"]*"[^>]*>.*?<img[^>]*>.*?<\/a>/gi,
            "[📎 Hình ảnh]",
          );
          lastMessage = lastMessage.replace(/<img[^>]*>/gi, "[📎 Hình ảnh]");
        }
        lastMessage = lastMessage.replace(/<[^>]*>/g, "");
        report += `    • ${guestName} | Đặt phòng ${item.booking_id} | ⏰ ${formatTime(item.last_time)}\n`;
        if (lastMessage) {
          report += `      💬 ${lastMessage}\n`;
        }
      }
    }
  }

  // Risk messages - gom theo booking_id trước, chỉ phân tích 1 lần per booking
  const riskMessages = data.risk || [];

  // Group by booking_id, lấy message mới nhất
  const byBooking = {};
  for (const msg of riskMessages) {
    const bid = msg.booking_id;
    if (!byBooking[bid] || new Date(msg.last_time) > new Date(byBooking[bid].last_time)) {
      byBooking[bid] = msg;
    }
  }

  // Phân tích intention cho mỗi booking (chỉ 1 lần)
  const risks = [];
  for (const msg of Object.values(byBooking)) {
    const intention = analyzeIntentionKeywords(msg.message);
    if (["complaint", "urgent", "cancel"].includes(intention)) {
      risks.push({ ...msg, intention });
    }
  }

  const risksByProperty = {};
  for (const risk of risks) {
    const property = risk.property_name || "Cơ sở";
    const otaLabel = getOtaLabel(risk.ota || "Unknown");
    if (!risksByProperty[property]) risksByProperty[property] = {};
    if (!risksByProperty[property][otaLabel]) risksByProperty[property][otaLabel] = [];
    risksByProperty[property][otaLabel].push(risk);
  }

  report += `\n- ${risks.length} rủi ro:\n`;
  if (risks.length === 0) {
    report += `  Không phát hiện\n`;
  } else {
    for (const [property, otaGroups] of Object.entries(risksByProperty)) {
      report += `\n📍 ${property}\n`;
      for (const [label, items] of Object.entries(otaGroups)) {
        report += `  🚨 ${label} (${items.length}):\n`;
        for (const risk of items) {
          let message = risk.message?.replace(/\n/g, " ") || "";
          if (message.includes("<img") || message.includes("<a href=")) {
            message = message.replace(
              /<a[^>]*href="[^"]*"[^>]*>.*?<img[^>]*>.*?<\/a>/gi,
              "[📎 Hình ảnh]",
            );
            message = message.replace(/<img[^>]*>/gi, "[📎 Hình ảnh]");
          }
          message = message.replace(/<[^>]*>/g, "");
          const guestName = risk.guest_name || "Khách";
          const stayDates =
            risk.arrival && risk.departure ? `(${risk.arrival} → ${risk.departure})` : "";
          report += `    ${getIntentionIcon(risk.intention)} ${guestName} | Đặt phòng ${risk.booking_id} ${stayDates}\n`;
          report += `      ⏰ ${formatTime(risk.last_time)} | 💬 ${message}\n`;
        }
      }
    }
  }

  return report;
}

/**
 * Gửi báo cáo qua Telegram Bot API
 */
function sendReport(message) {
  try {
    const token = getTelegramToken();
    if (!token) {
      console.error("No Telegram token available");
      return;
    }

    // Escape special characters for curl
    const escapedMessage = message
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");

    const cmd = `curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" \
      -H "Content-Type: application/json" \
      -d "{\\"chat_id\\":\\"${TELEGRAM_CHAT_ID}\\",\\"text\\":\\"${escapedMessage}\\",\\"parse_mode\\":\\"\\"}"`;

    execSync(cmd, { timeout: 30000 });
    console.log("Report sent successfully");
  } catch (error) {
    console.error("Error sending report:", error.message);
  }
}

/**
 * Main heartbeat handler
 */
async function runHeartbeat() {
  console.log("Starting heartbeat check...");

  // 1. Check Pancake
  console.log("Checking Pancake...");
  const pancakeData = getPancakeConversations();
  const { report: pancakeReport, items: pancakeItems } = generatePancakeReport(pancakeData);

  // Kiểm tra tin nhắn "hết phòng" từ nhân viên
  console.log("Checking for no-room messages...");
  let noRoomAlerts = "";
  for (const item of pancakeItems) {
    if (isNoRoomMessage(item.snippet)) {
      console.log(`Found no-room message from ${item.name}, verifying...`);
      const verification = await verifyNoRoomAlert(item.id, item.snippet);
      if (verification && verification.alert) {
        noRoomAlerts += `\n\n🚨 CẢNH BÁO SAI:\n`;
        noRoomAlerts += `Nhân viên: ${item.name}\n`;
        noRoomAlerts += `Tin nhắn: ${item.snippet}\n`;
        noRoomAlerts += `Ngày đặt: ${verification.dates?.checkIn} → ${verification.dates?.checkOut}\n`;
        noRoomAlerts += `Phòng còn trống:\n`;
        for (const room of verification.availableRooms || []) {
          noRoomAlerts += `  - ${room.roomName}: ${room.available} phòng\n`;
        }
      }
    }
  }

  // 2. Check Beds24
  console.log("Checking Beds24...");
  const beds24Data = getBeds24Messages();
  const beds24Report = generateBeds24Report(beds24Data);

  // 3. Gửi 2 báo cáo riêng biệt
  console.log("Sending Pancake report...");
  sendReport(pancakeReport + noRoomAlerts);

  // Đợi 1 giây giữa 2 tin nhắn
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("Sending Beds24 report...");
  sendReport(beds24Report);

  console.log("Heartbeat completed");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runHeartbeat().catch(console.error);
}

export { runHeartbeat, generatePancakeReport, generateBeds24Report };
