# AWS OIDC Setup for GitHub Actions

## Problem Diagnosis

If you see the following error:

```
Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity
```

This is typically an AWS IAM OIDC configuration issue.

## Resolution Steps

### 1. Create OIDC Identity Provider

In the AWS IAM Console:

1. Go to **IAM** > **Identity providers**
2. Click **Add provider**
3. Select **OpenID Connect**
4. Provider URL: `https://token.actions.githubusercontent.com`
5. Audience: `sts.amazonaws.com`

### 2. Create IAM Role

Create a new IAM role with the following trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:cnkang/claude-to-azure-proxy:*"
        }
      }
    }
  ]
}
```

### 3. Add ECR Permissions Policy

Attach the following permissions policy to the role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:StartImageScan"
      ],
      "Resource": "arn:aws:ecr:YOUR_REGION:YOUR_ACCOUNT_ID:repository/YOUR_REPOSITORY_NAME"
    }
  ]
}
```

### 4. Configure GitHub Secrets

Add the following secrets in your GitHub repository settings:

- `AWS_ROLE_ARN`: `arn:aws:iam::YOUR_ACCOUNT_ID:role/YOUR_ROLE_NAME`
- `AWS_REGION`: Your AWS region (e.g., `us-east-1`)
- `ECR_REPOSITORY_NAME`: ECR repository name

### 5. Verify Configuration

Run the GitHub Actions workflow and check the diagnostic output to ensure the information matches
your AWS configuration.

## Common Issues

### Q: Still receiving AccessDenied error

A: Check:

- OIDC provider is correctly created
- Trust policy repository name matches exactly
- Role has sufficient ECR permissions

### Q: How to test OIDC configuration

A: You can view detailed error information in AWS CloudTrail, including the requested principalId
and conditions.

### Q: Can I skip ECR push?

A: Yes! The current CI/CD configuration will automatically skip ECR push if AWS configuration fails
and continue pushing to GitHub Container Registry.

## Alternative Solutions

If you don't need to push to ECR, you can:

1. Not configure AWS secrets - the workflow will automatically skip ECR steps
2. Use only GitHub Container Registry (GHCR)
3. Configure AWS OIDC later when you need it

The workflow is designed so that ECR push is completely optional and won't affect the main CI/CD
process.
