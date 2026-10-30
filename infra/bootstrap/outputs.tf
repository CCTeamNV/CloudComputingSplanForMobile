output "state_bucket" {
  description = "Use as backend bucket in infra/envs/*."
  value       = aws_s3_bucket.state.bucket
}

output "plan_role_arn" {
  description = "GitHub variable AWS_PLAN_ROLE_ARN."
  value       = aws_iam_role.plan.arn
}

output "apply_role_arns" {
  description = "GitHub environment variable AWS_APPLY_ROLE_ARN, per environment."
  value       = { for env, role in aws_iam_role.apply : env => role.arn }
}
