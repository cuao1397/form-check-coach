// 올라온 영상 파일이 정말 MP4/MOV 모양인지, 길이가 몇 초인지 서버에서 직접 확인해요.
// 이름이나 브라우저가 알려 준 형식만 믿지 않기 위한 검사예요. (영상 내용을 해석하지는 않아요)

const BOX_AT_START = ["ftyp", "moov", "mdat", "wide", "free", "skip"];
const MAX_MOOV_BYTES = 16 * 1024 * 1024; // 이보다 큰 메타 정보는 읽지 않아요

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

/** 파일 맨 앞 12바이트가 MP4/MOV 파일의 시작 모양인지 확인해요 */
export function hasVideoSignature(head: Uint8Array): boolean {
  if (head.length < 12) return false;
  return BOX_AT_START.includes(ascii(head, 4, 8));
}

/** 'moov' 상자 안에서 mvhd를 찾아 영상 길이(초)를 구해요. 못 읽으면 null */
export function parseMoovSeconds(moov: Uint8Array): number | null {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  let offset = 0;
  while (offset + 8 <= moov.length) {
    let size = view.getUint32(offset);
    const type = ascii(moov, offset + 4, offset + 8);
    if (size === 0) size = moov.length - offset;
    if (size < 8) return null;
    if (type === "mvhd") {
      const body = offset + 8;
      const version = moov[body];
      if (version === 1) {
        if (body + 32 > moov.length) return null;
        const timescale = view.getUint32(body + 20);
        const duration = Number(view.getBigUint64(body + 24));
        return timescale > 0 ? duration / timescale : null;
      }
      if (body + 20 > moov.length) return null;
      const timescale = view.getUint32(body + 12);
      const duration = view.getUint32(body + 16);
      return timescale > 0 ? duration / timescale : null;
    }
    offset += size;
  }
  return null;
}

/**
 * 파일의 맨 바깥 상자들을 따라가 'moov'를 찾고 영상 길이(초)를 읽어요.
 * 읽을 수 없으면(특이한 구조 등) null을 돌려주고, 그 경우는 막지 않아요.
 */
export async function readVideoSeconds(file: Blob): Promise<number | null> {
  let offset = 0;
  for (let i = 0; i < 64 && offset + 8 <= file.size; i++) {
    const header = new Uint8Array(await file.slice(offset, offset + 16).arrayBuffer());
    if (header.length < 8) return null;
    const view = new DataView(header.buffer);
    let size = view.getUint32(0);
    const type = ascii(header, 4, 8);
    let headerSize = 8;
    if (size === 1) {
      if (header.length < 16) return null;
      size = Number(view.getBigUint64(8));
      headerSize = 16;
    } else if (size === 0) {
      size = file.size - offset;
    }
    if (size < headerSize) return null;
    if (type === "moov") {
      const payload = size - headerSize;
      if (payload > MAX_MOOV_BYTES) return null;
      const moov = new Uint8Array(
        await file.slice(offset + headerSize, offset + size).arrayBuffer(),
      );
      return parseMoovSeconds(moov);
    }
    offset += size;
  }
  return null;
}
