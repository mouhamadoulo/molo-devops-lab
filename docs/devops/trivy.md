# Scans de sécurité Trivy

## Périmètre et politique

Trivy analyse quatre surfaces : le dépôt et ses dépendances (`fs`), les Dockerfiles et futurs
formats IaC pris en charge (`config`), l’image runtime backend et l’image runtime frontend. Le gate
bloque les alertes `HIGH` ou `CRITICAL`. Pour les vulnérabilités, seules celles qui disposent d’un
correctif sont bloquantes (`ignore-unfixed: true`) ; les secrets et mauvaises configurations
conservent le même seuil de sévérité.

Trivy 0.73.0 ne possède pas de scanner `config` natif pour Docker Compose ou GitHub Actions.
`docker compose config` valide Compose, actionlint valide les workflows, et le scanner de secrets
filesystem parcourt néanmoins ces fichiers.

## Versions et provenance

- Trivy : `ghcr.io/aquasecurity/trivy:0.73.0@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c` ;
- Cosign : `gcr.io/projectsigstore/cosign:v3.1.3@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8` ;
- Maven/JDK pour le cache local : `maven:3.9.13-eclipse-temurin-25@sha256:ade3c87e3cdfbe04932afa16b31814cbf60b0122d21d78a76530684a1eeb7cc2`.

Les deux artefacts applicatifs scannés sont `devops-store-backend:local`, construit sur
`eclipse-temurin:25-jre-alpine@sha256:3137541deb3cac6626b5d9a4a2187bc0d6a34312f858bd2c67dd01e732e6b682`,
et `devops-store-frontend:local`, construit sur
`nginxinc/nginx-unprivileged:1.31.3-alpine3.24@sha256:f972e5322b9797dc2a6b830030094426437b1ae7032e4644496395336ac6fdac`.

`make trivy-verify` vérifie la signature keyless de l’image Trivy contre l’identité GitHub Actions
du projet Aqua Security, puis confirme que la version exécutée est exactement 0.73.0.

## Prérequis

- Docker Desktop ou un moteur Docker Linux accessible ;
- GNU Make ;
- accès réseau initial aux registres, aux bases Trivy et à Maven Central ;
- les images `devops-store-backend:local` et `devops-store-frontend:local` pour un scan d’images
  direct. `make security` les construit automatiquement.

Les caches `.trivycache/` et `.m2/`, ainsi que `reports/security/`, sont locaux et ignorés par Git.

## Commandes locales

Depuis la racine :

```powershell
make trivy-verify
make trivy-fs
make trivy-config
make trivy-images
make security
```

`trivy-fs` préremplit `.m2/` avec `dependency:resolve` avant de monter le repository Maven en
lecture seule dans Trivy. `make security` exécute provenance, dépôt, configuration, build des deux
images puis scans d’images dans cet ordre.

## Rapports et quality gate de sécurité

Chaque surface produit un rapport texte et un rapport SARIF sous `reports/security/` :

- `filesystem.txt` et `filesystem.sarif` ;
- `config.txt` et `config.sarif` ;
- `image-backend.txt` et `image-backend.sarif` ;
- `image-frontend.txt` et `image-frontend.sarif`.

Les rapports sont générés avec `exit-code: 0`, puis un troisième passage applique le gate avec
`exit-code: 1`. Ainsi, un échec conserve toujours le diagnostic exploitable. Aucun rapport, cache
ou base Trivy ne doit être indexé.

## GitHub Actions et cadence hebdomadaire

Le workflow `Security` s’exécute sur les Pull Requests et pushes vers `main`, à la demande et chaque
lundi à 05:00 UTC. Sa matrice sépare filesystem et configuration. Le workflow `Docker CI` construit,
charge et analyse indépendamment les images backend et frontend. Les rapports texte et SARIF sont
conservés comme artefacts pendant 14 jours, même lorsque le gate échoue.

## SARIF et Code Scanning optionnel

Le dépôt privé actuel n’a pas Code Scanning activé. Le SARIF reste donc disponible comme artefact.
Pour activer sa publication, définir la variable de dépôt `ENABLE_CODE_SCANNING` à `true` après
activation du service GitHub correspondant.

L’upload est désactivé pour Dependabot et pour les Pull Requests de forks, qui ne disposent pas du
contexte de confiance nécessaire. Les permissions restent limitées à `actions: read`,
`contents: read` et `security-events: write`.

## Politique d’exception

Ne pas créer `.trivyignore.yaml` pour faire passer un gate. Une exception exige une preuve de faux
positif ou d’impossibilité temporaire, l’identifiant exact, le chemin ou paquet concerné, une
justification, un responsable, une date d’expiration et une approbation explicite. À l’échéance,
l’exception est supprimée ou réévaluée avec un nouveau scan.

## Mise à jour de Trivy et des bases

Pour mettre à jour Trivy, choisir une version stable, relever le digest multiarchitecture, vérifier
la signature Cosign, mettre à jour ensemble le Makefile, les workflows et ce guide, puis rejouer
`make security`. Les actions GitHub restent épinglées à des SHA complets.

Les bases sont gérées dans `.trivycache/`. En cas de base incohérente, arrêter les scans, supprimer
uniquement ce cache local, puis relancer la commande. La base Java peut être volumineuse lors du
premier scan d’une image Spring Boot.

## Dépannage

- signature invalide : vérifier le digest Trivy et l’identité de certificat avant toute mise à
  jour ;
- téléchargement de base impossible : vérifier le réseau et les limites du registre, puis relancer
  sans désactiver les mises à jour ;
- Maven Central renvoie `429` : laisser `make trivy-fs` remplir `.m2/`, sans retirer le montage en
  lecture seule côté Trivy ;
- socket Docker inaccessible : vérifier `docker version`, le contexte actif et les permissions sur
  `/var/run/docker.sock` ;
- image absente : exécuter `make build` ou directement `make security` ;
- scan lent : le scanner de secrets relit chaque couche pour les trois sorties ; conserver cette
  couverture et réutiliser les caches plutôt que désactiver le scanner.
