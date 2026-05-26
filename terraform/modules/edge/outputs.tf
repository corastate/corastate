output "alb_arn" {
  description = "ALB ARN."
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "ALB DNS name."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID (used for alias records)."
  value       = aws_lb.this.zone_id
}

output "backend_target_group_arn" {
  description = "Target group for backend API paths."
  value       = aws_lb_target_group.backend.arn
}

output "web_target_group_arn" {
  description = "Target group for the web SPA."
  value       = aws_lb_target_group.web.arn
}

output "certificate_arn" {
  description = "ACM certificate ARN."
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "public_url" {
  description = "Public HTTPS URL the stack serves."
  value       = "https://${var.domain}"
}
