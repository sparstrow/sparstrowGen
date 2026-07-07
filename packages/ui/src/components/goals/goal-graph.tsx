import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PlanEdge, PlanNodeView } from "@sparstrow/shared";
import { StatusNode, type StatusFlowNode } from "./status-node";

/**
 * The Node Graph (P6 item 5) — read-only React Flow canvas over the CURRENT
 * plan version. Positions come from the server's layered layout; live updates
 * arrive as query invalidations (task.updated / goal.plan.updated), so the
 * graph re-renders green as agents finish (the god's-eye view).
 */

const nodeTypes = { status: StatusNode };

export function GoalGraph({
  nodes,
  edges,
  agentName,
  onNodeClick,
}: {
  nodes: PlanNodeView[];
  edges: PlanEdge[];
  agentName: (id: string | null) => string | null;
  onNodeClick?: (node: PlanNodeView) => void;
}) {
  const byId = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const rfNodes: StatusFlowNode[] = React.useMemo(
    () =>
      nodes.map((n, i) => ({
        id: n.id,
        type: "status" as const,
        position: n.position ?? { x: (i % 4) * 280, y: Math.floor(i / 4) * 140 },
        data: {
          label: n.label,
          status: n.status,
          statusDetail: n.statusDetail,
          agentName: agentName(n.agentId),
          kind: n.kind,
        },
        draggable: true,
        connectable: false,
      })),
    [nodes, agentName],
  );

  const rfEdges: Edge[] = React.useMemo(
    () =>
      edges.map((e) => {
        const target = byId.get(e.toNodeId);
        return {
          id: String(e.id),
          source: e.fromNodeId,
          target: e.toNodeId,
          animated: target?.status === "running",
          style: { strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        };
      }),
    [edges, byId],
  );

  return (
    <div className="h-full min-h-[420px] w-full overflow-hidden rounded-xl border bg-muted/20">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        onNodeClick={(_ev, rfNode) => {
          const node = byId.get(rfNode.id);
          if (node && onNodeClick) onNodeClick(node);
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
