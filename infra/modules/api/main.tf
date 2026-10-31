locals {
  prefix = "splan-${var.env}"

  # One entry per "METHOD /path" -> function name.
  routes = merge([
    for name, fn in var.functions : { for route in fn.routes : route => name }
  ]...)
}

# --- Lambda functions (one role each, ADR 0008) ---

data "archive_file" "fn" {
  for_each = var.functions

  type        = "zip"
  source_dir  = "${var.dist_dir}/${each.key}"
  output_path = "${path.root}/.build/${each.key}.zip"
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "fn" {
  for_each = var.functions

  name               = "${local.prefix}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_cloudwatch_log_group" "fn" {
  for_each = var.functions

  name              = "/aws/lambda/${local.prefix}-${each.key}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "fn_base" {
  for_each = var.functions

  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.fn[each.key].arn}:*"]
  }
  statement {
    # X-Ray does not support resource-level permissions.
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "fn_base" {
  for_each = var.functions

  name   = "logs-and-tracing"
  role   = aws_iam_role.fn[each.key].id
  policy = data.aws_iam_policy_document.fn_base[each.key].json
}

resource "aws_lambda_function" "fn" {
  for_each = var.functions

  function_name    = "${local.prefix}-${each.key}"
  role             = aws_iam_role.fn[each.key].arn
  filename         = data.archive_file.fn[each.key].output_path
  source_code_hash = data.archive_file.fn[each.key].output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  memory_size      = each.value.memory_size
  timeout          = each.value.timeout

  environment {
    variables = merge({ NODE_OPTIONS = "--enable-source-maps" }, each.value.environment)
  }

  tracing_config {
    mode = "Active"
  }

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.fn[each.key].name
  }

  depends_on = [aws_iam_role_policy.fn_base]
}

# --- HTTP API ---

resource "aws_apigatewayv2_api" "this" {
  name          = local.prefix
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_allow_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${local.prefix}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.throttle_rate_limit
    throttling_burst_limit = var.throttle_burst_limit
  }

  # routeKey instead of the raw path, so iCal tokens never land in logs (ADR 0007).
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      routeKey           = "$context.routeKey"
      status             = "$context.status"
      integrationLatency = "$context.integrationLatency"
      responseLatency    = "$context.responseLatency"
      integrationError   = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_apigatewayv2_integration" "fn" {
  for_each = var.functions

  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.fn[each.key].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "this" {
  for_each = local.routes

  api_id    = aws_apigatewayv2_api.this.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.fn[each.value].id}"
}

resource "aws_lambda_permission" "api" {
  for_each = var.functions

  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
