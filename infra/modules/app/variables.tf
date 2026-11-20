variable "env" {
  description = "Environment name (dev, prod), used in all resource names."
  type        = string
}

variable "deletion_protection" {
  description = "Cognito deletion protection; prod only, so dev can be destroyed without manual steps."
  type        = bool
  default     = false
}

variable "point_in_time_recovery" {
  description = "DynamoDB continuous backups; prod only, they cost per GB."
  type        = bool
  default     = false
}

variable "local_dev" {
  description = "Allow http://localhost:5173 as CORS origin and login callback (npm run dev against this env)."
  type        = bool
  default     = false
}

variable "allowed_email_domains" {
  description = "Sign-up only with these email domains (pre-signup Lambda)."
  type        = list(string)
}

variable "throttle_rate_limit" {
  description = "API Gateway steady-state requests per second."
  type        = number
}

variable "throttle_burst_limit" {
  description = "API Gateway burst."
  type        = number
}
