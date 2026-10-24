import React from "react";
import { averageMembers, electrodeLabel } from "./signal-labels";

export function SignalDetails({ electrode }: { electrode?: string }) {
  if (!electrode) return null;
  const members = averageMembers(electrode);
  if (!members.length) return <p className="signal-summary">{electrode}</p>;
  return (
    <details className="signal-source">
      <summary>{electrodeLabel(electrode)}</summary>
      <p>{members.length} electrodes · Mean within each trial</p>
      <div className="signal-members" aria-label="Electrodes in average">
        {members.map((member, i) => (
          <span key={i}>{member}</span>
        ))}
      </div>
    </details>
  );
}
