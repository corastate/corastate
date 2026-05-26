output "task_execution_role_arn" {
  description = "ARN of the shared ECS task execution role."
  value       = aws_iam_role.task_execution.arn
}

output "task_role_arns" {
  description = "Map of service name to its task role ARN (backend, worker, web, cli)."
  value       = { for k, v in aws_iam_role.service : k => v.arn }
}

output "github_deployer_role_arn" {
  description = "ARN GitHub Actions assumes via OIDC."
  value       = aws_iam_role.github_deployer.arn
}
