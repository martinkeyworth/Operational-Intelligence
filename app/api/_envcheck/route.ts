import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const keys = Object.keys(process.env).filter((k) =>
    /DATABASE|POSTGRES|PG|NEON|DB_/i.test(k),
  )
  return NextResponse.json({ keys })
}
