variable "name_prefix" {
  description = "Prefix applied to ECS resources and log group names."
  type        = string
}

variable "aws_region" {
  description = "Region used in the awslogs driver."
  type        = string
}

variable "vpc_id" {
  description = "VPC the services run in. Used for the target groups created on the edge side; kept here for reference."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets where ECS tasks attach ENIs."
  type        = list(string)
}

variable "ecr_repository_urls" {
  description = "Map keyed by service (backend, worker, web, cli) to the ECR repo URL the image lives in."
  type        = map(string)
}

variable "image_tag" {
  description = "Image tag every task definition references. Usually the deploy commit SHA."
  type        = string
  default     = "latest"
}

variable "task_execution_role_arn" {
  description = "Shared ECS task execution role."
  type        = string
}

variable "task_role_arns" {
  description = "Map of service name to per-service task role ARN."
  type        = map(string)
}

variable "service_sg_ids" {
  description = "Map of service name to the security group the service's tasks attach to. Keys: backend, worker, web."
  type        = map(string)
}

variable "cli_sg_id" {
  description = "Security group attached to one-shot CLI tasks."
  type        = string
}

variable "backend_target_group_arns" {
  description = "Target group ARNs the backend service registers into. May have multiple (one per path-based rule)."
  type        = list(string)
}

variable "web_target_group_arn" {
  description = "Target group ARN the web service registers into."
  type        = string
}

variable "backend_port" {
  description = "Container port for the backend."
  type        = number
  default     = 4000
}

variable "web_port" {
  description = "Container port for the web (nginx)."
  type        = number
  default     = 80
}

variable "backend_cpu" {
  description = "Backend task CPU units."
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Backend task memory in MiB."
  type        = number
  default     = 1024
}

variable "worker_cpu" {
  description = "Worker task CPU units."
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Worker task memory in MiB."
  type        = number
  default     = 1024
}

variable "web_cpu" {
  description = "Web task CPU units."
  type        = number
  default     = 256
}

variable "web_memory" {
  description = "Web task memory in MiB."
  type        = number
  default     = 512
}

variable "cli_cpu" {
  description = "CLI one-shot task CPU units."
  type        = number
  default     = 512
}

variable "cli_memory" {
  description = "CLI one-shot task memory in MiB."
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  description = "Backend service desired count."
  type        = number
  default     = 2
}

variable "worker_desired_count" {
  description = "Worker service desired count."
  type        = number
  default     = 1
}

variable "web_desired_count" {
  description = "Web service desired count."
  type        = number
  default     = 2
}

variable "log_retention_days" {
  description = "CloudWatch log retention per service."
  type        = number
  default     = 30
}

variable "log_kms_key_arn" {
  description = "Optional KMS key for CloudWatch log group encryption. Null leaves logs encrypted with the AWS-managed key."
  type        = string
  default     = null
}

variable "secrets" {
  description = "Map of service name to a map of ENV var name -> Secrets Manager ARN."
  type        = map(map(string))
  default     = {}
}

variable "environment" {
  description = "Map of service name to a map of plain (non-secret) env vars."
  type        = map(map(string))
  default     = {}
}

variable "enable_execute_command" {
  description = "Whether to enable ECS Exec on the services. Useful for ops, gated by the task role."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags merged onto every resource in this module."
  type        = map(string)
  default     = {}
}
