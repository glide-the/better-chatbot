import { tag } from "lib/tag";

export type ResearchAgentTaskResultMeta = {
  task_id: string;
  info: string;
  finished: boolean;
  result?: Record<string, string>;
};

export type VercelAITaskToolStreamingResult = {
  toolCallId: string;
  taskName: string;
  taskId?: string;
  startedAt: number;
  endedAt: number;
  status: "pending" | "running" | "completed" | "fail";
  info?: string;
  finished?: boolean;
  result?: Record<string, string>;
  error?: { name: string; message: string };
  logRunPath?: string;
};

export const VercelAITaskToolStreamingResultTag =
  tag<VercelAITaskToolStreamingResult>("task-streaming-result");
