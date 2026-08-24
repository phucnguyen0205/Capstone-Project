import { GroupsTopBar } from "@/components/groups/GroupsTopBar";
import { GroupsLeftSidebar } from "@/components/groups/GroupsLeftSidebar";
import { GroupsFeed } from "@/components/groups/GroupsFeed";
import { GroupsRightSidebar } from "@/components/groups/GroupsRightSidebar";

export function GroupsDashboard() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0c0c14]">
      <GroupsTopBar />
      <main className="flex w-full items-stretch">
        <GroupsLeftSidebar />
        <GroupsFeed />
        <GroupsRightSidebar />
      </main>
    </div>
  );
}