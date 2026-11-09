variable "env" {
  description = "Environment name, used as table name suffix."
  type        = string
}

variable "point_in_time_recovery" {
  description = "Continuous backups; prod only, they cost per GB."
  type        = bool
  default     = false
}

variable "access" {
  description = "DynamoDB actions per Lambda (key = function name, role = IAM role name from module.api.role_names)."
  type = map(object({
    role    = string
    actions = list(string)
  }))
  default = {}

  validation {
    condition = alltrue(flatten([
      for a in values(var.access) : [for action in a.actions : can(regex("^dynamodb:[A-Za-z]+$", action)) && action != "dynamodb:Scan"]
    ]))
    error_message = "Only explicit dynamodb:<Action> entries, no wildcards and no Scan (ADR 0003)."
  }
}

variable "stream_consumer" {
  description = "Lambda triggered by the table stream, with an event filter pattern (JSON). null = no consumer."
  type = object({
    function_name  = string
    role           = string
    filter_pattern = string
  })
  default = null
}
