import axios from "axios";
import ical from "ical";

import logger from "../../logger.js";

export const fetchICS = async (url, options) => {
  logger.debug("Loading ICS from", url);
  try {
    const response = await axios.get(url);
    const icalData = ical.parseICS(response.data);
    return icalData;
  } catch (err) {
    if (options?.throwOnError) {
      throw err;
    } else {
      logger.warn("Failed to load ICS from", url);
      return null;
    }
  }
};
