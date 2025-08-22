# Check dependencies
check_dependencies

# Extract tenant and username from bashly args
tenant="${args[tenant]}"
username="${args[username]}"

if [ "$CLI_VERBOSE" = "true" ]; then
    print_info "Authenticating with tenant: $tenant, username: $username"
fi

# Prepare authentication request
auth_data="{\"tenant\": \"$tenant\", \"username\": \"$username\"}"
base_url=$(get_base_url)

if [ "$CLI_VERBOSE" = "true" ]; then
    print_info "Sending authentication request to: ${base_url}/auth/login"
fi

# Make authentication request
if response=$(make_request_json "POST" "/auth/login" "$auth_data"); then
    # Extract token from response
    token=""
    if [ "$JSON_PARSER" = "jq" ]; then
        token=$(echo "$response" | jq -r '.data.token' 2>/dev/null)
    elif [ "$JSON_PARSER" = "jshon" ]; then
        token=$(echo "$response" | jshon -e data -e token -u 2>/dev/null)
    else
        # Fallback: extract token manually
        token=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    fi
    
    if [ -n "$token" ] && [ "$token" != "null" ]; then
        # Store token
        store_token "$token"
        
        print_success "Authentication successful"
        
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_info "JWT token stored in: $JWT_TOKEN_FILE"
        fi
    else
        print_error "Failed to extract JWT token from response"
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_info "Response: $response"
        fi
        exit 1
    fi
else
    print_error "Authentication failed"
    exit 1
fi