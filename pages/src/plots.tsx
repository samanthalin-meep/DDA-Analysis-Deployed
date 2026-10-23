import React, { useMemo, useRef, useState } from "react";
import { download } from "./storage";
export const palette = [
  "#3288ff",
  "#ff3333",
  "#00bc88",
  "#ffa500",
  "#9755ff",
  "#00bed8",
  "#ee7fb1",
  "#b4b455",
];
const fmt = (n: number) =>
  Math.abs(n) >= 10000 || (Math.abs(n) > 0 && Math.abs(n) < 0.0001)
    ? n.toExponential(2)
    : Number(n.toPrecision(4)).toString();

export function LinePlot({
  time,
  values,
  names,
  title = "",
  ylabel = "a1",
  id = "result-plot",
}: {
  time: number[];
  values: number[][];
  names: string[];
  title?: string;
  ylabel?: string;
  id?: string;
}) {
  const [hidden, setHidden] = useState<number[]>([]);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<number | null>(null);
  const first = range?.[0] ?? 0,
    last = range?.[1] ?? time.length - 1;
  const visible = values
    .map((v, i) => (hidden.includes(i) ? [] : v.slice(first, last + 1)))
    .flat()
    .filter(Number.isFinite);
  const lo = visible.length ? Math.min(...visible) : 0,
    hi = visible.length ? Math.max(...visible) : 1;
  const pad = (hi - lo) * 0.06 || 0.1,
    ymin = lo - pad,
    ymax = hi + pad;
  const w = 1050,
    h = 480,
    left = 67,
    top = 30,
    right = 145,
    bottom = 55,
    pw = w - left - right,
    ph = h - top - bottom;
  const xmin = time[first] ?? 0,
    xmax = time[last] ?? 1;
  const x = (t: number) => left + ((t - xmin) / (xmax - xmin || 1)) * pw,
    y = (v: number) => top + ((ymax - v) / (ymax - ymin)) * ph;
  const at = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * w;
    return Math.max(
      first,
      Math.min(last, Math.round(first + ((px - left) / pw) * (last - first))),
    );
  };
  return (
    <div className="plot-wrap">
      <svg
        id={id}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={title || "Analysis graph"}
        onDoubleClick={() => setRange(null)}
        onPointerDown={(e) => {
          drag.current = at(e);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          const end = at(e);
          if (drag.current !== null && Math.abs(end - drag.current) > 2)
            setRange([
              Math.min(end, drag.current),
              Math.max(end, drag.current),
            ]);
          drag.current = null;
        }}
        onPointerMove={(e) => setHover(at(e))}
        onPointerLeave={() => setHover(null)}
      >
        <rect width={w} height={h} fill="var(--surface)" />
        <text
          x={left + pw / 2}
          y={17}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="12"
        >
          {title}
        </text>
        <rect
          x={left}
          y={top}
          width={pw}
          height={ph}
          fill="var(--canvas)"
          stroke="var(--plot-border)"
        />
        {Array.from({ length: 6 }, (_, i) => {
          const yy = top + (ph * i) / 5,
            xx = left + (pw * i) / 5;
          return (
            <g key={i} fill="var(--text)" fontSize="11">
              <line
                x1={left}
                x2={left + pw}
                y1={yy}
                y2={yy}
                stroke="var(--grid)"
              />
              <line
                x1={xx}
                x2={xx}
                y1={top}
                y2={top + ph}
                stroke="var(--grid)"
              />
              <text x={left - 8} y={yy + 4} textAnchor="end">
                {fmt(ymax - ((ymax - ymin) * i) / 5)}
              </text>
              <text x={xx} y={top + ph + 19} textAnchor="middle">
                {fmt(xmin + ((xmax - xmin) * i) / 5)}
              </text>
            </g>
          );
        })}
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={left} y={top} width={pw} height={ph} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-clip)`}>
          {values.map(
            (row, i) =>
              !hidden.includes(i) && (
                <polyline
                  key={i}
                  fill="none"
                  stroke={palette[i % palette.length]}
                  strokeWidth="1.5"
                  points={row
                    .slice(first, last + 1)
                    .map((v, k) => `${x(time[k + first])},${y(v)}`)
                    .join(" ")}
                />
              ),
          )}
        </g>
        <text
          x={left + pw / 2}
          y={h - 12}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="12"
        >
          {ylabel === "a1"
            ? "Time relative to event (s; fitted center)"
            : "Time (s)"}
        </text>
        <text
          transform={`translate(16 ${top + ph / 2}) rotate(-90)`}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="12"
        >
          {ylabel}
        </text>
        {names.slice(0, 18).map((name, i) => (
          <g
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              setHidden(
                hidden.includes(i)
                  ? hidden.filter((x) => x !== i)
                  : [...hidden, i],
              );
            }}
            style={{
              cursor: "pointer",
              opacity: hidden.includes(i) ? 0.35 : 1,
            }}
          >
            <line
              x1={left + pw + 12}
              x2={left + pw + 30}
              y1={top + 17 + i * 20}
              y2={top + 17 + i * 20}
              stroke={palette[i % palette.length]}
              strokeWidth="2"
            />
            <text
              x={left + pw + 35}
              y={top + 21 + i * 20}
              fill="var(--text)"
              fontSize="11"
            >
              {name.length > 15 ? name.slice(0, 14) + "…" : name}
              <title>{name}</title>
            </text>
          </g>
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line
              x1={x(time[hover])}
              x2={x(time[hover])}
              y1={top}
              y2={top + ph}
              stroke="var(--muted)"
              strokeDasharray="3 3"
            />
            <rect
              x={left + 9}
              y={top + 8}
              width="210"
              height={24 + Math.min(values.length, 8) * 16}
              fill="var(--surface)"
              stroke="var(--border)"
            />
            <text x={left + 17} y={top + 24} fill="var(--text)" fontSize="11">
              {fmt(time[hover])} s
              {values.slice(0, 8).map((row, i) => (
                <tspan
                  key={i}
                  x={left + 17}
                  dy="16"
                  fill={palette[i % palette.length]}
                >
                  {(names[i] || "").slice(0, 18)}: {fmt(row[hover])}
                </tspan>
              ))}
            </text>
          </g>
        )}
      </svg>
      {range && (
        <button className="plot-reset" onClick={() => setRange(null)}>
          Reset view
        </button>
      )}
    </div>
  );
}

function color(t: number, scheme: string) {
  const stops =
    scheme === "Magma"
      ? [
          [0, 0, 4],
          [81, 18, 124],
          [183, 55, 121],
          [252, 137, 97],
          [252, 253, 191],
        ]
      : scheme === "Coolwarm"
        ? [
            [59, 76, 192],
            [141, 176, 254],
            [221, 221, 221],
            [244, 154, 123],
            [180, 4, 38],
          ]
        : [
            [68, 1, 84],
            [59, 82, 139],
            [33, 145, 140],
            [94, 201, 98],
            [253, 231, 37],
          ];
  const p = Math.max(0, Math.min(1, t)) * (stops.length - 1),
    i = Math.min(stops.length - 2, Math.floor(p)),
    f = p - i;
  return `rgb(${stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f)).join(",")})`;
}
export function Heatmap({
  values,
  names,
  time,
  scheme = "Viridis",
}: {
  values: number[][];
  names: string[];
  time: number[];
  scheme?: string;
}) {
  const visible = values.flat().filter(Number.isFinite),
    lo = Math.min(...visible),
    hi = Math.max(...visible);
  const cols = Math.max(1, values[0]?.length || 1),
    rh = Math.max(20, Math.min(55, 380 / values.length));
  return (
    <div className="heatmap-scroll">
      <svg
        id="heatmap-plot"
        viewBox={`0 0 1050 ${Math.max(180, values.length * rh + 80)}`}
        role="img"
        aria-label="Analysis heatmap"
      >
        <rect width="1050" height="100%" fill="var(--surface)" />
        {values.map((row, i) => (
          <g key={i}>
            <text
              x="128"
              y={30 + (i + 0.6) * rh}
              textAnchor="end"
              fill="var(--text)"
              fontSize="12"
            >
              {(names[i] || "").slice(0, 20)}
            </text>
            {row.map((v, j) => (
              <rect
                key={j}
                x={140 + (j * 850) / cols}
                y={30 + i * rh}
                width={850 / cols + 0.2}
                height={rh + 0.2}
                fill={color((v - lo) / (hi - lo || 1), scheme)}
              >
                <title>
                  {names[i]} · {fmt(time[j] ?? j)} s · {fmt(v)}
                </title>
              </rect>
            ))}
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <text
            key={i}
            x={140 + t * 850}
            y={values.length * rh + 53}
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="12"
          >
            {fmt(time[Math.round(t * (cols - 1))] ?? 0)}
          </text>
        ))}
        <text
          x="560"
          y={values.length * rh + 74}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="12"
        >
          Time relative to event (s)
        </text>
      </svg>
      <div className="scale">
        <span>{fmt(lo)}</span>
        <i
          style={{
            background: `linear-gradient(to right,${[0, 0.25, 0.5, 0.75, 1].map((t) => color(t, scheme)).join(",")})`,
          }}
        />
        <span>{fmt(hi)}</span>
      </div>
    </div>
  );
}

export async function savePlot(id: string, name: string, kind: "png" | "svg") {
  const original = document.getElementById(id);
  if (!original) throw Error("Run an analysis before exporting the graph.");
  const svg = original.cloneNode(true) as SVGElement;
  const css = getComputedStyle(document.documentElement);
  for (const element of [svg, ...Array.from(svg.querySelectorAll("*"))])
    for (const attr of ["fill", "stroke"]) {
      const value = element.getAttribute(attr);
      if (value?.startsWith("var("))
        element.setAttribute(
          attr,
          css.getPropertyValue(value.slice(4, -1)).trim(),
        );
    }
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = new XMLSerializer().serializeToString(svg);
  if (kind === "svg") {
    download(name + ".svg", source, "image/svg+xml");
    return;
  }
  const blob = new Blob([source], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error("Cannot export this graph."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 2100;
    canvas.height =
      2 * (Number(svg.getAttribute("viewBox")?.split(" ")[3]) || 480);
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("Cannot create the PNG."))),
        "image/png",
      ),
    );
    download(name + ".png", png);
  } finally {
    URL.revokeObjectURL(url);
  }
}
