.DEFAULT_GOAL := help

COMPOSE ?= docker compose
DEVOPS_COMPOSE ?= docker compose -f docker-compose.devops.yml
DOCKER ?= docker
ACTIONLINT_IMAGE ?= rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667

.PHONY: help application build test backend-test frontend-test ci-lint up down status logs \
	quality-config quality-up quality-down quality-status quality-logs quality-reset \
	sonar sonar-backend sonar-frontend

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

ci-lint: ## Validate GitHub Actions workflows
	$(DOCKER) run --rm -v "$(CURDIR):/repo" -w /repo $(ACTIONLINT_IMAGE) -color

up: ## Start the complete stack in the background
	$(COMPOSE) up -d

down: ## Stop the stack while preserving named volumes
	$(COMPOSE) down

status: ## Show container and health status
	$(COMPOSE) ps

logs: ## Follow the latest service logs
	$(COMPOSE) logs --follow --tail=200

quality-config: ## Validate the SonarQube Compose profile
	$(DEVOPS_COMPOSE) --profile quality config --quiet

quality-up: ## Start SonarQube and its PostgreSQL database
	$(DEVOPS_COMPOSE) --profile quality up -d --wait

quality-down: ## Stop SonarQube while preserving quality data
	$(DEVOPS_COMPOSE) --profile quality down

quality-status: ## Show SonarQube container and health status
	$(DEVOPS_COMPOSE) --profile quality ps

quality-logs: ## Follow SonarQube and database logs
	$(DEVOPS_COMPOSE) --profile quality logs --follow --tail=200

quality-reset: ## Delete the local SonarQube stack and its volumes
	$(DEVOPS_COMPOSE) --profile quality down --volumes

sonar: sonar-backend sonar-frontend ## Analyze backend and frontend with SonarQube

sonar-backend: ## Verify and analyze the backend with SonarQube
	cd backend && ./mvnw clean verify org.sonarsource.scanner.maven:sonar-maven-plugin:5.5.0.6356:sonar

sonar-frontend: ## Verify and analyze the frontend with SonarQube
	cd frontend && npm ci && npm run lint && npm run test:ci && npm run build && SONAR_SCANNER_JAVA_EXE_PATH="$$JAVA_HOME/bin/java" npm run sonar
