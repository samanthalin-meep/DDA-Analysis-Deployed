import React from "react";
import { averageMembers, electrodeLabel } from "./signal-labels";

export function SignalDetails({ electrode, selected, onChange, onUpload }: {
  electrode?: string;
  selected?: string[];
  onChange?: (electrodes: string[]) => void;
  onUpload?: () => void;
}) {
  if (!electrode) return null;
  const members = averageMembers(electrode);
  if (!members.length) return <p className="signal-summary">{electrode}</p>;
  return (
    <details className="signal-source" open={onChange ? true : undefined}>
      <summary>{onChange ? `Electrodes · ${selected?.length || 0} selected` : electrodeLabel(electrode)}</summary>
      <p>{onChange ? "Select electrodes to view their mean." : `${members.length} electrodes · Mean within each trial`}</p>
      <div className="signal-members" aria-label="Electrodes in average">
        {members.map((member, i) => (
          onChange ? <label key={member} className={selected?.includes(member) ? "selected" : ""}>
            <input type="checkbox" checked={selected?.includes(member) || false}
              onChange={(e) => onChange(e.target.checked ? [...(selected || []), member] : (selected || []).filter(x => x !== member))} />
            {member}
          </label> : <span key={i}>{member}</span>
        ))}
      </div>
      {onChange && <div className="toolbar selection-actions">
        <button onClick={() => onChange(members)}>Select all</button>
        <button onClick={() => onChange([])}>Clear</button>
      </div>}
      {onUpload && !onChange && <p>This CSV contains the average only. <button onClick={onUpload}>Upload recording</button></p>}
    </details>
  );
}
