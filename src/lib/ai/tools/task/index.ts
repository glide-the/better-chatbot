import type { Tool, UIMessageStreamWriter } from "ai";
import { taskToVercelAITool } from "./research-agent-task";

const RAW_TASKS = [
  {
    name: "research_agent_task",
    description: `动态填充的《基础配置模板》，以此作为调用工具的依据: {
    "角色定义": "在此处根据客户问题动态设定角色",
    "任务": "基于模糊产品名称，调研市场主流品牌及规格分布",
    "通用规则": "按市场占有率排序，区分进口与国产",
    "调研关键词": "[产品名称] + 常用规格 + 头部品牌(Corning/Nest/Falcon等) + 材质特性"
  }`,
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
