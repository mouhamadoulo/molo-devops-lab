# Prometheus and Grafana Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la phase 11 avec un scrape Prometheus sécurisé sur le port management interne du backend et un dashboard Grafana entièrement provisionné.

**Architecture:** L'application et le profil DevOps restent deux projets Compose séparés, reliés par le réseau Docker nommé `devops-store-observability`. Prometheus scrape `backend:8081`, stocke sept jours au plus et alimente Grafana sur un réseau privé ; datasource, provider et dashboard sont versionnés et montés en lecture seule.

**Tech Stack:** Java 25, Spring Boot 4.1.0, Spring Security, Micrometer Prometheus, Docker Compose 5.1, Prometheus 3.12.0 distroless, Grafana OSS 13.1.0, GNU Make et PowerShell.

**Spec:** `docs/superpowers/specs/2026-08-31-prometheus-grafana-observability-design.md`

## Global Constraints

- Utiliser `prom/prometheus:v3.12.0-distroless@sha256:f39df5334dee301b885f77e0ff1159f5d8a43bf9db518f885544594799a1e3c2`.
- Utiliser `grafana/grafana:13.1.0@sha256:121a7a9ece6dc10b969f1f96eed64b4f07dfac0d0b8abc070f7cb83bbde86f63`.
- Garder l'API sur `8080`; exposer Actuator sur `8081` uniquement dans Compose et ne jamais publier ce port sur l'hôte.
- Autoriser le scrape anonyme seulement lorsque `ManagementPortType.DIFFERENT`; préserver health public et Prometheus authentifié en mode monoport.
- Utiliser le réseau partagé `devops-store-observability`; ne pas utiliser `host.docker.internal`.
- Publier Prometheus et Grafana uniquement sur `127.0.0.1`.
- Exiger `GRAFANA_ADMIN_PASSWORD` sans valeur par défaut et ne versionner aucun secret réel.
- Borner Prometheus à `7d` et `1GB` et conserver les données dans des volumes nommés.
- Monter toutes les configurations Prometheus/Grafana et le dashboard en lecture seule.
- Ne pas ajouter Loki, Alloy, Alertmanager, exporters supplémentaires ou manifests Kubernetes dans cette phase.
- Ne jamais annoncer un test Docker, un healthcheck ou une acceptance comme réussi sans sortie réelle correspondante.
- Ne créer aucun commit ni push sans autorisation explicite. Chaque étape de commit ci-dessous est conditionnelle à cette autorisation.
- À l'exécution, utiliser `superpowers:using-git-worktrees` avant toute modification. La spécification et ce plan étant initialement non suivis, les recréer dans le worktree ou les committer uniquement après autorisation.

## File Map

| Fichier | Responsabilité |
|---|---|
| `backend/src/main/java/com/molo/devopsstore/identity/infrastructure/SecurityConfig.java` | Chaînes de sécurité application et management conditionnel |
| `backend/src/test/java/com/molo/devopsstore/identity/infrastructure/ManagementPortSecurityIntegrationTest.java` | Contrat réel du port Actuator séparé |
| `backend/src/main/resources/application.yml` | Histogramme HTTP Micrometer |
| `backend/src/test/java/com/molo/devopsstore/product/api/ProductApiIntegrationTest.java` | Présence des buckets Prometheus et compteur métier |
| `docker-compose.yml` | Port management backend et réseau partagé détenu par l'application |
| `docker-compose.devops.yml` | Services, réseaux, volumes et protections Prometheus/Grafana |
| `infrastructure/prometheus/prometheus.yml` | Scrape, labels et intervalles Prometheus |
| `infrastructure/grafana/provisioning/datasources/prometheus.yml` | Datasource Prometheus à UID stable |
| `infrastructure/grafana/provisioning/dashboards/dashboards.yml` | Provider de dashboard en lecture seule |
| `infrastructure/grafana/dashboards/backend-overview.json` | Dashboard backend versionné |
| `.env.example` | Ports locaux et nom du secret Grafana |
| `Makefile` | Validation, démarrage, arrêt, statut, logs et reset ciblé |
| `docs/observability/prometheus.md` | Exploitation, PromQL, trafic et diagnostic de scrape |
| `docs/observability/grafana.md` | Provisioning, accès, panels, persistance et diagnostic |
| `README.md` | État réel, URLs, commandes et lien vers les guides |
| `docs/README.md` | Index des guides rendus disponibles |
| `AGENTS.md` | Stack, variables et commandes réellement disponibles |
| `docs/IMPLEMENTATION_PLAN.md` | Cases et preuves réelles de la phase 11 |

