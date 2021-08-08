# New Calendar Constructor

## Development

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
$ node src/index.mjs -h
Usage: index [options]

Options:
  -d, --debug    output extra debugging
  -b, --browser  visible browser window for scraping
  -h, --help     display help for command
```
