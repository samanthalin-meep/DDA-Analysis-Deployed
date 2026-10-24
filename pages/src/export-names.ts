// Prefer the entered ID. Older CSVs use their source filename as the fallback.
export function exportName(file: string | undefined, kind: string, recording?: string) {
  const stem = recording || (file || "DDALab").split(/[\\/]/).pop()!
    .replace(/\.[^.]+$/, "").replace(/^DDA_/i, "").replace(/_prepared(?:_E[0-9]+)?$/i, "");
  return `${stem}_${kind}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}
