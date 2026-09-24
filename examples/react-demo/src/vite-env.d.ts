/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WordPress API origin for the cf7 mailer (see the Mailers page). */
  readonly VITE_API_URL?: string;
  /** WordPress CF7 form id for the cf7 mailer (see the Mailers page). */
  readonly VITE_CF7_FORM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}