token=$(get_jwt_token)

if [ -n "$token" ]; then
    echo "$token"
else
    print_error "No token found. Use 'monk auth login --domain DOMAIN' first"
    exit 1
fi