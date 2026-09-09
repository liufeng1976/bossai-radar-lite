export function createLatestRequestGate() {
  let sequence = 0;

  return {
    next() {
      sequence += 1;
      return sequence;
    },
    invalidate() {
      sequence += 1;
      return sequence;
    },
    isCurrent(requestSequence) {
      return requestSequence === sequence;
    },
  };
}
