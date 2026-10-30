import type { Variant } from "./types";

export function averageElectrodeVariants(runs: { electrode: string; variants: Variant[] }[]): Variant[] {
  if (!runs.length) throw Error("No electrode fits were supplied.");
  const first = runs[0].variants;
  return first.map((variant, vi) => ({
    ...variant,
    label: `Mean DDA values across ${runs.length} electrodes · ${variant.id}`,
    matrix: variant.matrix.map((row, ri) => row.map((_, wi) => {
      let sum = 0;
      for (const run of runs) {
        const v = run.variants[vi];
        if (run.variants.length !== first.length || v?.id !== variant.id ||
            v.matrix.length !== variant.matrix.length ||
            v.row_labels[ri] !== variant.row_labels[ri] ||
            v.matrix[ri]?.length !== row.length || !Number.isFinite(v.matrix[ri][wi]))
          throw Error("Electrode fits do not have matching conditions and time windows.");
        sum += v.matrix[ri][wi];
      }
      return sum / runs.length;
    })),
  }));
}
