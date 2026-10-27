import { requireUser } from "@/server/auth";
import { workspace } from "@/server/workspace";
import { errorResponse, response } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return response(await workspace(await requireUser()));
  } catch (error) {
    return errorResponse(error);
  }
}
