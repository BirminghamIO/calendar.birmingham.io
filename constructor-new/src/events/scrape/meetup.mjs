import queryString from "query-string";
import puppeteer from "puppeteer";

import logger from "../../logger.mjs";
import { options } from "../../cli.mjs";

const baseUrl = "https://www.meetup.com/find";
const searchParams = {
  allMeetups: "true",
  distance: "twoMiles",
  userFreeform: "Birmingham, United Kingdom",
  mcName: "Birmingham, England, GB",
  sort: "recommended",
  keywords: "tech",
};

const url = `${baseUrl}?${queryString.stringify(searchParams)}`;

// Use puppeteer to load 'find' page and search correct location
export default async () => {
  logger.debug("Scraping Meetup:", url);

  const browser = await puppeteer.launch({
    headless: !options.browser,
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });

    // Search for Birmingham
    await page.focus("#location-bar-in-search");
    await page.keyboard.type("Birmingham GB");

    // Click menu item
    const optionId = "#suggested-location-in-search";
    await page.waitForSelector(optionId);
    await page.click(optionId);

    // Wait until loading has stopped
    await page.waitForSelector('div[data-testid="results-loading-block"]', { hidden: true });

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
