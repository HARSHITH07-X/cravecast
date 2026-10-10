/**
 * Deterministic mathematical utilities for CraveCast Phase 5 Forecast Engine.
 * Implements pure linear algebra and statistical functions with zero external ML dependencies.
 */

/**
 * Transpose a 2D matrix (rows x cols -> cols x rows)
 */
export function matrixTranspose(A: number[][]): number[][] {
  if (A.length === 0 || A[0].length === 0) return [];
  const rows = A.length;
  const cols = A[0].length;
  const AT: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      AT[j][i] = A[i][j];
    }
  }
  return AT;
}

/**
 * Multiply two 2D matrices (A: m x k, B: k x n -> C: m x n)
 */
export function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  if (m === 0) return [];
  const k = A[0].length;
  const n = B[0].length;
  const C: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));

  for (let i = 0; i < m; i++) {
    for (let p = 0; p < k; p++) {
      const aVal = A[i][p];
      if (aVal === 0) continue;
      for (let j = 0; j < n; j++) {
        C[i][j] += aVal * B[p][j];
      }
    }
  }
  return C;
}

/**
 * Multiply a matrix by a vector: A (m x n) * v (n) -> result (m)
 */
export function matrixVectorMultiply(A: number[][], v: number[]): number[] {
  const m = A.length;
  if (m === 0) return [];
  const n = v.length;
  const result: number[] = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    const row = A[i];
    for (let j = 0; j < n; j++) {
      sum += row[j] * v[j];
    }
    result[i] = sum;
  }
  return result;
}

/**
 * Solves Ax = b using Gaussian elimination with partial pivoting.
 * Adds diagonal stabilization if needed.
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  if (n === 0) return [];

  // Deep clone to avoid mutating input
  const M: number[][] = A.map((row) => [...row]);
  const x: number[] = [...b];

  // Forward elimination
  for (let k = 0; k < n; k++) {
    // Find pivot
    let maxRow = k;
    let maxVal = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(M[i][k]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = i;
      }
    }

    if (maxVal < 1e-12) {
      // Near singular: apply small Tikhonov jitter on diagonal
      M[k][k] += 1e-6;
    } else if (maxRow !== k) {
      // Swap rows
      const tmpRow = M[k];
      M[k] = M[maxRow];
      M[maxRow] = tmpRow;

      const tmpB = x[k];
      x[k] = x[maxRow];
      x[maxRow] = tmpB;
    }

    const diag = M[k][k];
    for (let i = k + 1; i < n; i++) {
      const factor = M[i][k] / diag;
      for (let j = k; j < n; j++) {
        M[i][j] -= factor * M[k][j];
      }
      x[i] -= factor * x[k];
    }
  }

  // Back substitution
  const sol: number[] = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * sol[j];
    }
    sol[i] = Math.abs(M[i][i]) > 1e-12 ? sum / M[i][i] : 0;
  }

  return sol;
}

/**
 * Solve Ridge Regression: w = (X^T X + lambda * I)^(-1) X^T y
 */
export function solveRidgeRegression(X: number[][], y: number[], lambda = 1.0): number[] {
  if (X.length === 0 || y.length === 0) return [];
  const nFeatures = X[0].length;
  const XT = matrixTranspose(X);
  const XTX = matrixMultiply(XT, X);

  // Add L2 ridge regularization to diagonal
  for (let j = 0; j < nFeatures; j++) {
    XTX[j][j] += lambda;
  }

  const XTy = matrixVectorMultiply(XT, y);
  return solveLinearSystem(XTX, XTy);
}

/**
 * Calculate empirical quantile from array of numbers (q in [0, 1])
 */
export function calculateQuantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const pos = q * (sorted.length - 1);
  const base = Math.floor(pos);
  const rest = pos - base;

  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Compute sample mean
 */
export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((acc, v) => acc + v, 0) / arr.length;
}

/**
 * Temperature bucketing utility
 * Cold: < 18°C
 * Mild: 18°C - 27°C
 * Warm: 28°C - 34°C
 * Hot: >= 35°C
 */
export function categorizeTemp(tempCelsius?: number): 'cold' | 'mild' | 'warm' | 'hot' {
  if (tempCelsius === undefined || isNaN(tempCelsius)) return 'mild';
  if (tempCelsius < 18) return 'cold';
  if (tempCelsius < 28) return 'mild';
  if (tempCelsius < 35) return 'warm';
  return 'hot';
}

/**
 * Demand Censoring Adjustment:
 * Days marked sold out are censored (actual demand was AT LEAST the sales).
 * Exclude them from baseline level downward estimation.
 * Returns the effective uncensored mean and median.
 */
export function estimateUncensoredLevel(
  series: Array<{ quantitySold: number; soldOut: boolean; isClosed?: boolean }>
): number {
  const openDays = series.filter((s) => !s.isClosed);
  if (openDays.length === 0) return 0;

  // Uncensored days (where dish was not sold out) reflect unconstrained demand
  const uncensored = openDays.filter((s) => !s.soldOut);
  if (uncensored.length > 0) {
    const uncensoredMean = mean(uncensored.map((s) => s.quantitySold));
    // If all uncensored days exist, use uncensored mean
    // If there were also sold-out days, sold-out quantities act as lower bounds
    const soldOutMax = Math.max(0, ...openDays.filter((s) => s.soldOut).map((s) => s.quantitySold));
    return Math.max(uncensoredMean, soldOutMax);
  }

  // If every day was sold out, the level is at least the highest observed sales
  return Math.max(...openDays.map((s) => s.quantitySold));
}
