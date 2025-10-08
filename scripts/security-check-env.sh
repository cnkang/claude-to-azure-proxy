#!/bin/bash

# Security check script to ensure .env files are properly excluded
set -e

echo "🔍 Checking .env file security..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists and warn user
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file found in project root${NC}"
    echo "   This is normal for development, but ensure it's not committed to git"
else
    echo -e "${GREEN}✅ No .env file found in project root${NC}"
fi

# Check .gitignore for .env patterns
echo ""
echo "🔍 Checking .gitignore for .env patterns..."
if grep -q "^\.env" .gitignore; then
    echo -e "${GREEN}✅ .env patterns found in .gitignore${NC}"
    echo "   Patterns found:"
    grep "^\.env" .gitignore | sed 's/^/   - /'
else
    echo -e "${RED}❌ .env patterns NOT found in .gitignore${NC}"
    echo "   Add the following to .gitignore:"
    echo "   .env"
    echo "   .env.local"
    echo "   .env.development"
    echo "   .env.test"
    echo "   .env.production"
    exit 1
fi

# Check .dockerignore for .env patterns
echo ""
echo "🔍 Checking .dockerignore for .env patterns..."
if [ -f ".dockerignore" ]; then
    if grep -q "^\.env" .dockerignore; then
        echo -e "${GREEN}✅ .env patterns found in .dockerignore${NC}"
        echo "   Patterns found:"
        grep "^\.env" .dockerignore | sed 's/^/   - /'
    else
        echo -e "${RED}❌ .env patterns NOT found in .dockerignore${NC}"
        echo "   Add the following to .dockerignore:"
        echo "   .env"
        echo "   .env.local"
        echo "   .env.development"
        echo "   .env.test"
        echo "   .env.production"
        exit 1
    fi
else
    echo -e "${RED}❌ .dockerignore file not found${NC}"
    echo "   Create .dockerignore and add .env patterns"
    exit 1
fi

# Check if .env.example exists
echo ""
echo "🔍 Checking for .env.example template..."
if [ -f ".env.example" ]; then
    echo -e "${GREEN}✅ .env.example template found${NC}"
else
    echo -e "${YELLOW}⚠️  .env.example template not found${NC}"
    echo "   Consider creating .env.example as a template for other developers"
fi

# Test Docker build context (if Docker is available)
echo ""
echo "🔍 Testing Docker build context..."
if command -v docker &> /dev/null; then
    # Create a temporary Dockerfile to test build context
    cat > Dockerfile.test << 'EOF'
FROM alpine:latest
COPY . /test
RUN find /test -name ".env*" -type f 2>/dev/null || echo "No .env files found"
EOF
    
    echo "   Building test image to check for .env files in context..."
    BUILD_OUTPUT=$(docker build -f Dockerfile.test -t env-test . 2>&1 || true)
    
    # Check if any .env files were found in the build output
    # Look for actual file paths, not just any mention of .env
    ENV_FILES_IN_CONTEXT=$(echo "$BUILD_OUTPUT" | grep -E "^/test/\.env" | grep -v "No .env files found" || true)
    if [ -n "$ENV_FILES_IN_CONTEXT" ]; then
        echo -e "${RED}❌ .env files found in Docker build context:${NC}"
        echo "$ENV_FILES_IN_CONTEXT" | sed 's/^/   /'
        echo "   Update .dockerignore to exclude these files"
        docker rmi env-test &>/dev/null || true
        rm -f Dockerfile.test
        exit 1
    else
        echo -e "${GREEN}✅ No .env files found in Docker build context${NC}"
    fi
    
    # Cleanup
    docker rmi env-test &>/dev/null || true
    rm -f Dockerfile.test
else
    echo -e "${YELLOW}⚠️  Docker not available, skipping build context test${NC}"
fi

# Check git status for any .env files
echo ""
echo "🔍 Checking git status for .env files..."
if command -v git &> /dev/null && [ -d ".git" ]; then
    # Check for .env files but exclude template files (.env.example, .env.sample)
    ENV_FILES_IN_GIT=$(git ls-files | grep "\.env" | grep -v "\.env\.example" | grep -v "\.env\.sample" || true)
    if [ -n "$ENV_FILES_IN_GIT" ]; then
        echo -e "${RED}❌ Sensitive .env files found in git repository:${NC}"
        echo "$ENV_FILES_IN_GIT" | sed 's/^/   /'
        echo "   Remove these files from git:"
        echo "$ENV_FILES_IN_GIT" | sed 's/^/   git rm --cached /'
        exit 1
    else
        echo -e "${GREEN}✅ No sensitive .env files found in git repository${NC}"
        # Check if template files exist and show them as acceptable
        TEMPLATE_FILES=$(git ls-files | grep -E "\.env\.(example|sample)" || true)
        if [ -n "$TEMPLATE_FILES" ]; then
            echo -e "${GREEN}ℹ️  Template files found (acceptable):${NC}"
            echo "$TEMPLATE_FILES" | sed 's/^/   /'
        fi
    fi
else
    echo -e "${YELLOW}⚠️  Not a git repository or git not available${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}🎉 Environment file security check completed successfully!${NC}"
echo ""
echo "📋 Security checklist:"
echo "  ✅ .env patterns in .gitignore"
echo "  ✅ .env patterns in .dockerignore"
echo "  ✅ No .env files in Docker build context"
echo "  ✅ No .env files committed to git"
echo ""
echo "💡 Best practices:"
echo "  - Never commit .env files to version control"
echo "  - Use .env.example as a template for other developers"
echo "  - Use environment variables or secrets management in production"
echo "  - Regularly audit your .gitignore and .dockerignore files"
echo "  - Use 'git status' before committing to check for sensitive files"