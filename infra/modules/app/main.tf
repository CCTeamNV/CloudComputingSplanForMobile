# Everything an environment consists of; dev and prod differ only in the variables (ADR 0004).
locals {
  metrics_namespace = "splan-${var.env}"
}

module "api" {
  source = "../../modules/api"

  env      = var.env
  dist_dir = "${path.root}/../../../backend/dist"

  functions = {
    health = { routes = ["GET /health"] }
    # Cognito trigger, no routes and no permissions besides logs/X-Ray. loadtest.example.com: k6 users (seeded without mail).
    pre-signup = { environment = { ALLOWED_DOMAINS = join(",", var.allowed_email_domains) } }
    # Stream trigger, writes /catalog/*.json (ADR 0013); the rebuild of all files needs more than 10 s.
    catalog  = { timeout = 120, environment = { CATALOG_BUCKET = module.frontend.bucket } }
    lecturer = { routes = ["GET /lecturer/courses", "PATCH /lecturer/courses/{courseId}/sessions/{sessionId}"] }
    # Public route (secret token in the URL, ADR 0007); read-only.
    ical = { routes = ["GET /ical/{token}"] }
    admin = {
      routes = [
        "POST /admin/courses",
        "PUT /admin/courses/{courseId}",
        "DELETE /admin/courses/{courseId}",
        "POST /admin/courses/{courseId}/sessions",
        "PUT /admin/courses/{courseId}/sessions/{sessionId}",
        "DELETE /admin/courses/{courseId}/sessions/{sessionId}",
        "GET /admin/users",
        "PUT /admin/users/{userId}/roles",
      ]
    }
    student = {
      routes = [
        "GET /me/subscriptions",
        "PUT /me/subscriptions/{courseId}",
        "DELETE /me/subscriptions/{courseId}",
        "POST /me/ical-token",
        "DELETE /me/ical-token",
        "DELETE /me",
      ]
      environment = {
        CATALOG_URL         = module.frontend.url
        CATALOG_KEY_PAIR_ID = module.frontend.catalog_key_pair_id
        CATALOG_KEY_PARAM   = module.frontend.catalog_key_param
      }
    }
  }

  jwt_authorizer = { issuer = module.auth.issuer, audience = [module.auth.client_id] }
  public_routes  = ["GET /health", "GET /ical/{token}"]

  environment = { TABLE_NAME = module.data.table_name, POWERTOOLS_METRICS_NAMESPACE = local.metrics_namespace }

  throttle_rate_limit  = var.throttle_rate_limit
  throttle_burst_limit = var.throttle_burst_limit
  cors_allow_origins   = concat([module.frontend.url], var.local_dev ? ["http://localhost:5173"] : [])
}

module "auth" {
  source = "../../modules/auth"

  env                   = var.env
  deletion_protection   = var.deletion_protection
  pre_signup_lambda_arn = module.api.function_arns["pre-signup"]
  callback_urls         = concat(["${module.frontend.url}/"], var.local_dev ? ["http://localhost:5173/"] : [])
  role_admin_role       = module.api.role_names.admin
  account_deleter_role  = module.api.role_names.student
}

module "data" {
  source = "../../modules/data"

  env                    = var.env
  point_in_time_recovery = var.point_in_time_recovery

  # DynamoDB actions per Lambda (ADR 0008)
  access = {
    catalog = { role = module.api.role_names.catalog, actions = ["dynamodb:Query", "dynamodb:GetItem"] }
    # TransactWriteItems needs PutItem/DeleteItem, it is no action of its own.
    admin    = { role = module.api.role_names.admin, actions = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"] }
    ical     = { role = module.api.role_names.ical, actions = ["dynamodb:GetItem", "dynamodb:Query"] }
    lecturer = { role = module.api.role_names.lecturer, actions = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem"] }
    student  = { role = module.api.role_names.student, actions = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"] }
  }

  # Only catalog data reaches the publisher, never USER# or ICAL# items.
  stream_consumer = {
    function_name = module.api.function_names.catalog
    role          = module.api.role_names.catalog
    filter_pattern = jsonencode({
      dynamodb = { Keys = { PK = { S = ["PROGRAMS", { prefix = "COURSE#" }] } } }
    })
  }
}

module "frontend" {
  source = "../../modules/frontend"

  env                 = var.env
  catalog_writer_role = module.api.role_names.catalog
  catalog_reader_role = module.api.role_names.student
  config = {
    apiUrl           = module.api.api_url
    region           = "eu-central-1"
    userPoolId       = module.auth.user_pool_id
    userPoolClientId = module.auth.client_id
    authDomain       = module.auth.domain_url
  }
}

module "monitoring" {
  source = "../../modules/monitoring"

  env               = var.env
  api_id            = module.api.api_id
  function_names    = module.api.function_names
  table_name        = module.data.table_name
  metrics_namespace = local.metrics_namespace
}

output "dashboard_url" {
  value = module.monitoring.dashboard_url
}

output "api_url" {
  value = module.api.api_url
}

output "frontend_url" {
  value = module.frontend.url
}

output "frontend_bucket" {
  value = module.frontend.bucket
}

# Read by scripts/seed.ts
output "table_name" {
  value = module.data.table_name
}

output "user_pool_id" {
  value = module.auth.user_pool_id
}
