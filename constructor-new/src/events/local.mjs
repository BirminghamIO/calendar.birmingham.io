import { promises as fsPromises } from "fs";

import logger from "../logger.mjs";

export const getLocalEvents = async () => {
  const filename = "../data/explicitIcalUrls.json";
  const fileUrl = new URL(filename, import.meta.url);

  logger.info("Reading local iCal URLs from JSON: " + filename);

  // TODO: Error handling
  const json = await fsPromises.readFile(fileUrl);
  const parsed = JSON.parse(json.toString());
  return parsed.map((item) => ({ url: item.url, source: item.source }));
};
