import OpenGraphImage from "@/app/opengraph-image";

export const runtime = "edge";
export const alt = "What Type Of | Translator";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function TwitterImage() {
  return OpenGraphImage();
}
