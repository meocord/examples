# Moderation bot

A Discord bot built with [MeoCord](https://meocord.dev) that lets a server's moderators warn, time out and ban members,
and keeps a log of every case in SQLite.

- `/mod warn` records a warning at once. `/mod timeout` and `/mod ban` ask the moderator to confirm first, privately,
  and act only on **Confirm**; a second click, or one after **Cancel**, finds the case already handled.
- `/mod case` shows a case, and completes its number from the server's cases as you type.
- Right-click a member, then **Apps › Cases**, to list their cases. Right-click a message, then **Apps › Warn author**,
  to warn whoever wrote it, with a link to the message.
- A moderator can act only on members below their own highest role, and only on members below the bot's. `/mod ban`
  also needs **Ban Members**. Each is refused up front, with the reason, before anything is proposed.
- When Discord refuses an action anyway, as when the bot's role has lost the permission or the member has left, the
  moderator is told why in plain words, and the case records that it didn't happen.

Cases are kept in a SQLite file, so they, and a proposal waiting for its moderator's answer, outlast a restart.

## What it shows

| Feature                                                                                                   | Where                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subcommands, each with its own handler, under one builder with default member permissions                 | [`mod.builder.ts`](src/moderation/mod.builder.ts), [`mod.controller.ts`](src/moderation/mod.controller.ts); [Subcommands](https://meocord.dev/docs/latest/subcommands)     |
| A guard that reads a fact about its handler, `@RequirePermission(BanMembers)`, made with `createMetadata` | [`guards.ts`](src/moderation/guards.ts); [Guards](https://meocord.dev/docs/latest/guards)                                                                                  |
| A guard that compares the moderator's, the bot's and the member's highest roles                           | `HierarchyGuard` in [`guards.ts`](src/moderation/guards.ts); [Guards](https://meocord.dev/docs/latest/guards)                                                              |
| User and message context menus                                                                            | [`mod.builder.ts`](src/moderation/mod.builder.ts), [`mod.controller.ts`](src/moderation/mod.controller.ts); [Context menus](https://meocord.dev/docs/latest/context-menus) |
| Confirmation buttons on a typed route, `mod/{ownerId}/{case:int}/{action:confirm\|cancel}`                | `answer` in [`mod.controller.ts`](src/moderation/mod.controller.ts); [Components](https://meocord.dev/docs/latest/components)                                              |
| Autocomplete for an integer option                                                                        | `completeCase` in [`mod.controller.ts`](src/moderation/mod.controller.ts); [Autocomplete](https://meocord.dev/docs/latest/autocomplete)                                    |
| An exception filter that turns Discord's refusal into words a moderator can act on                        | [`discord-refusal.filter.ts`](src/moderation/discord-refusal.filter.ts); [Exception filters](https://meocord.dev/docs/latest/exception-filters)                            |
| A database provided under a token before login and closed as the bot stops, and a store that injects it   | [`database.provider.ts`](src/database/database.provider.ts), [`case.store.ts`](src/cases/case.store.ts); [A database](https://meocord.dev/docs/latest/recipes/database)    |
| A pending case taken once, with one `UPDATE … WHERE status = 'pending' RETURNING`                         | `take` in [`case.store.ts`](src/cases/case.store.ts); [A moderation command](https://meocord.dev/docs/latest/recipes/moderation)                                           |
| Tests of the whole app through `dispatch`, over a real SQLite database, a restart included                | [`moderation.spec.ts`](src/moderation/moderation.spec.ts); [Testing](https://meocord.dev/docs/latest/testing)                                                              |

## Setup

1. In the [Discord developer portal](https://discord.com/developers/applications), create an application with a bot,
   and invite it to your server with the `bot` and `applications.commands` scopes. It needs no privileged intents.
2. Give the bot **Moderate Members**, to time members out, and **Ban Members**, to ban them. It needs no other
   permission: it answers moderators through the interactions themselves. In **Server Settings › Roles**, drag the
   bot's role above the roles of the members it should moderate; Discord refuses to act on anyone ranked at or above
   it.
3. `/mod` and the two Apps entries show only to members with **Moderate Members**. A server's admins can change that
   under **Server Settings › Integrations**; the bot checks every action itself either way.
4. Copy the example environment file, and fill it in:

   ```shell
   cp .env.example .env
   ```

   `DISCORD_TOKEN` is your bot's token. `MODERATION_DB` is where the case log is kept, `moderation.db` in the working
   directory unless set. `.env` and the database are gitignored: never commit a real token. If one is pushed, reset it
   in the developer portal rather than rewriting history.

## The database

The case log uses `node:sqlite`, which ships with Node.js, so there's nothing to compile or install.

- **Node.js 22.13 and later 22.x** print one warning as the bot starts, "SQLite is an experimental feature and might
  change at any time". It's Node's to give, and the bot works the same.
- **Node.js 24 and 26** print no warning.
- **Bun** runs it too.

A driver with a compiled binary, such as `better-sqlite3`, works in the same place with
[self-contained builds](https://meocord.dev/docs/latest/self-contained-builds), which pack it into `dist`.

## Running

```shell
npm run start:dev    # watch mode, rebuilds and restarts on change
npm run start:prod   # production
```

The bot registers its commands when it starts: globally in production, and to the server in `DEV_GUILD_ID`, when set,
under `start:dev`, where changes show at once.

## Testing

```shell
npm test
```

The tests build the whole app with `MeoCordTestingModule.fromApp`, over a real SQLite database in memory, and send it
interactions with `dispatch`, as Discord would.
