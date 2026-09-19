.DEFAULT_GOAL := help

COMPOSE ?= docker compose
DEVOPS_COMPOSE ?= docker compose -f docker-compose.devops.yml
DOCKER ?= docker
MAVEN ?= ./mvnw
ACTIONLINT_IMAGE ?= rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
MAVEN_IMAGE ?= maven:3.9.16-eclipse-temurin-25@sha256:31618505df21177d2baa3dc574be2d0b0b32614c8539baca1f23a9136b766eb0
TRIVY_IMAGE ?= ghcr.io/aquasecurity/trivy:0.73.0@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c
COSIGN_IMAGE ?= gcr.io/projectsigstore/cosign:v3.1.3@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8
PROMETHEUS_IMAGE ?= prom/prometheus:v3.14.0-distroless@sha256:50c707e96da5ade383cb1707790576480485e93de06aa60ad8802cb5f744bd0a
LOKI_IMAGE ?= grafana/loki:3.7.7@sha256:d70e4659623f3e109af669cae76fe2a5dd5be54e2298fe8aed380d982fbc2500
ALLOY_IMAGE ?= grafana/alloy:v1.19.2@sha256:b8ec653c44235fbe910879145dac3597d66b0aaecf60bcbbe82580767771a839
OBSERVABILITY_SERVICES ?= prometheus grafana socket-proxy loki alloy
KUBECTL ?= kubectl
K8S_CONTEXT ?= docker-desktop
K8S_NODE ?= desktop-control-plane
K8S_NAMESPACE ?= devops-store
K8S_MANIFESTS ?= infrastructure/kubernetes
K8S_WORKLOADS ?= $(K8S_MANIFESTS)/postgres $(K8S_MANIFESTS)/object-storage \
	$(K8S_MANIFESTS)/backend $(K8S_MANIFESTS)/frontend
K8S_NAMESPACE_FILE ?= $(K8S_MANIFESTS)/namespace.yaml
K8S_APPLY_FLAGS = $(addprefix -f ,$(K8S_NAMESPACE_FILE) $(K8S_WORKLOADS))
K8S_WORKLOAD_FLAGS = $(addprefix -f ,$(K8S_WORKLOADS))
K8S_FRONTEND_PORT ?= 8088
K8S_STORAGE_PORT ?= 9000
TRIVY_CACHE_DIR ?= $(CURDIR)/.trivycache
SECURITY_REPORTS_DIR ?= $(CURDIR)/reports/security
MAVEN_CACHE_DIR ?= $(CURDIR)/.m2
MAVEN_REPOSITORY_DIR ?= $(MAVEN_CACHE_DIR)/repository
TRIVY_SKIP_DIRS := --skip-dirs backend/target --skip-dirs frontend/node_modules \
	--skip-dirs frontend/dist --skip-dirs frontend/coverage --skip-dirs .m2 \
	--skip-dirs reports/security
MAVEN_CACHE_RUN = $(DOCKER) run --rm \
	-v "$(CURDIR)/backend/pom.xml:/workspace/pom.xml:ro" \
	-v "$(MAVEN_CACHE_DIR):/root/.m2" \
	-w /workspace $(MAVEN_IMAGE)
TRIVY_REPOSITORY_RUN = $(DOCKER) run --rm \
	-v "$(CURDIR):/workspace:ro" \
	-v "$(TRIVY_CACHE_DIR):/root/.cache/trivy" \
	-v "$(MAVEN_REPOSITORY_DIR):/root/.m2/repository:ro" \
	-v "$(SECURITY_REPORTS_DIR):/reports" \
	-w /workspace $(TRIVY_IMAGE)
TRIVY_IMAGE_RUN = $(DOCKER) run --rm \
	-v "$(CURDIR):/workspace:ro" \
	-v "$(TRIVY_CACHE_DIR):/root/.cache/trivy" \
	-v "$(SECURITY_REPORTS_DIR):/reports" \
	-v /var/run/docker.sock:/var/run/docker.sock \
	-w /workspace $(TRIVY_IMAGE)

