import { GroupsTopBar } from "@/components/groups/GroupsTopBar";
import { DiaryLeftPanel } from "@/components/diary/DiaryLeftPanel";
import { DiaryCenterPanel } from "@/components/diary/DiaryCenterPanel";
import { DiaryRightPanel } from "@/components/diary/DiaryRightPanel";

export function DiaryDashboard() {
  return (
    <div className="flex min-h-screen flex-col bg-black">
      <GroupsTopBar />
      <main className="flex w-full items-start gap-4 px-6 pb-6 pt-4">
        <DiaryLeftPanel />
        <DiaryCenterPanel />
        <DiaryRightPanel />
      </main>
    </div>
  );
}