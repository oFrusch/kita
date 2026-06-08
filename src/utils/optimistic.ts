/**
 * Execute an optimistic update with automatic rollback on error.
 *
 * @param optimisticAction - Function that performs the optimistic UI update and returns a snapshot for rollback
 * @param serverAction - Function that performs the actual server request
 * @param rollback - Function that restores the previous state using the snapshot
 * @returns The result from the server action
 * @throws Re-throws any error from the server action after rolling back
 */
export async function withOptimisticUpdate<TSnapshot, TResult>(
  optimisticAction: () => TSnapshot,
  serverAction: () => Promise<TResult>,
  rollback: (snapshot: TSnapshot) => void,
): Promise<TResult> {
  const snapshot = optimisticAction();
  try {
    return await serverAction();
  } catch (error) {
    rollback(snapshot);
    throw error;
  }
}
