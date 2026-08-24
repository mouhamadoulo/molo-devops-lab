# Design de la CI GitHub Actions

**Date :** 24 août 2026

**Statut :** validé en conversation, prêt pour planification détaillée

## Contexte

Les phases applicatives, de tests, de couverture, de conteneurisation et de gouvernance Git sont
terminées. Le dépôt ne contient encore aucun workflow GitHub Actions. La phase 6 doit automatiser
les commandes locales existantes sans introduire de publication d'artefacts, de déploiement ou de
scan SonarQube/Trivy, qui appartiennent aux phases suivantes.

Le backend possède un test d'intégration AIStor réel. Ce test requiert une licence locale lisible
via `MINIO_LICENSE_FILE` et fait partie de `./mvnw clean verify`. La CI doit donc reconstruire ce
fichier depuis un secret sans l'ajouter au dépôt ou aux logs.

## Objectifs

- fournir des contrôles backend, frontend et Docker indépendants ;
- exécuter en CI les mêmes commandes de validation que localement ;
- conserver les rapports de tests et de couverture même après un échec ;
- limiter le `GITHUB_TOKEN` à la lecture du dépôt ;
- épingler chaque action tierce à un SHA complet vérifié ;
- activer Dependabot pour Maven, npm, GitHub Actions et Docker ;
- rendre les workflows vérifiables localement avec `actionlint`.

## Hors périmètre

- publication du JAR, du frontend ou des images ;
- registre Docker, Artifactory, releases et déploiement ;
- SonarQube, Trivy et SARIF ;
- tests Playwright de bout en bout dans la CI de cette phase ;
- runners auto-hébergés.

## Architecture retenue

Trois workflows spécialisés sont préférés à un workflow monolithique ou à des workflows
réutilisables :

| Workflow | Responsabilité | Commande ou résultat principal |
|---|---|---|
| `backend-ci.yml` | Compiler et tester Java/PostgreSQL/AIStor | `./mvnw clean verify` |
| `frontend-ci.yml` | Lint, tests avec couverture et build Angular | commandes npm du Makefile |
| `docker.yml` | Prouver que les deux images applicatives se construisent | deux builds BuildKit sans push |

Cette séparation donne des statuts lisibles, isole le secret AIStor au seul job backend et permet
des filtres de chemins propres à chaque responsabilité.

## Déclencheurs et concurrence

Chaque workflow accepte :

- `pull_request` ciblant `main` ;
- `push` sur `main` ;
- `workflow_dispatch` pour un diagnostic manuel.

Les filtres prévus sont :

- backend : `backend/**` et le workflow backend ;
- frontend : `frontend/**` et le workflow frontend ;
- Docker : `backend/**`, `frontend/**`, `docker-compose.yml`, `.dockerignore` et le workflow
  Docker.

Une concurrence groupée par workflow et Pull Request ou référence annule l'exécution devenue
obsolète lorsqu'un nouveau commit arrive.

GitHub laisse un contrôle filtré en attente lorsqu'il est configuré comme contrôle obligatoire et
que ses chemins ne correspondent pas. Le dépôt privé courant ne dispose pas de protection de
branche. Si cette protection devient disponible, les workflows filtrés ne devront pas être rendus
obligatoires sans ajouter un contrôle agrégateur toujours exécuté.

## Permissions et secrets

Chaque workflow déclare au niveau racine :

```yaml
permissions:
  contents: read
```

Aucun workflow n'utilise `pull_request_target`. Aucun job n'obtient de permission d'écriture et
aucun secret n'est déclaré globalement.

Le backend lit `MINIO_LICENSE_B64` uniquement dans l'étape de préparation de la licence. Cette
étape :

1. vérifie que le secret n'est pas vide sans l'afficher ;
2. le décode dans un fichier sous `$RUNNER_TEMP` ;
3. restreint les permissions du fichier ;
4. expose uniquement le chemin comme `MINIO_LICENSE_FILE` pour le test Maven ;
5. supprime le fichier avec une étape `if: always()`.

Le même nom doit être créé dans les secrets Actions et Dependabot du dépôt. Les workflows lancés
par Dependabot reçoivent les secrets Dependabot, pas les secrets Actions. Les secrets ne sont pas
transmis aux Pull Requests provenant d'un fork ; ces contributions doivent être importées dans une
branche interne approuvée avant la validation backend complète.

## Workflow backend

Le job utilise `ubuntu-24.04`, un checkout sans persistance de credentials, Java 25 Temurin et le
cache Maven géré par l'action de configuration Java. Le répertoire de travail par défaut est
`backend/`.

