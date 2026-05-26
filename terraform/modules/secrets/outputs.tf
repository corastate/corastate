output "kms_key_id" {
  description = "KMS CMK key ID."
  value       = aws_kms_key.main.key_id
}

output "kms_key_arn" {
  description = "KMS CMK ARN. Used by RDS storage encryption and Secrets Manager."
  value       = aws_kms_key.main.arn
}

output "kms_alias" {
  description = "KMS alias."
  value       = aws_kms_alias.main.name
}

output "envelope_master_key_secret_arn" {
  description = "ARN of the envelope-encryption master key secret."
  value       = aws_secretsmanager_secret.envelope_master_key.arn
}

output "session_secret_arn" {
  description = "ARN of the session signing secret."
  value       = aws_secretsmanager_secret.session_secret.arn
}

output "anthropic_api_key_secret_arn" {
  description = "ARN of the Anthropic API key secret (value populated manually)."
  value       = aws_secretsmanager_secret.anthropic_api_key.arn
}
