# Check dependencies
check_dependencies

print_info "Listing all tenant databases"
echo

db_user=$(whoami)

# Print header
printf "%-30s %-40s %-20s %-8s %-8s %-8s %-8s %s\n" \
    "TENANT" \
    "DATABASE" \
    "HOST" \
    "STATUS" \
    "DB" \
    "SCHEMAS" \
    "COLUMNS" \
    "CREATED"
echo "$(printf '%.s-' {1..120})"

# Get tenant records from auth database
tenants_query="SELECT name, database, host, is_active, created_at FROM tenants ORDER BY name;"

# Use temporary file to avoid pipe subshell issues
temp_file=$(mktemp)
if psql -U "$db_user" -d monk-api-auth -t -c "$tenants_query" 2>/dev/null > "$temp_file"; then
    while IFS='|' read -r name database host is_active created_at; do
        # Clean up the fields (remove leading/trailing spaces)
        name=$(echo "$name" | xargs)
        database=$(echo "$database" | xargs)
        host=$(echo "$host" | xargs) 
        is_active=$(echo "$is_active" | xargs)
        
        # Skip empty lines
        [ -z "$name" ] && continue
        
        # Get database stats if host is localhost
        schemas="?"
        columns="?"
        status="remote"
        
        if [ "$host" = "localhost" ]; then
            # Check if database exists locally
            if psql -U "$db_user" -lqt | cut -d'|' -f1 | grep -qw "$database" 2>/dev/null; then
                status="local"
                # Count tables in public schema
                schema_count=$(psql -U "$db_user" -d "$database" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")
                schemas=$(echo "$schema_count" | xargs)
                
                # Count columns across all tables in public schema
                column_count=$(psql -U "$db_user" -d "$database" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public';" 2>/dev/null || echo "0")
                columns=$(echo "$column_count" | xargs)
            else
                status="missing"
            fi
        fi
        
        # Format active status
        active_display="inactive"
        if [ "$is_active" = "t" ]; then
            active_display="active"
        fi
        
        # Format created date
        created_display=$(echo "$created_at" | cut -d'.' -f1)
        
        printf "%-30s %-40s %-20s %-8s %-8s %-8s %-8s %s\n" \
            "$name" \
            "$database" \
            "$host" \
            "$active_display" \
            "$status" \
            "$schemas" \
            "$columns" \
            "$created_display"
            
    done < "$temp_file"
    rm -f "$temp_file"
else
    rm -f "$temp_file"
    print_error "Failed to query tenants from auth database"
    exit 1
fi