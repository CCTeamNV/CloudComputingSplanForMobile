variable "env" {
  description = "Environment name, used in alarm and dashboard names."
  type        = string
}

variable "api_id" {
  description = "HTTP API id (module.api.api_id)."
  type        = string
}

variable "function_names" {
  description = "Lambda function names (module.api.function_names); cold starts are read from their log groups."
  type        = map(string)
}

variable "stream_function" {
  description = "Key in function_names of the DynamoDB stream consumer (catalog publisher)."
  type        = string
  default     = "catalog"
}

variable "table_name" {
  description = "DynamoDB table (module.data.table_name)."
  type        = string
}

variable "metrics_namespace" {
  description = "Namespace of the Powertools business metrics (POWERTOOLS_METRICS_NAMESPACE)."
  type        = string
}

variable "alerts_topic_name" {
  description = "SNS topic from infra/bootstrap with the email subscription."
  type        = string
  default     = "splan-alerts"
}
