import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ status: "ok", posts_ingested: 0 });
}
