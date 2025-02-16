<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
    import type { Turnstile, TurnstileOptions } from '$lib/types/turnstile';

    let isVerified = $state(false);

    type OnVerifyCallback = (token: string) => void;
    let { onVerify } = $props<{ onVerify: OnVerifyCallback }>();
    
    let turnstileElement = $state<HTMLDivElement | null>(null);
    let widgetId = '';

    // Ensure site key is a string and trim any whitespace
    const siteKey = String(PUBLIC_TURNSTILE_SITE_KEY).trim();

    onMount(() => {
        if (!window.turnstile) {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);

            script.onload = initTurnstile;
        } else {
            initTurnstile();
        }

        return () => {
            if (widgetId) {
                window.turnstile?.remove(widgetId);
            }
        };
    });

    function initTurnstile() {
        if (!turnstileElement || !window.turnstile) return;
        
        // Validate site key is a non-empty string
        if (!siteKey) {
            console.error('Turnstile site key is missing');
            return;
        }

        const options: TurnstileOptions = {
            sitekey: siteKey,
            callback: (token: string) => {
                if (typeof onVerify === 'function') {
                    onVerify(token);
                    isVerified = true;
                } else {
                    console.error('onVerify callback is not a function');
                }
            },
            'refresh-expired': 'auto',
            size: 'compact',
            'error-callback': (error: unknown) => {
                console.error('Turnstile error:', error);
                isVerified = false; // Reset verification state on error
            }
        };

        try {
            widgetId = window.turnstile.render(turnstileElement, options);
            
            // Add resize handler
            const handleResize = () => scaleTurnstileToFit();
            window.addEventListener('resize', handleResize);
            // Initial scale
            scaleTurnstileToFit();
            
        } catch (error) {
            console.error('Failed to render Turnstile:', error);
        }
    }

    function scaleTurnstileToFit() {
        const container = turnstileElement;
        if (!container) return;

        const iframe = container.querySelector('iframe');
        if (!iframe) return;

        const containerWidth = container.offsetWidth;
        const scale = Math.min(1, containerWidth / 300); // 300px is approximate base width

        iframe.style.transform = `scale(${scale})`;
        iframe.style.transformOrigin = 'center center';
    }
</script>

{#if !isVerified}
    <div 
        class="turnstile-wrapper" 
        transition:fade={{ duration: 300 }}
    >
        <div bind:this={turnstileElement} class="turnstile-container" data-theme="light"></div>
    </div>
{/if}

<style>
    .turnstile-wrapper {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 65px; /* Approximate height for compact size */
        overflow: hidden;
    }

    .turnstile-container {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    /* Handle iframe scaling */
    :global(.turnstile-wrapper iframe) {
        transition: transform 0.2s ease-in-out;
    }
</style> 