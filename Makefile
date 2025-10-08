# Makefile for Claude-to-Azure Proxy Docker operations

# Variables
IMAGE_NAME := claude-to-azure-proxy
IMAGE_TAG := latest
FULL_IMAGE_NAME := $(IMAGE_NAME):$(IMAGE_TAG)
CONTAINER_NAME := claude-proxy-container

# Default target
.PHONY: help
help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build the Docker image
	@echo "🏗️  Building Docker image $(FULL_IMAGE_NAME)..."
	docker build -t $(FULL_IMAGE_NAME) .
	@echo "✅ Build completed"

.PHONY: build-no-cache
build-no-cache: ## Build the Docker image without cache
	@echo "🏗️  Building Docker image $(FULL_IMAGE_NAME) without cache..."
	docker build --no-cache -t $(FULL_IMAGE_NAME) .
	@echo "✅ Build completed"

.PHONY: run
run: ## Run the container locally
	@echo "🚀 Starting container $(CONTAINER_NAME)..."
	docker run -d \
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
	docker run -it --rm \
		-p 8080:8080 \
		-e PROXY_API_KEY=${PROXY_API_KEY} \
		-e AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT} \
		-e AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY} \
		-e AZURE_OPENAI_MODEL=${AZURE_OPENAI_MODEL} \
		$(FULL_IMAGE_NAME)

.PHONY: stop
stop: ## Stop the running container
	@echo "🛑 Stopping container $(CONTAINER_NAME)..."
	docker stop $(CONTAINER_NAME) || true
	docker rm $(CONTAINER_NAME) || true
	@echo "✅ Container stopped"

.PHONY: logs
logs: ## Show container logs
	docker logs -f $(CONTAINER_NAME)

.PHONY: shell
shell: ## Get a shell in the running container
	docker exec -it $(CONTAINER_NAME) /bin/sh

.PHONY: inspect
inspect: ## Inspect the Docker image
	@echo "🔍 Inspecting image $(FULL_IMAGE_NAME)..."
	docker image inspect $(FULL_IMAGE_NAME)

.PHONY: size
size: ## Show image size
	@echo "📏 Image size:"
	docker images $(IMAGE_NAME) --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

.PHONY: security-scan
security-scan: ## Run security scan on the Docker image
	@echo "🔒 Running security scan..."
	./scripts/security-scan.sh $(IMAGE_TAG)

.PHONY: security-check-env
security-check-env: ## Check .env file security configuration
	@echo "🔍 Checking .env file security..."
	./scripts/security-check-env.sh

.PHONY: test-health
test-health: ## Test the health endpoint
	@echo "🏥 Testing health endpoint..."
	curl -f http://localhost:8080/health || echo "❌ Health check failed"

.PHONY: clean
clean: ## Clean up Docker images and containers
	@echo "🧹 Cleaning up..."
	docker stop $(CONTAINER_NAME) 2>/dev/null || true
	docker rm $(CONTAINER_NAME) 2>/dev/null || true
	docker rmi $(FULL_IMAGE_NAME) 2>/dev/null || true
	docker system prune -f
	@echo "✅ Cleanup completed"

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

.PHONY: aws-build
aws-build: ## Build image optimized for AWS App Runner
	@echo "☁️  Building image for AWS App Runner..."
	docker build \
		--platform linux/amd64 \
		--build-arg NODE_ENV=production \
		-t $(FULL_IMAGE_NAME) .
	@echo "✅ AWS-optimized build completed"

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

.PHONY: all
all: build security-scan security-check-env ## Build image and run all security checks

# Development targets
.PHONY: dev-setup
dev-setup: ## Set up development environment
	@echo "🛠️  Setting up development environment..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "📝 Created .env file from .env.example"; \
		echo "⚠️  Please update .env with your actual values"; \
	fi
	@echo "✅ Development setup completed"