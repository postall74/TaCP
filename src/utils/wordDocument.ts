interface WordImagePart {
  location: string;
  base64: string;
}

const wordStyles = `body{font-family:'Times New Roman',Times,serif;font-size:12.5px;color:#171717;line-height:1.45;margin:0}
@page WordSection1{size:595.3pt 841.9pt;margin:28.35pt 25.5pt}
.WordSection1{page:WordSection1}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #8a8a8a;padding:5px 8px;font-size:12px}
h1{font-size:19px}h3{font-size:13.5px}
.door-drawing-sheet{page-break-before:always;padding-top:2mm}
.door-drawing-figure,.door-drawing-table tr{page-break-inside:avoid}
.door-drawing-table thead{display:table-header-group}
.door-drawing-figure img{display:block;width:100%;height:auto}`;

const wrapBase64 = (value: string) => value.match(/.{1,76}/g)?.join("\r\n") ?? "";

const utf8Base64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const rasterizeSvg = async (svg: SVGSVGElement) => {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = svg.viewBox.baseVal;
  const width = Math.max(1, viewBox.width || svg.clientWidth || 680);
  const height = Math.max(1, viewBox.height || svg.clientHeight || 560);
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));

  const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Не удалось подготовить размерный вид для Word."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const renderWidth = Math.ceil(width * 2);
    const renderHeight = Math.ceil(height * 2);
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Браузер не поддерживает подготовку изображения для Word.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, renderWidth, renderHeight);
    context.drawImage(image, 0, 0, renderWidth, renderHeight);
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
};

export async function buildWordDocumentWithDoorDrawings(root: HTMLElement, title: string) {
  const clone = root.cloneNode(true) as HTMLElement;
  const sourceSvgs = [...root.querySelectorAll<SVGSVGElement>(".door-drawing-figure svg")];
  const clonedSvgs = [...clone.querySelectorAll<SVGSVGElement>(".door-drawing-figure svg")];
  if (sourceSvgs.length === 0 || sourceSvgs.length !== clonedSvgs.length) {
    throw new Error("Размерный лист для Word не найден.");
  }

  const images: WordImagePart[] = [];
  for (let index = 0; index < sourceSvgs.length; index += 1) {
    const raster = await rasterizeSvg(sourceSvgs[index]);
    const location = `word-media/door-drawing-${index + 1}.png`;
    const image = document.createElement("img");
    image.src = location;
    image.alt = sourceSvgs[index].getAttribute("aria-label") ?? `Размерный вид дверцы ${index + 1}`;
    image.width = raster.width;
    image.height = raster.height;
    image.style.width = "100%";
    image.style.height = "auto";
    clonedSvgs[index].replaceWith(image);
    images.push({ location, base64: raster.dataUrl.slice(raster.dataUrl.indexOf(",") + 1) });
  }

  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${wordStyles}</style></head><body><div class="WordSection1">${clone.innerHTML}</div></body></html>`;
  const boundary = `----=_TkpPro_${Date.now().toString(16)}`;
  const parts = [
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "Content-Location: document.html",
    "",
    wrapBase64(utf8Base64(html)),
    ...images.flatMap((image) => [
      `--${boundary}`,
      "Content-Type: image/png",
      "Content-Transfer-Encoding: base64",
      `Content-Location: ${image.location}`,
      "",
      wrapBase64(image.base64),
    ]),
    `--${boundary}--`,
    "",
  ];
  return parts.join("\r\n");
}
