import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import DocumentTab from "../src/components/DocumentTab";
import { DEFAULT_SETTINGS, useStore } from "../src/store";
import type { Project } from "../src/types";

const project: Project = {
  id: "door-004-pdf", number: "QA-DOOR-004", title: "Размерный лист дверцы", client: "QA", contact: "",
  direction: "nku", status: "draft", createdAt: 1, updatedAt: 1,
  markup: 0, workMarkup: 0, discount: 0, vatRate: 0, showWorkLines: true,
  tzzPct: 0, thirdParty: 0, extraCosts: 0, unforeseenPct: 0, tripCosts: 0,
  transportPct: 0, smrCost: 0, smrSell: 0, pnrCost: 0, pnrSell: 0,
  validDays: 30, notes: "", versions: [],
  cabinets: [{
    id: "cab-pdf", kind: "ШУ", name: "QA · две двери · 0/500/1000", hours: 0, designHours: 0, softwareHours: 0,
    items: [],
    doorLayout: {
      schema: "cabinet-door-layout-v1", doorCount: 2, labelSide: "below",
      elements: [
        { id: "left-top", kind: "lamp", tone: "green", label: "Координата 0", door: 0, x: 0, y: 0 },
        { id: "left-center", kind: "button", label: "Координата 500", door: 0, x: 500, y: 500 },
        { id: "right-bottom", kind: "emergency-stop", label: "Координата 1000", door: 1, x: 1000, y: 1000 },
      ],
    },
    doorGeometry: {
      schema: "cabinet-door-geometry-v1", units: "mm", view: "outside-front",
      leaves: [
        { door: 0, originXmm: 0, originYmm: 0, widthMm: 800, heightMm: 1800,
          placement: { leftMm: 50, topMm: 100, widthMm: 700, heightMm: 1600 } },
        { door: 1, originXmm: 800, originYmm: 0, widthMm: 800, heightMm: 1800,
          placement: { leftMm: 50, topMm: 100, widthMm: 700, heightMm: 1600 } },
      ],
    },
  }],
};

useStore.setState({
  settings: { ...DEFAULT_SETTINGS, companyName: "QA fixture", tagline: "DOOR-004 A4 Print/PDF", address: "", phone: "", email: "", requisites: "" },
  catalog: [],
});

function Fixture() {
  useEffect(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Приложение В"));
    button?.click();
    requestAnimationFrame(() => {
      document.documentElement.dataset.pdfReady = document.querySelectorAll(".door-drawing-sheet").length === 1 ? "true" : "false";
      document.title = `DOOR-004 PDF READY=${document.documentElement.dataset.pdfReady}`;
    });
  }, []);
  return <DocumentTab project={project} />;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
