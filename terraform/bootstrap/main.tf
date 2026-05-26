# Bootstrap config. Applied once, before the production workspace, with the
# operator's own AWS credentials (root or break-glass admin). Creates the
# resources that have to exist before any other Terraform run:
#
#   * S3 bucket for remote state
#   * DynamoDB table for state locking
#   * GitHub Actions OIDC provider (account-level, single instance)
#
# This config uses local state only. The state file ends up in
# terraform/bootstrap/terraform.tfstate; check it into a private location
# or accept that re-running bootstrap from a clean clone will be a no-op
# import-or-skip exercise. The chicken-and-egg is real and documented in
# terraform/README.md.

provider "aws" {
  region = var.aws_region
}

# -----------------------------------------------------------------------------
# Remote state backend storage.
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "tfstate" {
  bucket = var.state_bucket_name

  tags = merge(var.tags, {
    Name = var.state_bucket_name
  })
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    id     = "expire-noncurrent-state"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_dynamodb_table" "tfstate_lock" {
  name         = var.state_lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = var.state_lock_table_name
  })
}

# -----------------------------------------------------------------------------
# GitHub Actions OIDC provider. Account-level resource; only one instance per
# AWS account. The thumbprint is fetched dynamically from the OIDC issuer's
# TLS chain rather than hard-coded.
# -----------------------------------------------------------------------------

data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]

  tags = merge(var.tags, {
    Name = "github-actions"
  })
}
