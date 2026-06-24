import { NextResponse } from "next/server";
import { isAdminEmail, verifyAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  return NextResponse.json({
    isAdmin: isAdminEmail(user.email),
    email: user.email,
  });
}
