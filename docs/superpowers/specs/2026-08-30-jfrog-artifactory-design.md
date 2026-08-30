# Design de la gestion d’artefacts JFrog

**Date :** 30 août 2026

**Statut :** approuvé le 30 août 2026

## Objectif

La phase 9 doit démontrer un parcours reproductible de publication, résolution et promotion
simple du JAR backend avec JFrog Artifactory. Le parcours garanti utilise Artifactory OSS et Maven,
reste exécutable localement avec Docker Compose et prépare le provisionnement Terraform de la
phase 10. Les identifiants restent hors Git et les capacités commerciales ou propres au registre
Docker ne sont jamais attribuées à l’édition OSS.

## Périmètre

La phase comprend :

- Artifactory OSS et PostgreSQL 17 dans un profil Compose `artifacts` ;
- cinq repositories Maven créés une fois dans l’interface OSS, puis vérifiés par l’API publique ;
- une version Maven CI-friendly, `distributionManagement` et un `settings.xml.example` ;
- la publication des snapshots, des releases candidates et une promotion par checksum deploy ;
- la résolution des artefacts internes et des dépendances Maven Central par un virtual ;
- un job de publication conditionnel dans la CI backend ;
- des commandes Make reproductibles ;
- un profil JFrog Container Registry `registry` réellement déclaratif mais optionnel ;
- la documentation de l’architecture, de l’exploitation, des limites de licence et du dépannage.

Le frontend npm, JFrog CLI, Xray, Distribution, les release bundles, la promotion de build native,
le push d’images Docker en CI, la haute disponibilité et Terraform sont hors périmètre. Terraform
ne pourra gérer les repositories en phase 10 qu’avec une souscription donnant accès aux API de
configuration ; l’édition OSS continuera d’utiliser la création initiale par l’interface.

## Décisions validées

1. Le parcours Maven garanti utilise Artifactory OSS `7.161.20`.
2. Artifactory utilise un PostgreSQL 17 dédié ; Derby et PostgreSQL 18 sont exclus.
3. Le dépôt conserve un Compose explicite, sans embarquer l’archive générée par `config.sh`.
4. Les JSON conservent l’état désiré. Artifactory OSS réserve l’API publique de configuration des
   repositories à l’édition Pro : la création initiale passe donc par l’interface et un contrôle
   idempotent vérifie ensuite leur présence via l’API Storage publique.
5. `main` publie des snapshots ; un tag `vX.Y.Z` publie la candidate Maven `X.Y.Z`.
6. Une promotion explicite copie une candidate vers releases et refuse tout écrasement.
7. Maven résout par un virtual qui n’inclut pas candidates.
8. Le job CI de publication dépend de la vérification backend et ne s’exécute jamais sur une pull
   request.
9. JCR est un profil séparé, optionnel, hors acceptance gate Maven et sans publication Docker CI.
10. JFrog CLI n’est pas une dépendance du parcours ; Maven et les API REST restent visibles.

## Provenance et compatibilité des images

Toutes les images sont épinglées par version et digest d’index multiarchitecture :

| Usage | Référence immuable | Architectures nécessaires |
|---|---|---|
| Artifactory OSS | `releases-docker.jfrog.io/jfrog/artifactory-oss:7.161.20@sha256:b0e71ce0c1cca3a4028c56e5afeacfe7280602f56be961e2c756e5a3deee482a` | `linux/arm64`, `linux/amd64` |
| JFrog Container Registry | `releases-docker.jfrog.io/jfrog/artifactory-jcr:7.161.20@sha256:d17bb796de9e1f77e521e0b28b5121acc1edcc873ef308245865e04c343da2dc` | `linux/arm64`, `linux/amd64` |
| PostgreSQL | `postgres:17.10-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193` | dont `linux/arm64`, `linux/amd64` |
| Client REST | `curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6` | dont `linux/arm64`, `linux/amd64` |

Artifactory `7.161.20` a été publié le 28 août 2026 et sa branche est annoncée supportée jusqu’au
27 janvier 2028. PostgreSQL 17 est supporté par Artifactory 7.161 ; PostgreSQL 18 ne figure pas
encore dans la matrice JFrog. Toute montée de version exige de revérifier disponibilité, digest,
architectures, support PostgreSQL et limites de licence avant modification.

## Architecture Compose

`docker-compose.devops.yml` porte deux ensembles indépendants.

Le profil `artifacts` contient :

- `artifactory-db`, PostgreSQL 17 non exposé sur l’hôte ;
- `artifactory`, Artifactory OSS exposé uniquement sur
  `127.0.0.1:${ARTIFACTORY_PORT:-8082}:8082` ;
- un réseau interne `artifacts` ;
- un volume PostgreSQL et un volume Artifactory séparés.

