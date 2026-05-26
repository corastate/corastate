# Trust policy for the GitHub Actions deployer role.
#
# The role is assumable only when:
#   * the call comes from the GitHub OIDC issuer (token.actions.githubusercontent.com)
#   * the token audience is sts.amazonaws.com (set by aws-actions/configure-aws-credentials)
#   * the token subject matches one of the configured branch patterns for
#     the corastate/corastate repository
#
# Adding repo:OWNER/REPO:pull_request would also let PR workflows assume
# the role; default here is push-to-main only, plus workflow_dispatch from main.
data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        for ref in var.github_role_branch_patterns :
        "repo:${var.github_repository}:ref:${ref}"
      ]
    }
  }
}

resource "aws_iam_role" "github_deployer" {
  name                 = "${var.name_prefix}-github-deployer"
  description          = "Assumed by GitHub Actions in ${var.github_repository} to build images and run terraform."
  assume_role_policy   = data.aws_iam_policy_document.github_assume.json
  max_session_duration = 3600

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-github-deployer"
  })
}

# Capability granted to the deployer:
#
#   * ECR: push images to the four corastate-* repos.
#   * ECS: force a new deployment on services in the cluster.
#   * Terraform state: read/write S3 objects in the state bucket and acquire
#     the DynamoDB lock.
#   * Read access on everything Terraform reads during plan. AdministratorAccess
#     is intentionally not granted; the role can read but not mutate resources
#     outside the explicit allow-list.
data "aws_iam_policy_document" "github_deployer" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:DescribeRepositories",
      "ecr:DescribeImages",
      "ecr:ListImages",
      "ecr:BatchGetImage",
    ]
    resources = length(var.ecr_repository_arns) > 0 ? var.ecr_repository_arns : ["*"]
  }

  statement {
    sid = "EcsDeploy"
    actions = [
      "ecs:UpdateService",
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:RegisterTaskDefinition",
      "ecs:DescribeClusters",
      "ecs:ListTasks",
      "ecs:DescribeTasks",
      "ecs:RunTask",
    ]
    resources = ["*"]
  }

  statement {
    sid     = "PassRolesToEcs"
    actions = ["iam:PassRole"]
    resources = [
      aws_iam_role.task_execution.arn,
      aws_iam_role.service["backend"].arn,
      aws_iam_role.service["worker"].arn,
      aws_iam_role.service["web"].arn,
      aws_iam_role.service["cli"].arn,
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid = "TerraformStateBucket"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [var.terraform_state_bucket_arn]
  }

  statement {
    sid = "TerraformStateObjects"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${var.terraform_state_bucket_arn}/*"]
  }

  statement {
    sid = "TerraformLockTable"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable",
    ]
    resources = [var.terraform_state_lock_table_arn]
  }

  # Read-only across the account so `terraform plan` can refresh state.
  # Apply-time writes still need explicit permissions above; the broad read
  # is bounded by the OIDC trust + branch condition.
  statement {
    sid = "TerraformPlanRead"
    actions = [
      "ec2:Describe*",
      "elasticloadbalancing:Describe*",
      "rds:Describe*",
      "iam:Get*",
      "iam:List*",
      "ecs:Describe*",
      "ecs:List*",
      "ecr:Describe*",
      "ecr:List*",
      "secretsmanager:Describe*",
      "secretsmanager:List*",
      "kms:Describe*",
      "kms:List*",
      "kms:GetKey*",
      "route53:Get*",
      "route53:List*",
      "acm:Describe*",
      "acm:List*",
      "logs:Describe*",
      "logs:List*",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_deployer" {
  name        = "${var.name_prefix}-github-deployer"
  description = "Capabilities granted to the GitHub Actions deployer role."
  policy      = data.aws_iam_policy_document.github_deployer.json
}

resource "aws_iam_role_policy_attachment" "github_deployer" {
  role       = aws_iam_role.github_deployer.name
  policy_arn = aws_iam_policy.github_deployer.arn
}
