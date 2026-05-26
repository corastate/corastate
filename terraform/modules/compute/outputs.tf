output "cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  description = "ECS cluster ARN."
  value       = aws_ecs_cluster.this.arn
}

output "service_names" {
  description = "Map of service to ECS service name."
  value = {
    backend = aws_ecs_service.backend.name
    worker  = aws_ecs_service.worker.name
    web     = aws_ecs_service.web.name
  }
}

output "task_definition_arns" {
  description = "Map of service to task definition ARN."
  value       = { for k, v in aws_ecs_task_definition.this : k => v.arn }
}

output "task_definition_families" {
  description = "Map of service to task definition family (used by `aws ecs run-task` for the CLI)."
  value       = { for k, v in aws_ecs_task_definition.this : k => v.family }
}

output "log_group_names" {
  description = "Map of service to CloudWatch log group name."
  value       = { for k, v in aws_cloudwatch_log_group.service : k => v.name }
}

output "cli_security_group_id" {
  description = "Security group for one-shot CLI tasks, re-exported for run-task convenience."
  value       = var.cli_sg_id
}
