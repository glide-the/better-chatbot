import type { Tool, UIMessageStreamWriter } from "ai";
import { taskToVercelAITool } from "./research-agent-task";

const RAW_TASKS = [
  {
    name: "research_agent_task",
    // 这里的 description 主要给路由/规划 Agent 看，让它知道何时调用此工具
    description:
      "当用户需要对某一类产品进行深入的市场调研、规格分析或品牌对比时调用此工具。该工具需要接收结构化的调研配置参数。",
  },
] as const;

export function buildTaskDefaultTools(
  dataStream: UIMessageStreamWriter,
  userId: string,
): Record<string, Tool> {
  return RAW_TASKS.reduce(
    (acc, def) => ({
      ...acc,
      [def.name]: taskToVercelAITool(def, dataStream, userId),
    }),
    {} as Record<string, Tool>,
  );
}
