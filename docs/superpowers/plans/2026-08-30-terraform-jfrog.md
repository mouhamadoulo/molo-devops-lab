# Terraform JFrog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une configuration Terraform Pro-ready des cinq repositories Maven JFrog de la phase 9, validée sans instance JFrog et honnêtement limitée par la licence OSS actuelle.

**Architecture:** Un module racine explicite sous `infrastructure/terraform/` verrouille Terraform et le provider JFrog, protège les plans réels par une précondition de licence, puis déclare trois repositories locaux, un remote et un virtual. Des tests Terraform avec provider simulé vérifient le schéma et la topologie sans appeler JFrog; l’import, l’apply et l’idempotence restent documentés pour une future instance Pro.

**Tech Stack:** Terraform 1.15.4 Windows ARM64, provider `jfrog/artifactory` 12.11.3, langage de tests Terraform, Artifactory 7.x.

**Spec:** `docs/superpowers/specs/2026-08-30-terraform-jfrog-design.md`

## Global Constraints

- Utiliser exactement Terraform `1.15.4` et `jfrog/artifactory` `12.11.3`.
- Vérifier l’archive Windows ARM64 avec le SHA-256 `02a48ccc4a3a9cc7f0139b95c4f328983b610ad13fef61b5d2fac886562467fc` avant installation.
- Ne jamais exécuter `terraform plan`, `import`, `apply` ou `destroy` contre l’instance Artifactory OSS actuelle.
- Ne jamais versionner de token, tfvars privé, état, plan binaire ou dossier `.terraform/`.
- Fournir les credentials réels uniquement avec `TF_VAR_artifactory_url` et `TF_VAR_artifactory_access_token`.
- Conserver `confirm_pro_repository_api = false` par défaut; seule une future instance Pro permet de l’activer réellement.
- Les tests utilisent exclusivement `mock_provider "artifactory" {}` et `command = plan`.
- Le module ne gère que les cinq repositories Maven du laboratoire et le garde local `terraform_data`.
- L’import des repositories existants doit précéder tout apply réel.
- Les validations Pro reportées restent non cochées et la phase 10 reste partielle.
- Ne pas créer de commit, branche ou push sans autorisation explicite de l’utilisateur. Les étapes de commit ci-dessous sont des suggestions conditionnelles.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `infrastructure/terraform/providers.tf` | Versions Terraform/provider et configuration JFrog |
| `infrastructure/terraform/variables.tf` | URL, token sensible et confirmation Pro |
| `infrastructure/terraform/main.tf` | Garde de licence et cinq repositories Maven |
| `infrastructure/terraform/outputs.tf` | Quatre URLs non sensibles |
| `infrastructure/terraform/terraform.tfvars.example` | Exemple sans secret, garde désactivé |
| `infrastructure/terraform/tests/license_gate.tftest.hcl` | Échec sans confirmation et succès simulé avec confirmation |
| `infrastructure/terraform/tests/repositories.tftest.hcl` | Topologie et politiques Maven simulées |
| `infrastructure/terraform/.terraform.lock.hcl` | Checksums provider multiplateformes suivis |
| `.gitignore` | Exclusion tfvars privés, états, plans et cache Terraform |
| `docs/infrastructure/terraform.md` | Installation, validations OSS et futur parcours Pro |
| `docs/README.md` | Lien vers le guide disponible |
| `README.md` | État synthétique de la phase 10 partielle |
| `AGENTS.md` | Stack et commandes réellement disponibles |
| `docs/IMPLEMENTATION_PLAN.md` | Preuves cochées et validations Pro reportées |

---

### Task 1: Toolchain, Provider Contract, and License Gate

