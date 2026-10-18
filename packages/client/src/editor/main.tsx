import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "./Editor.js";
import "../style.css";
import "./editor.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Editor />
  </StrictMode>,
);
