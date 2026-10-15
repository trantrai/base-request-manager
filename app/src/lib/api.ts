import { NextResponse } from "next/server";

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, data, error: null, meta: meta ?? null });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ ok: false, data: null, error: message, meta: null }, { status });
}

export const dynamic = "force-dynamic";
