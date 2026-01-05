"use client";

import { memo, useState } from "react";
import { ToolUIPart, getToolName, UIMessage } from "ai";
import type { UseChatHelpers } from "@ai-sdk/react";
import { VercelAITaskToolStreamingResultTag } from "app-types/task";
import { TaskInvocation } from "./tool-invocation/task-invocation";
import { ActivityPanel } from "./activity-panel";

export const TaskMessagePart = memo(function TaskMessagePart({
  part,
}: {
  part: ToolUIPart;
}) {
  if (!part.output) {
    return null;
  }

  const result = VercelAITaskToolStreamingResultTag.isMaybe(part.output);

  if (!result) {
    return null;
  }

  const [taskActivityPanelOpen, setTaskActivityPanelOpen] = useState(false);

  return (
    <div className="group w-full">
      <TaskInvocation
        result={result}
        onClick={() => setTaskActivityPanelOpen(true)}
      />
      <ActivityPanel
        isOpen={taskActivityPanelOpen}
        onClose={() => setTaskActivityPanelOpen(false)}
        result={result}
      />
    </div>
  );
});
TaskMessagePart.displayName = "TaskMessagePart";
