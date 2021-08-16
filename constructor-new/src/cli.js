import { Command } from "commander";

const program = new Command();

// TODO: Update options to log by default, with:
// - "quiet (q)" for nothing but warnings and errors
// - "debug (d)" for debug logging
// - maybe an extra "verbose (v)" for trace logging

program
  .option("-d, --debug", "output extra debugging")
  .option("-b, --browser", "visible browser window for scraping")
  .parse();

const testMode = process.env.NODE_ENV === "test";

export const options = { ...program.opts(), testMode };
