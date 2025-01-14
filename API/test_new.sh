#!/bin/sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SERVER_ADDRESS="localhost:7777"
VALID_TOKEN=""
SECOND_TOKEN=""
INVALID_TOKEN="invalid.token.here"
TEST_GAME_UID=""
TEST_PVE_GAME_UID=""
TEST_PVP_GAME_UID=""

# Logging utilities
log_success() {
    printf "${GREEN}✓ %s${NC}\n" "$1"
}

log_error() {
    printf "${RED}✗ %s${NC}\n" "$1"
}

log_info() {
    printf "${YELLOW}ℹ %s${NC}\n" "$1"
}

# Test suite statistics
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0


run_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    printf "\nRunning test: %s\n" "$1"
    output=$(eval "$2")
    test_status=$?
    status=$(echo "$output" | cut -d';' -f1)
    
    if [ $test_status -eq 0 ]; then
        if [ "$1" = "Guest Token Generation" ]; then
            VALID_TOKEN=$(echo "$output" | cut -d';' -f2)
        elif [ "$1" = "Get Second Token" ]; then
            SECOND_TOKEN=$(echo "$output" | cut -d';' -f2)
        elif [ "$1" = "Create PVE Game" ]; then
            TEST_PVE_GAME_UID=$(echo "$output" | cut -d';' -f2)
        elif [ "$1" = "Create PVP Game" ]; then
            TEST_PVP_GAME_UID=$(echo "$output" | cut -d';' -f2)
        fi
        log_success "Test passed: $1 (Status: $status)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Test failed: $1 (Status: $status)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    return $test_status
}

# Authentication Tests
test_get_guest_token() {
    response=$(curl -k -s "https://${SERVER_ADDRESS}/auth/getguesttoken/")
    token=$(echo "$response" | jq -r '.access_token')
    if [ -n "$token" ] && [ "$token" != "null" ]; then
        VALID_TOKEN="$token"
        export VALID_TOKEN
        printf "200;%s" "$token"
        return 0
    fi
    return 1
}

test_get_second_guest_token() {
   response=$(curl -k -s "https://${SERVER_ADDRESS}/auth/getguesttoken/")
   token2=$(echo "$response" | jq -r '.access_token')
   if [ -n "$token2" ] && [ "$token2" != "null" ]; then
       SECOND_TOKEN="$token2"
       export SECOND_TOKEN
       printf "200;%s" "$token2"
       return 0
   fi
   return 1
}

test_invalid_token_request() {
    response=$(curl -k -s -o /dev/null -w "%{http_code}" -H "Authorization: $INVALID_TOKEN" \
        "https://${SERVER_ADDRESS}/game/create/?mode=PVE&option=1")
    if [ "$response" = "401" ] || [ "$response" = "403" ]; then
        printf "$response"
        return 0
    fi
    printf "$response"
    return 1
}

# Game Creation Tests
test_create_pve_game() {
    response=$(curl -k -s -H "Authorization: Bearer $VALID_TOKEN" \
        "https://${SERVER_ADDRESS}/game/create/?mode=PVE&option=1")
    uid=$(echo "$response" | jq -r '.uid')
    status=$(echo "$response" | jq -r '.status')
    printf "%s;%s" "${status:-200}" "$uid"
    return 0
}

test_create_pvp_game() {
    response=$(curl -k -s -H "Authorization: Bearer $VALID_TOKEN" \
        "https://${SERVER_ADDRESS}/game/create/?mode=PVP&option=1")
    uid=$(echo "$response" | jq -r '.uid')
    status=$(echo "$response" | jq -r '.status')
    printf "%s;%s" "${status:-200}" "$uid"
    return 0
}

test_invalid_game_mode() {
    status=$(curl -k -s -o /dev/null -w "%{http_code}" -H "Authorization: $VALID_TOKEN" \
        "https://${SERVER_ADDRESS}/game/create/?mode=INVALID&option=1")
    printf "$status"
    [ "$status" = "400" ]
}

