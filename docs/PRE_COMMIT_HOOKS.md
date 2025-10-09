# Pre-commit Hooks Configuration

This project uses [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/okonet/lint-staged) to ensure code quality and consistency before commits are made.

## 🎯 Overview

The pre-commit hooks perform the following checks:

### Pre-commit Hook (`.husky/pre-commit`)
- **Type checking**: Ensures TypeScript compilation passes
- **Linting**: Runs ESLint with auto-fix on staged files
- **Formatting**: Applies Prettier formatting to staged files
- **Testing**: Runs the test suite to ensure nothing is broken
- **Security audit**: Checks for known vulnerabilities in dependencies
- **TODO/FIXME detection**: Warns about TODO/FIXME comments in staged files

### Commit Message Hook (`.husky/commit-msg`)
- **Conventional commits**: Validates commit message format
- **Message length**: Warns if commit message is too long
- **Breaking changes**: Detects and highlights breaking changes

### Prepare Commit Message Hook (`.husky/prepare-commit-msg`)
- **Ticket integration**: Automatically adds ticket numbers from branch names
- **Branch-based prefixes**: Adds context based on branch naming conventions

### Pre-push Hook (`.husky/pre-push`)
- **Comprehensive testing**: Runs full test suite with coverage
- **Security audit**: Performs high-severity vulnerability check
- **Build verification**: Ensures the project builds successfully
- **Large file detection**: Warns about files larger than 1MB

## 🚀 Quick Start

### Installation
The hooks are automatically installed when you run:
```bash
pnpm install
```

### Manual Setup
If you need to reinstall the hooks:
```bash
pnpm run prepare
```

## 📋 Available Scripts

### Quality Assurance Scripts
```bash
# Run all pre-commit checks manually
pnpm run pre-commit:check

# Fix common issues automatically
pnpm run pre-commit:fix

# Comprehensive validation
pnpm run validate

# Individual checks
pnpm run type-check
pnpm run lint
pnpm run lint:fix
pnpm run test
pnpm run test:coverage
pnpm run format
pnpm run format:check
```

## 🎨 Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Valid Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools
- `perf`: A code change that improves performance
- `ci`: Changes to CI configuration files and scripts
- `build`: Changes that affect the build system or external dependencies
- `revert`: Reverts a previous commit

### Examples
```bash
feat: add user authentication
fix(api): resolve timeout issue in completions endpoint
docs: update deployment instructions
test(auth): add unit tests for authentication middleware
perf(db): optimize database queries
chore(deps): update dependencies to latest versions
```

## 🔧 Configuration Files

### lint-staged Configuration
Located in `package.json`:
```json
{
  "lint-staged": {
    "*.{ts,js}": [
      "eslint --config eslint.config.ts --fix",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ],
    "src/**/*.ts": [
      "pnpm run type-check"
    ],
    "tests/**/*.ts": [
      "pnpm run type-check"
    ]
  }
}
```

## 🚫 Bypassing Hooks

### Emergency Bypass (Not Recommended)
If you absolutely need to bypass the hooks:
```bash
# Skip pre-commit hooks
git commit --no-verify -m "emergency fix"

# Skip pre-push hooks
git push --no-verify
```

**⚠️ Warning**: Only use `--no-verify` in emergency situations. The hooks are there to maintain code quality and prevent issues.

## 🛠️ Troubleshooting

### Common Issues

#### Hook Not Executing
```bash
# Reinstall hooks
rm -rf .husky
pnpm run prepare
```

#### Permission Denied
```bash
# Fix permissions
chmod +x .husky/*
```

#### Type Check Failures
```bash
# Run type check to see specific errors
pnpm run type-check

# Fix TypeScript errors before committing
```

#### Lint Failures
```bash
# Auto-fix linting issues
pnpm run lint:fix

# Check remaining issues
pnpm run lint
```

#### Test Failures
```bash
# Run tests to see failures
pnpm run test

# Run tests in watch mode for development
pnpm run test:watch
```

### Performance Optimization

If the hooks are too slow, you can:

1. **Reduce test scope**: Modify the pre-commit hook to run only affected tests
2. **Parallel execution**: Use tools like `concurrently` for parallel checks
3. **Incremental checks**: Only run checks on changed files

### Customization

You can customize the hooks by editing the files in `.husky/`:
- `.husky/pre-commit`: Modify pre-commit checks
- `.husky/commit-msg`: Adjust commit message validation
- `.husky/pre-push`: Change pre-push validation

## 📊 Benefits

### Code Quality
- **Consistent formatting**: Prettier ensures uniform code style
- **Error prevention**: ESLint catches potential bugs and issues
- **Type safety**: TypeScript compilation prevents type-related errors

### Team Collaboration
- **Standardized commits**: Conventional commits improve changelog generation
- **Reduced review time**: Automated checks catch issues before review
- **Consistent workflow**: All team members follow the same quality standards

### CI/CD Integration
- **Faster CI builds**: Issues are caught locally before pushing
- **Reduced failed builds**: Pre-push checks prevent broken builds
- **Better deployment confidence**: Comprehensive testing before deployment

## 🔗 Related Documentation

- [ESLint Configuration](../eslint.config.ts)
- [TypeScript Configuration](../tsconfig.json)
- [Testing Guide](./TESTING.md)
- [Contributing Guidelines](../CONTRIBUTING.md)