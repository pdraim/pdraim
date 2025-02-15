import type { Cookies } from "@sveltejs/kit";

// Helper function to determine cookie domain
function getCookieDomain(): string | undefined {
    if (process.env.NODE_ENV === 'production') {
        // Check for Cloudflare Pages domain
        if (process.env.CF_PAGES_URL) {
            console.debug("Cloudflare Pages URL:", process.env.CF_PAGES_URL);
            // For preview deployments, use host-only cookie
            if (process.env.CF_PAGES_BRANCH !== 'main') {
                return undefined;
            }
            // For production, use the main domain
            return '.pdraim.pages.dev';
        }
        // Fallback for custom domain
        return '.pdraim.org';
    }
    return undefined;
}

export function setSessionTokenCookie({ cookies }: { cookies: Cookies }, token: string, expiresAt: number): void {
    console.debug("Setting session cookie with expiry:", new Date(expiresAt));
    
    const domain = getCookieDomain();
    console.debug("Setting cookie for domain:", domain);
        
    cookies.set("session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === 'production',
        domain, 
        expires: new Date(expiresAt),
        path: "/"
    });
}

export function deleteSessionTokenCookie({ cookies }: { cookies: Cookies }): void {
    console.debug("Deleting session cookie");
    
    const domain = getCookieDomain();
    console.debug("Deleting cookie for domain:", domain);
        
    cookies.set("session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === 'production',
        domain,
        maxAge: 0,
        path: "/"
    });
}

export function getSessionTokenCookie({ cookies }: { cookies: Cookies }): string | undefined {
    console.debug("Getting session cookie");
    return cookies.get("session");
} 