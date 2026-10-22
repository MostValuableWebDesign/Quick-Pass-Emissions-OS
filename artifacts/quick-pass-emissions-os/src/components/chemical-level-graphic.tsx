"use client";
import { useId } from "react";
export function ChemicalContainer({
  name,
  demoPercent,
  state,
}: {
  name: string;
  demoPercent?: number;
  state?: string;
}) {
  const id = useId().replaceAll(":", "");
  const demo = demoPercent !== undefined,
    low = demo ? demoPercent <= 20 : state === "Low";
  const tone = low
    ? "red"
    : demo && demoPercent < 50
      ? "amber"
      : demo || state === "Above threshold"
        ? "green"
        : state === "Sensor fault"
          ? "red"
          : "neutral";
  return (
    <svg
      viewBox="0 0 180 200"
      className={`chemical-container chemical-container--${tone}`}
      role="img"
      aria-label={
        demo
          ? `${name}: ${demoPercent} percent, design demo only`
          : `${name}: ${state}. Single-point detection; no measured fill height.`
      }
    >
      <defs>
        <clipPath id={id}>
          <path d="M40 45 Q40 32 53 32 H127 Q140 32 140 45 V171 Q140 181 130 181 H50 Q40 181 40 171 Z" />
        </clipPath>
      </defs>
      <path className="jug-cap" d="M48 19 H77 V33 H48 Z" />
      <path
        className="jug-outline"
        d="M40 45 Q40 32 53 32 H127 Q140 32 140 45 V171 Q140 181 130 181 H50 Q40 181 40 171 Z"
      />
      {demo ? (
        <g clipPath={`url(#${id})`}>
          <rect
            className="jug-liquid"
            x="40"
            y={181 - (149 * demoPercent) / 100}
            width="100"
            height={(149 * demoPercent) / 100}
          />
          <path
            className="jug-ripple"
            d={`M40 ${181 - (149 * demoPercent) / 100} Q65 ${175 - (149 * demoPercent) / 100} 90 ${181 - (149 * demoPercent) / 100} T140 ${181 - (149 * demoPercent) / 100}`}
          />
        </g>
      ) : (
        <>
          <line className="jug-threshold" x1="30" x2="151" y1="133" y2="133" />
          <circle className="jug-point" cx="140" cy="133" r="7" />
          <text x="90" y="107" textAnchor="middle" className="jug-symbol">
            {state === "Low" ? "↓" : state === "Above threshold" ? "✓" : "?"}
          </text>
        </>
      )}
      <path className="jug-handle" d="M99 43 H124 V63 H99 Z" />
      <text x="90" y="166" textAnchor="middle" className="jug-label">
        {demo ? "5 GAL · DEMO" : "SENSING POINT"}
      </text>
    </svg>
  );
}
export const chemicalDemo = [
  { name: "Foam soap", percent: 75, status: "Above demo marker" },
  { name: "Tire cleaner", percent: 40, status: "Watch — demo" },
  { name: "High-pressure soap", percent: 15, status: "Low — demo" },
  { name: "Clear wax", percent: 60, status: "Above demo marker" },
] as const;
