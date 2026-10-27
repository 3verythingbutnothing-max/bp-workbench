import { z } from "zod";
import { requireUser } from "@/server/auth";
import { performAction } from "@/server/actions";
import { errorResponse, jsonBody, response, sameOrigin } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    const body = z
      .object({ action: z.string().min(1).max(80), payload: z.unknown() })
      .strict()
      .parse(await jsonBody(request));
    return response(await performAction(user, body.action, body.payload));
  } catch (error) {
    return errorResponse(error);
  }
}
