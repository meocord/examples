import { GatewayIntentBits } from 'discord.js'
import { MeoCord } from 'meocord/decorator'
import { databaseProvider } from '@src/database/database.provider'
import { ModController } from '@src/moderation/mod.controller'
import { AppPresenter } from '@src/presenters/app.presenter'

@MeoCord({
  controllers: [ModController],
  // The case log's SQLite database, opened before the bot logs in and closed as it stops
  providers: [databaseProvider],
  // Interactions carry the members and roles the guards compare; the bot reads no messages
  clientOptions: { intents: [GatewayIntentBits.Guilds] },
  // How loading and error views look; see src/presenters/app.presenter.ts
  presenter: AppPresenter,
})
export default class App {}
