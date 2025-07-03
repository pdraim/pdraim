import type { PageServerLoad } from './$types';
import { validateSessionToken } from '$lib/api/session.server';
import db from '$lib/db/db.server';
import { userTextPreferences, users, messages } from '$lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { DEFAULT_TEXT_STYLE, type TextStyle } from '$lib/types/text-formatting';

export const load: PageServerLoad = async ({ cookies }) => {
    const token = cookies.get('session');
    
    if (!token) {
        return {
            user: null,
            lastTextStyle: DEFAULT_TEXT_STYLE
        };
    }

    try {
        const { user } = await validateSessionToken(token);
        
        if (!user) {
            return {
                user: null,
                lastTextStyle: DEFAULT_TEXT_STYLE
            };
        }

        // Get user's last used text styling from their most recent message
        const lastMessage = await db.query.messages.findFirst({
            where: eq(messages.senderId, user.id),
            orderBy: [desc(messages.timestamp)],
            columns: {
                styleData: true
            }
        });

        let lastTextStyle: TextStyle = DEFAULT_TEXT_STYLE;

        if (lastMessage?.styleData) {
            try {
                const parsedStyle = JSON.parse(lastMessage.styleData);
                // Merge with default style to ensure all required properties
                lastTextStyle = {
                    ...DEFAULT_TEXT_STYLE,
                    ...parsedStyle
                };
            } catch (error) {
                console.warn('Failed to parse last text style:', error);
            }
        }

        return {
            user,
            lastTextStyle
        };
    } catch (error) {
        console.error('Error loading page data:', error);
        return {
            user: null,
            lastTextStyle: DEFAULT_TEXT_STYLE
        };
    }
};