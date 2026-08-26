import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import globalCss from "../theme.css?inline";
import contentCss from "./styles.css?inline";

const HOST_ID = "intelligent-inbox-root";

function mount() {
  if (document.getElementById(HOST_ID)) return;
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.position = "relative";
  host.style.zIndex = "2147483000";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${globalCss}\n${contentCss}`;
  const root = document.createElement("div");
  shadow.append(style, root);
  document.body.append(host);
  createRoot(root).render(<App />);
}

mount();
