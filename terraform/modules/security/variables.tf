variable "name_prefix" {
  description = "Prefix applied to security group names."
  type        = string
}

variable "vpc_id" {
  description = "VPC the security groups belong to."
  type        = string
}

variable "backend_port" {
  description = "Container port the backend service listens on."
  type        = number
  default     = 4000
}

variable "web_port" {
  description = "Container port the web (nginx) service listens on."
  type        = number
  default     = 80
}

variable "db_port" {
  description = "Postgres listening port."
  type        = number
  default     = 5432
}

variable "tags" {
  description = "Tags merged onto every resource in this module."
  type        = map(string)
  default     = {}
}
