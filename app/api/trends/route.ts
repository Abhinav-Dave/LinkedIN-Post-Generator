import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    cached_at: null,
    items: [],
  });
}
