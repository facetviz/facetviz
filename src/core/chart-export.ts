/** SVG and PNG export helpers for {@link FacetViz}. */
import { Renderer } from "./renderer.js";

export function serializeSVG(
  renderer: Renderer,
  width: number,
  height: number,
): string {
  const clone = renderer.root.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  return new XMLSerializer().serializeToString(clone);
}

export function rasterizePNG(
  svg: string,
  width: number,
  height: number,
  backgroundColor: string,
  scale = 2,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const source = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d");
      if (!context) return resolve(null);
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, "image/png");
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