**Files:**
- Create: `infrastructure/terraform/providers.tf`
- Create: `infrastructure/terraform/variables.tf`
- Create: `infrastructure/terraform/main.tf`
- Create: `infrastructure/terraform/terraform.tfvars.example`
- Create: `infrastructure/terraform/tests/license_gate.tftest.hcl`
- Create: `infrastructure/terraform/.terraform.lock.hcl`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Terraform archive `terraform_1.15.4_windows_arm64.zip`; environment variables `TF_VAR_artifactory_url`, `TF_VAR_artifactory_access_token`, `TF_VAR_confirm_pro_repository_api`.
- Produces: provider `artifactory`; variables `artifactory_url : string`, `artifactory_access_token : sensitive string`, `confirm_pro_repository_api : bool`; resource `terraform_data.pro_license_gate`.

- [ ] **Step 1: Request approval for the external installation, then install the verified ARM64 binary**

Run only after approval because this writes under `%LOCALAPPDATA%` and updates the user PATH:

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

Expected: JSON contains `"terraform_version":"1.15.4"` and `"platform":"windows_arm64"`.

- [ ] **Step 2: Extend secret and state ignores**

Append under `# Infrastructure tooling` in `.gitignore`:

```gitignore
*.tfvars
*.tfvars.json
tfplan
```

Keep the existing `*.tfplan` rule and add the exact `tfplan` basename used by documented commands.
`terraform.tfvars.example` remains tracked because it does not end in `.tfvars`.

- [ ] **Step 3: Declare exact Terraform and provider versions**

Create `infrastructure/terraform/providers.tf`:

```hcl
terraform {
  required_version = "= 1.15.4"

  required_providers {
    artifactory = {
      source  = "jfrog/artifactory"
      version = "= 12.11.3"
    }
  }
}

provider "artifactory" {
  url          = var.artifactory_url
  access_token = var.artifactory_access_token
}
```

- [ ] **Step 4: Declare validated inputs and the secret-free example**

Create `infrastructure/terraform/variables.tf`:

```hcl
variable "artifactory_url" {
  description = "Full Artifactory URL ending in /artifactory without a trailing slash."
  type        = string

  validation {
    condition     = can(regex("^https?://[^/]+(?:/[^/]+)*/artifactory$", var.artifactory_url))
    error_message = "artifactory_url must be an HTTP(S) URL ending in /artifactory without a trailing slash."
  }
}

variable "artifactory_access_token" {
  description = "Administrative access token supplied only through TF_VAR_artifactory_access_token."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.artifactory_access_token)) > 0
    error_message = "artifactory_access_token must not be empty."
  }
}

variable "confirm_pro_repository_api" {
  description = "Explicit confirmation that the target exposes Pro repository configuration APIs."
  type        = bool
  default     = false
}
```

Create `infrastructure/terraform/terraform.tfvars.example`:

```hcl
artifactory_url           = "https://example.jfrog.io/artifactory"
confirm_pro_repository_api = false

# Never store a token here. Use TF_VAR_artifactory_access_token in the environment.
```

Run:

```powershell
git check-ignore infrastructure/terraform/private.tfvars
```

Expected: the path is printed, proving that a private tfvars is ignored.

- [ ] **Step 5: Write the failing license-gate test**

Create `infrastructure/terraform/tests/license_gate.tftest.hcl` before adding the gate resource:

```hcl
mock_provider "artifactory" {}

variables {
  artifactory_url              = "https://example.jfrog.io/artifactory"
  artifactory_access_token     = "test-token-not-a-secret"
  confirm_pro_repository_api   = true
}

run "rejects_missing_pro_api_confirmation" {
  command = plan

  variables {
    confirm_pro_repository_api = false
  }

  expect_failures = [terraform_data.pro_license_gate]
}

run "accepts_explicit_pro_api_confirmation" {
  command = plan
}
```

Run:

```powershell
Set-Location infrastructure/terraform
terraform init
terraform test -filter='tests\license_gate.tftest.hcl'
```

Expected: FAIL because `terraform_data.pro_license_gate` is not declared.

- [ ] **Step 6: Implement the minimal blocking gate**

