import fs from "fs/promises";
import cheerio from "cheerio";
import axios from "axios";
import icalGenerator from "ical-generator";
import ical from "ical";
import moment from "moment";

import logger from "../logger.js";
import { formatLocation } from "./helpers/eventLocation.js";

// TODO: Break this function apart - it's too sizey
export const getEventbriteEvents = async () => {
  const filename = "../../data/explicitEventBriteOrganisers.json";
  const eventbriteOrgsJson = await fs.readFile(new URL(filename, import.meta.url));

  const eventbriteOrgs = JSON.parse(eventbriteOrgsJson);

  const ebOrgPages = await Promise.all(
    eventbriteOrgs.map(async (org) => {
      logger.debug("Loading from Eventbrite:", org.link);

      try {
        const response = await axios.get(org.link);
        return { ...org, html: response.data };
      } catch (err) {
        logger.warn(
          `Error loading: "${org.name}" from Eventbrite. Status:`,
          err.response.status,
          "- Ignoring"
        );
      }
    })
  );

  const ebEventPagesHtml = await Promise.all(
    ebOrgPages
      .filter((p) => p)
      .map(async (eventsListPage) => {
        const $page = cheerio.load(eventsListPage.html);

        const eventContentSelector = "div.eds-event-card-content__primary-content";
        const eventLinkSelector = "a.eds-event-card-content__action-link";

        return await Promise.all(
          $page(`${eventContentSelector} > ${eventLinkSelector}`)
            .toArray()
            .map(async (linkElement) => {
              try {
                const response = await axios.get(linkElement.attribs.href);
                return response.data;
              } catch (err) {
                logger.error(err);
                return null;
              }
            })
        );
      })
  );

  const eventPagesHtmlFlat = [].concat.apply([], ebEventPagesHtml);

  const events = eventPagesHtmlFlat.map((eventPageHtml) => {
    const $ = cheerio.load(eventPageHtml);

    return {
      id: $("body").attr("data-event-id"),
      summary: $('meta[property="og:title"]').attr("content"),
      description: $('meta[property="og:description"]').attr("content"),
      start: moment($("meta[property='event:start_time']").attr("content")),
      end: moment($("meta[property='event:end_time']").attr("content")),
      location: formatLocation({
        locationText:
          $("p.listing-map-card-street-address").text().trim() ||
          $("div.event-details > div.event-details__data > p").text().trim(),
        coords: {
          lat: $('meta[property="event:location:latitude"]').attr("content"),
          lon: $('meta[property="event:location:longitude"]').attr("content"),
        },
      }),
    };
  });

  const calendar = icalGenerator({ events });

  // Stringify and parse from `ical-generator` to `ical` format
  const icsData = ical.parseICS(calendar.toString());
  return { source: "eventbrite", icsData };
};
