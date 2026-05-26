# Customer-managed KMS key used to encrypt the application-layer envelope
# encryption master key, RDS storage, and Secrets Manager entries managed
# here. Corastate's credential storage already uses an AES-256-GCM master
# key managed in process memory; in production the master key material
# lives in Secrets Manager and is itself encrypted with this CMK.
resource "aws_kms_key" "main" {
  description             = "${var.name_prefix} envelope encryption + Secrets Manager + RDS storage."
  deletion_window_in_days = var.deletion_window_days
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-main"
  })
}

resource "aws_kms_alias" "main" {
  name          = "alias/${var.name_prefix}-main"
  target_key_id = aws_kms_key.main.key_id
}

# Application envelope-encryption master key (base64 32-byte).
resource "random_password" "envelope_master_key" {
  length      = 44
  special     = false
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
}

resource "aws_secretsmanager_secret" "envelope_master_key" {
  name                    = "${var.name_prefix}/envelope-master-key"
  description             = "Base64 32-byte master key for Corastate's credential storage AES-256-GCM envelope."
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = var.secret_recovery_window_days

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-envelope-master-key"
  })
}

resource "aws_secretsmanager_secret_version" "envelope_master_key" {
  secret_id     = aws_secretsmanager_secret.envelope_master_key.id
  secret_string = base64encode(random_password.envelope_master_key.result)
}

# Session signing secret (HMAC, ~64 bytes).
resource "random_password" "session_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "session_secret" {
  name                    = "${var.name_prefix}/session-secret"
  description             = "HMAC secret for signing session tokens."
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = var.secret_recovery_window_days

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-session-secret"
  })
}

resource "aws_secretsmanager_secret_version" "session_secret" {
  secret_id     = aws_secretsmanager_secret.session_secret.id
  secret_string = random_password.session_secret.result
}

# Placeholder for the Anthropic API key. Wesley populates the value
# manually via the AWS console or CLI after the secret is created.
# Terraform manages the container; the value lifecycle is ignored.
resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name                    = "${var.name_prefix}/anthropic-api-key"
  description             = "Anthropic API key. Populate manually after apply."
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = var.secret_recovery_window_days

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-anthropic-api-key"
  })
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key_placeholder" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = "REPLACE_ME"

  lifecycle {
    ignore_changes = [secret_string]
  }
}
