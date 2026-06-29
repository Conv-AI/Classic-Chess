/**
 * CC4 ExpressionPlus C_* combination correctives.
 * A corrective fires when all constituent base morphs are active (product).
 * Ported from Convai neurosync lipsync reference (correctives.ts).
 */

export type CC4Corrective = {
  index: number;
  parts: number[];
};

function norm(s: string): string {
  return s.replace(/_/g, '').toLowerCase();
}

export function buildCC4Correctives(morphTargetDictionary: Record<string, number>): CC4Corrective[] {
  const bases = Object.entries(morphTargetDictionary)
    .filter(([name]) => !/^C_/i.test(name))
    .map(([name, index]) => ({ norm: norm(name), index }))
    .sort((a, b) => a.norm.length - b.norm.length);

  const resolveToken = (token: string): number => {
    const t = norm(token);
    let best = -1;
    let bestLen = Infinity;
    for (const b of bases) {
      if (b.norm.endsWith(t) && b.norm.length < bestLen) {
        best = b.index;
        bestLen = b.norm.length;
      }
    }
    return best;
  };

  const correctives: CC4Corrective[] = [];
  for (const [name, index] of Object.entries(morphTargetDictionary)) {
    if (!/^C_/i.test(name)) continue;
    if (/Jaw(Open|Fwd|Forward)/i.test(name)) continue;
    const tokens = name.split('_').slice(1);
    if (tokens.length < 2) continue;
    const parts = tokens.map(resolveToken);
    if (parts.some((p) => p < 0)) continue;
    correctives.push({ index, parts });
  }
  return correctives;
}

export function applyCC4Correctives(
  influences: number[] | Float32Array,
  correctives: CC4Corrective[],
): void {
  for (const c of correctives) {
    let v = 1;
    for (const p of c.parts) v *= influences[p];
    influences[c.index] = v;
  }
}
