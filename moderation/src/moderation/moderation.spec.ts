import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
  Role,
  type User,
  UserContextMenuCommandInteraction,
} from 'discord.js'
import {
  createChatInputOptions,
  createDiscordError,
  createMockGuild,
  createMockInteraction,
  createMockMember,
  createMockMessage,
  createMockUser,
  getResponse,
  MeoCordTestingModule,
} from 'meocord/testing'
import App from '@src/app.js'
import { DATABASE, openDatabase } from '@src/database/database.provider.js'

const moderator = createMockUser({ id: '200000000000000001' })
const senior = createMockUser({ id: '200000000000000002' })
const offender = createMockUser({ id: '200000000000000003' })
const veteran = createMockUser({ id: '200000000000000004' })
const botUser = createMockUser({ id: '200000000000000009', bot: true })

/**
 * The server's roles, made for each test. The template's vitest.setup.ts resets every mock after each test, stubbed
 * implementations included, so roles shared between tests would lose their comparePositionTo after the first, and the
 * tests would pass or fail by the order they run in.
 */
function makeRoles() {
  const rolesById = new Map<string, Role>()
  const role = (id: string, position: number, ...permissions: bigint[]) => {
    const made = createMockInteraction(Role, { id, position, permissions: new PermissionsBitField(permissions) })
    // The mock doesn't model comparePositionTo yet: it ranks by position here, as discord.js does for distinct positions
    made.comparePositionTo.mockImplementation(
      other => made.position - (typeof other === 'string' ? (rolesById.get(other)?.position ?? 0) : other.position),
    )
    rolesById.set(id, made)
    return made
  }
  // Ranked from the bottom: moderator, the bot, a veteran member, a senior moderator who can ban
  return {
    moderator: role('300000000000000001', 2, PermissionFlagsBits.ModerateMembers),
    bot: role('300000000000000003', 4, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.BanMembers),
    veteran: role('300000000000000004', 5),
    senior: role('300000000000000002', 6, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.BanMembers),
  }
}

/** A server with the roles above and a member for each user, the bot included. */
function makeServer(id: string) {
  const roles = makeRoles()
  const members = {
    moderator: createMockMember({ user: moderator, roles: [roles.moderator] }),
    senior: createMockMember({ user: senior, roles: [roles.senior] }),
    offender: createMockMember({ user: offender }),
    veteran: createMockMember({ user: veteran, roles: [roles.veteran] }),
    bot: createMockMember({ user: botUser, roles: [roles.bot] }),
  }
  const guild = createMockGuild({ id, roles: Object.values(roles), members: Object.values(members) })
  // The mock doesn't model guild.members.me yet: the bot's own member, as the gateway caches it
  Object.defineProperty(guild.members, 'me', { value: members.bot })
  return { guild, members, roles }
}

/** The app as the bot runs it, in one server, over `database`: a new in-memory one unless given. */
function setup(database = openDatabase(':memory:')) {
  // A fixed id, so a restarted app over the same database finds the server's cases
  const { guild, members, roles } = makeServer('100000000000000001')
  const module = MeoCordTestingModule.fromApp(App).overrideProvider(DATABASE).useValue(database).compile()
  const inGuild = { guildId: guild.id, guild }

  const mod = (user: User, subcommand: string, options: Record<string, string | number | { id: string }>) =>
    createMockInteraction(ChatInputCommandInteraction, {
      commandName: 'mod',
      user,
      options: createChatInputOptions({ subcommand, ...options }),
      ...inGuild,
    })
  // The last button the bot sent in reply to `proposal`, pressed by `user`
  const press = (proposal: ChatInputCommandInteraction, choice: 'confirm' | 'cancel', user: User = moderator) => {
    const sent = JSON.parse(JSON.stringify(getResponse(proposal).calls.at(-1)?.payload)) as {
      components: { components: { custom_id: string }[] }[]
    }
    const customId = sent.components[0].components.find(button => button.custom_id.endsWith(`/${choice}`))?.custom_id
    return createMockInteraction(ButtonInteraction, { customId, user, ...inGuild })
  }
  // Right-click a message by `author`, then Apps › Warn author
  const warnAuthor = (author: User, user: User = moderator) => {
    const message = createMockMessage({ author, guild })
    const menu = createMockInteraction(MessageContextMenuCommandInteraction, {
      commandName: 'Warn author',
      user,
      targetId: message.id,
      targetMessage: message,
      ...inGuild,
    })
    return { message, menu }
  }
  return { module, guild, members, roles, mod, press, warnAuthor, inGuild }
}

