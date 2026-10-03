import { UserError } from 'meocord/common'
import { Service } from 'meocord/decorator'

export interface Feedback {
  id: number
  authorId: string
  about: string
  details: string
  status: 'open' | 'approved' | 'rejected'
}

/** Holds feedback in memory, so a restart forgets it; the moderation bot shows a lasting store. */
@Service()
export class FeedbackService {
  private readonly items = new Map<number, Feedback>()
  private next = 1

  add(entry: Pick<Feedback, 'authorId' | 'about' | 'details'>): Feedback {
    const feedback: Feedback = { ...entry, id: this.next++, status: 'open' }
    this.items.set(feedback.id, feedback)
    return feedback
  }

  decide(id: number, status: 'approved' | 'rejected'): Feedback {
    const feedback = this.items.get(id)
    // A UserError is shown only to the user who clicked, as something they can act on rather than a fault
    if (!feedback) throw new UserError(`Feedback #${id} is no longer held: the bot has restarted since it was posted.`)
    // Two staff can click at once; the second is told, and the post and the author are left as the first decided
    if (feedback.status !== 'open') throw new UserError(`Feedback #${id} was already ${feedback.status}.`)
    feedback.status = status
    return feedback
  }
}
