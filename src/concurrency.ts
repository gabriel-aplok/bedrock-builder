export async function runBounded<T>(
  entries: readonly T[],
  cap: number,
  task: (entry: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes: Promise<void>[] = [];
  for (let lane = 0, total = Math.min(cap, entries.length); lane < total; lane++) {
    lanes.push(
      (async () => {
        for (;;) {
          const at = cursor++;
          if (at >= entries.length) return;
          await task(entries[at]!);
        }
      })(),
    );
  }
  await Promise.all(lanes);
}