/** What the bot last answered, as Discord received it. */
const lastPayload = (interaction: Parameters<typeof getResponse>[0]) =>
  JSON.parse(JSON.stringify(getResponse(interaction).calls.at(-1)?.payload ?? {})) as {
    content?: string
    flags?: number
    embeds?: { title?: string; description?: string }[]
  }

/** What MeoCord answered privately for a refusal: the presenter's error view. */
const refusal = (interaction: Parameters<typeof getResponse>[0]) => {
  const payload = lastPayload(interaction)
  expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral)
  return payload.embeds?.[0]?.description
}

describe('the moderation bot', () => {
  it('records a warning, which /mod case and the Cases menu then show', async () => {
    const { module, mod, inGuild } = setup()

    const warned = mod(moderator, 'warn', { member: offender, reason: 'Spam' })
    await module.dispatch(warned)
    expect(lastPayload(warned).content).toBe(`Case #1: warned ${offender}.`)

    const lookedUp = mod(moderator, 'case', { id: 1 })
    await module.dispatch(lookedUp)
    expect(lastPayload(lookedUp).embeds?.[0]).toMatchObject({ title: 'Case #1: warn', description: 'Spam' })

    const menu = createMockInteraction(UserContextMenuCommandInteraction, {
      commandName: 'Cases',
      user: moderator,
      targetId: offender.id,
      targetUser: offender,
      ...inGuild,
    })
    await module.dispatch(menu)
    expect(lastPayload(menu).content).toBe('#1 warn, done: Spam')
  })

  it('warns a message’s author from the message, linking it', async () => {
    const { module, mod, warnAuthor } = setup()
    const { message, menu } = warnAuthor(offender)

    await module.dispatch(menu)

    expect(lastPayload(menu).content).toBe(`Case #1: warned ${offender}.`)
    const lookedUp = mod(moderator, 'case', { id: 1 })
    await module.dispatch(lookedUp)
    expect(lastPayload(lookedUp).embeds?.[0].description).toBe(`For this message: ${message.url}`)
  })

  // A message's member is only a cache lookup, and with the Guilds intent alone its author often isn't cached
  it('fetches an uncached author, and refuses to warn one who ranks above the moderator', async () => {
    const { module, guild, warnAuthor } = setup()
    const { menu } = warnAuthor(veteran)
    // The mock doesn't model the member cache yet: here it misses, as for an uncached author, and the fetch finds them
    guild.members.resolve.mockReturnValueOnce(null)

    const { ran } = await module.dispatch(menu)

    expect(ran).toBe(false)
    expect(refusal(menu)).toMatch(/^Your highest role must be above /)
  })

  it('refuses to warn a message’s author who has left the server', async () => {
    const { module, guild, warnAuthor } = setup()
    const { menu } = warnAuthor(offender)
    // The mock doesn't model the member cache yet: here it misses, and Discord answers Unknown Member
    guild.members.resolve.mockReturnValueOnce(null)
    guild.members.fetch.mockRejectedValueOnce(createDiscordError(RESTJSONErrorCodes.UnknownMember))

    const { ran } = await module.dispatch(menu)

    expect(ran).toBe(false)
    expect(refusal(menu)).toBe('Its author has left the server.')
  })

  it('times a member out only once the moderator confirms, and only once', async () => {
    const { module, members, mod, press } = setup()

    const proposal = mod(moderator, 'timeout', { member: offender, minutes: 10, reason: 'Flooding' })
    await module.dispatch(proposal)
    expect(members.offender.timeout).not.toHaveBeenCalled()

    const confirmed = press(proposal, 'confirm')
    await module.dispatch(confirmed)
    expect(members.offender.timeout).toHaveBeenCalledWith(600_000, 'Flooding')
    expect(lastPayload(confirmed).content).toBe(`Case #1: timed out <@${offender.id}>.`)

    // A second click, as on a slow connection, finds the case handled and times no one out again
    const again = press(proposal, 'confirm')
    await module.dispatch(again)
    expect(refusal(again)).toBe('Case #1 has already been handled.')
    expect(members.offender.timeout).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the moderator cancels', async () => {
    const { module, guild, mod, press } = setup()

    const proposal = mod(senior, 'ban', { member: offender, reason: 'Raid' })
    await module.dispatch(proposal)
    const cancelled = press(proposal, 'cancel', senior)
    await module.dispatch(cancelled)

    expect(guild.members.ban).not.toHaveBeenCalled()
    expect(lastPayload(cancelled).content).toBe('Case #1 cancelled.')
  })

  it('keeps a pending case across a restart, so its buttons still work', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'moderation-'))
    try {
      const file = path.join(folder, 'cases.db')
      const before = setup(openDatabase(file))
      const proposal = before.mod(senior, 'ban', { member: offender, reason: 'Raid' })
      await before.module.dispatch(proposal)
      await before.module.close()

      const after = setup(openDatabase(file))
      await after.module.dispatch(after.press(proposal, 'confirm', senior))
      expect(after.guild.members.ban).toHaveBeenCalledWith(offender.id, { reason: 'Raid' })
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('lets only the moderator who asked answer the buttons', async () => {
    const { module, guild, mod, press } = setup()

    const proposal = mod(senior, 'ban', { member: offender, reason: 'Raid' })
    await module.dispatch(proposal)
    const intruder = press(proposal, 'confirm', moderator)
    await module.dispatch(intruder)

    expect(refusal(intruder)).toBe('Only the moderator who asked can answer this.')
    expect(guild.members.ban).not.toHaveBeenCalled()
  })

  // Default member permissions only decide who Discord shows a command to, and a server's admins can change them
  it.each([
    ['/mod warn', (t: ReturnType<typeof setup>) => t.mod(veteran, 'warn', { member: offender, reason: 'Spam' })],
    [
      '/mod timeout',
      (t: ReturnType<typeof setup>) => t.mod(veteran, 'timeout', { member: offender, minutes: 10, reason: 'Spam' }),
    ],
    ['Warn author', (t: ReturnType<typeof setup>) => t.warnAuthor(offender, veteran).menu],
  ])('refuses %s to a member without Moderate Members, however high they rank', async (_, make) => {
    const tested = setup()
    const interaction = make(tested)

    const { ran } = await tested.module.dispatch(interaction)

    expect(ran).toBe(false)
    expect(refusal(interaction)).toBe('You need the ModerateMembers permission for that.')
  })

  it('asks for Ban Members to ban, on top of the command’s Moderate Members', async () => {
    const { module, mod } = setup()

    const proposal = mod(moderator, 'ban', { member: offender, reason: 'Raid' })
    const { ran } = await module.dispatch(proposal)

    expect(ran).toBe(false)
    expect(refusal(proposal)).toBe('You need the BanMembers permission for that.')
  })

  it('refuses, before anything is proposed, to act on a member who ranks at or above the moderator', async () => {
    const { module, mod } = setup()

    const proposal = mod(moderator, 'timeout', { member: senior, minutes: 10, reason: 'Rude' })
    const { ran } = await module.dispatch(proposal)

    expect(ran).toBe(false)
    expect(refusal(proposal)).toMatch(/^Your highest role must be above /)
  })

  it('refuses up front to act on a member who ranks at or above the bot, rather than leave it to Discord', async () => {
    const { module, mod } = setup()

    const proposal = mod(senior, 'timeout', { member: veteran, minutes: 10, reason: 'Rude' })
    const { ran } = await module.dispatch(proposal)

    expect(ran).toBe(false)
    expect(refusal(proposal)).toMatch(/^My highest role must be above /)
  })

  it('checks the ranks again at Confirm, since roles can change while a case waits', async () => {
    const { module, members, roles, mod, press } = setup()
    const proposal = mod(moderator, 'timeout', { member: offender, minutes: 10, reason: 'Flooding' })
    await module.dispatch(proposal)

    // Promoted above the moderator before the moderator confirms
    await members.offender.roles.add(roles.veteran)
    const confirmed = press(proposal, 'confirm')
    await module.dispatch(confirmed)

    expect(refusal(confirmed)).toMatch(/^Your highest role must be above /)
    expect(members.offender.timeout).not.toHaveBeenCalled()
    const again = press(proposal, 'confirm')
    await module.dispatch(again)
    expect(refusal(again)).toBe('Case #1 has already been handled.')
  })

  it('checks Ban Members again at Confirm', async () => {
    const { module, guild, members, roles, mod, press } = setup()
    const proposal = mod(senior, 'ban', { member: offender, reason: 'Raid' })
    await module.dispatch(proposal)

    // Moved to a role that can still moderate, but not ban, before confirming
    await members.senior.roles.remove(roles.senior)
    await members.senior.roles.add(roles.moderator)
    const confirmed = press(proposal, 'confirm', senior)
    await module.dispatch(confirmed)

    expect(refusal(confirmed)).toBe('You need the BanMembers permission for that.')
    expect(guild.members.ban).not.toHaveBeenCalled()
  })

  it('explains Discord’s refusal, and records that the case didn’t happen', async () => {
    const { module, members, mod, press } = setup()
    // As Discord answers when the bot's role lacks the permission, or sits below the member's highest role
    members.offender.timeout.mockRejectedValueOnce(createDiscordError(RESTJSONErrorCodes.MissingPermissions))

    const proposal = mod(moderator, 'timeout', { member: offender, minutes: 10, reason: 'Flooding' })
    await module.dispatch(proposal)
    const confirmed = press(proposal, 'confirm')
    await module.dispatch(confirmed)

    expect(refusal(confirmed)).toMatch(/^Discord refused: my role needs the permission/)
    const lookedUp = mod(moderator, 'case', { id: 1 })
    await module.dispatch(lookedUp)
    expect(JSON.stringify(lastPayload(lookedUp).embeds)).toContain('refused')
  })

  it('completes case numbers from this server only, newest first', async () => {
    const { module, mod, inGuild } = setup()
    for (const reason of ['One', 'Two']) await module.dispatch(mod(moderator, 'warn', { member: offender, reason }))
    // Another server's case, which this one's moderators must not see
    const { guild: elsewhere } = makeServer('100000000000000002')
    const warnedElsewhere = createMockInteraction(ChatInputCommandInteraction, {
      commandName: 'mod',
      user: moderator,
      options: createChatInputOptions({ subcommand: 'warn', member: offender, reason: 'Elsewhere' }),
      guildId: elsewhere.id,
      guild: elsewhere,
    })
    await module.dispatch(warnedElsewhere)
    expect(lastPayload(warnedElsewhere).content).toBe(`Case #3: warned ${offender}.`)

    const typing = createMockInteraction(AutocompleteInteraction, {
      commandName: 'mod',
      user: moderator,
      options: createChatInputOptions({ subcommand: 'case', id: '', focused: 'id' }),
      ...inGuild,
    })
    await module.dispatch(typing)

    expect(typing.respond).toHaveBeenCalledWith([
      { name: '#2 warn, done: Two', value: 2 },
      { name: '#1 warn, done: One', value: 1 },
    ])
  })
})
