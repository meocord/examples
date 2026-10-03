import { Service } from 'meocord/decorator'

/** Where feedback goes for review, and the role that reviews it: FEEDBACK_CHANNEL_ID and STAFF_ROLE_ID in `.env`. */
@Service()
export class FeedbackSettings {
  readonly reviewChannelId = process.env.FEEDBACK_CHANNEL_ID ?? ''
  readonly staffRoleId = process.env.STAFF_ROLE_ID ?? ''
}
