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

variable "role_admin_role" {
  description = "IAM role name of the Lambda that manages roles (admin); may list users and change group membership in this pool only."
  type        = string
  default     = null
}

variable "account_deleter_role" {
  description = "IAM role name of the Lambda that deletes the caller's own account (student); may only delete users in this pool."
  type        = string
  default     = null
}
