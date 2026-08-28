type ReviewState = Readonly<Record<string, boolean>>
type StorageData = Readonly<Record<string, ReviewState>>

const SELECTORS = [
  "[data-comment-id]",
  ".js-comment-container[id^=discussion_r]",
  ".review-comment[id^=discussion_r]",
] as const
const ROOT_ATTRIBUTE = "data-review-checklist-root"
const CONTROL_ATTRIBUTE = "data-review-checklist-control"
const FILTER_ATTRIBUTE = "data-review-checklist-filter"
const STORAGE_KEY = "github-review-checklist"
let storageWriteQueue: Promise<void> = Promise.resolve()

const getPullRequestKey = (): string | null => {
  const match = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  return match === null ? null : `${match[1]}/${match[2]}/pull/${match[3]}`
}

const getCommentId = (comment: Element): string | null => {
  const dataId = comment.getAttribute("data-comment-id")
  if (dataId !== null && dataId.length > 0) return dataId

  const id = comment.id.match(/(?:discussion_r|pullrequestreview-)(\d+)/)
  return id?.[1] ?? null
}

const findComments = (): readonly Element[] => {
  const comments = new Set<Element>()
  for (const selector of SELECTORS) {
    for (const comment of Array.from(document.querySelectorAll(selector))) comments.add(comment)
  }
  return [...comments].filter((comment) => getCommentId(comment) !== null)
}

const readStorage = async (): Promise<StorageData> => {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const value: unknown = result[STORAGE_KEY]
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  const storage: Record<string, ReviewState> = {}
  for (const [key, state] of Object.entries(value)) {
    if (typeof state !== "object" || state === null || Array.isArray(state)) continue
    const reviewState: Record<string, boolean> = {}
    for (const [commentId, done] of Object.entries(state)) {
      if (typeof done === "boolean") reviewState[commentId] = done
    }
    storage[key] = reviewState
  }
  return storage
}

const saveCommentState = (
  pullRequestKey: string,
  commentId: string,
  done: boolean,
): Promise<void> => {
  storageWriteQueue = storageWriteQueue.then(async () => {
    const storage = await readStorage()
    const states = storage[pullRequestKey] ?? {}
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...storage,
        [pullRequestKey]: { ...states, [commentId]: done },
      },
    })
  })
  return storageWriteQueue
}

const findControlTarget = (comment: Element): Element => {
  return (
    comment
      .closest(".js-inline-comments-container")
      ?.querySelector("form.js-resolvable-timeline-thread-form") ??
    comment.querySelector(".comment-header, .timeline-comment-header, .review-comment-header") ??
    comment
  )
}

const renderControl = (
  comment: Element,
  done: boolean,
  onChange: (done: boolean) => void,
): void => {
  const target = findControlTarget(comment)
  const existing = target.querySelector<HTMLElement>(`[${CONTROL_ATTRIBUTE}]`)
  if (existing !== null) {
    if (existing.parentElement !== target) target.append(existing)
    existing.closest("form")?.classList.remove("review-checklist-resolve-row")
    comment.toggleAttribute(ROOT_ATTRIBUTE, done)
    return
  }

  const control = document.createElement("label")
  control.setAttribute(CONTROL_ATTRIBUTE, "true")
  control.className = "review-checklist-control"
  control.title = "Mark this review comment as fixed"

  const checkbox = document.createElement("input")
  checkbox.type = "checkbox"
  checkbox.checked = done
  checkbox.addEventListener("change", () => onChange(checkbox.checked))

  const text = document.createElement("span")
  text.textContent = "Fixed"
  control.append(checkbox, text)

  target.append(control)
  comment.toggleAttribute(ROOT_ATTRIBUTE, done)
}

const renderProgress = (comments: readonly Element[], states: ReviewState): void => {
  const existing = document.querySelector<HTMLElement>(`[${ROOT_ATTRIBUTE}=progress]`)
  const progress = existing ?? document.createElement("aside")
  progress.setAttribute(ROOT_ATTRIBUTE, "progress")
  progress.className = "review-checklist-progress"

  const ids = comments.map(getCommentId).filter((id): id is string => id !== null)
  const fixed = ids.filter((id) => states[id] === true).length
  progress.textContent = `Review checklist: ${fixed} / ${ids.length} fixed`

  if (existing === null) {
    const target = document.querySelector(".gh-header-actions, .gh-header-meta")
    ;(target ?? document.body).prepend(progress)
  }
}

const renderFilter = (comments: readonly Element[]): void => {
  const existing = document.querySelector<HTMLElement>(`[${FILTER_ATTRIBUTE}]`)
  const filter = existing ?? document.createElement("div")
  filter.setAttribute(FILTER_ATTRIBUTE, "true")
  filter.className = "review-checklist-filter"

  if (existing === null) {
    const all = document.createElement("button")
    all.type = "button"
    all.textContent = "All"
    all.addEventListener("click", () => {
      filter.dataset["mode"] = "all"
      for (const comment of comments) {
        if (comment instanceof HTMLElement) comment.hidden = false
      }
    })

    const open = document.createElement("button")
    open.type = "button"
    open.textContent = "Only open"
    open.addEventListener("click", () => {
      filter.dataset["mode"] = "open"
      for (const comment of comments) {
        const checkbox = comment.querySelector<HTMLInputElement>(
          `[${CONTROL_ATTRIBUTE}] input[type="checkbox"]`,
        )
        if (comment instanceof HTMLElement) comment.hidden = checkbox?.checked === true
      }
    })
    filter.append(all, open)
    const progress = document.querySelector(`[${ROOT_ATTRIBUTE}=progress]`)
    ;(progress?.parentElement ?? document.body).prepend(filter)
  }
}

const render = async (): Promise<void> => {
  const pullRequestKey = getPullRequestKey()
  if (pullRequestKey === null) return

  const comments = findComments()
  if (comments.length === 0) return

  const storage = await readStorage()
  const states = storage[pullRequestKey] ?? {}
  for (const comment of comments) {
    const commentId = getCommentId(comment)
    if (commentId === null) continue
    renderControl(comment, states[commentId] === true, (done) => {
      const nextStates = { ...states, [commentId]: done }
      void saveCommentState(pullRequestKey, commentId, done)
      comment.toggleAttribute(ROOT_ATTRIBUTE, done)
      renderProgress(comments, nextStates)
    })
  }
  renderProgress(comments, states)
  renderFilter(comments)
}

const isExtensionNode = (node: Node): boolean => {
  if (!(node instanceof Element)) return false
  return (
    node.matches(`[${ROOT_ATTRIBUTE}], [${CONTROL_ATTRIBUTE}], [${FILTER_ATTRIBUTE}]`) ||
    node.querySelector(`[${ROOT_ATTRIBUTE}], [${CONTROL_ATTRIBUTE}], [${FILTER_ATTRIBUTE}]`) !==
      null
  )
}

const start = (): void => {
  let renderQueued = false
  const scheduleRender = (): void => {
    if (renderQueued) return
    renderQueued = true
    queueMicrotask(() => {
      renderQueued = false
      void render()
    })
  }

  const observer = new MutationObserver((mutations) => {
    const pageChanged = mutations.some((mutation) => {
      if (isExtensionNode(mutation.target)) return false
      return Array.from(mutation.addedNodes).some((node) => !isExtensionNode(node))
    })
    if (pageChanged) scheduleRender()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener("turbo:load", scheduleRender)
  window.addEventListener("popstate", scheduleRender)
  scheduleRender()
}

if (document.body !== null) start()
else document.addEventListener("DOMContentLoaded", start, { once: true })
