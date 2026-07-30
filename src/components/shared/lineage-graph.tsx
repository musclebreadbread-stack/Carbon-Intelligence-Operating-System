import type { ProvenanceTree } from "@/lib/domain/lineage/graph";
import { truncate } from "@/lib/format";

export type LineageGraphProps = {
  /** `toProvenanceTree(graph, nodeId)` from the lineage domain. */
  readonly tree: ProvenanceTree;
  readonly className?: string;
};

/** Fill per lineage node type, so a reader can tell layers apart at a glance. */
const NODE_FILL: Readonly<Record<string, string>> = {
  ACTIVITY_DATA: "#dbeafe",
  EMISSION_FACTOR: "#fef3c7",
  CALCULATION: "#e9d5ff",
  EMISSION_RESULT: "#d1fae5",
  REPORT: "#fee2e2",
  EXTERNAL: "#e5e7eb",
};

type Laid = {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly truncated: boolean;
  readonly relationship: string | null;
};

const NODE_WIDTH = 190;
const NODE_HEIGHT = 42;
const COLUMN_GAP = 70;
const ROW_GAP = 14;

/**
 * Flattens the provenance tree into a depth-ordered layout.
 *
 * The root (the number the user clicked) is on the right and its upstream sources
 * march leftwards, which is the direction a reader expects "where did this come
 * from?" to read.
 */
function layout(tree: ProvenanceTree): {
  readonly nodes: readonly Laid[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
  readonly width: number;
  readonly height: number;
  readonly depth: number;
} {
  const byDepth = new Map<number, ProvenanceTree[]>();
  const edges: { from: string; to: string }[] = [];

  const walk = (node: ProvenanceTree, depth: number) => {
    const bucket = byDepth.get(depth);
    if (bucket) bucket.push(node);
    else byDepth.set(depth, [node]);
    for (const child of node.children) {
      edges.push({ from: child.node.id, to: node.node.id });
      walk(child, depth + 1);
    }
  };
  walk(tree, 0);

  const depth = byDepth.size;
  const rows = Math.max(...[...byDepth.values()].map((bucket) => bucket.length), 1);
  const height = rows * (NODE_HEIGHT + ROW_GAP) + ROW_GAP;
  const width = depth * (NODE_WIDTH + COLUMN_GAP) + COLUMN_GAP;

  const nodes: Laid[] = [];
  for (const [level, bucket] of byDepth) {
    // Deepest ancestors on the left: column index counts down from `depth - 1`.
    const column = depth - 1 - level;
    const columnHeight = bucket.length * (NODE_HEIGHT + ROW_GAP);
    const offset = (height - columnHeight) / 2;
    bucket.forEach((entry, index) => {
      nodes.push({
        id: entry.node.id,
        label: entry.node.name,
        type: entry.node.type,
        x: COLUMN_GAP / 2 + column * (NODE_WIDTH + COLUMN_GAP),
        y: offset + index * (NODE_HEIGHT + ROW_GAP),
        truncated: entry.truncated,
        relationship: entry.via?.relationship ?? null,
      });
    });
  }

  return { nodes, edges, width, height, depth };
}

/**
 * SVG provenance tree for `toProvenanceTree` output (item 15).
 *
 * Rendered as inline SVG rather than a charting library because the shape is a
 * DAG, not a series, and because a server component can emit it with no client
 * JavaScript at all.
 */
export function LineageGraph({ tree, className }: LineageGraphProps) {
  const { nodes, edges, width, height } = layout(tree);
  const positions = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className={className} data-testid="lineage-graph">
      <svg
        role="img"
        aria-label={`Data lineage for ${tree.node.name}`}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        className="max-w-full"
      >
        <defs>
          <marker
            id="lineage-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-muted-foreground" />
          </marker>
        </defs>

        {edges.map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_WIDTH;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_HEIGHT / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              className="text-muted-foreground/60"
              markerEnd="url(#lineage-arrow)"
            />
          );
        })}

        {nodes.map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={6}
              fill={NODE_FILL[node.type] ?? NODE_FILL.EXTERNAL}
              stroke="currentColor"
              strokeWidth={node.truncated ? 1.5 : 1}
              strokeDasharray={node.truncated ? "4 3" : undefined}
              className="text-muted-foreground/50"
            />
            <text
              x={node.x + 8}
              y={node.y + 17}
              fontSize={11}
              fontWeight={500}
              fill="#111827"
            >
              {truncate(node.label, 26)}
            </text>
            <text x={node.x + 8} y={node.y + 31} fontSize={9} fill="#4b5563">
              {node.type}
              {node.relationship ? ` · ${node.relationship}` : ""}
              {node.truncated ? " · cycle" : ""}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">
        {nodes.length} node{nodes.length === 1 ? "" : "s"}, {edges.length} edge
        {edges.length === 1 ? "" : "s"} — read right to left: the result on the right was
        derived from the sources on its left. A dashed border marks a branch cut short
        because the node was already visited.
      </p>
    </div>
  );
}
