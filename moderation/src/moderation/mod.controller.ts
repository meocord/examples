import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Interaction,
  MessageFlags,
  type MessageContextMenuCommandInteraction,
  PermissionFlagsBits,
  type User,
  type UserContextMenuCommandInteraction,
} from 'discord.js'
import { respond, route, useTheme, UserError } from 'meocord/common'
import { Autocomplete, Command, Controller, Defer, UseFilter, UseGuard } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'
import { type Action, type Case, CaseStore } from '@src/cases/case.store'
import { DiscordRefusalFilter } from '@src/moderation/discord-refusal.filter'
import { HierarchyGuard, memberOf, OwnerGuard, rankProblem, RequirePermission } from '@src/moderation/guards'
import { CasesMenuBuilder, ModCommandBuilder, WarnAuthorMenuBuilder } from '@src/moderation/mod.builder'

/** The moderator, the pending case and the answer, such as `mod/111/12/confirm`, each typed for the handler. */
export const answer = route('mod/{ownerId}/{case:int}/{action:confirm|cancel}')

/**
 * The server a moderation command runs in. Its builders limit it to servers, and the bot answers from its cache, so
 * this holds for every call Discord sends.
 */
function serverOf(interaction: Interaction) {
  if (!interaction.inCachedGuild()) throw new Error('Moderation runs only in servers the bot is in.')
  return interaction.guild
}

const VERBS: Record<Action, string> = { warn: 'Warned', timeout: 'Timed out', ban: 'Banned' }

/** One line for a case, as lists and the autocomplete show it. */
export const describeCase = (entry: Case) =>
  `#${entry.id} ${entry.action}${entry.minutes ? ` (${entry.minutes} min)` : ''}, ${entry.status}: ${entry.reason}`

// Every handler needs Moderate Members, the buttons included, so a moderator who loses it can't confirm what they proposed
@Controller()
@UseFilter(DiscordRefusalFilter)
@RequirePermission(PermissionFlagsBits.ModerateMembers)
export class ModController {
  constructor(private readonly cases: CaseStore) {}

  // Discord sends a subcommand, never `/mod` alone; this handler declares the builder for the whole command
  @Command('mod', ModCommandBuilder)
  async mod(interaction: ChatInputCommandInteraction) {
    await respond(interaction).send({ content: 'Pick a subcommand.', flags: MessageFlags.Ephemeral })
  }

  // A warning acts on no one, so it's recorded at once
  @Command('mod warn', CommandType.SLASH)
  @UseGuard(HierarchyGuard)
  async warn(interaction: ChatInputCommandInteraction, { member, reason }: { member: User; reason: string }) {
    const entry = this.cases.open(
      {
        guildId: serverOf(interaction).id,
        action: 'warn',
        targetId: member.id,
        moderatorId: interaction.user.id,
        reason,
      },
      'done',
    )
    await respond(interaction).send({ content: `Case #${entry.id}: warned ${member}.`, flags: MessageFlags.Ephemeral })
  }

  @Command('mod timeout', CommandType.SLASH)
  @UseGuard(HierarchyGuard)
  async timeout(
    interaction: ChatInputCommandInteraction,
    { member, minutes, reason }: { member: User; minutes: number; reason: string },
  ) {
    await this.propose(interaction, member, { action: 'timeout', reason, minutes })
  }

  // Ban Members as well; a method's permissions replace its controller's, so it names both
  @Command('mod ban', CommandType.SLASH)
  @RequirePermission(PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.BanMembers)
  @UseGuard(HierarchyGuard)
  async ban(interaction: ChatInputCommandInteraction, { member, reason }: { member: User; reason: string }) {
    await this.propose(interaction, member, { action: 'ban', reason })
  }

  @Command('mod case', CommandType.SLASH)
  async lookUp(interaction: ChatInputCommandInteraction, { id }: { id: number }) {
    const entry = this.cases.get(serverOf(interaction).id, id)
    if (!entry) throw new UserError(`There's no case #${id} in this server.`)
    await respond(interaction).send({ embeds: [caseEmbed(entry)], flags: MessageFlags.Ephemeral })
  }

  // The integer option completes to this server's case numbers, newest first
  @Autocomplete('mod case', 'id')
  async completeCase(interaction: AutocompleteInteraction) {
    const typed = String(interaction.options.getFocused())
    const matches = interaction.guildId ? this.cases.search(interaction.guildId, typed) : []
    await interaction.respond(matches.map(entry => ({ name: describeCase(entry).slice(0, 100), value: entry.id })))
  }

  // Right-click a member, then Apps › Cases
  @Command('Cases', CasesMenuBuilder)
  async casesOf(interaction: UserContextMenuCommandInteraction) {
    const entries = this.cases.forMember(serverOf(interaction).id, interaction.targetUser.id)
    const content = entries.length
      ? entries.map(describeCase).join('\n')
      : `${interaction.targetUser} has no cases in this server.`
    await respond(interaction).send({ content, flags: MessageFlags.Ephemeral })
  }

