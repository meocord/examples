import { Service } from 'meocord/decorator'

/** A Discord id, as the developer portal and Copy ID give it. */
const SNOWFLAKE = /^\d{17,20}$/

/** The id an environment variable holds, or an error naming it: read as the bot starts, so a bad one stops it there. */
function idFrom(name: string): string {
  const value = process.env[name]?.trim() ?? ''
  if (!SNOWFLAKE.test(value)) {
    throw new Error(`${name} must be a Discord id, such as 123456789012345678; set it in .env (see .env.example).`)
  }
  return value
}

/** Where feedback goes for review, and the role that reviews it: FEEDBACK_CHANNEL_ID and STAFF_ROLE_ID in `.env`. */
@Service()
export class FeedbackSettings {
  readonly reviewChannelId = idFrom('FEEDBACK_CHANNEL_ID')
  readonly staffRoleId = idFrom('STAFF_ROLE_ID')
}
