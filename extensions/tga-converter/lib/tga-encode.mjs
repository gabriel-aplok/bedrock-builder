const HEADER_SIZE = 18;
function encodeTga(image) {
  const { width, height, data } = image;
  if (data.length !== width * height * 4) throw new Error("tga input must be RGBA");
  const out = new Uint8Array(HEADER_SIZE + data.length);
  out[2] = 2;
  out[12] = width & 255;
  out[13] = (width >> 8) & 255;
  out[14] = height & 255;
  out[15] = (height >> 8) & 255;
  out[16] = 32;
  out[17] = 8;
  for (let y = 0; y < height; y++) {
    const srcRow = y * width * 4;
    const dstRow = HEADER_SIZE + (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 4;
      out[d] = data[s + 2];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s];
      out[d + 3] = data[s + 3];
    }
  }
  return out;
}
export { encodeTga };
