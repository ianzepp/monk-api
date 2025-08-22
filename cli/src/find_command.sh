# Check dependencies
check_dependencies

# Get arguments and flags from bashly
schema="${args[schema]}"
field_flag="${args[--field]}"
count_flag="${args[--count]}"
exit_code_flag="${args[--exit-code]}"
verbose_flag="${args[--verbose]}"
head_flag="${args[--head]}"
tail_flag="${args[--tail]}"

# Set environment variables based on flags
if [ "$field_flag" ]; then
    export CLI_EXTRACT_FIELD="$field_flag"
fi

if [ "$count_flag" = "1" ]; then
    export CLI_COUNT_MODE=true
fi

if [ "$exit_code_flag" = "1" ]; then
    export CLI_EXIT_CODE_ONLY=true
fi

if [ "$verbose_flag" = "1" ]; then
    export CLI_VERBOSE=true
fi

if [ "$head_flag" = "1" ]; then
    export CLI_HEAD_MODE=true
fi

if [ "$tail_flag" = "1" ]; then
    export CLI_TAIL_MODE=true
fi

# Check if we have input data
if [ -t 0 ]; then
    echo '{"error":"find expects JSON search criteria via STDIN","success":false}' >&2
    exit 1
fi

# Read JSON data from STDIN
input_data=$(cat)

# Validate JSON format (basic check)
if [ "$JSON_PARSER" = "jq" ]; then
    if ! echo "$input_data" | jq . >/dev/null 2>&1; then
        echo '{"error":"Invalid JSON format in search criteria","success":false}' >&2
        exit 1
    fi
elif command -v jshon >/dev/null 2>&1; then
    if ! echo "$input_data" | jshon >/dev/null 2>&1; then
        echo '{"error":"Invalid JSON format in search criteria","success":false}' >&2
        exit 1
    fi
fi

# Make the find request
response=$(make_request_json "POST" "/api/find/$schema" "$input_data")

# Process response with head/tail support
if [ "$CLI_HEAD_MODE" = "true" ]; then
    # Extract first record from array
    if [ "$JSON_PARSER" = "jq" ]; then
        if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
            first_record=$(echo "$response" | jq '.data[0] // null')
            echo "$response" | jq --argjson first "$first_record" '{"success": .success, "data": $first}'
        else
            echo "$response"
        fi
    else
        # Fallback for jshon or no parser
        if echo "$response" | grep -q '"success":true'; then
            first_record=$(echo "$response" | jshon -e data -e 0 2>/dev/null || echo "null")
            if [ "$first_record" != "null" ]; then
                echo "{\"success\":true,\"data\":$first_record}"
            else
                echo '{"success":true,"data":null}'
            fi
        else
            echo "$response"
        fi
    fi
elif [ "$CLI_TAIL_MODE" = "true" ]; then
    # Extract last record from array
    if [ "$JSON_PARSER" = "jq" ]; then
        if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
            last_record=$(echo "$response" | jq '.data[-1] // null')
            echo "$response" | jq --argjson last "$last_record" '{"success": .success, "data": $last}'
        else
            echo "$response"
        fi
    else
        # Fallback for jshon or no parser
        if echo "$response" | grep -q '"success":true'; then
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
    fi
else
    # Use standard response handler
    handle_response_json "$response" "find"
fi