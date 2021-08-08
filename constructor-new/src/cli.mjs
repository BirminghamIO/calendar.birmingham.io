import { Command } from "commander";

const program = new Command();

program
  .option("-d, --debug", "output extra debugging")
  .option("-b, --browser", "visible browser window for scraping")
  .parse();

export const options = program.opts();
