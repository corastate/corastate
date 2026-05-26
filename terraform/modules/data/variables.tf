variable "name_prefix" {
  description = "Prefix applied to RDS, subnet group, parameter group, and secret names."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs the DB subnet group spans."
  type        = list(string)
}

variable "rds_sg_id" {
  description = "Security group attached to the RDS instance."
  type        = string
}

variable "kms_key_arn" {
  description = "KMS CMK ARN used for storage encryption and credentials secret encryption."
  type        = string
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "engine_version" {
  description = "Postgres engine version."
  type        = string
  default     = "16.4"
}

variable "allocated_storage_gb" {
  description = "Initial allocated storage in GB."
  type        = number
  default     = 20
}

variable "max_allocated_storage_gb" {
  description = "Storage autoscaling ceiling in GB."
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Initial database name created inside the RDS instance."
  type        = string
  default     = "corastate"
}

variable "master_username" {
  description = "Master username."
  type        = string
  default     = "corastate"
}

variable "db_port" {
  description = "Postgres port."
  type        = number
  default     = 5432
}

variable "multi_az" {
  description = "Whether to enable multi-AZ. Off by default for cost; flip for prod-HA."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Automated backup retention in days."
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Block accidental destroy. Disable only for ephemeral envs."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Skip the final snapshot on destroy. Keep false for prod."
  type        = bool
  default     = false
}

variable "secret_recovery_window_days" {
  description = "Days the credentials secret stays recoverable after deletion."
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags merged onto every resource in this module."
  type        = map(string)
  default     = {}
}
