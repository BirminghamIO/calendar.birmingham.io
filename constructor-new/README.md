# New Calendar Constructor

## Development Plan

### Features

- [x] Get events from local file
- [x] Get events from Meetup
- [x] Get events from Eventbrite
- [ ] De-duplicate
- [ ] Save to Google calendar

### Other

- [ ] Tests
- [ ] Logging
- [ ] Error handling

## Usage

Developed with Node v14. Users of [`nvm`](https://github.com/nvm-sh/nvm) can run `nvm use` to pick up the version from `.nvmrc`.

Install dependencies:

```bash
npm install
```

Run CLI:

```
$ node src/index.js -h
Usage: index [options]

Options:
  -d, --debug    output extra debugging
  -b, --browser  visible browser window for scraping
  -h, --help     display help for command
```

You can also run the CLI with `npm start -- <options>`, e.g. for debug mode:

```bash
npm start -- -d
```

## Testing

Using [ava](https://github.com/avajs/ava) test runner, and [sinon](https://github.com/sinonjs/sinon) for mocking/stubs

To run the tests:

```
npm test
```

## Events Data

Events are sourced from:

- A local list of iCal URLs - [json](https://github.com/BirminghamIO/calendar.birmingham.io/blob/constructor-new/constructor-new/data/explicitIcalUrls.json)
- Eventbrite events from a collection of organisers - [json](https://github.com/BirminghamIO/calendar.birmingham.io/blob/constructor-new/constructor-new/data/explicitEventBriteOrganisers.json)
- Meetup.com for local events in the technology category