# WebSocket Tests
test_websocket_connection() {
    token=${VALID_TOKEN#"Bearer "}
    (timeout 1 wscat -c "wss://${SERVER_ADDRESS}/ws/pong/${TEST_GAME_UID}/" \
        --no-check -s "token_${token}" -x '{"type":"greetings","sender":"cli"}' 2>/dev/null) &
    wscat_pid=$!
    sleep 1
    kill -9 $wscat_pid 2>/dev/null
    wait $wscat_pid 2>/dev/null
    printf "WebSocket connected successfully"
    return 0
}

test_websocket_invalid_token() {
    token="invalid_token"
    (timeout 1 wscat -c "wss://${SERVER_ADDRESS}/ws/pong/${TEST_GAME_UID}/" \
        --no-check -s "token_${token}" 2>&1) &
    wscat_pid=$!
    sleep 1
    kill -9 $wscat_pid 2>/dev/null
    wait $wscat_pid 2>/dev/null
    printf "WebSocket invalid token test completed"
    return 0
}

# Game Join Tests
test_join_nonexistent_game() {
    status=$(curl -k -s -o /dev/null -w "%{http_code}" -H "Authorization: $VALID_TOKEN" \
        "https://${SERVER_ADDRESS}/game/join/?mode=PVP&option=1")
    printf "$status"
    [ "$status" = "404" ]
}

test_join_existent_game_same_jwt() {
   response=$(curl -k -s -H "Authorization: Bearer $VALID_TOKEN" \
       "https://${SERVER_ADDRESS}/game/join/?mode=PVP&option=1")
       
   uid=$(echo "$response" | jq -r '.uid')
   if [ -n "$uid" ] && [ "$uid" != "null" ]; then
       printf "200;%s" "$uid"
       return 0
   fi
   status=$(echo "$response" | jq -r '.status')
   printf "%s;null" "${status:-404}"
   return 1
}

test_join_existent_game() {
   response=$(curl -k -s -H "Authorization: Bearer $SECOND_TOKEN" \
       "https://${SERVER_ADDRESS}/game/join/?mode=PVP&option=1")
       
   uid=$(echo "$response" | jq -r '.uid')
   if [ -n "$uid" ] && [ "$uid" != "null" ]; then
       printf "200;%s" "$uid"
       return 0
   fi
   status=$(echo "$response" | jq -r '.status')
   printf "%s;null" "${status:-404}"
   return 1
}

# Security Tests
test_ssl_certificate() {
    status=$(curl -k -s -o /dev/null -w "%{http_code}" \
        "https://${SERVER_ADDRESS}/auth/getguesttoken/")
    printf "$status"
    [ "$status" = "200" ]
}

test_missing_auth_header() {
    status=$(curl -k -s -o /dev/null -w "%{http_code}" \
        "https://${SERVER_ADDRESS}/game/create/?mode=PVE&option=1")
    printf "$status"
    [ "$status" = "401" ]
}

run_tests() {
    log_info "Starting Astropong API test suite..."
    
    run_test "Guest Token Generation" test_get_guest_token
    echo "VALID_TOKEN: $VALID_TOKEN"

    run_test "Invalid Token Request" test_invalid_token_request

    run_test "Create PVE Game" test_create_pve_game
    echo "PVE Game UID: $TEST_PVE_GAME_UID"

    run_test "Join Nonexistent Game" test_join_nonexistent_game

    run_test "Create PVP Game" test_create_pvp_game
    echo "PVP Game UID: $TEST_PVP_GAME_UID"
    sleep 1

    run_test "Get Second Token" test_get_second_guest_token
    echo "SECOND_TOKEN: $SECOND_TOKEN"

    run_test "Join existent Game same JWT" test_join_existent_game_same_jwt

    run_test "Join PVP Game" test_join_existent_game

    run_test "Invalid Game Mode" test_invalid_game_mode
    run_test "WebSocket Connection" test_websocket_connection
    run_test "WebSocket Invalid Token" test_websocket_invalid_token
    run_test "SSL Certificate Check" test_ssl_certificate
    run_test "Missing Auth Header" test_missing_auth_header
    
    printf "\n=== Test Summary ===\n"
    printf "Tests Run: %d\n" "$TESTS_RUN"
    printf "${GREEN}Tests Passed: %d${NC}\n" "$TESTS_PASSED"
    printf "${RED}Tests Failed: %d${NC}\n" "$TESTS_FAILED"
}

# Main execution
run_tests