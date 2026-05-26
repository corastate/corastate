resource "aws_db_subnet_group" "this" {
  name        = "${var.name_prefix}-db"
  description = "Private subnets for the ${var.name_prefix} RDS instance."
  subnet_ids  = var.private_subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db"
  })
}

# Custom parameter group. Required SSL is enforced at the engine level so that
# any client connecting from inside the VPC still negotiates TLS.
resource "aws_db_parameter_group" "this" {
  name        = "${var.name_prefix}-pg16"
  family      = "postgres16"
  description = "Corastate Postgres parameters."

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-pg16"
  })
}

# RDS-managed master password is allowed, but the spec asks for Terraform to
# generate and store the credential in Secrets Manager. random_password +
# aws_db_instance.password keeps the workflow auditable in plan/apply.
resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#$%*()-_=+[]{}<>?"
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${var.name_prefix}/db-credentials"
  description             = "Master credentials for the ${var.name_prefix} RDS instance."
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.secret_recovery_window_days

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db-credentials"
  })
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_name  = var.db_name
  username = var.master_username
  password = random_password.master.result
  port     = var.db_port

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.rds_sg_id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.multi_az

  backup_retention_period    = var.backup_retention_days
  backup_window              = "06:00-07:00"
  maintenance_window         = "Sun:08:00-Sun:09:00"
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-postgres-final-${formatdate("YYYYMMDDhhmmss", timestamp())}"

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = var.kms_key_arn
  performance_insights_retention_period = 7

  enabled_cloudwatch_logs_exports = ["postgresql"]

  apply_immediately = false

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-postgres"
  })

  lifecycle {
    # final_snapshot_identifier embeds a timestamp() and would force replacement
    # on every plan. The snapshot ID only matters at destroy time, so ignoring
    # drift on it is safe.
    ignore_changes = [final_snapshot_identifier]
  }
}

# Credentials JSON written after the instance exists, so the DATABASE_URL field
# can include the real endpoint. Apps read this secret via the ECS task
# definition `secrets` block.
resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.this.username
    password = random_password.master.result
    host     = aws_db_instance.this.address
    port     = aws_db_instance.this.port
    dbname   = aws_db_instance.this.db_name
    # PgBouncer-compatible URL. Tasks parse this end-to-end.
    url = "postgres://${aws_db_instance.this.username}:${urlencode(random_password.master.result)}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}?sslmode=require"
  })
}
