import type { Product } from '@/lib/product'
import {
  type MonitorFilterConfig,
  type MonitorFilterMode,
  filterProductsByMonitor,
  parseFilterMode,
} from '@/lib/monitor-filter'

export interface MonitorFilterSource {
  query: string
  filter_mode?: MonitorFilterMode | string | null
  /** @deprecated migrated to filter_mode */
  strict_match?: boolean | null
  exclude_terms?: string[] | null
}

export function monitorFilterConfig(monitor: MonitorFilterSource): MonitorFilterConfig {
  let filter_mode = parseFilterMode(monitor.filter_mode)
  if (!monitor.filter_mode && monitor.strict_match) {
    filter_mode = 'smart'
  }
  return {
    filter_mode,
    exclude_terms: monitor.exclude_terms ?? [],
  }
}

export function applyMonitorFilter(
  products: Product[],
  monitor: MonitorFilterSource,
): Product[] {
  return filterProductsByMonitor(products, monitor.query, monitorFilterConfig(monitor))
}

export function isFilteredMonitor(monitor: MonitorFilterSource): boolean {
  const config = monitorFilterConfig(monitor)
  return config.filter_mode !== 'default' || config.exclude_terms.length > 0
}
