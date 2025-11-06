# Makefile for Claude-to-Azure Proxy Monorepo Operations

# Variables
IMAGE_NAME := claude-to-azure-proxy
IMAGE_TAG := latest
FULL_IMAGE_NAME := $(IMAGE_NAME):$(IMAGE_TAG)
CONTAINER_NAME := claude-proxy-container
BACKEND_IMAGE := $(IMAGE_NAME):backend
FRONTEND_IMAGE := $(IMAGE_NAME):frontend

# Default target
.PHONY: help
help: ## Show this help message
	@echo "Available commands:"
	@echo ""
	@echo "🏗️  Build Commands:"
	@grep -E '^build.*:.*?## .*$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "🚀 Development Commands:"
	@grep -E '^dev.*:.*?## .*$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "🧪 Testing Commands:"
	@grep -E '^test.*:.*?## .*$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "🐳 Docker Commands:"
	@grep -E '^(run|stop|logs|shell|compose).*:.*?## .*$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "🔒 Security Commands:"
	@grep -E '^security.*:.*?## .*$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "🧹 Utility Commands:"
	@grep -E '^(clean|inspect|size).*:.*?## .*$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'

# Workspace Commands
.PHONY: install
install: ## Install all workspace dependencies
	@echo "📦 Installing workspace dependencies..."
	pnpm install
	@echo "✅ Dependencies installed"

.PHONY: build-shared
build-shared: ## Build shared packages
	@echo "🏗️  Building shared packages..."
	pnpm build:shared
	@echo "✅ Shared packages built"

.PHONY: build-backend
build-backend: ## Build backend application
	@echo "🏗️  Building backend application..."
	pnpm build:backend
	@echo "✅ Backend built"

.PHONY: build-frontend
build-frontend: ## Build frontend application
	@echo "🏗️  Building frontend application..."
	pnpm build:frontend
	@echo "✅ Frontend built"

.PHONY: build-all
build-all: ## Build all workspace packages
	@echo "🏗️  Building all workspace packages..."
	./scripts/build/build-all.sh
	@echo "✅ All packages built"

# Development Commands
.PHONY: dev-setup
dev-setup: ## Set up development environment
	@echo "🛠️  Setting up development environment..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "📝 Created .env file from .env.example"; \
		echo "⚠️  Please update .env with your actual values"; \
	fi
	pnpm install
	pnpm build:shared
	@echo "✅ Development setup completed"

.PHONY: dev-backend
dev-backend: ## Start backend in development mode
	@echo "🚀 Starting backend development server..."
	pnpm dev

.PHONY: dev-frontend
dev-frontend: ## Start frontend in development mode
	@echo "🚀 Starting frontend development server..."
	pnpm dev:frontend

.PHONY: dev-all
dev-all: ## Start both backend and frontend in development mode
	@echo "🚀 Starting all development servers..."
	pnpm dev:all

# Testing Commands
.PHONY: test-all
test-all: ## Run all tests
	@echo "🧪 Running all tests..."
	pnpm test
	@echo "✅ All tests completed"

.PHONY: test-backend
test-backend: ## Run backend tests
	@echo "🧪 Running backend tests..."
	pnpm test:backend
	@echo "✅ Backend tests completed"

.PHONY: test-frontend
test-frontend: ## Run frontend tests
	@echo "🧪 Running frontend tests..."
	pnpm test:frontend
	@echo "✅ Frontend tests completed"

.PHONY: test-coverage
test-coverage: ## Run tests with coverage
	@echo "🧪 Running tests with coverage..."
	pnpm test:coverage
	@echo "✅ Coverage report generated"

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	@echo "🧪 Running tests in watch mode..."
	pnpm test:watch

# Docker Build Commands
.PHONY: build
build: ## Build the main Docker image
	@echo "🏗️  Building Docker image $(FULL_IMAGE_NAME)..."
	docker build -t $(FULL_IMAGE_NAME) .
	@echo "✅ Build completed"

