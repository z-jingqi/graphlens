export interface ColumnWidths {
  name: number
  status: number
  size: number
  time: number
}

export interface SettingsState {
  clearOnRefresh: boolean
  requestListWidth: number
  searchPanelWidth: number
  columnWidths: ColumnWidths
}

export const DEFAULT_SETTINGS: SettingsState = {
  clearOnRefresh: true,
  requestListWidth: 420,
  searchPanelWidth: 280,
  columnWidths: { name: 500, status: 120, size: 120, time: 120 },
}

const KEY = 'graphlens-settings'

export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      columnWidths: { ...DEFAULT_SETTINGS.columnWidths, ...(parsed.columnWidths ?? {}) },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: SettingsState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}
