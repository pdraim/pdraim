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
        session: data.session,
        meta: {
            title: 'PDR AIM - Sandbox',
            description: 'Un projet sandbox non lucratif qui recrée l\'ambiance des salons de discussion de l\'époque AOL/AIM. Une expérience nostalgique dans un environnement Windows XP.',
            keywords: 'sandbox chat, AOL, AIM, salon de discussion, Windows XP, projet non lucratif, rétro',
            ogImage: '/og-image.jpg',
            type: 'website',
            url: 'https://pdraim.org',
            locale: 'fr_FR'
        }
    };
}; 