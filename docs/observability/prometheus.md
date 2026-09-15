# Prometheus

## Architecture et sécurité

L'application et l'observabilité restent deux projets Compose séparés. Le réseau nommé
`devops-store-observability` relie le backend, Prometheus et Grafana ; le réseau interne
`observability` porte les échanges privés entre Prometheus et Grafana. Cette double connexion de
Grafana est nécessaire pour publier son port sur l'hôte tout en conservant le chemin interne vers
Prometheus. Le backend écoute l'API sur `8080` et Actuator sur `8081`. Ce port management est
exposé aux conteneurs, mais jamais publié sur l'hôte.

La chaîne Spring Security dédiée au port management autorise anonymement `health` et
`prometheus`, puis refuse les autres endpoints. Prometheus et Grafana sont publiés uniquement sur
`127.0.0.1`.

## Prérequis et variables

Copier `.env.example` vers `.env`, renseigner les secrets applicatifs habituels et ajouter un mot
de passe Grafana non vide. Les variables d'observabilité sont :

```dotenv
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
GRAFANA_ADMIN_PASSWORD=<secret-local>
```

Docker, Docker Compose, la licence AIStor locale et les secrets de bootstrap restent requis pour
démarrer l'application complète. Ne jamais versionner `.env`.

## Démarrage et validation

Avec GNU Make :

```bash
make observability-config
make observability-up
make observability-status
```

Sans Make :

```powershell
docker compose config --quiet
docker run --rm -v "${PWD}/infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" --entrypoint /bin/promtool prom/prometheus:v3.14.0-distroless@sha256:50c707e96da5ade383cb1707790576480485e93de06aa60ad8802cb5f744bd0a check config /etc/prometheus/prometheus.yml
docker compose build --pull
docker compose up -d --wait
docker compose -f docker-compose.devops.yml --profile observability up -d --wait prometheus grafana
```

Prometheus est ensuite disponible sur <http://localhost:9090>. Vérifier sa santé et sa target :

```powershell
curl.exe --fail http://localhost:9090/-/healthy
curl.exe --fail --get http://localhost:9090/api/v1/query --data-urlencode 'query=up{job="devops-store-backend",service="devops-store-backend",environment="local"}'
```

La seconde réponse doit contenir une valeur `1`.

## Scrape et labels

Prometheus scrape `http://backend:8081/actuator/prometheus` toutes les 15 secondes. La target porte
le job `devops-store-backend` et les labels stables `service="devops-store-backend"` et
`environment="local"`. Le nom `backend` est résolu sur le réseau partagé ; il n'est pas une URL
accessible depuis l'hôte.

## Requêtes PromQL

Le dashboard versionné utilise ces neuf vues :

```promql
up{job="devops-store-backend"}
sum(products_created_events_total{job="devops-store-backend"}) or vector(0)
sum(rate(http_server_requests_seconds_count{job="devops-store-backend"}[$__rate_interval])) or vector(0)
histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{job="devops-store-backend"}[$__rate_interval]))) or vector(0)
sum(rate(http_server_requests_seconds_count{job="devops-store-backend",status=~"5.."}[$__rate_interval])) or vector(0)
max(process_cpu_usage{job="devops-store-backend"}) or vector(0)
sum(jvm_memory_used_bytes{job="devops-store-backend",area="heap"}) or vector(0)
max(jvm_threads_live_threads{job="devops-store-backend"}) or vector(0)
sum(rate(jvm_gc_pause_seconds_sum{job="devops-store-backend"}[$__rate_interval])) or vector(0)
```

Le panneau heap affiche aussi `sum(jvm_memory_max_bytes{job="devops-store-backend",area="heap"})
or vector(0)`. Le panneau target n'emploie volontairement aucun repli : une panne de scrape doit
rester visible.

## Génération de trafic et métrique métier

Le parcours suivant s'authentifie avec le compte bootstrap depuis l'origine autorisée
(`CORS_ALLOWED_ORIGIN`, par défaut `http://localhost:4200` ; sans en-tête `Origin`, le login
répond 403), crée un produit temporaire, attend au moins un scrape, vérifie le compteur puis
supprime le produit. Le repli `or vector(0)` évite un échec tant qu'aucun produit n'a été créé.
Il lit les secrets depuis l'environnement et ne les affiche pas.

```powershell
$counterQuery = 'http://localhost:9090/api/v1/query?query=' + [uri]::EscapeDataString('sum(products_created_events_total) or vector(0)')
$before = [double](Invoke-RestMethod -Uri $counterQuery).data.result[0].value[1]
$loginBody = @{ email = $env:BOOTSTRAP_ADMIN_EMAIL; password = $env:BOOTSTRAP_ADMIN_PASSWORD } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/v1/auth/login' -Headers @{ Origin = 'http://localhost:4200' } -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
$productBody = @{ name = "Observability check $([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"; description = "Temporary observability check"; category = "ACCESSORY"; price = 1.00; stockQuantity = 1; available = $true } | ConvertTo-Json
$product = Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/v1/products' -Headers $headers -ContentType 'application/json' -Body $productBody
Start-Sleep -Seconds 20
$after = [double](Invoke-RestMethod -Uri $counterQuery).data.result[0].value[1]
if ($after -le $before) { throw "Counter did not increase: before=$before after=$after" }
Invoke-RestMethod -Method Delete -Uri "http://localhost:8080/api/v1/products/$($product.id)" -Headers $headers
Remove-Variable counterQuery, before, loginBody, login, headers, productBody, product, after
```

## Rétention, arrêt et reset

Prometheus conserve au maximum sept jours et 1 Go dans le volume
`devops-store-prometheus-data`. L'arrêt normal retire les conteneurs d'observabilité et préserve
les volumes ; l'application continue de tourner.

```bash
make observability-down
make observability-reset
```

`observability-reset` supprime uniquement les volumes `devops-store-prometheus-data` et
`devops-store-grafana-data`. Cette suppression est irréversible pour les données locales de
métriques et de Grafana.

## Dépannage

- Target absente : vérifier `docker network inspect devops-store-observability` et que `backend`
  est sain sur son port management `8081`.
- Target DOWN : consulter `make observability-logs` puis confirmer que le healthcheck backend vise
  `http://localhost:8081/actuator/health` dans le conteneur.
- Buckets p95 absents : générer du trafic HTTP et vérifier la présence de
  `http_server_requests_seconds_bucket`.
- Port occupé : modifier `PROMETHEUS_PORT` dans `.env`; le port interne reste `9090`.
- Configuration invalide : exécuter `make observability-config`, qui contrôle les deux modèles
  Compose et `prometheus.yml` avec `promtool`.
