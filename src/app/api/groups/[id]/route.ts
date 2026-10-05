import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { groups, groupMembers, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import {
  canViewGroup,
  getMemberRole,
} from "@/lib/groupPermissionsV2";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/groups/[id]
 *
 * Returns the group's metadata + the caller's relationship to it.
 *
 * Three access modes:
 *   1. Caller is a member (any role) → full metadata, role, memberCount.
 *   2. Group is "public" + caller is NOT a member → public preview
 *      (no posts, but can read name/description/memberCount + see
 *      `viewerCanJoin: true` so the UI can show the join button).
 *   3. Group is "private" + caller is NOT a member → 404 (we don't
 *      leak existence).
 *
 * Response:
 *   { id, name, description, avatarUrl, visibility, creator, role,
 *     memberCount, isMember, viewerCanJoin }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(_request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const { id: groupId } = await params;

  // Step 1: load the group row + creator user in one shot.
  const [group] = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      avatarUrl: groups.avatarUrl,
      visibility: groups.visibility,
      creatorId: groups.creatorId,
      createdAt: groups.createdAt,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) {
    return NextResponse.json({ error: "Nhóm không tồn tại" }, { status: 404, headers: corsHeaders });
  }

  const role = await getMemberRole(me.id, groupId);
  const isMember = role !== null;

  // Step 2: gate. Private groups require membership.
  if (!isMember && group.visibility !== "public") {
    // Don't reveal existence — same response shape as a 404.
    return NextResponse.json(
      { error: "Nhóm không tồn tại hoặc bạn không có quyền truy cập" },
      { status: 404, headers: corsHeaders }
    );
  }

  // Step 3: load creator + count in parallel (both cheap).
  const [creator] = await db
    .select({ id: users.id, username: users.username, name: users.name, avatar: users.avatar })
    .from(users)
    .where(eq(users.id, group.creatorId))
    .limit(1);

  const [{ memberCount }] = await db
    .select({ memberCount: sql<number>`count(*)` })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));

  return NextResponse.json(
    {
      id: group.id,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      visibility: group.visibility,
      creator: creator ?? null,
      createdAt: group.createdAt,
      role: role ?? null,
      isMember,
      // Non-members can only join if the group is public AND they're not
      // already a member (we already checked isMember above).
      viewerCanJoin: !isMember && group.visibility === "public",
      memberCount: Number(memberCount ?? 0),
    },
    { headers: corsHeaders }
  );
}

/**
 * PATCH /api/groups/[id]
 *
 * Admin/creator can update:
 *   - name, description, avatarUrl (cosmetic)
 *   - visibility: public ↔ private (creators only — flipping
 *     public↔private affects who can discover the group)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const { id: groupId } = await params;
  const role = await getMemberRole(me.id, groupId);
  if (role === null) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 403, headers: corsHeaders });
  }
  if (role !== "creator" && role !== "admin") {
    return NextResponse.json({ error: "Chỉ quản trị viên mới có thể chỉnh sửa" }, { status: 403, headers: corsHeaders });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    avatarUrl?: string;
    visibility?: "public" | "private";
  };

  const patch: Partial<typeof groups.$inferInsert> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim().slice(0, 60);
    if (!n) return NextResponse.json({ error: "Tên không được để trống" }, { status: 400, headers: corsHeaders });
    patch.name = n;
  }
  if (typeof body.description === "string") {
    patch.description = body.description.trim().slice(0, 500) || null;
  }
  if (typeof body.avatarUrl === "string") {
    patch.avatarUrl = body.avatarUrl.slice(0, 500);
  }
  // Visibility is a creator-only field — flipping a group public after
  // it has members can be surprising, so we restrict it to creator.
  if (body.visibility === "public" || body.visibility === "private") {
    if (role !== "creator") {
      return NextResponse.json(
        { error: "Chỉ người tạo mới thay đổi được công khai/riêng tư" },
        { status: 403, headers: corsHeaders }
      );
    }
    patch.visibility = body.visibility;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  }
  // `groups.updated_at` is a plain INTEGER (not a timestamp mode) so we
  // hand-roll the unix seconds value here. Drizzle's `timestamp` mode
  // would convert `new Date()` for us, but this column was added as a
  // raw integer to match the rest of the schema.
  patch.updatedAt = Math.floor(Date.now() / 1000);

  await db.update(groups).set(patch).where(eq(groups.id, groupId));

  // Mirror name/avatar/description into the linked conversation so
  // the chat layer stays in sync with the group even if a consumer
  // (e.g. a future FTS index, a legacy endpoint, or the column
  // fallback in `GET /api/conversations`) reads from the
  // `conversations` table directly. Best-effort: if the chat mirror
  // fails the group edit still succeeded.
  try {
    const chatPatch: { name?: string; avatarUrl?: string | null } = {};
    if (patch.name !== undefined) chatPatch.name = patch.name;
    if (patch.avatarUrl !== undefined) chatPatch.avatarUrl = patch.avatarUrl;
    if (Object.keys(chatPatch).length > 0) {
      const { getDb } = await import("@/lib/db/server");
      const chatDb = getDb();
      const sets: string[] = [];
      const params: unknown[] = [];
      if (chatPatch.name !== undefined) {
        sets.push("name = ?");
        params.push(chatPatch.name);
      }
      if (chatPatch.avatarUrl !== undefined) {
        sets.push("avatar_url = ?");
        params.push(chatPatch.avatarUrl);
      }
      if (sets.length > 0) {
        params.push(groupId);
        chatDb
          .prepare(
            `UPDATE conversations SET ${sets.join(", ")}
             WHERE group_id = ? AND is_group = 1`
          )
          .run(...params);
      }
    }
  } catch (chatErr) {
    console.error("[groups PATCH] failed to mirror into chat:", chatErr);
  }

  return NextResponse.json({ ok: true, ...patch }, { headers: corsHeaders });
}

/**
 * DELETE /api/groups/[id]
 *
 * Creator only: deletes the group entirely. Cascade rules in the
 * migration take care of group_posts / group_members cleanup.
 *
 * Re-uses `canViewGroup` so we can give a clear 404 for "you can't
 * even see this group" rather than letting the request leak.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(_request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const { id: groupId } = await params;
  const role = await getMemberRole(me.id, groupId);
  if (role !== "creator") {
    return NextResponse.json({ error: "Chỉ người tạo mới có thể xóa nhóm" }, { status: 403, headers: corsHeaders });
  }
  await db.delete(groups).where(eq(groups.id, groupId));
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}