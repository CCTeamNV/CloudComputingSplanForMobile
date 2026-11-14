# Cognito User Pool with groups; no group = student (ADR 0006).
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  prefix = "splan-${var.env}"
}

resource "aws_cognito_user_pool" "this" {
  name                = local.prefix
  username_attributes = ["email"]
  deletion_protection = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Cognito default mail: few mails per day, test users come from the seed script without mail.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  lambda_config {
    pre_sign_up = var.pre_signup_lambda_arn
  }
}

resource "aws_lambda_permission" "pre_signup" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.pre_signup_lambda_arn
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

resource "aws_cognito_user_group" "role" {
  for_each = toset(["lecturer", "admin"])

  name         = each.key
  user_pool_id = aws_cognito_user_pool.this.id
}

# Prefix domain for the hosted login (authorize/token endpoints); account id keeps it globally unique.
resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${local.prefix}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.this.id
}

# Public SPA client: no secret, authorization code flow; the frontend sends the PKCE code_challenge.
resource "aws_cognito_user_pool_client" "web" {
  name            = "${local.prefix}-web"
  user_pool_id    = aws_cognito_user_pool.this.id
  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.callback_urls

  explicit_auth_flows           = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

# Role management by Lambda admin (ADR 0006): only this pool, only the four calls it makes.
data "aws_iam_policy_document" "role_admin" {
  count = var.role_admin_role == null ? 0 : 1

  statement {
    actions = [
      "cognito-idp:ListUsers",
      "cognito-idp:AdminListGroupsForUser",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminRemoveUserFromGroup",
    ]
    resources = [aws_cognito_user_pool.this.arn]
  }
}

resource "aws_iam_role_policy" "role_admin" {
  count = var.role_admin_role == null ? 0 : 1

  name   = "cognito-roles"
  role   = var.role_admin_role
  policy = data.aws_iam_policy_document.role_admin[0].json
}

# Account deletion by Lambda student (GDPR, #25): only AdminDeleteUser, only this pool.
data "aws_iam_policy_document" "account_deleter" {
  count = var.account_deleter_role == null ? 0 : 1

  statement {
    actions   = ["cognito-idp:AdminDeleteUser"]
    resources = [aws_cognito_user_pool.this.arn]
  }
}

resource "aws_iam_role_policy" "account_deleter" {
  count = var.account_deleter_role == null ? 0 : 1

  name   = "cognito-delete-account"
  role   = var.account_deleter_role
  policy = data.aws_iam_policy_document.account_deleter[0].json
}
