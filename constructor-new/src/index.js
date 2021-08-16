import fs from "fs/promises";

import logger from "./logger.js";
import { getLocalEvents, getMeetupEvents, getEventbriteEvents } from "./loaders/index.js";

const cli = async () => {
  logger.info("Getting iCal URLs");

  const events = await Promise.all([
    getLocalEvents(),
    getMeetupEvents(),
    getEventbriteEvents(),
  ]);

  await fs.writeFile("events-dump.json", JSON.stringify(events, null, 2));
  logger.debug("Events written to ./events-dump.json");
};

cli();
