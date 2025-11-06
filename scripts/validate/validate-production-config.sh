#!/bin/bash

# Production Configuration Validation Script
# Validates all production deployment configurations and settings

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BLUE}🔍 Production Configuration Validation${NC}"
echo -e "${BLUE}=====================================${NC}"

# Change to project root
cd "$PROJECT_ROOT"

# Validation results
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

# Function to print step headers
print_step() {
    echo -e "\n${YELLOW}📋 $1${NC}"
    echo -e "${YELLOW}$(printf '=%.0s' {1..50})${NC}"
}

# Function to log error
log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((VALIDATION_ERRORS++))
}

# Function to log warning
log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((VALIDATION_WARNINGS++))
}

# Function to log success
log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Validate environment files
print_step "Validating Environment Files"

# Check .env.example exists
if [ -f ".env.example" ]; then
    log_success ".env.example file exists"
else
    log_error ".env.example file is missing"
fi

# Check frontend environment files
FRONTEND_ENV_FILES=(".env.production" ".env.staging" ".env.example")
for env_file in "${FRONTEND_ENV_FILES[@]}"; do
    if [ -f "apps/frontend/$env_file" ]; then
        log_success "Frontend $env_file exists"
        
        # Validate required variables in production env
        if [ "$env_file" = ".env.production" ]; then
            REQUIRED_FRONTEND_VARS=("VITE_API_URL" "VITE_APP_NAME" "VITE_APP_VERSION")
            for var in "${REQUIRED_FRONTEND_VARS[@]}"; do
                if grep -q "^$var=" "apps/frontend/$env_file"; then
                    log_success "Frontend $env_file contains $var"
                else
                    log_error "Frontend $env_file missing required variable: $var"
                fi
            done
        fi
    else
        log_error "Frontend $env_file is missing"
    fi
done

# Validate Docker configurations
print_step "Validating Docker Configurations"

# Check Dockerfiles
DOCKERFILES=("apps/backend/Dockerfile" "apps/frontend/Dockerfile")
for dockerfile in "${DOCKERFILES[@]}"; do
    if [ -f "$dockerfile" ]; then
        log_success "$dockerfile exists"
        
        # Check for security best practices
        if grep -q "USER " "$dockerfile"; then
            log_success "$dockerfile uses non-root user"
        else
            log_warning "$dockerfile should use non-root user"
        fi
        
        if grep -q "HEALTHCHECK" "$dockerfile"; then
            log_success "$dockerfile includes health check"
        else
            log_warning "$dockerfile should include health check"
        fi
        
        # Check for multi-stage build
        if grep -q "FROM.*AS" "$dockerfile"; then
            log_success "$dockerfile uses multi-stage build"
        else
            log_warning "$dockerfile should use multi-stage build"
        fi
    else
        log_error "$dockerfile is missing"
    fi
done

# Check Docker Compose files
COMPOSE_FILES=("docker-compose.yml" "docker-compose.prod.yml" "docker-compose.prod-cdn.yml")
for compose_file in "${COMPOSE_FILES[@]}"; do
    if [ -f "$compose_file" ]; then
        log_success "$compose_file exists"
        
        # Validate compose file syntax
        if command_exists docker-compose; then
            if docker-compose -f "$compose_file" config >/dev/null 2>&1; then
                log_success "$compose_file syntax is valid"
            else
                log_error "$compose_file has syntax errors"
            fi
        fi
        
        # Check for security configurations
        if grep -q "security_opt:" "$compose_file"; then
            log_success "$compose_file includes security options"
        else
            log_warning "$compose_file should include security options"
        fi
        
        if grep -q "read_only:" "$compose_file"; then
            log_success "$compose_file uses read-only containers"
        else
            log_warning "$compose_file should use read-only containers"
        fi
    else
        if [ "$compose_file" = "docker-compose.yml" ]; then
            log_error "$compose_file is missing"
        else
            log_warning "$compose_file is missing (optional)"
        fi
    fi
done

# Validate Nginx configurations
print_step "Validating Nginx Configurations"

