# JFrog Artifactory

La phase 9 fournit un parcours Maven local avec Artifactory OSS 7.161.20 et PostgreSQL 17.10.
Elle publie des snapshots et des release candidates, promeut une candidate vers releases sans
écrasement, puis résout les artefacts depuis un repository virtual. JFrog Container Registry (JCR)
reste un profil Compose séparé et optionnel ; aucune image Docker n'est publiée par cette phase.

## Architecture et limites OSS

Le profil `artifacts` contient `artifactory-db` et `artifactory`. L'interface est liée uniquement à
`127.0.0.1:${ARTIFACTORY_PORT:-8082}`. Les données PostgreSQL et Artifactory utilisent deux volumes
nommés distincts. `make artifacts-down` les conserve ; `make artifacts-reset` les supprime.

L'instance de laboratoire est limitée à 4 CPU et 4 Go de RAM. Cette valeur a été validée
localement, mais reste inférieure au dimensionnement de production recommandé par JFrog. Les
services JFConnect sont désactivés explicitement : leur activation erronée dans l'image OSS peut
laisser l'interface sur son écran de chargement.

Deux API utiles sont réservées à Artifactory Pro :

- création et mise à jour de repositories par `/api/repositories/{key}` ;
- copie d'artefacts par `/api/copy`.

La topologie est donc créée une fois dans l'interface OSS. L'API Storage publique vérifie ensuite
uniquement la présence des cinq clés ; elle ne permet pas de relire leur classe, leur type Maven ni
la composition du virtual. Le parcours fonctionnel de publication, promotion et résolution
ci-dessous valide ces politiques.
La promotion utilise le checksum deploy sur les chemins finaux du POM et du JAR : aucun binaire
n'est retéléchargé et une release complète existante est refusée. Terraform ne pourra gérer ces
repositories en phase 10 qu'avec une souscription donnant accès aux API de configuration.

## Variables locales

Copier `.env.example` vers `.env`, puis fournir au minimum :

```dotenv
ARTIFACTORY_DB_PASSWORD=
JFROG_ADMIN_TOKEN=
JFROG_USERNAME=
JFROG_TOKEN=
```

`JFROG_ADMIN_TOKEN` sert aux contrôles et à la promotion. `JFROG_USERNAME` et `JFROG_TOKEN` servent
à Maven et doivent idéalement appartenir à un compte technique limité à la lecture du virtual et
au déploiement dans snapshots/candidates. Aucun token réel ne doit être versionné ou passé sur une
ligne de commande.

Le fichier `.env` est chargé par Docker Compose. Maven lancé directement sur l'hôte lit, lui, les
variables du processus courant. Sous PowerShell :

```powershell
$env:JFROG_URL = "http://localhost:8082/artifactory"
$env:JFROG_USERNAME = Read-Host "JFrog username"
$secureToken = Read-Host "JFrog identity token" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $env:JFROG_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
}
```

## Démarrage et onboarding

```powershell
make artifacts-config
make artifacts-up
make artifacts-status
curl.exe --fail http://localhost:8082/router/api/v1/system/readiness
```

Ouvrir <http://localhost:8082/ui/>, remplacer immédiatement le mot de passe initial, puis générer
un identity token administrateur. En cas d'écran de chargement persistant, vérifier que le
conteneur a été recréé avec `JF_JFCONNECT_ENABLED=false` et `JF_JFCONNECT_SERVICE_ENABLED=false`,
puis consulter `make artifacts-logs`.

Créer ensuite ces cinq repositories dans **Administration > Repositories** :

| Nom | Classe | Paramètres structurants |
|---|---|---|
| `devops-store-snapshots-local` | local Maven | releases non, snapshots oui, unique, maximum 5 |
| `devops-store-candidates-local` | local Maven | releases oui, snapshots non |
| `devops-store-releases-local` | local Maven | releases oui, snapshots non |
| `maven-central-remote` | remote Maven | URL `https://repo.maven.apache.org/maven2/`, snapshots non |
| `devops-store-maven-virtual` | virtual Maven | releases, snapshots, Central ; déploiement par défaut vers snapshots |

L'ordre du virtual est releases, snapshots, puis Central. Candidates en est volontairement absent.
Les fichiers `infrastructure/jfrog/repositories/*.json` conservent l'état désiré de référence.

