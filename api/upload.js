import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename") || "file.bin";

  const blob = await put(filename, req.body, {
    access: "public",
    contentType:
      req.headers.get("content-type") || "application/octet-stream"
  });

  return NextResponse.json(blob);
}
