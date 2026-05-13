/* Rejection sampling eliminates modulo bias: values 252–255 would
   favor faces 1–4, so we discard them. ~1.6% rejection rate. */
const MAX_UNBIASED = Math.floor(256 / 6) * 6; // 252

export function rollD6(): number {
  const arr = new Uint8Array(1);
  let value: number;
  do {
    crypto.getRandomValues(arr);
    value = arr[0];
  } while (value >= MAX_UNBIASED);
  return (value % 6) + 1;
}

export function rollMultipleD6(count: number): number[] {
  return Array.from({ length: count }, rollD6);
}

export function rollWithAdvantage(): { kept: number[]; dropped: number[] } {
  const dice = rollMultipleD6(3);
  const sorted = [...dice].sort((a, b) => a - b);
  return {
    kept: sorted.slice(1),
    dropped: sorted.slice(0, 1),
  };
}

export function rollWithDisadvantage(): { kept: number[]; dropped: number[] } {
  const dice = rollMultipleD6(3);
  const sorted = [...dice].sort((a, b) => b - a);
  return {
    kept: sorted.slice(1),
    dropped: sorted.slice(0, 1),
  };
}
