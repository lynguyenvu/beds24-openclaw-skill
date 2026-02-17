# Beds24 Skill for OpenClaw

[![OpenClaw](https://img.shields.io/badge/OpenClaw-Skill-blue)](https://openclaw.ai)
[![Beds24](https://img.shields.io/badge/Beds24-API%20V2-green)](https://www.beds24.com/)

Complete Beds24 API V2 skill for [OpenClaw](https://openclaw.ai) - Manage vacation rental properties, bookings, inventory, and channel integrations (Airbnb, Booking.com, Stripe).

## Features

- **Bookings Management**: Get, create, update, delete bookings
- **Inventory Control**: Check availability, calendar, room offers
- **Properties**: Manage properties and rooms
- **Channel Integration**: Sync with Airbnb, Booking.com
- **Auto Token Refresh**: Automatic access token refresh before each API call
- **Tested Examples**: All API examples tested with real data

## Installation

### 1. Copy Skill to OpenClaw

```bash
# Clone this repo
git clone https://github.com/lynguyenvu/beds24-openclaw-skill.git

# Copy to OpenClaw skills directory
cp -r beds24-openclaw-skill/beds24 /path/to/openclaw/skills/
```

### 2. Configure Authentication

Edit `~/.config/openclaw/config.json`:

```json
{
  "skills": {
    "entries": {
      "beds24": {
        "enabled": true,
        "apiKey": "YOUR_INVITE_CODE",
        "env": {
          "beds24.apiToken": "YOUR_REFRESH_TOKEN"
        }
      }
    }
  }
}
```

### 3. Get Your Credentials

1. Log in to [Beds24 Control Panel](https://control.beds24.com/)
2. Go to **Settings → API → API V2**
3. Generate an **Invite Code** (one-time use)
4. Exchange for tokens:

```bash
curl -X 'GET' \
  'https://beds24.com/api/v2/authentication/setup' \
  -H 'accept: application/json' \
  -H 'code: YOUR_INVITE_CODE'
```

Response:
```json
{
  "token": "eyJhbGc...",        // Access token (24h)
  "refreshToken": "rt_abc...",  // Refresh token (30 days) ← Save this
  "expiresIn": 86400
}
```

5. Use **Refresh Token** for `beds24.apiToken` in config

## Usage

### Using the Auto-Refresh Script

```bash
# Get bookings
./skills/beds24/scripts/beds24-api.sh bookings GET "limit=5"

# Get properties
./skills/beds24/scripts/beds24-api.sh properties

# Check room availability
./skills/beds24/scripts/beds24-api.sh \
  "inventory/rooms/availability" \
  GET "propertyId=12345&from=2025-03-01&to=2025-03-05"
```

### Direct API Calls

```bash
# Get fresh access token
REFRESH_TOKEN="your_refresh_token"
ACCESS_TOKEN=$(curl -s -X 'GET' \
  'https://beds24.com/api/v2/authentication/token' \
  -H 'accept: application/json' \
  -H "refreshToken: $REFRESH_TOKEN" | \
  grep -o '"token":"[^"]*"' | sed 's/.*:"\([^"]*\)".*/\1/')

# Get bookings
curl -X 'GET' \
  'https://beds24.com/api/v2/bookings?limit=5' \
  -H 'accept: application/json' \
  -H "token: $ACCESS_TOKEN"
```

## API Endpoints

### Authentication
- `GET /authentication/setup` - Exchange invite code for tokens
- `GET /authentication/token` - Refresh access token

### Bookings
- `GET /bookings` - Get bookings with filters
- `POST /bookings` - Create/update bookings
- `DELETE /bookings` - Delete bookings
- `GET /bookings/messages` - Get booking messages
- `GET /bookings/invoices` - Get booking invoices

### Inventory
- `GET /inventory/rooms/availability` - Check room availability
- `GET /inventory/rooms/calendar` - Get per-day calendar values
- `GET /inventory/rooms/offers` - Get room offers for guests

### Properties
- `GET /properties` - Get all properties
- `POST /properties` - Create/update properties
- `DELETE /properties` - Delete properties

### Channels
- `GET /channels/settings` - Get channel settings
- `POST /channels/airbnb` - Sync with Airbnb
- `POST /channels/booking` - Sync with Booking.com
- `POST /channels/stripe` - Process Stripe payments

## Authentication Headers

| Endpoint | Header |
|----------|--------|
| `/authentication/setup` | `code: YOUR_INVITE_CODE` |
| `/authentication/token` | `refreshToken: YOUR_REFRESH_TOKEN` |
| All other APIs | `token: YOUR_ACCESS_TOKEN` |

## Examples

### Get Today's Arrivals
```bash
TODAY=$(date +%Y-%m-%d)
curl -X 'GET' \
  "https://beds24.com/api/v2/bookings?checkInFrom=$TODAY&checkInTo=$TODAY&status=confirmed" \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Check Room Availability
```bash
curl -X 'GET' \
  'https://beds24.com/api/v2/inventory/rooms/availability?propertyId=12345&from=2025-03-01&to=2025-03-05' \
  -H 'accept: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN'
```

### Sync with Airbnb
```bash
curl -X 'POST' \
  'https://beds24.com/api/v2/channels/airbnb' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'token: YOUR_ACCESS_TOKEN' \
  -d '[{
    "action": "sync",
    "propertyId": "12345",
    "syncCalendar": true,
    "syncPricing": true
  }]'
```

## Base URL

```
https://beds24.com/api/v2
```

## Token Lifespan

| Token Type | Duration | Usage |
|------------|----------|-------|
| Invite Code | One-time | Get initial tokens |
| Access Token | 24 hours | API calls |
| Refresh Token | 30 days | Get new access tokens |

## Documentation

- [Beds24 API V2 Docs](https://wiki.beds24.com/index.php/Category:API_V2)
- [OpenClaw Skills Guide](https://docs.openclaw.ai/tools/skills)

## License

MIT

## Contributing

Feel free to open issues or submit PRs for improvements.
