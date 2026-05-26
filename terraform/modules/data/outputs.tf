output "db_instance_id" {
  description = "RDS instance identifier."
  value       = aws_db_instance.this.id
}

output "db_endpoint" {
  description = "RDS endpoint (host:port)."
  value       = aws_db_instance.this.endpoint
}

output "db_address" {
  description = "RDS DNS address."
  value       = aws_db_instance.this.address
}

output "db_port" {
  description = "RDS listening port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Initial database name."
  value       = aws_db_instance.this.db_name
}

output "credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the DB credentials JSON."
  value       = aws_secretsmanager_secret.db_credentials.arn
}
