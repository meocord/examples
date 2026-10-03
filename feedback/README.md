# Feedback bot

A Discord bot built with [MeoCord](https://meocord.dev) that collects feedback from a server's members and lets its
staff review it.

- `/feedback` opens a form. Each member can open one every five minutes; a second try is told how long to wait.
- A submitted form is posted to a review channel with **Approve** and **Reject** buttons, and the author is thanked
  privately.
- Only members with the staff role can use the buttons. A verdict marks the post, removes its buttons, and tells the
  author by direct message.

Feedback is kept in memory, so a restart forgets it. A review button left from before a restart tells the staff member
the feedback is gone.

## What it shows

| Feature                                                                                         | Where                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A slash command that opens a modal, and the modal's fields arriving in the handler's params     | [`feedback.controller.ts`](src/feedback/feedback.controller.ts); [Components](https://meocord.dev/docs/latest/components)                                           |
| A cooldown per member                                                                           | `@Cooldown` in [`feedback.controller.ts`](src/feedback/feedback.controller.ts); [Cooldowns](https://meocord.dev/docs/latest/cooldowns)                              |
| Buttons routed by a typed custom ID, `feedback/{id:int}/approve`                                | [`review.controller.ts`](src/feedback/review.controller.ts); [Components](https://meocord.dev/docs/latest/components)                                               |
| A guard on a whole controller that denies with a reason                                         | [`staff.guard.ts`](src/feedback/staff.guard.ts); [Guards](https://meocord.dev/docs/latest/guards)                                                                   |
| `@Defer`, which acknowledges a click and locks the post until the verdict is in                 | [`review.controller.ts`](src/feedback/review.controller.ts); [Deferring a response](https://meocord.dev/docs/latest/defer)                                          |
| Answers through `respond()`, and a `UserError` shown only to the user who clicked               | [`feedback.service.ts`](src/feedback/feedback.service.ts); [Responses](https://meocord.dev/docs/latest/responses)                                                   |
| A presenter that draws MeoCord's own loading and error views, and theme colours                 | [`app.presenter.ts`](src/presenters/app.presenter.ts); [Presenters](https://meocord.dev/docs/latest/presenters), [Theming](https://meocord.dev/docs/latest/theming) |
| Tests of the whole app through `MeoCordTestingModule.fromApp` and `dispatch`, with mock members | [`feedback.spec.ts`](src/feedback/feedback.spec.ts); [Testing](https://meocord.dev/docs/latest/testing)                                                             |

## Setup

1. In the [Discord developer portal](https://discord.com/developers/applications), create an application with a bot,
   and invite it to your server with the `bot` and `applications.commands` scopes. It needs no privileged intents.
2. Create a staff role, and a channel for reviews. In that channel, the bot needs **View Channel**, **Send Messages**
   and **Embed Links**, since each review is posted as an embed. It needs no other permission: it answers members
   and edits the review post through the interactions themselves, and a direct message to the author needs none.
   With **Developer Mode** on in Discord's settings, **Copy ID** on the channel and the role gives their IDs. The bot
   checks both as it starts, and stops with the name of the one that's missing or isn't an ID.
3. Copy the example environment file, and fill it in:

   ```shell
   cp .env.example .env
   ```

   `DISCORD_TOKEN` is your bot's token, `FEEDBACK_CHANNEL_ID` the review channel's ID, and `STAFF_ROLE_ID` the staff
   role's ID. `.env` is gitignored: never commit a real token. If one is pushed, reset it in the developer portal
   rather than rewriting history.

## Running

```shell
npm install
npm run start:dev    # watch mode, rebuilds and restarts on change
npm run build:prod   # a production build
npm start            # starts the last production build
```

The bot registers `/feedback` as it starts: to the server in `DEV_GUILD_ID` under `start:dev`, and globally in
production.

## Testing

```shell
npm test
npm run lint
```

The tests run the app as the bot does, with mock interactions, and no Discord connection or token.
