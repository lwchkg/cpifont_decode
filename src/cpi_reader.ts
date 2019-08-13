class FontFileHeader {
  constructor() {
    this.id0 = 0;
    this.id = "";
    this.reserved = "";
    this.pnum = -1;
    this.ptyp = -1;
    this.fih_offset = -1;
    this.num_codepages = -1;
  }

  id0: number; /* 0: 0xff */
  id: string; /* 1-7: "FONT   " */
  reserved: string; /* 8-15: 0 */
  pnum: number; /* 16-17: number of pointers: 1 */
  ptyp: number; /* 18: type of pointers: 1 */
  fih_offset: number; /* 19-22: file offset of FontInfoHeader: 0x17 */
  num_codepages: number; /* 23-24 */
} /* 0-22 */

class CPEntryHeader {
  constructor() {
    this.cpeh_size = -1;
    this.next_cpeh_offset = -1;
    this.device_type = -1;
    this.device_name = "";
    this.codepage = -1;
    this.reserved = "";
    this.cpih_offset = -1;
  }

  cpeh_size: number; /* 25-26: size of this header: 28 */
  next_cpeh_offset: number; /* 27-30: offset of next header; 0 or -1 for last */
  device_type: number; /* 31-32: 1: screen, 2: printer */
  device_name: string; /* 33-40: e.g. "EGA     " */
  codepage: number; /* 41-42: 0, 437, 737, 85[0257], 86[013569], ... */
  reserved: string; /* 43-48: 0 */
  cpih_offset: number; /* 49-52: pointer to CPInfoHeader or 0 */
} /* 25-52, but actual offset may change */

class CPInfoHeader {
  constructor() {
    this.version = 0;
    this.num_fonts = -1;
    this.size = -1;
  }

  version: number; /* 53-54: 1: FONT, 2: DRFONT */
  num_fonts: number; /* 55-56 */
  size: number; /* 57-58: length of font data (for each font???) */
} /* 53-58, but actual offset may change */

class ScreenFontHeader {
  constructor() {
    this.height = 0;
    this.width = 0;
    this.reserved = -1;
    this.num_chars = 0;
  }

  height: number; /* 59: one of 6, 8, 14, 16 */
  width: number; /* 60: 8 */
  reserved: number; /* 61-62: 0 */
  num_chars: number; /* 63-64: 256 */
} /* 59-64, but actual address may change */

class ScreenFont {
  constructor() {
    this.header = new ScreenFontHeader();
    this.content = null;
  }

  header: ScreenFontHeader;
  content: Buffer;
}

class CodePageInfo {
  constructor() {
    this.entryHeader = new CPEntryHeader();
    this.infoHeader = new CPInfoHeader();
    this.fonts = [];
  }

  entryHeader: CPEntryHeader;
  infoHeader: CPInfoHeader;
  fonts: ScreenFont[];
}

class CodePagePublicInfo {
  constructor(deviceName: string, codepage: number, numFonts: number) {
    this.deviceName = deviceName;
    this.codepage = codepage;
    this.numFonts = numFonts;
  }

  deviceName: string;
  codepage: number;
  numFonts: number;
}

class FontInfo {
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  width: number;
  height: number;
}

export class FontReader {
  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.file_header = new FontFileHeader();
    this.codepages = [];