Create `infrastructure/terraform/main.tf`:

```hcl
resource "terraform_data" "pro_license_gate" {
  lifecycle {
    precondition {
      condition     = var.confirm_pro_repository_api
      error_message = "Repository management requires Artifactory Pro or Enterprise APIs. Do not enable this against the OSS lab instance."
    }
  }
}
```

Run:

```powershell
terraform fmt -recursive
terraform validate
terraform test -filter='tests\license_gate.tftest.hcl'
```

Expected: validation succeeds and both test runs PASS, including the expected failure case.

- [ ] **Step 7: Lock provider checksums for all supported execution platforms**

Run:

```powershell
terraform providers lock `
    -platform=windows_arm64 `
    -platform=linux_amd64 `
    -platform=linux_arm64
terraform providers
```

Expected: `.terraform.lock.hcl` pins `registry.terraform.io/jfrog/artifactory` 12.11.3 with hashes for all three platforms.

- [ ] **Step 8: Commit only if explicitly authorized**

```powershell
git add -- .gitignore infrastructure/terraform/providers.tf infrastructure/terraform/variables.tf infrastructure/terraform/main.tf infrastructure/terraform/terraform.tfvars.example infrastructure/terraform/tests/license_gate.tftest.hcl infrastructure/terraform/.terraform.lock.hcl
git commit -m "Add Terraform provider safety gate"
```

---

### Task 2: Maven Local Repositories

**Files:**
- Create: `infrastructure/terraform/tests/repositories.tftest.hcl`
- Modify: `infrastructure/terraform/main.tf`

**Interfaces:**
- Consumes: `terraform_data.pro_license_gate`; provider `artifactory`.
- Produces: `artifactory_local_maven_repository.releases`, `.snapshots`, and `.candidates`, each exposing its configured `key`.

- [ ] **Step 1: Write failing tests for the three local repositories**

Create `infrastructure/terraform/tests/repositories.tftest.hcl`:

```hcl
mock_provider "artifactory" {}

variables {
  artifactory_url            = "https://example.jfrog.io/artifactory"
  artifactory_access_token   = "test-token-not-a-secret"
  confirm_pro_repository_api = true
}

run "declares_local_maven_policies" {
  command = plan

  assert {
    condition = (
      artifactory_local_maven_repository.releases.key == "devops-store-releases-local" &&
      artifactory_local_maven_repository.releases.handle_releases &&
      !artifactory_local_maven_repository.releases.handle_snapshots
    )
    error_message = "The releases repository must accept releases only."
  }

  assert {
    condition = (
      artifactory_local_maven_repository.snapshots.key == "devops-store-snapshots-local" &&
      !artifactory_local_maven_repository.snapshots.handle_releases &&
      artifactory_local_maven_repository.snapshots.handle_snapshots &&
      artifactory_local_maven_repository.snapshots.max_unique_snapshots == 5 &&
      artifactory_local_maven_repository.snapshots.snapshot_version_behavior == "unique"
    )
    error_message = "The snapshots repository policy must match the phase 9 definition."
  }

  assert {
    condition = (
      artifactory_local_maven_repository.candidates.key == "devops-store-candidates-local" &&
      artifactory_local_maven_repository.candidates.handle_releases &&
      !artifactory_local_maven_repository.candidates.handle_snapshots
    )
    error_message = "The candidates repository must accept releases only."
  }
}
```

Run:

```powershell
terraform test -filter='tests\repositories.tftest.hcl'
```

Expected: FAIL because the three `artifactory_local_maven_repository` resources do not exist.

- [ ] **Step 2: Implement the three explicit local resources**

Append to `infrastructure/terraform/main.tf`:

```hcl
resource "artifactory_local_maven_repository" "releases" {
  key              = "devops-store-releases-local"
  repo_layout_ref  = "maven-2-default"
  handle_releases  = true
  handle_snapshots = false

  depends_on = [terraform_data.pro_license_gate]
}

