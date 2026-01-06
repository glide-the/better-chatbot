"use client";

import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  FolderOpen,
} from "lucide-react";
import { cn } from "lib/utils";
import { useState } from "react";

interface DirectoryTreeNode {
  name: string;
  type: "directory" | "file";
  children?: DirectoryTreeNode[];
  size?: number;
}

interface DirectoryTreeProps {
  tree: DirectoryTreeNode;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const TreeNode = function TreeNode({
  node,
  level = 0,
  path = "",
  onNodeClick,
}: {
  node: DirectoryTreeNode;
  level?: number;
  path?: string;
  onNodeClick?: (path: string, node: DirectoryTreeNode) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(level < 1);
  const currentPath = path ? `${path}/${node.name}` : node.name;
  const isDirectory = node.type === "directory";
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = () => {
    if (isDirectory && hasChildren) {
      setIsExpanded((prev) => !prev);
    }
    onNodeClick?.(currentPath, node);
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex items-center gap-1.5 w-full px-1.5 py-1 text-left hover:bg-muted/50 transition-colors rounded",
          level > 0 && "ml-3",
        )}
        style={{ paddingLeft: `${level * 12 + 6}px` }}
      >
        {isDirectory ? (
          <>
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="size-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="size-3 text-muted-foreground shrink-0" />
              )
            ) : (
              <span className="size-3 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="size-3.5 text-blue-500 shrink-0" />
            ) : (
              <Folder className="size-3.5 text-blue-500 shrink-0" />
            )}
            <span className="text-[11px] text-foreground truncate">
              {node.name}
            </span>
          </>
        ) : (
          <>
            <span className="size-3 shrink-0" />
            <File className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground truncate flex-1">
              {node.name}
            </span>
            {node.size !== undefined && (
              <span className="text-[10px] text-muted-foreground/70 shrink-0">
                {formatSize(node.size)}
              </span>
            )}
          </>
        )}
      </button>
      {isDirectory && isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={`${currentPath}/${child.name}`}
              node={child}
              level={level + 1}
              path={currentPath}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const DirectoryTree = function DirectoryTree({
  tree,
}: DirectoryTreeProps) {
  if (!tree) {
    return (
      <div className="text-center py-8">
        <div className="text-muted-foreground text-sm">暂无目录树</div>
      </div>
    );
  }

  const handleNodeClick = (path: string, node: DirectoryTreeNode) => {
    console.log("Node clicked:", path, node);
  };

  return (
    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
      <TreeNode node={tree} onNodeClick={handleNodeClick} />
    </div>
  );
};
