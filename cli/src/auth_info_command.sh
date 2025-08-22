token=$(get_jwt_token)

if [ -z "$token" ]; then
    print_error "No authentication token found"
    print_info "Use 'monk auth login TENANT USERNAME' to authenticate"
    exit 1
fi

# Extract payload (second part) from JWT
payload=$(echo "$token" | cut -d'.' -f2)

# Add padding if needed for base64 decoding
padding=$((4 - ${#payload} % 4))
if [ $padding -ne 4 ]; then
    payload="${payload}$(printf '%*s' $padding '' | tr ' ' '=')"
fi

# Decode base64 payload
if command -v base64 >/dev/null 2>&1; then
    decoded=$(echo "$payload" | base64 -d 2>/dev/null || echo "")
else
    print_error "base64 command not found"
    exit 1
fi

if [ -n "$decoded" ]; then
    print_success "JWT Token Information:"
    echo
    
    # Pretty print JSON if jq is available
    if command -v jq >/dev/null 2>&1; then
        echo "$decoded" | jq .
    else
        echo "$decoded"
    fi
    
    echo
    if command -v jq >/dev/null 2>&1; then
        exp_timestamp=$(echo "$decoded" | jq -r '.exp' 2>/dev/null)
        if [ "$exp_timestamp" != "null" ] && [ -n "$exp_timestamp" ]; then
            exp_date=$(date -r "$exp_timestamp" 2>/dev/null || echo 'unknown')
            print_info "Token expires: $exp_date"
        fi
    fi
else
    print_error "Failed to decode JWT token"
    exit 1
fi