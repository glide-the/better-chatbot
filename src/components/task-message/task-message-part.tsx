"use client";

import { memo, useState } from "react";
import { ToolUIPart } from "ai";
import {
  VercelAITaskToolStreamingResultTag,
  VercelAITaskToolStreamingResult,
} from "app-types/task";
import { TaskInvocation } from "./task-invocation";
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
        result={part.output as VercelAITaskToolStreamingResult}
        onClick={() => setTaskActivityPanelOpen(true)}
      />
      <ActivityPanel
        isOpen={taskActivityPanelOpen}
        onClose={() => setTaskActivityPanelOpen(false)}
        result={part.output as VercelAITaskToolStreamingResult}
      />
    </div>
  );
});
TaskMessagePart.displayName = "TaskMessagePart";
