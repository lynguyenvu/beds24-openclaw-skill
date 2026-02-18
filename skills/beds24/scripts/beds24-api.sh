#!/bin/bash
#
# Beds24 API Wrapper with Automatic Token Refresh
# Usage: ./beds24-api.sh <endpoint> [method] [data]
#
# Examples:
#   ./beds24-api.sh bookings
#   ./beds24-api.sh bookings GET "limit=10"
#   ./beds24-api.sh bookings POST '{"propertyId":"123"}'

set -e

# Configuration
CONFIG_FILE="${HOME}/.config/openclaw/config.json"
BASE_URL="https://beds24.com/api/v2"

# Get refresh token from config
get_refresh_token() {
    if command -v jq &> /dev/null; then
        jq -r '.skills.entries.beds24.env["beds24.apiToken"] // empty' "$CONFIG_FILE" 2>/dev/null
    else
        # Fallback without jq
        grep -o '"beds24.apiToken": "[^"]*"' "$CONFIG_FILE" 2>/dev/null | sed 's/.*: "\([^"]*\)".*/\1/'
    fi
}

# Refresh access token
refresh_access_token() {
    local refresh_token="$1"

    if [[ -z "$refresh_token" ]]; then
        echo "Error: No refresh token found in config" >&2
        echo "Please configure beds24.apiToken in ~/.config/openclaw/config.json" >&2
        exit 1
    fi

    local response
    response=$(curl -s -X 'GET' \
        "${BASE_URL}/authentication/token" \
        -H 'accept: application/json' \
        -H "refreshToken: ${refresh_token}")

    # Check for errors
    if echo "$response" | grep -q '"success":false'; then
        echo "Error refreshing token: $response" >&2
        exit 1
    fi

    # Extract new access token
    local new_token
    new_token=$(echo "$response" | grep -o '"token":"[^"]*"' | sed 's/.*:"\([^"]*\)".*/\1/')

    if [[ -z "$new_token" ]]; then
        echo "Error: Could not extract access token from response" >&2
        exit 1
    fi

    echo "$new_token"
}

# Make API call
api_call() {
    local endpoint="$1"
    local method="${2:-GET}"
    local data="${3:-}"

    # Get fresh access token
    local refresh_token
    refresh_token=$(get_refresh_token)

    local access_token
    access_token=$(refresh_access_token "$refresh_token")

    # Build curl command
    local curl_opts=(-s -X "$method")
    curl_opts+=(-H 'accept: application/json')
    curl_opts+=(-H "token: ${access_token}")

    # Add Content-Type for POST/PUT/PATCH
    if [[ "$method" =~ ^(POST|PUT|PATCH)$ ]]; then
        curl_opts+=(-H 'Content-Type: application/json')
    fi

    # Add data if provided
    if [[ -n "$data" ]]; then
        curl_opts+=(-d "$data")
    fi

    # Build URL
    local url="${BASE_URL}/${endpoint}"

    # Make the API call
    curl "${curl_opts[@]}" "$url"
}

# Main
main() {
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <endpoint> [method] [data]"
        echo ""
        echo "Examples:"
        echo "  $0 bookings                    # GET /bookings"
        echo "  $0 bookings GET 'limit=5'      # GET /bookings?limit=5"
        echo "  $0 bookings POST '{...}'       # POST /bookings"
        echo "  $0 properties                  # GET /properties"
        echo "  $0 inventory/rooms/availability GET 'propertyId=123&from=2025-01-01'"
        exit 1
    fi

    local endpoint="$1"
    local method="${2:-GET}"
    local data="${3:-}"

    # Build query string for GET requests with data
    if [[ "$method" == "GET" && -n "$data" ]]; then
        endpoint="${endpoint}?${data}"
        data=""
    fi

    api_call "$endpoint" "$method" "$data"
}

main "$@"
