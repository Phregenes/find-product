export type ServiceStatus = 'ok' | 'degraded' | 'error'

export interface StatusCheck {
  id: string
  name: string
  status: ServiceStatus
  message: string
  updatedAt: string | null
}

export interface ProxyUsageStatus {
  budgetGb: number
  periodBytes: number
  periodScrapes: number
  todayBytes: number
  avgBytesPerScrape: number | null
  avgBytesPerDay: number | null
  usedPercent: number
  daysRemaining: number | null
  depletedAt: string | null
  estimatedDailyBytes: number | null
  estimatedDaysRemaining: number | null
}

export interface StatusReport {
  status: ServiceStatus
  checkedAt: string
  services: StatusCheck[]
  proxy?: ProxyUsageStatus
}
