/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_TITLE: string;
  readonly VITE_E2E_KEEP_SYNC_KEY_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
