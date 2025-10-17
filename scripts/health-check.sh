#!/bin/bash

# Claude-to-Azure Proxy Health Check Script
# Comprehensive health monitoring for Responses API integration

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULT_URL="http://localhost:8080"
TIMEOUT=30
VERBOSE=false
JSON_OUTPUT=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Health check results
HEALTH_RESULTS=()
OVERALL_STATUS="healthy"
EXIT_CODE=0

# Logging functions
log_info() {
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        echo -e "${GREEN}[SUCCESS]${NC} $1"
    fi
}

log_warning() {
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        echo -e "${YELLOW}[WARNING]${NC} $1"
    fi
}

log_error() {
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        echo -e "${RED}[ERROR]${NC} $1"
    fi
}

# Add health check result
add_result() {
    local check_name="$1"
    local status="$2"
    local message="$3"
    local response_time="${4:-0}"
    local details="${5:-{}}"
    
    local result=$(cat <<EOF
{
  "check": "$check_name",
  "status": "$status",
  "message": "$message",
  "response_time_ms": $response_time,
  "details": $details,
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
)
    
    HEALTH_RESULTS+=("$result")
    
    if [[ "$status" != "healthy" ]]; then
        OVERALL_STATUS="unhealthy"
        EXIT_CODE=1
    fi
}

# Basic connectivity check
check_connectivity() {
    local url="$1"
    local start_time=$(date +%s%3N)
    
    log_info "Checking basic connectivity to $url..."
    
    if curl -sf --max-time "$TIMEOUT" "$url/health" > /dev/null 2>&1; then
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        
        log_success "Connectivity check passed"
        add_result "connectivity" "healthy" "Service is reachable" "$response_time"
    else
        log_error "Connectivity check failed"
        add_result "connectivity" "unhealthy" "Service is not reachable" "0"
    fi
}

# Health endpoint check
check_health_endpoint() {
    local url="$1"
    local start_time=$(date +%s%3N)
    
    log_info "Checking health endpoint..."
    
    local response
    local http_code
    
    response=$(curl -s --max-time "$TIMEOUT" -w "HTTPSTATUS:%{http_code}" "$url/health" 2>/dev/null || echo "HTTPSTATUS:000")
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    if [[ "$http_code" == "200" ]]; then
        local health_status
        health_status=$(echo "$body" | jq -r '.status' 2>/dev/null || echo "unknown")
        
        if [[ "$health_status" == "healthy" ]]; then
            log_success "Health endpoint check passed"
            add_result "health_endpoint" "healthy" "Health endpoint reports healthy" "$response_time" "$body"
        else
            log_warning "Health endpoint reports unhealthy status: $health_status"
            add_result "health_endpoint" "degraded" "Health endpoint reports: $health_status" "$response_time" "$body"
        fi
    else
        log_error "Health endpoint check failed (HTTP $http_code)"
        add_result "health_endpoint" "unhealthy" "Health endpoint returned HTTP $http_code" "$response_time"
    fi
}

# Authentication check
check_authentication() {
    local url="$1"
    local start_time=$(date +%s%3N)
    
    log_info "Checking authentication..."
    
    if [[ -z "${PROXY_API_KEY:-}" ]]; then
        log_warning "PROXY_API_KEY not set, skipping authentication check"
        add_result "authentication" "skipped" "PROXY_API_KEY not available" "0"
        return
    fi
    
    local response
    local http_code
    
    # Test with valid API key
    response=$(curl -s --max-time "$TIMEOUT" -w "HTTPSTATUS:%{http_code}" \
        -H "Authorization: Bearer $PROXY_API_KEY" \
        "$url/v1/models" 2>/dev/null || echo "HTTPSTATUS:000")
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    if [[ "$http_code" == "200" ]]; then
        log_success "Authentication check passed"
        add_result "authentication" "healthy" "Authentication working correctly" "$response_time"
    else
        log_error "Authentication check failed (HTTP $http_code)"
        add_result "authentication" "unhealthy" "Authentication failed with HTTP $http_code" "$response_time"
    fi
    
    # Test with invalid API key
    local invalid_response
    invalid_response=$(curl -s --max-time "$TIMEOUT" -w "HTTPSTATUS:%{http_code}" \
        -H "Authorization: Bearer invalid-key" \
        "$url/v1/models" 2>/dev/null || echo "HTTPSTATUS:000")
    local invalid_http_code
    invalid_http_code=$(echo "$invalid_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    if [[ "$invalid_http_code" == "401" ]]; then
        log_success "Authentication rejection working correctly"
    else
        log_warning "Authentication rejection not working properly (expected 401, got $invalid_http_code)"
        add_result "authentication_security" "degraded" "Authentication rejection returned HTTP $invalid_http_code instead of 401" "0"
    fi
}

# Azure OpenAI connectivity check
check_azure_openai() {
    local start_time=$(date +%s%3N)
    
    log_info "Checking Azure OpenAI connectivity..."
    
    if [[ -z "${AZURE_OPENAI_ENDPOINT:-}" ]] || [[ -z "${AZURE_OPENAI_API_KEY:-}" ]]; then
        log_warning "Azure OpenAI credentials not set, skipping connectivity check"
        add_result "azure_openai" "skipped" "Azure OpenAI credentials not available" "0"
        return
    fi
    
    # Test Azure OpenAI v1 endpoint
    local azure_url="${AZURE_OPENAI_ENDPOINT%/}/openai/v1/models"
    local response
    local http_code
    
    response=$(curl -s --max-time "$TIMEOUT" -w "HTTPSTATUS:%{http_code}" \
        -H "Authorization: Bearer $AZURE_OPENAI_API_KEY" \
        "$azure_url" 2>/dev/null || echo "HTTPSTATUS:000")
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    if [[ "$http_code" == "200" ]]; then
        log_success "Azure OpenAI connectivity check passed"
        add_result "azure_openai" "healthy" "Azure OpenAI v1 API is accessible" "$response_time"
    else
        log_error "Azure OpenAI connectivity check failed (HTTP $http_code)"
        add_result "azure_openai" "unhealthy" "Azure OpenAI v1 API returned HTTP $http_code" "$response_time"
    fi
}

# Format detection check
check_format_detection() {
    local url="$1"
    local start_time=$(date +%s%3N)
    
    log_info "Checking format detection..."
    
    if [[ -z "${PROXY_API_KEY:-}" ]]; then
        log_warning "PROXY_API_KEY not set, skipping format detection check"
        add_result "format_detection" "skipped" "PROXY_API_KEY not available" "0"
        return
    fi
    
    # Test Claude format detection
    local claude_response
    local claude_http_code
    
    claude_response=$(curl -s --max-time "$TIMEOUT" -w "HTTPSTATUS:%{http_code}" \
        -H "Authorization: Bearer $PROXY_API_KEY" \
        -H "Content-Type: application/json" \
        -X POST "$url/v1/messages" \
        -d '{
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 10,
            "messages": [{"role": "user", "content": "Hello"}]
        }' 2>/dev/null || echo "HTTPSTATUS:000")
    claude_http_code=$(echo "$claude_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    # Test OpenAI format detection
    local openai_response
    local openai_http_code
    
    openai_response=$(curl -s --max-time "$TIMEOUT" -w "HTTPSTATUS:%{http_code}" \
        -H "Authorization: Bearer $PROXY_API_KEY" \
        -H "Content-Type: application/json" \
        -X POST "$url/v1/chat/completions" \
        -d '{
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "Hello"}]
        }' 2>/dev/null || echo "HTTPSTATUS:000")
    openai_http_code=$(echo "$openai_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    local claude_success=false
    local openai_success=false
    
    if [[ "$claude_http_code" == "200" ]] || [[ "$claude_http_code" == "400" ]]; then
        claude_success=true
    fi
    
    if [[ "$openai_http_code" == "200" ]] || [[ "$openai_http_code" == "400" ]]; then
        openai_success=true
    fi
    
    if [[ "$claude_success" == "true" ]] && [[ "$openai_success" == "true" ]]; then
        log_success "Format detection check passed"
        add_result "format_detection" "healthy" "Both Claude and OpenAI formats are supported" "$response_time"
    else
        log_error "Format detection check failed"
        add_result "format_detection" "unhealthy" "Format detection not working properly" "$response_time"
    fi
}

# Memory usage check
check_memory_usage() {
    local url="$1"
    local start_time=$(date +%s%3N)
    
    log_info "Checking memory usage..."
    
    local response
    local http_code
    
    response=$(curl -s --max-time "$TIMEOUT" -w "HTTPSTATUS:%{http_code}" "$url/health" 2>/dev/null || echo "HTTPSTATUS:000")
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    if [[ "$http_code" == "200" ]]; then
        local memory_status
        memory_status=$(echo "$body" | jq -r '.checks.memory.status' 2>/dev/null || echo "unknown")
        local memory_message
        memory_message=$(echo "$body" | jq -r '.checks.memory.message' 2>/dev/null || echo "No memory info")
        
        if [[ "$memory_status" == "healthy" ]]; then
            log_success "Memory usage check passed: $memory_message"
            add_result "memory_usage" "healthy" "$memory_message" "$response_time"
        else
            log_warning "Memory usage check warning: $memory_message"
            add_result "memory_usage" "degraded" "$memory_message" "$response_time"
        fi
    else
        log_error "Memory usage check failed"
        add_result "memory_usage" "unhealthy" "Could not retrieve memory information" "$response_time"
    fi
}

# Reasoning configuration check
check_reasoning_config() {
    local url="$1"
    local start_time=$(date +%s%3N)
    
    log_info "Checking reasoning configuration..."
    
    # Check if reasoning effort configuration is working
    local default_effort="${DEFAULT_REASONING_EFFORT:-medium}"
    local timeout_setting="${AZURE_OPENAI_TIMEOUT:-120000}"
    
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    local config_details=$(cat <<EOF
{
  "default_reasoning_effort": "$default_effort",
  "azure_timeout": $timeout_setting,
  "azure_max_retries": ${AZURE_OPENAI_MAX_RETRIES:-3}
}
EOF
)
    
    if [[ "$default_effort" =~ ^(minimal|low|medium|high)$ ]]; then
        log_success "Reasoning configuration is valid"
        add_result "reasoning_config" "healthy" "Reasoning configuration is properly set" "$response_time" "$config_details"
    else
        log_error "Invalid reasoning configuration"
        add_result "reasoning_config" "unhealthy" "Invalid DEFAULT_REASONING_EFFORT: $default_effort" "$response_time" "$config_details"
    fi
}

# Performance check
check_performance() {
    local url="$1"
    local start_time=$(date +%s%3N)
    
    log_info "Checking performance..."
    
    # Perform multiple health checks to measure performance
    local total_time=0
    local successful_requests=0
    local failed_requests=0
    
    for i in {1..5}; do
        local request_start=$(date +%s%3N)
        if curl -sf --max-time 5 "$url/health" > /dev/null 2>&1; then
            local request_end=$(date +%s%3N)
            local request_time=$((request_end - request_start))
            total_time=$((total_time + request_time))
            successful_requests=$((successful_requests + 1))
        else
            failed_requests=$((failed_requests + 1))
        fi
    done
    
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    if [[ $successful_requests -gt 0 ]]; then
        local avg_response_time=$((total_time / successful_requests))
        local success_rate=$((successful_requests * 100 / 5))
        
        local perf_details=$(cat <<EOF
{
  "average_response_time_ms": $avg_response_time,
  "success_rate_percent": $success_rate,
  "successful_requests": $successful_requests,
  "failed_requests": $failed_requests
}
EOF
)
        
        if [[ $avg_response_time -lt 1000 ]] && [[ $success_rate -ge 80 ]]; then
            log_success "Performance check passed (avg: ${avg_response_time}ms, success: ${success_rate}%)"
            add_result "performance" "healthy" "Performance is within acceptable limits" "$response_time" "$perf_details"
        else
            log_warning "Performance check warning (avg: ${avg_response_time}ms, success: ${success_rate}%)"
            add_result "performance" "degraded" "Performance is below optimal levels" "$response_time" "$perf_details"
        fi
    else
        log_error "Performance check failed - no successful requests"
        add_result "performance" "unhealthy" "All performance test requests failed" "$response_time"
    fi
}

# Generate JSON output
generate_json_output() {
    local results_json=""
    for result in "${HEALTH_RESULTS[@]}"; do
        if [[ -n "$results_json" ]]; then
            results_json="$results_json,"
        fi
        results_json="$results_json$result"
    done
    
    cat <<EOF
{
  "overall_status": "$OVERALL_STATUS",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "checks": [$results_json]
}
EOF
}

# Main health check function
main() {
    local url="${1:-$DEFAULT_URL}"
    
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        log_info "Starting comprehensive health check for $url"
        log_info "Timeout: ${TIMEOUT}s"
        echo
    fi
    
    # Run all health checks
    check_connectivity "$url"
    check_health_endpoint "$url"
    check_authentication "$url"
    check_azure_openai
    check_format_detection "$url"
    check_memory_usage "$url"
    check_reasoning_config "$url"
    check_performance "$url"
    
    # Output results
    if [[ "$JSON_OUTPUT" == "true" ]]; then
        generate_json_output
    else
        echo
        if [[ "$OVERALL_STATUS" == "healthy" ]]; then
            log_success "Overall health check: PASSED"
        else
            log_error "Overall health check: FAILED"
        fi
        
        if [[ "$VERBOSE" == "true" ]]; then
            echo
            log_info "Detailed results:"
            generate_json_output | jq .
        fi
    fi
    
    exit $EXIT_CODE
}

# Show usage information
usage() {
    echo "Usage: $0 [OPTIONS] [URL]"
    echo ""
    echo "Comprehensive health check for Claude-to-Azure Proxy"
    echo ""
    echo "Options:"
    echo "  -v, --verbose     Show detailed results"
    echo "  -j, --json        Output results in JSON format"
    echo "  -t, --timeout N   Set timeout in seconds (default: 30)"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Arguments:"
    echo "  URL               Base URL of the proxy (default: http://localhost:8080)"
    echo ""
    echo "Environment variables:"
    echo "  PROXY_API_KEY           Required for authentication checks"
    echo "  AZURE_OPENAI_ENDPOINT   Required for Azure OpenAI checks"
    echo "  AZURE_OPENAI_API_KEY    Required for Azure OpenAI checks"
    echo "  DEFAULT_REASONING_EFFORT Optional reasoning configuration"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Basic health check"
    echo "  $0 -v                                 # Verbose output"
    echo "  $0 -j                                 # JSON output"
    echo "  $0 -t 60 https://my-proxy.com        # Custom timeout and URL"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -j|--json)
            JSON_OUTPUT=true
            shift
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
        *)
            DEFAULT_URL="$1"
            shift
            ;;
    esac
done

# Run main function
main "$DEFAULT_URL"