---

### Task 0: Baseline et espace d'exécution

**Files:**
- Read: `docs/superpowers/specs/2026-08-31-prometheus-grafana-observability-design.md`
- Read: `docs/superpowers/plans/2026-08-31-prometheus-grafana-observability.md`
- No production files modified.

**Interfaces:**
- Consumes: dépôt `main`, Docker Desktop, Docker Compose, Java 25 et GNU Make.
- Produces: workspace isolé et baseline attribuable.

- [x] **Step 1: Préparer l'espace isolé**

Utiliser `superpowers:using-git-worktrees`, puis exécuter :

```powershell
git branch --show-current
git status -sb
git worktree list
```

Expected: worktree et branche connus ; seuls la spécification et le plan de phase 11 sont nouveaux.

- [ ] **Step 2: Vérifier les outils**

```powershell
java --version
docker version
docker compose version
make --version
```

Expected: Java 25, moteur Docker, Compose 5.x et GNU Make répondent.

- [x] **Step 3: Vérifier la baseline backend ciblée**

Depuis `backend/` :

```powershell
.\mvnw.cmd -Dtest=SecurityConfigTest,ProductApiIntegrationTest test
```

Expected: tests existants verts. Un échec de baseline arrête l'implémentation et est soumis à l'utilisateur.

- [x] **Step 4: Vérifier la configuration Compose existante**

Avec les variables locales requises déjà conservées hors Git :

```powershell
docker compose config --quiet
docker compose -f docker-compose.devops.yml --profile quality config --quiet
```

Expected: les deux configurations existantes sont valides avant modification.

---

### Task 1: Sécurité conditionnelle du port management

**Files:**
- Create: `backend/src/test/java/com/molo/devopsstore/identity/infrastructure/ManagementPortSecurityIntegrationTest.java`
- Modify: `backend/src/main/java/com/molo/devopsstore/identity/infrastructure/SecurityConfig.java`

**Interfaces:**
- Consumes: `ManagementPortType.DIFFERENT`, `EndpointRequest` et les endpoints exposés `health,info,prometheus`.
- Produces: `managementSecurityFilterChain(HttpSecurity)` prioritaire et contrat monoport inchangé.

- [x] **Step 1: Écrire le test rouge du scrape sans Bearer sur port séparé**

Create `ManagementPortSecurityIntegrationTest.java`:

```java
package com.molo.devopsstore.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@ActiveProfiles("test")
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "management.server.port=0")
class ManagementPortSecurityIntegrationTest {

    @Container
    static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(DockerImageName.parse("postgres:18.4-alpine"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @LocalManagementPort
    private int managementPort;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Test
    void exposesPrometheusWithoutABearerOnASeparateManagementPort() throws Exception {
        var response = httpClient.send(
                HttpRequest.newBuilder(uri("/actuator/prometheus")).GET().build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("products_created_events_total");
    }

    @Test
    void keepsHealthPublicOnASeparateManagementPort() throws Exception {
        var response = httpClient.send(
                HttpRequest.newBuilder(uri("/actuator/health")).GET().build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"status\":\"UP\"");
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + managementPort + path);
    }
}
```

- [x] **Step 2: Vérifier le RED**

```powershell
.\mvnw.cmd -Dtest=ManagementPortSecurityIntegrationTest test
```

Expected: FAIL sur `exposesPrometheusWithoutABearerOnASeparateManagementPort`, statut actuel `401` au lieu de `200`; health reste vert.

- [x] **Step 3: Ajouter la chaîne management minimale**

Ajouter les imports :

```java
import org.springframework.boot.actuate.autoconfigure.web.server.ConditionalOnManagementPort;
import org.springframework.boot.actuate.autoconfigure.web.server.ManagementPortType;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.core.annotation.Order;
```

Ajouter avant la chaîne existante :

```java
    @Bean
    @Order(1)
    @ConditionalOnManagementPort(ManagementPortType.DIFFERENT)
    SecurityFilterChain managementSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                .securityMatcher(EndpointRequest.toAnyEndpoint())
                .cors(AbstractHttpConfigurer::disable)
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(EndpointRequest.to("health", "prometheus")).permitAll()
                        .anyRequest().denyAll());
        return http.build();
    }
```