Le profil `registry` contient :

- `jcr-db`, PostgreSQL 17 non exposé sur l’hôte ;
- `jcr`, JFrog Container Registry exposé uniquement sur
  `127.0.0.1:${JCR_PORT:-8084}:8082` ;
- un réseau interne `registry` ;
- des volumes propres, sans partage avec Artifactory OSS.

Les profils peuvent techniquement coexister grâce aux ports, réseaux, bases et volumes distincts.
La documentation recommande néanmoins de les exécuter séparément. Chaque instance JFrog est
bornée à 4 Go de RAM avec une JVM de laboratoire explicitement limitée ; cette valeur correspond à
un environnement de test et non au minimum de production JFrog. PostgreSQL dispose d’une limite
séparée et plus faible. Les limites CPU, PID, délais d’arrêt et redémarrages suivent les conventions
du profil SonarQube existant.

PostgreSQL doit être sain avant le démarrage de JFrog. La readiness JFrog utilise
`GET /router/api/v1/system/readiness`, qui vérifie les microservices de la plateforme. Les outils
manquants dans l’image UBI Micro ne sont pas supposés présents : le healthcheck ouvre
`/dev/tcp/127.0.0.1/8082` avec Bash, envoie une requête HTTP `GET` et vérifie une ligne de statut
`200` avec les seuls builtins Bash. Il ne dépend ni de `curl`, ni de `wget`, ni de `grep` dans
l’image JFrog. Le client REST épinglé reste réservé au bootstrap et aux validations externes.

L’arrêt ordinaire préserve les volumes. Les suppressions de volumes ne sont exposées que par des
cibles `artifacts-reset` et `registry-reset` explicitement destructives et documentées.

## Configuration et secrets

`.env.example` fournit uniquement des paramètres non sensibles ou des emplacements vides :

- `ARTIFACTORY_PORT`, `ARTIFACTORY_DB_NAME`, `ARTIFACTORY_DB_USERNAME` ;
- `ARTIFACTORY_DB_PASSWORD` vide ;
- `JFROG_URL=http://localhost:8082/artifactory` ;
- `JFROG_ADMIN_TOKEN`, `JFROG_USERNAME` et `JFROG_TOKEN` vides ;
- `JCR_PORT`, `JCR_DB_NAME`, `JCR_DB_USERNAME` ;
- `JCR_DB_PASSWORD` vide.

Compose refuse le démarrage du profil concerné si son mot de passe de base manque. Les scripts
refusent de démarrer si le token requis manque. Les variables sensibles ne sont jamais fournies en
argument de commande, imprimées, copiées dans un rapport ou écrites dans un fichier généré.

Le premier onboarding JFrog reste explicite : démarrer Artifactory, ouvrir l’UI, remplacer
immédiatement `admin/password`, générer un identity/reference token administrateur, puis fournir ce
token localement, créer les cinq repositories depuis les définitions documentées, puis lancer la
vérification. Le token administrateur sert uniquement aux contrôles et à la promotion. Maven et la
CI utilisent un utilisateur/token distinct à privilèges minimaux.

## Topologie Maven

La topologie attendue contient les repositories suivants :

| Repository | Classe | Politique |
|---|---|---|
| `devops-store-snapshots-local` | local Maven | snapshots uniquement |
| `devops-store-candidates-local` | local Maven | releases candidates uniquement |
| `devops-store-releases-local` | local Maven | releases promues uniquement |
| `maven-central-remote` | remote Maven | proxy de `https://repo.maven.apache.org/maven2/` |
| `devops-store-maven-virtual` | virtual Maven | releases, snapshots et Central ; candidates exclu |

Le virtual place releases avant snapshots puis Central. Candidates est volontairement absent : une
release ne devient consommable par le point d’entrée normal qu’après promotion. Les repositories de
release refusent les snapshots. Le snapshot local refuse les releases et conserve un nombre borné
de snapshots uniques.

Chaque configuration complète est conservée sous `infrastructure/jfrog/repositories/` comme état
désiré et guide de création dans l’interface. Le vérificateur conteneurisé interroge
`/api/storage/{repository}` pour chacun des cinq noms, échoue si le token est refusé ou si un dépôt
manque, et ne modifie jamais la plateforme. Deux exécutions successives doivent réussir avec le
même résultat. Les politiques non exposées par l’API OSS sont validées par les parcours Maven :
publication snapshot/candidate, résolution par le virtual et exclusion des candidates.

## Configuration Maven

Le POM adopte les propriétés Maven CI-friendly :

```xml
<version>${revision}</version>

<properties>
    <revision>0.1.0-SNAPSHOT</revision>
</properties>
```

`distributionManagement` emploie deux identifiants stables :

