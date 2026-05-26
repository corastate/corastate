output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "VPC CIDR."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet IDs in AZ order."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs in AZ order."
  value       = aws_subnet.private[*].id
}

output "nat_gateway_id" {
  description = "Single shared NAT gateway ID."
  value       = aws_nat_gateway.this.id
}

output "availability_zones" {
  description = "Availability zones the subnets were placed in."
  value       = local.azs
}
