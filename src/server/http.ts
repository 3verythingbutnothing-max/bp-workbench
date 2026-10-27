import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AppError } from "./errors";
import { appUrl } from "./env";
import { z } from "zod";

export function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== appUrl().origin)
    throw new AppError("This request did not originate from the application.", 403);
  const site = request.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site))
    throw new AppError("Cross-site requests are not allowed.", 403);
}
export async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("Send a JSON request.", 415);
  if (Number(request.headers.get("content-length") || 0) > 64 * 1024)
    throw new AppError("Request exceeds 64 KB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Request body is required.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 64 * 1024) {
      await reader.cancel();
      throw new AppError("Request exceeds 64 KB.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError("Request JSON is invalid.");
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return response({ ok: false, message: error.message }, error.status);
  if (error instanceof z.ZodError)
    return response(
      { ok: false, message: error.issues[0]?.message || "Review the supplied values." },
      400,
    );
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      return response(
        { ok: false, message: "That identifier already exists. Refresh before trying again." },
        409,
      );
    if (error.code === "P2034")
      return response(
        {
          ok: false,
          message: "Another team member changed this workspace. Refresh and try again.",
        },
        409,
      );
    if (error.code === "P2003")
      return response(
        { ok: false, message: "A linked record is unavailable. Refresh the workspace." },
        409,
      );
  }
  console.error("[workbench] Request failed", error instanceof Error ? error.name : "UnknownError");
  return response(
    { ok: false, message: "The request could not be completed. Please try again." },
    500,
  );
}