.PHONY: help application build test backend-test frontend-test ci-lint up down status logs \
	quality-config quality-up quality-down quality-status quality-logs quality-reset \
	observability-config observability-up observability-down observability-status \
	observability-logs observability-reset \
	artifacts-config artifacts-up artifacts-down artifacts-status artifacts-logs artifacts-reset \
	artifacts-bootstrap artifacts-verify artifacts-publish-snapshot artifacts-publish-candidate \
	artifacts-promote artifacts-resolve \
	registry-config registry-up registry-down registry-status registry-logs registry-reset \
	sonar sonar-backend sonar-frontend \
	trivy-verify trivy-prepare-maven trivy-fs trivy-config trivy-image-backend trivy-image-frontend \
	trivy-images security \
	k8s-cluster k8s-config k8s-images k8s-secrets k8s-deploy k8s-rollout k8s-status \
	k8s-forward k8s-logs k8s-delete k8s-reset

help: ## Show available commands
	$(info Usage: make [target])
	$(info )
	$(info Targets:)
	$(info   application       Build and start the complete application)
	$(info   build             Build the backend and frontend images)
	$(info   test              Run backend and frontend validations)
	$(info   backend-test      Run the complete Maven verification)
	$(info   frontend-test     Install, lint, test and build the frontend)
	$(info   ci-lint           Validate GitHub Actions workflows)
	$(info   trivy-verify      Verify the pinned Trivy image signature and version)
	$(info   trivy-fs          Scan repository dependencies, misconfigurations and secrets)
	$(info   trivy-config      Scan Dockerfiles and supported current or future IaC files)
	$(info   trivy-images      Scan both local runtime images)
	$(info   security          Run the complete local security gate)
	$(info   up                Start the complete stack in the background)
	$(info   down              Stop the stack while preserving named volumes)
	$(info   status            Show container and health status)
	$(info   logs              Follow the latest service logs)
	$(info   quality-config    Validate the SonarQube Compose profile)
	$(info   quality-up        Start SonarQube and its PostgreSQL database)
	$(info   quality-down      Stop SonarQube while preserving quality data)
	$(info   quality-status    Show SonarQube container and health status)
	$(info   quality-logs      Follow SonarQube and database logs)
	$(info   quality-reset     Delete the local SonarQube stack and its volumes)
	$(info   observability-config Validate Prometheus, Loki, Alloy and the Compose profile)
	$(info   observability-up  Start the application, Prometheus, Grafana, Loki and Alloy)
	$(info   observability-down Stop observability while preserving its data)
	$(info   observability-status Show observability container health)
	$(info   observability-logs Follow observability logs)
	$(info   observability-reset Delete only Prometheus, Grafana, Loki and Alloy data)
	$(info   artifacts-config  Validate the Artifactory OSS Compose profile)
	$(info   artifacts-up      Start Artifactory OSS and its PostgreSQL database)
	$(info   artifacts-down    Stop Artifactory while preserving artifact data)
	$(info   artifacts-status  Show Artifactory and database health)
	$(info   artifacts-logs    Follow Artifactory and database logs)
	$(info   artifacts-reset   Delete the local Artifactory stack and its volumes)
	$(info   artifacts-verify  Verify presence of the five Maven repository keys created in the OSS UI)
	$(info   artifacts-bootstrap Alias for artifacts-verify)
	$(info   artifacts-publish-snapshot Publish VERSION=X.Y.Z-SNAPSHOT to Artifactory)
	$(info   artifacts-publish-candidate Publish VERSION=X.Y.Z as a release candidate)
	$(info   artifacts-promote Promote candidate VERSION=X.Y.Z without overwrite)
	$(info   artifacts-resolve Resolve VERSION through the Maven virtual with a fresh cache)
	$(info   registry-config   Validate the optional JCR Compose profile)
	$(info   registry-up       Start JCR and its PostgreSQL database)
	$(info   registry-down     Stop JCR while preserving registry data)
	$(info   registry-status   Show JCR and database health)
	$(info   registry-logs     Follow JCR and database logs)
	$(info   registry-reset    Delete the local JCR stack and its volumes)
	$(info   sonar             Analyze backend and frontend with SonarQube)
	$(info   sonar-backend     Verify and analyze the backend with SonarQube)
	$(info   sonar-frontend    Verify and analyze the frontend with SonarQube)
	$(info   k8s-cluster       Verify the local Docker Desktop Kubernetes cluster)
	$(info   k8s-config        Validate the Kubernetes manifests)
	$(info   k8s-images        Build and load the application images into the cluster)
	$(info   k8s-secrets       Create the cluster secrets from the current environment)
	$(info   k8s-deploy        Apply every Kubernetes manifest)
	$(info   k8s-rollout       Wait until every workload is ready)
	$(info   k8s-status        Show pods, services, workloads and volumes)
	$(info   k8s-forward       Forward the frontend and object storage ports)
	$(info   k8s-logs          Follow the backend logs)
	$(info   k8s-delete        Delete the workloads and keep the volumes)
	$(info   k8s-reset         Delete the namespace and its volumes)

