import { galleryItems, recentActivities, recentMembers } from "@/lib/groups-data";
import { Icon } from "@/components/ui/Icon";
import type { AssetKey } from "@/lib/assets";

export function GroupsRightSidebar() {
  return (
    <aside className="flex h-full w-[310px] shrink-0 flex-col gap-4 border-l border-[#232338] p-4">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="layoutGrid" size={16} />
          <h2 className="text-[13px] font-bold uppercase text-[#f1f1f7]">
            Thư viện nhóm
          </h2>
        </div>

        <div className="flex flex-col gap-1.5">
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-1.5">
              {galleryItems
                .slice(row * 3, row * 3 + 3)
                .map((item) => (
                  <GalleryTile key={item.date} item={item} />
                ))}
            </div>
          ))}
        </div>

        <button
          type="button"
          className="self-start text-[12px] font-semibold text-teal-400"
        >
          Xem tất cả 47 ảnh/video →
        </button>
      </section>

      <hr className="border-[#232338]" />

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="clock" size={16} />
          <h2 className="text-[13px] font-bold uppercase text-[#f1f1f7]">
            Thành viên mới thêm
          </h2>
        </div>

        <div className="flex flex-col gap-2.5">
          {recentMembers.map((member) => (
            <div key={member.name} className="flex items-center gap-2.5">
              <div className="size-8 shrink-0 overflow-hidden rounded-2xl border border-[#232338] bg-[#c6c6c6]" />
              <p className="flex-1 text-xs text-[#f1f1f7]">
                <span className="font-bold">{member.name}</span>
                <span> được thêm bởi </span>
                <span className="font-semibold text-teal-400">
                  {member.addedBy}
                </span>
              </p>
              <span className="text-[11px] text-[#67678d]">{member.time}</span>
            </div>
          ))}
        </div>

        <div className="w-full rounded-lg border border-violet-500/15 bg-[#1e1929] p-2.5 text-[11px] leading-[1.4] text-[#a5a5c7]">
          💡 Thành viên mới chỉ xem được bài từ ngày được thêm vào nhóm.
        </div>
      </section>

      <hr className="border-[#232338]" />

      <section className="flex flex-col gap-3">
        <h3 className="text-[13px] font-bold uppercase text-[#a5a5c7]">
          Hoạt động gần đây
        </h3>

        <div className="flex flex-col gap-2.5 text-xs">
          {recentActivities.map((activity, index) => (
            <div
              key={activity.text}
              className={`flex flex-col gap-0.5 pb-2 ${
                index < recentActivities.length - 1
                  ? "border-b border-[#232338]"
                  : ""
              }`}
            >
              <p className="text-[12px] leading-[1.4] text-[#f1f1f7]">
                {activity.text}
              </p>
              <p className="text-[11px] text-[#67678d]">{activity.time}</p>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function GalleryTile({
  item,
}: {
  item: { image: AssetKey; date: string; type: "video" | "photo" | "locked" };
}) {
  return (
    <div className="relative size-[86px] shrink-0 overflow-hidden rounded-lg">
      <img
        src={`/assets/${item.image}`}
        alt={item.date}
        className="size-full object-cover"
      />

      {item.type === "video" && (
        <div className="absolute left-1/2 top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-black/40">
          <Icon name="playCircle" size={14} />
        </div>
      )}

      {item.type === "locked" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-[3px]">
          <Icon name="lockSmall" size={14} />
        </div>
      )}

      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
        {item.date}
      </span>
    </div>
  );
}