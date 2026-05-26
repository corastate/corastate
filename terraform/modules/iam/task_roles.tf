# Per-service ECS task roles. Each one is least-privilege, granting only the
# secrets and AWS APIs the running container actually needs at runtime.
data "aws_iam_policy_document" "task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

locals {
  services = {
    backend = var.backend_secret_keys
    worker  = var.worker_secret_keys
    web     = var.web_secret_keys
    cli     = var.cli_secret_keys
  }
}

resource "aws_iam_role" "service" {
  for_each = local.services

  name               = "${var.name_prefix}-${each.key}-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-${each.key}-task"
  })
}

# Build a policy doc per service. Only secrets in the service's allow-list
# are granted; kms:Decrypt is granted on the CMK so secret decryption works.
data "aws_iam_policy_document" "service_runtime" {
  for_each = local.services

  dynamic "statement" {
    for_each = length(each.value) > 0 ? [1] : []
    content {
      sid     = "ReadAssignedSecrets"
      actions = ["secretsmanager:GetSecretValue"]
      resources = [
        for k in each.value : var.secret_arns[k]
        if contains(keys(var.secret_arns), k)
      ]
    }
  }

  dynamic "statement" {
    for_each = length(each.value) > 0 ? [1] : []
    content {
      sid       = "DecryptWithCMK"
      actions   = ["kms:Decrypt"]
      resources = [var.kms_key_arn]
    }
  }

  # All task roles get a no-op statement so the document always has at least
  # one statement (required by aws_iam_role_policy when no secrets are set).
  statement {
    sid       = "DescribeOwnContainer"
    actions   = ["ecs:DescribeTasks"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "service_runtime" {
  for_each = local.services

  name   = "${var.name_prefix}-${each.key}-runtime"
  role   = aws_iam_role.service[each.key].id
  policy = data.aws_iam_policy_document.service_runtime[each.key].json
}
