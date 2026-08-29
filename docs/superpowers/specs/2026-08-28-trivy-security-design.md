# Design des scans de sécurité Trivy

**Date :** 28 août 2026

**Statut :** approuvé le 29 août 2026

## Objectif

La phase 8 doit fournir des scans Trivy reproductibles et bloquants pour le dépôt, les
dépendances, les secrets, les mauvaises configurations, les images Docker backend/frontend et
l’infrastructure as code. Les mêmes règles s’appliquent localement et dans GitHub Actions. Chaque
surface produit un diagnostic lisible et un rapport SARIF sans masquer l’échec du quality gate de
sécurité.

## Périmètre

La phase comprend :

- Trivy 0.73.0 épinglé et une procédure de vérification de provenance ;
- un scan filesystem du dépôt avec les scanners vulnérabilités, mauvaises configurations et
  secrets ;
- un scan de configuration dédié aux Dockerfiles et aux formats IaC natifs pris en charge dans le
  futur dossier `infrastructure/` ;
- un scan de chacune des images runtime backend et frontend ;
- des cibles Make locales ;
- un workflow `security.yml` pour le dépôt et l’IaC ;
- l’intégration des scans d’images dans le workflow Docker existant ;
- des rapports texte et SARIF conservés comme artefacts GitHub Actions ;
- une politique d’exception bornée et documentée ;
- la documentation d’exploitation, de résolution des alertes et de mise à jour de Trivy.

Artifactory, la publication d’images, Kubernetes/Terraform et l’activation payante de GitHub Code
Scanning sont hors périmètre. Les futurs fichiers IaC seront automatiquement couverts par le scan
de la racine, mais la phase 8 ne crée pas d’infrastructure fictive pour les tester.

## Décisions validées

Les décisions suivantes ont été approuvées :

1. Trivy 0.73.0 remplace la référence 0.72.0 devenue obsolète dans le plan directeur.
2. Les deux images sont scannées de manière bloquante sur chaque pull request.
3. Les builds Docker existants sont réutilisés ; les images ne sont pas reconstruites dans un
   second workflow.
4. Les vulnérabilités `HIGH` et `CRITICAL` ne bloquent que si un correctif est disponible.
5. Les secrets et mauvaises configurations `HIGH` et `CRITICAL` bloquent toujours.
6. Aucun ignore préventif n’est ajouté.
7. Un scan hebdomadaire complète les contrôles de pull request et de `main` afin de détecter les
   nouvelles vulnérabilités sans modification du code.

## Provenance de Trivy

L’exécution locale utilise l’image officielle multiarchitecture
`ghcr.io/aquasecurity/trivy:0.73.0@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c`.
Le tag `latest` est interdit. Une cible `trivy-verify` exécute la vérification Cosign keyless avec
l’identité de certificat des workflows de release Aqua Security et l’émetteur OIDC GitHub
Actions. Cosign utilise l’image multiarchitecture
`gcr.io/projectsigstore/cosign:v3.1.3@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8`.

GitHub Actions utilise `aquasecurity/trivy-action` à la release stable `v0.36.0`, épinglée au
commit complet `a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8`, avec
`version: v0.73.0`. L’installateur contrôle l’artefact de release contre les checksums publiés et
chaque job confirme `trivy --version` avant le premier scan. Les appels suivants réutilisent le
même binaire et le même cache au lieu de réinstaller une version implicite.

La procédure de montée de version exige de vérifier la release immuable, les bundles Sigstore, le
digest de l’image et le SHA de l’action, puis de rejouer l’acceptance gate complet. Dependabot peut
proposer les mises à jour de l’action épinglée ; la version Trivy et le digest restent une décision
explicite.

## Configuration commune

Un fichier `trivy.yaml` à la racine centralise les réglages stables : cache local sous
`.trivycache/`, sévérités `HIGH,CRITICAL` et politique de vulnérabilités corrigibles. Les formats,
sorties, références scannées et scanners propres à chaque surface restent explicites dans Make et
les workflows. Trivy ne charge `.trivyignore.yaml` que si une exception approuvée impose la
création de ce fichier.

Les chemins générés et volumineux déjà hors périmètre fonctionnel sont exclus : `.git`, caches,
`backend/target`, `frontend/node_modules`, `frontend/dist`, couverture et rapports de sécurité.
Les fichiers source, manifests, lockfiles, Dockerfiles, fichiers Compose et workflows GitHub ne
sont jamais exclus globalement. Trivy 0.73.0 ne fournit toutefois pas de scanner `config` natif
pour Docker Compose ou GitHub Actions : Compose reste validé par `docker compose config`, les
workflows par actionlint, et le scanner de secrets filesystem continue de parcourir ces fichiers.

