import fs from "fs/promises";

import logger from "../logger.js";
import { fetchICS } from "./helpers/fetchICS.js";

export const getLocalEvents = async () => {
  const filename = "../../data/explicitIcalUrls.json";

  logger.info("Reading local iCal URLs from JSON: " + filename);

  // TODO: Error handling
  const json = await fs.readFile(new URL(filename, import.meta.url));
  const parsed = JSON.parse(json.toString());
  const calendarSources = parsed.map((item) => ({ url: item.url, source: item.source }));
  return getCalendarsFromSource(calendarSources);
};

const getCalendarsFromSource = async (calendarSources) => {
  const calendars = await Promise.all(
    calendarSources.map(async ({ url, source }) => ({
      source,
      icsData: await fetchICS(url),
    }))
  );

  return calendars.filter((x) => x.icsData);
};
