import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { respond, useTheme } from 'meocord/common'
import { Command, Controller, Cooldown } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'
import { FeedbackCommandBuilder } from '@src/feedback/feedback.builder'
import { FeedbackService } from '@src/feedback/feedback.service'
import { FeedbackSettings } from '@src/feedback/feedback.settings'

const field = (customId: string, label: string, style: TextInputStyle, maxLength: number) =>
  new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(style).setMaxLength(maxLength),
  )

@Controller()
export class FeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly settings: FeedbackSettings,
  ) {}

  // `/feedback` opens a form, once every five minutes for each member; a second try is told how long to wait
  @Command('feedback', FeedbackCommandBuilder)
  @Cooldown({ seconds: 300 })
  async open(interaction: ChatInputCommandInteraction) {
    await respond(interaction).modal(
      new ModalBuilder()
        .setCustomId('feedback/submit')
        .setTitle('Feedback')
        .addComponents(
          field('about', 'What is it about?', TextInputStyle.Short, 80),
          field('details', 'Tell us more', TextInputStyle.Paragraph, 1000),
        ),
    )
  }

  // The form's fields arrive in the handler's params, named by their custom IDs
  @Command('feedback/submit', CommandType.MODAL_SUBMIT)
  async submit(interaction: ModalSubmitInteraction, { about, details }: { about: string; details: string }) {
    // The channel first, so a submission that can't be posted isn't kept for a review that never comes
    const channel = await interaction.guild?.channels.fetch(this.settings.reviewChannelId).catch(() => null)
    if (!channel?.isSendable()) throw new Error('FEEDBACK_CHANNEL_ID names no channel the bot can post in.')
    const feedback = this.feedback.add({ authorId: interaction.user.id, about, details })

    // A post to a channel isn't an answer, so it takes the theme's colour itself; respond() fills in the rest
    const button = (verdict: 'approve' | 'reject', label: string, style: ButtonStyle) =>
      new ButtonBuilder().setCustomId(`feedback/${feedback.id}/${verdict}`).setLabel(label).setStyle(style)
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Feedback #${feedback.id} from ${interaction.user.username}`)
          .setDescription(`**${about}**\n${details}`)
          .setColor(useTheme().colors.primary),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('approve', 'Approve', ButtonStyle.Success),
          button('reject', 'Reject', ButtonStyle.Danger),
        ),
      ],
    })

    await respond(interaction).send({ content: 'Thanks! The staff will read it.', flags: MessageFlags.Ephemeral })
  }
}
