const analysisConditions = ["control", "exp1", "exp2", "exp3", "exp4", "exp5"];

export async function readElectrodes(file: Blob): Promise<string[]> {
  const decode = (buffer: ArrayBuffer) => new TextDecoder("ascii").decode(buffer);
  const header = decode(await file.slice(0, 256).arrayBuffer());
  if (header.length !== 256 || header.slice(0, 8).trim() !== "0")
    throw Error("Use an EDF recording.");
  const count = Number(header.slice(252, 256).trim());
  if (count !== 130) throw Error("Use the 130-channel HydroCel recording.");
  const headerBytes = Number(header.slice(184, 192).trim());
  if (
    !Number.isInteger(headerBytes) ||
    headerBytes < 256 + 256 * count ||
    file.size < headerBytes
  )
    throw Error("The EDF header is incomplete.");
  const text = decode(await file.slice(256, 256 + 16 * count).arrayBuffer());
  const labels = Array.from({ length: count }, (_, i) =>
    text.slice(16 * i, 16 * (i + 1)).trim(),
  );
  if (labels.some((label, i) => label !== (i === 129 ? "Status" : `E${i + 1}`)))
    throw Error("The EDF channel names or order differ from E1–E129, Status.");
  return labels.slice(0, -1);
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const endField = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0].length) rows.push(row);
    row = [];
  };
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === ",") endField();
    else if (char === "\n" || char === "\r") {
      endRow();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (char === '"' || closed)
        throw Error("The conditions CSV has an invalid quoted field.");
      field += char;
    }
  }
  if (quoted) throw Error("The conditions CSV has an incomplete quoted field.");
  if (field.length || row.length || closed) endRow();
  return rows;
}

export function readConditions(text: string): string[] {
  const [header = [], ...rows] = csvRows(text);
  const labelIndex = header.indexOf("label");
  if (labelIndex < 0 || !header.includes("sec_time"))
    throw Error("The CSV needs sec_time and label columns.");
  if (new Set(header).size !== header.length)
    throw Error("The CSV header has repeated columns.");
  if (!rows.length) throw Error("The conditions CSV has no events.");
  const present = new Set<string>();
  for (const row of rows) {
    if (row.length !== header.length)
      throw Error("The CSV columns do not match its header.");
    const label = row[labelIndex];
    if (
      !analysisConditions.includes(label) &&
      label !== "start" &&
      label !== "reject"
    )
      throw Error("Unknown condition: " + label);
    present.add(label);
  }
  const choices = analysisConditions.filter((label) => present.has(label));
  if (!choices.length) throw Error("The CSV has no analysis conditions.");
  return choices;
}
