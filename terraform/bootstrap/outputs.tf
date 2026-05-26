output "state_bucket_name" {
  description = "Bucket name to put in environments/*/backend.tf."
  value       = aws_s3_bucket.tfstate.id
}

output "state_bucket_arn" {
  description = "Bucket ARN. Passed to the iam module as terraform_state_bucket_arn."
  value       = aws_s3_bucket.tfstate.arn
}

output "state_lock_table_name" {
  description = "DynamoDB lock table name."
  value       = aws_dynamodb_table.tfstate_lock.name
}

output "state_lock_table_arn" {
  description = "DynamoDB lock table ARN. Passed to the iam module as terraform_state_lock_table_arn."
  value       = aws_dynamodb_table.tfstate_lock.arn
}

output "github_oidc_provider_arn" {
  description = "OIDC provider ARN. Passed to the iam module as github_oidc_provider_arn."
  value       = aws_iam_openid_connect_provider.github_actions.arn
}

output "aws_region" {
  description = "Region the state and OIDC resources live in."
  value       = var.aws_region
}
