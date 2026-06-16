import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, setActiveWorkspaceCookie } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ workspaceId: z.string() });

export const POST = async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const body = schema.parse(await req.json());
  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: session.userId, workspaceId: body.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  setActiveWorkspaceCookie(body.workspaceId);
  return NextResponse.json({ ok: true });
};