application: build up ## Build and start the complete application

build: ## Build the backend and frontend images
	$(COMPOSE) build --pull

test: backend-test frontend-test ## Run backend and frontend validations

backend-test: ## Run the complete Maven verification
	cd backend && $(MAVEN) clean verify

frontend-test: ## Install, lint, test and build the frontend
	cd frontend && npm ci && npm run lint && npm run test:ci && npm run build

ci-lint: ## Validate GitHub Actions workflows
	$(DOCKER) run --rm -v "$(CURDIR):/repo" -w /repo $(ACTIONLINT_IMAGE) -color

trivy-verify: ## Verify the pinned Trivy image signature and version
	$(DOCKER) run --rm $(COSIGN_IMAGE) verify $(TRIVY_IMAGE) \
		--certificate-identity-regexp 'https://github\.com/aquasecurity/trivy/\.github/workflows/.+' \
		--certificate-oidc-issuer 'https://token.actions.githubusercontent.com'
	$(DOCKER) run --rm --entrypoint /bin/sh $(TRIVY_IMAGE) \
		-c "trivy --version | grep -F 'Version: 0.73.0'"

trivy-prepare-maven:
	$(MAVEN_CACHE_RUN) mvn -B -DskipTests dependency:resolve

trivy-fs: trivy-prepare-maven ## Scan repository dependencies, misconfigurations and secrets
	$(TRIVY_REPOSITORY_RUN) fs --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--scanners vuln,misconfig,secret --format table --exit-code 0 \
		--output /reports/filesystem.txt .
	$(TRIVY_REPOSITORY_RUN) fs --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--scanners vuln,misconfig,secret --format sarif --exit-code 0 \
		--output /reports/filesystem.sarif .
	$(TRIVY_REPOSITORY_RUN) fs --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--scanners vuln,misconfig,secret --format table --exit-code 1 .

trivy-config: ## Scan Dockerfiles and supported current or future IaC files
	$(TRIVY_REPOSITORY_RUN) config --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--format table --exit-code 0 --output /reports/config.txt .
	$(TRIVY_REPOSITORY_RUN) config --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--format sarif --exit-code 0 --output /reports/config.sarif .
	$(TRIVY_REPOSITORY_RUN) config --config trivy.yaml $(TRIVY_SKIP_DIRS) \
		--format table --exit-code 1 .

trivy-image-backend: ## Scan the local backend runtime image
	$(DOCKER) image inspect --format "{{.Id}}" devops-store-backend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format table --exit-code 0 --output /reports/image-backend.txt \
		devops-store-backend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format sarif --exit-code 0 --output /reports/image-backend.sarif \
		devops-store-backend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format table --exit-code 1 devops-store-backend:local

