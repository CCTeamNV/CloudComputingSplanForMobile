import type { APIGatewayProxyResultV2 } from "aws-lambda";

export const handler = async (): Promise<APIGatewayProxyResultV2> => ({
  statusCode: 200,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify({ status: "ok", time: new Date().toISOString() }),
});
