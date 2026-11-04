output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.this.arn
}

output "client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "issuer" {
  description = "JWT issuer for the API Gateway authorizer."
  value       = "https://${aws_cognito_user_pool.this.endpoint}"
}

output "domain_url" {
  description = "Hosted login base URL (/oauth2/authorize, /oauth2/token)."
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}
