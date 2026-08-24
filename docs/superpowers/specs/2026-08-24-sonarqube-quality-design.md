# Design de l’analyse qualité SonarQube

**Date :** 24 août 2026
**Statut :** design approuvé et implémenté

## Objectif

La phase 7 doit fournir une instance SonarQube Community locale et deux analyses reproductibles :
une pour le backend Java 25 et une pour le frontend TypeScript 6. Les analyses importent les
rapports de tests et de couverture déjà produits par JaCoCo et Vitest, appliquent un quality gate
et peuvent s’exécuter dans GitHub Actions uniquement lorsqu’une instance SonarQube et un token ont
été configurés hors du dépôt.

## Périmètre

La phase comprend :

- SonarQube Community Build 26.7 et PostgreSQL 18.4 dans `docker-compose.devops.yml` ;
- un profil Compose `quality` isolé de la stack applicative ;
- un projet SonarQube backend analysé avec SonarScanner for Maven ;
- un projet SonarQube frontend analysé avec SonarScanner for NPM ;
- l’import de JaCoCo XML et LCOV ;
- un workflow GitHub Actions dédié aux analyses de la branche principale ;
- les commandes Make et PowerShell nécessaires ;
- la documentation d’exploitation, de sécurité et de dépannage.

Trivy, Artifactory, les branches/PR SonarQube et toute exposition publique de l’instance sont hors
périmètre. Les deux premiers appartiennent aux phases suivantes ; les analyses de branches et de
Pull Requests ne sont pas disponibles dans Community Build.

## Architecture retenue

Deux projets SonarQube sont utilisés :

| Projet | Clé | Scanner | Sources | Couverture |
|---|---|---|---|---|
| Backend | `devops-store-backend` | SonarScanner for Maven | `backend/src/main/java` | JaCoCo XML |
| Frontend | `devops-store-frontend` | SonarScanner for NPM | `frontend/src` | LCOV |

Cette séparation conserve les métadonnées propres à Maven pour Java, laisse le scanner NPM gérer
le modèle TypeScript et fournit un quality gate lisible par application. Elle évite qu’un scanner
CLI générique doive reconstruire manuellement le classpath Java.

Le flux local est :

1. démarrer le profil `quality` ;
2. remplacer le mot de passe administrateur initial lors de la première connexion ;
3. générer un token d’analyse local et le placer dans `SONAR_TOKEN` pour la session courante ;
4. produire les tests et couvertures backend/frontend ;
5. lancer chaque scanner contre `SONAR_HOST_URL` ;
6. vérifier le statut du quality gate et la présence des tests/couvertures dans les deux projets.

## Stack Compose de qualité

`docker-compose.devops.yml` déclare un projet Compose distinct et un réseau `quality`. Tous les
services appartiennent au profil `quality` afin qu’aucune ressource lourde ne démarre sans demande
explicite.

### PostgreSQL SonarQube

Le service `sonarqube-db` utilise la même image PostgreSQL 18.4 déjà validée dans le dépôt, avec un
volume propre. Le nom de base et l’utilisateur peuvent avoir des valeurs locales non sensibles ;
le mot de passe est obligatoire via `SONAR_DB_PASSWORD` et ne possède aucune valeur par défaut.
Le port PostgreSQL n’est pas publié sur l’hôte.

Le healthcheck utilise `pg_isready`. Le service conserve les protections Compose applicables :
réseau dédié, `no-new-privileges`, limites CPU/mémoire/PID, délai d’arrêt et redémarrage borné.

### SonarQube

Le service `sonarqube` utilise `sonarqube:26.7.0.124771-community`, épinglé au digest multi-
architecture vérifié avant implémentation. Il se connecte uniquement à `sonarqube-db` par variables
`SONAR_JDBC_*`. Le port 9000 est publié sur `127.0.0.1` et paramétrable par `SONAR_PORT`.

Les répertoires `data`, `extensions`, `logs` et `temp` utilisent des volumes nommés. SonarQube
dispose de 3 Gio et PostgreSQL de 512 Mio ; la documentation exige au moins 4 Gio libres pour la
stack et rappelle les prérequis Elasticsearch du moteur Docker. Le healthcheck n’est vert que
lorsque `/api/system/status` renvoie l’état `UP`.

Le conteneur conserve son utilisateur non-root officiel. Aucun montage du socket Docker, aucun
secret en fichier versionné et aucun port d’administration supplémentaire ne sont ajoutés.

## Analyse backend

Le `pom.xml` verrouille la version de `sonar-maven-plugin` dans `build/plugins` sans exécution
implicite et définit
uniquement les propriétés stables du projet : clé, nom, encodage, chemins JaCoCo et rapports de
tests. L’URL et le token ne sont jamais placés dans le POM.

Le scanner s’exécute après `clean verify`, de sorte que bytecode, tests et JaCoCo XML existent. Le
quality gate est attendu de façon synchrone avec une temporisation bornée. Les exclusions se
limitent aux sorties générées ; aucune source métier ou classe de test n’est écartée.

La commande locale de référence reste le Maven Wrapper sous Java 25. La documentation fournit la
forme PowerShell et précise qu’un hôte limité à Java 21 doit utiliser un JDK 25 local temporaire ou
un environnement Java 25 équivalent avant le scan ; elle ne présente pas un build partiel comme
une validation complète.

## Analyse frontend