Vérifier deux fois la présence des repositories, sans mutation :

```powershell
make artifacts-verify
make artifacts-verify
```

`make artifacts-bootstrap` est conservé comme alias de `artifacts-verify` ; il ne contourne pas la
limite de licence OSS et ne constitue pas une vérification complète de configuration.

## Publication, promotion et résolution

Le POM utilise `${revision}` et `distributionManagement`. Le fichier
`infrastructure/jfrog/settings.xml.example` lit les credentials depuis l'environnement et force
dépendances comme plugins à passer par `devops-store-maven-virtual`.
Son profil de résolution active explicitement snapshots et releases ; un simple miroir de Maven
Central conserverait sinon la politique « snapshots désactivés » de Central.

Sous Linux/macOS :

```bash
make artifacts-publish-snapshot VERSION=0.2.0-SNAPSHOT
make artifacts-publish-candidate VERSION=0.2.0
make artifacts-promote VERSION=0.2.0
make artifacts-resolve VERSION=0.2.0
```

Avec GNU Make sous Windows, sélectionner le wrapper Windows :

```powershell
make artifacts-publish-snapshot VERSION=0.2.0-SNAPSHOT MAVEN=./mvnw.cmd
make artifacts-publish-candidate VERSION=0.2.0 MAVEN=./mvnw.cmd
make artifacts-promote VERSION=0.2.0
make artifacts-resolve VERSION=0.2.0
```

Avant promotion, `artifacts-resolve VERSION=0.2.0` doit échouer puisque candidates est exclu du
virtual. Après promotion, la même commande utilise un conteneur Maven éphémère et un cache neuf.
Une seconde promotion échoue avec `Release 0.2.0 already exists`. Une reprise après incident est
acceptée seulement si le fichier déjà copié possède exactement le checksum de la candidate.

## Publication GitHub Actions

Le job `publish` du workflow backend dépend du succès de `verify` et ne s'exécute que sur un push :

- `main` publie `0.1.0-SNAPSHOT` ;
- un tag strict `vX.Y.Z` publie `X.Y.Z` dans candidates ;
- une pull request ne publie jamais ;
- une configuration JFrog absente désactive proprement la publication.

Configurer `JFROG_URL` et `JFROG_USERNAME` comme variables Actions, puis `JFROG_TOKEN` comme secret.
`JFROG_URL` doit être une URL HTTPS joignable depuis le runner ; l'instance locale liée à
`127.0.0.1` n'est pas accessible depuis un runner GitHub hébergé. Utiliser une instance distante
sécurisée ou un runner auto-hébergé sur le réseau local.
La promotion reste une décision locale explicite et n'est jamais déclenchée automatiquement par
la CI.

## JCR optionnel

Le profil `registry` possède sa propre base, ses volumes et son port `${JCR_PORT:-8084}`. Valider sa
configuration avec `make registry-config`. Son démarrage (`make registry-up`) nécessite
`JCR_DB_PASSWORD` et des ressources supplémentaires. Il ne fait pas partie de l'acceptance Maven
et n'implique pas que l'image Artifactory OSS fournisse un registre Docker.

## Diagnostic

- `401` sur le virtual : vérifier l'entrée serveur `devops-store-maven-virtual` et les variables
  `JFROG_USERNAME`/`JFROG_TOKEN` ;
- repository manquant : le créer dans l'interface avec le JSON de référence, puis relancer
  `make artifacts-verify` ;
- API repository ou copie en `400` avec mention Pro : comportement attendu de l'édition OSS ;
- candidate résolue avant promotion : retirer candidates du virtual ;
- release déjà présente : choisir une nouvelle version, ne jamais l'écraser ;
- dépendances lentes au premier passage : le remote Central remplit son cache ;
- mémoire insuffisante : arrêter SonarQube, JCR ou la stack applicative avant Artifactory.

Références : [Maven repositories](https://docs.jfrog.com/artifactory/docs/maven-repositories),
[Deploy Artifact by Checksum](https://docs.jfrog.com/artifactory/reference/deployartifactbychecksum),
[Identity Tokens](https://docs.jfrog.com/user-management/docs/identity-tokens) et
[Feature Comparison Matrix](https://docs.jfrog.com/installation/docs/feature-comparison-matrix-for-self-mangaged-jpds).
