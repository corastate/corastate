# Public-facing ALB. Open to the internet on 80/443.
resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb"
  description = "Public ALB. 443 from internet, 80 redirects to 443."
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-alb"
  })
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from the internet."
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from the internet, redirected to HTTPS by the listener."
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "ALB to ECS tasks. Egress is constrained on the task side."
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Backend ECS service. Only accepts traffic from the ALB on the backend port.
resource "aws_security_group" "backend_tasks" {
  name        = "${var.name_prefix}-backend-tasks"
  description = "Backend ECS tasks. Ingress from ALB only."
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-backend-tasks"
  })
}

resource "aws_vpc_security_group_ingress_rule" "backend_from_alb" {
  security_group_id            = aws_security_group.backend_tasks.id
  description                  = "Backend port from ALB."
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = var.backend_port
  to_port                      = var.backend_port
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "backend_all" {
  security_group_id = aws_security_group.backend_tasks.id
  description       = "Egress to RDS, Secrets Manager, ECR, CW Logs, outbound integrations."
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Web ECS service. Accepts traffic from the ALB on the web port.
resource "aws_security_group" "web_tasks" {
  name        = "${var.name_prefix}-web-tasks"
  description = "Web (nginx) ECS tasks. Ingress from ALB only."
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-web-tasks"
  })
}

resource "aws_vpc_security_group_ingress_rule" "web_from_alb" {
  security_group_id            = aws_security_group.web_tasks.id
  description                  = "Web port from ALB."
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = var.web_port
  to_port                      = var.web_port
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "web_all" {
  security_group_id = aws_security_group.web_tasks.id
  description       = "Egress for image pulls and log shipping."
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Worker ECS service. No public port; the SG exists so the RDS rule can
# reference it.
resource "aws_security_group" "worker_tasks" {
  name        = "${var.name_prefix}-worker-tasks"
  description = "Worker ECS tasks. No inbound."
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-worker-tasks"
  })
}

resource "aws_vpc_security_group_egress_rule" "worker_all" {
  security_group_id = aws_security_group.worker_tasks.id
  description       = "Egress to RDS, Secrets Manager, ECR, CW Logs, vendor APIs."
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# RDS Postgres. Accepts 5432 from backend, worker, and one-shot CLI tasks.
resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds"
  description = "RDS Postgres. Ingress from ECS task SGs only."
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-rds"
  })
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_backend" {
  security_group_id            = aws_security_group.rds.id
  description                  = "Postgres from backend tasks."
  referenced_security_group_id = aws_security_group.backend_tasks.id
  from_port                    = var.db_port
  to_port                      = var.db_port
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_worker" {
  security_group_id            = aws_security_group.rds.id
  description                  = "Postgres from worker tasks."
  referenced_security_group_id = aws_security_group.worker_tasks.id
  from_port                    = var.db_port
  to_port                      = var.db_port
  ip_protocol                  = "tcp"
}

# Sidecar SG for the one-shot CLI task. The CLI runs migrations and seed jobs
# via `aws ecs run-task`. Attaching this SG to that task gives it Postgres
# access without widening any service-level SG.
resource "aws_security_group" "cli_tasks" {
  name        = "${var.name_prefix}-cli-tasks"
  description = "One-shot CLI tasks. No inbound; outbound to RDS only via the rule on the RDS SG."
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-cli-tasks"
  })
}

resource "aws_vpc_security_group_egress_rule" "cli_all" {
  security_group_id = aws_security_group.cli_tasks.id
  description       = "Egress for image pulls, log shipping, Secrets Manager, RDS."
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_cli" {
  security_group_id            = aws_security_group.rds.id
  description                  = "Postgres from one-shot CLI tasks."
  referenced_security_group_id = aws_security_group.cli_tasks.id
  from_port                    = var.db_port
  to_port                      = var.db_port
  ip_protocol                  = "tcp"
}
