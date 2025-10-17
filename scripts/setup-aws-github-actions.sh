#!/bin/bash

# AWS GitHub Actions Setup Script
# This script helps set up AWS resources for GitHub Actions CI/CD pipeline

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_REGION="us-east-1"
DEFAULT_REPO_NAME="claude-to-azure-proxy"
DEFAULT_ROLE_NAME="GitHubActions-ECR-Role"
DEFAULT_POLICY_NAME="GitHubActions-ECR-Policy"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[SETUP]${NC} $1"
}

# Function to check if AWS CLI is installed and configured
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi

    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS CLI is not configured. Please run 'aws configure' first."
        exit 1
    fi

    print_status "AWS CLI is configured"
}

# Function to get user input with default value
get_input() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    read -p "$prompt [$default]: " input
    if [ -z "$input" ]; then
        eval "$var_name=\"$default\""
    else
        eval "$var_name=\"$input\""
    fi
}

# Function to get AWS account ID
get_account_id() {
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    print_status "AWS Account ID: $AWS_ACCOUNT_ID"
}

# Function to create OIDC provider if it doesn't exist
create_oidc_provider() {
    print_header "Checking GitHub OIDC Provider"
    
    if aws iam get-open-id-connect-provider \
        --open-id-connect-provider-arn "arn:aws:iam::$AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" \
        &> /dev/null; then
        print_status "GitHub OIDC Provider already exists"
    else
        print_status "Creating GitHub OIDC Provider"
        aws iam create-open-id-connect-provider \
            --url https://token.actions.githubusercontent.com \
            --client-id-list sts.amazonaws.com \
            --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
        print_status "GitHub OIDC Provider created"
    fi
}

# Function to create IAM role
create_iam_role() {
    print_header "Creating IAM Role: $ROLE_NAME"
    
    # Create trust policy
    cat > /tmp/github-actions-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::$AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:$GITHUB_REPO:*"
        }
      }
    }
  ]
}
EOF

    # Check if role exists
    if aws iam get-role --role-name "$ROLE_NAME" &> /dev/null; then
        print_warning "IAM Role $ROLE_NAME already exists"
        read -p "Do you want to update the trust policy? (y/N): " update_role
        if [[ $update_role =~ ^[Yy]$ ]]; then
            aws iam update-assume-role-policy \
                --role-name "$ROLE_NAME" \
                --policy-document file:///tmp/github-actions-trust-policy.json
            print_status "IAM Role trust policy updated"
        fi
    else
        aws iam create-role \
            --role-name "$ROLE_NAME" \
            --assume-role-policy-document file:///tmp/github-actions-trust-policy.json \
            --description "Role for GitHub Actions to push to ECR"
        print_status "IAM Role created: $ROLE_NAME"
    fi

    # Clean up temp file
    rm /tmp/github-actions-trust-policy.json
}

# Function to create IAM policy
create_iam_policy() {
    print_header "Creating IAM Policy: $POLICY_NAME"
    
    # Create ECR policy
    cat > /tmp/ecr-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:StartImageScan",
        "ecr:DescribeImageScanFindings",
        "ecr:DescribeImages",
        "ecr:DescribeRepositories"
      ],
      "Resource": "arn:aws:ecr:*:$AWS_ACCOUNT_ID:repository/$ECR_REPO_NAME"
    }
  ]
}
EOF

    # Check if policy exists
    POLICY_ARN="arn:aws:iam::$AWS_ACCOUNT_ID:policy/$POLICY_NAME"
    if aws iam get-policy --policy-arn "$POLICY_ARN" &> /dev/null; then
        print_warning "IAM Policy $POLICY_NAME already exists"
        read -p "Do you want to create a new version? (y/N): " update_policy
        if [[ $update_policy =~ ^[Yy]$ ]]; then
            aws iam create-policy-version \
                --policy-arn "$POLICY_ARN" \
                --policy-document file:///tmp/ecr-policy.json \
                --set-as-default
            print_status "IAM Policy version updated"
        fi
    else
        aws iam create-policy \
            --policy-name "$POLICY_NAME" \
            --policy-document file:///tmp/ecr-policy.json \
            --description "Policy for GitHub Actions ECR access"
        print_status "IAM Policy created: $POLICY_NAME"
    fi

    # Attach policy to role
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn "$POLICY_ARN"
    print_status "Policy attached to role"

    # Clean up temp file
    rm /tmp/ecr-policy.json
}

