import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    env: {
      GRAPHQL_ENDPOINT: string
    }
  }
}
