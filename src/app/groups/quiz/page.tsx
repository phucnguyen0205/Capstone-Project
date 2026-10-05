import { GroupsTopBar } from "@/components/groups/GroupsTopBar";
import { QuizMainPanel } from "@/components/groups/QuizMainPanel";

export default function QuizPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#090a0c]">
      <GroupsTopBar />
      <QuizMainPanel />
    </div>
  );
}