.PHONY: build-no-cache
build-no-cache: ## Build the Docker image without cache
	@echo "🏗️  Building Docker image $(FULL_IMAGE_NAME) without cache..."
	docker build --no-cache -t $(FULL_IMAGE_NAME) .
	@echo "✅ Build completed"

.PHONY: build-backend-docker
build-backend-docker: ## Build backend Docker image
	@echo "🏗️  Building backend Docker image..."
	docker build -f apps/backend/Dockerfile -t $(BACKEND_IMAGE) .
	@echo "✅ Backend Docker image built"

.PHONY: build-frontend-docker
build-frontend-docker: ## Build frontend Docker image
	@echo "🏗️  Building frontend Docker image..."
	docker build -f apps/frontend/Dockerfile -t $(FRONTEND_IMAGE) .
	@echo "✅ Frontend Docker image built"

.PHONY: build-docker-all
build-docker-all: ## Build all Docker images
	@echo "🏗️  Building all Docker images..."
	$(MAKE) build-backend-docker
	$(MAKE) build-frontend-docker
	@echo "✅ All Docker images built"

# Docker Run Commands
.PHONY: run
run: ## Run the container locally
	@echo "🚀 Starting container $(CONTAINER_NAME)..."
	docker run --init -d \
		--name $(CONTAINER_NAME) \
		-p 8080:8080 \
		-e PROXY_API_KEY=${PROXY_API_KEY} \
		-e AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT} \
		-e AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY} \
		-e AZURE_OPENAI_MODEL=${AZURE_OPENAI_MODEL} \
		$(FULL_IMAGE_NAME)
	@echo "✅ Container started. Check logs with: make logs"

.PHONY: run-interactive
run-interactive: ## Run the container interactively
	@echo "🚀 Starting container interactively..."
	docker run --init -it --rm \
		-p 8080:8080 \
		-e PROXY_API_KEY=${PROXY_API_KEY} \
		-e AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT} \
		-e AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY} \
		-e AZURE_OPENAI_MODEL=${AZURE_OPENAI_MODEL} \
		$(FULL_IMAGE_NAME)

.PHONY: run-backend
run-backend: ## Run backend container
	@echo "🚀 Starting backend container..."
	docker run --init -d \
		--name $(CONTAINER_NAME)-backend \
		-p 8080:8080 \
		--env-file .env \
		$(BACKEND_IMAGE)
	@echo "✅ Backend container started"

.PHONY: run-frontend
run-frontend: ## Run frontend container
	@echo "🚀 Starting frontend container..."
	docker run --init -d \
		--name $(CONTAINER_NAME)-frontend \
		-p 3000:80 \
		$(FRONTEND_IMAGE)
	@echo "✅ Frontend container started"

.PHONY: stop
stop: ## Stop the running container
	@echo "🛑 Stopping container $(CONTAINER_NAME)..."
	docker stop $(CONTAINER_NAME) || true
	docker rm $(CONTAINER_NAME) || true
	@echo "✅ Container stopped"

.PHONY: stop-all
stop-all: ## Stop all containers
	@echo "🛑 Stopping all containers..."
	docker stop $(CONTAINER_NAME) $(CONTAINER_NAME)-backend $(CONTAINER_NAME)-frontend || true
	docker rm $(CONTAINER_NAME) $(CONTAINER_NAME)-backend $(CONTAINER_NAME)-frontend || true
	@echo "✅ All containers stopped"

.PHONY: logs
logs: ## Show container logs
	docker logs -f $(CONTAINER_NAME)

.PHONY: logs-backend
logs-backend: ## Show backend container logs
	docker logs -f $(CONTAINER_NAME)-backend

.PHONY: logs-frontend
logs-frontend: ## Show frontend container logs
	docker logs -f $(CONTAINER_NAME)-frontend

.PHONY: shell
shell: ## Get a shell in the running container
	docker exec -it $(CONTAINER_NAME) /bin/sh

