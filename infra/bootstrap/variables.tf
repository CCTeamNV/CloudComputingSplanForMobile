variable "region" {
  description = "AWS region for all project resources."
  type        = string
  default     = "eu-central-1"
}

variable "github_repo" {
  description = "GitHub repository allowed to assume the CI roles, as owner/name."
  type        = string
  default     = "CCTeamNV/CloudComputingSplanForMobile"
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
