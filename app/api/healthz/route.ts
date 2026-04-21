import { apiOk } from "@/lib/api-response";

export async function GET() {
  return apiOk({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

