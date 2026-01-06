"use client";

import { FolderOpen, Globe, HardDrive } from "lucide-react";

interface LogSummaryMetadata {
  topic?: string;
  workspace?: string;
  reports_dir?: string;
  logs?: {
    detail?: string;
    summary?: string;
    run?: string;
  };
  environment?: {
    workspace?: string;
    user_id?: string;
    user_files_dir?: string;
    user_logs_dir?: string;
    current_working_directory?: string;
  };
}

interface TaskMetadataProps {
  metadata: LogSummaryMetadata;
}

const metadataItems: Array<{
  key: keyof LogSummaryMetadata | keyof LogSummaryMetadata["environment"];
  label: string;
  icon: React.ElementType;
  path?: string;
}> = [
  { key: "topic", label: "研究主题", icon: Globe },
  { key: "workspace", label: "工作区", icon: HardDrive },
  { key: "reports_dir", label: "报告目录", icon: FolderOpen },
];

export const TaskMetadata = function TaskMetadata({
  metadata,
}: TaskMetadataProps) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {metadataItems.map((item) => {
        const value =
          item.path && metadata.environment
            ? (metadata.environment as any)[item.key]
            : (metadata as any)[item.key];
        const Icon = item.icon;

        if (!value) return null;

        return (
          <div
            key={item.key as string}
            className="flex items-start gap-2 text-[11px]"
          >
            <Icon className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-muted-foreground block mb-0.5">
                {item.label}
              </span>
              <span className="text-foreground font-medium break-all">
                {value}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
