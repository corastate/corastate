variable "name_prefix" {
  description = "Prefix applied to KMS aliases and Secrets Manager names."
  type        = string
}

variable "deletion_window_days" {
  description = "Days a KMS key stays in the pending-deletion state before final removal."
  type        = number
  default     = 30
}

variable "secret_recovery_window_days" {
  description = "Days a Secrets Manager secret stays recoverable after deletion. Set to 0 to delete immediately (useful for ephemeral envs)."
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags merged onto every resource in this module."
  type        = map(string)
  default     = {}
}
