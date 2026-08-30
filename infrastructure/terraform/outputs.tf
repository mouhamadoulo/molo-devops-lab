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
