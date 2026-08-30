mock_provider "artifactory" {}

variables {
  artifactory_url            = "https://example.jfrog.io/artifactory"
  artifactory_access_token   = "test-token-not-a-secret"
  confirm_pro_repository_api = true
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
