import fs from "fs";
import { FontReader } from "./cpi_reader";
import Jimp from "jimp";

function Measure(
  font: any,
  text: string,
  width: number,
  lineSpacing: number
): number {
  return Math.round(Jimp.measureTextHeight(font, text, width) * lineSpacing);
}

function AddLine(
  image: Jimp,
  font: any,
  text: string,
  width: number,
  height: number,
  lineSpacing: number = 1
): number {
  let lineheight: number = Measure(font, text, width, lineSpacing);
  image.contain(width, height + lineheight, Jimp.VERTICAL_ALIGN_TOP);
  image.print(font, 0, height, text);
  return height + lineheight;
}

function DrawRectangle(
  image: Jimp,
  color: number,
  left: number,
  top: number,
  width: number,
  height: number
) {
  const right: number = left + width - 1;
  const bottom: number = top + height - 1;
  for (let x: number = left; x <= right; x++) {
    image.setPixelColor(color, x, top);
    image.setPixelColor(color, x, bottom);
  }
  for (let y: number = top + 1; y < bottom; y++) {
    image.setPixelColor(color, left, y);
    image.setPixelColor(color, right, y);
  }
}

function main(reader: FontReader, image: Jimp, outputFile: string) {
  Jimp.loadFont(Jimp.FONT_SANS_16_WHITE).then(font => {
    const charSpacingX: number = 8;
    const charSpacingY: number = 8;
    const boxColor: number = 0xaa4e00ff;
    const textColor: number = 0xffffffff;

    let width: number = 32 * (8 + 2) + 31 * charSpacingX;
    let height: number = 0;

    let codepages = reader.GetCodePages();
    codepages.forEach((codepage, cpIndex) => {
      const heading: string = `Device: ${codepage.deviceName.trim()}    Codepage: ${
        codepage.codepage
      }    Index: ${cpIndex}`;
      height = AddLine(image, font, heading, width, height, 1.25);

      for (
        let fontIndex: number = 0;
        fontIndex < codepage.numFonts;
        fontIndex++
      ) {
        const fontInfo = reader.GetFontInfo(cpIndex, fontIndex);
        const subHeading: string = `Codepage: ${
          codepage.codepage
        }    Font-index: ${fontIndex}    Height: ${fontInfo.height}    Width: ${
          fontInfo.width
        }`;
        height = AddLine(image, font, subHeading, width, height, 1.25);

        let x: number = 0;
        let y: number = height;
        height += (fontInfo.height + 2) * 8 + charSpacingY * 7;
        image.contain(width, height, Jimp.VERTICAL_ALIGN_TOP);
        for (let charCode: number = 0; charCode < 256; charCode++) {
          DrawRectangle(
            image,
            boxColor,
            x,
            y,
            fontInfo.width + 2,
            fontInfo.height + 2
          );

          const charBuffer: Buffer = reader.GetChar(
            cpIndex,
            fontIndex,
            charCode
          );
          for (let r: number = 0; r < fontInfo.height; r++) {
            for (let c: number = 0; c < fontInfo.width; c++) {
              if (((charBuffer[r] >> (fontInfo.width - 1 - c)) & 1) > 0)
                image.setPixelColor(textColor, x + c + 1, y + r + 1);
            }
          }

          if (charCode % 32 === 31) {
            x = 0;
            y += fontInfo.height + 2 + charSpacingY;
          } else {
            x += fontInfo.width + 2 + charSpacingX;
          }
        }
        // Add to height for spacing but do not resize yet. Spacing is added in
        // the next call to image.contain.
        height += charSpacingY;
      }
    });

    image.write(outputFile);
  });
}

export function RenderFont(inputFile: string, outputFile: string) {
  const reader = new FontReader(fs.readFileSync(inputFile));
  new Jimp(1, 1, 0x000000ff, (_err: any, image: Jimp) => {
    main(reader, image, outputFile);
  });
}
