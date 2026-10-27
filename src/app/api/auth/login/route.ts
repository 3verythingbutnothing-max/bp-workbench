import { z } from "zod";
import { login } from "@/server/auth";
import { errorResponse, jsonBody, response, sameOrigin } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((value) => value.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .strict()
      .parse(await jsonBody(request));
    const user = await login(input.email, input.password);
    return response({ ok: true, user, message: "Signed in." });
  } catch (error) {
    return errorResponse(error);
  }
}
