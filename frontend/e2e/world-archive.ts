import { readFileSync } from "node:fs";
import { crc32, gunzipSync } from "node:zlib";

const blockSize = 512;

// A real level.dat keeps the journey on the replacement path instead of Paper's parser.
export function readWorldArchiveEntry(archivePath: string, entryName: string): Buffer {
  const tar = gunzipSync(readFileSync(archivePath));
  for (let offset = 0; offset + blockSize <= tar.length; ) {
    const header = tar.subarray(offset, offset + blockSize);
    const name = nulTerminated(header.subarray(0, 100));
    if (name === "") break;
    const size = parseInt(nulTerminated(header.subarray(124, 136)).trim() || "0", 8);
    const body = offset + blockSize;
    const typeFlag = nulTerminated(header.subarray(156, 157));
    if (name === entryName && (typeFlag === "" || typeFlag === "0")) {
      return tar.subarray(body, body + size);
    }
    offset = body + Math.ceil(size / blockSize) * blockSize;
  }
  throw new Error(`${entryName} is missing from the world archive`);
}

// Stored entries cover the tiny valid and deliberately unsafe test archives.
export function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const bodies: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    bodies.push(local, entry.data);
    directory.push(central);
    offset += local.length + entry.data.length;
  }

  const directorySize = directory.reduce((total, record) => total + record.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...bodies, ...directory, end]);
}

function nulTerminated(field: Buffer): string {
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}
