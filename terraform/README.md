# Corastate AWS infrastructure

Terraform that provisions the production AWS environment for Corastate. The
stack runs the four services from the repo Dockerfile on ECS Fargate, fronted
by an ALB, against an RDS Postgres instance. Everything lives inside a single
VPC; nothing in the application path is publicly addressable except the ALB.

This config is checked in but not yet applied. The maintainer applies it when
ready to commit to the monthly AWS spend. Until then the directory is a
review artifact.

## Layout

```
terraform/
  bootstrap/                  one-time setup: state bucket, lock table, OIDC provider
  modules/
    network/                  VPC, subnets, NAT, route tables
    security/                 security groups for ALB, tasks, RDS
    secrets/                  KMS CMK + Secrets Manager entries
    data/                     RDS Postgres + DB credentials secret
    ecr/                      one repo per Docker target
    iam/                      task roles, task execution role, GitHub deployer role
    compute/                  ECS cluster, task definitions, services, log groups
    edge/                     ACM cert, ALB, listeners, target groups, Route53 alias
  environments/
    production/               wires the modules together for prod
```

## Architecture

```
                              +-----------------------+
                       HTTPS  |  Route53: app.<domain>|
            user ---->        +-----------+-----------+
                                          |
                                          v
                              +-----------------------+
                              |        ALB (443)      |
                              |  /v1/*, /internal/*   |
                              |       /  (web)        |
                              +-----+----------+------+
                                    |          |
                       backend TG   |          |   web TG
                                    v          v
                          +---------+----+   +-+----------+
                          |  backend     |   |  web       |
                          |  ECS service |   |  ECS svc   |
                          |  (Fargate)   |   |  (Fargate) |
                          +------+-------+   +------+-----+
                                 |                  |
                                 v                  |
                          +---------------+         |
                          |  worker       |         |
                          |  ECS service  |         |
                          |  (Fargate)    |         |
                          +------+--------+         |
                                 |                  |
                                 v                  |
                          +---------------+         |
                          |  RDS Postgres |         |
                          |  (private)    |         |
                          +---------------+         |
                                                    |
   Secrets Manager + KMS                            |
   - db credentials (JSON)                          |
   - envelope master key                            |
   - session secret                                 |
   - anthropic api key                              |
                                                    |
   ECR (per service)  <---- GitHub Actions OIDC <---+
   - corastate-backend
   - corastate-worker
   - corastate-web
   - corastate-cli
```

Two AZs, one NAT (cost-optimized), single-AZ RDS. The README's prod-HA notes
call out where to flip the switches.

## One-time setup

The maintainer runs these once with admin credentials. Future deploys go
through GitHub Actions and the OIDC role.

1. **AWS account.** Create or pick the account that owns the stack. Note the
   account ID.

2. **Domain and Route53 zone.** Register the domain (Route53 or transfer in)
   and create a public hosted zone for it. The Terraform expects the zone to
   exist; it does not manage the zone or registrar.

3. **Bootstrap workspace.** Creates the state bucket, lock table, and GitHub
   Actions OIDC provider. Local state only, applied once.

   ```bash
   cd terraform/bootstrap
   cp terraform.tfvars.example terraform.tfvars
   # edit terraform.tfvars: pick a globally unique bucket name
   terraform init
   terraform apply
   ```

   Save the outputs. You'll paste several into `environments/production/terraform.tfvars`.

4. **GitHub repo secrets and variables.** In the GitHub repo settings:

   Secrets (Settings -> Secrets and variables -> Actions -> New repository secret):
   - `AWS_DEPLOY_ROLE_ARN`: ARN of the deployer role. Read from
     `terraform output github_deployer_role_arn` in the production workspace
     after the first apply. Until that exists, the workflow will fail; that
     is expected on the very first push.
   - `AWS_REGION`: e.g. `us-east-1`.
   - `TF_STATE_BUCKET`: name from `bootstrap` outputs.
   - `TF_STATE_LOCK_TABLE`: name from `bootstrap` outputs (default
     `corastate-tfstate-lock`).

   Variables (same screen, Variables tab):
   - `TF_VAR_domain`
   - `TF_VAR_route53_zone_id`
   - `TF_VAR_github_oidc_provider_arn`
   - `TF_VAR_terraform_state_bucket_arn`
   - `TF_VAR_terraform_state_lock_table_arn`

5. **Production workspace, first apply.** This is the chicken-and-egg
   moment: CI cannot run apply until the deployer role exists, and the
   deployer role only exists after apply. The first apply runs locally
   with admin credentials.

   ```bash
   cd terraform/environments/production
   cp terraform.tfvars.example terraform.tfvars
   # edit terraform.tfvars: paste in domain, zone, and bootstrap outputs
   terraform init \
     -backend-config="bucket=$(cd ../../bootstrap && terraform output -raw state_bucket_name)" \
     -backend-config="region=$(cd ../../bootstrap && terraform output -raw aws_region)" \
     -backend-config="dynamodb_table=$(cd ../../bootstrap && terraform output -raw state_lock_table_name)" \
     -backend-config="encrypt=true"
   terraform plan
   terraform apply
   ```

6. **Populate the Anthropic API key.** The Terraform creates the secret
   container; the value is `REPLACE_ME` until you set it:

   ```bash
   aws secretsmanager put-secret-value \
     --secret-id corastate-prod/anthropic-api-key \
     --secret-string "sk-ant-..."
   ```