resource "artifactory_local_maven_repository" "snapshots" {
  key                       = "devops-store-snapshots-local"
  repo_layout_ref           = "maven-2-default"
  handle_releases           = false
  handle_snapshots          = true
  max_unique_snapshots      = 5
  snapshot_version_behavior = "unique"

  depends_on = [terraform_data.pro_license_gate]
}

resource "artifactory_local_maven_repository" "candidates" {
  key              = "devops-store-candidates-local"
  repo_layout_ref  = "maven-2-default"
  handle_releases  = true
  handle_snapshots = false

  depends_on = [terraform_data.pro_license_gate]
}
```

- [ ] **Step 3: Format and prove the local policies**

```powershell
terraform fmt -recursive
terraform validate
terraform test -filter='tests\repositories.tftest.hcl'
```

Expected: PASS and no JFrog API call.

- [ ] **Step 4: Commit only if explicitly authorized**

```powershell
git add -- infrastructure/terraform/main.tf infrastructure/terraform/tests/repositories.tftest.hcl
git commit -m "Declare JFrog Maven local repositories"
```

---

### Task 3: Maven Central, Virtual Repository, and Outputs

**Files:**
- Modify: `infrastructure/terraform/main.tf`
- Create: `infrastructure/terraform/outputs.tf`
- Modify: `infrastructure/terraform/tests/repositories.tftest.hcl`

**Interfaces:**
- Consumes: keys produced by the three local repository resources.
- Produces: `artifactory_remote_maven_repository.maven_central`, `artifactory_virtual_maven_repository.maven`, and outputs `virtual_repository_url`, `snapshot_deployment_url`, `candidate_deployment_url`, `release_deployment_url`.

- [ ] **Step 1: Add failing assertions for the remote, virtual, and outputs**

Append to `infrastructure/terraform/tests/repositories.tftest.hcl`:

```hcl
run "declares_remote_virtual_and_urls" {
  command = plan

  assert {
    condition = (
      artifactory_remote_maven_repository.maven_central.key == "maven-central-remote" &&
      artifactory_remote_maven_repository.maven_central.url == "https://repo.maven.apache.org/maven2/" &&
      artifactory_remote_maven_repository.maven_central.handle_releases &&
      !artifactory_remote_maven_repository.maven_central.handle_snapshots
    )
    error_message = "Maven Central must proxy releases only from the official HTTPS URL."
  }

  assert {
    condition = artifactory_virtual_maven_repository.maven.repositories == tolist([
      "devops-store-releases-local",
      "devops-store-snapshots-local",
      "maven-central-remote",
    ])
    error_message = "The virtual repository order must exclude candidates and match phase 9."
  }

  assert {
    condition     = artifactory_virtual_maven_repository.maven.default_deployment_repo == "devops-store-snapshots-local"
    error_message = "The virtual repository must deploy to snapshots by default."
  }

  assert {
    condition = (
      output.virtual_repository_url == "https://example.jfrog.io/artifactory/devops-store-maven-virtual" &&
      output.snapshot_deployment_url == "https://example.jfrog.io/artifactory/devops-store-snapshots-local" &&
      output.candidate_deployment_url == "https://example.jfrog.io/artifactory/devops-store-candidates-local" &&
      output.release_deployment_url == "https://example.jfrog.io/artifactory/devops-store-releases-local"
    )
    error_message = "Repository outputs must expose only the four expected non-sensitive URLs."
  }
}
```

Run:

```powershell
terraform test -filter='tests\repositories.tftest.hcl'
```

Expected: FAIL because the remote, virtual, and outputs are missing.

- [ ] **Step 2: Implement Maven Central and the virtual repository**

Append to `infrastructure/terraform/main.tf`:

```hcl
resource "artifactory_remote_maven_repository" "maven_central" {
  key              = "maven-central-remote"
  url              = "https://repo.maven.apache.org/maven2/"
  repo_layout_ref  = "maven-2-default"
  handle_releases  = true
  handle_snapshots = false

  depends_on = [terraform_data.pro_license_gate]
}

