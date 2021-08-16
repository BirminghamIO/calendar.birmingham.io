import cheerio from "cheerio";
import puppeteer from "puppeteer";
import queryString from "query-string";

import { options } from "../cli.js";
import logger from "../logger.js";
import { fetchICS } from "./helpers/fetchICS.js";

export const getMeetupEvents = async (html) => {
  html = html || (await meetupScrape());

  const $ = cheerio.load(html);

  const icsUrls = $('a[id="event-card-in-search-results"]')
    .toArray()
    .map((e) => $("time[datetime]", e))
    .filter((e) => e)
    // TODO: Find outer link in a cleaner & more flexible way
    // Not sure we actually need to check for the `time` element - could just look for the `a` and get the href?
    .map((e) => e.parent().parent().parent().parent().parent()["0"].attribs.href)
    .map((href) => `${href}/ical`);

  const icsDatas = await Promise.all(icsUrls.map(async (url) => await fetchICS(url)));

  return icsDatas.filter((x) => x).map((icsData) => ({ source: "meetup", icsData }));
};

// Meetup scraping with puppeteer ⬇

const searchUrl = `https://www.meetup.com/find?${queryString.stringify({
  allMeetups: "true",
  distance: "twoMiles",
  userFreeform: "Birmingham, United Kingdom",
  mcName: "Birmingham, England, GB",
  sort: "recommended",
  // TODO: Rather than using "tech" keyword, select the Technology category in search options
  keywords: "tech",
})}`;

// Use puppeteer to load 'find' page and search correct location
const meetupScrape = async () => {
  logger.debug("Scraping Meetup:", searchUrl);

  const browser = await puppeteer.launch({
    headless: !options.browser,
  });

  try {
    const page = await browser.newPage();
    await page.goto(searchUrl, { waitUntil: "networkidle0" });

    // Search for Birmingham
    await page.focus("#location-bar-in-search");
    await page.keyboard.type("Birmingham GB");

    // Click menu item
    const optionId = "#suggested-location-in-search";
    await page.waitForSelector(optionId);
    await page.click(optionId);

    // Wait until loading has stopped
    const loadingSelector = 'div[data-testid="results-loading-block"]';
    await page.waitForSelector(loadingSelector, { hidden: true });

    // Wait for results (or the "no results" icon)
    const opt = { timeout: 5000, visible: true };
    await Promise.race([
      page.waitForSelector('a[id="event-card-in-search-results"]', opt).catch(),
      page.waitForSelector('img[alt="empty results icon"]', opt).catch(),
    ]);

    // Return page HTML
    // We need to `await` this line to avoid closing the browser too early
    return await page.content();
  } finally {
    logger.debug("Close browser");
    await browser.close();
  }
};