`@sonar/scan` est ajouté comme dépendance de développement verrouillée par `package-lock.json` et
appelé par un script npm. `frontend/sonar-project.properties` définit la clé, le nom, `src` comme
source, les fichiers `*.spec.ts` comme tests, les tsconfig applicables et le chemin LCOV.

Le scan s’exécute après `npm ci`, lint, tests avec couverture et build. Les exclusions se limitent
à `node_modules`, `dist`, sorties de couverture et fichiers générés. Les tests restent indexés comme
tests et ne sont pas comptés comme sources de production.

TypeScript 6.0.x n’est accepté que si le scan réel 26.7 finit sans erreur de parsing ou de version.
Si ce smoke test échoue pour une incompatibilité confirmée du moteur SonarJS, la première Community
Build compatible est identifiée dans les notes officielles, son image est repinnée, puis toutes les
validations de la phase sont rejouées. Aucun contournement par exclusion des fichiers TypeScript
n’est autorisé.

## Intégration GitHub Actions

Un workflow `quality.yml` distinct s’exécute sur les pushes de `main` affectant le backend, le
frontend ou sa propre configuration, ainsi que par lancement manuel. Community Build ne recevant
que la branche principale, le workflow ne lance pas d’analyse sur les Pull Requests.

Deux jobs indépendants exécutent les scanners dédiés. Chacun commence par un préflight qui vérifie
que `vars.SONAR_HOST_URL` et `secrets.SONAR_TOKEN` sont non vides. En leur absence, le job explique
que l’analyse externe est désactivée et se termine avec succès sans téléchargement ni build lourd.

Lorsque la configuration existe :

- le job backend configure Java 25, prépare la licence AIStor depuis le secret déjà attendu par les
  tests, exécute `clean verify` puis SonarScanner for Maven ;
- le job frontend configure Node 24.18 et Java 25, exécute `npm ci`, lint, tests avec couverture,
  build puis le script SonarScanner for NPM ;
- le token n’est exposé qu’au préflight et aux étapes de scan du workflow qualité ;
- les actions tierces restent épinglées par SHA complet ;
- les deux quality gates sont attendus et peuvent faire échouer leur job.

L’URL est une variable GitHub car elle n’est pas secrète ; le token reste un secret. Le workflow
local n’est pas supposé rendre `localhost:9000` accessible aux runners hébergés : une exécution CI
réelle exige une instance SonarQube joignable depuis GitHub Actions.

## Secrets et sécurité

`.env.example` ajoute uniquement les noms et valeurs non sensibles : port, base et utilisateur.
`SONAR_DB_PASSWORD` reste vide dans l’exemple et obligatoire dans Compose. `SONAR_TOKEN` n’est pas
requis pour démarrer le serveur et sa valeur n’est jamais écrite dans `.env.example`, un POM, un
fichier de propriétés ou la documentation.

La documentation demande de changer le mot de passe administrateur initial avant de générer le
token, d’utiliser un token d’analyse à portée minimale, de le fournir par variable d’environnement
temporaire et de le révoquer lorsqu’il n’est plus utile. Les exemples utilisent des placeholders et
ne reproduisent jamais une valeur réelle.

## Erreurs et exploitation

Les pannes attendues ont un diagnostic explicite :

- PostgreSQL indisponible : inspecter le healthcheck et les logs de `sonarqube-db` ;
- SonarQube bloqué au démarrage : contrôler RAM, volumes et prérequis Elasticsearch ;
- réponse `401`/`403` : vérifier URL, token, révocation et permission d’analyse ;
- couverture absente : vérifier que `clean verify` ou `npm run test:ci` a précédé le scanner et que
  les chemins de rapports existent ;
- erreur Java : vérifier Java 25, bytecode et version verrouillée du scanner Maven ;
- erreur TypeScript 6 : confirmer la version SonarJS dans l’instance avant toute montée de version ;
- quality gate rouge : conserver l’échec et corriger le code ou la configuration, sans désactiver
  le gate implicitement.

L’arrêt normal préserve les volumes. Une commande séparée et explicitement destructive documente
la suppression des volumes de laboratoire ; elle n’est jamais intégrée à la cible d’arrêt standard.

## Validation

La phase est terminée uniquement si les contrôles suivants réussissent :

1. `docker compose -f docker-compose.devops.yml --profile quality config` ;
2. démarrage de PostgreSQL et SonarQube avec états sains ;
3. réponse `UP` de `/api/system/status` ;
4. tests et couvertures générés aux chemins documentés ;
5. scan backend Java 25 sans erreur de parsing/version ;
6. scan frontend TypeScript 6 sans erreur de parsing/version ;
7. tests et couverture visibles dans les deux projets ;
8. quality gates terminés et consultables ;
9. workflow validé par actionlint ;
10. recherche Git confirmant l’absence de token et mot de passe réels ;
11. `git diff --check` sans erreur.

Les validations distantes GitHub Actions et l’accessibilité d’une instance SonarQube externe sont
consignées séparément lorsqu’elles sont effectivement configurées. Elles ne sont jamais simulées.

## Documentation livrée

`docs/devops/sonarqube.md` couvre l’architecture, les prérequis, le premier démarrage, le changement
du mot de passe initial, la création du token, les scans backend/frontend, les quality gates, la CI,
le nettoyage et le dépannage. `docs/README.md`, `README.md`, `.env.example`, `Makefile`,
`AGENTS.md` et la phase 7 du plan directeur sont ajustés uniquement selon les capacités réellement
validées.
