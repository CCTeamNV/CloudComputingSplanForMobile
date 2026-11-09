# Single table, on-demand (ADR 0003).
resource "aws_dynamodb_table" "this" {
  name         = "splan-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  # Feeds the catalog publisher (ADR 0013); Lambda reads from the stream at no charge.
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

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

# --- Stream consumer: the catalog publisher (ADR 0013) ---

data "aws_iam_policy_document" "stream" {
  count = var.stream_consumer == null ? 0 : 1

  statement {
    actions   = ["dynamodb:DescribeStream", "dynamodb:GetRecords", "dynamodb:GetShardIterator", "dynamodb:ListStreams"]
    resources = ["${aws_dynamodb_table.this.arn}/stream/*"]
  }
}

resource "aws_iam_role_policy" "stream" {
  count = var.stream_consumer == null ? 0 : 1

  name   = "dynamodb-stream"
  role   = var.stream_consumer.role
  policy = data.aws_iam_policy_document.stream[0].json
}

resource "aws_lambda_event_source_mapping" "stream" {
  count = var.stream_consumer == null ? 0 : 1

  event_source_arn  = aws_dynamodb_table.this.stream_arn
  function_name     = var.stream_consumer.function_name
  starting_position = "LATEST" # existing data: run the rebuild once (backend/README.md)

  # A few seconds of batching keeps imports from rewriting the same file per item; well within the ~2 min target.
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5

  # Retries are safe (the function rewrites from current state); a lost batch is repaired by the rebuild.
  maximum_retry_attempts         = 3
  bisect_batch_on_function_error = true

  filter_criteria {
    filter {
      pattern = var.stream_consumer.filter_pattern
    }
  }

  depends_on = [aws_iam_role_policy.stream]
}
