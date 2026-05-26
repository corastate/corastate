# Shared ECS task execution role. Used by every task definition to
# pull from ECR, write to CloudWatch Logs, and resolve referenced
# Secrets Manager secrets at task-launch time.
data "aws_iam_policy_document" "task_execution_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.name_prefix}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.task_execution_assume.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-ecs-task-execution"
  })
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "task_execution_secrets" {
  statement {
    sid     = "ReadAllReferencedSecrets"
    actions = ["secretsmanager:GetSecretValue"]
    # Execution role gets every secret in this stack. Per-service authorisation
    # is enforced by which secrets each task definition references in its
    # `secrets` block.
    resources = length(var.secret_arns) > 0 ? values(var.secret_arns) : ["*"]
  }

  statement {
    sid       = "DecryptWithCMK"
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "${var.name_prefix}-task-execution-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_secrets.json
}
