import { publicUser, sessionUser } from "@/server/auth";
import { errorResponse, response } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await sessionUser();
    return response({ user: user ? publicUser(user) : null });
  } catch (error) {
    return errorResponse(error);
  }
}
