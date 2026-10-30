terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Local state on purpose: this stack creates the remote state bucket (ADR 0004).
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "splan"
      Stack     = "bootstrap"
      ManagedBy = "terraform"
    }
  }
}
