variable "name_prefix" {
  description = "Prefix applied to ALB, target group, ACM, and Route53 record names."
  type        = string
}

variable "vpc_id" {
  description = "VPC the ALB and target groups live in."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets the ALB attaches to."
  type        = list(string)
}

variable "alb_sg_id" {
  description = "Security group attached to the ALB."
  type        = string
}

variable "domain" {
  description = "Public hostname this stack serves, e.g. app.corastate.io."
  type        = string
}

variable "route53_zone_id" {
  description = "Existing Route53 hosted zone ID containing `domain`."
  type        = string
}

variable "backend_port" {
  description = "Backend container port."
  type        = number
  default     = 4000
}

variable "web_port" {
  description = "Web container port."
  type        = number
  default     = 80
}

variable "backend_health_path" {
  description = "HTTP health-check path on the backend target group."
  type        = string
  default     = "/internal/health"
}

variable "web_health_path" {
  description = "HTTP health-check path on the web target group."
  type        = string
  default     = "/"
}

variable "tags" {
  description = "Tags merged onto every resource in this module."
  type        = map(string)
  default     = {}
}