7. **First image push.** ECS services will not become healthy until images
   exist in ECR. Either push from your laptop:

   ```bash
   aws ecr get-login-password --region "$AWS_REGION" \
     | docker login --username AWS --password-stdin "$(terraform output -raw ecr_repository_urls | jq -r '.["corastate-backend"]' | cut -d/ -f1)"
   for target in backend worker web cli; do
     docker buildx build --platform linux/arm64 -t "corastate-$target:bootstrap" --target "$target" --push .
   done
   ```

   ...or trigger the GitHub Actions workflow with a push to `main`, which
   will run the build matrix.

## How to apply (steady state)

After the first apply, day-to-day deploys flow through GitHub Actions:

- **Push to `main`** -> images get built and pushed to ECR with the commit
  SHA, Terraform plan runs against `environments/production`, the plan is
  posted as a commit comment, ECS services force a new deployment to pick
  up the new image tag.
- **Production drift or infra change** -> manual run via the Actions tab,
  `aws-deploy` workflow, "Run workflow" with `apply: true`. The job re-runs
  the plan inside the same job and applies it. Requires the `production`
  GitHub environment to approve the run if branch protection is wired up.
- **Local apply (fallback)** -> the same `terraform plan && terraform apply`
  flow from step 5 above. The state is shared via S3, so local and CI
  applies converge.

## Cost estimate

Rough monthly cost in `us-east-1` (USD), assuming the defaults in
`environments/production/terraform.tfvars.example`:

| Component              | Sizing                                     | Approx / month |
|------------------------|--------------------------------------------|----------------|
| ALB                    | 1 ALB, modest traffic                      | $18            |
| NAT gateway            | 1 NAT + light egress                       | $35            |
| ECS Fargate (backend)  | 2 tasks, 0.5 vCPU / 1 GB, ARM              | $18            |
| ECS Fargate (worker)   | 1 task, 0.5 vCPU / 1 GB, ARM               | $9             |
| ECS Fargate (web)      | 2 tasks, 0.25 vCPU / 0.5 GB, ARM           | $5             |
| RDS db.t4g.micro       | single-AZ, 20 GB gp3, 7-day backups        | $14            |
| Route53 hosted zone    | 1 zone                                     | $0.50          |
| Secrets Manager        | 4 secrets                                  | $1.60          |
| CloudWatch logs        | 30-day retention, light volume             | $2             |
| ECR storage            | 4 repos, 10-image retention                | $1             |
| KMS                    | 1 CMK                                      | $1             |
| Data transfer          | ALB / NAT egress, light                    | $2-5           |
| **Total (steady)**     |                                            | **~$110-130**  |

Free-tier eligible accounts: the first 12 months absorb a chunk of this. RDS
db.t4g.micro is free-tier (750 hours/month). Fargate is not free-tier. The
realistic out-of-pocket in year one is closer to **$50-80/month**.

Levers that materially change the bill:

- **NAT gateway** is ~30% of the steady cost. Replacing it with VPC endpoints
  for ECR/S3/Secrets Manager/CloudWatch removes most of the NAT data charges
  but keeps the hourly fee. Removing the NAT entirely requires giving up
  outbound internet egress from the workers (acceptable for some connectors,
  not others).
- **Multi-AZ RDS** doubles the RDS line. Set `db_multi_az = true` when the
  product is paying for itself.
- **Two NAT gateways** double the NAT line. Required for prod-HA.

## Tearing down

```bash
cd terraform/environments/production
terraform destroy
```

The Terraform destroys everything inside the production state. Two things
sit outside that state and need manual cleanup:

- The **state bucket and lock table** (`terraform/bootstrap`). Run
  `cd terraform/bootstrap && terraform destroy` after the production
  destroy finishes. The S3 bucket is versioned; if `force_destroy` is not
  set you may need to empty it first via the console.
- The **Route53 hosted zone**, if you created it for this stack and want it
  gone. Delete it manually after Terraform removes its records.

A few resources have safety rails that intentionally fight destroy:

- The RDS instance has `deletion_protection = true` and is configured to
  take a final snapshot. Flip both in `terraform.tfvars` before destroying.
- KMS keys have a deletion window (default 30 days) before they're actually
  removed; the alias goes away immediately.
- ECR repos with images in them require `force_delete = true` or manual
  emptying; ECR module does not set force_delete (intentionally).

## Notes for review

- The single NAT gateway is called out explicitly in
  `modules/network/main.tf`. For prod-HA, two NATs and a per-AZ private
  route table are the standard upgrade.
- `aws_ecs_service.*` resources `ignore_changes` on `task_definition` and
  `desired_count`. CI updates the task definition out-of-band via
  `aws ecs update-service --force-new-deployment`; Terraform would otherwise
  thrash on every plan.
- The CLI runs as a one-shot task. Invoke with `aws ecs run-task` against
  the family in `cli_task_family` output, attached to `cli_security_group_id`
  in `private_subnet_ids`.
- The Anthropic API key secret is created with a placeholder value and
  `lifecycle.ignore_changes = [secret_string]`, so populating it manually
  doesn't fight Terraform on the next apply.
- ARM64 throughout: ECS tasks declare `cpu_architecture = "ARM64"`, the
  workflow builds with `--platform linux/arm64`. Cheaper Fargate; matches
  the t4g RDS instance class.
