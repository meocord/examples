import { GatewayIntentBits } from 'discord.js'
import { MeoCord } from 'meocord/decorator'
import { FeedbackController } from '@src/feedback/feedback.controller'
import { ReviewController } from '@src/feedback/review.controller'
import { AppPresenter } from '@src/presenters/app.presenter'

@MeoCord({
  controllers: [FeedbackController, ReviewController],
  // Interactions arrive with Guilds alone, and direct messages are sent, never read
  clientOptions: { intents: [GatewayIntentBits.Guilds] },
  // How loading and error views look; see src/presenters/app.presenter.ts
  presenter: AppPresenter,
})
export default class App {}
