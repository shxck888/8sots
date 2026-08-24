import { createHealthStatus } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(createHealthStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
