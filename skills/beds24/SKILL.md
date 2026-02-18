---
name: beds24
description: "Interact with Beds24 vacation rental management system via API V2. Manage bookings, properties, inventory, and channel integrations (Airbnb, Booking.com, Stripe)."
homepage: https://wiki.beds24.com/index.php/Category:API_V2
metadata:
  {
    "openclaw":
      {
        "emoji": "🏨",
        "requires": { "env": ["BEDS24_API_KEY", "BEDS24_API_TOKEN"] },
        "hints":
          {
            "BEDS24_API_KEY": "Invite code from Beds24 control panel (Settings → API → API V2)",
            "BEDS24_API_TOKEN": "Access token or refresh token (use refresh token for longer validity)",
          },
      },
  }
---

# beds24

Interact with [Beds24](https://www.beds24.com/) vacation rental management platform via API V2.

## Base URL

```
https://beds24.com/api/v2
```

## Authentication

Beds24 uses token-based authentication with 3 types of credentials:

| Credential        | Lifespan     | Purpose                                          |
| ----------------- | ------------ | ------------------------------------------------ |
| **Invite Code**   | One-time use | Get initial token pair from Beds24 control panel |
| **Access Token**  | 24 hours     | Make API calls (short-lived)                     |
| **Refresh Token** | 30 days      | Get new access token when old one expires        |

### Authentication Flow

```
Invite Code (from Beds24 panel)
        ↓
POST /authentication/setup
        ↓
   Access Token (24h) + Refresh Token (30 days)
        ↓
   Use Access Token for API calls
        ↓
   When expired: POST /authentication/token
        ↓
   New Access Token (no new invite code needed)
```

### Step 1: Get Invite Code

1. Log in to [Beds24 Control Panel](https://control.beds24.com/)
2. Go to **Settings → API → API V2**
3. Generate an invite code (one-time use)

### Step 2: Exchange for Tokens

```bash
# Exchange invite code for access token + refresh token
curl -X 'GET' \
  'https://beds24.com/api/v2/authentication/setup' \
  -H 'accept: application/json' \
  -H 'code: YOUR_INVITE_CODE'

# Response:
{
  "token": "eyJhbGc...",        # Access token (24 hours)
  "refreshToken": "rt_abc...",  # Refresh token (30 days)
  "expiresIn": 86400
}
```

### Step 3: OpenClaw Configuration

Add to `~/.config/openclaw/config.json`:

```json
{
  "skills": {
    "entries": {
      "beds24": {
        "enabled": true,
        "apiKey": "YOUR_INVITE_CODE",
        "env": {
          "beds24.apiToken": "YOUR_ACCESS_TOKEN_OR_REFRESH_TOKEN"
        }
      }
    }
  }
}
```

**Config mapping:**

- `beds24.apiKey` → **Invite Code** (lưu để tham khảo, dùng khi cần regenerate)
- `beds24.apiToken` → **Access Token** hoặc **Refresh Token** (dùng cho API calls)

**Recommendation:** Dùng **Refresh Token** cho `beds24.apiToken` vì nó có thể dùng để lấy access token mới khi cần.

### Step 4: Automatic Token Refresh (Recommended)

Sử dụng script helper để tự động refresh token trước mỗi API call:

```bash
# Using the provided script
./skills/beds24/scripts/beds24-api.sh bookings
./skills/beds24/scripts/beds24-api.sh bookings GET "limit=5&status=confirmed"
./skills/beds24/scripts/beds24-api.sh properties
./skills/beds24/scripts/beds24-api.sh "inventory/rooms/availability" GET "propertyId=12345&from=2025-01-01"
```

Script này tự động:

1. Đọc refresh token từ `~/.config/openclaw/config.json`
2. Gọi `/authentication/token` để lấy access token mới
3. Thực hiện API call với access token fresh

### Manual Refresh Access Token

```bash
# When access token expires, use refresh token to get new one
curl -X 'GET' \
  'https://beds24.com/api/v2/authentication/token' \
  -H 'accept: application/json' \
  -H 'refreshToken: YOUR_REFRESH_TOKEN'

# Response:
{
  "token": "eyJhbGc...",        # New access token
  "refreshToken": "rt_def...",  # New refresh token (rotated)
  "expiresIn": 86400
}
```

### API Request Headers

**Authentication Setup (Invite Code → Tokens):**

```bash
-H 'accept: application/json' \
-H 'code: YOUR_INVITE_CODE'
```

**Refresh Token (Get New Access Token):**

```bash
-H 'accept: application/json' \
-H 'refreshToken: YOUR_REFRESH_TOKEN'
```

**All Other API Calls (with Access Token):**

```bash
-H 'accept: application/json' \
-H 'token: YOUR_ACCESS_TOKEN'
```

## Bookings

### Get Bookings

```bash
# Get bookings with filters
curl -X 'GET' \
  'https://beds24.com/api/v2/bookings?checkInFrom=2025-03-01&checkInTo=2025-03-31' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'

# Available filters:
# - id: Booking ID
# - propertyId: Property ID
# - roomId: Room ID
# - status: Booking status (confirmed, request, cancelled, etc.)
# - checkInFrom/checkInTo: Check-in date range
# - checkOutFrom/checkOutTo: Check-out date range
# - modifiedFrom/modifiedTo: Modification date range
# - includeInvoice: Include invoice data (true/false)
# - includeGuests: Include guest details (true/false)
# - includePayments: Include payment data (true/false)
```

### Create Booking

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/bookings' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "propertyId": "12345",
    "roomId": "67890",
    "checkIn": "2025-04-01",
    "checkOut": "2025-04-05",
    "status": "confirmed",
    "guest": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    },
    "numAdults": 2,
    "numChildren": 0
  }]'