Ajouter `@Order(2)` à `securityFilterChain` existante.

- [x] **Step 4: Vérifier le GREEN et la non-régression monoport**

```powershell
.\mvnw.cmd -Dtest=ManagementPortSecurityIntegrationTest,SecurityConfigTest test
```

Expected: les deux classes passent ; le test monoport continue d'exiger le contrat existant.

- [ ] **Step 5: Commit conditionnel**

Uniquement après autorisation explicite :

```powershell
git add -- backend/src/main/java/com/molo/devopsstore/identity/infrastructure/SecurityConfig.java backend/src/test/java/com/molo/devopsstore/identity/infrastructure/ManagementPortSecurityIntegrationTest.java
git commit -m "feat: isolate management endpoint security"
```

---

### Task 2: Histogramme HTTP pour le p95

**Files:**
- Modify: `backend/src/test/java/com/molo/devopsstore/product/api/ProductApiIntegrationTest.java`
- Modify: `backend/src/main/resources/application.yml`

**Interfaces:**
- Consumes: métrique `http.server.requests` Micrometer.
- Produces: séries `http_server_requests_seconds_bucket` exploitables par `histogram_quantile`.

- [x] **Step 1: Ajouter l'assertion rouge**

Après l'assertion sur `products_created_events_total`, ajouter :

```java
        assertThat(metrics.body()).contains("http_server_requests_seconds_bucket");
```

- [x] **Step 2: Vérifier le RED**

```powershell
.\mvnw.cmd -Dtest=ProductApiIntegrationTest test
```

Expected: FAIL car le scrape ne contient pas encore `http_server_requests_seconds_bucket`.

- [x] **Step 3: Activer l'histogramme HTTP**

Sous `management:` dans `application.yml`, ajouter :

```yaml
  metrics:
    distribution:
      percentiles-histogram:
        http.server.requests: true
```

- [x] **Step 4: Vérifier le GREEN**

```powershell
.\mvnw.cmd -Dtest=ProductApiIntegrationTest test
```

Expected: PASS avec compteur métier et buckets HTTP présents.

- [ ] **Step 5: Commit conditionnel**

```powershell
git add -- backend/src/main/resources/application.yml backend/src/test/java/com/molo/devopsstore/product/api/ProductApiIntegrationTest.java
git commit -m "feat: publish HTTP latency histograms"
```

Exécuter uniquement après autorisation explicite.

---

### Task 3: Prometheus et topologie réseau Compose

**Files:**
- Create: `infrastructure/prometheus/prometheus.yml`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.devops.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `backend:8081`, réseau `devops-store-observability` et endpoint public conditionnel.
- Produces: service `prometheus`, volume `devops-store-prometheus-data`, target labellisée et endpoint local `9090`.

- [x] **Step 1: Créer la configuration Prometheus**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: devops-store-backend
    metrics_path: /actuator/prometheus
    static_configs:
      - targets:
          - backend:8081
        labels:
          service: devops-store-backend
          environment: local
```

- [x] **Step 2: Valider la configuration avec l'image épinglée**

```powershell
docker run --rm --entrypoint /bin/promtool -v "${PWD}/infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" prom/prometheus:v3.12.0-distroless@sha256:f39df5334dee301b885f77e0ff1159f5d8a43bf9db518f885544594799a1e3c2 check config /etc/prometheus/prometheus.yml
```

Expected: `SUCCESS: ... is valid prometheus config file syntax`.

- [x] **Step 3: Isoler Actuator dans la stack applicative**

Dans le service `backend` de `docker-compose.yml` :

```yaml
    environment:
      MANAGEMENT_SERVER_PORT: "8081"
    expose:
      - "8081"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--spider", "http://localhost:8081/actuator/health"]
    networks:
      - application
      - observability-shared
```

Conserver toutes les variables d'environnement existantes, et ajouter au niveau racine :

```yaml
networks:
  application:
    driver: bridge
  observability-shared:
    name: devops-store-observability
    driver: bridge
