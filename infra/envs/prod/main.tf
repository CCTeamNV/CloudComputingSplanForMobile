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
    key          = "envs/prod/terraform.tfstate"
    region       = "eu-central-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "eu-central-1"

  default_tags {
    tags = {
      Project     = "splan"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

module "app" {
  source = "../../modules/app"

  env                    = "prod"
  allowed_email_domains  = ["hs-heilbronn.de"]
  deletion_protection    = true
  point_in_time_recovery = true
  throttle_rate_limit    = 200
  throttle_burst_limit   = 400
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
