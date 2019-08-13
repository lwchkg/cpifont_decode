import program from "commander";
import { RenderFont } from "./font_renderer";

program
  .version("1.0.0")
  .description("Decode MS-DOS or Linux CPI font file to an image.")
  .option("-i, --input-file <file>", "Set the input file.")
  .option("-o, --output-file <file>", "Set the output file.")
  .parse(process.argv);

const options = program.opts();

if (options.inputFile === undefined || options.outputFile.undefined)
  program.help();

RenderFont(program.inputFile, program.outputFile);
