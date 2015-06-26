require("./app").createWebsite(function(err) {
    if (err) {
        logger.error("Error creating website", err);
    }
});
