import consola from "consola";

import { options } from "./cli.js";

let logLevel = consola.LogLevel.Log;
if (options.debug) logLevel = consola.LogLevel.Debug;
if (options.testMode) logLevel = consola.LogLevel.Error;

const logger = consola.create({
  level: logLevel,
  reporters: [new consola.FancyReporter()],
});

logger.start("");
logger.debug("Options:");
Object.entries(options).forEach(([key, value]) => logger.debug(`  ${key}:`, value));
logger.debug("");

export default logger;
