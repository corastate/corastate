variable "aws_region" {
  description = "AWS region for the production stack."
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix applied to every resource. Distinguishes envs in a shared account."
  type        = string
  default     = "corastate-prod"
}

variable "domain" {
  description = "Public hostname the stack serves, e.g. app.corastate.io."
  type        = string
}

variable "route53_zone_id" {
  description = "Existing Route53 hosted zone ID covering `domain`."
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs, one per AZ."
  type        = list(string)
  default     = ["10.40.0.0/20", "10.40.16.0/20"]
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs, one per AZ."
  type        = list(string)
  default     = ["10.40.32.0/20", "10.40.48.0/20"]
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  description = "RDS initial allocated storage in GB."
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "Enable RDS multi-AZ. Off by default; flip for prod-HA at ~2x cost."
  type        = bool
  default     = false
}

variable "backend_desired_count" {
  description = "Backend service desired task count."
  type        = number
  default     = 2
}

variable "worker_desired_count" {
  description = "Worker service desired task count."
  type        = number
  default     = 1
}

variable "web_desired_count" {
  description = "Web service desired task count."
  type        = number
  default     = 2
}

variable "image_tag" {
  description = "Image tag every service runs. CI overrides this with the commit SHA on each deploy."
  type        = string
  default     = "latest"
}

variable "github_repository" {
  description = "Owner/repo allowed to assume the deployer role."
  type        = string
  default     = "corastate/corastate"
}

variable "github_oidc_provider_arn" {
  description = "OIDC provider ARN output by the bootstrap config."
  type        = string
}

variable "terraform_state_bucket_arn" {
  description = "ARN of the Terraform state bucket created by bootstrap."
  type        = string
}

variable "terraform_state_lock_table_arn" {
  description = "ARN of the DynamoDB lock table created by bootstrap."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention per service."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default = {
    Project     = "corastate"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
