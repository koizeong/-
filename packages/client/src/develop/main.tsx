import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Develop } from "./Develop.js";
import "../style.css";
import "../editor/editor.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Develop />
  </StrictMode>,
);
