import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js'
import { type ExecutionContext, Logger } from 'meocord/common'
import { Catch } from 'meocord/decorator'
import { type ExceptionFilter } from 'meocord/interface'

// What Discord's refusals mean for a moderator, in words they can act on
const MEANINGS = new Map<number | string, string>([
  [
    RESTJSONErrorCodes.MissingPermissions,
    'Discord refused: my role needs the permission for that, and must be above the member’s highest role.',
  ],
  [RESTJSONErrorCodes.UnknownMember, 'Discord refused: they’re no longer in this server.'],
  [RESTJSONErrorCodes.UnknownUser, 'Discord refused: there’s no such user.'],
])

/**
 * Answers Discord's refusal of a timeout or ban privately, with what to do about it. A refusal it doesn't recognise
 * gets the default message, and is logged, since a filter that handles an error keeps it from the log otherwise.
 */
@Catch(DiscordAPIError)
export class DiscordRefusalFilter implements ExceptionFilter<DiscordAPIError> {
  private readonly logger = new Logger('Moderation')

  async catch(error: DiscordAPIError, context: ExecutionContext) {
    const message = MEANINGS.get(error.code)
    if (!message) this.logger.error('Discord refused a moderation action:', error)
    await context.response?.error(error, { message, visibility: 'private' })
  }
}
