import { type ButtonInteraction, EmbedBuilder } from 'discord.js'
import { respond, useTheme } from 'meocord/common'
import { Command, Controller, Defer, UseGuard } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'
import { FeedbackService } from '@src/feedback/feedback.service'
import { StaffGuard } from '@src/feedback/staff.guard'

// Both buttons need the staff role. @Defer acknowledges the click first and locks the post until the verdict is in
@Controller()
@UseGuard(StaffGuard)
export class ReviewController {
  constructor(private readonly feedback: FeedbackService) {}

  // `{id:int}` gives the handler the feedback's number, parsed from the button's custom ID
  @Command('feedback/{id:int}/approve', CommandType.BUTTON)
  @Defer()
  async approve(interaction: ButtonInteraction, { id }: { id: number }) {
    await this.decide(interaction, id, 'approved')
  }

  @Command('feedback/{id:int}/reject', CommandType.BUTTON)
  @Defer()
  async reject(interaction: ButtonInteraction, { id }: { id: number }) {
    await this.decide(interaction, id, 'rejected')
  }

  private async decide(interaction: ButtonInteraction, id: number, status: 'approved' | 'rejected') {
    const feedback = this.feedback.decide(id, status)

    // The review post keeps its text, gains the verdict, and loses its buttons
    const { colors } = useTheme()
    const [post] = interaction.message.embeds
    const verdict = (post ? EmbedBuilder.from(post) : new EmbedBuilder())
      .setFooter({ text: `${status === 'approved' ? 'Approved' : 'Rejected'} by ${interaction.user.username}` })
      .setColor(status === 'approved' ? colors.success : colors.danger)
    await respond(interaction).send({ embeds: [verdict], components: [] })

    // The author hears back by direct message; one who closed their DMs isn't the reviewer's problem
    await interaction.client.users
      .send(feedback.authorId, { content: `Your feedback "${feedback.about}" was ${status}.` })
      .catch(() => undefined)
  }
}
