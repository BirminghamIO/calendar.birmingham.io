import cheerio from "cheerio";

import meetupScrape from "./scrape/meetup.js";

export const getMeetupEvents = async (html) => {
  html = html || (await meetupScrape());

  const $ = cheerio.load(html);

  return (
    $('a[id="event-card-in-search-results"]')
      .toArray()
      .map((e) => $("time[datetime]", e))
      .filter((e) => e)
      // TODO: Find outer link in a cleaner & more flexible way
      .map((e) => e.parent().parent().parent().parent().parent()["0"].attribs.href)
      .map((href) => ({ source: "meetup", url: href + "ical/t.ics" }))
  );
};
