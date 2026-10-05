import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversationParticipants } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import {
  assertAdmin,
  getGroupRole,
  isDemotable,
  type GroupRole,
} from "@/lib/groupPermissions";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

const VALID_ROLES: GroupRole[] = ["creator", "admin", "member"];

function isValidRole(value: unknown): value is GroupRole {
  return typeof value === "string" && (VALID_ROLES as string[]).includes(value);
}

function cleanNickname(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Cap at 30 chars to match the chat header limit and prevent abuse.
  return trimmed.slice(0, 30);
}

/**
 * PATCH /api/conversations/[id]/members/[userId]
 *
 * Body: { role?: "admin" | "member", nickname?: string | null }
 *
 * Admin/creator-only mutation of another participant. Behaviour:
 *
 *   - role change: an admin can promote a member to admin OR demote
 *     another admin to member. The creator cannot be demoted (use a
 *     dedicated ownership-transfer endpoint if we ever add one).
 *
 *   - nickname change: an admin/creator can set the displayed nickname
 *     of any member. Pass `null` to clear it. The chat UI renders this
 *     in the message bubble header instead of users.name.
 *
 * Members can pass an empty body / nickname-only update of themselves
 * by going through their own userId when they're allowed to do so —
 * currently we keep admin-only writes on nickname too so admins own
 * the group's display conventions.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const { id: conversationId, userId: targetUserId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    role?: unknown;
    nickname?: unknown;
  };

  // Reject empty bodies early so admin doesn't accidentally hit the row.
  if (body.role === undefined && body.nickname === undefined) {
    return NextResponse.json(
      { error: "Không có trường nào để cập nhật" },
      { status: 400, headers: corsHeaders }
    );
  }

  // Admin gate. Same gate applies for both role and nickname writes.
  const err = await assertAdmin(me.id, conversationId);
  if (err) return NextResponse.json(err, { status: err.status, headers: corsHeaders });

  // Look up the target so we know their current role.
  const targetRole = await getGroupRole(targetUserId, conversationId);
  if (targetRole === null) {
    return NextResponse.json(
      { error: "Người dùng không phải thành viên nhóm" },
      { status: 404, headers: corsHeaders }
    );
  }

  const patch: Partial<{ role: GroupRole; nickname: string | null }> = {};

  // ─── role change ────────────────────────────────────────────────────
  if (body.role !== undefined) {
    if (!isValidRole(body.role)) {
      return NextResponse.json(
        { error: "Role không hợp lệ" },
        { status: 400, headers: corsHeaders }
      );
    }
    // The creator is immutable: you can't demote the creator or
    // change them into a regular member/admin. Promoting/demoting
    // someone *into* the creator role is also disallowed — ownership
    // transfer needs a separate, explicit endpoint.
    if (targetRole === "creator" || body.role === "creator") {
      return NextResponse.json(
        { error: "Không thể thay đổi quyền của người tạo nhóm" },
        { status: 403, headers: corsHeaders }
      );
    }
    // Demoting an admin should still work, but going from admin ->
    // member is a demote — allowed for any admin (including the
    // creator). Members can be promoted to admin.
    if (body.role === "admin" && targetRole === "admin") {
      // No-op admin->admin; just skip the field.
    } else if (body.role === "member" && targetRole === "member") {
      // No-op member->member; skip.
    } else if (body.role === "admin" && targetRole === "member") {
      patch.role = "admin";
    } else if (body.role === "member" && targetRole === "admin") {
      // Admins can't demote themselves while they're still an admin —
      // prevents an admin from accidentally removing their own powers.
      if (targetUserId === me.id) {
        return NextResponse.json(
          { error: "Không thể tự hạ cấp chính mình" },
          { status: 400, headers: corsHeaders }
        );
      }
      patch.role = "member";
    } else {
      // Anything else (e.g. member->member, admin->admin) is a no-op.
      return NextResponse.json(
        { error: "Không có thay đổi" },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  // ─── nickname change ────────────────────────────────────────────────
  let nicknameUpdate: string | null | undefined;
  if (body.nickname !== undefined) {
    nicknameUpdate = cleanNickname(body.nickname);
    // cleanNickname("") returns null; that's "clear the nickname".
    if (body.nickname === null) nicknameUpdate = null;
    patch.nickname = nicknameUpdate as string | null;
  }

  // If after validation nothing changed, return early so the client
  // doesn't see a spurious 200.
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, role: targetRole }, { headers: corsHeaders });
  }

  await db
    .update(conversationParticipants)
    .set(patch)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, targetUserId)
      )
    );

  return NextResponse.json({ ok: true, ...patch }, { headers: corsHeaders });
}

/**
 * DELETE /api/conversations/[id]/members/[userId]
 *
 * Admin/creator kicks a member out of the group. Reject when:
 *   - target is the creator (creators can't be kicked)
 *   - admin tries to kick themselves (should use the leave endpoint)
 *
 * Returns 200 with `{ ok: true }` on success.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const { id: conversationId, userId: targetUserId } = await params;

  const err = await assertAdmin(me.id, conversationId);
  if (err) return NextResponse.json(err, { status: err.status, headers: corsHeaders });

  const targetRole = await getGroupRole(targetUserId, conversationId);
  if (targetRole === null) {
    return NextResponse.json(
      { error: "Người dùng không phải thành viên nhóm" },
      { status: 404, headers: corsHeaders }
    );
  }
  if (targetRole === "creator") {
    return NextResponse.json(
      { error: "Không thể xóa người tạo nhóm" },
      { status: 403, headers: corsHeaders }
    );
  }
  if (targetUserId === me.id) {
    return NextResponse.json(
      { error: "Dùng chức năng rời nhóm để tự thoát" },
      { status: 400, headers: corsHeaders }
    );
  }

  await db
    .delete(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, targetUserId)
      )
    );

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}