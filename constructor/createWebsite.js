require("./app").createWebsite(function(err) {
    if (err) {
        console.log("Error creating website", err);
    } else {
        console.log("done!");
    }
});