# Remote state backend. The bucket and lock table are created by the
# bootstrap config; see terraform/README.md.
#
# Run `terraform init` once locally, supplying the bucket name produced by
# bootstrap:
#
#   terraform init \
#     -backend-config="bucket=<bucket-from-bootstrap>" \
#     -backend-config="key=production/terraform.tfstate" \
#     -backend-config="region=<aws-region>" \
#     -backend-config="dynamodb_table=corastate-tfstate-lock" \
#     -backend-config="encrypt=true"
#
# A backend block must declare the backend type at parse time but values
# can be supplied via -backend-config so the same file works for multiple
# accounts.
terraform {
  backend "s3" {
    key     = "production/terraform.tfstate"
    encrypt = true
  }
}
