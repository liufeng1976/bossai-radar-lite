export interface LatestRequestGate {
  next(): number;
  invalidate(): number;
  isCurrent(requestSequence: number): boolean;
}

export function createLatestRequestGate(): LatestRequestGate;
