/**
 * A ZIP WRITER, in about a hundred lines.
 *
 * The recording studio has to hand back a folder of audio files, and a folder
 * is a zip. Every library that does this is larger than the feature, needs a
 * worker to stay off the main thread, and would be the only dependency in the
 * app that exists for a tool the child never opens.
 *
 * So: STORE only, no deflate. Audio is already compressed (Opus or AAC) and
 * would not shrink anyway, which makes the honest implementation also the
 * fastest one — every byte is copied exactly once.
 *
 * Format: PKZIP APPNOTE 6.3.2, local headers + central directory + EOCD, all
 * little-endian. UTF-8 names are flagged (bit 11) so Hebrew would survive,
 * though every name we write is ASCII by construction.
 */

export interface ZipEntry {
  /** Path inside the archive, e.g. "audio/letter-name-A.webm". */
  name: string;
  /**
   * Backed by a real ArrayBuffer (what `new Uint8Array(await blob
   * .arrayBuffer())` gives you) — Blob refuses a SharedArrayBuffer view, and
   * saying so here turns that into a compile error rather than a runtime one.
   */
  data: Uint8Array<ArrayBuffer>;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array<ArrayBufferLike>): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, the only timestamp a plain zip entry carries. */
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function zip(entries: readonly ZipEntry[], now = new Date()): Blob {
  const enc = new TextEncoder();
  const { time, date } = dosTime(now);
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const sum = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header
    lv.setUint16(4, 20, true); //          version needed
    lv.setUint16(6, 0x0800, true); //      UTF-8 names
    lv.setUint16(8, 0, true); //           method 0 = store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, sum, true);
    lv.setUint32(18, size, true); //       compressed
    lv.setUint32(22, size, true); //       uncompressed
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); //          no extra field
    local.set(name, 30);

    parts.push(local, entry.data);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); // central directory header
    dv.setUint16(4, 20, true); //          version made by
    dv.setUint16(6, 20, true); //          version needed
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, time, true);
    dv.setUint16(14, date, true);
    dv.setUint32(16, sum, true);
    dv.setUint32(20, size, true);
    dv.setUint32(24, size, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true); //     offset of the local header
    dir.set(name, 46);
    central.push(dir);

    offset += local.length + size;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

/** Hand a blob to the browser as a download. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
