# Claude-to-Azure Proxy

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-325%20passing-brightgreen.svg)](#testing)
[![Security](https://img.shields.io/badge/Security-Hardened-red.svg)](#security-features)

**A production-ready TypeScript API proxy server that seamlessly translates Claude API requests to Azure OpenAI format**

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Deployment](#-deployment) • [Contributing](#-contributing)

</div>

---

## 🎯 Overview

This high-performance proxy server enables seamless integration between Claude Code CLI and Azure OpenAI services by translating API requests and responses between formats. Built with enterprise-grade security, comprehensive monitoring, and production-ready resilience features.

### Why Use This Proxy?

- **🔄 Seamless Integration**: Use Claude Code CLI with Azure OpenAI without code changes
- **🛡️ Enterprise Security**: Comprehensive authentication, rate limiting, and input validation
- **📊 Production Monitoring**: Built-in metrics, health checks, and performance profiling
- **🚀 Cloud Ready**: Optimized for AWS App Runner with Docker support
- **🔧 Developer Friendly**: Full TypeScript, comprehensive testing, and detailed documentation

## ✨ Features

### Core Functionality

- **API Translation**: Bidirectional request/response transformation between Claude and Azure OpenAI formats
- **Model Compatibility**: Support for GPT-4, GPT-3.5-turbo, and other Azure OpenAI models
- **Streaming Support**: Real-time response streaming with proper format conversion

### Security & Authentication

- **Multi-Method Authentication**: Bearer token and API key support
- **Rate Limiting**: Configurable per-IP and global rate limits
- **Input Validation**: Comprehensive request sanitization and validation
- **Security Headers**: Helmet.js integration with OWASP best practices
- **CORS Protection**: Configurable cross-origin resource sharing

### Monitoring & Observability

- **Health Monitoring**: Comprehensive health checks with Azure OpenAI connectivity testing
- **Performance Metrics**: CPU, memory, and response time monitoring
- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Error Tracking**: Detailed error reporting with context preservation
- **Memory Leak Detection**: Automated memory growth analysis

### Resilience & Reliability

- **Circuit Breakers**: Automatic failure detection and recovery
- **Retry Logic**: Exponential backoff with jitter for failed requests
- **Graceful Degradation**: Service-level degradation during partial failures
- **Timeout Management**: Configurable request and response timeouts
- **Connection Pooling**: Optimized HTTP connection management

### Developer Experience

- **Full TypeScript**: Strict type checking with comprehensive interfaces
- **API Documentation**: OpenAPI 3.0.3 specification with interactive docs
- **Comprehensive Testing**: 325+ tests with integration and security coverage
- **Code Quality**: ESLint, Prettier, and automated quality checks
- **Performance Profiling**: Built-in profiling and optimization tools

## 🚀 Quick Start

### Prerequisites

- **Node.js** 22.0.0 or higher
- **pnpm** 10.18.1 or higher (recommended) or npm
- **Azure OpenAI** resource with API access

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/claude-to-azure-proxy.git
   cd claude-to-azure-proxy
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:

   ```env
   # Required Configuration
   PROXY_API_KEY=your-secure-32-character-api-key-here
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_API_KEY=your-azure-openai-api-key
   AZURE_OPENAI_MODEL=gpt-4

   # Optional Configuration
   PORT=8080
   NODE_ENV=production
   ```

4. **Start the server**

   ```bash
   # Development mode with hot reload
   pnpm dev

   # Production mode
   pnpm build
   pnpm start
   ```

5. **Verify installation**
   ```bash
   curl http://localhost:8080/health
   ```

### Usage Example

Once running, configure your Claude Code CLI to use the proxy:

```bash
# Test the proxy with curl
curl -X POST http://localhost:8080/v1/completions \
  -H "Authorization: Bearer your-proxy-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "prompt": "Hello, world!",
    "max_tokens": 100
  }'
```

## 🛠 Development

### Development Commands

```bash
# Development server with hot reload
pnpm dev

# Build for production
pnpm build

# Type checking
pnpm type-check

# Linting and formatting
pnpm lint
pnpm lint:fix
pnpm format

# Quality assurance
pnpm quality:all
pnpm quality:security
pnpm quality:complexity
```

### Testing

```bash
# Run all tests
pnpm test

# Watch mode for development
pnpm test:watch

# Coverage report
pnpm test:coverage

# Integration tests only
pnpm test tests/integration.test.ts
```

### Code Quality

The project maintains high code quality standards:

- **TypeScript Strict Mode**: Full type safety with strict compiler settings
- **ESLint Security Rules**: Security-focused linting with automated fixes
- **Automated Testing**: 325+ tests covering unit, integration, and security scenarios
- **Code Coverage**: Comprehensive test coverage with detailed reporting
- **Complexity Analysis**: Automated cyclomatic complexity monitoring
- **Dependency Scanning**: Regular vulnerability scanning and updates

## 📚 Documentation

### API Documentation

- **[OpenAPI Specification](docs/api-specification.yaml)** - Complete API documentation
- **[Interactive API Docs](http://localhost:8080/docs)** - Swagger UI (when running locally)

### Deployment & Operations

- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment instructions
- **[Quality Assurance](docs/QUALITY_ASSURANCE_SUMMARY.md)** - Code quality and security overview

### Generated Documentation

```bash
# Generate TypeScript API documentation
pnpm docs:generate

# Serve documentation locally
pnpm docs:serve
```

## 🔧 Configuration

### Environment Variables

| Variable                | Required | Default      | Description                               |
| ----------------------- | -------- | ------------ | ----------------------------------------- |
| `PROXY_API_KEY`         | ✅       | -            | Client authentication key (32-256 chars)  |
| `AZURE_OPENAI_ENDPOINT` | ✅       | -            | Azure OpenAI endpoint URL (HTTPS only)    |
| `AZURE_OPENAI_API_KEY`  | ✅       | -            | Azure OpenAI API key                      |
| `AZURE_OPENAI_MODEL`    | ✅       | -            | Model deployment name                     |
| `PORT`                  | ❌       | `8080`       | Server port (1024-65535)                  |
| `NODE_ENV`              | ❌       | `production` | Environment (development/production/test) |

### Security Configuration

The proxy includes comprehensive security features:

- **Authentication**: Multiple methods (Bearer token, API key header)
- **Rate Limiting**: Configurable limits per endpoint and IP
- **Input Validation**: Joi schema validation with sanitization
- **Security Headers**: Comprehensive HTTP security headers
- **CORS**: Configurable cross-origin resource sharing
- **Request Sanitization**: Automatic removal of sensitive data from logs

## 🚀 Deployment

### AWS App Runner (Recommended)

The application is optimized for AWS App Runner deployment:

```bash
# Build and deploy
pnpm build
pnpm docker:build

# Security scan before deployment
pnpm security:all
```

See the [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

### Docker Deployment

```bash
# Build Docker image
docker build -t claude-to-azure-proxy .

# Run with environment file
docker run -p 8080:8080 --env-file .env claude-to-azure-proxy
```

### Docker Compose

```yaml
version: '3.8'
services:
  claude-proxy:
    build: .
    ports:
      - '8080:8080'
    environment:
      - PROXY_API_KEY=${PROXY_API_KEY}
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_MODEL=${AZURE_OPENAI_MODEL}
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health']
      interval: 30s
      timeout: 10s
      retries: 3
```

## 📊 Monitoring

### Health Checks

The proxy provides comprehensive health monitoring:

```bash
# Basic health check
curl http://localhost:8080/health

# Detailed system information
curl http://localhost:8080/
```

### Metrics Collection

Built-in metrics include:

- **Performance**: Request duration, success rates, error rates
- **Resources**: Memory usage, CPU usage, event loop lag
- **Business**: API usage patterns, model utilization
- **Security**: Authentication attempts, rate limit hits

### Logging

Structured JSON logging with:

- **Correlation IDs**: Request tracing throughout the system
- **Sanitization**: Automatic removal of sensitive data
- **Context**: Rich metadata for debugging and monitoring
- **Levels**: Configurable log levels for different environments

## 🔒 Security Features

### Authentication & Authorization

- **Multi-method authentication** (Bearer token, API key)
- **Constant-time credential comparison** (prevents timing attacks)
- **Rate limiting** (global and per-IP limits)
- **Request validation** (comprehensive input sanitization)

### Security Headers

- **Helmet.js integration** (OWASP security headers)
- **CORS protection** (configurable origins)
- **Content Security Policy** (XSS protection)
- **HSTS enforcement** (HTTPS-only communication)

### Data Protection

- **Log sanitization** (automatic PII removal)
- **Error sanitization** (no sensitive data in error responses)
- **Secure defaults** (fail-secure configuration)
- **Vulnerability scanning** (automated dependency checks)

## 🧪 Testing

The project includes comprehensive testing:

- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end request flow testing
- **Security Tests**: Authentication and input validation testing
- **Performance Tests**: Load and concurrency testing
- **Error Handling Tests**: Failure scenario coverage

```bash
# Run specific test suites
pnpm test tests/completions.test.ts
pnpm test tests/security.test.ts
pnpm test tests/integration.test.ts

# Generate detailed coverage report
pnpm test:coverage
```

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** with tests
4. **Run quality checks**: `pnpm quality:all`
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- **TypeScript**: Use strict typing and document public APIs
- **Testing**: Add tests for new features and bug fixes
- **Security**: Follow security best practices and run security scans
- **Documentation**: Update documentation for API changes
- **Code Quality**: Maintain code quality standards and pass all checks

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Azure OpenAI** for providing the underlying AI capabilities
- **Anthropic** for the Claude API specification
- **TypeScript Community** for excellent tooling and documentation
- **Open Source Contributors** for the amazing libraries that make this possible

## 📞 Support

- **Documentation**: Check the [docs](docs/) directory for detailed guides
- **Issues**: Report bugs and request features via [GitHub Issues](https://github.com/your-username/claude-to-azure-proxy/issues)
- **Security**: Report security vulnerabilities privately via email

---

<div align="center">

**Built with ❤️ using TypeScript and modern web technologies**

[⭐ Star this repo](https://github.com/your-username/claude-to-azure-proxy) if you find it useful!

</div>
