Static site generator and calendar generator for calendar of [Birmingham tech events](http://calendar.birmingham.io)

Execute as `node app.js` to fetch the calendar items from all the sources and update the Google calendar.
Execute as `node createWebsite.js` to create the calendar.Birmingham.IO static website from the calendar.

Execute as `node app.js --dryrun` to fetch all the calendar items from sources and print them out, but _not_ update the Google calendar. 

`node app.js --help` will show other command options to turn on logging at various levels.