NGINX_CONFIGS=("infra/docker/nginx/nginx.conf" "infra/docker/nginx/cdn.conf")
for nginx_config in "${NGINX_CONFIGS[@]}"; do
    if [ -f "$nginx_config" ]; then
        log_success "$nginx_config exists"
        
        # Check for security headers
        if grep -q "add_header.*X-Frame-Options" "$nginx_config"; then
            log_success "$nginx_config includes X-Frame-Options header"
        else
            log_warning "$nginx_config should include X-Frame-Options header"
        fi
        
        if grep -q "add_header.*Content-Security-Policy" "$nginx_config"; then
            log_success "$nginx_config includes CSP header"
        else
            log_warning "$nginx_config should include CSP header"
        fi
        
        # Check for gzip compression
        if grep -q "gzip on" "$nginx_config"; then
            log_success "$nginx_config enables gzip compression"
        else
            log_warning "$nginx_config should enable gzip compression"
        fi
        
        # Check for rate limiting
        if grep -q "limit_req" "$nginx_config"; then
            log_success "$nginx_config includes rate limiting"
        else
            log_warning "$nginx_config should include rate limiting"
        fi
    else
        if [ "$nginx_config" = "infra/docker/nginx/nginx.conf" ]; then
            log_error "$nginx_config is missing"
        else
            log_warning "$nginx_config is missing (optional for CDN)"
        fi
    fi
done

# Validate build configurations
print_step "Validating Build Configurations"

# Check Vite configuration
if [ -f "apps/frontend/vite.config.ts" ]; then
    log_success "Vite configuration exists"
    
    # Check for production optimizations
    if grep -q "minify.*terser" "apps/frontend/vite.config.ts"; then
        log_success "Vite config uses Terser for minification"
    else
        log_warning "Vite config should use Terser for production minification"
    fi
    
    if grep -q "rollupOptions" "apps/frontend/vite.config.ts"; then
        log_success "Vite config includes Rollup optimizations"
    else
        log_warning "Vite config should include Rollup optimizations"
    fi
else
    log_error "Vite configuration is missing"
fi

# Check TypeScript configurations
TS_CONFIGS=("apps/backend/tsconfig.json" "apps/frontend/tsconfig.json")
for ts_config in "${TS_CONFIGS[@]}"; do
    if [ -f "$ts_config" ]; then
        log_success "$ts_config exists"
        
        # Check for strict mode (either directly or via extends)
        if grep -q '"strict".*true' "$ts_config" || grep -q '"extends".*base' "$ts_config" || grep -q '"extends".*react' "$ts_config"; then
            log_success "$ts_config enables strict mode (directly or via extends)"
        else
            log_warning "$ts_config should enable strict mode"
        fi
    else
        log_error "$ts_config is missing"
    fi
done

# Validate package.json files
print_step "Validating Package Configurations"

PACKAGE_JSONS=("package.json" "apps/backend/package.json" "apps/frontend/package.json")
for package_json in "${PACKAGE_JSONS[@]}"; do
    if [ -f "$package_json" ]; then
        log_success "$package_json exists"
        
        # Check for required scripts
        if [ "$package_json" = "package.json" ]; then
            REQUIRED_SCRIPTS=("build" "test" "lint" "type-check")
        elif [[ "$package_json" == *"backend"* ]]; then
            REQUIRED_SCRIPTS=("build" "start" "test" "lint")
        else
            REQUIRED_SCRIPTS=("build" "dev" "test" "lint")
        fi
        
        for script in "${REQUIRED_SCRIPTS[@]}"; do
            if grep -q "\"$script\":" "$package_json"; then
                log_success "$package_json includes $script script"
            else
                log_error "$package_json missing required script: $script"
            fi
        done
        
        # Check Node.js version requirement
        if grep -q '"node".*">=24' "$package_json"; then
            log_success "$package_json specifies Node.js 24+ requirement"
        else
            log_warning "$package_json should specify Node.js 24+ requirement"
        fi
    else
        log_error "$package_json is missing"
    fi
done

# Validate security configurations
print_step "Validating Security Configurations"

