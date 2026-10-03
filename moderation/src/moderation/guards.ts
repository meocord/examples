import {
  type ButtonInteraction,
  DiscordAPIError,
  type Guild,
  type GuildMember,
  type Interaction,
  type PermissionResolvable,
  PermissionsBitField,
  RESTJSONErrorCodes,
} from 'discord.js'
import { applyDecorators, createMetadata, ExecutionContext, GuardDeniedError } from 'meocord/common'
import { Guard, UseGuard } from 'meocord/decorator'
import { type GuardInterface } from 'meocord/interface'

/** The permissions a handler needs; a method's value wins over its controller's. */
export const Permission = createMetadata<bigint>('permission')

/**
 * Lets a handler run only for members with every permission its `@RequirePermission` names, as their roles and the
 * channel give it. A command's default member permissions only decide who Discord shows it to, and a server's admins
 * can change those, so this is what enforces them.
 */
@Guard()
export class PermissionGuard implements GuardInterface {
  constructor(private readonly context: ExecutionContext) {}

  canActivate(interaction: Interaction): boolean {
    const required = this.context.get(Permission)
    if (required === undefined) return true
    const missing = new PermissionsBitField(required).remove(interaction.memberPermissions ?? 0n).toArray()
    if (missing.length === 0) return true
    throw new GuardDeniedError(`You need the ${missing.join(' and ')} permission for that.`)
  }
}

/** Lets a handler, or every handler of a controller, run only for members with all of `permissions`. */
export const RequirePermission = (...permissions: PermissionResolvable[]) =>
  applyDecorators(Permission(PermissionsBitField.resolve(permissions)), UseGuard(PermissionGuard))

/**
 * Why `moderator` may not act on `target` in `guild`, or undefined when they may: a moderator acts only on members
 * ranked below them, and the bot only on members ranked below its highest role, as Discord ranks roles. Discord checks
 * only the bot's rank when it acts, so without the first a moderator could have the bot act on someone above them.
 */
export function rankProblem(guild: Guild, moderator: GuildMember, target: GuildMember): string | undefined {
  if (target.id === moderator.id) return 'You can’t moderate yourself.'
  if (target.id === guild.ownerId) return 'The server owner can’t be moderated.'
  const outranks = (member: GuildMember) => member.roles.highest.comparePositionTo(target.roles.highest) > 0
  if (moderator.id !== guild.ownerId && !outranks(moderator)) {
    return `Your highest role must be above ${target.displayName}’s.`
  }
  const bot = guild.members.me
  if (bot && !outranks(bot)) {
    return `My highest role must be above ${target.displayName}’s; move it up in the server’s roles.`
  }
  return undefined
}

/**
 * The server's member with `id`, from the cache or else from Discord, or null when they aren't in the server. A
 * message's `member` is only a cache lookup, and the bot, with the Guilds intent alone, doesn't cache every member.
 */
export async function memberOf(guild: Guild, id: string): Promise<GuildMember | null> {
  const cached = guild.members.resolve(id)
  if (cached) return cached
  try {
    return await guild.members.fetch(id)
  } catch (error) {
    if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) return null
    throw error
  }
}

/**
 * Refuses, up front, an action on a member ranked at or above the moderator or the bot; see rankProblem. A message's
 * author who has left the server can't be warned for it; a member given to a slash command may have left, and a ban
 * still reaches them.
 */
@Guard()
export class HierarchyGuard implements GuardInterface {
  async canActivate(interaction: Interaction): Promise<boolean> {
    if (!interaction.inCachedGuild()) return true
    const { guild, member: moderator } = interaction
    let target: GuildMember | null = null
    if (interaction.isChatInputCommand()) target = interaction.options.getMember('member')
    else if (interaction.isUserContextMenuCommand()) target = interaction.targetMember
    else if (interaction.isMessageContextMenuCommand()) {
      target = await memberOf(guild, interaction.targetMessage.author.id)
      if (!target) throw new GuardDeniedError('Its author has left the server.')
    }
    const problem = target && rankProblem(guild, moderator, target)
    if (problem) throw new GuardDeniedError(problem)
    return true
  }
}

/** Only the moderator a button names may press it. */
@Guard()
export class OwnerGuard implements GuardInterface {
  canActivate(interaction: ButtonInteraction, { ownerId }: { ownerId: string }): boolean {
    if (interaction.user.id !== ownerId) throw new GuardDeniedError('Only the moderator who asked can answer this.')
    return true
  }
}
