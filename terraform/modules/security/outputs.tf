output "alb_sg_id" {
  description = "Security group attached to the ALB."
  value       = aws_security_group.alb.id
}

output "backend_tasks_sg_id" {
  description = "Security group attached to backend ECS tasks."
  value       = aws_security_group.backend_tasks.id
}

output "web_tasks_sg_id" {
  description = "Security group attached to web ECS tasks."
  value       = aws_security_group.web_tasks.id
}

output "worker_tasks_sg_id" {
  description = "Security group attached to worker ECS tasks."
  value       = aws_security_group.worker_tasks.id
}

output "cli_tasks_sg_id" {
  description = "Security group attached to one-shot CLI tasks."
  value       = aws_security_group.cli_tasks.id
}

output "rds_sg_id" {
  description = "Security group attached to RDS."
  value       = aws_security_group.rds.id
}
