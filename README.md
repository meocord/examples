# MeoCord examples

Discord bots built with [MeoCord](https://github.com/meocord/meocord), each a standalone app made with
`npx meocord create <bot> --use-npm` and grown from there. Every bot is tested on each change, with the meocord
version its lockfile pins and with the newest release.

## The bots

| Bot                   | What it shows                                                                     |
| --------------------- | --------------------------------------------------------------------------------- |
| [feedback](feedback/) | A feedback form staff approve or reject: responses, presenters, guards, cooldowns |

Each bot's README says what it shows and how to run it.

## Running a bot

Every bot runs the same way. You need Node.js 22.13 or newer and a bot token from the
[Discord Developer Portal](https://discord.com/developers/applications).

```shell
cd feedback
npm ci
cp .env.example .env    # then set DISCORD_TOKEN in .env
npm run start:dev
```

`.env` is ignored by git; never commit a token. [Getting started](https://meocord.dev/docs/latest/getting-started)
covers creating the Discord application and inviting the bot.

## How the bots are kept working

- **CI** runs each bot twice, with its pinned meocord and with `meocord@latest`: `npm ci`, `npm run lint`, `npm test`,
  `npm run build:prod`, then starts the built bot with no token and with one Discord refuses, and checks that it exits
  with MeoCord's message. No real token is used. It also runs daily, so a new meocord release that breaks a bot shows
  up there first.
- **Dependabot** moves every bot to a new meocord release in one pull request.
- **Template drift**, weekly, compares each bot's tooling and config with what `meocord create` generates today and
  shows the differences. Run it yourself with `node scripts/template-drift.mjs`.

## Adding a bot

1. `npx meocord create <bot> --use-npm` at the repository's root, and commit it as generated.
2. Build the bot in its own folder, with its README and tests.
3. Add its folder to the npm entry's `directories` in `.github/dependabot.yml`; CI fails until it's there.

## License

[MIT](LICENSE)