Les rapports locaux sont écrits sous `reports/security/`, répertoire ignoré par Git. Le cache
`.trivycache/` reste ignoré. Le scan filesystem préremplit un cache Maven isolé sous `.m2/` avec
l’image Maven épinglée, afin d’éviter une résolution distante implicite par Trivy ; ce cache est
lui aussi ignoré et exclu des surfaces scannées. Aucun rapport généré, base Trivy ou secret n’est
versionné.

## Matrice de scans

| Surface | Commande Trivy | Scanners | Référence | Gate |
|---|---|---|---|---|
| Dépôt | `trivy fs` | `vuln,misconfig,secret` | `.` | `HIGH,CRITICAL`; vulnérabilités corrigibles seulement |
| IaC/configuration | `trivy config` | mauvaises configurations | `.` | toutes les alertes `HIGH,CRITICAL` |
| Image backend | `trivy image` | `vuln,misconfig,secret` | `devops-store-backend:local` | vulnérabilités corrigibles et autres alertes `HIGH,CRITICAL` |
| Image frontend | `trivy image` | `vuln,misconfig,secret` | `devops-store-frontend:local` | vulnérabilités corrigibles et autres alertes `HIGH,CRITICAL` |

Le scan filesystem conserve volontairement les mauvaises configurations même si le scan
`config` les couvre aussi : le premier satisfait le contrôle global du dépôt, tandis que le second
fournit un rapport IaC autonome et extensible. La duplication éventuelle d’une alerte est acceptée
et distinguée par le nom de surface.

## Politique de blocage

Chaque surface suit trois étapes avec la même base de vulnérabilités :

1. générer un rapport texte avec `exit-code 0` ;
2. générer un SARIF limité à `HIGH,CRITICAL` avec `exit-code 0` ;
3. rejouer le contrôle lisible avec `exit-code 1` pour appliquer le gate.

Cette séquence garantit la création des rapports avant l’échec bloquant. Le dernier passage reste
visible dans les logs de CI et ne porte pas `continue-on-error`. Les étapes d’upload utilisent
`if: always()` afin que les rapports déjà créés restent disponibles après un échec.

`--ignore-unfixed` s’applique uniquement au scanner de vulnérabilités. Il ne réduit ni les secrets
ni les mauvaises configurations. La CI ne transforme jamais automatiquement une alerte en ignore.

## Exceptions

Le fichier `.trivyignore.yaml` n’est créé que si un scan réel révèle une alerte qui ne peut pas
être corrigée raisonnablement dans la phase. Une exception acceptable doit :

- cibler un identifiant Trivy/CVE précis et, lorsque possible, un chemin précis ;
- fournir une justification technique vérifiable ;
- utiliser le champ d’expiration natif ;
- être inscrite dans le registre de `docs/devops/trivy.md` avec responsable et date de révision ;
- être refusée si une mise à niveau, une correction de configuration ou une rotation de secret est
  possible.

Les wildcards globales, exclusions de dossier métier, ignores sans échéance et suppressions de
sévérité sont interdits. Une fausse alerte de secret doit utiliser une règle d’autorisation aussi
étroite que possible plutôt qu’une exclusion de tout le fichier.

## Commandes locales

Le Makefile expose les interfaces suivantes :

- `trivy-verify` : vérifier la signature et afficher la version attendue ;
- `trivy-fs` : produire les rapports dépôt puis appliquer le gate ;
- `trivy-config` : produire les rapports IaC puis appliquer le gate ;
- `trivy-images` : analyser les deux tags locaux existants ;
- `security` : vérifier la provenance, construire les images nécessaires et exécuter les quatre
  surfaces dans un ordre déterministe.

`trivy-images` diagnostique clairement une image absente. `security` est la commande complète qui
assure leur construction. Les montages Docker donnent à Trivy un accès en lecture seule au dépôt,
un volume en écriture limité au cache et au répertoire de rapports, ainsi que le socket Docker
uniquement pour les scans d’images qui l’exigent.

Les commandes documentées restent compatibles avec GNU Make depuis PowerShell, Linux et macOS.
Une installation globale de Trivy n’est pas requise.

Le scan Maven réutilise le repository isolé `.m2/repository` en lecture seule. Le workflow
filesystem configure Java 25 et exécute `dependency:resolve` avant Trivy afin d’éviter les
résolutions POM répétées et les limitations Maven Central ; le job IaC n’effectue pas ce travail.

## Workflow dépôt et IaC

`.github/workflows/security.yml` s’exécute :

- sur toutes les pull requests ;
- sur les pushes de `main` ;
- manuellement avec `workflow_dispatch` ;
- chaque semaine à heure UTC fixe.

