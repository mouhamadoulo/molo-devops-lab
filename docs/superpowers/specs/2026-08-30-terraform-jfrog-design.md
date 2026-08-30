# Terraform JFrog Design

**Date :** 30 août 2026
**Statut :** conception validée, implémentation à planifier
**Phase :** 10 — Terraform

## Contexte

La phase 9 fournit Artifactory OSS 7.161.20 et cinq repositories Maven créés initialement dans
l’interface, puis vérifiés par les outils locaux : releases, snapshots, candidates, Maven Central
remote et virtual. La phase 10 doit préparer leur gestion comme code avec Terraform sans attribuer
à l’édition OSS des API que JFrog réserve aux souscriptions Pro et Enterprise.

Terraform n’est pas installé sur l’hôte au démarrage de la phase. HashiCorp publie néanmoins
Terraform 1.15.4 pour Windows ARM64. Le provider `jfrog/artifactory` 12.11.3 expose les trois types
de ressources Maven requis, mais sa documentation et l’API JFrog de création de repositories
exigent une édition sous licence. Aucune licence Pro ou Enterprise n’est disponible pour ce
laboratoire.

## Objectifs

- fournir un module racine Terraform Pro-ready représentant exactement les cinq repositories de
  la phase 9 ;
- verrouiller Terraform 1.15.4 et le provider `jfrog/artifactory` 12.11.3 ;
- empêcher un plan réel accidentel tant que l’utilisateur n’atteste pas disposer des API Pro ;
- injecter URL et token sans secret versionné ;
- vérifier sans instance ni API JFrog la structure et le comportement déclaratif avec un provider
  simulé ;
- documenter l’import sûr des repositories existants, l’apply et le contrôle d’idempotence pour
  une future édition Pro ;
- distinguer les preuves réellement obtenues sous OSS des validations Pro reportées.

## Hors périmètre

- installer, activer ou contourner une licence JFrog ;
- remplacer le provider par `null_resource`, `local-exec`, un script shell ou des appels REST ;
- gérer Artifactory, PostgreSQL, Docker Compose, utilisateurs, permissions ou tokens avec
  Terraform ;
- créer un backend d’état distant ;
- appliquer, importer ou détruire des ressources contre l’instance OSS actuelle ;
- ajouter Terraform à la CI tant qu’aucune instance Pro de test n’est disponible.

## Architecture

Le dossier `infrastructure/terraform/` contient un module racine unique et pédagogique :

```text
infrastructure/terraform/
├── providers.tf
├── variables.tf
├── main.tf
├── outputs.tf
├── terraform.tfvars.example
├── tests/
│   └── repositories.tftest.hcl
└── .terraform.lock.hcl
```

`providers.tf` fixe `required_version = "= 1.15.4"` et
`jfrog/artifactory = "= 12.11.3"`. Le provider reçoit l’URL et le token depuis les variables du
module. Les valeurs réelles sont fournies uniquement par `TF_VAR_artifactory_url` et
`TF_VAR_artifactory_access_token`.

`main.tf` déclare directement les cinq ressources JFrog. Les références de clés entre ressources
donnent à Terraform le graphe de dépendances du virtual sans `depends_on` artificiel. Aucun module
enfant ni abstraction générique n’est ajouté : cinq ressources explicites restent plus lisibles
pour le laboratoire.

## Frontière de licence

Une variable booléenne `confirm_pro_repository_api` vaut `false` par défaut. Une ressource
`terraform_data` porte une précondition exigeant la valeur `true`; les cinq repositories dépendent
de ce garde. Un `terraform plan` réel sans confirmation échoue avec un message expliquant que les
API de configuration nécessitent Artifactory Pro ou Enterprise.

Ce garde représente une confirmation opérateur, pas une détection automatique de licence. Il ne
doit jamais être activé contre l’instance OSS actuelle. Les tests simulés l’activent uniquement
dans leur état éphémère et n’appellent aucune API JFrog.

## Topologie Maven déclarée

### Repositories locaux

- `devops-store-releases-local` accepte les releases et refuse les snapshots ;
- `devops-store-candidates-local` accepte les releases et refuse les snapshots ;
- `devops-store-snapshots-local` refuse les releases, accepte les snapshots, conserve cinq
  snapshots uniques et utilise `snapshot_version_behavior = "unique"` ;
- les trois utilisent `repo_layout_ref = "maven-2-default"`.

### Repository remote

`maven-central-remote` cible `https://repo.maven.apache.org/maven2/`, utilise le layout Maven 2,
accepte les releases et refuse les snapshots. Il n’embarque aucun credential distant.

### Repository virtual

`devops-store-maven-virtual` agrège dans cet ordre :

1. `devops-store-releases-local` ;
2. `devops-store-snapshots-local` ;
3. `maven-central-remote`.

Le repository candidates reste exclu jusqu’à la promotion. Le déploiement par défaut cible
`devops-store-snapshots-local`. Le schéma Maven 12.11.3 n’expose pas `allow_delete`; toute future
destruction exige donc une revue explicite de `terraform plan -destroy` avant exécution.

## Variables et outputs

