import AIChat from "@/components/ux/aichat";
import Status from "@/components/ux/status";
import UserChat from "@/components/ux/userchat";

export default function Home() {
  const currentUsername = "";

  return (
    <main className="p-5 flex space-x-5">
      <div className="w-1/2">
        <AIChat/>
      </div>
      <div className="w-1/2 flex flex-col gap-4">
        <Status />
        <UserChat roomName="great-debate-room" username={currentUsername} />
      </div>
    </main>
  );
}
