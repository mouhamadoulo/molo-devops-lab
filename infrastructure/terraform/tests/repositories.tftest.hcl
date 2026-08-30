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
