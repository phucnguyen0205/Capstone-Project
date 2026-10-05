import { GroupsTopBar } from "@/components/groups/GroupsTopBar";
import { VaultMainPanel } from "@/components/groups/VaultMainPanel";

export default function VaultPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#090a0c]">
      <GroupsTopBar />
      <VaultMainPanel />
    </div>
  );
}
