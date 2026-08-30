resource "terraform_data" "pro_license_gate" {
  lifecycle {
    precondition {
      condition     = var.confirm_pro_repository_api
      error_message = "Repository management requires Artifactory Pro or Enterprise APIs. Do not enable this against the OSS lab instance."
    }
  }
}

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
