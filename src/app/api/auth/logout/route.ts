import { logout } from "@/server/auth";
import { errorResponse, response, sameOrigin } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await logout();
    return response({ ok: true, message: "Signed out." });
  } catch (error) {
    return errorResponse(error);
  }
}
