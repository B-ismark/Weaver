import "server-only";

/**
 * Plain k-means over embedding vectors (no ML deps). Vectors are L2-normalized,
 * so Euclidean distance ≈ cosine. Used to (re)compute taste centroids (§8.3)
 * from the taste set — runs hostless on the server.
 */
export interface KMeansResult {
  centroids: number[][]; // L2-normalized
  sizes: number[];
}

function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

/** Heuristic cluster count: ~sqrt(n/2), clamped to [1, 8], never > n. */
export function clusterCount(n: number): number {
  return Math.max(1, Math.min(8, Math.round(Math.sqrt(n / 2)), n));
}

export function kmeans(data: number[][], k: number, iters = 50): KMeansResult {
  const dim = data[0].length;
  // k-means++ seeding.
  const centers: number[][] = [data[Math.floor(Math.random() * data.length)].slice()];
  while (centers.length < k) {
    const d2 = data.map((p) => Math.min(...centers.map((c) => dist2(p, c))));
    const sum = d2.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    let idx = 0;
    while (r > 0 && idx < d2.length) {
      r -= d2[idx];
      idx++;
    }
    centers.push(data[Math.max(0, idx - 1)].slice());
  }

  const labels = new Array(data.length).fill(0);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < data.length; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(data[i], centers[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        moved = true;
      }
    }
    for (let c = 0; c < k; c++) {
      const members = data.filter((_, i) => labels[i] === c);
      if (!members.length) continue;
      const mean = new Array(dim).fill(0);
      for (const p of members) for (let d = 0; d < dim; d++) mean[d] += p[d];
      for (let d = 0; d < dim; d++) mean[d] /= members.length;
      centers[c] = mean;
    }
    if (!moved && it > 0) break;
  }

  const sizes = new Array(k).fill(0);
  for (const l of labels) sizes[l]++;
  return { centroids: centers.map(normalize), sizes };
}

/** Parse a pgvector text literal '[a,b,c]' → number[]. */
export function parsePgVector(s: string): number[] {
  return s.replace(/[[\]]/g, "").split(",").map(Number);
}