`artifactory_url` est une chaîne obligatoire validée comme URL HTTP(S) se terminant par
`/artifactory`, sans slash final. `artifactory_access_token` est une chaîne obligatoire,
`sensitive = true`, sans valeur par défaut. `confirm_pro_repository_api` est le booléen de garde.

`terraform.tfvars.example` ne contient aucun token. Il montre uniquement une URL d’exemple non
privée et laisse la confirmation Pro à `false`, avec un commentaire renvoyant vers les variables
d’environnement.

Les outputs non sensibles exposent les URLs complètes de résolution virtual, de déploiement
snapshot, de déploiement candidate et de release. Aucun output ne contient le token ou une valeur
dérivée de celui-ci.

## État, import et cycle de vie

L’état reste local pour ce laboratoire. `.terraform/`, `*.tfstate`, `*.tfstate.*` et `*.tfplan`
restent ignorés. `.terraform.lock.hcl` est versionné et verrouille les checksums du provider pour
Windows ARM64, Linux AMD64 et Linux ARM64.

Sur une future instance Pro contenant les repositories de phase 9, l’opérateur :

1. définit les trois variables `TF_VAR_*` nécessaires ;
2. exécute `terraform init` ;
3. importe chaque ressource avec sa clé JFrog ;
4. examine le plan avant toute écriture ;
5. aligne explicitement la configuration ou applique les différences approuvées ;
6. exécute un second plan et exige `No changes`.

L’import précède toujours l’apply afin d’éviter un conflit de création ou un doublon. Le module ne
déclare que les cinq repositories du laboratoire et le garde `terraform_data`; un destroy ne peut
donc cibler aucun service, volume, compte ou repository extérieur.

## Gestion des erreurs et sécurité

- une URL mal formée échoue lors de la validation des variables ;
- l’absence de confirmation Pro bloque le plan avant toute mutation autorisée ;
- l’absence de token bloque un parcours réel sans fournir de valeur de secours ;
- les credentials ne figurent ni dans HCL suivi, ni dans le tfvars d’exemple, ni dans les outputs ;
- l’état et les plans binaires sont traités comme sensibles même si le token sert seulement à la
  configuration du provider ;
- aucune commande documentée n’affiche les variables d’environnement ou le contenu de l’état ;
- les imports sont exécutés une ressource à la fois ; le premier plan global est ensuite relu avant
  apply.

## Stratégie de test

Les validations exécutables sans licence sont :

```powershell
Set-Location infrastructure/terraform
terraform init
terraform fmt -check -recursive
terraform validate
terraform test
```

`tests/repositories.tftest.hcl` utilise `mock_provider "artifactory" {}` et des runs
`command = plan`. Il fournit une URL et un token factices, active le garde dans le contexte du test
et vérifie :

- les cinq clés et les trois types de ressources ;
- les politiques releases/snapshots et la rétention des snapshots ;
- l’URL et les politiques de Maven Central ;
- l’ordre d’agrégation du virtual, l’exclusion de candidates et son repository de déploiement ;
- les quatre outputs non sensibles ;
- l’échec attendu lorsque la confirmation Pro reste à `false`.

Le provider simulé valide le schéma et le graphe HCL sans credentials ni appel serveur. Il ne
prouve pas la compatibilité avec une instance Pro, l’import, l’apply, l’idempotence ou le destroy.

La validation de dépôt ajoute `git diff --check`. Le scan Trivy de configuration existant doit
continuer à couvrir automatiquement `infrastructure/terraform/`.

## Documentation et état de phase

`docs/infrastructure/terraform.md` explique installation, variables, validations simulées,
frontière OSS/Pro, import, plan, apply, second plan et destroy. `docs/README.md`, `README.md`,
`AGENTS.md` et `docs/IMPLEMENTATION_PLAN.md` sont mis à jour pour présenter Terraform comme une
configuration Pro-ready validée sans instance JFrog, et non comme une infrastructure appliquée.

Les cases relatives à l’installation, au verrouillage des versions, aux secrets, aux outputs, aux
fichiers ignorés et à la documentation peuvent être cochées après preuve. Les critères exigeant
une instance Pro — import réel, apply, second plan vide et destroy réel — restent non cochés. La
phase 10 demeure partielle tant que ces preuves ne sont pas disponibles.

## Critères d’acceptation sous OSS

- Terraform 1.15.4 Windows ARM64 est installé et sa version est vérifiée ;
- le provider 12.11.3 est verrouillé dans la configuration et le lockfile multiplateforme ;
- formatage, validation et tests simulés réussissent ;
- les cinq resources reproduisent les définitions JSON de phase 9 ;
- aucun secret ou état Terraform n’apparaît dans Git ;
- la documentation identifie sans ambiguïté chaque validation Pro reportée ;
- le diff de dépôt ne contient aucune erreur d’espacement.

## Validation Pro reportée

- consulter l’API de licence et confirmer Pro ou Enterprise ;
- importer les cinq repositories existants ;
- obtenir un premier plan maîtrisé ;
- appliquer les différences approuvées ;
- obtenir un second plan vide ;
- vérifier qu’un destroy ne cible que les cinq repositories du laboratoire.

La phase ne sera déclarée terminée qu’après ces validations réelles.