.PHONY: shell-backend
shell-backend: ## Get a shell in the backend container
	docker exec -it $(CONTAINER_NAME)-backend /bin/sh

.PHONY: shell-frontend
shell-frontend: ## Get a shell in the frontend container
	docker exec -it $(CONTAINER_NAME)-frontend /bin/sh

# Docker Compose Commands
.PHONY: compose-up
compose-up: ## Start services with docker-compose
	@echo "🚀 Starting services with docker-compose..."
	docker-compose up -d
	@echo "✅ Services started"

.PHONY: compose-down
compose-down: ## Stop services with docker-compose
	@echo "🛑 Stopping services with docker-compose..."
	docker-compose down
	@echo "✅ Services stopped"

.PHONY: compose-logs
compose-logs: ## Show docker-compose logs
	docker-compose logs -f

.PHONY: compose-prod-up
compose-prod-up: ## Start production services with docker-compose
	@echo "🚀 Starting production services..."
	docker-compose -f docker-compose.prod.yml up -d
	@echo "✅ Production services started"

.PHONY: compose-prod-down
compose-prod-down: ## Stop production services
	@echo "🛑 Stopping production services..."
	docker-compose -f docker-compose.prod.yml down
	@echo "✅ Production services stopped"

# Quality and Security Commands
.PHONY: lint
lint: ## Run linting on all packages
	@echo "🔍 Running linting..."
	pnpm lint
	@echo "✅ Linting completed"

.PHONY: lint-fix
lint-fix: ## Fix linting issues
	@echo "🔧 Fixing linting issues..."
	pnpm lint:fix
	@echo "✅ Linting fixes applied"

.PHONY: format
format: ## Format code
	@echo "🎨 Formatting code..."
	pnpm format
	@echo "✅ Code formatted"

.PHONY: type-check
type-check: ## Run TypeScript type checking
	@echo "🔍 Running type checking..."
	pnpm type-check
	@echo "✅ Type checking completed"

.PHONY: security-scan
security-scan: ## Run security scan on the Docker image
	@echo "🔒 Running security scan..."
	./scripts/security-scan.sh $(IMAGE_TAG)

.PHONY: security-check-env
security-check-env: ## Check .env file security configuration
	@echo "🔍 Checking .env file security..."
	./scripts/security-check-env.sh

.PHONY: security-all
security-all: ## Run all security checks
	@echo "🔒 Running all security checks..."
	$(MAKE) security-check-env
	$(MAKE) security-scan
	@echo "✅ All security checks completed"

# Utility Commands
.PHONY: inspect
inspect: ## Inspect the Docker image
	@echo "🔍 Inspecting image $(FULL_IMAGE_NAME)..."
	docker image inspect $(FULL_IMAGE_NAME)

.PHONY: size
size: ## Show image size
	@echo "📏 Image size:"
	docker images $(IMAGE_NAME) --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

.PHONY: test-health
test-health: ## Test the health endpoint
	@echo "🏥 Testing health endpoint..."
	curl -f http://localhost:8080/health || echo "❌ Health check failed"

.PHONY: clean
clean: ## Clean up Docker images and containers
	@echo "🧹 Cleaning up..."
	docker stop $(CONTAINER_NAME) $(CONTAINER_NAME)-backend $(CONTAINER_NAME)-frontend 2>/dev/null || true
	docker rm $(CONTAINER_NAME) $(CONTAINER_NAME)-backend $(CONTAINER_NAME)-frontend 2>/dev/null || true
	docker rmi $(FULL_IMAGE_NAME) $(BACKEND_IMAGE) $(FRONTEND_IMAGE) 2>/dev/null || true
	docker system prune -f
	@echo "✅ Cleanup completed"

.PHONY: clean-build
clean-build: ## Clean build artifacts
	@echo "🧹 Cleaning build artifacts..."
	pnpm build:clean
	@echo "✅ Build artifacts cleaned"