# Check for .dockerignore
if [ -f ".dockerignore" ]; then
    log_success ".dockerignore exists"
    
    # Check for common exclusions
    DOCKERIGNORE_ITEMS=("node_modules" ".git" "*.log" ".env")
    for item in "${DOCKERIGNORE_ITEMS[@]}"; do
        if grep -q "$item" ".dockerignore"; then
            log_success ".dockerignore excludes $item"
        else
            log_warning ".dockerignore should exclude $item"
        fi
    done
else
    log_error ".dockerignore is missing"
fi

# Check for .gitignore
if [ -f ".gitignore" ]; then
    log_success ".gitignore exists"
    
    # Check for sensitive file exclusions
    GITIGNORE_ITEMS=(".env" "node_modules" "dist" "*.log")
    for item in "${GITIGNORE_ITEMS[@]}"; do
        if grep -q "$item" ".gitignore"; then
            log_success ".gitignore excludes $item"
        else
            log_warning ".gitignore should exclude $item"
        fi
    done
else
    log_error ".gitignore is missing"
fi

# Validate deployment scripts
print_step "Validating Deployment Scripts"

DEPLOYMENT_SCRIPTS=("scripts/build/build-production.sh" "scripts/deploy/deploy-production.sh")
for script in "${DEPLOYMENT_SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        log_success "$script exists"
        
        # Check if script is executable
        if [ -x "$script" ]; then
            log_success "$script is executable"
        else
            log_warning "$script should be executable"
        fi
        
        # Check for error handling
        if grep -q "set -euo pipefail" "$script"; then
            log_success "$script includes proper error handling"
        else
            log_warning "$script should include 'set -euo pipefail'"
        fi
    else
        log_error "$script is missing"
    fi
done

# Validate monitoring configurations
print_step "Validating Monitoring Configurations"

# Check for health check endpoints in nginx config
if [ -f "infra/docker/nginx/nginx.conf" ]; then
    if grep -q "location /health" "infra/docker/nginx/nginx.conf"; then
        log_success "Nginx config includes health check endpoint"
    else
        log_warning "Nginx config should include health check endpoint"
    fi
fi

# Check for logging configuration
if [ -f "infra/docker/nginx/nginx.conf" ]; then
    if grep -q "log_format" "infra/docker/nginx/nginx.conf"; then
        log_success "Nginx config includes custom log format"
    else
        log_warning "Nginx config should include custom log format"
    fi
fi

# Validate workspace configuration
print_step "Validating Workspace Configuration"

# Check pnpm workspace configuration
if [ -f "pnpm-workspace.yaml" ]; then
    log_success "pnpm workspace configuration exists"
    
    # Check for proper workspace structure
    if grep -q "apps/\*" "pnpm-workspace.yaml" && grep -q "packages/\*" "pnpm-workspace.yaml"; then
        log_success "pnpm workspace includes apps and packages"
    else
        log_warning "pnpm workspace should include apps/* and packages/*"
    fi
else
    log_error "pnpm workspace configuration is missing"
fi

# Check for shared packages
SHARED_PACKAGES=("packages/shared-types" "packages/shared-utils" "packages/shared-config")
for package in "${SHARED_PACKAGES[@]}"; do
    if [ -d "$package" ]; then
        log_success "$package directory exists"
        
        if [ -f "$package/package.json" ]; then
            log_success "$package has package.json"
        else
            log_error "$package missing package.json"
        fi
    else
        log_warning "$package directory is missing (optional)"
    fi
done

# Summary
print_step "Validation Summary"

echo -e "\n${BLUE}Validation Results:${NC}"
echo -e "  Errors: ${RED}$VALIDATION_ERRORS${NC}"
echo -e "  Warnings: ${YELLOW}$VALIDATION_WARNINGS${NC}"

if [ $VALIDATION_ERRORS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 Production configuration validation passed!${NC}"
    if [ $VALIDATION_WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Please review the warnings above for optimal configuration${NC}"
    fi
    exit 0
else
    echo -e "\n${RED}❌ Production configuration validation failed!${NC}"
    echo -e "${RED}Please fix the errors above before deploying to production${NC}"
    exit 1
fi