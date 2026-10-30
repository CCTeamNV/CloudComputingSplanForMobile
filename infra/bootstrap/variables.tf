variable "region" {
  description = "AWS region for all project resources."
  type        = string
  default     = "eu-central-1"
}

variable "github_subject_prefix" {
  description = "OIDC sub claim prefix of the repo. The org uses immutable subjects (owner@id/repo@id), see GET repos/<repo>/actions/oidc/customization/sub."
  type        = string
  default     = "repo:CCTeamNV@350441977/CloudComputingSplanForMobile@1415461481"
}

variable "environments" {
  description = "GitHub environments that get their own apply role."
  type        = set(string)
  default     = ["dev", "prod"]
}

variable "budget_email" {
  description = "Recipient of AWS budget alerts."
  type        = string
}

variable "budget_limit_usd" {
  description = "Monthly budget in USD; alerts at 20/50/100 %."
  type        = number
  default     = 50
}
