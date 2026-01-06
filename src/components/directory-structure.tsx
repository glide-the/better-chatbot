"use client";

import {
  Folder,
  HardDrive,
  FileText,
  Save,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "lib/utils";
import { useState } from "react";

interface DirectoryStructureItem {
  path: string;
  purpose: string;
  type: "input" | "output" | "storage";
}

interface DirectoryStructureProps {
  structure: Record<string, DirectoryStructureItem>;
}

const typeIcons: Record<string, React.ElementType> = {
  input: Folder,
  output: FileText,
  storage: Save,
};

const typeColors: Record<string, string> = {
  input: "text-blue-500",
  output: "text-emerald-500",
  storage: "text-amber-500",
};

const typeLabels: Record<string, string> = {
  input: "输入",
  output: "输出",
  storage: "存储",
};

export const DirectoryStructure = function DirectoryStructure({
  structure,
}: DirectoryStructureProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (!structure || Object.keys(structure).length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-muted-foreground text-sm">暂无目录结构</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(structure).map(([key, item]) => {
        const Icon = typeIcons[item.type] || HardDrive;
        const isExpanded = expandedKeys.has(key);

        return (
          <div key={key} className="rounded-lg border border-border bg-card">
            <button
              onClick={() => toggleExpand(key)}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Icon
                  className={cn("size-4 shrink-0", typeColors[item.type])}
                />
                <span className="text-sm font-medium text-foreground truncate">
                  {key}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                  {typeLabels[item.type]}
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown className="size-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              )}
            </button>
            {isExpanded && (
              <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                    用途:
                  </span>
                  <span className="text-xs text-foreground leading-relaxed">
                    {item.purpose}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                    路径:
                  </span>
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {item.path}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
