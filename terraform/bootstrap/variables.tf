variable "aws_region" {
  description = "Region the state bucket and DynamoDB lock table live in."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Globally-unique S3 bucket name for Terraform state. Suggested: <org>-corastate-tfstate."
  type        = string
}

variable "state_lock_table_name" {
  description = "DynamoDB table for state locking."
  type        = string
  default     = "corastate-tfstate-lock"
}

variable "github_repository" {
  description = "Owner/repo allowed to assume the deployer role, e.g. corastate/corastate."
  type        = string
  default     = "corastate/corastate"
}

variable "tags" {
  description = "Tags merged onto every resource in this module."
  type        = map(string)
  default = {
    Project     = "corastate"
    Environment = "shared"
    ManagedBy   = "terraform"
    Workspace   = "bootstrap"
  }
}
