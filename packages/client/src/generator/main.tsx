import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MapGenerator } from "./MapGenerator.js";
import "../style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MapGenerator />
  </StrictMode>,
);
