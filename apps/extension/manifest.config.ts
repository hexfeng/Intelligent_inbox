import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Intelligent Inbox",
  description: "A trustworthy Gmail decision and action layer.",
  version: "0.1.0",
  permissions: ["storage", "identity"],
  host_permissions: ["http://127.0.0.1:8787/*", "https://mail.google.com/*"],
  action: { default_popup: "src/popup.html", default_title: "Intelligent Inbox" },
  options_ui: { page: "src/privacy.html", open_in_tab: true },
  background: { service_worker: "src/background.ts", type: "module" },
  content_scripts: [
    {
      matches: ["https://mail.google.com/*"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle"
    }
  ]
});
