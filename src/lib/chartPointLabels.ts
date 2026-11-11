/**
 * Pick category/point indexes to label so value text roughly fits without overlapping.
 * Shared by Dashboard `SimpleLineChart` and Active Race `ProgressChart`.
 */
export function pointLabelIndexes(count: number, bandW: number, sampleLabel = '10'): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const labelW = Math.max(18, sampleLabel.length * 8)
  const stride = Math.max(1, Math.ceil((labelW + 6) / Math.max(bandW, 1)))
  const indexes: number[] = []
  for (let i = 0; i < count; i += stride) indexes.push(i)
  const last = count - 1
  if (indexes[indexes.length - 1] !== last) {
    if (indexes.length > 0 && last - indexes[indexes.length - 1]! < stride) {
      indexes.pop()
    }
    indexes.push(last)
  }
  return indexes
}
