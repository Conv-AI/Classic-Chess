/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVAI_LOGIN_URL?: string;
  readonly VITE_CONVAI_AUTH_ME_URL?: string;
  readonly VITE_CONVAI_AUTH_LOGOUT_URL?: string;
  readonly VITE_CONVAI_AUTH_ENABLED?: string;
  readonly VITE_CONVAI_LOGIN_RETURN_PARAM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __DATASET_TOOLS_ENABLED__: boolean;
