import AIChat from "@/components/ux/aichat";
import UserChat from "@/components/ux/userchat";

export default function Home() {
  // You'd likely get the actual username from an auth provider
  // and the roomName could come from various sources (e.g., URL, user selection)
  const currentUsername = "";
  const chatRoom = "great-debate-room";

  return (
    <main className="p-5 flex space-x-5">
      <div className="w-1/2">
        <AIChat />
      </div>
      <div className="w-1/2">
        <UserChat roomName={chatRoom} username={currentUsername} />
      </div>
    </main>
  );
}
