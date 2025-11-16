#!/usr/bin/env bash
set -e

# Data API Performance Benchmark
# Measures baseline performance for CRUD operations on existing schemas

source "$(dirname "$0")/../test-helper.sh"

print_step "Data API Performance Benchmark"

# Setup
setup_test_with_template "benchmark-data" "testing"
setup_full_auth

# Warmup (establish connection pool, JIT, etc.)
print_step "Warming up (5 requests)..."
for i in {1..5}; do
    auth_post "api/data/account" "[{\"name\":\"Warmup $i\",\"email\":\"warmup$i@test.com\"}]" > /dev/null 2>&1
done
print_success "Warmup complete"

# ===========================
# Benchmark 1: Single Record Creation
# ===========================
print_step "Benchmark 1: Single record creation (50 iterations)"

start_sec=$(date +%s)
start_ns=$(date +%N)
for i in {1..50}; do
    auth_post "api/data/account" "[{\"name\":\"User $i\",\"email\":\"user$i@test.com\",\"username\":\"user$i\"}]" > /dev/null 2>&1
done
end_sec=$(date +%s)
end_ns=$(date +%N)

elapsed_ms=$(( (end_sec - start_sec) * 1000 + (end_ns - start_ns) / 1000000 ))
avg_ms=$(( elapsed_ms / 50 ))
throughput=$(( elapsed_ms > 0 ? 50000 / elapsed_ms : 0 ))

echo "  Total:      ${elapsed_ms}ms"
echo "  Average:    ${avg_ms}ms per request"
echo "  Throughput: ${throughput} req/sec"

# ===========================
# Benchmark 2: Bulk Record Creation
# ===========================
print_step "Benchmark 2: Bulk record creation (10 batches of 10 records)"

start_sec=$(date +%s)
start_ns=$(date +%N)
for i in {1..10}; do
    batch_data='['
    for j in {1..10}; do
        n=$((i*10 + j))
        batch_data+="{\"name\":\"Bulk User $n\",\"email\":\"bulk$n@test.com\",\"username\":\"bulk$n\"}"
        [[ $j -lt 10 ]] && batch_data+=","
    done
    batch_data+=']'
    auth_post "api/data/account" "$batch_data" > /dev/null 2>&1
done
end_sec=$(date +%s)
end_ns=$(date +%N)

elapsed_ms=$(( (end_sec - start_sec) * 1000 + (end_ns - start_ns) / 1000000 ))
avg_ms=$(( elapsed_ms / 10 ))
records_per_sec=$(( elapsed_ms > 0 ? 100000 / elapsed_ms : 0 ))

echo "  Total:         ${elapsed_ms}ms (100 records)"
echo "  Average:       ${avg_ms}ms per batch (10 records)"
echo "  Record rate:   ${records_per_sec} records/sec"

# ===========================
# Benchmark 3: Record Retrieval
# ===========================
print_step "Benchmark 3: Record retrieval (50 iterations)"

start_sec=$(date +%s)
start_ns=$(date +%N)
for i in {1..50}; do
    auth_get "api/data/account" > /dev/null 2>&1
done
end_sec=$(date +%s)
end_ns=$(date +%N)

elapsed_ms=$(( (end_sec - start_sec) * 1000 + (end_ns - start_ns) / 1000000 ))
avg_ms=$(( elapsed_ms / 50 ))
throughput=$(( elapsed_ms > 0 ? 50000 / elapsed_ms : 0 ))

echo "  Total:      ${elapsed_ms}ms"
echo "  Average:    ${avg_ms}ms per request"
echo "  Throughput: ${throughput} req/sec"

# ===========================
# Benchmark 4: Record Update
# ===========================
print_step "Benchmark 4: Record update (20 iterations)"

# Get a record ID first
response=$(auth_get "api/data/account")
record_id=$(echo "$response" | jq -r '.data[0].id')

start_sec=$(date +%s)
start_ns=$(date +%N)
for i in {1..20}; do
    auth_put "api/data/account/$record_id" "{\"name\":\"Updated User $i\"}" > /dev/null 2>&1
done
end_sec=$(date +%s)
end_ns=$(date +%N)

elapsed_ms=$(( (end_sec - start_sec) * 1000 + (end_ns - start_ns) / 1000000 ))
avg_ms=$(( elapsed_ms / 20 ))
throughput=$(( elapsed_ms > 0 ? 20000 / elapsed_ms : 0 ))

echo "  Total:      ${elapsed_ms}ms"
echo "  Average:    ${avg_ms}ms per request"
echo "  Throughput: ${throughput} req/sec"

# ===========================
# Summary
# ===========================
print_success "Data API benchmark complete"
echo ""
echo "Summary:"
echo "  - Single creates: ~${avg_ms}ms avg (typical CRUD operation)"
echo "  - Bulk creates:   Amortizes observer overhead across records"
echo "  - Reads:          Minimal overhead (no observer pipeline)"
echo "  - Updates:        Similar to creates"
