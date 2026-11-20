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
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
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

module "app" {
  source = "../../modules/app"

  env = "dev"
  # loadtest.example.com: k6 users, seeded without mail (M4 runs against dev).
  allowed_email_domains = ["hs-heilbronn.de", "loadtest.example.com"]
  throttle_rate_limit   = 200
  throttle_burst_limit  = 400
  local_dev             = true
}

output "api_url" {
  value = module.app.api_url
}

output "frontend_url" {
  value = module.app.frontend_url
}

output "frontend_bucket" {
  value = module.app.frontend_bucket
}

output "table_name" {
  value = module.app.table_name
}

output "user_pool_id" {
  value = module.app.user_pool_id
}

output "dashboard_url" {
  value = module.app.dashboard_url
}

# Resources moved into modules/app (#24); keeps the existing dev resources instead of recreating them.
moved {
  from = module.api
  to   = module.app.module.api
}
moved {
  from = module.auth
  to   = module.app.module.auth
}
moved {
  from = module.data
  to   = module.app.module.data
}
moved {
  from = module.frontend
  to   = module.app.module.frontend
}
moved {
  from = module.monitoring
  to   = module.app.module.monitoring
}