resource "artifactory_virtual_maven_repository" "maven" {
  key             = "devops-store-maven-virtual"
  repo_layout_ref = "maven-2-default"
  repositories = [
    artifactory_local_maven_repository.releases.key,
    artifactory_local_maven_repository.snapshots.key,
    artifactory_remote_maven_repository.maven_central.key,
  ]
  default_deployment_repo = artifactory_local_maven_repository.snapshots.key

  depends_on = [terraform_data.pro_license_gate]
}
```

- [ ] **Step 3: Implement non-sensitive URL outputs**

Create `infrastructure/terraform/outputs.tf`:

```hcl
output "virtual_repository_url" {
  description = "Maven resolution URL exposed by the virtual repository."
  value       = "${var.artifactory_url}/${artifactory_virtual_maven_repository.maven.key}"
}

output "snapshot_deployment_url" {
  description = "Maven snapshot deployment URL."
  value       = "${var.artifactory_url}/${artifactory_local_maven_repository.snapshots.key}"
}

output "candidate_deployment_url" {
  description = "Maven candidate deployment URL before promotion."
  value       = "${var.artifactory_url}/${artifactory_local_maven_repository.candidates.key}"
}

output "release_deployment_url" {
  description = "Maven immutable release deployment URL."
  value       = "${var.artifactory_url}/${artifactory_local_maven_repository.releases.key}"
}
```

- [ ] **Step 4: Prove the complete topology with the mock provider**

```powershell
terraform fmt -recursive
terraform validate
terraform test
```

Expected: both test files PASS; no real Artifactory URL or token is required.

- [ ] **Step 5: Commit only if explicitly authorized**

```powershell
git add -- infrastructure/terraform/main.tf infrastructure/terraform/outputs.tf infrastructure/terraform/tests/repositories.tftest.hcl
git commit -m "Model JFrog Maven repository topology"
```

---

### Task 4: Terraform Operations Guide

**Files:**
- Create: `docs/infrastructure/terraform.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: variable names, resource addresses and outputs from Tasks 1–3.
- Produces: copyable OSS validation commands and a separate future Pro import/apply procedure.

- [ ] **Step 1: Write the guide with explicit OSS and Pro sections**

Create `docs/infrastructure/terraform.md` with these exact sections and facts:

````markdown
# Terraform et JFrog Artifactory

## Périmètre disponible

La configuration représente cinq repositories Maven et se valide avec un provider simulé. Elle
n’est pas appliquée à l’instance Artifactory OSS locale, car les API utilisées par le provider
nécessitent une souscription Pro ou Enterprise.

## Installation Windows ARM64

Terraform 1.15.4 doit être téléchargé depuis HashiCorp et l’archive Windows ARM64 doit correspondre
au SHA-256 `02a48ccc4a3a9cc7f0139b95c4f328983b610ad13fef61b5d2fac886562467fc`.

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

