import logger from "./logger.mjs";
import { getLocalEvents } from "./events/local.mjs";
import { getMeetupEvents } from "./events/meetup.mjs";
import { getEventbriteEvents } from "./events/eventbrite.mjs";

const cli = async () => {
  logger.info("Getting iCal URLs");

  const events = await Promise.all([getLocalEvents(), getMeetupEvents(), getEventbriteEvents()]);

  logger.success(events);
};

cli();
