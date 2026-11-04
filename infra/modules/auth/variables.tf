variable "env" {
  description = "Environment name, used as resource name suffix."
  type        = string
}

variable "deletion_protection" {
  description = "Protect the user pool from deletion; prod only, so dev can be destroyed without manual steps."
  type        = bool
  default     = false
}

variable "pre_signup_lambda_arn" {
  description = "Pre-Sign-up trigger (module.api function pre-signup)."
  type        = string
}

variable "callback_urls" {
  description = "Frontend URLs Cognito may redirect to after login/logout."
  type        = list(string)
}
