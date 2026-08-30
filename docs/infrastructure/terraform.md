# Terraform et JFrog Artifactory

## Périmètre disponible

La configuration sous `infrastructure/terraform/` représente les cinq repositories Maven de la
phase 9 avec Terraform 1.15.4 et le provider `jfrog/artifactory` 12.11.3. Elle se valide avec un
provider simulé et n’appelle pas l’instance JFrog pendant les tests.

Elle n’est pas appliquée à l’instance Artifactory OSS locale. JFrog réserve les API de création et
de configuration des repositories utilisées par le provider aux souscriptions Pro et Enterprise.
Les imports, l’apply, le second plan vide et le destroy restent donc des validations reportées.

## Ressources déclarées

| Ressource Terraform | Clé JFrog | Politique |
|---|---|---|
| `artifactory_local_maven_repository.releases` | `devops-store-releases-local` | releases uniquement |
| `artifactory_local_maven_repository.snapshots` | `devops-store-snapshots-local` | snapshots uniques, rétention 5 |
| `artifactory_local_maven_repository.candidates` | `devops-store-candidates-local` | releases avant promotion |
| `artifactory_remote_maven_repository.maven_central` | `maven-central-remote` | Maven Central, releases uniquement |
| `artifactory_virtual_maven_repository.maven` | `devops-store-maven-virtual` | releases, snapshots et Central |

Le virtual exclut volontairement candidates et déploie par défaut vers snapshots. Terraform ne
gère ni Artifactory, ni PostgreSQL, ni les utilisateurs, ni les tokens.

## Installation Windows ARM64

Télécharger l’archive officielle Terraform 1.15.4 Windows ARM64, vérifier son SHA-256, puis
l’installer dans le profil utilisateur :

```powershell
$terraformVersion = '1.15.4'
$terraformArchive = Join-Path $env:TEMP "terraform_${terraformVersion}_windows_arm64.zip"
$terraformInstallDirectory = Join-Path $env:LOCALAPPDATA "Programs\Terraform\$terraformVersion"
$expectedTerraformHash = '02A48CCC4A3A9CC7F0139B95C4F328983B610AD13FEF61B5D2FAC886562467FC'

Invoke-WebRequest `
    -Uri "https://releases.hashicorp.com/terraform/$terraformVersion/terraform_${terraformVersion}_windows_arm64.zip" `
    -OutFile $terraformArchive

$actualTerraformHash = (Get-FileHash -Algorithm SHA256 $terraformArchive).Hash
if ($actualTerraformHash -ne $expectedTerraformHash) {
    throw "Terraform archive checksum mismatch: $actualTerraformHash"
}

New-Item -ItemType Directory -Force -Path $terraformInstallDirectory | Out-Null
Expand-Archive -LiteralPath $terraformArchive -DestinationPath $terraformInstallDirectory -Force

$currentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$userPathEntries = @($currentUserPath -split ';' | Where-Object { $_ })
if ($userPathEntries -notcontains $terraformInstallDirectory) {
    [Environment]::SetEnvironmentVariable(
        'Path',
        (($userPathEntries + $terraformInstallDirectory) -join ';'),
        'User'
    )
}
$env:Path = "$terraformInstallDirectory;$env:Path"
terraform version -json
```

Le résultat doit indiquer `1.15.4` et `windows_arm64`. Sous Linux, utiliser la même version et
vérifier le checksum correspondant publié par HashiCorp.

## Variables

Les tests simulés fournissent des valeurs factices dans leurs fichiers `.tftest.hcl`. Un futur
parcours réel doit utiliser exclusivement les variables d’environnement suivantes :

```powershell
$env:TF_VAR_artifactory_url = 'https://example.jfrog.io/artifactory'
$env:TF_VAR_confirm_pro_repository_api = 'true'
```

Pour une session réelle, lire le token comme `SecureString`, puis le convertir uniquement dans la
mémoire du processus, sans l’afficher ni l’écrire :

```powershell
$secureToken = Read-Host 'JFrog access token' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $env:TF_VAR_artifactory_access_token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
}
```

`TF_VAR_confirm_pro_repository_api` reste absent ou à `false` sous OSS. Il s’agit d’une
confirmation opérateur, pas d’une détection automatique de licence.

## Validation sans instance JFrog

