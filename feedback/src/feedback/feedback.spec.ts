import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  DiscordAPIError,
  MessageFlags,
  ModalSubmitInteraction,
  RESTJSONErrorCodes,
  Role,
  TextChannel,
} from 'discord.js'
import {
  createMockChannel,
  createMockClient,
  createMockGuild,
  createMockInteraction,
  createMockMember,
  createMockMessage,
  createMockUser,
  createModalFields,
  getResponse,
  MeoCordTestingModule,
} from 'meocord/testing'
import App from '@src/app.js'
import { FeedbackService } from '@src/feedback/feedback.service.js'
import { FeedbackSettings } from '@src/feedback/feedback.settings.js'

const staffRole = createMockInteraction(Role, { id: '300000000000000001' })
const author = createMockUser({ id: '200000000000000001' })
const reviewer = createMockUser({ id: '200000000000000002' })
const stranger = createMockUser({ id: '200000000000000003' })
const colleague = createMockUser({ id: '200000000000000004' })

/** The app as the bot runs it, in one server with a review channel, a staff member and two others. */
function setup() {
  const review = createMockChannel(TextChannel, { id: '400000000000000001' })
  const guild = createMockGuild({
    roles: [staffRole],
    channels: [review],
    members: [
      createMockMember({ user: reviewer, roles: [staffRole] }),
      createMockMember({ user: colleague, roles: [staffRole] }),
      createMockMember({ user: author }),
      createMockMember({ user: stranger }),
    ],
  })
  const module = MeoCordTestingModule.fromApp(App)
    .overrideProvider(FeedbackSettings)
    .useValue({ reviewChannelId: review.id, staffRoleId: staffRole.id })
    .compile()
  // One client for every interaction, as in the bot, so a DM any handler sends is read from it
  const client = createMockClient()
  const inGuild = { guildId: guild.id, guild, client }
  const command = (user = author) =>
    createMockInteraction(ChatInputCommandInteraction, { commandName: 'feedback', user, ...inGuild })
  const submit = () =>
    createMockInteraction(ModalSubmitInteraction, {
      customId: 'feedback/submit',
      user: author,
      fields: createModalFields({ about: 'Dark mode', details: 'The dashboard is too bright at night.' }),
      ...inGuild,
    })
  // A click on the review post the submission left in the channel
  const posted = () => JSON.parse(JSON.stringify(review.send.mock.calls.at(-1)?.[0] ?? { embeds: [], components: [] }))
  const click = (customId: string, user: ButtonInteraction['user']) =>
    createMockInteraction(ButtonInteraction, {
      customId,
      user,
      message: createMockMessage({ embeds: posted().embeds }),
      ...inGuild,
    })
  return { module, client, guild, review, command, submit, click, posted }
}

/** An error as discord.js throws it for Discord's answer to a request. */
const discordError = (code: number, status: number, message: string) =>
  new DiscordAPIError({ code, message }, code, status, 'GET', '/guilds/1/channels', {})

/** A recorded payload as Discord receives it, its builders as JSON. */
const json = <T>(payload: unknown): T => JSON.parse(JSON.stringify(payload)) as T

/** What MeoCord last answered after a click, privately: the presenter's error view, as a follow-up. */
const privateAnswer = (interaction: ButtonInteraction) => {
  const last = getResponse(interaction).calls.at(-1)
  expect(last?.method).toBe('followUp')
  const payload = json<{ flags: number; embeds: { description: string }[] }>(last?.payload)
  expect(payload.flags & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral)
  return payload.embeds[0].description
}

