/**
 * Shared helper to trigger a pipeline sync for a given user.
 * Fire-and-forget: resolves immediately; logs on failure.
 */
export async function triggerPipelineSync(userId: string): Promise<void> {
  const pipelineUrl = process.env.PIPELINE_INTERNAL_URL
  if (!pipelineUrl) return

  try {
    const res = await fetch(`${pipelineUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pipeline-secret': process.env.PIPELINE_SECRET ?? '',
      },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.error('[sync] Pipeline returned non-OK status:', res.status)
    }
  } catch (err) {
    console.error('[sync] Failed to reach pipeline:', err)
  }
}
