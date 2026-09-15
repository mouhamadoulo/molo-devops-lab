# Grafana

## Architecture et accès

Grafana est disponible sur <http://localhost:3000> par défaut et n'est lié qu'à `127.0.0.1`.
Il rejoint le réseau Compose interne `observability` pour interroger Prometheus par
`http://prometheus:9090`, ainsi que le réseau partagé non interne requis pour la publication du
port hôte. L'accès anonyme, l'inscription libre et le téléchargement automatique des plugins
suggérés sont désactivés.

## Mot de passe administrateur local

Le compte local est `admin`. Définir un mot de passe non vide dans `.env` ou dans l'environnement :

```dotenv
GRAFANA_ADMIN_PASSWORD=<secret-local>
```

Compose refuse de créer le service si cette variable manque. Ne jamais inclure sa valeur dans une
commande versionnée, une capture ou un journal.

Grafana n'applique ce mot de passe qu'à la création de sa base dans le volume
`devops-store-grafana-data`. Le modifier ensuite dans `.env` n'a aucun effet sur un volume existant.

## Provisioning versionné

La datasource définie dans `infrastructure/grafana/provisioning/datasources/prometheus.yml` porte
l'UID stable `prometheus`. Le provider
`infrastructure/grafana/provisioning/dashboards/dashboards.yml` charge les JSON du dossier monté en
lecture seule dans le dossier Grafana `DevOps Store`. Les modifications depuis l'interface sont
désactivées afin que Git reste la source de vérité.

## Dashboard backend

Le dashboard `DevOps Store — Backend Overview` porte l'UID `devops-store-backend` et contient neuf
panneaux : état de la target, créations de produits, débit HTTP, latence p95, erreurs 5xx, CPU du
processus, heap JVM, threads vivants et pauses GC. Il est chargé automatiquement au démarrage,
sans import ni clic manuel.

## Persistance, arrêt et reset

Les données Grafana résident dans `devops-store-grafana-data`. `make observability-down` retire
Prometheus et Grafana tout en préservant leurs volumes. `make observability-reset` supprime
uniquement les deux volumes d'observabilité ; les dashboards provisionnés seront recréés au
prochain démarrage, mais les autres données locales Grafana seront perdues.

## Vérification par API

La santé ne nécessite pas d'authentification :

```powershell
curl.exe --fail http://localhost:3000/api/health
```

Vérifier le dashboard par Basic Auth sans écrire ni afficher le mot de passe :

```powershell
$grafanaCredential = "admin:$env:GRAFANA_ADMIN_PASSWORD"
$grafanaAuth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($grafanaCredential))
$dashboard = Invoke-RestMethod -Uri 'http://localhost:3000/api/dashboards/uid/devops-store-backend' -Headers @{ Authorization = "Basic $grafanaAuth" }
if ($dashboard.dashboard.uid -ne 'devops-store-backend') { throw 'Dashboard UID mismatch' }
if ($dashboard.dashboard.panels.Count -ne 9) { throw 'Expected 9 dashboard panels' }
Remove-Variable grafanaCredential, grafanaAuth, dashboard
```

## Dépannage

- Démarrage refusé : vérifier que `GRAFANA_ADMIN_PASSWORD` est défini dans `.env`.
- API ou connexion en 401 alors que `.env` est correct : le volume a été initialisé avec un ancien
  mot de passe. Supprimer uniquement les données d'observabilité avec `make observability-reset`,
  puis relancer `make observability-up`.
- Datasource indisponible : vérifier `make observability-status`, puis les logs Prometheus et
  Grafana avec `make observability-logs`.
- Dashboard absent : vérifier les montages en lecture seule et les UID `prometheus` et
  `devops-store-backend` dans les fichiers versionnés.
- Port occupé : modifier `GRAFANA_PORT` dans `.env`; le port interne reste `3000`.
- Base Grafana non saine : consulter le healthcheck `/api/health`, les permissions du volume et les
  logs du service.
