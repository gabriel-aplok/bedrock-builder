import { createRequire } from "node:module";
import { decodePng } from "./lib/png-decode.mjs";
import { encodeTga } from "./lib/tga-encode.mjs";

const SOURCE_ENDINGS = new Set([".png", ".jpg", ".jpeg"]);

function isPackIcon(rel) {
  return rel.split("/").pop().toLowerCase() === "pack_icon.png";
}

function isTextureSource(rel) {
  const path = rel.toLowerCase();
  if (isPackIcon(rel)) return false;
  for (const ending of SOURCE_ENDINGS) {
    if (path.endsWith(ending)) return true;
  }
  return false;
}

function tgaDest(dst) {
  const cut = dst.lastIndexOf(".");
  return cut < 0 ? `${dst}.tga` : `${dst.slice(0, cut)}.tga`;
}

function decodeSource(content, rel) {
  if (rel.toLowerCase().endsWith(".png")) return decodePng(content);
  const { decode: decodeJpg } = createRequire(import.meta.url)("jpeg-js");
  const decoded = decodeJpg(Buffer.from(content), { useTArray: true });
  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8Array(decoded.data),
  };
}

export default {
  name: "texture-tga",
  match: (file) => isTextureSource(file.rel),
  remap: (file) => tgaDest(file.dst),
  transform: (content, file) => encodeTga(decodeSource(content, file.rel)),
};
