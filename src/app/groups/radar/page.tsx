import { GroupsTopBar } from "@/components/groups/GroupsTopBar";
import { RadarMainPanel } from "@/components/groups/RadarMainPanel";
import { RadarRightPanel } from "@/components/groups/RadarRightPanel";

export default function RadarPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#090a0c]">
      <GroupsTopBar />
      <div className="flex flex-1 gap-0">
        <RadarMainPanel />
        <RadarRightPanel />
      </div>
    </div>
  );
}
