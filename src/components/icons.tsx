import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const Base = ({ size = 18, children, ...rest }: P & { children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const IcBolt = (p: P) => (
  <Base {...p}>
    <path d="M13 2 4.5 13.5H11L9.5 22 19 10.5h-6.5L13 2Z" />
  </Base>
);
export const IcFolder = (p: P) => (
  <Base {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </Base>
);
export const IcBox = (p: P) => (
  <Base {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="m3.3 8.3 8.7 4.7 8.7-4.7" />
    <path d="M12 22V13" />
  </Base>
);
export const IcPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
export const IcMinus = (p: P) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
);
export const IcSearch = (p: P) => (
  <Base {...p}>
    <circle cx={11} cy={11} r={7} />
    <path d="m21 21-4.5-4.5" />
  </Base>
);
export const IcTrash = (p: P) => (
  <Base {...p}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </Base>
);
export const IcPencil = (p: P) => (
  <Base {...p}>
    <path d="m17 3 4 4L7 21H3v-4L17 3Z" />
  </Base>
);
export const IcCopy = (p: P) => (
  <Base {...p}>
    <rect x={9} y={9} width={11} height={11} rx={2} />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Base>
);
export const IcDoc = (p: P) => (
  <Base {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Base>
);
export const IcPrinter = (p: P) => (
  <Base {...p}>
    <path d="M6 9V3h12v6" />
    <path d="M6 17H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" />
    <path d="M6 14h12v7H6Z" />
  </Base>
);
export const IcDownload = (p: P) => (
  <Base {...p}>
    <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
  </Base>
);
export const IcUpload = (p: P) => (
  <Base {...p}>
    <path d="M12 21V9m0 0 5 5m-5-5-5 5M5 3h14" />
  </Base>
);
export const IcChevronDown = (p: P) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);
export const IcChevronRight = (p: P) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);
export const IcCalc = (p: P) => (
  <Base {...p}>
    <rect x={5} y={3} width={14} height={18} rx={2} />
    <path d="M9 7.5h6M9 12h.01M12 12h.01M15 12h.01M9 15.5h.01M12 15.5h.01M15 15.5h.01" />
  </Base>
);
export const IcClock = (p: P) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={9} />
    <path d="M12 7v5l3.5 2" />
  </Base>
);
export const IcCheck = (p: P) => (
  <Base {...p}>
    <path d="m5 12.5 5 5L20 6.5" />
  </Base>
);
export const IcX = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);
export const IcLayers = (p: P) => (
  <Base {...p}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12.5 9 5 9-5M3 17.5 12 22l9-4.5" />
  </Base>
);
export const IcCpu = (p: P) => (
  <Base {...p}>
    <rect x={7} y={7} width={10} height={10} rx={1} />
    <rect x={10.2} y={10.2} width={3.6} height={3.6} />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </Base>
);
export const IcFlame = (p: P) => (
  <Base {...p}>
    <path d="M12 2.5s5.5 4.8 5.5 9.7a5.5 5.5 0 0 1-11 0c0-1.9.8-3.6 1.9-5 .5 1.3 1.3 2.1 2.4 2.6C10.4 7.5 11.3 4.7 12 2.5Z" />
  </Base>
);
export const IcPanel = (p: P) => (
  <Base {...p}>
    <rect x={4.5} y={2.5} width={15} height={19} rx={1.5} />
    <path d="M8.5 6.5h2M13.5 6.5h2M8.5 10.5h2M13.5 10.5h2M8.5 14.5h7M12 21.5v-3" />
  </Base>
);
export const IcArrowLeft = (p: P) => (
  <Base {...p}>
    <path d="M19 12H5m0 0 7-7m-7 7 7 7" />
  </Base>
);
export const IcAlert = (p: P) => (
  <Base {...p}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4M12 17.2v.01" />
  </Base>
);
export const IcRefresh = (p: P) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 0 1 15.2-6.5L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.2 6.5L3 16" />
    <path d="M3 21v-5h5" />
  </Base>
);
export const IcInfo = (p: P) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={9} />
    <path d="M12 8h.01M12 11v5" />
  </Base>
);
export const IcDatabase = (p: P) => (
  <Base {...p}>
    <ellipse cx={12} cy={5.5} rx={8} ry={3} />
    <path d="M4 5.5V18.5c0 1.7 3.6 3 8 3s8-1.3 8-3V5.5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Base>
);
export const IcGear = (p: P) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={3.2} />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
  </Base>
);
export const IcSun = (p: P) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={4} />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </Base>
);
export const IcMoon = (p: P) => (
  <Base {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Base>
);
export const IcTruck = (p: P) => (
  <Base {...p}>
    <path d="M1.5 6h13v10h-13zM14.5 9h4l3 3v4h-7" />
    <circle cx={6} cy={17.5} r={1.8} />
    <circle cx={17.5} cy={17.5} r={1.8} />
  </Base>
);
export const IcWand = (p: P) => (
  <Base {...p}>
    <path d="m5 19 9-9M17 3l.7 2.3L20 6l-2.3.7L17 9l-.7-2.3L14 6l2.3-.7L17 3ZM7 3l.5 1.5L9 5l-1.5.5L7 7l-.5-1.5L5 5l1.5-.5L7 3ZM19 13l.5 1.5L21 15l-1.5.5L19 17l-.5-1.5L17 15l1.5-.5L19 13Z" />
  </Base>
);
export const IcWrench = (p: P) => (
  <Base {...p}>
    <path d="M14.5 6.5a4 4 0 0 0 5 5L13 18l-3 3a2.1 2.1 0 0 1-3-3l3-3 6.5-6.5a4 4 0 0 0-5-5l2.5 2.5-1.5 1.5-2.5-2.5Z" />
  </Base>
);
export const IcTable = (p: P) => (
  <Base {...p}>
    <rect x={3} y={4} width={18} height={16} rx={1.5} />
    <path d="M3 9.5h18M3 15h18M9.5 9.5V20M16 9.5V20" />
  </Base>
);
