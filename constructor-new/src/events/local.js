import { promises as fsPromises } from "fs";

import logger from "../logger.js";

export const getLocalEvents = async () => {
  const filename = "../../data/explicitIcalUrls.json";

  logger.info("Reading local iCal URLs from JSON: " + filename);

  // TODO: Error handling
  const json = await fsPromises.readFile(new URL(filename, import.meta.url));
  const parsed = JSON.parse(json.toString());
  return parsed.map((item) => ({ url: item.url, source: item.source }));
};
