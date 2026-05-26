variable "name_prefix" {
  description = "Prefix applied to IAM role and policy names."
  type        = string
}

variable "kms_key_arn" {
  description = "KMS CMK ARN. Task roles get kms:Decrypt for Secrets Manager-managed envelopes."
  type        = string
}

variable "secret_arns" {
  description = "Map of logical secret name to ARN. Per-service roles only get the secrets they actually need."
  type        = map(string)
  default     = {}
}

variable "backend_secret_keys" {
  description = "Which keys from secret_arns the backend task role can read."
  type        = list(string)
  default     = ["db_credentials", "envelope_master_key", "session_secret"]
}

variable "worker_secret_keys" {
  description = "Which keys from secret_arns the worker task role can read."
  type        = list(string)
  default     = ["db_credentials", "envelope_master_key", "anthropic_api_key"]
}

variable "cli_secret_keys" {
  description = "Which keys from secret_arns the CLI task role can read."
  type        = list(string)
  default     = ["db_credentials", "envelope_master_key"]
}

variable "web_secret_keys" {
  description = "Which keys from secret_arns the web task role can read. Web is nginx-only and normally needs nothing."
  type        = list(string)
  default     = []
}

variable "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider. Created in the bootstrap config."
  type        = string
}

variable "github_repository" {
  description = "GitHub repo allowed to assume the deployer role, formatted owner/repo."
  type        = string
}

variable "github_role_branch_patterns" {
  description = "GitHub ref patterns the role trusts, e.g. [\"refs/heads/main\"]. Use repo:OWNER/REPO:* to allow any branch."
  type        = list(string)
  default     = ["refs/heads/main"]
}

variable "ecr_repository_arns" {
  description = "ECR repo ARNs the GitHub deployer role can push to."
  type        = list(string)
  default     = []
}

variable "aws_region" {
  description = "Region the deployer role will operate in. Used to scope CloudWatch Logs and ECS resources."
  type        = string
}

variable "terraform_state_bucket_arn" {
  description = "S3 bucket holding the Terraform state. The deployer needs read/write inside it."
  type        = string
}

variable "terraform_state_lock_table_arn" {
  description = "DynamoDB table used for state locking."
  type        = string
}

variable "tags" {
  description = "Tags merged onto every resource in this module."
  type        = map(string)
  default     = {}
}
