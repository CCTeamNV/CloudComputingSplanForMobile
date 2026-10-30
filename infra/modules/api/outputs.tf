output "api_url" {
  value = aws_apigatewayv2_api.this.api_endpoint
}

output "api_id" {
  value = aws_apigatewayv2_api.this.id
}

output "function_names" {
  value = { for name, fn in aws_lambda_function.fn : name => fn.function_name }
}

output "role_names" {
  description = "Lambda role per function, for attaching domain-specific policies in the env."
  value       = { for name, role in aws_iam_role.fn : name => role.name }
}
