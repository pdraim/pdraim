import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends }) => {
    // Register client-side dependencies for invalidation
    depends('app:session');
    depends('app:chat');
    // Debug log for session data with more details
    console.debug('Layout load - Client session data:', {
        hasUser: !!data.user,
        userDetails: data.user ? {
            nickname: data.user.nickname,
            status: data.user.status,
            id: data.user.id
        } : null,
        hasSession: !!data.session,
        sessionDetails: data.session ? {
            id: data.session.id,
            expiresAt: new Date(data.session.expiresAt)
        } : null
    });

    // Return the data from the server load function
    return {
        user: data.user,
        session: data.session
    };
}; 