Deux jobs indépendants analysent le dépôt et la configuration. Ils possèdent uniquement
`contents: read`, sauf la permission `security-events: write` nécessaire à l’upload SARIF optionnel.
Toutes les actions tierces sont épinglées par SHA complet. Le cache Trivy est borné aux bases et au
binaire de la version choisie.

Chaque job publie un artefact nommé par surface et commit, avec une rétention limitée. Les rapports
ne contiennent pas de valeur de secret brute : le comportement de masquage de Trivy est conservé et
les logs ne réaffichent jamais les fichiers détectés.

## Scans d’images dans le workflow Docker

Les jobs backend et frontend de `.github/workflows/docker.yml` continuent à construire les
Dockerfiles actuels. Leur sortie est chargée dans le daemon du runner avec les tags matriciels
`devops-store-backend:ci` et `devops-store-frontend:ci`. Chaque job installe ensuite la même version
Trivy, génère ses deux rapports, publie l’artefact même en cas d’échec et applique le gate avant de
terminer.

Cette intégration évite deux builds supplémentaires et garde le scan près de l’artefact réellement
construit. Aucun push vers un registre et aucun secret de registre ne sont ajoutés.

## SARIF et dépôt GitHub privé

Le dépôt est privé et GitHub Code Scanning y est actuellement désactivé, ce que l’API renvoie en
`403`. Le SARIF est donc toujours conservé comme artefact GitHub Actions et constitue la capacité
livrée par défaut.

Une étape `github/codeql-action/upload-sarif` épinglée est présente mais ne s’exécute que lorsque la
variable de dépôt `ENABLE_CODE_SCANNING` vaut `true` et que l’acteur n’est pas Dependabot. Sans
cette variable, aucun échec ni avertissement trompeur n’est produit. La documentation explique le
prérequis GitHub Code Security et la manière d’activer ensuite l’intégration sans modifier la
politique de scan.

Les pull requests Dependabot exécutent toujours les gates et publient leurs artefacts. Elles
n’essaient pas d’envoyer du SARIF à Code Scanning, car leur `GITHUB_TOKEN` est limité en lecture.

## Documentation et état du projet

`docs/devops/trivy.md` décrit :

- l’architecture et les quatre surfaces ;
- les prérequis Docker/Cosign et les commandes Make ;
- l’interprétation des rapports ;
- la politique de sévérité, correction et exception ;
- les déclenchements CI, artefacts et activation facultative de Code Scanning ;
- la mise à jour sûre de Trivy et de sa base ;
- le dépannage réseau, base de vulnérabilités, daemon Docker et faux positifs.

`README.md`, `docs/README.md`, `AGENTS.md`, `Makefile`, `.gitignore` et
`docs/IMPLEMENTATION_PLAN.md` sont ajustés uniquement selon les capacités réellement validées. Le
plan directeur est mis à jour vers Trivy 0.73.0 et la phase 8 n’est marquée terminée qu’après les
scans réels.

## Gestion des erreurs

Les erreurs attendues ont un diagnostic explicite :

- signature invalide ou digest déplacé : arrêt immédiat avant tout scan ;
- téléchargement de base impossible : échec visible, sans réutilisation silencieuse d’une base
  inconnue ;
- image locale absente : indiquer la commande de build requise ;
- daemon Docker inaccessible : distinguer cette panne d’une alerte de vulnérabilité ;
- alerte bloquante : conserver les rapports et corriger avant tout ignore ;
- SARIF Code Scanning indisponible : conserver l’artefact, sans masquer le résultat du gate ;
- secret détecté : ne jamais imprimer sa valeur ni le copier dans un ticket ou une documentation.

## Validation

La phase est terminée uniquement si les contrôles suivants réussissent :

1. la signature Cosign de l’image Trivy épinglée est valide ;
2. `trivy --version` renvoie 0.73.0 localement et dans les workflows configurés ;
3. le scan filesystem produit ses rapports et respecte le gate ;
4. le scan de configuration couvre les deux Dockerfiles et les formats IaC natifs présents ; les
   fichiers Compose et workflows sont validés par leurs contrôleurs dédiés ;
5. les images backend et frontend sont construites, chargées et scannées ;
6. les quatre surfaces ne contiennent aucune alerte bloquante non traitée ;
7. toute exception éventuelle respecte le registre et son expiration ;
8. les workflows sont valides avec actionlint et toutes leurs actions sont épinglées ;
9. les artefacts texte/SARIF sont produits même lors d’un test d’échec contrôlé ;
10. les validations backend/frontend existantes restent vertes en proportion des fichiers
    touchés ;
11. la recherche de secrets, `git status` et `git diff --check` ne révèlent aucun artefact, cache,
    secret ou erreur de whitespace versionné.

Les résultats locaux et distants sont consignés séparément. Une exécution GitHub Actions ou une
publication Code Scanning non disponible n’est jamais présentée comme réussie.
