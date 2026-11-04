terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Bucket is account-specific (splan-tfstate-<account-id>), passed at init: see README.
  backend "s3" {
    key          = "envs/dev/terraform.tfstate"
    region       = "eu-central-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "eu-central-1"

  default_tags {
    tags = {
      Project     = "splan"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

module "api" {
  source = "../../modules/api"

  env      = "dev"
  dist_dir = "${path.root}/../../../backend/dist"

  functions = {
    health = { routes = ["GET /health"] }
    # Cognito trigger, no routes and no permissions besides logs/X-Ray. loadtest.example.com: k6 users (seeded without mail).
    pre-signup = { environment = { ALLOWED_DOMAINS = "hs-heilbronn.de,loadtest.example.com" } }
  }

  jwt_authorizer = { issuer = module.auth.issuer, audience = [module.auth.client_id] }
  public_routes  = ["GET /health", "GET /ical/{token}"]

  environment = { TABLE_NAME = module.data.table_name }

  throttle_rate_limit  = 200
  throttle_burst_limit = 400
  cors_allow_origins   = [module.frontend.url, "http://localhost:5173"]
}

module "auth" {
  source = "../../modules/auth"

  env                   = "dev"
  pre_signup_lambda_arn = module.api.function_arns["pre-signup"]
  callback_urls         = ["${module.frontend.url}/", "http://localhost:5173/"]
}

module "data" {
  source = "../../modules/data"

  env = "dev"

  # DynamoDB actions per Lambda, e.g. catalog = { role = module.api.role_names.catalog, actions = ["dynamodb:Query", "dynamodb:GetItem"] }
  access = {}
}

module "frontend" {
  source = "../../modules/frontend"

  env = "dev"
  config = {
    apiUrl           = module.api.api_url
    region           = "eu-central-1"
    userPoolId       = module.auth.user_pool_id
    userPoolClientId = module.auth.client_id
    authDomain       = module.auth.domain_url
  }
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
