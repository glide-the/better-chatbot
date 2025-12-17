import { EvalTaskChatBot } from "@/components/eval-task-chat-bot";
import { getSession } from "auth/server";
import { generateUUID } from "lib/utils";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EvalTaskPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const threadId = generateUUID();

  return (
    <EvalTaskChatBot key={threadId} threadId={threadId} initialMessages={[]} />
  );
}
