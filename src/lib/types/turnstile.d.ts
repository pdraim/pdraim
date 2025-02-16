interface Turnstile {
    render: (element: HTMLElement, options: TurnstileOptions) => string;
    remove: (widgetId: string) => void;
}

interface TurnstileOptions {
    sitekey: string;
    callback: (token: string) => void;
    "refresh-expired"?: "auto" | "manual";
    size?: "invisible" | "normal" | "compact";
    "error-callback"?: (error: unknown) => void;
    "expired-callback"?: () => void;
    theme?: "light" | "dark" | "auto";
    language?: string;
}

declare global {
    interface Window {
        turnstile?: Turnstile;
    }
}

export type { Turnstile, TurnstileOptions }; 