```

### Update Booking

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/bookings' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "id": "BOOKING_ID",
    "status": "checked-in",
    "guest": {
      "firstName": "Jane",
      "lastName": "Doe"
    }
  }]'
```

### Delete Booking

```bash
curl -X 'DELETE' \
  'https://beds24.com/api/v2/bookings' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{"id": "BOOKING_ID"}]'
```

### Get Booking Messages

```bash
curl -X 'GET' \
  'https://beds24.com/api/v2/bookings/messages?bookingId=BOOKING_ID' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Send Booking Message

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/bookings/messages' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "bookingId": "BOOKING_ID",
    "message": "Welcome! Check-in is at 3 PM.",
    "sendEmail": true
  }]'
```

### Get Booking Invoices

```bash
curl -X 'GET' \
  'https://beds24.com/api/v2/bookings/invoices?bookingId=BOOKING_ID' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

## Inventory

### Get Room Availability

Check room availability status (available/booked) for a date range. Returns availability for all rooms if `roomId` is omitted.

```bash
# Get availability for all rooms in property
curl -X 'GET' \
  'https://beds24.com/api/v2/inventory/rooms/availability?propertyId=165863&from=2026-02-17&to=2026-02-20' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'

# Get availability for specific room
curl -X 'GET' \
  'https://beds24.com/api/v2/inventory/rooms/availability?propertyId=165863&roomId=364182&from=2026-02-17&to=2026-02-20' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'

# Response:
{
  "success": true,
  "type": "availability",
  "count": 12,
  "data": [
    {
      "roomId": 364182,
      "propertyId": 165863,
      "name": "LE-001",
      "availability": {
        "2026-02-17": false,  // Booked
        "2026-02-18": true,   // Available
        "2026-02-19": false   // Booked
      }
    }
  ]
}
```

### Get Room Calendar

Get per-day calendar values including price, minStay, and availability settings.

```bash
# Get calendar for all rooms
curl -X 'GET' \
  'https://beds24.com/api/v2/inventory/rooms/calendar?propertyId=165863&from=2026-03-01&to=2026-03-05' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'

# Get calendar for specific room
curl -X 'GET' \
  'https://beds24.com/api/v2/inventory/rooms/calendar?propertyId=165863&roomId=364182&from=2026-03-01&to=2026-03-05' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Get Room Offers

Get available offers for guests based on search criteria (requires `arrival`, `departure`, and `occupancy`).

```bash
# Search offers for 2 adults
curl -X 'GET' \
  'https://beds24.com/api/v2/inventory/rooms/offers?propertyId=165863&arrival=2026-03-01&departure=2026-03-05&occupancy=2' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Update Calendar

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/inventory/rooms/calendar' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "propertyId": "12345",
    "roomId": "67890",
    "date": "2025-04-01",
    "availability": 0,
    "price": 150.00
  }]'
```

