export async function settleWithin(operation: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([operation.then(() => true, () => false), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}