describe('the feedback bot', () => {
  it('takes feedback through a form, posts it for review, and tells the author what staff decided', async () => {
    const { module, client, command, submit, click, posted } = setup()

    const opened = command()
    await module.dispatch(opened)
    expect(getResponse(opened).calls.map(call => call.method)).toEqual(['showModal'])

    const submitted = submit()
    await module.dispatch(submitted)
    const post = posted() as {
      embeds: { title: string; description: string }[]
      components: { components: { custom_id: string }[] }[]
    }
    expect(post.embeds[0]).toMatchObject({
      title: expect.stringContaining('#1'),
      description: expect.stringContaining('Dark mode'),
    })
    expect(post.components.flatMap(row => row.components.map(button => button.custom_id))).toEqual([
      'feedback/1/approve',
      'feedback/1/reject',
    ])
    // The author is thanked privately, and the review post is the staff's
    expect(getResponse(submitted).calls).toEqual([
      expect.objectContaining({ method: 'reply', payload: expect.objectContaining({ flags: MessageFlags.Ephemeral }) }),
    ])

    const approved = click('feedback/1/approve', reviewer)
    await module.dispatch(approved)
    const verdict = json<{ embeds: { footer?: { text: string } }[]; components: unknown[] }>(
      getResponse(approved).calls.at(-1)?.payload,
    )
    expect(verdict.embeds[0].footer?.text).toContain('Approved')
    expect(verdict.components).toEqual([])
    expect(client.users.send).toHaveBeenCalledWith(
      author.id,
      expect.objectContaining({ content: expect.stringContaining('Dark mode') }),
    )
  })

  it('gives each member one form every five minutes', async () => {
    const { module, command } = setup()
    await module.dispatch(command())

    const again = command()
    const { ran } = await module.dispatch(again)

    expect(ran).toBe(false)
    expect(getResponse(again).calls.map(call => call.method)).toEqual(['reply'])
  })

  it('leaves the review post as it is when someone without the staff role clicks, telling only them why', async () => {
    const { module, client, submit, click } = setup()
    await module.dispatch(submit())

    const denied = click('feedback/1/approve', stranger)
    const { ran } = await module.dispatch(denied)

    expect(ran).toBe(false)
    // The guard runs before the handler locks the post, so nothing but the acknowledgement touches it
    expect(getResponse(denied).calls.map(call => call.method)).toEqual(['deferUpdate', 'followUp'])
    expect(privateAnswer(denied)).toBe('Only staff can review feedback.')
    expect(client.users.send).not.toHaveBeenCalled()
  })

  it('tells staff a review post is out of date when the bot no longer holds its feedback, as after a restart', async () => {
    const { module, click } = setup()

    const stale = click('feedback/7/reject', reviewer)
    await module.dispatch(stale)

    expect(privateAnswer(stale)).toBe('Feedback #7 is no longer held: the bot has restarted since it was posted.')
  })

  // Discord's answers once the channel is deleted, or the bot can no longer see it
  it.each([
    [RESTJSONErrorCodes.UnknownChannel, 404, 'Unknown Channel'],
    [RESTJSONErrorCodes.MissingAccess, 403, 'Missing Access'],
  ])('posts nothing and keeps nothing when the review channel answers %i', async (code, status, message) => {
    const { module, guild, review, submit } = setup()
    guild.channels.fetch.mockRejectedValueOnce(discordError(code, status, message))

    // An operator's mistake rather than the member's, so it's an error that names the setting to fix
    await expect(module.dispatch(submit())).rejects.toThrow('FEEDBACK_CHANNEL_ID')
    expect(review.send).not.toHaveBeenCalled()
    // The submission isn't held, so no review post can later point at it
    expect(() => module.get(FeedbackService).decide(1, 'approved')).toThrow('no longer held')
  })

  it('reports a failure to reach Discord as itself, not as a missing channel', async () => {
    const { module, guild, review, submit } = setup()
    guild.channels.fetch.mockRejectedValueOnce(discordError(0, 503, 'Service Unavailable'))

    await expect(module.dispatch(submit())).rejects.toThrow('Service Unavailable')
    expect(review.send).not.toHaveBeenCalled()
  })

  it('completes the verdict when the author has closed their direct messages', async () => {
    const { module, client, submit, click } = setup()
    await module.dispatch(submit())

    const approved = click('feedback/1/approve', reviewer)
    client.users.send.mockRejectedValueOnce(new Error('Cannot send messages to this user'))
    await module.dispatch(approved)

    // The post is edited with the verdict, and the reviewer sees no error for a DM they couldn't control
    const calls = getResponse(approved).calls
    expect(json<{ embeds: { footer?: { text: string } }[] }>(calls.at(-1)?.payload).embeds[0].footer?.text).toContain(
      'Approved',
    )
    expect(calls.map(call => call.method)).not.toContain('followUp')
  })

  it('refuses a second verdict on the same feedback, leaving the post and the author alone', async () => {
    const { module, client, submit, click } = setup()
    await module.dispatch(submit())
    await module.dispatch(click('feedback/1/approve', reviewer))

    const late = click('feedback/1/reject', colleague)
    await module.dispatch(late)

    expect(privateAnswer(late)).toBe('Feedback #1 was already approved.')
    // The author heard once, of the first verdict
    expect(client.users.send).toHaveBeenCalledTimes(1)
  })
})