## Properties

### Get Properties

```bash
# Get all properties
curl -X 'GET' \
  'https://beds24.com/api/v2/properties' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'

# Include price rules
curl -X 'GET' \
  'https://beds24.com/api/v2/properties?includePriceRules=true' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'

# Filter by property ID
curl -X 'GET' \
  'https://beds24.com/api/v2/properties?id=12345' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Create Property

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/properties' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "name": "My Vacation Rental",
    "address": "123 Main St",
    "city": "Miami",
    "country": "US",
    "timezone": "America/New_York"
  }]'
```

### Update Property

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/properties' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "id": "12345",
    "name": "Updated Property Name",
    "description": "New description"
  }]'
```

### Delete Property

```bash
curl -X 'DELETE' \
  'https://beds24.com/api/v2/properties' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{"id": "12345"}]'
```

### Delete Room

```bash
curl -X 'DELETE' \
  'https://beds24.com/api/v2/properties/rooms' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{"id": "67890"}]'
```

## Accounts

### Get Accounts

```bash
# Get account and sub-accounts
curl -X 'GET' \
  'https://beds24.com/api/v2/accounts' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Update Account

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/accounts' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "id": "ACCOUNT_ID",
    "companyName": "My Rental Company"
  }]'
```

## Channels

### Get Channel Settings

```bash
# Get channel-specific settings
curl -X 'GET' \
  'https://beds24.com/api/v2/channels/settings?channel=airbnb' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Update Channel Settings

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/channels/settings' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "channel": "airbnb",
    "propertyId": "12345",
    "listingId": "airbnb_123"
  }]'
```

### Airbnb Actions

```bash
# Get Airbnb user IDs
curl -X 'GET' \
  'https://beds24.com/api/v2/channels/airbnb/users' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'

# Get Airbnb listings
curl -X 'GET' \
  'https://beds24.com/api/v2/channels/airbnb/listings?userId=USER_ID' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'

# Perform Airbnb action
curl -X 'POST' \
  'https://beds24.com/api/v2/channels/airbnb' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "action": "sync",
    "propertyId": "12345"
  }]'
```

### Booking.com Actions

```bash
# Perform Booking.com action
curl -X 'POST' \
  'https://beds24.com/api/v2/channels/booking' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "action": "sync",
    "propertyId": "12345"
  }]'

# Get Booking.com reviews
curl -X 'GET' \
  'https://beds24.com/api/v2/channels/booking/reviews?propertyId=12345' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Stripe Actions

```bash
# Create Stripe checkout session
curl -X 'POST' \
  'https://beds24.com/api/v2/channels/stripe' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "action": "createCheckout",
    "bookingId": "BOOKING_ID",
    "amount": 500.00,
    "currency": "USD"
  }]'

# Get payment methods
curl -X 'GET' \
  'https://beds24.com/api/v2/channels/stripe/paymentMethods?bookingId=BOOKING_ID' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'

# Get charges
curl -X 'GET' \
  'https://beds24.com/api/v2/channels/stripe/charges?bookingId=BOOKING_ID' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

## Common Use Cases

### Get Today's Arrivals

```bash
TODAY=$(date +%Y-%m-%d)
curl -X 'GET' \
  'https://beds24.com/api/v2/bookings?checkInFrom=$TODAY&checkInTo=$TODAY&status=confirmed' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Get Upcoming Departures

```bash
TOMORROW=$(date -d "+1 day" +%Y-%m-%d)
curl -X 'GET' \
  'https://beds24.com/api/v2/bookings?checkOutFrom=$TOMORROW&checkOutTo=$TOMORROW&status=checked-in' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Check Room Availability

```bash
curl -X 'GET' \
  'https://beds24.com/api/v2/inventory/rooms/availability?propertyId=12345&roomId=67890&from=2025-04-01&to=2025-04-07' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN' | jq '.[] | select(.available > 0)'
```

### Create Guest Booking

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/bookings' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "propertyId": "12345",
    "roomId": "67890",
    "checkIn": "2025-05-01",
    "checkOut": "2025-05-07",
    "status": "confirmed",
    "guest": {
      "firstName": "Alice",
      "lastName": "Smith",
      "email": "alice@example.com",
      "phone": "+1-555-0123"
    },
    "numAdults": 2,
    "numChildren": 1,
    "notes": "Late arrival expected"
  }]'
```

