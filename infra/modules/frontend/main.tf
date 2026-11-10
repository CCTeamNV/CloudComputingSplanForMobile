terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

variable "env" {
  type = string
}

variable "config" {
  description = "Runtime config served as /config.json (one frontend build for all environments)."
  type        = map(string)
}

variable "catalog_writer_role" {
  description = "IAM role name of the catalog publisher; may write and delete only under catalog/ (ADR 0013)."
  type        = string
  default     = null
}

variable "catalog_reader_role" {
  description = "IAM role name of the Lambda that signs catalog URLs; may read only the signing key (ADR 0013)."
  type        = string
  default     = null
}

data "aws_caller_identity" "current" {}

locals {
  prefix = "splan-${var.env}"
}

# --- Private bucket, only CloudFront may read (OAC) ---

resource "aws_s3_bucket" "site" {
  bucket        = "${local.prefix}-frontend-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

data "aws_iam_policy_document" "site" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket     = aws_s3_bucket.site.id
  policy     = data.aws_iam_policy_document.site.json
  depends_on = [aws_s3_bucket_public_access_block.site]
}

resource "aws_s3_object" "config" {
  bucket        = aws_s3_bucket.site.id
  key           = "config.json"
  content       = jsonencode(var.config)
  content_type  = "application/json"
  cache_control = "no-cache"
}

data "aws_iam_policy_document" "catalog_writer" {
  count = var.catalog_writer_role == null ? 0 : 1

  statement {
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.site.arn}/catalog/*"]
  }
}

resource "aws_iam_role_policy" "catalog_writer" {
  count = var.catalog_writer_role == null ? 0 : 1

  name   = "catalog-files"
  role   = var.catalog_writer_role
  policy = data.aws_iam_policy_document.catalog_writer[0].json
}

# --- Signed URLs for /catalog/* (ADR 0013) ---

# CloudFront requires RSA 2048. The private key is also in the Terraform state (private bucket, ADR 0004).
resource "tls_private_key" "catalog" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "aws_cloudfront_public_key" "catalog" {
  name        = "${local.prefix}-catalog"
  encoded_key = tls_private_key.catalog.public_key_pem
}

resource "aws_cloudfront_key_group" "catalog" {
  name  = "${local.prefix}-catalog"
  items = [aws_cloudfront_public_key.catalog.id]
}

# Standard tier with the AWS managed key aws/ssm: no charge.
resource "aws_ssm_parameter" "catalog_key" {
  name  = "/${local.prefix}/catalog-signing-key"
  type  = "SecureString"
  value = tls_private_key.catalog.private_key_pem
}

data "aws_iam_policy_document" "catalog_reader" {
  count = var.catalog_reader_role == null ? 0 : 1

  statement {
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.catalog_key.arn]
  }
}

resource "aws_iam_role_policy" "catalog_reader" {
  count = var.catalog_reader_role == null ? 0 : 1

  name   = "catalog-signing-key"
  role   = var.catalog_reader_role
  policy = data.aws_iam_policy_document.catalog_reader[0].json
}

# --- CloudFront ---

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.prefix}-frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "${local.prefix} frontend"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2and3"

  origin {
    origin_id                = "s3"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  # Hashed assets: cached long at the edge.
  default_cache_behavior {
    target_origin_id           = "s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }

  # Entry points must never be stale, so a deploy needs no invalidation.
  dynamic "ordered_cache_behavior" {
    for_each = ["/index.html", "/config.json"]
    content {
      path_pattern               = ordered_cache_behavior.value
      target_origin_id           = "s3"
      viewer_protocol_policy     = "redirect-to-https"
      allowed_methods            = ["GET", "HEAD"]
      cached_methods             = ["GET", "HEAD"]
      compress                   = true
      cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
      response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
    }
  }

  # Static catalog: only with a signature. Query strings are not part of the cache key (CachingOptimized),
  # so all users share one cached copy; the files' Cache-Control (60 s) sets the TTL.
  ordered_cache_behavior {
    path_pattern               = "/catalog/*"
    target_origin_id           = "s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
    trusted_key_groups         = [aws_cloudfront_key_group.catalog.id]
  }

  # SPA deep links: S3 answers 403 for unknown keys behind OAC.
  dynamic "custom_error_response" {
    for_each = [403, 404]
    content {
      error_code            = custom_error_response.value
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 0
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

output "url" {
  value = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "catalog_key_pair_id" {
  value = aws_cloudfront_public_key.catalog.id
}

output "catalog_key_param" {
  value = aws_ssm_parameter.catalog_key.name
}

output "bucket" {
  value = aws_s3_bucket.site.bucket
}