- `devops-store-snapshots` vers `devops-store-snapshots-local` ;
- `devops-store-candidates` vers `devops-store-candidates-local`.

Les URLs sont construites à partir de `JFROG_URL`. Le fichier
`infrastructure/jfrog/settings.xml.example` définit les mêmes identifiants de serveur et lit
`JFROG_USERNAME` et `JFROG_TOKEN` depuis l’environnement. Il configure
`devops-store-maven-virtual` comme miroir de résolution afin que dépendances et plugins passent par
Artifactory. Aucun profil Maven ne contourne silencieusement le virtual.

La résolution d’acceptance utilise un cache Maven neuf et un consommateur séparé du projet source.
Elle doit donc télécharger le GAV demandé depuis le virtual au lieu de le trouver dans le reactor
ou dans le repository local habituel.

## Publication et promotion

Le flux de publication est le suivant :

```text
main -> 0.1.0-SNAPSHOT -> devops-store-snapshots-local
tag vX.Y.Z -> X.Y.Z -> devops-store-candidates-local
promotion X.Y.Z -> checksum deploy POM/JAR -> devops-store-releases-local
résolution normale -> devops-store-maven-virtual
```

Une promotion reçoit une version Maven stricte `X.Y.Z`, sans préfixe `v` et sans suffixe
`SNAPSHOT`. Elle vérifie l’existence du répertoire candidat
`com/molo/devops-store-backend/X.Y.Z`, lit les checksums du POM et du JAR, puis effectue un
checksum deploy vers releases. Candidates reste la trace du jalon ; aucun move destructif n’est
effectué. Une reprise partielle est acceptée seulement si le checksum cible correspond exactement.

Après la copie, le script récupère l’artefact depuis le virtual avec un cache Maven vierge. Une
release déjà présente est immuable du point de vue de ce parcours : la promotion refuse de
l’écraser, même si le token administrateur pourrait techniquement le faire.

## GitHub Actions

`.github/workflows/backend-ci.yml` reste la source de la vérification backend. Il ajoute les tags
`v*` à ses déclenchements et prend en compte les fichiers JFrog qui influencent Maven.

Le job `verify` conserve `clean verify`, ses tests PostgreSQL/AIStor et ses rapports. Un job
`publish` séparé :

- dépend du succès de `verify` sur le même SHA ;
- ne s’exécute que pour un push sur `main` ou un tag correspondant strictement à `vX.Y.Z` ;
- détecte `JFROG_URL`, `JFROG_USERNAME` et `JFROG_TOKEN` sans exposer leur valeur ;
- termine proprement avec un message de désactivation si la configuration manque ;
- utilise `0.1.0-SNAPSHOT` sur `main` et retire le préfixe `v` sur un tag ;
- reconstruit le package avec tests ignorés uniquement parce que `verify` a déjà validé le même
  SHA dans le job requis ;
- exécute Maven avec le `settings.xml.example` du dépôt ;
- transmet les credentials uniquement par environnement ;
- ne promeut jamais automatiquement une candidate.

Les pull requests ne reçoivent aucun secret JFrog et ne publient jamais. Les actions restent
épinglées par SHA complet. La publication Docker n’est pas ajoutée au workflow Docker de la phase
8. Le token CI doit lire le virtual et déployer vers snapshots/candidates, sans permission de
suppression ou d’écrasement sur releases.

## Profil JCR optionnel

Le profil `registry` prouve la séparation entre gestion Maven OSS et registre Docker/OCI. Il utilise
l’image JCR, sa propre base et ses propres volumes. Il ne crée aucun repository Docker pendant
l’acceptance Maven, ne reçoit aucun secret CI et ne déclenche aucun push d’image.

La validation obligatoire couvre la résolution Compose, les variables requises, le digest et les
architectures. Le démarrage complet de JCR est une validation manuelle optionnelle, documentée
séparément, car lancer simultanément OSS et JCR dépasserait raisonnablement les ressources du
laboratoire. Cette limite est présentée explicitement et n’est pas comptée comme une réussite de
publication Docker.

## Commandes locales

Le Makefile expose :

- `artifacts-config`, `artifacts-up`, `artifacts-down`, `artifacts-status`, `artifacts-logs` ;
- `artifacts-reset`, seule cible Artifactory qui supprime les volumes ;
- `artifacts-verify`, idempotent et non destructif ; `artifacts-bootstrap` reste un alias ;
- `artifacts-publish-snapshot` ;
- `artifacts-publish-candidate VERSION=X.Y.Z` ;
- `artifacts-promote VERSION=X.Y.Z` ;
- `artifacts-resolve VERSION=X.Y.Z` ;
- `registry-config`, `registry-up`, `registry-down`, `registry-status`, `registry-logs` ;
- `registry-reset`, seule cible JCR qui supprime ses volumes.