### Block Dates for Maintenance

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/inventory/rooms/calendar' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "propertyId": "12345",
    "roomId": "67890",
    "date": "2025-06-15",
    "availability": 0,
    "notes": "Maintenance"
  }]'
```

### Sync with Airbnb

```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/channels/airbnb' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "action": "sync",
    "propertyId": "12345",
    "syncCalendar": true,
    "syncPricing": true
  }]'
```

### Process Payment via Stripe

```bash
# Create checkout session for booking
curl -X 'POST' \
  'https://beds24.com/api/v2/channels/stripe' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '[{
    "action": "createCheckout",
    "bookingId": "BOOKING_ID",
    "amount": 750.00,
    "currency": "USD",
    "description": "Reservation payment"
  }]'
```

## Rate Limiting

Beds24 uses a credit-based rate limiting system:

- **Default limit:** 100 credits per 5-minute window
- Each API call consumes credits based on complexity
- Check `X-RateLimit-Remaining` header in responses
- When limit exceeded, API returns `429 Too Many Requests`

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 85
X-RateLimit-Reset: 1699999999
```

### Best Practices

1. Cache responses when possible
2. Use filters to reduce data size
3. Implement exponential backoff on 429 errors
4. Batch operations using array inputs

## Error Handling

### HTTP Status Codes

| Code | Meaning           | Action                                   |
| ---- | ----------------- | ---------------------------------------- |
| 200  | Success           | Request completed successfully           |
| 400  | Bad Request       | Check request parameters                 |
| 401  | Unauthorized      | Token invalid or expired - refresh token |
| 403  | Forbidden         | Insufficient permissions - check scopes  |
| 404  | Not Found         | Resource doesn't exist                   |
| 429  | Too Many Requests | Rate limit hit - wait and retry          |
| 500  | Server Error      | Beds24 server error - retry later        |

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Check-in date must be before check-out date",
    "field": "checkIn"
  }
}
```

### Common Errors

```bash
# 401 - Token expired
# Solution: Refresh token
curl -X 'GET' \
  'https://beds24.com/api/v2/authentication/token' \
    -H 'accept: application/json' \
  -H 'Authorization: Bearer YOUR_REFRESH_TOKEN'

# 400 - Missing required field
# Solution: Check required fields in request body

# 429 - Rate limited
# Solution: Wait before retrying with exponential backoff
```

## Scopes

API tokens have scopes controlling access:

| Scope              | Access                      |
| ------------------ | --------------------------- |
| `read:bookings`    | Read booking data           |
| `write:bookings`   | Create/update bookings      |
| `read:inventory`   | Read availability/pricing   |
| `write:inventory`  | Update availability/pricing |
| `read:properties`  | Read property data          |
| `write:properties` | Create/update properties    |
| `read:accounts`    | Read account data           |
| `read:channels`    | Read channel settings       |
| `write:channels`   | Update channel settings     |
| `all`              | Full access                 |

## Webhooks

Beds24 supports webhooks for real-time notifications:

### Webhook Events

- `booking.created` - New booking created
- `booking.updated` - Booking modified
- `booking.cancelled` - Booking cancelled
- `guest.message` - New guest message

### Webhook Payload Example

```json
{
  "event": "booking.created",
  "timestamp": "2025-04-01T10:30:00Z",
  "data": {
    "bookingId": "12345",
    "propertyId": "67890",
    "checkIn": "2025-05-01",
    "checkOut": "2025-05-07",
    "guestEmail": "guest@example.com"
  }
}
```

Configure webhooks in Beds24 control panel under Settings > API > Webhooks.

## Notes

- All dates use ISO 8601 format (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ssZ`)
- Currency values are in the smallest unit (cents) or with decimal
- Property and room IDs are strings, not integers
- Use `includeInvoice=true` to get pricing details with bookings
- Channel sync operations may take several minutes to complete

## Resources

- [Beds24 API V2 Documentation](https://wiki.beds24.com/index.php/Category:API_V2)
- [Beds24 Control Panel](https://control.beds24.com/)
