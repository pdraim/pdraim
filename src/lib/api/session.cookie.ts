import type { Cookies } from "@sveltejs/kit";

export function setSessionTokenCookie({ cookies }: { cookies: Cookies }, token: string, expiresAt: number): void {
    console.debug("Setting session cookie with expiry:", new Date(expiresAt));
    
    // Get the current domain based on environment and host
    const domain = process.env.NODE_ENV === 'production' 
        ? (process.env.VERCEL_URL?.includes('pages.dev') ? '.pdraim.pages.dev' : '.pdraim.org')
        : undefined;  // Use default domain in development
        
    console.debug("Setting cookie for domain:", domain);
        
    cookies.set("session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === 'production',  // Only use secure in production
        domain,  // Set domain based on environment
        expires: new Date(expiresAt),
        path: "/"
    });
}

export function deleteSessionTokenCookie({ cookies }: { cookies: Cookies }): void {
    console.debug("Deleting session cookie");
    
    // Get the current domain based on environment and host
    const domain = process.env.NODE_ENV === 'production' 
        ? (process.env.VERCEL_URL?.includes('pages.dev') ? '.pdraim.pages.dev' : '.pdraim.org')
        : undefined;  // Use default domain in development
        
    console.debug("Deleting cookie for domain:", domain);
        
    cookies.set("session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === 'production',  // Only use secure in production
        domain,  // Set domain based on environment
        maxAge: 0,
        path: "/"
    });
}

export function getSessionTokenCookie({ cookies }: { cookies: Cookies }): string | undefined {
    console.debug("Getting session cookie");
    return cookies.get("session");
} 