Après préparation de la licence, `./mvnw clean verify` compile, exécute JUnit/Testcontainers et
génère JaCoCo. Docker fourni par le runner héberge PostgreSQL et AIStor pendant les tests.

Deux ensembles sont chargés comme artefacts avec une rétention de 14 jours et `if: always()` :

- `backend/target/surefire-reports/**` ;
- `backend/target/site/jacoco/**`.

`if-no-files-found: warn` préserve l'erreur initiale lorsqu'un échec précoce empêche la production
des rapports.

## Workflow frontend

Le job utilise `ubuntu-24.04`, Node.js 24.18.0 et le cache npm basé sur
`frontend/package-lock.json`. Le répertoire de travail par défaut est `frontend/`.

Les étapes exécutent dans l'ordre :

```text
npm ci
npm run lint
npm run test:ci
npm run build
```

Le script `test:ci` est modifié en `ng test --watch=false --coverage`. Le Makefile continue donc à
utiliser la même commande que la CI tout en générant réellement LCOV et HTML. Le dossier
`frontend/coverage/frontend/**` est chargé comme artefact pendant 14 jours avec `if: always()`.

Le résultat `dist/` n'est pas conservé : cette phase valide le build, tandis qu'Artifactory et la
publication restent hors périmètre.

## Workflow Docker

Le workflow configure Buildx puis utilise une matrice à deux entrées :

- contexte `backend/`, Dockerfile `backend/Dockerfile` ;
- contexte `frontend/`, Dockerfile `frontend/Dockerfile`.

Chaque entrée utilise le cache GitHub Actions de BuildKit. `push: false` reste imposé sur Pull
Request et sur `main`. Aucun credential de registre n'est déclaré et aucune image n'est chargée ou
exportée durablement.

## Épinglage des dépendances CI

Chaque référence `uses:` emploie un SHA Git complet de 40 caractères. Un commentaire adjacent
conserve la version humaine vérifiée. Les SHAs sont résolus depuis les dépôts officiels au moment
de l'implémentation, puis contrôlés par une recherche automatisable.

Les runners utilisent `ubuntu-24.04` plutôt que `ubuntu-latest`. Les versions applicatives restent
celles du plan : Java 25 et Node.js 24.18.0.

## Dependabot

`.github/dependabot.yml` configure une vérification hebdomadaire pour :

- Maven dans `/backend` ;
- npm dans `/frontend` ;
- GitHub Actions à la racine ;
- Docker dans `/`, `/backend` et `/frontend`.

Les mises à jour mineures et correctives compatibles sont regroupées par écosystème afin de
réduire le bruit. Les mises à jour majeures restent isolées pour faciliter la revue. Le nombre de
Pull Requests ouvertes simultanément est borné.

## Validation locale des workflows

Une cible Makefile `ci-lint` lance l'image publiée par le projet `actionlint`, épinglée par digest. Elle ne
requiert aucune installation globale et analyse tous les workflows versionnés. Le digest et la
version sont vérifiés au moment de l'implémentation.

Les contrôles locaux applicables sont :

```text
make ci-lint
cd backend && ./mvnw clean verify
cd frontend && npm ci && npm run lint && npm run test:ci && npm run build
docker build backend
docker build frontend
git diff --check
```

Le test backend nécessite Docker et `MINIO_LICENSE_FILE`. Les exécutions hébergées GitHub sont
contrôlées après push : trois statuts indépendants, rapports disponibles après succès ou échec et
absence de publication d'image.

## Gestion des erreurs

Les étapes de compilation, lint, test et build ne tolèrent pas l'échec. Seuls le chargement des
rapports et le nettoyage de la licence utilisent `always()`. L'absence du secret AIStor produit un
message explicite et fait échouer le job backend sans révéler de valeur.

Les caches accélèrent les exécutions mais ne sont jamais une condition de réussite. Une restauration
de cache manquée doit conduire à un téléchargement normal des dépendances.

## Documentation et état du plan

`docs/devops/github-actions.md` documente les déclencheurs, permissions, artefacts, secrets Actions
et Dependabot, diagnostics et commandes locales. `docs/README.md`, `README.md`, le Makefile et la
phase 6 du plan sont mis à jour avec uniquement les capacités effectivement validées.

La phase 6 n'est marquée terminée qu'après validation locale des fichiers et observation d'une
exécution GitHub réelle. La création des secrets et le push exigent une autorisation explicite et
ne sont pas simulés.

## Références officielles

- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Dependabot on GitHub Actions](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-on-actions)
- [Understanding GitHub secret types](https://docs.github.com/en/code-security/reference/secret-security/secret-types)
- [Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- [Storing workflow data as artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)