trivy-image-frontend: ## Scan the local frontend runtime image
	$(DOCKER) image inspect --format "{{.Id}}" devops-store-frontend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format table --exit-code 0 --output /reports/image-frontend.txt \
		devops-store-frontend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format sarif --exit-code 0 --output /reports/image-frontend.sarif \
		devops-store-frontend:local
	$(TRIVY_IMAGE_RUN) image --config trivy.yaml --scanners vuln,misconfig,secret \
		--format table --exit-code 1 devops-store-frontend:local

trivy-images: trivy-image-backend trivy-image-frontend ## Scan both local runtime images

security: ## Verify Trivy, scan repository/IaC, build and scan both images
	$(MAKE) trivy-verify
	$(MAKE) trivy-fs
	$(MAKE) trivy-config
	$(MAKE) build
	$(MAKE) trivy-images

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

observability-config: ## Validate Prometheus, Loki, Alloy and the observability Compose profile
	$(COMPOSE) config --quiet
	$(DEVOPS_COMPOSE) --profile observability config --quiet
	$(DOCKER) run --rm \
		-v "$(CURDIR)/infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
		--entrypoint /bin/promtool $(PROMETHEUS_IMAGE) \
		check config /etc/prometheus/prometheus.yml
	$(DOCKER) run --rm \
		-v "$(CURDIR)/infrastructure/loki/loki-config.yml:/etc/loki/loki-config.yml:ro" \
		--entrypoint /usr/bin/loki $(LOKI_IMAGE) \
		-config.file=/etc/loki/loki-config.yml -verify-config
	$(DOCKER) run --rm \
		-v "$(CURDIR)/infrastructure/alloy/config.alloy:/etc/alloy/config.alloy:ro" \
		--entrypoint /bin/alloy $(ALLOY_IMAGE) \
		validate /etc/alloy/config.alloy

observability-up: ## Start the application, Prometheus, Grafana, Loki and Alloy
	$(MAKE) application
	$(DEVOPS_COMPOSE) --profile observability up -d --wait $(OBSERVABILITY_SERVICES)

observability-down: ## Stop observability while preserving its data
	$(DEVOPS_COMPOSE) --profile observability stop alloy loki socket-proxy grafana prometheus
	$(DEVOPS_COMPOSE) --profile observability rm -f alloy loki socket-proxy grafana prometheus

observability-status: ## Show observability container health
	$(DEVOPS_COMPOSE) --profile observability ps $(OBSERVABILITY_SERVICES)

observability-logs: ## Follow observability logs
	$(DEVOPS_COMPOSE) --profile observability logs --follow --tail=200 $(OBSERVABILITY_SERVICES)

observability-reset: observability-down ## Delete only Prometheus, Grafana, Loki and Alloy local data
	@for volume in devops-store-prometheus-data devops-store-grafana-data devops-store-loki-data devops-store-alloy-data; do \
		if $(DOCKER) volume inspect "$$volume" >/dev/null 2>&1; then \
			$(DOCKER) volume rm "$$volume"; \
		fi; \
	done

artifacts-config: ## Validate the Artifactory OSS Compose profile
	$(DEVOPS_COMPOSE) --profile artifacts config --quiet

artifacts-up: ## Start Artifactory OSS and its PostgreSQL database
	$(DEVOPS_COMPOSE) --profile artifacts up -d --wait

artifacts-down: ## Stop Artifactory while preserving artifact data
	$(DEVOPS_COMPOSE) --profile artifacts down

artifacts-status: ## Show Artifactory and database health
	$(DEVOPS_COMPOSE) --profile artifacts ps

artifacts-logs: ## Follow Artifactory and database logs
	$(DEVOPS_COMPOSE) --profile artifacts logs --follow --tail=200

artifacts-reset: ## Delete the local Artifactory stack and its volumes
	$(DEVOPS_COMPOSE) --profile artifacts down --volumes

