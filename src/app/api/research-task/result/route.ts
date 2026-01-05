import "server-only";
import { getSession } from "auth/server";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("task_id");

  if (!taskId) {
    return new Response("Missing task_id", { status: 400 });
  }

  const baseUrl = process.env.RESEARCH_AGENT_BASE_URL;
  if (!baseUrl) {
    return new Response("Missing RESEARCH_AGENT_BASE_URL", { status: 500 });
  }

  try {
    const url = `${baseUrl}/runner/result?task_id=${encodeURIComponent(taskId)}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    console.error("Error fetching task result:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
