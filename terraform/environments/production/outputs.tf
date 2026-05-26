output "alb_dns_name" {
  description = "ALB DNS name. Useful before the Route53 record propagates."
  value       = module.edge.alb_dns_name
}

output "public_url" {
  description = "Public URL for the stack."
  value       = module.edge.public_url
}

output "rds_endpoint" {
  description = "RDS endpoint (host:port)."
  value       = module.data.db_endpoint
}

output "ecr_repository_urls" {
  description = "Map of repo name to URL. Used by CI to tag and push images."
  value       = module.ecr.repository_urls
}

output "github_deployer_role_arn" {
  description = "ARN GitHub Actions assumes via OIDC. Set as the value of the AWS_DEPLOY_ROLE_ARN repo secret."
  value       = module.iam.github_deployer_role_arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name. CI uses this to force new deployments."
  value       = module.compute.cluster_name
}

output "ecs_service_names" {
  description = "Map of service to ECS service name."
  value       = module.compute.service_names
}

output "cli_task_family" {
  description = "Task definition family for `aws ecs run-task` invocations of the CLI."
  value       = module.compute.task_definition_families["cli"]
}

output "cli_security_group_id" {
  description = "Security group attached to one-shot CLI tasks."
  value       = module.compute.cli_security_group_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (needed for `aws ecs run-task` network configuration)."
  value       = module.network.private_subnet_ids
}

output "kms_key_arn" {
  description = "Customer-managed KMS key ARN."
  value       = module.secrets.kms_key_arn
}