# Production Build Commands
.PHONY: build-production
build-production: ## Build optimized production images with security scanning
	@echo "🏗️  Building production images..."
	./scripts/build/build-production.sh
	@echo "✅ Production build completed"

.PHONY: build-staging
build-staging: ## Build staging images
	@echo "🏗️  Building staging images..."
	BUILD_TARGET=staging ./scripts/build/build-production.sh
	@echo "✅ Staging build completed"

.PHONY: build-cdn
build-cdn: ## Build images optimized for CDN deployment
	@echo "🏗️  Building CDN-optimized images..."
	CDN_URL=$(CDN_URL) ./scripts/build/build-production.sh
	@echo "✅ CDN build completed"

# AWS and Deployment Commands
.PHONY: aws-build
aws-build: ## Build image optimized for AWS App Runner
	@echo "☁️  Building image for AWS App Runner..."
	docker build \
		--platform linux/amd64 \
		--build-arg NODE_ENV=production \
		-t $(FULL_IMAGE_NAME) .
	@echo "✅ AWS-optimized build completed"

.PHONY: deploy-production
deploy-production: ## Deploy to production using Docker Compose
	@echo "🚀 Deploying to production..."
	./scripts/deploy/deploy-production.sh docker-compose
	@echo "✅ Production deployment completed"

.PHONY: deploy-production-cdn
deploy-production-cdn: ## Deploy to production with CDN using Docker Compose
	@echo "🚀 Deploying to production with CDN..."
	./scripts/deploy/deploy-production.sh docker-compose-cdn
	@echo "✅ Production CDN deployment completed"

.PHONY: deploy-kubernetes
deploy-kubernetes: ## Deploy to Kubernetes cluster
	@echo "🚀 Deploying to Kubernetes..."
	./scripts/deploy/deploy-production.sh kubernetes
	@echo "✅ Kubernetes deployment completed"

.PHONY: deploy-aws-app-runner
deploy-aws-app-runner: ## Deploy to AWS App Runner
	@echo "🚀 Deploying to AWS App Runner..."
	./scripts/deploy/deploy-production.sh aws-app-runner
	@echo "✅ AWS App Runner deployment completed"

.PHONY: push
push: ## Push image to registry (requires IMAGE_REGISTRY env var)
	@if [ -z "$(IMAGE_REGISTRY)" ]; then \
		echo "❌ IMAGE_REGISTRY environment variable is required"; \
		exit 1; \
	fi
	@echo "📤 Pushing image to $(IMAGE_REGISTRY)..."
	docker tag $(FULL_IMAGE_NAME) $(IMAGE_REGISTRY)/$(FULL_IMAGE_NAME)
	docker push $(IMAGE_REGISTRY)/$(FULL_IMAGE_NAME)
	@echo "✅ Image pushed successfully"

# Comprehensive Commands
.PHONY: all
all: build security-scan security-check-env ## Build image and run all security checks

.PHONY: validate
validate: ## Run all validation checks
	@echo "✅ Running comprehensive validation..."
	$(MAKE) type-check
	$(MAKE) lint
	$(MAKE) test-all
	$(MAKE) format
	@echo "✅ All validation checks passed"

.PHONY: validate-monorepo
validate-monorepo: ## Validate monorepo structure and configuration
	@echo "🔍 Validating monorepo structure..."
	./scripts/validate-monorepo.sh
	@echo "✅ Monorepo validation completed"

.PHONY: validate-production
validate-production: ## Validate production deployment configuration
	@echo "🔍 Validating production configuration..."
	./scripts/validate/validate-production-config.sh
	@echo "✅ Production validation completed"

.PHONY: ci
ci: ## Run CI pipeline locally
	@echo "🔄 Running CI pipeline..."
	$(MAKE) validate-monorepo
	$(MAKE) install
	$(MAKE) build-all
	$(MAKE) validate
	$(MAKE) build
	$(MAKE) security-all
	@echo "✅ CI pipeline completed"