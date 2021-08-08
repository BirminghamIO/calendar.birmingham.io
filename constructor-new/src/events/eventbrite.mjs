import fs from "fs/promises";
import cheerio from "cheerio";
import axios from "axios";

import logger from "../logger.mjs";

export const getEventbriteEvents = async () => {
  const filename = "../data/explicitEventBriteOrganisers.json";
  const fileUrl = new URL(filename, import.meta.url);
  const eventbriteOrgsJson = await fs.readFile(fileUrl);

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
      title: $('meta[name="twitter:title"]').attr("content"),
      description: $('meta[name="twitter:description"]').attr("content"),
      start: new Date($("meta[property='event:start_time']").attr("content")),
      end: new Date($("meta[property='event:end_time']").attr("content")),
      location:
        $("p.listing-map-card-street-address").text().trim() ||
        $("div.event-details > div.event-details__data > p").text().trim(),
      lat: parseLatLong($('meta[property="event:location:latitude"]').attr("content")),
      lon: parseLatLong($('meta[property="event:location:longitude"]').attr("content")),
      uid: $("body").attr("data-event-id"),
    };
  });

  console.log(`Eventbrite events:`, events);

  // TODO: Return events as ical data
  return { source: "eventbrite", icsdata: "" };
};

const parseLatLong = (text) => {
  const result = parseFloat(text);
  return isNaN(result) ? null : result;
};
