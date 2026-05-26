resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-cluster"
  })
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

locals {
  services = ["backend", "worker", "web", "cli"]

  service_container_port = {
    backend = var.backend_port
    worker  = null
    web     = var.web_port
    cli     = null
  }

  service_cpu = {
    backend = var.backend_cpu
    worker  = var.worker_cpu
    web     = var.web_cpu
    cli     = var.cli_cpu
  }

  service_memory = {
    backend = var.backend_memory
    worker  = var.worker_memory
    web     = var.web_memory
    cli     = var.cli_memory
  }

  # Command override per service. The Dockerfile sets a default CMD per
  # leaf target; only the CLI is treated as a one-shot, so each
  # `aws ecs run-task` invocation supplies its own command.
  service_command = {
    backend = null
    worker  = null
    web     = null
    cli     = ["migrate"]
  }
}

resource "aws_cloudwatch_log_group" "service" {
  for_each = toset(local.services)

  name              = "/ecs/${var.name_prefix}/${each.value}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.log_kms_key_arn

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-${each.value}"
    Service = each.value
  })
}

# Container definitions are computed per service, then JSON-encoded into the
# task definition. Secrets come in as { ENV_VAR = secret-arn }; plain env
# vars come in via var.environment.
locals {
  container_definitions = {
    for s in local.services : s => jsonencode([
      {
        name      = s
        image     = "${var.ecr_repository_urls[s]}:${var.image_tag}"
        essential = true
        command   = local.service_command[s]

        portMappings = local.service_container_port[s] == null ? [] : [
          {
            containerPort = local.service_container_port[s]
            hostPort      = local.service_container_port[s]
            protocol      = "tcp"
          }
        ]

        environment = [
          for k, v in lookup(var.environment, s, {}) : {
            name  = k
            value = v
          }
        ]

        secrets = [
          for k, v in lookup(var.secrets, s, {}) : {
            name      = k
            valueFrom = v
          }
        ]

        logConfiguration = {
          logDriver = "awslogs"
          options = {
            awslogs-group         = aws_cloudwatch_log_group.service[s].name
            awslogs-region        = var.aws_region
            awslogs-stream-prefix = s
          }
        }

        # Health check on backend only. Worker has no listener; web's health
        # is observed by the ALB target group.
        healthCheck = s == "backend" ? {
          command     = ["CMD-SHELL", "wget -q -O- http://localhost:${var.backend_port}/internal/health || exit 1"]
          interval    = 30
          timeout     = 5
          retries     = 3
          startPeriod = 30
        } : null
      }
    ])
  }
}

resource "aws_ecs_task_definition" "this" {
  for_each = toset(local.services)

  family                   = "${var.name_prefix}-${each.value}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = local.service_cpu[each.value]
  memory                   = local.service_memory[each.value]
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arns[each.value]

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = local.container_definitions[each.value]

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-${each.value}"
    Service = each.value
  })
}

# Long-running services: backend, worker, web.
# CLI is registered as a task definition only; no service.
resource "aws_ecs_service" "backend" {
  name                               = "${var.name_prefix}-backend"
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.this["backend"].arn
  desired_count                      = var.backend_desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  enable_execute_command             = var.enable_execute_command
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  propagate_tags                     = "SERVICE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.service_sg_ids["backend"]]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = toset(var.backend_target_group_arns)
    content {
      target_group_arn = load_balancer.value
      container_name   = "backend"
      container_port   = var.backend_port
    }
  }

  lifecycle {
    # Task definition is updated externally by `aws ecs update-service
    # --force-new-deployment` after image push. Letting Terraform fight
    # CI over the active revision would cause drift on every deploy.
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-backend"
    Service = "backend"
  })
}

resource "aws_ecs_service" "worker" {
  name                               = "${var.name_prefix}-worker"
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.this["worker"].arn
  desired_count                      = var.worker_desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  enable_execute_command             = var.enable_execute_command
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 200
  propagate_tags                     = "SERVICE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.service_sg_ids["worker"]]
    assign_public_ip = false
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-worker"
    Service = "worker"
  })
}

resource "aws_ecs_service" "web" {
  name                               = "${var.name_prefix}-web"
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.this["web"].arn
  desired_count                      = var.web_desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  enable_execute_command             = var.enable_execute_command
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  propagate_tags                     = "SERVICE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.service_sg_ids["web"]]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.web_target_group_arn
    container_name   = "web"
    container_port   = var.web_port
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-web"
    Service = "web"
  })
}

# CLI is registered as a one-shot task definition. Operators invoke it with:
#
#   aws ecs run-task \
#     --cluster ${var.name_prefix}-cluster \
#     --task-definition ${var.name_prefix}-cli \
#     --launch-type FARGATE \
#     --network-configuration "awsvpcConfiguration={subnets=[<priv-1>,<priv-2>],securityGroups=[<cli-sg>],assignPublicIp=DISABLED}" \
#     --overrides '{"containerOverrides":[{"name":"cli","command":["migrate"]}]}'
#
# Defaults to the `migrate` command. Override at run-task time for `seed`,
# `sync`, `diagnose`, etc. The CLI SG (cli_sg_id) is exposed as an output so
# the run-task wrapper can pick it up.
