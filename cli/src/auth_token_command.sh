token=$(get_jwt_token)

if [ -n "$token" ]; then
    echo "$token"
else
    print_error "No token found. Use 'monk auth login TENANT USERNAME' first"
    exit 1
fi