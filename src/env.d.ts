interface TurnstileInstance {
  render: (container: HTMLElement, options: Record<string, unknown>) => string | number
  remove: (widgetId: string | number) => void
}

interface Window { turnstile?: TurnstileInstance }
