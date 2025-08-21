#!/bin/bash
set -e

# Find CLI Module - Advanced search with filter DSL
# Reads search criteria from STDIN and sends to /api/find/:schema endpoint
# Usage: echo '{"where":{"status":"active"}}' | monk find account

# Import common functions
source "$(dirname "$0")/common.sh"

# Parse flags manually to support long options
SCHEMA=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -f)
            export CLI_EXTRACT_FIELD="$2"
            shift 2
            ;;
        -c)
            export CLI_COUNT_MODE=true
            shift
            ;;
        -x)
            export CLI_EXIT_CODE_ONLY=true
            shift
            ;;
        -v)
            export CLI_VERBOSE=true
            shift
            ;;
        --head)
            export CLI_HEAD_MODE=true
            shift
            ;;
        --tail)
            export CLI_TAIL_MODE=true
            shift
            ;;
        -H)
            export CLI_HEAD_MODE=true
            shift
            ;;
        -T)
            export CLI_TAIL_MODE=true
            shift
            ;;
        -*)
            echo "Unknown flag: $1" >&2
            exit 1
            ;;
        *)
            # First non-flag argument is schema name
            if [[ -z "$SCHEMA" ]]; then
                SCHEMA="$1"
            fi
            shift
            ;;
    esac
done

if [[ -z "$SCHEMA" ]]; then
    echo '{"error":"Schema name required for find operation","success":false}' >&2
    exit 1
fi

# Check if we have input data
if [ -t 0 ]; then
    echo '{"error":"find expects JSON search criteria via STDIN","success":false}' >&2
    exit 1
fi

# Read JSON data from STDIN
INPUT_DATA=$(cat)

# Validate JSON format
if ! echo "$INPUT_DATA" | jshon >/dev/null 2>&1; then
    echo '{"error":"Invalid JSON format in search criteria","success":false}' >&2
    exit 1
fi

# Build the API endpoint URL
URL="${CLI_BASE_URL}/api/find/${SCHEMA}"

# Make HTTP request with JSON data
response=$(curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -d "$INPUT_DATA")

# Process response with head/tail support
if [ "$CLI_HEAD_MODE" = "true" ]; then
    # Extract first record from array
    if echo "$response" | jshon -e success -u | grep -q "true"; then
        first_record=$(echo "$response" | jshon -e data -e 0 2>/dev/null || echo "null")
        if [ "$first_record" != "null" ]; then
            echo "{\"success\":true,\"data\":$first_record}"
        else
            echo '{"success":true,"data":null}'
        fi
    else
        echo "$response"
    fi
elif [ "$CLI_TAIL_MODE" = "true" ]; then
    # Extract last record from array
    if echo "$response" | jshon -e success -u | grep -q "true"; then
        array_length=$(echo "$response" | jshon -e data -l 2>/dev/null || echo "0")
        if [ "$array_length" -gt 0 ]; then
            last_index=$((array_length - 1))
            last_record=$(echo "$response" | jshon -e data -e "$last_index" 2>/dev/null || echo "null")
            echo "{\"success\":true,\"data\":$last_record}"
        else
            echo '{"success":true,"data":null}'
        fi
    else
        echo "$response"
    fi
else
    # Use standard response handler
    handle_response "$response" "find"
fi