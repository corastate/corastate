# ACM certificate for the public domain. Issued in the same region as the
# ALB (regional ALBs require a regional cert; only CloudFront needs us-east-1).
resource "aws_acm_certificate" "this" {
  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-${var.domain}"
  })
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.this.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# Application Load Balancer.
resource "aws_lb" "this" {
  name               = "${var.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnet_ids

  drop_invalid_header_fields = true
  idle_timeout               = 60

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-alb"
  })
}

# Target group for backend API paths (/v1/* and /internal/*).
resource "aws_lb_target_group" "backend" {
  name        = "${var.name_prefix}-backend"
  vpc_id      = var.vpc_id
  port        = var.backend_port
  protocol    = "HTTP"
  target_type = "ip"

  health_check {
    enabled             = true
    path                = var.backend_health_path
    port                = "traffic-port"
    protocol            = "HTTP"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-299"
  }

  deregistration_delay = 30

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-backend"
  })
}

# Target group for the web SPA (nginx).
resource "aws_lb_target_group" "web" {
  name        = "${var.name_prefix}-web"
  vpc_id      = var.vpc_id
  port        = var.web_port
  protocol    = "HTTP"
  target_type = "ip"

  health_check {
    enabled             = true
    path                = var.web_health_path
    port                = "traffic-port"
    protocol            = "HTTP"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }

  deregistration_delay = 30

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-web"
  })
}

# Port 80 listener: permanent redirect to HTTPS.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = var.tags
}

# Port 443 listener: web SPA is the default; path-based rules route the
# API namespaces to the backend service.
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.this.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  tags = var.tags
}

resource "aws_lb_listener_rule" "backend_v1" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/v1/*"]
    }
  }
}

resource "aws_lb_listener_rule" "backend_internal" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/internal/*"]
    }
  }
}

# Alias record pointing the user-facing domain at the ALB.
resource "aws_route53_record" "alias" {
  zone_id = var.route53_zone_id
  name    = var.domain
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
