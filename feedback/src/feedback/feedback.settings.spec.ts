import { FeedbackSettings } from '@src/feedback/feedback.settings.js'

const valid = { FEEDBACK_CHANNEL_ID: '400000000000000001', STAFF_ROLE_ID: '300000000000000001' }

describe('FeedbackSettings', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reads the review channel and the staff role from the environment', () => {
    for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value)

    expect(new FeedbackSettings()).toMatchObject({
      reviewChannelId: valid.FEEDBACK_CHANNEL_ID,
      staffRoleId: valid.STAFF_ROLE_ID,
    })
  })

  // Made as the bot starts, so a missing or mistyped id stops it there rather than at the first feedback
  it.each([
    ['FEEDBACK_CHANNEL_ID', ''],
    ['STAFF_ROLE_ID', 'staff'],
  ])('refuses %s set to %j, naming it', (key, value) => {
    for (const [name, id] of Object.entries(valid)) vi.stubEnv(name, id)
    vi.stubEnv(key, value)

    expect(() => new FeedbackSettings()).toThrow(key)
  })
})
