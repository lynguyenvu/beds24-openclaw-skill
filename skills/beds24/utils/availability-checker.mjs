/**
 * Kiểm tra tình trạng phòng - Module riêng
 * Xử lý logic: khi nhân viên báo "hết phòng", kiểm tra thực tế qua API
 */

import { execSync } from "child_process";

const PROPERTY_ID = "165863"; // La Em

/**
 * Kiểm tra xem tin nhắn có phải báo "hết phòng" không
 */
export function isNoRoomMessage(message) {
  if (!message) return false;
  const msg = message.toLowerCase();
  const noRoomPatterns = [
    "hết phòng",
    "không còn phòng",
    "hết chỗ",
    "không còn chỗ",
    "no rooms",
    "no room",
    "fully booked",
    "sold out",
    "không có phòng",
    "đã hết",
    "booked out",
  ];
  return noRoomPatterns.some((pattern) => msg.includes(pattern));
}

/**
 * Kiểm tra xem tin nhắn có phải hỏi đặt phòng không
 */
export function isBookingInquiry(message) {
  if (!message) return false;
  const msg = message.toLowerCase();
  const inquiryPatterns = [
    "available",
    "booking",
    "phòng",
    "đặt phòng",
    "còn phòng",
    "giá",
    "price",
    "check in",
    "nhận phòng",
    "check-in",
    "stay",
    "from",
    "to",
    "đến",
    "đi",
    "từ",
  ];
  return inquiryPatterns.some((pattern) => msg.includes(pattern));
}

/**
 * Trích xuất ngày từ tin nhắn
 */
export function extractDatesFromMessage(message) {
  if (!message) return [];

  const dates = [];
  const year = new Date().getFullYear();

  // Pattern DD/MM/YYYY hoặc DD/MM
  const pattern1 = /(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{4}|\d{2}))?/g;
  let match;
  while ((match = pattern1.exec(message)) !== null) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const matchYear = match[3];
    const fullYear = matchYear ? (matchYear.length === 2 ? `20${matchYear}` : matchYear) : year;
    dates.push(`${fullYear}-${month}-${day}`);
  }

  // Pattern: ngày DD tháng MM
  const pattern2 = /ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})/gi;
  while ((match = pattern2.exec(message)) !== null) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
  }

  return [...new Set(dates)]; // Remove duplicates
}

/**
 * Kiểm tra phòng trống qua Beds24 API
 */
export async function checkAvailability(checkIn, checkOut, propertyId = PROPERTY_ID) {
  try {
    const cmd = `bash /clawdbot/skills/beds24/scripts/beds24-api.sh \\
      "inventory/rooms/availability" \\
      "GET" \\
      "propertyId=${propertyId}&from=${checkIn}&to=${checkOut}"`;

    const output = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
    const data = JSON.parse(output);

    // Parse availability data
    const availableRooms = [];
    if (data.data && Array.isArray(data.data)) {
      for (const room of data.data) {
        if (room.available > 0) {
          availableRooms.push({
            roomId: room.roomId,
            roomName: room.name || `Phòng ${room.roomId}`,
            available: room.available,
            price: room.price,
          });
        }
      }
    }

    return {
      hasAvailability: availableRooms.length > 0,
      rooms: availableRooms,
      checkIn,
      checkOut,
    };
  } catch (error) {
    console.error("Error checking availability:", error.message);
    return { hasAvailability: false, rooms: [], error: error.message };
  }
}

/**
 * Phân tích cuộc hội thoại Pancake để tìm ngày đặt
 * Tìm ngược 3h, 6h, 9h...
 */
export async function analyzeConversationForDates(conversationId) {
  const dates = [];
  const intervals = [0, 3, 6, 9, 12]; // Tìm trong 12h qua, mỗi 3h

  for (const hours of intervals) {
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    const until = since + 10800; // 3h window

    try {
      // Lấy tin nhắn cuộc hội thoại
      const cmd = `NOW=${until}; SINCE=${since}; bash /clawdbot/skills/pancake/scripts/pancake.sh messages-list "${conversationId}" "?since=$SINCE&until=$NOW" 2>/dev/null || echo "[]"`;

      const output = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
      const messages = JSON.parse(output);

      if (Array.isArray(messages)) {
        for (const msg of messages.reverse()) {
          // Đảo ngược để đọc từ cũ đến mới
          if (msg.message && isBookingInquiry(msg.message)) {
            const extractedDates = extractDatesFromMessage(msg.message);
            if (extractedDates.length >= 2) {
              return {
                checkIn: extractedDates[0],
                checkOut: extractedDates[1],
                sourceMessage: msg.message,
              };
            }
            dates.push(...extractedDates);
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching messages at ${hours}h:`, error.message);
    }
  }

  // Nếu tìm thấy ít nhất 2 ngày, dùng làm check-in/check-out
  const uniqueDates = [...new Set(dates)].sort();
  if (uniqueDates.length >= 2) {
    return {
      checkIn: uniqueDates[0],
      checkOut: uniqueDates[uniqueDates.length - 1],
      allDates: uniqueDates,
    };
  }

  return null;
}

/**
 * Kiểm tra và tạo cảnh báo nếu báo sai
 */
export async function verifyNoRoomAlert(conversationId, staffMessage) {
  // Kiểm tra xem tin nhắn nhân viên có báo hết phòng không
  if (!isNoRoomMessage(staffMessage)) {
    return null;
  }

  // Tìm ngày đặt trong cuộc hội thoại
  const dates = await analyzeConversationForDates(conversationId);
  if (!dates || !dates.checkIn || !dates.checkOut) {
    return {
      verified: false,
      reason: "Không tìm thấy ngày đặt trong cuộc hội thoại",
      staffMessage,
    };
  }

  // Kiểm tra thực tế
  const availability = await checkAvailability(dates.checkIn, dates.checkOut);

  if (availability.hasAvailability) {
    return {
      verified: false,
      reason: "CẢNH BÁO: Nhân viên báo hết phòng nhưng thực tế CÒN PHÒNG!",
      staffMessage,
      dates,
      availableRooms: availability.rooms,
      alert: true,
    };
  }

  return {
    verified: true,
    reason: "Đúng - Thực tế đã hết phòng",
    dates,
    staffMessage,
  };
}
