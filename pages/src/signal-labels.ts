const trialPattern = /^(E[0-9]+|AVG_E[0-9]+(?:_E[0-9]+)*)__([A-Za-z][A-Za-z0-9_-]*)__trial_([A-Za-z0-9_-]+)$/;
const averagePattern = /^AVG_E[0-9]+(?:_E[0-9]+)*$/;

export function trialLabel(name: string) {
  const match = trialPattern.exec(name);
  if (!match) return null;
  const event = /^event([0-9]+)$/i.exec(match[3]);
  const id = (event?.[1] || match[3]).replace(/^0+(?=[0-9])/, "");
  return {
    electrode: match[1],
    condition: match[2],
    trial: `${event ? "Event" : "Trial"} ${id}`,
  };
}

export function averageMembers(name: string): string[] {
  return averagePattern.test(name) ? name.slice(4).split("_") : [];
}

function electrodeRanges(members: string[]) {
  const numbers = members.map((name) => Number(name.slice(1))).sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const first = numbers[i];
    while (i + 1 < numbers.length && numbers[i + 1] === numbers[i] + 1) i++;
    ranges.push(first === numbers[i] ? `E${first}` : `E${first}–E${numbers[i]}`);
  }
  return ranges.join(", ");
}

export function electrodeLabel(name: string) {
  const members = averageMembers(name);
  if (!members.length) return name;
  const ranges = electrodeRanges(members);
  return ranges.length <= 36
    ? `Average (${ranges})`
    : `Average (${members.length} electrodes)`;
}

// These labels are only for display. Dataset names and export identifiers stay intact.
export function signalLabel(name = "") {
  const trial = trialLabel(name);
  if (trial) return `${trial.condition} · ${trial.trial}`;
  return name.replace(/AVG_E[0-9]+(?:_E[0-9]+)*/g, electrodeLabel);
}

export function fitLabel(name: string, limit: number) {
  if (limit <= 1) return "…".slice(0, Math.max(0, limit));
  if (name.length <= limit) return name;
  const first = Math.ceil((limit - 1) / 2);
  return name.slice(0, first) + "…" + name.slice(-(limit - first - 1));
}
