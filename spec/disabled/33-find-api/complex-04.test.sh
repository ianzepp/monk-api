#!/usr/bin/env bash
set -e

# Find API Complex Query Test 04
# Tests advanced pattern matching with regex, LIKE, and search operators combined
# Focuses on: Text processing, pattern validation, advanced search scenarios

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API advanced pattern matching scenarios"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "complex-04"
setup_full_auth

# Test 1: Email validation with regex and domain filtering
print_step "Testing email validation with pattern matching"

# Business scenario: Email validation and domain filtering for marketing
# Query: Find accounts with valid email patterns from business domains
email_validation_query='{
    "select": ["name", "email", "account_type"],
    "where": {
        "$and": [
            {"email": {"$regex": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"}},
            {"account_type": {"$ne": "suspended"}}
        ]
    },
    "order": ["email asc"]
}'

response=$(auth_post "api/find/account" "$email_validation_query")
data=$(extract_and_validate_data "$response" "Email validation results")

record_count=$(echo "$data" | jq 'length')
print_success "Email validation found $record_count accounts with business emails"

# Validate email patterns and domain exclusions
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    email=$(echo "$record" | jq -r '.email')
    account_type=$(echo "$record" | jq -r '.account_type')

    # Basic email regex validation
    if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        test_fail "Record $i email '$email' doesn't match valid email pattern"
    fi

    # Account type exclusion
    if [[ "$account_type" == "suspended" ]]; then
        test_fail "Record $i account_type '$account_type' should be excluded"
    fi

    # Account type exclusion
    if [[ "$account_type" == "suspended" ]]; then
        test_fail "Record $i is suspended account (should be excluded)"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All emails meet validation and domain criteria"
fi

# Test 2: Name standardization with regex patterns
print_step "Testing name standardization with regex"

# Business scenario: Find accounts needing name standardization
# Query: Names that don't follow "First Last" pattern
name_standardization_query='{
    "where": {
        "$and": [
            {"name": {"$regex": "^[A-Z][a-z]+ [A-Z][a-z]+$"}},
            {"name": {"$nlike": "%Jr.%"}},
            {"name": {"$nlike": "%Sr.%"}},
            {"name": {"$nlike": "%III%"}}
        ]
    }
}'

response=$(auth_post "api/find/account" "$name_standardization_query")
data=$(extract_and_validate_data "$response" "Name standardization results")

record_count=$(echo "$data" | jq 'length')
print_success "Name standardization found $record_count accounts with standard names"

# Validate name patterns
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    name=$(echo "$record" | jq -r '.name')

    # Standard "First Last" pattern
    if [[ ! "$name" =~ ^[A-Z][a-z]+\ [A-Z][a-z]+$ ]]; then
        test_fail "Record $i name '$name' doesn't follow First Last pattern"
    fi

    # Exclusions for suffixes
    if [[ "$name" =~ Jr\.|Sr\.|III ]]; then
        test_fail "Record $i name '$name' contains excluded suffix"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All names follow standardization criteria"
fi

# Test 3: Username and email correlation analysis
print_step "Testing username/email correlation with text search"

# Business scenario: Find accounts where username correlates with email prefix
# Query: Username patterns that match email patterns
correlation_query='{
    "where": {
        "$and": [
            {"username": {"$regex": "^[a-z]+$"}},
            {"email": {"$find": "smith"}},
            {"username": {"$like": "%smith%"}}
        ]
    }
}'

response=$(auth_post "api/find/account" "$correlation_query")
data=$(extract_and_validate_data "$response" "Correlation analysis results")

record_count=$(echo "$data" | jq 'length')
print_success "Username/email correlation found $record_count matching accounts"

# Validate correlation patterns
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    username=$(echo "$record" | jq -r '.username')
    email=$(echo "$record" | jq -r '.email')

    # Username pattern validation
    if [[ ! "$username" =~ ^[a-z]+$ ]]; then
        test_fail "Record $i username '$username' not lowercase letters only"
    fi

    # Email contains smith
    if [[ ! "${email,,}" =~ smith ]]; then
        test_fail "Record $i email '$email' doesn't contain 'smith'"
    fi

    # Username contains smith
    if [[ ! "$username" =~ smith ]]; then
        test_fail "Record $i username '$username' doesn't contain 'smith'"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All accounts show username/email correlation"
fi

# Test 4: Advanced search with multiple text operations
print_step "Testing advanced search with multiple text operations"

# Business scenario: Content search across multiple fields
# Query: Search for specific patterns across name, email, and metadata
advanced_search_query='{
    "select": ["name", "email", "username"],
    "where": {
        "$and": [
            {"name": {"$text": "John"}},
            {"email": {"$regex": "\\.[a-z]{3,}@"}},
            {"username": {"$like": "%j%"}}
        ]
    },
    "limit": 5
}'

response=$(auth_post "api/find/account" "$advanced_search_query")
data=$(extract_and_validate_data "$response" "Advanced search results")

record_count=$(echo "$data" | jq 'length')
print_success "Advanced search returned $record_count matching accounts"

# Validate advanced search criteria
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    name=$(echo "$record" | jq -r '.name')
    email=$(echo "$record" | jq -r '.email')
    username=$(echo "$record" | jq -r '.username')

    # Text search validation
    if [[ ! "${name,,}" =~ john ]]; then
        test_fail "Record $i name '$name' doesn't contain 'john'"
    fi

    # Email regex validation (domain before @)
    if [[ ! "$email" =~ \.[a-z]{3,}@ ]]; then
        test_fail "Record $i email '$email' doesn't match domain pattern"
    fi

    # Username contains 'j'
    if [[ ! "$username" =~ j ]]; then
        test_fail "Record $i username '$username' doesn't contain 'j'"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All results meet advanced search criteria"

    # Display search results
    print_step "Advanced search results"
    echo "$data" | jq -r '.[] | "\(.name) - \(.username) - \(.email)"'
fi

# Test 5: Data quality analysis query
print_step "Testing data quality analysis"

# Business scenario: Data quality assessment
# Query: Find accounts with complete vs incomplete data profiles
data_quality_query='{
    "select": ["name", "email", "phone", "last_login", "preferences"],
    "where": {
        "$and": [
            {"email": {"$exists": true}},
            {"name": {"$exists": true}},
            {"phone": {"$null": true}},
            {"last_login": {"$null": true}}
        ]
    }
}'

response=$(auth_post "api/find/account" "$data_quality_query")
data=$(extract_and_validate_data "$response" "Data quality results")

record_count=$(echo "$data" | jq 'length')
print_success "Data quality analysis found $record_count accounts needing profile completion"

# Validate data quality criteria
complete_profiles=0
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    email=$(echo "$record" | jq -r '.email')
    name=$(echo "$record" | jq -r '.name')
    phone=$(echo "$record" | jq -r '.phone')
    last_login=$(echo "$record" | jq -r '.last_login')

    # Required fields validation
    if [[ "$email" == "null" || "$name" == "null" ]]; then
        test_fail "Record $i missing required fields (email/name)"
    fi

    # Incomplete profile indicators
    if [[ "$phone" == "null" && "$last_login" == "null" ]]; then
        complete_profiles=$((complete_profiles + 1))
    fi
done

if [[ "$complete_profiles" -eq "$record_count" ]]; then
    print_success "Data quality query correctly identified $complete_profiles incomplete profiles"
fi

print_success "Find API complex query 03 (real-world search scenarios) completed successfully"
