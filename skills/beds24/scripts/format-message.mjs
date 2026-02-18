#!/usr/bin/env node
/**
 * Format message snippet for heartbeat report
 * Cắt ngắn tin nhắn xuống tối đa 80 ký tự
 */

function formatSnippet(message, maxLength = 80) {
  if (!message) return "";

  // Xóa newline và khoảng trắng thừa
  const cleaned = message.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  // Cắt ngắn nếu dài hơn maxLength
  if (cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength - 3) + "...";
  }

  return cleaned;
}

// Nhận input từ stdin
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => console.log(formatSnippet(input.trim())));

// Hoặc từ command line argument nếu không có stdin
if (!process.stdin.isTTY) {
  // Đang nhận từ stdin, đã handle ở trên
} else {
  const message = process.argv[2] || "";
  console.log(formatSnippet(message));
}
