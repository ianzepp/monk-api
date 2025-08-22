token=$(get_jwt_token)

if [ -n "$token" ]; then
    print_success "Authenticated"
    
    # Try to extract domain from token (basic decode)
    if [ "$JSON_PARSER" = "jq" ] || [ "$JSON_PARSER" = "jshon" ]; then
        # Decode JWT payload (basic base64 decode of middle part)
        payload=$(echo "$token" | cut -d'.' -f2)
        # Add padding if needed
        case $((${#payload} % 4)) in
            2) payload="${payload}==" ;;
            3) payload="${payload}=" ;;
        esac
        
        if command -v base64 &> /dev/null; then
            decoded=$(echo "$payload" | base64 -d 2>/dev/null || echo "")
            if [ -n "$decoded" ]; then
                if [ "$JSON_PARSER" = "jq" ]; then
                    tenant=$(echo "$decoded" | jq -r '.tenant' 2>/dev/null || echo "unknown")
                    database=$(echo "$decoded" | jq -r '.database' 2>/dev/null || echo "unknown")
                    exp=$(echo "$decoded" | jq -r '.exp' 2>/dev/null || echo "unknown")
                elif [ "$JSON_PARSER" = "jshon" ]; then
                    tenant=$(echo "$decoded" | jshon -e tenant -u 2>/dev/null || echo "unknown")
                    database=$(echo "$decoded" | jshon -e database -u 2>/dev/null || echo "unknown")
                    exp=$(echo "$decoded" | jshon -e exp -u 2>/dev/null || echo "unknown")
                fi
                
                echo "Tenant: $tenant"
                echo "Database: $database"
                if [ "$exp" != "unknown" ] && [ "$exp" != "null" ]; then
                    if command -v date &> /dev/null; then
                        exp_date=$(date -r "$exp" 2>/dev/null || echo "unknown")
                        echo "Expires: $exp_date"
                    fi
                fi
            fi
        fi
    fi
    
    echo "Token file: $JWT_TOKEN_FILE"
else
    print_info "Not authenticated"
    echo "Use 'monk auth login TENANT USERNAME' to authenticate"
fi