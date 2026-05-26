provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}

locals {
  name = var.name_prefix
}

module "network" {
  source = "../../modules/network"

  name_prefix          = local.name
  vpc_cidr             = var.vpc_cidr
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  tags                 = var.tags
}

module "security" {
  source = "../../modules/security"

  name_prefix = local.name
  vpc_id      = module.network.vpc_id
  tags        = var.tags
}

module "secrets" {
  source = "../../modules/secrets"

  name_prefix = local.name
  tags        = var.tags
}

module "data" {
  source = "../../modules/data"

  name_prefix          = local.name
  private_subnet_ids   = module.network.private_subnet_ids
  rds_sg_id            = module.security.rds_sg_id
  kms_key_arn          = module.secrets.kms_key_arn
  instance_class       = var.db_instance_class
  allocated_storage_gb = var.db_allocated_storage_gb
  multi_az             = var.db_multi_az
  tags                 = var.tags
}

module "ecr" {
  source = "../../modules/ecr"

  tags = var.tags
}

module "iam" {
  source = "../../modules/iam"

  name_prefix = local.name
  kms_key_arn = module.secrets.kms_key_arn

  secret_arns = {
    db_credentials      = module.data.credentials_secret_arn
    envelope_master_key = module.secrets.envelope_master_key_secret_arn
    session_secret      = module.secrets.session_secret_arn
    anthropic_api_key   = module.secrets.anthropic_api_key_secret_arn
  }

  github_oidc_provider_arn       = var.github_oidc_provider_arn
  github_repository              = var.github_repository
  ecr_repository_arns            = values(module.ecr.repository_arns)
  aws_region                     = var.aws_region
  terraform_state_bucket_arn     = var.terraform_state_bucket_arn
  terraform_state_lock_table_arn = var.terraform_state_lock_table_arn

  tags = var.tags
}

module "edge" {
  source = "../../modules/edge"

  name_prefix       = local.name
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  alb_sg_id         = module.security.alb_sg_id
  domain            = var.domain
  route53_zone_id   = var.route53_zone_id

  tags = var.tags
}

module "compute" {
  source = "../../modules/compute"

  name_prefix             = local.name
  aws_region              = var.aws_region
  vpc_id                  = module.network.vpc_id
  private_subnet_ids      = module.network.private_subnet_ids
  ecr_repository_urls     = module.ecr.repository_urls
  image_tag               = var.image_tag
  task_execution_role_arn = module.iam.task_execution_role_arn
  task_role_arns          = module.iam.task_role_arns
  log_kms_key_arn         = module.secrets.kms_key_arn
  log_retention_days      = var.log_retention_days

  service_sg_ids = {
    backend = module.security.backend_tasks_sg_id
    worker  = module.security.worker_tasks_sg_id
    web     = module.security.web_tasks_sg_id
  }
  cli_sg_id = module.security.cli_tasks_sg_id

  backend_target_group_arns = [module.edge.backend_target_group_arn]
  web_target_group_arn      = module.edge.web_target_group_arn

  backend_desired_count = var.backend_desired_count
  worker_desired_count  = var.worker_desired_count
  web_desired_count     = var.web_desired_count

  # Per-service runtime env. Plain values; nothing sensitive here.
  environment = {
    backend = {
      NODE_ENV        = "production"
      BACKEND_PORT    = "4000"
      LOG_LEVEL       = "info"
      PUBLIC_BASE_URL = "https://${var.domain}"
    }
    worker = {
      NODE_ENV  = "production"
      LOG_LEVEL = "info"
    }
    web = {
      # nginx config baked into the image; nothing to set here.
    }
    cli = {
      NODE_ENV  = "production"
      LOG_LEVEL = "info"
    }
  }

  # Per-service secrets exposed as ENV vars. Each entry resolves a
  # Secrets Manager ARN into the env var at task launch.
  secrets = {
    backend = {
      DATABASE_URL                   = "${module.data.credentials_secret_arn}:url::"
      ENVELOPE_ENCRYPTION_MASTER_KEY = module.secrets.envelope_master_key_secret_arn
      SESSION_SECRET                 = module.secrets.session_secret_arn
    }
    worker = {
      DATABASE_URL                   = "${module.data.credentials_secret_arn}:url::"
      ENVELOPE_ENCRYPTION_MASTER_KEY = module.secrets.envelope_master_key_secret_arn
      ANTHROPIC_API_KEY              = module.secrets.anthropic_api_key_secret_arn
    }
    web = {}
    cli = {
      DATABASE_URL                   = "${module.data.credentials_secret_arn}:url::"
      ENVELOPE_ENCRYPTION_MASTER_KEY = module.secrets.envelope_master_key_secret_arn
    }
  }

  tags = var.tags
}
