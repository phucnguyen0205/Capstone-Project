import { db } from "@/lib/db";
import { conversations, conversationParticipants } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Permissions for group-chat admin actions. The role hierarchy is:
 *   creator  — the user who made the group. Cannot be demoted/kicked.
 *   admin    — promoted by the creator. Has the same powers except for
 *               demoting the creator.
 *   member   — regular participant.
 *
 * Anyone without a row in `conversation_participants` is treated as a
 * stranger and gets the same empty role as if the conversation didn't
 * exist (the API layer should 403 them before this helper is even
 * called).
 */
export type GroupRole = "creator" | "admin" | "member";

/**
 * Look up the role of `userId` inside `conversationId`. Returns `null`
 * for non-participants and `null` for 1-1 conversations (we only ever
 * invoke group admin checks there).
 */
export async function getGroupRole(
  userId: string,
  conversationId: string
): Promise<GroupRole | null> {
  const [row] = await db
    .select({ role: conversationParticipants.role })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      )
    )
    .limit(1);

  if (!row) return null;
  if (row.role === "creator" || row.role === "admin" || row.role === "member") {
    return row.role;
  }
  // Defensive: if the DB ever contains an unexpected string we treat it
  // as a plain member so a typo never grants admin powers.
  return "member";
}

/**
 * Throws an HTTP-style error object when `userId` is not the
 * conversation's creator or admin. Returns nothing on success so
 * callers can `await assertAdmin(...)` mid-handler.
 *
 * Use the returned object directly to send the response, e.g.:
 *   const err = await assertAdmin(me.id, conversationId);
 *   if (err) return err;
 */
export async function assertAdmin(
  userId: string,
  conversationId: string
): Promise<{ error: string; status: 403 } | null> {
  const role = await getGroupRole(userId, conversationId);
  if (role === null) {
    return { error: "Bạn không phải thành viên nhóm", status: 403 };
  }
  if (role !== "creator" && role !== "admin") {
    return { error: "Chỉ quản trị viên mới có thể thực hiện thao tác này", status: 403 };
  }
  return null;
}

/** True iff the role is allowed to rename / kick / promote. */
export function isAdmin(role: GroupRole | null): boolean {
  return role === "creator" || role === "admin";
}

/** True iff the role is allowed to be demoted. Creator is permanent. */
export function isDemotable(role: GroupRole | null): boolean {
  return role === "admin";
}

/** Best-effort guarantee that the conversation is actually a group. */
export async function isGroupConversation(conversationId: string): Promise<boolean> {
  const [row] = await db
    .select({ isGroup: conversations.isGroup })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return row?.isGroup === 1;
}