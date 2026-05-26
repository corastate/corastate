variable "repository_names" {
  description = "ECR repository names to create. Defaults match the Dockerfile leaf targets."
  type        = list(string)
  default     = ["corastate-backend", "corastate-worker", "corastate-web", "corastate-cli"]
}

variable "image_tag_mutability" {
  description = "Whether image tags can be overwritten. IMMUTABLE forces per-SHA tagging discipline."
  type        = string
  default     = "IMMUTABLE"
  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.image_tag_mutability)
    error_message = "image_tag_mutability must be MUTABLE or IMMUTABLE."
  }
}

variable "scan_on_push" {
  description = "Run the basic ECR scan on every push."
  type        = bool
  default     = true
}

variable "untagged_image_retention_count" {
  description = "Number of untagged images to keep per repo. Older untagged images are deleted."
  type        = number
  default     = 10
}

variable "tags" {
  description = "Tags merged onto every resource in this module."
  type        = map(string)
  default     = {}
}
