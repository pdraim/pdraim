import type { Cookies } from "@sveltejs/kit";

export function setSessionTokenCookie({ cookies }: { cookies: Cookies }, token: string, expiresAt: number): void {
    console.debug("Setting session cookie with expiry:", new Date(expiresAt));
    cookies.set("session", token, {
        httpOnly: true,
        sameSite: "lax",
        expires: new Date(expiresAt),
        path: "/"
    });
}

export function deleteSessionTokenCookie({ cookies }: { cookies: Cookies }): void {
    console.debug("Deleting session cookie");
    cookies.set("session", "", {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 0,
        path: "/"
    });
}

export function getSessionTokenCookie({ cookies }: { cookies: Cookies }): string | undefined {
    console.debug("Getting session cookie");
    return cookies.get("session");
} 