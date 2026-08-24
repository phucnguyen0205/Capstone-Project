import { Navbar } from "@/components/Navbar";
import { LeftColumn } from "@/components/LeftColumn";
import { FeedColumn } from "@/components/FeedColumn";
import { ChatColumn } from "@/components/ChatColumn";

export function Dashboard() {
  return (
    <div className="flex min-h-screen flex-col bg-[#090a0c]">
      <Navbar />
      <main className="flex w-full gap-5 p-5">
        <LeftColumn />
        <FeedColumn />
        <ChatColumn />
      </main>
    </div>
  );
}