  // Right-click a message, then Apps › Warn author: a warning that links what they wrote
  @Command('Warn author', WarnAuthorMenuBuilder)
  @UseGuard(HierarchyGuard)
  async warnAuthor(interaction: MessageContextMenuCommandInteraction) {
    const { author, url } = interaction.targetMessage
    const entry = this.cases.open(
      {
        guildId: serverOf(interaction).id,
        action: 'warn',
        targetId: author.id,
        moderatorId: interaction.user.id,
        reason: `For this message: ${url}`,
      },
      'done',
    )
    await respond(interaction).send({ content: `Case #${entry.id}: warned ${author}.`, flags: MessageFlags.Ephemeral })
  }

  // The proposal waits in the case log, and the buttons carry its number, so a restart doesn't lose it
  private async propose(
    interaction: ChatInputCommandInteraction,
    member: User,
    action: { action: 'timeout' | 'ban'; reason: string; minutes?: number },
  ) {
    const ownerId = interaction.user.id
    const entry = this.cases.open(
      { guildId: serverOf(interaction).id, targetId: member.id, moderatorId: ownerId, ...action },
      'pending',
    )
    const button = (choice: 'confirm' | 'cancel', label: string, style: ButtonStyle) =>
      new ButtonBuilder()
        .setCustomId(answer.build({ ownerId, case: entry.id, action: choice }))
        .setLabel(label)
        .setStyle(style)
    const what = action.action === 'ban' ? `Ban ${member}` : `Time out ${member} for ${action.minutes} minutes`
    await respond(interaction).send({
      content: `${what}? Reason: ${action.reason}`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('confirm', action.action === 'ban' ? 'Ban' : 'Time out', ButtonStyle.Danger),
          button('cancel', 'Cancel', ButtonStyle.Secondary),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
  }

  // The first click takes the case, so a second click, or one after Cancel, finds it handled
  @Command(answer, CommandType.BUTTON)
  @UseGuard(OwnerGuard)
  @Defer()
  async answer(
    interaction: ButtonInteraction,
    { case: id, action }: { ownerId: string; case: number; action: 'confirm' | 'cancel' },
  ) {
    const guild = serverOf(interaction)
    // Roles can change, and a case can wait across a restart, so the moderator must still be allowed as it runs
    const pending = this.cases.get(guild.id, id)
    if (action === 'confirm' && pending?.status === 'pending') {
      const problem = await this.stillAllowed(interaction, pending)
      if (problem && this.cases.take(guild.id, id, 'refused')) throw new UserError(problem)
    }
    const entry = this.cases.take(guild.id, id, action === 'confirm' ? 'done' : 'cancelled')
    if (!entry) throw new UserError(`Case #${id} has already been handled.`)
    if (action === 'cancel') {
      await respond(interaction).send({ content: `Case #${id} cancelled.`, components: [] })
      return
    }
    try {
      // Discord checks the bot's own permissions and role here, whatever the guards allowed
      if (entry.action === 'ban') await guild.members.ban(entry.targetId, { reason: entry.reason })
      else {
        const member = await guild.members.fetch(entry.targetId)
        await member.timeout((entry.minutes ?? 0) * 60_000, entry.reason)
      }
    } catch (error) {
      // The case shows it didn't happen, and DiscordRefusalFilter tells the moderator why
      this.cases.settle(id, 'refused')
      throw error
    }
    await respond(interaction).send({
      content: `Case #${id}: ${VERBS[entry.action].toLowerCase()} <@${entry.targetId}>.`,
      components: [],
    })
  }

  /** Why the moderator may no longer carry out `entry`, or undefined when they may: Ban Members, and the ranks. */
  private async stillAllowed(interaction: ButtonInteraction, entry: Case): Promise<string | undefined> {
    if (!interaction.inCachedGuild()) return undefined
    if (entry.action === 'ban' && !interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
      return 'You need the BanMembers permission for that.'
    }
    const target = await memberOf(interaction.guild, entry.targetId)
    // A member who has left can still be banned; a timeout finds no one, and Discord says so
    return target ? rankProblem(interaction.guild, interaction.member, target) : undefined
  }
}

function caseEmbed(entry: Case) {
  const { colors } = useTheme()
  return new EmbedBuilder()
    .setTitle(`Case #${entry.id}: ${entry.action}`)
    .setDescription(entry.reason)
    .addFields(
      { name: 'Member', value: `<@${entry.targetId}>`, inline: true },
      { name: 'Moderator', value: `<@${entry.moderatorId}>`, inline: true },
      { name: 'Status', value: entry.status, inline: true },
    )
    .setTimestamp(new Date(entry.createdAt))
    .setColor(entry.status === 'done' ? colors.primary : colors.neutral)
}