```

- [x] **Step 4: Ajouter le service Prometheus**

Ajouter dans `docker-compose.devops.yml` :

```yaml
  prometheus:
    profiles: [observability]
    image: prom/prometheus:v3.12.0-distroless@sha256:f39df5334dee301b885f77e0ff1159f5d8a43bf9db518f885544594799a1e3c2
    user: "65532:65532"
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --storage.tsdb.retention.time=7d
      - --storage.tsdb.retention.size=1GB
    ports:
      - "127.0.0.1:${PROMETHEUS_PORT:-9090}:9090"
    volumes:
      - ./infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    healthcheck:
      test: ["CMD", "/bin/promtool", "check", "healthy", "--url=http://localhost:9090"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s
    networks:
      - observability
      - observability-shared
    restart: unless-stopped
    stop_grace_period: 30s
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=32m
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    cpus: 1.0
    mem_limit: 512m
    pids_limit: 200
```

Ajouter aux sections racines :

```yaml
networks:
  observability:
    driver: bridge
    internal: true
  observability-shared:
    name: devops-store-observability
    external: true

volumes:
  prometheus-data:
    name: devops-store-prometheus-data
```

Conserver les réseaux et volumes existants.

- [x] **Step 5: Documenter le port sans secret**

Ajouter dans `.env.example` :

```dotenv
# Observability local
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
GRAFANA_ADMIN_PASSWORD=
```

- [x] **Step 6: Valider les deux modèles Compose**

```powershell
docker compose config --quiet
docker compose -f docker-compose.devops.yml --profile observability config --quiet
```

Expected: succès avec les secrets locaux requis ; `docker compose config` ne publie aucun port `8081`.

- [ ] **Step 7: Commit conditionnel**

```powershell
git add -- infrastructure/prometheus/prometheus.yml docker-compose.yml docker-compose.devops.yml .env.example
git commit -m "feat: add Prometheus metrics collection"
```

Exécuter uniquement après autorisation explicite.

---

### Task 4: Grafana provisionné et dashboard versionné

**Files:**
- Create: `infrastructure/grafana/provisioning/datasources/prometheus.yml`
- Create: `infrastructure/grafana/provisioning/dashboards/dashboards.yml`
- Create: `infrastructure/grafana/dashboards/backend-overview.json`
- Modify: `docker-compose.devops.yml`

**Interfaces:**
- Consumes: Prometheus `http://prometheus:9090` et datasource UID `prometheus`.
- Produces: Grafana sain, dossier `DevOps Store` et dashboard UID `devops-store-backend`.

- [x] **Step 1: Provisionner la datasource**

```yaml
apiVersion: 1
prune: true

datasources:
  - name: Prometheus
    uid: prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      httpMethod: POST
      prometheusType: Prometheus
      prometheusVersion: 3.12.0
      timeInterval: 15s
```

- [x] **Step 2: Provisionner le provider**

```yaml
apiVersion: 1

providers:
  - name: devops-store
    orgId: 1
    folder: DevOps Store
    folderUid: devops-store
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: false
    options:
      path: /var/lib/grafana/dashboards
```

- [x] **Step 3: Créer le dashboard JSON**

Create `backend-overview.json` avec cette structure complète. Chaque target référence explicitement `prometheus`; les IDs sont uniques et les requêtes de repli ne s'appliquent pas au panneau target.

```json
{
  "annotations": {"list": []},
  "editable": false,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"mappings": [{"options": {"0": {"color": "red", "text": "DOWN"}, "1": {"color": "green", "text": "UP"}}, "type": "value"}], "thresholds": {"mode": "absolute", "steps": [{"color": "red", "value": null}, {"color": "green", "value": 1}]}}, "overrides": []},
      "gridPos": {"h": 4, "w": 6, "x": 0, "y": 0},
      "id": 1,
      "options": {"colorMode": "value", "graphMode": "none", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": false}, "textMode": "auto", "wideLayout": true},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "up{job=\"devops-store-backend\"}", "instant": true, "range": false, "refId": "A"}],
      "title": "Backend target",
      "type": "stat"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"decimals": 0, "unit": "short"}, "overrides": []},
      "gridPos": {"h": 4, "w": 6, "x": 6, "y": 0},
      "id": 2,
      "options": {"colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": false}, "textMode": "auto", "wideLayout": true},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "sum(products_created_events_total{job=\"devops-store-backend\"}) or vector(0)", "instant": true, "range": false, "refId": "A"}],
      "title": "Products created",
      "type": "stat"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 4},
      "id": 3,
      "options": {"legend": {"calcs": [], "displayMode": "list", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "none"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "sum(rate(http_server_requests_seconds_count{job=\"devops-store-backend\"}[$__rate_interval])) or vector(0)", "legendFormat": "requests/s", "range": true, "refId": "A"}],
      "title": "HTTP throughput",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 4},
      "id": 4,
      "options": {"legend": {"calcs": [], "displayMode": "list", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "none"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{job=\"devops-store-backend\"}[$__rate_interval]))) or vector(0)", "legendFormat": "p95", "range": true, "refId": "A"}],
      "title": "HTTP latency p95",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 12},
      "id": 5,
      "options": {"legend": {"calcs": [], "displayMode": "list", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "none"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "sum(rate(http_server_requests_seconds_count{job=\"devops-store-backend\",status=~\"5..\"}[$__rate_interval])) or vector(0)", "legendFormat": "5xx/s", "range": true, "refId": "A"}],
      "title": "HTTP 5xx errors",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"max": 1, "min": 0, "unit": "percentunit"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 12},
      "id": 6,
      "options": {"legend": {"calcs": [], "displayMode": "list", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "none"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "max(process_cpu_usage{job=\"devops-store-backend\"}) or vector(0)", "legendFormat": "process CPU", "range": true, "refId": "A"}],
      "title": "Process CPU",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "bytes"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 20},
      "id": 7,
      "options": {"legend": {"calcs": [], "displayMode": "list", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "none"}},
      "targets": [
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "sum(jvm_memory_used_bytes{job=\"devops-store-backend\",area=\"heap\"}) or vector(0)", "legendFormat": "used", "range": true, "refId": "A"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "sum(jvm_memory_max_bytes{job=\"devops-store-backend\",area=\"heap\"}) or vector(0)", "legendFormat": "max", "range": true, "refId": "B"}
      ],
      "title": "JVM heap",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "short"}, "overrides": []},
      "gridPos": {"h": 8, "w": 6, "x": 12, "y": 20},
      "id": 8,
      "options": {"legend": {"calcs": [], "displayMode": "list", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "none"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "max(jvm_threads_live_threads{job=\"devops-store-backend\"}) or vector(0)", "legendFormat": "live", "range": true, "refId": "A"}],
      "title": "JVM live threads",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []},
      "gridPos": {"h": 8, "w": 6, "x": 18, "y": 20},
      "id": 9,
      "options": {"legend": {"calcs": [], "displayMode": "list", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "none"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "editorMode": "code", "expr": "sum(rate(jvm_gc_pause_seconds_sum{job=\"devops-store-backend\"}[$__rate_interval])) or vector(0)", "legendFormat": "pause seconds/s", "range": true, "refId": "A"}],
      "title": "GC pauses",
      "type": "timeseries"
    }
  ],
  "refresh": "15s",
  "schemaVersion": 42,
  "tags": ["devops-store", "spring-boot", "prometheus"],
  "templating": {"list": []},
  "time": {"from": "now-1h", "to": "now"},
  "timezone": "browser",
  "title": "DevOps Store — Backend Overview",
  "uid": "devops-store-backend",
  "version": 1
}
```

- [x] **Step 4: Ajouter le service Grafana**

```yaml
  grafana:
    profiles: [observability]
    image: grafana/grafana:13.1.0@sha256:121a7a9ece6dc10b969f1f96eed64b4f07dfac0d0b8abc070f7cb83bbde86f63
    user: "472:0"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?Set GRAFANA_ADMIN_PASSWORD in .env}
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_ANALYTICS_REPORTING_ENABLED: "false"
      GF_ANALYTICS_CHECK_FOR_UPDATES: "false"
      GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES: "false"
      GF_PLUGINS_PREINSTALL_DISABLED: "true"
      GF_LOG_MODE: console
    ports:
      - "127.0.0.1:${GRAFANA_PORT:-3000}:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./infrastructure/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./infrastructure/grafana/dashboards:/var/lib/grafana/dashboards:ro
    healthcheck:
      test:
        - CMD-SHELL
        - curl --fail --silent http://localhost:3000/api/health | grep -q 'database.*ok'
      interval: 10s
      timeout: 5s
      retries: 18
      start_period: 20s
    depends_on:
      prometheus:
        condition: service_healthy
    networks:
      - observability
      - observability-shared
    restart: unless-stopped
    stop_grace_period: 30s
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    cpus: 1.0
    mem_limit: 512m
    pids_limit: 200
```

Ajouter :

```yaml
volumes:
  grafana-data:
    name: devops-store-grafana-data
```

- [x] **Step 5: Valider JSON, YAML et Compose**

```powershell
Get-Content infrastructure/grafana/dashboards/backend-overview.json -Raw | ConvertFrom-Json | Out-Null
docker compose -f docker-compose.devops.yml --profile observability config --quiet
```

Expected: JSON parseable et modèle Compose valide avec `GRAFANA_ADMIN_PASSWORD` local défini.

- [ ] **Step 6: Commit conditionnel**

```powershell
git add -- infrastructure/grafana docker-compose.devops.yml
git commit -m "feat: provision Grafana observability dashboard"
```

Exécuter uniquement après autorisation explicite.

---

### Task 5: Commandes Make d'exploitation

**Files:**
- Modify: `Makefile`

**Interfaces:**
- Consumes: services `prometheus`, `grafana`, volumes Docker explicites et application target `application`.
- Produces: `observability-config/up/down/status/logs/reset`.

- [x] **Step 1: Vérifier les interfaces rouges**

```powershell
make observability-config
make -n observability-up
```

Expected: FAIL avec `No rule to make target` avant ajout.

- [x] **Step 2: Ajouter image, phony et aide**

Ajouter avec les variables :

```make
PROMETHEUS_IMAGE ?= prom/prometheus:v3.12.0-distroless@sha256:f39df5334dee301b885f77e0ff1159f5d8a43bf9db518f885544594799a1e3c2
```

Étendre `.PHONY` avec :

```make
	observability-config observability-up observability-down observability-status \
	observability-logs observability-reset
```

Ajouter à `help` les six descriptions approuvées.

- [x] **Step 3: Ajouter les recettes exactes**

```make
observability-config: ## Validate Prometheus and the observability Compose profile
	$(COMPOSE) config --quiet
	$(DEVOPS_COMPOSE) --profile observability config --quiet
	$(DOCKER) run --rm \
		-v "$(CURDIR)/infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
		--entrypoint /bin/promtool $(PROMETHEUS_IMAGE) \
		check config /etc/prometheus/prometheus.yml

observability-up: ## Start the application, Prometheus and Grafana
	$(MAKE) application
	$(DEVOPS_COMPOSE) --profile observability up -d --wait prometheus grafana

observability-down: ## Stop observability while preserving its data
	$(DEVOPS_COMPOSE) --profile observability stop grafana prometheus
	$(DEVOPS_COMPOSE) --profile observability rm -f grafana prometheus

observability-status: ## Show Prometheus and Grafana health
	$(DEVOPS_COMPOSE) --profile observability ps prometheus grafana

observability-logs: ## Follow Prometheus and Grafana logs
	$(DEVOPS_COMPOSE) --profile observability logs --follow --tail=200 prometheus grafana

observability-reset: observability-down ## Delete only Prometheus and Grafana local data
	@for volume in devops-store-prometheus-data devops-store-grafana-data; do \
		if $(DOCKER) volume inspect "$$volume" >/dev/null 2>&1; then \
			$(DOCKER) volume rm "$$volume"; \
		fi; \
	done
```

- [x] **Step 4: Vérifier le GREEN statique**

```powershell
make observability-config
make help
make -n observability-up
make -n observability-reset
```

Expected: config Prometheus/Compose verte, six targets listés, ordre application puis observabilité visible et reset limité aux deux volumes.

- [ ] **Step 5: Commit conditionnel**

```powershell
git add -- Makefile
git commit -m "build: add observability lifecycle commands"
```

Exécuter uniquement après autorisation explicite.

---

### Task 6: Documentation exploitable et état intermédiaire

**Files:**
- Create: `docs/observability/prometheus.md`
- Create: `docs/observability/grafana.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `AGENTS.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`

**Interfaces:**
- Consumes: commandes et configurations des Tasks 1 à 5.
- Produces: démarrage copiable, PromQL, trafic, diagnostic et statut fidèle sans clôture prématurée.

- [x] **Step 1: Écrire le guide Prometheus**

Créer exactement ces sections :

```markdown
# Prometheus

## Architecture et sécurité
## Prérequis et variables
## Démarrage et validation
## Scrape et labels
## Requêtes PromQL
## Génération de trafic et métrique métier
## Rétention, arrêt et reset
## Dépannage
```

Documenter les deux réseaux, le port management non publié, les labels, les neuf requêtes du dashboard, `promtool`, la target API, une création authentifiée suivie de sa suppression, l'attente d'un intervalle de scrape et les limites 7d/1GB.

- [x] **Step 2: Écrire le guide Grafana**

Créer exactement ces sections :

```markdown
# Grafana

## Architecture et accès
## Mot de passe administrateur local
## Provisioning versionné
## Dashboard backend
## Persistance, arrêt et reset
## Vérification par API
## Dépannage
```

Documenter `GRAFANA_ADMIN_PASSWORD`, l'absence d'accès anonyme, les UID `prometheus` et `devops-store-backend`, le provider en lecture seule, `/api/health` et la vérification Basic Auth sans afficher le mot de passe.

- [x] **Step 3: Mettre à jour les index et commandes**

Dans `README.md`, ajouter l'état phase 11 seulement comme « implémentée, validation finale en cours » tant que Task 7 n'est pas verte, les URLs `9090`/`3000`, les six commandes Make et les deux guides. Garder le README sous 200 lignes.

Dans `docs/README.md`, remplacer les entrées planifiées Prometheus/Grafana par des liens actifs.

- [x] **Step 4: Mettre à jour AGENTS.md**

Ajouter Prometheus/Grafana à la stack implémentée, `PROMETHEUS_PORT`, `GRAFANA_PORT`, `GRAFANA_ADMIN_PASSWORD`, les six targets Make, le port Actuator interne et les liens vers les guides. Laisser Loki/Alloy, Kubernetes et l'application réelle Terraform dans la cible planifiée.

- [x] **Step 5: Mettre à jour le plan sans cocher l'acceptance**

Dans la phase 11, cocher uniquement les éléments dont les validations statiques ont réussi. Laisser target UP, dashboard automatique et compteur métier ouverts jusqu'à Task 7. Ajouter une note d'état « validation locale dynamique en attente ».

- [x] **Step 6: Vérifier les affirmations**

```powershell
rg -n "Prometheus|Grafana|observability-|GRAFANA_ADMIN_PASSWORD|8081" README.md AGENTS.md docs/README.md docs/observability docs/IMPLEMENTATION_PLAN.md
rg -n "Loki.*opérationnel|Alloy.*opérationnel|phase 11.*terminée" README.md AGENTS.md docs/README.md docs/IMPLEMENTATION_PLAN.md
git diff --check
```

Expected: liens et commandes présents ; aucune affirmation anticipée sur Loki/Alloy ou la clôture dynamique.

- [ ] **Step 7: Commit conditionnel**

```powershell
git add -- README.md AGENTS.md docs/README.md docs/observability docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: document Prometheus and Grafana"
```

Exécuter uniquement après autorisation explicite.

---

### Task 7: Acceptance réelle et clôture de la phase 11

**Files:**
- Modify after all applicable checks pass: `docs/IMPLEMENTATION_PLAN.md`
- Modify: `docs/superpowers/plans/2026-08-31-prometheus-grafana-observability.md` checkboxes and evidence.
- No generated data, `.env` or credentials committed.

**Interfaces:**
- Consumes: application complète, licence AIStor locale, secrets `.env`, Prometheus, Grafana et compte administrateur bootstrap.
- Produces: preuves locales des trois critères d'acceptation et statut final honnête.

- [x] **Step 1: Exécuter les validations statiques finales**

```powershell
make observability-config
git diff --check
```

Expected: Prometheus, les deux modèles Compose et le whitespace sont valides.

- [x] **Step 2: Démarrer la stack complète**

```powershell
make observability-up
make observability-status
```

Expected: application, Prometheus et Grafana démarrés ; les deux services observabilité sont healthy.

- [x] **Step 3: Vérifier santé et target**

```powershell
curl.exe --fail http://localhost:9090/-/healthy
curl.exe --fail http://localhost:3000/api/health
curl.exe --fail --get http://localhost:9090/api/v1/query --data-urlencode 'query=up{job="devops-store-backend",service="devops-store-backend",environment="local"}'
```

Expected: deux réponses saines et résultat Prometheus `value` égal à `1`.

- [x] **Step 4: Vérifier le dashboard provisionné sans clic**

```powershell
$grafanaCredential = "admin:$env:GRAFANA_ADMIN_PASSWORD"
$grafanaAuth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($grafanaCredential))
$dashboard = Invoke-RestMethod -Uri 'http://localhost:3000/api/dashboards/uid/devops-store-backend' -Headers @{ Authorization = "Basic $grafanaAuth" }
if ($dashboard.dashboard.uid -ne 'devops-store-backend') { throw 'Dashboard UID mismatch' }
if ($dashboard.dashboard.panels.Count -ne 9) { throw 'Expected 9 dashboard panels' }
Remove-Variable grafanaCredential, grafanaAuth
```

Expected: UID exact, neuf panneaux, aucune intervention UI.

- [x] **Step 5: Prouver l'évolution du compteur métier**

```powershell
$counterQuery = 'http://localhost:9090/api/v1/query?query=' + [uri]::EscapeDataString('sum(products_created_events_total) or vector(0)')
$before = [double](Invoke-RestMethod -Uri $counterQuery).data.result[0].value[1]
$loginBody = @{ email = $env:BOOTSTRAP_ADMIN_EMAIL; password = $env:BOOTSTRAP_ADMIN_PASSWORD } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/v1/auth/login' -Headers @{ Origin = 'http://localhost:4200' } -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
$productBody = @{
  name = "Observability acceptance $([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
  description = "Temporary phase 11 acceptance product"
  category = "ACCESSORY"
  price = 1.00
  stockQuantity = 1
  available = $true
} | ConvertTo-Json
$product = Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/v1/products' -Headers $headers -ContentType 'application/json' -Body $productBody
Start-Sleep -Seconds 20
$after = [double](Invoke-RestMethod -Uri $counterQuery).data.result[0].value[1]
if ($after -le $before) { throw "Counter did not increase: before=$before after=$after" }
Invoke-RestMethod -Method Delete -Uri "http://localhost:8080/api/v1/products/$($product.id)" -Headers $headers
Remove-Variable counterQuery, loginBody, login, headers, productBody, product, before, after
```

Expected: compteur strictement supérieur après le scrape ; le produit temporaire est supprimé.

- [x] **Step 6: Exécuter les régressions proportionnées**

Depuis `backend/` :

```powershell
.\mvnw.cmd clean verify
```

Depuis la racine :

```powershell
make trivy-config
git diff --check
```

Expected: Maven complet, scan de configuration et whitespace verts. Si la licence AIStor empêche `clean verify`, consigner « non exécuté » et ne pas clôturer la phase.

- [x] **Step 7: Vérifier arrêt et persistance**

```powershell
make observability-down
docker volume inspect devops-store-prometheus-data devops-store-grafana-data
docker compose ps
```

Expected: conteneurs observabilité retirés, deux volumes présents, application toujours active.

- [x] **Step 8: Marquer la phase terminée et vérifier le périmètre Git**

Après les Steps 1 à 7 uniquement, cocher les trois critères d'acceptation de la phase 11, remplacer l'état intermédiaire par une note datée avec codes retour, puis exécuter :

```powershell
git status -sb
git diff --stat
git diff --check
git diff -- . ':!task_plan.md' ':!findings.md' ':!progress.md'
```

Expected: uniquement les fichiers phase 11 ; aucun `.env`, secret, volume, donnée Prometheus/Grafana ou changement utilisateur hors périmètre.

- [x] **Step 9: Commit final conditionnel**

Uniquement après autorisation explicite :

```powershell
git add -- backend/src/main/java/com/molo/devopsstore/identity/infrastructure/SecurityConfig.java backend/src/main/resources/application.yml backend/src/test/java/com/molo/devopsstore/identity/infrastructure/ManagementPortSecurityIntegrationTest.java backend/src/test/java/com/molo/devopsstore/product/api/ProductApiIntegrationTest.java docker-compose.yml docker-compose.devops.yml .env.example Makefile infrastructure/prometheus infrastructure/grafana README.md AGENTS.md docs/README.md docs/observability docs/IMPLEMENTATION_PLAN.md docs/superpowers/specs/2026-08-31-prometheus-grafana-observability-design.md docs/superpowers/plans/2026-08-31-prometheus-grafana-observability.md
git commit -m "feat: add Prometheus and Grafana observability"
```

Ne pousser et ne créer une Pull Request qu'après autorisation séparée.

Exécution réelle : les étapes de commit intermédiaires n'ont pas été utilisées ; le travail a été
regroupé dans le commit final `fb55867`, complété par le correctif CVE `e4f9d07` et la clôture
documentaire `4769a2e`, puis fusionné dans `main` via la Pull Request #29 (`90f1f26`).
