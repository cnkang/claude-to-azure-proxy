#!/bin/bash

# AWS Setup Verification Script
# This script verifies that AWS resources are properly configured for GitHub Actions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Default values
ROLE_NAME="GitHubActions-ECR-Role"
POLICY_NAME="GitHubActions-ECR-Policy"
REPO_NAME="claude-to-azure-proxy"
REGION="us-east-1"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --role-name)
            ROLE_NAME="$2"
            shift 2
            ;;
        --policy-name)
            POLICY_NAME="$2"
            shift 2
            ;;
        --repo-name)
            REPO_NAME="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --role-name ROLE      IAM Role name (default: GitHubActions-ECR-Role)"
            echo "  --policy-name POLICY  IAM Policy name (default: GitHubActions-ECR-Policy)"
            echo "  --repo-name REPO      ECR Repository name (default: claude-to-azure-proxy)"
            echo "  --region REGION       AWS Region (default: us-east-1)"
            echo "  --help               Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                AWS Setup Verification Script                ║"
echo "║              Claude-to-Azure Proxy CI/CD Setup              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if AWS CLI is installed and configured
print_info "Checking AWS CLI configuration..."
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed"
    exit 1
fi

if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS CLI is not configured or credentials are invalid"
    exit 1
fi

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
print_status "AWS CLI configured for account: $AWS_ACCOUNT_ID"

# Check OIDC Provider
print_info "Checking GitHub OIDC Provider..."
if aws iam get-open-id-connect-provider \
    --open-id-connect-provider-arn "arn:aws:iam::$AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" \
    &> /dev/null; then
    print_status "GitHub OIDC Provider exists"
else
    print_error "GitHub OIDC Provider not found"
    echo "  Create with: aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1"
fi

# Check IAM Role
print_info "Checking IAM Role: $ROLE_NAME..."
if aws iam get-role --role-name "$ROLE_NAME" &> /dev/null; then
    print_status "IAM Role exists: $ROLE_NAME"
    
    # Check trust policy
    TRUST_POLICY=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.AssumeRolePolicyDocument' --output json)
    if echo "$TRUST_POLICY" | grep -q "token.actions.githubusercontent.com"; then
        print_status "Trust policy includes GitHub OIDC"
    else
        print_warning "Trust policy may not be configured for GitHub Actions"
    fi
else
    print_error "IAM Role not found: $ROLE_NAME"
fi

# Check IAM Policy
print_info "Checking IAM Policy: $POLICY_NAME..."
POLICY_ARN="arn:aws:iam::$AWS_ACCOUNT_ID:policy/$POLICY_NAME"
if aws iam get-policy --policy-arn "$POLICY_ARN" &> /dev/null; then
    print_status "IAM Policy exists: $POLICY_NAME"
    
    # Check if policy is attached to role
    if aws iam list-attached-role-policies --role-name "$ROLE_NAME" --query 'AttachedPolicies[?PolicyArn==`'$POLICY_ARN'`]' --output text | grep -q "$POLICY_ARN"; then
        print_status "Policy is attached to role"
    else
        print_warning "Policy is not attached to role"
    fi
else
    print_error "IAM Policy not found: $POLICY_NAME"
fi

# Check ECR Repository
print_info "Checking ECR Repository: $REPO_NAME..."
if aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" &> /dev/null; then
    print_status "ECR Repository exists: $REPO_NAME"
    
    # Check repository configuration
    REPO_INFO=$(aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" --output json)
    
    # Check scan on push
    if echo "$REPO_INFO" | grep -q '"scanOnPush": true'; then
        print_status "Scan on push is enabled"
    else
        print_warning "Scan on push is not enabled"
    fi
    
    # Check encryption
    if echo "$REPO_INFO" | grep -q '"encryptionType"'; then
        print_status "Repository encryption is configured"
    else
        print_warning "Repository encryption is not configured"
    fi
    
    # Get repository URI
    REPO_URI=$(echo "$REPO_INFO" | jq -r '.repositories[0].repositoryUri')
    print_info "Repository URI: $REPO_URI"
    
else
    print_error "ECR Repository not found: $REPO_NAME"
fi

# Test STS assume role
print_info "Testing STS assume role..."
ROLE_ARN="arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME"
if aws sts assume-role \
    --role-arn "$ROLE_ARN" \
    --role-session-name verification-test \
    --duration-seconds 900 \
    &> /dev/null; then
    print_status "STS assume role test successful"
else
    print_error "STS assume role test failed"
    echo "  Role ARN: $ROLE_ARN"
fi

# Test ECR login
print_info "Testing ECR login..."
if aws ecr get-login-password --region "$REGION" &> /dev/null; then
    print_status "ECR login test successful"
else
    print_error "ECR login test failed"
fi

# Summary
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                        SUMMARY                               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Configuration Details:"
echo "  AWS Account ID: $AWS_ACCOUNT_ID"
echo "  AWS Region: $REGION"
echo "  IAM Role: $ROLE_NAME"
echo "  IAM Policy: $POLICY_NAME"
echo "  ECR Repository: $REPO_NAME"
echo ""
echo "GitHub Repository Secrets needed:"
echo "  AWS_REGION: $REGION"
echo "  AWS_ROLE_ARN: arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME"
echo "  ECR_REPOSITORY_NAME: $REPO_NAME"
echo ""

# Check if all components are ready
COMPONENTS_READY=true

if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "arn:aws:iam::$AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" &> /dev/null; then
    COMPONENTS_READY=false
fi

if ! aws iam get-role --role-name "$ROLE_NAME" &> /dev/null; then
    COMPONENTS_READY=false
fi

if ! aws iam get-policy --policy-arn "$POLICY_ARN" &> /dev/null; then
    COMPONENTS_READY=false
fi

if ! aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" &> /dev/null; then
    COMPONENTS_READY=false
fi

if [ "$COMPONENTS_READY" = true ]; then
    print_status "🎉 All components are configured correctly!"
    print_status "Ready for GitHub Actions CI/CD pipeline!"
else
    print_error "❌ Some components are missing or misconfigured"
    print_info "Run the setup script: ./scripts/setup-aws-github-actions.sh"
fi

echo ""