# Beds24 Agent Monitor - Heartbeat Tasks

Tần suất: 2 giờ / lần

---

## Task 1: Kiểm tra tin nhắn chưa phản hồi

### Mục tiêu

Xác định các cuộc hội thoại mà tin nhắn cuối cùng (trong 2 giờ gần nhất) đến từ khách (guest), cho thấy chủ nhà (host) chưa phản hồi.

### SQL Query - beds24.messages

```sql
WITH LastMessages AS (
  SELECT
    id,
    booking_id,
    msg_time,
    message,
    source,
    ROW_NUMBER() OVER(PARTITION BY booking_id ORDER BY msg_time DESC) as rn
  FROM beds24.messages
  WHERE msg_time >= NOW() - INTERVAL '2 hours'
)
SELECT
  id,
  booking_id,
  msg_time AS last_message_time,
  message AS last_message,
  source AS last_message_source
FROM LastMessages
WHERE rn = 1 AND source = 'guest'
ORDER BY msg_time DESC;
```

### SQL Query - beds24.otamessages

```sql
WITH LastOTAMessages AS (
  SELECT
    om.id,
    om.booking_id,
    om.msg_time,
    om.message,
    om.source,
    om.channel_ref,
    to.source AS ota_platform,
    ROW_NUMBER() OVER(PARTITION BY om.channel_ref ORDER BY om.msg_time DESC) as rn
  FROM beds24.otamessages om
  LEFT JOIN beds24.telegram_ota to ON om.channel_ref = to.channel_id
  WHERE om.msg_time >= NOW() - INTERVAL '2 hours'
)
SELECT
  id,
  booking_id,
  msg_time AS last_message_time,
  message AS last_message,
  source AS last_message_source,
  channel_ref,
  ota_platform
FROM LastOTAMessages
WHERE rn = 1 AND source = 'guest'
ORDER BY msg_time DESC;
```

### Hành động khi phát hiện

- [ ] Ghi nhận danh sách booking_id cần phản hồi
- [ ] Thông báo tới host qua kênh cấu hình (Telegram/Zalo)
- [ ] Format: `⚠️ [Beds24] Booking {id} có tin nhắn chưa phản hồi từ {thờigian}`

---

## Task 2: Kiểm tra rủi ro phàn nàn

### Mục tiêu

Xác định các tin nhắn từ guest trong 2 giờ gần nhất có chứa từ khóa hoặc dấu hiệu cho thấy rủi ro phàn nàn hoặc vấn đề cần xử lý khẩn cấp.

### Risk Keywords

- problem, issue, complaint, cancel, emergency, help
- tiếng Việt: gấp, phàn nàn, khiếu nại, khó khăn, hỗ trợ, sự cố, không hài lòng, tệ, kém

### SQL Query - beds24.messages

```sql
SELECT
  id,
  booking_id,
  msg_time,
  message,
  source
FROM beds24.messages
WHERE
  msg_time >= NOW() - INTERVAL '2 hours'
  AND source = 'guest'
  AND (
    LOWER(message) LIKE '%problem%' OR
    LOWER(message) LIKE '%issue%' OR
    LOWER(message) LIKE '%complaint%' OR
    LOWER(message) LIKE '%cancel%' OR
    LOWER(message) LIKE '%emergency%' OR
    LOWER(message) LIKE '%help%' OR
    LOWER(message) LIKE '%gấp%' OR
    LOWER(message) LIKE '%phàn nàn%' OR
    LOWER(message) LIKE '%khiếu nại%' OR
    LOWER(message) LIKE '%khó khăn%' OR
    LOWER(message) LIKE '%hỗ trợ%' OR
    LOWER(message) LIKE '%sự cố%' OR
    LOWER(message) LIKE '%không hài lòng%' OR
    LOWER(message) LIKE '%tệ%' OR
    LOWER(message) LIKE '%kém%'
  )
ORDER BY msg_time DESC;
```

### SQL Query - beds24.otamessages

```sql
SELECT
  om.id,
  om.booking_id,
  om.msg_time,
  om.message,
  om.source,
  om.channel_ref,
  to.source AS ota_platform
FROM beds24.otamessages om
LEFT JOIN beds24.telegram_ota to ON om.channel_ref = to.channel_id
WHERE
  om.msg_time >= NOW() - INTERVAL '2 hours'
  AND om.source = 'guest'
  AND (
    LOWER(om.message) LIKE '%problem%' OR
    LOWER(om.message) LIKE '%issue%' OR
    LOWER(om.message) LIKE '%complaint%' OR
    LOWER(om.message) LIKE '%cancel%' OR
    LOWER(om.message) LIKE '%emergency%' OR
    LOWER(om.message) LIKE '%help%' OR
    LOWER(om.message) LIKE '%gấp%' OR
    LOWER(om.message) LIKE '%phàn nàn%' OR
    LOWER(om.message) LIKE '%khiếu nại%' OR
    LOWER(om.message) LIKE '%khó khăn%' OR
    LOWER(om.message) LIKE '%hỗ trợ%' OR
    LOWER(om.message) LIKE '%sự cố%' OR
    LOWER(om.message) LIKE '%không hài lòng%' OR
    LOWER(om.message) LIKE '%tệ%' OR
    LOWER(om.message) LIKE '%kém%'
  )
ORDER BY om.msg_time DESC;
```

### Hành động khi phát hiện

- [ ] Đánh dấu mức độ ưu tiên: CRITICAL
- [ ] Gửi cảnh báo ngay lập tức tới host
- [ ] Format: `🚨 [Beds24] RỦI RO PHÀN NÀN - Booking {id}: {snippet tin nhắn}`

---

## Output Format

Nếu không phát hiện vấn đề:

```
HEARTBEAT_OK
```

Nếu phát hiện vấn đề:

```
[Beds24 Monitor] Phát hiện {N} vấn đề cần xử lý:

**Tin nhắn chưa phản hồi ({count}):**
- Booking {id} ({OTA}): {time} - "{message_snippet}"

**Rủi ro phàn nàn ({count}):**
- Booking {id} ({OTA}): {time} - "{message_snippet}"

Vui lòng kiểm tra và xử lý.
```

---

## Agent Config Example

```json
{
  "agents": {
    "list": [
      {
        "id": "beds24-monitor",
        "name": "Beds24 Monitor",
        "workspace": "~/clawd-beds24",
        "heartbeat": {
          "every": "2h",
          "target": "telegram",
          "to": "YOUR_CHAT_ID"
        },
        "tools": {
          "allow": ["postgres_query", "sessions_send"]
        }
      }
    ]
  }
}
```
