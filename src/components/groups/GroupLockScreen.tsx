"use client";

import { Icon } from "@/components/ui/Icon";

/**
 * Shown in the center column when the user opens a private group
 * they aren't a member of. We deliberately do NOT show the group's
 * name/avatar/members — only the fact that access is denied. The server
 * already returns 404 for private + non-member so this state should
 * be rare (only triggers if the URL is stale or copied).
 */
export function GroupLockScreen() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#0c0c14] p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-[#232338] bg-[#11121a] p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
          <Icon name="lock" size={24} className="text-amber-300" />
        </div>
        <h2 className="text-[15px] font-bold text-white">Nhóm riêng tư</h2>
        <p className="text-[12px] leading-relaxed text-[#a0a5b5]">
          Bạn không phải thành viên của nhóm này. Hãy chọn nhóm khác trong
          danh sách bên trái, hoặc liên hệ người tạo để được mời.
        </p>
      </div>
    </div>
  );
}