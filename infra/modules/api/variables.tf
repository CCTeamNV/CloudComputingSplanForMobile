variable "env" {
  description = "Environment name, used as resource name suffix."
  type        = string
}

variable "dist_dir" {
  description = "Directory with the bundled functions (backend/dist), one subfolder per function."
  type        = string
}

variable "functions" {
  description = "Lambda per domain (ADR 0008) and the routes it serves (none for triggers). Domain permissions are attached in the env via role_names."
  type = map(object({
    routes      = optional(list(string), [])
    memory_size = optional(number, 256)
    timeout     = optional(number, 10)
    environment = optional(map(string), {})
  }))
}

variable "jwt_authorizer" {
  description = "Cognito issuer URL and app client ids; every route not in public_routes requires a valid access token."
  type = object({
    issuer   = string
    audience = list(string)
  })
}

variable "public_routes" {
  description = "Route keys reachable without a token, e.g. \"GET /health\"."
  type        = list(string)
  default     = []
}

variable "throttle_rate_limit" {
  description = "Steady-state requests per second for the whole API (protection instead of WAF, ADR 0011)."
  type        = number
  default     = 200
}

variable "throttle_burst_limit" {
  description = "Burst requests for the whole API."
  type        = number
  default     = 400
}

variable "cors_allow_origins" {
  description = "Browser origins allowed to call the API (frontend URL, local dev server)."
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  type    = number
  default = 30
}
