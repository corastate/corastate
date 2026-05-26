variable "name_prefix" {
  description = "Prefix applied to every Name tag in this module."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Two public subnet CIDRs, one per AZ. Order matches private_subnet_cidrs and azs."
  type        = list(string)
  default     = ["10.40.0.0/20", "10.40.16.0/20"]
  validation {
    condition     = length(var.public_subnet_cidrs) == 2
    error_message = "Exactly two public subnets are expected."
  }
}

variable "private_subnet_cidrs" {
  description = "Two private subnet CIDRs, one per AZ."
  type        = list(string)
  default     = ["10.40.32.0/20", "10.40.48.0/20"]
  validation {
    condition     = length(var.private_subnet_cidrs) == 2
    error_message = "Exactly two private subnets are expected."
  }
}

variable "azs" {
  description = "Two availability zones to spread subnets across. If empty, the module uses the first two AZs returned by aws_availability_zones."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags merged onto every resource in this module."
  type        = map(string)
  default     = {}
}
