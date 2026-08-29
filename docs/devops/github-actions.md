# GitHub Actions

La CI sépare backend, frontend, builds Docker et sécurité. Elle s'exécute sur les Pull Requests vers
`main`, les pushes sur `main` et à la demande. Les filtres de chemins évitent les validations sans
rapport ; le workflow sécurité s'exécute aussi chaque lundi à 05:00 UTC.

## Workflows

| Workflow | Validation | Artefact |
|---|---|---|
| Backend CI | Java 25, Maven, PostgreSQL et AIStor | Surefire et JaCoCo, 14 jours |
| Frontend CI | npm, ESLint, Vitest avec couverture et build Angular | couverture HTML/LCOV, 14 jours |
| Docker CI | images backend et frontend avec Buildx, puis scans Trivy | rapports texte et SARIF Trivy, 14 jours ; aucune image publiée |
| Security CI | filesystem, dépendances, secrets et configurations avec Trivy | rapports texte et SARIF Trivy, 14 jours |

## Licence AIStor

Créer `MINIO_LICENSE_B64` avec la même valeur dans les secrets Actions et Dependabot. La valeur est
le contenu Base64 du fichier local référencé par `MINIO_LICENSE_FILE`. Elle est décodée sous
`RUNNER_TEMP`, utilisée uniquement par le job backend puis supprimée avec `always()`.

Sous PowerShell, produire la valeur sans l'afficher puis la transmettre à GitHub CLI :

```powershell
$licenseBytes = [System.IO.File]::ReadAllBytes($env:MINIO_LICENSE_FILE)
$licenseBase64 = [Convert]::ToBase64String($licenseBytes)
$licenseBase64 | gh secret set MINIO_LICENSE_B64 --app actions
$licenseBase64 | gh secret set MINIO_LICENSE_B64 --app dependabot
Remove-Variable licenseBytes, licenseBase64
```

Les Pull Requests de forks ne reçoivent aucun secret. Importer le changement vérifié dans une
branche interne avant d'exécuter le backend complet.

## Commandes locales

Depuis la racine du dépôt :

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
Set-Location backend
.\mvnw.cmd clean verify
Set-Location ../frontend
npm ci
npm run lint
npm run test:ci
npm run build
```

Le backend requiert Docker et `MINIO_LICENSE_FILE`. Le build Docker ne publie aucune image. Pour
reproduire les deux constructions :

```powershell
Set-Location ..
docker build --file backend/Dockerfile --tag devops-store-backend:ci backend
docker build --file frontend/Dockerfile --tag devops-store-frontend:ci frontend
make security
```

Les scans peuvent aussi être exécutés séparément avec `make trivy-verify`, `make trivy-fs`,
`make trivy-config` et `make trivy-images`. La politique, les rapports et la procédure de mise à
jour sont détaillés dans le [guide Trivy](trivy.md).

## Permissions et dépendances

Les workflows backend et frontend utilisent uniquement `contents: read`. Les workflows Docker et
sécurité ajoutent `actions: read` et `security-events: write` afin de pouvoir publier les SARIF dans
GitHub Code Scanning. Cette publication reste désactivée par défaut : définir la variable de dépôt
`ENABLE_CODE_SCANNING` à `true` pour l'activer. Elle est ignorée pour les Pull Requests Dependabot
et celles provenant de forks, qui ne disposent pas des mêmes autorisations.

Chaque action est épinglée à un SHA complet avec sa version en commentaire. Dependabot vérifie
Maven, npm, GitHub Actions, le manifeste Docker Compose racine et les Dockerfiles backend/frontend
chaque semaine.

## Preuves hébergées

La [Pull Request #6](https://github.com/mouhamadoulo/molo-devops-lab/pull/6), à la révision
`34b7dbd`, fournit les preuves suivantes le 24 août 2026 :

| Contrôle | Run | Résultat | Artefact |
|---|---|---|---|
| Backend CI | [32741521307](https://github.com/mouhamadoulo/molo-devops-lab/actions/runs/32741521307) | 110 tests, succès | `backend-reports-32741521307-1`, 14 jours |
| Frontend CI | [32741521323](https://github.com/mouhamadoulo/molo-devops-lab/actions/runs/32741521323) | 105 tests, succès | `frontend-coverage-32741521323-1`, 14 jours |
| Docker CI | [32741521309](https://github.com/mouhamadoulo/molo-devops-lab/actions/runs/32741521309) | images backend et frontend construites | aucune publication |

Le premier run backend a révélé que `backend/mvnw` était enregistré sans bit exécutable. Le
commit `34b7dbd` a restauré le mode `100755` sans modifier le contenu du wrapper ; le nouveau run
backend a ensuite réussi.

## Diagnostic

- licence absente : vérifier le nom dans les deux magasins de secrets ;
- rapports absents : consulter l'étape de build initiale, l'upload reste non bloquant ;
- cache manqué : le téléchargement normal des dépendances doit continuer ;
- workflow filtré : vérifier les chemins modifiés et ne pas rendre ce contrôle obligatoire sans
  contrôle agrégateur toujours exécuté ;
- build Docker en échec : reproduire avec `docker build` sur le même contexte.
- gate Trivy en échec : ouvrir le rapport texte correspondant dans l'artefact, appliquer la mise à
  jour indiquée, puis relancer `make security` ;
- upload SARIF ignoré : vérifier `ENABLE_CODE_SCANNING`, l'origine de la Pull Request et les
  autorisations `security-events`.
