import { db } from "@/lib/db";
import { groupMembers, groups } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Group-scoped permission helpers. Mirrors the shape of `groupPermissions.ts`
 * but for the new first-class `groups` / `group_members` tables rather
 * than `conversations` (chat groups).
 *
 * Roles:
 *   creator — the founder. Cannot be demoted or removed.
 *   admin   — promoted by creator. Can promote, demote, edit members,
 *             delete the group.
 *   member  — plain member.
 *
 * The auth gate is intentionally the same shape as `assertAdmin` so the
 * eventual UI can swap freely between chat-admin and group-admin contexts.
 */
export type GroupRole = "creator" | "admin" | "member";

/** Returns the viewer's role inside a group, or null when they're not a member. */
export async function getMemberRole(
  userId: string,
  groupId: string
): Promise<GroupRole | null> {
  const [row] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId)
      )
    )
    .limit(1);

  if (!row) return null;
  if (row.role === "creator" || row.role === "admin" || row.role === "member") {
    return row.role;
  }
  return "member";
}

/**
 * Returns null when the user is allowed in, an `{ error, status }`
 * object otherwise. Use the returned object as the NextResponse body.
 *
 * Phase 2 will call this in every /api/groups/[id]/* handler so non-
 * members get 403 instead of seeing group content.
 */
export async function assertGroupMember(
  userId: string,
  groupId: string
): Promise<{ error: string; status: 403 | 404 } | null> {
  const role = await getMemberRole(userId, groupId);
  if (role !== null) return null;
  // Return 404 instead of 403 to avoid leaking the group's existence
  // to non-members. Use 403 only when the caller is a member of some
  // group but lacks the admin role for *this* group.
  return { error: "Nhóm không tồn tại hoặc bạn không phải thành viên", status: 404 };
}

export async function assertGroupAdmin(
  userId: string,
  groupId: string
): Promise<{ error: string; status: 403 | 404 } | null> {
  const role = await getMemberRole(userId, groupId);
  if (role === null) {
    return { error: "Nhóm không tồn tại hoặc bạn không phải thành viên", status: 404 };
  }
  if (role !== "creator" && role !== "admin") {
    return { error: "Chỉ quản trị viên mới có thể thực hiện thao tác này", status: 403 };
  }
  return null;
}

export function isAdmin(role: GroupRole | null): boolean {
  return role === "creator" || role === "admin";
}

/** True iff the caller is allowed to see the group (member, or it's public). */
export async function canViewGroup(
  userId: string,
  groupId: string
): Promise<boolean> {
  const [row] = await db
    .select({ visibility: groups.visibility })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!row) return false;
  // Public groups are visible to all; private groups require membership.
  if (row.visibility === "public") return true;
  const role = await getMemberRole(userId, groupId);
  return role !== null;
}