Le résultat doit indiquer Terraform `1.15.4` sur `windows_arm64`. Si `terraform` reste introuvable,
rouvrir PowerShell ou ajouter temporairement le dossier avec :

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\Terraform\1.15.4;$env:Path"
```

## Variables

- `TF_VAR_artifactory_url` : URL complète terminée par `/artifactory` ;
- `TF_VAR_artifactory_access_token` : token administrateur hors Git ;
- `TF_VAR_confirm_pro_repository_api` : confirmation explicite, laissée à `false` sous OSS.

## Validation sans instance JFrog

```powershell
Set-Location infrastructure/terraform
terraform init
terraform fmt -check -recursive
terraform validate
terraform test
```

## Parcours futur avec Artifactory Pro

Vérifier d’abord `/artifactory/api/system/licenses/`, fournir les variables par l’environnement,
puis importer les cinq repositories existants avant tout apply.

## Import des repositories existants

```powershell
terraform import artifactory_local_maven_repository.releases devops-store-releases-local
terraform import artifactory_local_maven_repository.snapshots devops-store-snapshots-local
terraform import artifactory_local_maven_repository.candidates devops-store-candidates-local
terraform import artifactory_remote_maven_repository.maven_central maven-central-remote
terraform import artifactory_virtual_maven_repository.maven devops-store-maven-virtual
```

## Plan, apply et idempotence

```powershell
terraform plan -out=tfplan
terraform show -no-color tfplan
terraform apply tfplan
terraform plan -detailed-exitcode
```

Le dernier plan doit retourner le code `0` et afficher `No changes`. Ces commandes ne sont pas
validées dans le laboratoire OSS actuel.

## État, secrets et destruction

L’état et les plans sont sensibles et ignorés par Git. Examiner `terraform plan -destroy` avant
tout destroy; il ne doit viser que les cinq repositories du laboratoire et le garde local.

## Limites de validation

Les tests simulés prouvent le schéma HCL et la topologie, pas la compatibilité serveur, l’import,
l’apply, l’idempotence ou la destruction sur une édition Pro.

## Dépannage

- `terraform init` nécessite un accès au Terraform Registry pour télécharger le provider verrouillé ;
- l’erreur du garde de licence est attendue tant que la cible ne dispose pas d’Artifactory Pro ;
- ne jamais contourner le garde pour tester contre l’instance OSS locale ;
- supprimer uniquement `.terraform/` pour réinitialiser les plugins, jamais un état sans sauvegarde.
````

- [ ] **Step 2: Promote the planned index entry to an available link**

In `docs/README.md`, replace the planned Terraform line with:

```markdown
- [Terraform et JFrog](infrastructure/terraform.md) — configuration Pro-ready, tests simulés et parcours d’import sous licence.
```

Also add the guide to the `Disponible` table next to the JFrog documentation.

- [ ] **Step 3: Verify documentation commands and language**

```powershell
rg -n "OSS|Pro|Enterprise|terraform test|terraform import|No changes" docs/infrastructure/terraform.md
Select-String -Path docs/infrastructure/terraform.md,infrastructure/terraform/terraform.tfvars.example -Pattern 'TF_VAR_artifactory_access_token\s*=\s*[''"]'
git diff --check -- docs/infrastructure/terraform.md docs/README.md
```

Expected: the first command shows every boundary; the second finds no literal token assignment;
diff check is silent.

- [ ] **Step 4: Commit only if explicitly authorized**

```powershell
git add -- docs/infrastructure/terraform.md docs/README.md
git commit -m "Document Terraform JFrog workflow"
```

---

### Task 5: Repository Status and Acceptance Evidence

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`
- Modify: `task_plan.md` (ignored local tracking)
- Modify: `progress.md` (ignored local tracking)

**Interfaces:**
- Consumes: actual command results from Tasks 1–4.
- Produces: truthful repository status distinguishing validated configuration from deferred Pro acceptance.

- [ ] **Step 1: Run the complete applicable validation from a clean Terraform working directory**

```powershell
Set-Location infrastructure/terraform
terraform version -json
terraform fmt -check -recursive
terraform validate
terraform test
terraform providers
Set-Location ../..
git diff --check
```

Expected:

- Terraform reports `1.15.4` and `windows_arm64`;
- formatting and validation succeed;
- all mock tests pass;
- provider output contains `jfrog/artifactory 12.11.3`;
- `git diff --check` is silent.

- [ ] **Step 2: Prove that secrets and generated state are not tracked**

