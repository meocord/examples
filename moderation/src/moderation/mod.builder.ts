import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js'
import { CommandBuilder } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

const member = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.addUserOption(option => option.setName('member').setDescription('Who').setRequired(true))
const reason = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.addStringOption(option =>
    option.setName('reason').setDescription('Why').setRequired(true).setMaxLength(200),
  )

/**
 * `/mod`. Discord shows it only to members who can time others out, and only in servers; a server's admins can change
 * that, so the guards check again, and the bot acts with its own permissions, which Discord checks last.
 */
@CommandBuilder(CommandType.SLASH)
export class ModCommandBuilder {
  build(commandName: string) {
    return new SlashCommandBuilder()
      .setName(commandName)
      .setDescription('Moderate members, and look up what was done')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setContexts(InteractionContextType.Guild)
      .addSubcommand(subcommand => reason(member(subcommand.setName('warn').setDescription('Warn a member'))))
      .addSubcommand(subcommand =>
        reason(
          member(subcommand.setName('timeout').setDescription('Time a member out')).addIntegerOption(option =>
            option.setName('minutes').setDescription('How long').setRequired(true).setMinValue(1).setMaxValue(40320),
          ),
        ),
      )
      .addSubcommand(subcommand => reason(member(subcommand.setName('ban').setDescription('Ban a member'))))
      .addSubcommand(subcommand =>
        subcommand
          .setName('case')
          .setDescription('Look up a case')
          .addIntegerOption(option =>
            option
              .setName('id')
              .setDescription('The case number')
              .setRequired(true)
              .setMinValue(1)
              .setAutocomplete(true),
          ),
      )
  }
}

// The context menus' names are what Discord's Apps menu shows, capitals and spaces included
@CommandBuilder(CommandType.CONTEXT_MENU)
export class CasesMenuBuilder {
  build(commandName: string) {
    return new ContextMenuCommandBuilder()
      .setName(commandName)
      .setType(ApplicationCommandType.User)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setContexts(InteractionContextType.Guild)
  }
}

@CommandBuilder(CommandType.CONTEXT_MENU)
export class WarnAuthorMenuBuilder {
  build(commandName: string) {
    return new ContextMenuCommandBuilder()
      .setName(commandName)
      .setType(ApplicationCommandType.Message)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setContexts(InteractionContextType.Guild)
  }
}