Depuis la racine du dépôt :

```powershell
Set-Location infrastructure/terraform
terraform init
terraform fmt -check -recursive
terraform validate
terraform test
terraform providers
```

`terraform test` utilise `mock_provider "artifactory" {}` et ne crée aucune ressource réelle. Les
tests vérifient le garde Pro, les politiques releases/snapshots, l’URL Maven Central, l’ordre du
virtual, l’exclusion de candidates, le déploiement par défaut et les outputs.

Le lockfile contient les checksums du provider pour Windows ARM64, Linux AMD64 et Linux ARM64.

## Outputs

Les quatre outputs sont non sensibles :

- `virtual_repository_url` pour la résolution Maven ;
- `snapshot_deployment_url` pour les snapshots ;
- `candidate_deployment_url` avant promotion ;
- `release_deployment_url` pour les releases immuables.

Aucun output ne contient le token ou une valeur dérivée du token.

## Parcours futur avec Artifactory Pro

Avant toute commande réelle, vérifier la licence avec un compte administrateur :

```text
GET /artifactory/api/system/licenses/
```

Ne poursuivre que si l’édition expose les API de configuration des repositories. Fournir les
variables par l’environnement, exécuter `terraform init`, puis importer les cinq repositories
créés pendant la phase 9 avant tout apply.

## Import des repositories existants

```powershell
terraform import artifactory_local_maven_repository.releases devops-store-releases-local
terraform import artifactory_local_maven_repository.snapshots devops-store-snapshots-local
terraform import artifactory_local_maven_repository.candidates devops-store-candidates-local
terraform import artifactory_remote_maven_repository.maven_central maven-central-remote
terraform import artifactory_virtual_maven_repository.maven devops-store-maven-virtual
```

Importer une ressource à la fois et contrôler chaque résultat. Un apply avant import tenterait de
recréer des clés déjà présentes.

## Plan, apply et idempotence

```powershell
terraform plan -out=tfplan
terraform show -no-color tfplan
terraform apply tfplan
terraform plan -detailed-exitcode
```

Le premier plan doit être relu avant toute mutation. Après apply, le dernier plan doit retourner le
code `0` et afficher `No changes`. Ces commandes ne sont pas validées dans le laboratoire OSS.

## État, secrets et destruction

`.terraform/`, les tfvars privés, les états et les plans binaires sont ignorés par Git. Le
lockfile et `terraform.tfvars.example` restent suivis. Considérer tout état comme sensible même si
le token sert seulement à configurer le provider.

Le schéma Maven du provider 12.11.3 n’expose pas `allow_delete`. Sur une future instance Pro,
examiner donc impérativement le plan de destruction :

```powershell
terraform plan -destroy -out=tfplan
terraform show -no-color tfplan
```

Il ne doit viser que les cinq repositories du laboratoire et le garde `terraform_data`. Ne jamais
exécuter cette commande contre l’instance OSS actuelle.

## Dépannage

- Si `terraform` reste introuvable après installation, rouvrir PowerShell ou préfixer la session
  avec `$env:Path = "$env:LOCALAPPDATA\Programs\Terraform\1.15.4;$env:Path"`.
- `terraform init` nécessite un accès au Terraform Registry pour télécharger le provider signé.
- L’erreur du garde de licence est attendue lorsque `confirm_pro_repository_api` vaut `false`.
- Ne jamais contourner le garde pour tester contre Artifactory OSS.
- Pour réinitialiser uniquement les plugins, supprimer `.terraform/`; ne jamais supprimer un état
  sans sauvegarde et revue explicites.

## Limites de validation

Les tests simulés prouvent le schéma HCL et la topologie déclarée. Ils ne prouvent pas la
compatibilité avec une instance Pro, l’import, l’apply, l’idempotence ou la destruction. La phase
10 reste partielle tant que ces validations réelles ne sont pas disponibles.

## Références

- [Terraform 1.15.4](https://releases.hashicorp.com/terraform/1.15.4/)
- [Tests avec providers simulés](https://developer.hashicorp.com/terraform/language/tests/mocking)
- [Provider JFrog Artifactory](https://registry.terraform.io/providers/jfrog/artifactory/12.11.3/docs)
- [API JFrog Create Repository](https://docs.jfrog.com/artifactory/reference/createrepository)
