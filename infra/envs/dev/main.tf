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
  }

  throttle_rate_limit  = 200
  throttle_burst_limit = 400
}

output "api_url" {
  value = module.api.api_url
}