artifacts-bootstrap: artifacts-verify ## Alias for artifacts-verify

artifacts-verify: ## Verify presence of the five Maven repository keys created in the OSS UI
	$(DEVOPS_COMPOSE) --profile artifacts --profile artifacts-tools run --rm artifactory-bootstrap

artifacts-publish-snapshot: ## Publish VERSION=X.Y.Z-SNAPSHOT to Artifactory
	@test -n "$(VERSION)" || { echo "VERSION=X.Y.Z-SNAPSHOT is required" >&2; exit 1; }
	@echo "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+-SNAPSHOT$$' || { echo "VERSION must match X.Y.Z-SNAPSHOT" >&2; exit 1; }
	cd backend && $(MAVEN) -B -s ../infrastructure/jfrog/settings.xml.example -Drevision=$(VERSION) deploy

artifacts-publish-candidate: ## Publish VERSION=X.Y.Z as a release candidate
	@test -n "$(VERSION)" || { echo "VERSION=X.Y.Z is required" >&2; exit 1; }
	@echo "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' || { echo "VERSION must match X.Y.Z" >&2; exit 1; }
	cd backend && $(MAVEN) -B -s ../infrastructure/jfrog/settings.xml.example -Drevision=$(VERSION) deploy

artifacts-promote: ## Promote candidate VERSION=X.Y.Z without overwrite
	@test -n "$(VERSION)" || { echo "VERSION=X.Y.Z is required" >&2; exit 1; }
	VERSION=$(VERSION) $(DEVOPS_COMPOSE) --profile artifacts --profile artifacts-tools run --rm artifactory-promote

artifacts-resolve: ## Resolve VERSION through the Maven virtual with a fresh cache
	@test -n "$(VERSION)" || { echo "VERSION=X.Y.Z or X.Y.Z-SNAPSHOT is required" >&2; exit 1; }
	VERSION=$(VERSION) $(DEVOPS_COMPOSE) --profile artifacts --profile artifacts-tools run --rm artifactory-resolve

registry-config: ## Validate the optional JCR Compose profile
	$(DEVOPS_COMPOSE) --profile registry config --quiet

registry-up: ## Start JCR and its PostgreSQL database
	$(DEVOPS_COMPOSE) --profile registry up -d --wait

registry-down: ## Stop JCR while preserving registry data
	$(DEVOPS_COMPOSE) --profile registry down

registry-status: ## Show JCR and database health
	$(DEVOPS_COMPOSE) --profile registry ps

registry-logs: ## Follow JCR and database logs
	$(DEVOPS_COMPOSE) --profile registry logs --follow --tail=200

registry-reset: ## Delete the local JCR stack and its volumes
	$(DEVOPS_COMPOSE) --profile registry down --volumes

sonar: sonar-backend sonar-frontend ## Analyze backend and frontend with SonarQube

sonar-backend: ## Verify and analyze the backend with SonarQube
	cd backend && $(MAVEN) clean verify org.sonarsource.scanner.maven:sonar-maven-plugin:5.8.0.7211:sonar

sonar-frontend: ## Verify and analyze the frontend with SonarQube
	cd frontend && npm ci && npm run lint && npm run test:ci && npm run build && SONAR_SCANNER_JAVA_EXE_PATH="$$JAVA_HOME/bin/java" npm run sonar

k8s-cluster: ## Verify the local Docker Desktop Kubernetes cluster
	$(KUBECTL) config use-context $(K8S_CONTEXT)
	$(KUBECTL) wait --for=condition=Ready node --all --timeout=180s

k8s-config: ## Validate the Kubernetes manifests
	$(KUBECTL) apply --dry-run=client -R $(K8S_APPLY_FLAGS)
	$(KUBECTL) apply -f $(K8S_NAMESPACE_FILE)
	$(KUBECTL) apply --dry-run=server -R $(K8S_APPLY_FLAGS)