    let offset = this.ReadFileHeader();
    for (let i: number = 0; i < this.file_header.num_codepages; ++i)
      offset = this.ReadCodePage(offset);
  }

  GetCodePages(): CodePagePublicInfo[] {
    return this.codepages.map(
      value =>
        new CodePagePublicInfo(
          value.entryHeader.device_name,
          value.entryHeader.codepage,
          value.infoHeader.num_fonts
        )
    );
  }

  GetFontInfo(codepageIndex: number, fontIndex: number): FontInfo {
    const font: ScreenFont = this.codepages[codepageIndex].fonts[fontIndex];
    if (!font) throw "Invalid fontIndex.";
    return new FontInfo(font.header.width, font.header.height);
  }

  GetChar(codepageIndex: number, fontIndex: number, charIndex: number): Buffer {
    if (charIndex < 0 || charIndex > 255) throw "Invalid charIndex.";
    const font: ScreenFont = this.codepages[codepageIndex].fonts[fontIndex];
    if (!font) throw "Invalid fontIndex.";
    return font.content.slice(
      font.header.height * charIndex,
      font.header.height * (charIndex + 1)
    );
  }

  private ReadFileHeader(): number {
    const header = this.file_header;

    header.id0 = this.buffer.readUInt8(0);
    if (header.id0 !== 255) throw "Invalid FontFileHeader.id0. Expected 0xff.";

    header.id += this.buffer.toString("ascii", 1, 8);
    if (header.id !== "FONT   ")
      throw 'Invalid FontFileHeader.id. Expected "FONT   ".';

    header.reserved += this.buffer.toString("ascii", 8, 16);
    if (header.reserved !== "\0\0\0\0\0\0\0\0")
      console.log(
        "WARNING: unknown FontFileHeader.reserved. Expected 0x0000000000000000."
      );

    header.pnum = this.buffer.readInt16LE(16);
    if (header.pnum !== 1)
      console.log("WARNING: unknown FontFileHeader.pnum. Expected 0x0001.");

    header.ptyp = this.buffer.readUInt8(18);
    if (header.ptyp !== 1)
      console.log("WARNING: unknown FontFileHeader.ptyp. Expected 0x0001.");

    header.fih_offset = this.buffer.readInt32LE(19);
    if (header.fih_offset < 0 || header.fih_offset >= this.buffer.length)
      throw "Invalid FontFileHeader.fih_offset. Expect a pointer to a position in the file.";

    header.num_codepages = this.buffer.readInt16LE(23);
    if (header.num_codepages <= 0)
      throw "Invalid FontFileHeader.num_codepages. Expect a positive number.";

    Object.freeze(header);

    return header.fih_offset + 2;
  }

  private ReadCodePage(offset: number): number {
    if (offset <= 0) throw "ReadCodePage: invalid offset.";

    const codepage: CodePageInfo = new CodePageInfo();

    // Read CPEntryHeader.
    const entry = codepage.entryHeader;

    entry.cpeh_size = this.buffer.readInt16LE(offset);
    if (entry.cpeh_size !== 26 && entry.cpeh_size !== 28)
      throw "Invalid CPEntryHeader.cpeh_size. Expect 0x1c or 0x1a.";

    entry.next_cpeh_offset = this.buffer.readInt32LE(offset + 2);
    if (
      entry.next_cpeh_offset !== -1 &&
      entry.next_cpeh_offset !== 0 &&
      entry.next_cpeh_offset < offset + entry.cpeh_size
    )
      throw "Invalid CPEntryHeader.cpeh_size. Expect to be larger than current offset or 0 or -1";
    else if (entry.next_cpeh_offset === 0) entry.next_cpeh_offset = -1;

    entry.device_type = this.buffer.readInt16LE(offset + 6);
    if (entry.device_type === 2) console.log("INFO: printer font ignored.");
    else if (entry.device_type !== 1)
      throw "Invalid CPEntryHeader.device_type. Expect 1 or 2.";

    entry.device_name = this.buffer.toString("ascii", offset + 8, offset + 16);
    if (entry.device_name.length !== 8)
      throw "Invalid device_name. Expect an 8-character string.";

    entry.codepage = this.buffer.readUInt16LE(offset + 16);

    entry.reserved = this.buffer.toString("ascii", offset + 18, offset + 24);
    if (entry.reserved !== "\0\0\0\0\0\0")
      console.log(
        "WARNING: unknown CPEntryHeader.reserved. Expected 0x000000000000."
      );

    entry.cpih_offset =
      entry.cpeh_size == 28
        ? this.buffer.readInt32LE(offset + 24)
        : this.buffer.readInt16LE(offset + 24);
    if (entry.cpih_offset < offset + entry.cpeh_size)
      throw "Invalid CPEntryHeader.cpih_offset. Expect to be at " +
        (offset + entry.cpeh_size);
    else if (entry.cpih_offset > offset + entry.cpeh_size)
      console.log(
        "WARNING: CPEntryHeader.cpih_offset not immediately after CPEntryHeader."
      );
    // End of read CPEntryHeader.

    // Terminate if not a screen font.
    if (entry.device_type !== 1) return entry.next_cpeh_offset;

    const infoOffset: number = entry.cpih_offset;
    const info = codepage.infoHeader;

    info.version = this.buffer.readInt16LE(infoOffset);
    if (info.version !== 1) throw "Invalid CPInfoHeader.version. Expect 0x01.";

    info.num_fonts = this.buffer.readInt16LE(infoOffset + 2);
    if (info.num_fonts <= 0)
      throw "Invalid CPInfoHeader.num_fonts. Expect a positive integer.";

    info.size = this.buffer.readInt16LE(infoOffset + 4);
    if (info.size <= 0)
      throw "Invalid CPInfoHeader.size. Expect a positive integer.";
    // End of read CPInfoHeader.

    this.ReadFonts(codepage);

    Object.freeze(codepage);
    Object.freeze(codepage.entryHeader);
    Object.freeze(codepage.infoHeader);
    Object.freeze(codepage.fonts);

    this.codepages.push(codepage);
    return entry.next_cpeh_offset;
  }

  private ReadFonts(codepage: CodePageInfo) {
    const cpOffset: number = codepage.entryHeader.cpih_offset;
    const num_fonts: number = codepage.infoHeader.num_fonts;
    const codepageBuffer: Buffer = this.buffer.slice(
      cpOffset + 6,
      cpOffset + 6 + codepage.infoHeader.size
    );

    let offset: number = 0;
    for (let i: number = 0; i < num_fonts; ++i) {
      const font: ScreenFont = new ScreenFont();

      font.header.height = codepageBuffer.readInt8(offset);
      if (![8, 14, 16].includes(font.header.height))
        throw "Invalid ScreenFontHeader.height. Expected 8, 14, or 16.";

      font.header.width = codepageBuffer.readInt8(offset + 1);
      if (font.header.width !== 8)
        throw "Invalid ScreenFontHeader.width. Expected 8.";

      font.header.reserved = codepageBuffer.readInt16LE(offset + 2);
      if (font.header.reserved !== 0)
        console.log("WARNING: unknown ScreenFontHeader.reserved. Expected 0.");

      font.header.num_chars = codepageBuffer.readInt16LE(offset + 4);
      if (font.header.num_chars !== 256)
        throw "Invalid ScreenFontHeader.num_chars. Expected 256.";

      const size =
        (font.header.height * font.header.width * font.header.num_chars) >> 3;
      font.content = codepageBuffer.slice(offset + 6, offset + 6 + size);

      Object.freeze(font.header);

      codepage.fonts.push(font);

      offset += 6 + size;
    }
  }

  private buffer: Buffer;
  private file_header: FontFileHeader;
  private codepages: CodePageInfo[];
}

export default FontReader;
