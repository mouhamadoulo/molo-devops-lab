.DEFAULT_GOAL := help

COMPOSE ?= docker compose

.PHONY: help application build test backend-test frontend-test up down status logs

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

application: build up ## Build and start the complete application

build: ## Build the backend and frontend images
	$(COMPOSE) build --pull

test: backend-test frontend-test ## Run backend and frontend validations

backend-test: ## Run the complete Maven verification
	cd backend && ./mvnw clean verify

frontend-test: ## Install, lint, test and build the frontend
	cd frontend && npm ci && npm run lint && npm run test:ci && npm run build

up: ## Start the complete stack in the background
	$(COMPOSE) up -d

down: ## Stop the stack while preserving named volumes
	$(COMPOSE) down

status: ## Show container and health status
	$(COMPOSE) ps

logs: ## Follow the latest service logs
	$(COMPOSE) logs --follow --tail=200
