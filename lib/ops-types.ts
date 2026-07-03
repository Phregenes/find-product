export type ServiceStatus = 'ok' | 'degraded' | 'error'

export interface StatusCheck {
  id: string
  name: string
  status: ServiceStatus
  message: string
  updatedAt: string | null
}

export interface StatusReport {
  status: ServiceStatus
  checkedAt: string
  services: StatusCheck[]
}
