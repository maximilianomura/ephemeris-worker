export interface DateRange {
  startDate: string  // "2024-01-01"
  endDate:   string  // "2024-03-31"
}

export function validateRange(range: DateRange, maxDays = 366): void {
  const start = new Date(range.startDate)
  const end   = new Date(range.endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format — use YYYY-MM-DD')
  }
  if (end <= start) throw new Error('endDate must be after startDate')
  const diffDays = (end.getTime() - start.getTime()) / 86400000
  if (diffDays > maxDays) throw new Error(`Range cannot exceed ${maxDays} days`)
}

export function dateRangeToJDs(
  startDate: string,
  endDate: string,
  stepHours = 1
): number[] {
  // Returns array of Julian Day numbers at stepHours intervals
  // JD 2440587.5 = Unix epoch (1970-01-01 00:00 UTC)
  const startMs = new Date(startDate).getTime()
  const endMs   = new Date(endDate).getTime()
  const stepMs  = stepHours * 3600000
  const jds: number[] = []
  for (let ms = startMs; ms <= endMs; ms += stepMs) {
    jds.push(ms / 86400000 + 2440587.5)
  }
  return jds
}
