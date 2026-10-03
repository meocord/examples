/** Compares two versions by semver precedence: negative when a is older, and a prerelease before its release. */
export function compareVersions(a, b) {
  const parse = version => {
    const [core, pre] = version.split('-', 2)
    return { core: core.split('.').map(Number), pre: pre ? pre.split('.') : [] }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) if ((x.core[i] ?? 0) !== (y.core[i] ?? 0)) return (x.core[i] ?? 0) - (y.core[i] ?? 0)
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const [p, q] = [x.pre[i], y.pre[i]]
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1
    if (p === q) continue
    const numeric = /^\d+$/.test(p) && /^\d+$/.test(q)
    return numeric ? Number(p) - Number(q) : p < q ? -1 : 1
  }
  return 0
}

// A range that is one floor: an operator, then a version
const FLOOR = /^([\^~]|>=)?\s*(\d+\.\d+\.\d+(?:-[\w.]+)?)$/

/**
 * Whether a bot's range for a dependency is behind the template's: a floor older than the template's, or a range of
 * another shape. A newer floor, as Dependabot raises it, isn't.
 */
export function olderFloor(template, bot) {
  const [a, b] = [FLOOR.exec(template.trim()), FLOOR.exec(bot.trim())]
  if (!a || !b || (a[1] ?? '') !== (b[1] ?? '')) return template !== bot
  return compareVersions(b[2], a[2]) < 0
}

/** The oldest Node an engines range allows, such as `22.13` from `>=22.13`; one that isn't a single floor is refused. */
export function engineFloor(range) {
  const match = /^>=\s*(\d+(?:\.\d+){0,2})$/.exec(range.trim())
  if (!match) throw new Error(`meocord's engines.node is "${range}", which isn't one floor such as ">=22.13".`)
  return match[1]
}
