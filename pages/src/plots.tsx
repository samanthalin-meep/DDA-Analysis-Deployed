import React, { useMemo, useRef, useState } from "react";
import { download } from "./storage";
import { fitLabel, signalLabel } from "./signal-labels";
import { nearestTimeIndex } from "./result-time-axis";
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
  timeUnit = "s",
  timeBounds,
}: {
  time: number[];
  values: number[][];
  names: string[];
  title?: string;
  ylabel?: string;
  id?: string;
  timeUnit?: "s" | "ms";
  timeBounds?: [number, number];
}) {
  const [hidden, setHidden] = useState<number[]>([]);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<number | null>(null);
  const labels = names.map(signalLabel);
  const first = range?.[0] ?? 0,
    last = range?.[1] ?? time.length - 1;
  const visible = values
    .map((v, i) => (hidden.includes(i) ? [] : v.slice(first, last + 1)))
    .flat()
    .filter(Number.isFinite);
  const lo = visible.length ? visible.reduce((a, v) => Math.min(a, v), Infinity) : 0,
    hi = visible.length ? visible.reduce((a, v) => Math.max(a, v), -Infinity) : 1;
  const pad = (hi - lo) * 0.06 || 0.1,
    ymin = lo - pad,
    ymax = hi + pad;
  const w = 1050,
    h = 480,
    left = 67,
    top = 30,
    right = Math.min(
      270,
      Math.max(145, Math.max(0, ...labels.map((label) => label.length)) * 6 + 45),
    ),
    bottom = 55,
    pw = w - left - right,
    ph = h - top - bottom;
  const xmin = (!range && timeBounds ? timeBounds[0] : time[first]) ?? 0,
    xmax = (!range && timeBounds ? timeBounds[1] : time[last]) ?? 1;
  const displayTime = (seconds: number) => Math.abs(seconds) < 1e-10 ? 0 : seconds * (timeUnit === "ms" ? 1000 : 1);
  const x = (t: number) => left + ((t - xmin) / (xmax - xmin || 1)) * pw,
    y = (v: number) => top + ((ymax - v) / (ymax - ymin)) * ph;
  const at = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * w;
    const target = xmin + ((px - left) / pw) * (xmax - xmin);
    return nearestTimeIndex(time, target, first, last);
  };
  return (
    <div className="plot-wrap">
      <svg
        id={id}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={signalLabel(title) || "Analysis graph"}
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
          {signalLabel(title)}
          <title>{title}</title>
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
                {Math.abs(xmin + ((xmax - xmin) * i) / 5) < 1e-10 && timeUnit === "ms"
                  ? "0 (event)" : fmt(displayTime(xmin + ((xmax - xmin) * i) / 5))}
              </text>
            </g>
          );
        })}
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={left} y={top} width={pw} height={ph} />
          </clipPath>
        </defs>
        {xmin <= 0 && xmax >= 0 && (
          <line x1={x(0)} x2={x(0)} y1={top} y2={top + ph}
            stroke="var(--muted)" strokeDasharray="4 4">
            <title>{`Event onset (0 ${timeUnit})`}</title>
          </line>
        )}
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
          {timeUnit === "ms" ? "Time relative to event (ms; fitted-window center)" : ylabel === "a1"
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
              {fitLabel(labels[i], Math.floor((right - 40) / 6))}
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
              width="290"
              height={24 + Math.min(values.length, 8) * 16}
              fill="var(--surface)"
              stroke="var(--border)"
            />
            <text x={left + 17} y={top + 24} fill="var(--text)" fontSize="11">
              {fmt(displayTime(time[hover]))} {timeUnit}
              {values.slice(0, 8).map((row, i) => (
                <tspan
                  key={i}
                  x={left + 17}
                  dy="16"
                  fill={palette[i % palette.length]}
                >
                  {fitLabel(labels[i] || "", 32)}: {fmt(row[hover])}
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

export const waveformRows = 8;

// Each trial has its own row. All pages use the same voltage scale.
export function StackedWaveforms({ time, values, names, title, id, page, onPage }: {
  time: number[]; values: number[][]; names: string[]; title: string; id: string;
  page: number; onPage: (page: number) => void;
}) {
  const current = Math.max(0, Math.min(page, Math.ceil(values.length / waveformRows) - 1));
  const first = current * waveformRows, last = Math.min(first + waveformRows, values.length);
  const peak = values.reduce((max, row) => row.reduce((m, v) => Math.max(m, Math.abs(v)), max), 0) || 1;
  const w = 1050, left = 72, right = 26, top = 45, rowHeight = 86;
  const h = top + (last - first) * rowHeight + 48, pw = w - left - right;
  const xmin = time[0], xmax = time[time.length - 1];
  const x = (t: number) => left + (t - xmin) / (xmax - xmin || 1) * pw;
  return <div className="stacked-waveforms">
    <div className="toolbar waveform-pages">
      <span>Trials {first + 1}–{last} of {values.length}</span>
      <button disabled={current === 0} onClick={() => onPage(current - 1)}>Previous</button>
      <button disabled={last === values.length} onClick={() => onPage(current + 1)}>Next</button>
    </div>
    <svg id={id} viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={`${signalLabel(title)} · Separate trials ${first + 1} to ${last}`}>
      <rect width={w} height={h} fill="var(--surface)" />
      <text x={left} y={22} fill="var(--text)" fontSize="16">{signalLabel(title)}</text>
      <text x={w - right} y={22} textAnchor="end" fill="var(--muted)" fontSize="14">
        Trials {first + 1}–{last} of {values.length} · ±{fmt(peak)} µV
      </text>
      {Array.from({ length: 6 }, (_, i) => {
        const xx = left + pw * i / 5;
        return <g key={i}>
          <line x1={xx} x2={xx} y1={top} y2={h - 48} stroke="var(--grid)" />
          <text x={xx} y={h - 28} textAnchor="middle" fill="var(--muted)" fontSize="14">{fmt(xmin + (xmax - xmin) * i / 5)}</text>
        </g>;
      })}
      {values.slice(first, last).map((row, i) => {
        const y = top + i * rowHeight;
        return <g key={names[first + i]}>
          <text x={left} y={y + 16} fill="var(--text)" fontSize="16">
            {signalLabel(names[first + i])}<title>{names[first + i]}</title>
          </text>
          <line x1={left} x2={w - right} y1={y + 55} y2={y + 55} stroke="var(--grid)" />
          <polyline fill="none" stroke={palette[0]} strokeWidth="1.5"
            points={row.map((v, j) => `${x(time[j])},${y + 55 - v / peak * 23}`).join(" ")} />
        </g>;
      })}
      <text x={left + pw / 2} y={h - 7} textAnchor="middle" fill="var(--muted)" fontSize="14">Time (s)</text>
    </svg>
    <p className="muted">The graph export contains these rows.</p>
  </div>;
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
  timeUnit = "s",
  timeBounds,
}: {
  values: number[][];
  names: string[];
  time: number[];
  scheme?: string;
  timeUnit?: "s" | "ms";
  timeBounds?: [number, number];
}) {
  const visible = values.flat().filter(Number.isFinite),
    lo = Math.min(...visible),
    hi = Math.max(...visible);
  const cols = Math.max(1, values[0]?.length || 1),
    rh = Math.max(20, Math.min(55, 380 / values.length));
  const xmin = timeBounds?.[0] ?? time[0] ?? 0,
    xmax = timeBounds?.[1] ?? time.at(-1) ?? 1;
  const x = (t: number) => 140 + (t - xmin) / (xmax - xmin || 1) * 850;
  const displayTime = (t: number) => Math.abs(t) < 1e-10 ? 0 : t * (timeUnit === "ms" ? 1000 : 1);
  const cellStep = time.length > 1 ? time[1] - time[0] : (xmax - xmin || 1) / cols;
  return (
    <div className="heatmap-scroll">
      <svg
        id="heatmap-plot"
        viewBox={`0 0 1050 ${Math.max(180, values.length * rh + 80)}`}
        role="img"
        aria-label="Analysis heatmap"
      >
        <rect width="1050" height="100%" fill="var(--surface)" />
        <defs><clipPath id="heatmap-time-clip"><rect x="140" y="30" width="850" height={values.length * rh} /></clipPath></defs>
        {values.map((row, i) => (
          <g key={i}>
            <text
              x="128"
              y={30 + (i + 0.6) * rh}
              textAnchor="end"
              fill="var(--text)"
              fontSize="12"
            >
              {fitLabel(signalLabel(names[i] || ""), 22)}
              <title>{names[i]}</title>
            </text>
            <g clipPath="url(#heatmap-time-clip)">{row.map((v, j) => {
              const center = time[j] ?? 0;
              const left = ((time[j - 1] ?? center - cellStep) + center) / 2;
              const right = (center + (time[j + 1] ?? center + cellStep)) / 2;
              return (
              <rect
                key={j}
                x={x(left)}
                y={30 + i * rh}
                width={Math.max(0, x(right) - x(left)) + 0.2}
                height={rh + 0.2}
                fill={color((v - lo) / (hi - lo || 1), scheme)}
              >
                <title>
                  {`${signalLabel(names[i] || "")} · ${fmt(displayTime(time[j] ?? j))} ${timeUnit} · ${fmt(v)}`}
                </title>
              </rect>
            );})}</g>
          </g>
        ))}
        {Array.from({length:6},(_,i)=>i/5).map((t, i) => (
          <text
            key={i}
            x={140 + t * 850}
            y={values.length * rh + 53}
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="12"
          >
            {Math.abs(xmin + t * (xmax - xmin)) < 1e-10 && timeUnit === "ms" ? "0 (event)" : fmt(displayTime(xmin + t * (xmax - xmin)))}
          </text>
        ))}
        <text
          x="560"
          y={values.length * rh + 74}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="12"
        >
          Time relative to event ({timeUnit})
        </text>
        {xmin <= 0 && xmax >= 0 && <line x1={x(0)} x2={x(0)} y1="30" y2={30 + values.length * rh}
          stroke="var(--text)" strokeDasharray="4 4"><title>{`Event onset (0 ${timeUnit})`}</title></line>}
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