k8s-images: ## Build and load the application images into the cluster
	$(MAKE) build
	$(DOCKER) save devops-store-backend:local | $(DOCKER) exec -i $(K8S_NODE) ctr -n k8s.io images import -
	$(DOCKER) save devops-store-frontend:local | $(DOCKER) exec -i $(K8S_NODE) ctr -n k8s.io images import -

k8s-secrets: ## Create the cluster secrets from the current environment
	@test -n "$$DB_PASSWORD" || { echo "DB_PASSWORD is required"; exit 1; }
	@test -n "$$JWT_SECRET" || { echo "JWT_SECRET is required"; exit 1; }
	@test -n "$$BOOTSTRAP_ADMIN_PASSWORD" || { echo "BOOTSTRAP_ADMIN_PASSWORD is required"; exit 1; }
	@test -n "$$MINIO_SECRET_KEY" || { echo "MINIO_SECRET_KEY is required"; exit 1; }
	@test -n "$$MINIO_LICENSE_FILE" || { echo "MINIO_LICENSE_FILE is required"; exit 1; }
	$(KUBECTL) apply -f $(K8S_NAMESPACE_FILE)
	$(KUBECTL) create secret generic postgres-credentials -n $(K8S_NAMESPACE) \
		--from-literal=POSTGRES_PASSWORD="$$DB_PASSWORD" \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -
	$(KUBECTL) create secret generic object-storage-credentials -n $(K8S_NAMESPACE) \
		--from-literal=MINIO_ROOT_PASSWORD="$$MINIO_SECRET_KEY" \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -
	$(KUBECTL) create secret generic object-storage-license -n $(K8S_NAMESPACE) \
		--from-file=minio.license="$$MINIO_LICENSE_FILE" \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -
	$(KUBECTL) create secret generic backend-credentials -n $(K8S_NAMESPACE) \
		--from-literal=DB_PASSWORD="$$DB_PASSWORD" \
		--from-literal=JWT_SECRET="$$JWT_SECRET" \
		--from-literal=BOOTSTRAP_ADMIN_PASSWORD="$$BOOTSTRAP_ADMIN_PASSWORD" \
		--from-literal=MINIO_SECRET_KEY="$$MINIO_SECRET_KEY" \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -

k8s-deploy: ## Apply every Kubernetes manifest
	$(KUBECTL) apply -R $(K8S_APPLY_FLAGS)

k8s-rollout: ## Wait until every workload is ready
	$(KUBECTL) rollout status statefulset/postgres -n $(K8S_NAMESPACE) --timeout=180s
	$(KUBECTL) rollout status statefulset/object-storage -n $(K8S_NAMESPACE) --timeout=180s
	$(KUBECTL) rollout status deployment/backend -n $(K8S_NAMESPACE) --timeout=240s
	$(KUBECTL) rollout status deployment/frontend -n $(K8S_NAMESPACE) --timeout=120s

k8s-status: ## Show pods, services, workloads and volumes
	$(KUBECTL) get pods,svc,deployments,statefulsets,pvc -n $(K8S_NAMESPACE)

k8s-forward: ## Forward the frontend and object storage ports
	$(KUBECTL) port-forward -n $(K8S_NAMESPACE) service/object-storage $(K8S_STORAGE_PORT):9000 & \
	$(KUBECTL) port-forward -n $(K8S_NAMESPACE) service/frontend $(K8S_FRONTEND_PORT):8080

k8s-logs: ## Follow the backend logs
	$(KUBECTL) logs -n $(K8S_NAMESPACE) deployment/backend --follow --tail=200

k8s-delete: ## Delete the workloads and keep the volumes
	$(KUBECTL) delete -R $(K8S_WORKLOAD_FLAGS) --ignore-not-found

k8s-reset: ## Delete the namespace and its volumes
	$(KUBECTL) delete namespace $(K8S_NAMESPACE) --ignore-not-found
