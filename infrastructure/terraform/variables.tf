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
