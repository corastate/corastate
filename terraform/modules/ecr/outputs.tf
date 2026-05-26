output "repository_urls" {
  description = "Map of repository name to URL."
  value       = { for k, v in aws_ecr_repository.this : k => v.repository_url }
}

output "repository_arns" {
  description = "Map of repository name to ARN."
  value       = { for k, v in aws_ecr_repository.this : k => v.arn }
}

output "registry_id" {
  description = "Account/registry ID hosting the repositories."
  value       = values(aws_ecr_repository.this)[0].registry_id
}
