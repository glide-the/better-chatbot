import type { Tool, UIMessageStreamWriter } from "ai";
import { taskToVercelAITool } from "./research-agent-task";

const RAW_TASKS = [
  {
    name: "research_agent_task",
    description: "提交并跟踪一个 Research Agent 研究任务",
  },
] as const;

export function buildTaskDefaultTools(
  dataStream: UIMessageStreamWriter,
): Record<string, Tool> {
  return RAW_TASKS.reduce(
    (acc, def) => ({
      ...acc,
      [def.name]: taskToVercelAITool(def, dataStream),
    }),
    {} as Record<string, Tool>,
  );
}