```powershell
git check-ignore infrastructure/terraform/private.tfvars
git check-ignore infrastructure/terraform/terraform.tfstate
git check-ignore infrastructure/terraform/tfplan
git ls-files -- '*.tfstate' '*.tfstate.*' '*.tfplan' '*.tfvars' '*.tfvars.json' '.terraform/**'
$lockfileExists = Test-Path infrastructure/terraform/.terraform.lock.hcl
$exampleExists = Test-Path infrastructure/terraform/terraform.tfvars.example
if (-not $lockfileExists -or -not $exampleExists) {
    throw "Terraform lockfile or tfvars example is missing"
}
git check-ignore infrastructure/terraform/.terraform.lock.hcl infrastructure/terraform/terraform.tfvars.example
git status --short -- infrastructure/terraform/.terraform.lock.hcl infrastructure/terraform/terraform.tfvars.example
```

Expected: the first three paths are ignored; the generated/private file query returns nothing;
the lockfile and example exist, are not ignored, and appear as tracked or untracked phase 10 files.

- [ ] **Step 3: Run the existing IaC security scan when Docker is healthy**

```powershell
make trivy-config
```

Expected: PASS with Terraform included in the repository configuration scan. If Docker or the Trivy cache is unavailable, record the exact environmental blocker and do not claim the scan passed.

- [ ] **Step 4: Update root status without overstating completion**

Update `README.md` and `AGENTS.md` to state:

```markdown
Terraform 1.15.4 et le provider JFrog 12.11.3 décrivent les cinq repositories Maven avec tests
simulés. L’instance actuelle reste Artifactory OSS : import, apply et idempotence Terraform sont
documentés mais reportés jusqu’à disponibilité d’une licence Pro ou Enterprise.
```

Keep Kubernetes and observability planned.

- [ ] **Step 5: Update only the phase 10 checkboxes supported by evidence**

In `docs/IMPLEMENTATION_PLAN.md`:

- mark installation/version verification complete only after `terraform version -json` passes;
- mark provider pinning, license verification, sensitive variables, outputs, ignore rules and documentation complete after their checks pass;
- describe the five resources as Pro-ready configuration validated with a mock provider;
- leave real import/recreation, apply, second plan and destroy criteria unchecked;
- state explicitly that phase 10 is partial under OSS.

Do not change phase 11 or later checkboxes.

- [ ] **Step 6: Review the final tracked diff**

```powershell
git status -sb
git diff --stat
git diff -- .gitignore infrastructure/terraform docs/infrastructure/terraform.md docs/README.md README.md AGENTS.md docs/IMPLEMENTATION_PLAN.md docs/superpowers/specs/2026-08-30-terraform-jfrog-design.md docs/superpowers/plans/2026-08-30-terraform-jfrog.md
git diff --check
```

Expected: only phase 10 files are present, no secret appears, and the worktree has no whitespace errors.

- [ ] **Step 7: Commit only if explicitly authorized**

```powershell
git add -- .gitignore infrastructure/terraform docs/infrastructure/terraform.md docs/README.md README.md AGENTS.md docs/IMPLEMENTATION_PLAN.md docs/superpowers/specs/2026-08-30-terraform-jfrog-design.md docs/superpowers/plans/2026-08-30-terraform-jfrog.md
git commit -m "Add Pro-ready JFrog Terraform configuration"
```

Do not push unless the user separately authorizes it.

---

## Final Acceptance Matrix

| Preuve | OSS actuelle | Future Pro |
|---|---:|---:|
| Terraform 1.15.4 Windows ARM64 | Requise | Requise |
| Provider 12.11.3 verrouillé | Requise | Requise |
| `fmt`, `validate`, `terraform test` | Requis | Requis |
| Cinq repositories correctement modélisés | Mock provider | API réelle |
| Aucun secret/état suivi | Requis | Requis |
| Import des repositories existants | Reporté | Requis |
| Apply maîtrisé | Reporté | Requis |
| Second plan vide | Reporté | Requis |
| Destroy limité au laboratoire | Revue statique | Requis |

La livraison de ce plan rend la phase 10 utile et reproductible, mais ne la déclare pas terminée tant que la colonne Future Pro n’est pas validée.
