if [ -f "$JWT_TOKEN_FILE" ]; then
    remove_stored_token
    print_success "Logged out successfully"
else
    print_info "Already logged out"
fi