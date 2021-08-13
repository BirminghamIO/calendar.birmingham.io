import logger from "./logger.js";
import { getLocalEvents } from "./events/local.js";
import { getMeetupEvents } from "./events/meetup.js";
import { getEventbriteEvents } from "./events/eventbrite.js";

const cli = async () => {
  logger.info("Getting iCal URLs");

  const events = await Promise.all([
    getLocalEvents(),
    getMeetupEvents(),
    getEventbriteEvents(),
  ]);

  logger.success(events);
};

cli();
