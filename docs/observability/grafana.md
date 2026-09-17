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

Le conteneur Grafana refuse de démarrer si cette variable manque ou est vide ; les autres profils
du fichier Compose DevOps ne l'exigent pas. Ne jamais inclure sa valeur dans une commande
versionnée, une capture ou un journal.

Grafana n'applique ce mot de passe qu'à la création de sa base dans le volume
`devops-store-grafana-data`. Le modifier ensuite dans `.env` n'a aucun effet sur un volume existant.

## Provisioning versionné

La datasource définie dans `infrastructure/grafana/provisioning/datasources/prometheus.yml` porte
l'UID stable `prometheus`. Le provider
`infrastructure/grafana/provisioning/dashboards/dashboards.yml` charge les JSON du dossier monté en
lecture seule dans le dossier Grafana `DevOps Store`. Les modifications depuis l'interface sont
désactivées afin que Git reste la source de vérité.

## Datasource Loki

La datasource définie dans `infrastructure/grafana/provisioning/datasources/loki.yml` porte l'UID
stable `loki` et pointe sur `http://loki:3100`. Comme la datasource Prometheus, elle est
provisionnée en lecture seule : Git reste la source de vérité. Prometheus demeure la datasource par
défaut. Le détail de la collecte est dans [Loki](loki.md) et [Alloy](alloy.md).

## Dashboard backend

Le dashboard `DevOps Store — Backend Overview` porte l'UID `devops-store-backend` et contient dix
panneaux : état de la target, créations de produits, débit HTTP, latence p95, erreurs 5xx, CPU du
processus, heap JVM, threads vivants, pauses GC, puis `Backend logs`. Ce dernier est un panneau de
logs alimenté par la datasource `loki` avec la requête `{service_name="devops-store-backend"}`. Le
dashboard est chargé automatiquement au démarrage, sans import ni clic manuel.

## Persistance, arrêt et reset

Les données Grafana résident dans `devops-store-grafana-data`. `make observability-down` retire
les cinq services d'observabilité tout en préservant leurs volumes. `make observability-reset`
supprime uniquement les quatre volumes d'observabilité (Prometheus, Grafana, Loki et les positions
d'Alloy) ; les dashboards provisionnés seront recréés au prochain démarrage, mais les autres
données locales Grafana et les journaux déjà collectés seront perdus.

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
if ($dashboard.dashboard.panels.Count -ne 10) { throw 'Expected 10 dashboard panels' }
Remove-Variable grafanaCredential, grafanaAuth, dashboard
```

## Dépannage

- Démarrage refusé : si `make observability-logs` affiche `GRAFANA_ADMIN_PASSWORD is required`,
  définir la variable dans `.env`.
- API ou connexion en 401 alors que `.env` est correct : le volume a été initialisé avec un ancien
  mot de passe. Supprimer uniquement les données d'observabilité avec `make observability-reset`,
  puis relancer `make observability-up`.
- Datasource indisponible : vérifier `make observability-status`, puis les logs Prometheus et
  Grafana avec `make observability-logs`.
- Dashboard absent : vérifier les montages en lecture seule et les UID `prometheus`, `loki` et
  `devops-store-backend` dans les fichiers versionnés.
- Panneau `Backend logs` vide : la datasource `loki` répond mais aucun flux n'existe encore ;
  vérifier le collecteur avec `curl.exe http://localhost:12345/-/ready` et [Alloy](alloy.md).
- Port occupé : modifier `GRAFANA_PORT` dans `.env`; le port interne reste `3000`.
- Base Grafana non saine : consulter le healthcheck `/api/health`, les permissions du volume et les
  logs du service.
