import {
  type ButtonInteraction,
  type GuildMember,
  type Interaction,
  type PermissionResolvable,
  PermissionsBitField,
} from 'discord.js'
import { applyDecorators, createMetadata, ExecutionContext, GuardDeniedError } from 'meocord/common'
import { Guard, UseGuard } from 'meocord/decorator'
import { type GuardInterface } from 'meocord/interface'

/** The permission a handler needs beyond the command's default, such as Ban Members for `/mod ban`. */
export const Permission = createMetadata<bigint>('permission')

@Guard()
export class PermissionGuard implements GuardInterface {
  constructor(private readonly context: ExecutionContext) {}

  canActivate(interaction: Interaction): boolean {
    const required = this.context.get(Permission)
    if (required === undefined || interaction.memberPermissions?.has(required)) return true
    const [name] = new PermissionsBitField(required).toArray()
    throw new GuardDeniedError(`You need the ${name} permission for that.`)
  }
}

/** Lets a handler run only for members with `permission`, as their roles and the channel give it. */
export const RequirePermission = (permission: PermissionResolvable) =>
  applyDecorators(Permission(PermissionsBitField.resolve(permission)), UseGuard(PermissionGuard))

/** The member a moderation command acts on: the `member` option, a context menu's member, or a message's author. */
function targetOf(interaction: Interaction): GuildMember | null {
  if (!interaction.inCachedGuild()) return null
  if (interaction.isChatInputCommand()) return interaction.options.getMember('member')
  if (interaction.isUserContextMenuCommand()) return interaction.targetMember
  if (interaction.isMessageContextMenuCommand()) return interaction.targetMessage.member
  return null
}

/**
 * Refuses, up front, an action on a member who ranks at or above the moderator, or the bot: Discord checks only the
 * bot's role when it acts, so without the first a moderator could have the bot act on someone above them, and without
 * the second Discord refuses the action after the moderator confirmed it. A member who has left has no roles to compare.
 */
@Guard()
export class HierarchyGuard implements GuardInterface {
  canActivate(interaction: Interaction): boolean {
    const target = targetOf(interaction)
    if (!target || !interaction.inCachedGuild()) return true
    const { guild, member: moderator } = interaction
    if (target.id === moderator.id) throw new GuardDeniedError('You can’t moderate yourself.')
    if (target.id === guild.ownerId) throw new GuardDeniedError('The server owner can’t be moderated.')
    // Ranked as Discord ranks roles: by position, then by id
    const outranks = (member: GuildMember) => member.roles.highest.comparePositionTo(target.roles.highest) > 0
    if (moderator.id !== guild.ownerId && !outranks(moderator)) {
      throw new GuardDeniedError(`Your highest role must be above ${target.displayName}’s.`)
    }
    const bot = guild.members.me
    if (bot && !outranks(bot)) {
      throw new GuardDeniedError(
        `My highest role must be above ${target.displayName}’s; move it up in the server’s roles.`,
      )
    }
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
