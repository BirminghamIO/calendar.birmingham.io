import consola from "consola";

import { options } from "./cli.js";

const logger = consola.create({
  level: options.debug ? consola.LogLevel.Debug : consola.LogLevel.Log,
  reporters: [new consola.FancyReporter()],
});

logger.start("");
logger.debug("Options:");
Object.entries(options).forEach(([key, value]) => logger.debug(`  ${key}:`, value));
logger.debug("");

export default logger;
