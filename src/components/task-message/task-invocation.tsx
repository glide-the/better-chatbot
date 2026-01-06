"use client";

import { memo } from "react";
import { Check, Loader2, XIcon } from "lucide-react";
import { VercelAITaskToolStreamingResult } from "app-types/task";

interface TaskInvocationProps {
  result: VercelAITaskToolStreamingResult;
  onClick: () => void;
}

export const TaskInvocation = memo(function TaskInvocation({
  result,
  onClick,
}: TaskInvocationProps) {
  const { status, taskId } = result;

  const isRunning = status === "pending" || status === "running";
  const isFail = status === "fail";

  return (
    <div
      className="w-full flex flex-col gap-2 bg-card p-4 border text-xs rounded-lg text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {isRunning ? (
          <Loader2 className="size-3 animate-spin" />
        ) : isFail ? (
          <XIcon className="size-3 text-destructive" />
        ) : (
          <Check className="size-3 text-emerald-500" />
        )}
        <span className="font-medium flex-1">
          研究任务 {taskId ? `#${taskId}` : ""} · {status}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>点击查看活动详情</span>
      </div>
    </div>
  );
});