Les commandes Compose directes équivalentes sont documentées pour PowerShell. Les commandes Maven
s’exécutent depuis `backend/` ou dans l’image Maven déjà épinglée quand un cache isolé est requis.
Aucune commande globale JFrog, Maven ou curl supplémentaire n’est supposée disponible.

## Gestion des erreurs

Les erreurs suivantes arrêtent le parcours avec un diagnostic précis :

- secret ou paramètre obligatoire manquant ;
- PostgreSQL malsain ou readiness JFrog non atteinte dans le délai borné ;
- authentification JFrog refusée ;
- statut HTTP inattendu ou réponse de repository incohérente ;
- repository existant d’une autre classe ;
- publication snapshot vers candidates ou release vers snapshots ;
- tag ne respectant pas `vX.Y.Z` ;
- candidate ou fichier Maven attendu absent ;
- tentative de promotion d’un snapshot ;
- release cible déjà existante ;
- échec de résolution depuis le virtual avec cache vierge.

Les scripts n’interprètent jamais un `400`, `401`, `403`, `404` inattendu ou `5xx` comme un succès.
Ils ne suppriment ni repository ni artefact pour réparer automatiquement une divergence. Les logs
indiquent le repository, l’opération et le statut, mais jamais la valeur d’un credential.

## Documentation et état du projet

`docs/devops/jfrog-artifactory.md` décrit :

- architecture OSS/PostgreSQL et séparation JCR ;
- prérequis de ressources et limites de laboratoire ;
- onboarding initial sécurisé ;
- variables et commandes Compose/Make ;
- topologie Maven, création initiale dans l’interface OSS et vérification idempotente ;
- publication snapshot/candidate, promotion et résolution ;
- secrets et déclenchements GitHub Actions ;
- différences entre GitHub, Actions, Artifactory OSS et JCR ;
- dépannage des healthchecks, permissions, bases, API et caches Maven ;
- prérequis de licence avant toute gestion Terraform en phase 10.

`README.md`, `docs/README.md`, `.env.example`, `AGENTS.md` et
`docs/IMPLEMENTATION_PLAN.md` sont mis à jour uniquement pour les capacités réellement validées.
Le README ne présente pas JCR comme livré tant que seul son profil statique est validé. La phase 9
n’est marquée terminée qu’après le parcours Maven réel et les validations locales applicables.

## Validation

La phase est terminée uniquement si :

1. les quatre références d’image correspondent aux digests et architectures documentés ;
2. les profils `artifacts` et `registry` passent `docker compose config` avec leurs variables ;
3. PostgreSQL 17 et Artifactory OSS démarrent et deviennent sains dans un délai borné ;
4. la readiness Router renvoie un succès ;
5. le vérificateur réussit deux fois et les parcours Maven prouvent les politiques attendues ;
6. un snapshot est publié dans snapshots et résolu depuis le virtual avec un cache vierge ;
7. une release est publiée dans candidates et reste absente du virtual avant promotion ;
8. la promotion copie la release vers releases, refuse un second passage et rend la release
   résoluble depuis le virtual ;
9. les credentials proviennent exclusivement de variables locales ou secrets GitHub ;
10. les tests backend continuent à réussir avec la version CI-friendly ;
11. le workflow passe actionlint et ne publie ni depuis une pull request ni sans configuration ;
12. `make trivy-config`, `git diff --check` et les recherches de secrets ne révèlent aucune
    mauvaise configuration bloquante, erreur de whitespace ou valeur sensible versionnée ;
13. le profil JCR est validé statiquement sans être présenté comme un registre Docker opérationnel
    ou comme une capacité d’Artifactory OSS ;
14. la documentation, l’index et le plan directeur reflètent exactement les validations obtenues.

Les validations locales et GitHub sont consignées séparément. Un job de publication non exécuté
faute de secrets, un profil JCR non démarré ou une publication distante non testée ne sont jamais
annoncés comme réussis.

## Références officielles

- [JFrog — Feature Comparison Matrix](https://docs.jfrog.com/installation/docs/feature-comparison-matrix-for-self-mangaged-jpds)
- [JFrog — Artifactory Docker Installation](https://docs.jfrog.com/installation/docs/docker)
- [JFrog — Artifactory Database Requirements](https://docs.jfrog.com/installation/docs/artifactory-database-requirements)
- [JFrog — Maven Repositories](https://docs.jfrog.com/artifactory/docs/maven-repositories)
- [JFrog — Identity Tokens](https://docs.jfrog.com/user-management/docs/identity-tokens)
- [JFrog — Load Balancer health probes](https://docs.jfrog.com/installation/docs/load-balancer)
- [JFrog — Artifactory End of Life](https://docs.jfrog.com/releases/docs/artifactory-end-of-life)
