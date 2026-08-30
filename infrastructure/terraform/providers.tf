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
