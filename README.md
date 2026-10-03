# MeoCord examples

Discord bots built with [MeoCord](https://github.com/meocord/meocord), each a standalone app made with
`npx meocord create <bot> --use-npm` and grown from there. Every bot is tested on each change, with the meocord
version its lockfile pins and with the newest release.

## The bots

| Bot                       | What it shows                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [feedback](feedback/)     | A feedback form staff approve or reject: responses, presenters, guards, cooldowns                                                                 |
| [moderation](moderation/) | Warnings, timeouts and bans with a SQLite case log: subcommands, context menus, autocomplete, confirmation buttons, guards on rank and permission |

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

- **CI** runs each bot with its pinned meocord and with `meocord@latest` on the newest Node LTS, with `latest` on
  Node 22.13, the oldest meocord supports, and with the `beta` release while one is newer than `latest`. Each run does
  `npm ci`, `npm run lint`, `npm test` and `npm run build:prod`, then starts the built bot with no token and with one
  Discord refuses, and checks that it exits with MeoCord's message. No real token is used. It also runs daily, so a
  new meocord release that breaks a bot shows up there first.
- **Dependabot** moves every bot to a new meocord release in one pull request.
- **Template drift**, weekly, compares each bot's tooling and config with what `meocord create` generates today. A
  difference a bot means to keep is accepted in [`template-drift.json`](template-drift.json) with the reason: a new key
  in `.env.example`, a package.json field by its path, or any other file's exact diff by its hash. Anything else fails
  the run, which shows the diff and the entry to add if the difference is intended. Run it yourself with
  `node scripts/template-drift.mjs --check`.

## Adding a bot

1. `npx meocord create <bot> --use-npm` at the repository's root, and commit it as generated.
2. Build the bot in its own folder, with its README and tests.
3. Add its folder to the npm entry's `directories` in `.github/dependabot.yml`; CI fails until it's there.
4. Accept in `template-drift.json` what it changes in the template's files on purpose, as
   `node scripts/template-drift.mjs --check <bot>` shows.
5. If it checks settings from `.env` as it starts, give each one a made-up value in `scripts/smoke-env.json`, so the
   start check reaches the token.

## License

[MIT](LICENSE)
