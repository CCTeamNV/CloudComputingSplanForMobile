# Single table, on-demand (ADR 0003).
resource "aws_dynamodb_table" "this" {
  name         = "splan-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI2PK"
    type = "S"
  }

  # Courses of a program semester: PROGRAM#<p>#SEM#<n>
  global_secondary_index {
    name            = "GSI1"
    projection_type = "ALL"
    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }
  }

  # Courses of a lecturer: LECTURER#<sub>
  global_secondary_index {
    name            = "GSI2"
    projection_type = "ALL"
    key_schema {
      attribute_name = "GSI2PK"
      key_type       = "HASH"
    }
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }
}

locals {
  index_arns = [for gsi in aws_dynamodb_table.this.global_secondary_index : "${aws_dynamodb_table.this.arn}/index/${gsi.name}"]
}

# One inline policy per Lambda role, only on this table and its indexes (ADR 0008).
data "aws_iam_policy_document" "access" {
  for_each = var.access

  statement {
    actions   = each.value.actions
    resources = concat([aws_dynamodb_table.this.arn], local.index_arns)
  }
}

resource "aws_iam_role_policy" "access" {
  for_each = var.access

  name   = "dynamodb"
  role   = each.value.role
  policy = data.aws_iam_policy_document.access[each.key].json
}
