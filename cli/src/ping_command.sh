# Check dependencies
check_dependencies

# Get flags from bashly args
verbose_flag="${args[--verbose]}"
jwt_token_arg="${args[--jwt-token]}"

# Set CLI_VERBOSE if flag is present  
if [ "$verbose_flag" = "1" ] || [ "$verbose_flag" = "true" ]; then
    CLI_VERBOSE=true
fi

# Make ping request
base_url=$(get_base_url)

if [ "$CLI_VERBOSE" = "true" ]; then
    print_info "Pinging server at: $base_url"
fi

# Prepare curl arguments
curl_args=(-s -X GET -H "Content-Type: application/json")

# Add JWT token (provided via -j flag or stored token)
token_to_use="$jwt_token_arg"
if [ -z "$token_to_use" ]; then
    token_to_use=$(get_jwt_token)
fi

if [ -n "$token_to_use" ]; then
    curl_args+=(-H "Authorization: Bearer $token_to_use")
    if [ "$CLI_VERBOSE" = "true" ]; then
        if [ -n "$jwt_token_arg" ]; then
            print_info "Using provided JWT token"
        else
            print_info "Using stored JWT token"
        fi
    fi
fi

# Make request
full_url="${base_url}/ping"
response=$(curl "${curl_args[@]}" -w "\n%{http_code}" "$full_url")
http_code=$(echo "$response" | tail -n1)
response=$(echo "$response" | sed '$d')

# Handle response
case "$http_code" in
    200)
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_success "Server is reachable (HTTP $http_code)"
            echo "Response: $response"
        else
            # Parse response for clean output
            if [ "$JSON_PARSER" = "jq" ]; then
                pong=$(echo "$response" | jq -r '.pong' 2>/dev/null || echo "unknown")
                domain=$(echo "$response" | jq -r '.domain' 2>/dev/null || echo "null")
                database=$(echo "$response" | jq -r '.database' 2>/dev/null || echo "null")
                
                echo "pong: $pong"
                if [ "$domain" != "null" ] && [ "$domain" != "" ]; then
                    echo "domain: $domain"
                fi
                if [ "$database" != "null" ] && [ "$database" != "" ]; then
                    if [ "$database" = "ok" ]; then
                        echo "database: $database"
                    else
                        echo "database: ERROR - $database"
                    fi
                fi
            elif [ "$JSON_PARSER" = "jshon" ]; then
                pong=$(echo "$response" | jshon -e pong -u 2>/dev/null || echo "unknown")
                domain=$(echo "$response" | jshon -e domain -u 2>/dev/null || echo "null")
                database=$(echo "$response" | jshon -e database -u 2>/dev/null || echo "null")
                
                echo "pong: $pong"
                if [ "$domain" != "null" ]; then
                    echo "domain: $domain"
                fi
                if [ "$database" != "null" ]; then
                    if [ "$database" = "ok" ]; then
                        echo "database: $database"
                    else
                        echo "database: ERROR - $database"
                    fi
                fi
            else
                echo "$response"
            fi
        fi
        ;;
    *)
        print_error "Server unreachable (HTTP $http_code)"
        if [ "$CLI_VERBOSE" = "true" ]; then
            echo "Response: $response" >&2
        fi
        exit 1
        ;;
esac