# Function to create ECR repository
create_ecr_repository() {
    print_header "Creating ECR Repository: $ECR_REPO_NAME"
    
    if aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region "$AWS_REGION" &> /dev/null; then
        print_warning "ECR Repository $ECR_REPO_NAME already exists"
    else
        aws ecr create-repository \
            --repository-name "$ECR_REPO_NAME" \
            --region "$AWS_REGION" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256
        print_status "ECR Repository created: $ECR_REPO_NAME"
    fi

    # Set lifecycle policy
    cat > /tmp/lifecycle-policy.json << EOF
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 images",
      "selection": {
        "tagStatus": "tagged",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {
        "type": "expire"
      }
    },
    {
      "rulePriority": 2,
      "description": "Delete untagged images older than 1 day",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 1
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
EOF

    aws ecr put-lifecycle-policy \
        --repository-name "$ECR_REPO_NAME" \
        --region "$AWS_REGION" \
        --lifecycle-policy-text file:///tmp/lifecycle-policy.json
    print_status "ECR lifecycle policy set"

    # Clean up temp file
    rm /tmp/lifecycle-policy.json
}

# Function to display GitHub configuration
display_github_config() {
    print_header "GitHub Repository Configuration"
    
    echo ""
    echo "Please set the following Repository Secrets in your GitHub repository:"
    echo "Repository Settings > Secrets and variables > Actions > Repository secrets"
    echo ""
    echo -e "${BLUE}AWS_REGION${NC}: $AWS_REGION"
    echo -e "${BLUE}AWS_ROLE_ARN${NC}: arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME"
    echo -e "${BLUE}ECR_REPOSITORY_NAME${NC}: $ECR_REPO_NAME"
    echo ""
    echo "ECR Repository URI: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME"
    echo ""
}

# Function to test the setup
test_setup() {
    print_header "Testing Setup"
    
    # Test STS assume role
    print_status "Testing STS assume role..."
    if aws sts assume-role \
        --role-arn "arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME" \
        --role-session-name test-session \
        --output table &> /dev/null; then
        print_status "✅ STS assume role test passed"
    else
        print_error "❌ STS assume role test failed"
    fi

    # Test ECR access
    print_status "Testing ECR access..."
    if aws ecr describe-repositories \
        --repository-names "$ECR_REPO_NAME" \
        --region "$AWS_REGION" &> /dev/null; then
        print_status "✅ ECR access test passed"
    else
        print_error "❌ ECR access test failed"
    fi
}

# Main function
main() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                AWS GitHub Actions Setup Script              ║"
    echo "║              Claude-to-Azure Proxy CI/CD Setup              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Check prerequisites
    check_aws_cli
    get_account_id

    # Get user inputs
    echo ""
    print_header "Configuration"
    get_input "GitHub Repository (owner/repo)" "" GITHUB_REPO
    get_input "AWS Region" "$DEFAULT_REGION" AWS_REGION
    get_input "ECR Repository Name" "$DEFAULT_REPO_NAME" ECR_REPO_NAME
    get_input "IAM Role Name" "$DEFAULT_ROLE_NAME" ROLE_NAME
    get_input "IAM Policy Name" "$DEFAULT_POLICY_NAME" POLICY_NAME

    # Validate GitHub repo format
    if [[ ! $GITHUB_REPO =~ ^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$ ]]; then
        print_error "Invalid GitHub repository format. Use: owner/repo"
        exit 1
    fi

    echo ""
    print_status "Configuration Summary:"
    echo "  GitHub Repository: $GITHUB_REPO"
    echo "  AWS Region: $AWS_REGION"
    echo "  ECR Repository: $ECR_REPO_NAME"
    echo "  IAM Role: $ROLE_NAME"
    echo "  IAM Policy: $POLICY_NAME"
    echo ""

    read -p "Continue with setup? (y/N): " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        print_status "Setup cancelled"
        exit 0
    fi

    # Execute setup steps
    create_oidc_provider
    create_iam_role
    create_iam_policy
    create_ecr_repository

    # Display configuration
    display_github_config

    # Test setup
    read -p "Run setup tests? (y/N): " run_tests
    if [[ $run_tests =~ ^[Yy]$ ]]; then
        test_setup
    fi

    echo ""
    print_status "🎉 Setup completed successfully!"
    print_status "Don't forget to configure the GitHub repository secrets."
}

# Run main function
main "$@"