<!-- AIM Login Component Updated for Svelte5 with Sign In/Sign Up Tabs -->
<script lang="ts">
    import { draggable } from '$lib/actions/draggable';
    import type { RegisterResponse, RegisterResponseError } from '$lib/types/payloads';
    import type { User, SafeUser } from '$lib/types/chat';
    import { invalidateAll } from '$app/navigation';
    import { chatState } from '$lib/states/chat.svelte';
    import Turnstile from './turnstile.svelte';
    import { createSafeUser } from '$lib/types/chat';
    
    interface $$Props {
        showAuth: boolean;
        onLoginSuccess?: (user: SafeUser | null) => void;
        activeTab?: 'signin' | 'signup';
    }

    let { showAuth = $bindable(), onLoginSuccess, activeTab: initialTab = 'signin' } = $props();
    
    let activeTab = $state(initialTab);

    // Sign In state
    let siUsername = $state('');
    let siPassword = $state('');
    let error = $state('');
    let loginStatus = $state('idle');
    let siTurnstileToken = $state('');
  
    // Sign Up state
    let suUsername = $state('');
    let suPassword = $state('');
    let suConfirmPassword = $state('');
    let captchaAnswer = $state('');
    let signupError = $state('');
    let signupStatus = $state('idle');
    let suTurnstileToken = $state('');

    function handleClose() {
        console.debug("Closing AIM Login component.");
        showAuth = false;
    }

    async function handleSigninSubmit() {
        error = '';
        loginStatus = 'loading';
        if (!siUsername || !siPassword || !siTurnstileToken) {
            error = 'Please complete all fields including the security check';
            loginStatus = 'error';
            return;
        }

        console.debug("Attempting login for", siUsername);
        try {
            const res = await fetch('/api/session/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: siUsername, 
                    password: siPassword,
                    turnstileToken: siTurnstileToken
                })
            });

            const data = await res.json();
            if (!res.ok) {
                error = data.error || "Login failed.";
                console.debug("Login failed:", data.error);
                loginStatus = 'error';
                return;
            }

            console.debug("Login succeeded:", { ...data, user: data.user ? { ...data.user, password: '[REDACTED]' } : null });
            await chatState.setCurrentUser(data.user ? createSafeUser(data.user) : null);
            loginStatus = 'success';
            
            // Call the callback prop if provided
            onLoginSuccess?.(data.user ? createSafeUser(data.user) : null);
            // Auto close login window after 3 seconds on successful login
            setTimeout(() => {
                console.debug("Auto closing AIM Login component after successful login");
                invalidateAll();
                handleClose();
            }, 3000);

            return;
        } catch (err) {
            console.debug("Login error:", err);
            error = "Login error. Please try again.";
            loginStatus = 'error';
        }
    }

    // New: Create a helper function for client-side validations based on server rules.
    function validateSignupData(): string | null {
        // Trim values
        const username = suUsername.trim();
        const password = suPassword.trim();
        const confirmPasswordValue = suConfirmPassword.trim();

        if (!username || !password || !confirmPasswordValue) {
            return 'All fields must be filled';
        }

        if (username.length < 3) {
            return 'Username must be at least 3 characters';
        }

        if (username.length > 32) {
            return 'Username must be at most 32 characters';
        }

        // Only allow letters, numbers, underscores, and dashes in the username.
        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!usernameRegex.test(username)) {
            return 'Invalid username. Only letters, numbers, underscores, and dashes are allowed.';
        }

        if (password !== confirmPasswordValue) {
            return 'Passwords do not match';
        }

        if (password.length < 8 || password.length > 64) {
            return 'Password must be between 8 and 64 characters';
        }

        // All checks passed.
        return null;
    }

    async function handleSignupSubmit() {
        signupError = '';
        signupStatus = 'loading';

        // Client-side validations before submitting the form.
        const validationError = validateSignupData();
        if (validationError) {
            signupError = validationError;
            signupStatus = 'error';
            return;
        }

        // Additional check for captcha and Turnstile token,
        // in case those fields are not filled.
        if (!captchaAnswer || !suTurnstileToken) {
            signupError = 'Please complete all fields including the security check';
            signupStatus = 'error';
            return;
        }

        console.debug("Attempting registration for", suUsername);
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    suUsername,
                    suPassword,
                    suConfirmPassword,
                    captchaAnswer,
                    turnstileToken: suTurnstileToken
                })
            });

            const data = await res.json() as RegisterResponse;
            if (!res.ok) {
                const errorData = data as RegisterResponseError;
                signupError = errorData.error || "Registration failed.";
                signupStatus = 'error';
                return;
            }
            console.debug("Registration succeeded:", data);
            signupStatus = 'success';

            // Auto login after registration.
            await handleAutoLoginSignup();
            return;
        } catch (err) {
            console.debug("Registration error", err);
            signupError = "Registration error. Please try again.";
            signupStatus = 'error';
        }
    }

    async function handleAutoLoginSignup() {
        try {
            const res = await fetch('/api/session/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: suUsername, password: suPassword })
            });
            const data = await res.json();
            if (!res.ok) {
                signupError = data.error || "Login failed after registration.";
                signupStatus = 'error';
                return;
            }
            console.debug("Auto login after registration succeeded:", data);
            await chatState.setCurrentUser(data.user ? createSafeUser(data.user) : null);
            onLoginSuccess?.(data.user ? createSafeUser(data.user) : null);
            setTimeout(() => {
                console.debug("Auto closing AIM Login component after auto login on registration");
                invalidateAll();
                handleClose();
            }, 3000);

        } catch (err) {
            console.debug("Auto login error:", err);
            signupError = "Auto login error. Please try to login manually.";
            signupStatus = 'error';
        }
    }

    function switchTab(tab: string) {
        activeTab = tab;
        error = '';
        signupError = '';
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            console.debug("Escape key pressed, closing AIM Login component.");
            handleClose();
        }
    }

    // Added dragging state and handler similar to chat-room
    let windowX = $state(0);
    let windowY = $state(0);
    
    function handleDragMove(event: CustomEvent<{ x: number; y: number }>) {
        windowX = event.detail.x;
        windowY = event.detail.y;
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Updated outer div to handle dragging with inline style and drag event -->
<div class="login-window window" use:draggable={{ handle: '.title-bar' }} ondragmove={handleDragMove} style="left: {windowX}px; top: {windowY}px;">
    <div class="title-bar">
        <div class="title-bar-text">
            <img src="/desktop/aim-desktop-icon.png" alt="AIM" class="title-icon" width="16" height="16" />
            {activeTab === 'signin' ? 'Connexion' : 'Inscription'}
        </div>
        <div class="title-bar-controls">
            <button aria-label="Close" onclick={handleClose}>×</button>
        </div>
    </div>

    <div class="tabs">
        <button class:active={activeTab === 'signin'} onclick={() => switchTab('signin')}>Connexion</button>
        <button class:active={activeTab === 'signup'} onclick={() => switchTab('signup')}>Inscription</button>
    </div>

    <div class="window-content">
         {#if activeTab === 'signin'}
            <form onsubmit={handleSigninSubmit}>
                <div class="form-group">
                    <label for="si-username">Nom d'utilisateur</label>
                    <input type="text" id="si-username" bind:value={siUsername} placeholder="Nom d'utilisateur" />
                </div>
                <div class="form-group">
                    <label for="si-password">Mot de passe</label>
                    <input type="password" id="si-password" bind:value={siPassword} placeholder="Mot de passe" />
                </div>
                <Turnstile onVerify={(token: string) => siTurnstileToken = token} />
                {#if error}
                    <div class="error">{error}</div>
                {/if}
                <div class="button-bar">
                    <button type="submit" class="icon-button {loginStatus === 'success' ? 'success-border' : loginStatus === 'error' ? 'error-border' : ''}">
                        {#if loginStatus === 'loading'}
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"></circle>
                                <path d="M12 2a10 10 0 0 1 0 20" stroke="currentColor" stroke-width="2" fill="none">
                                    <animateTransform attributeName="transform" type="rotate" values="0 12 12;360 12 12" dur="1s" repeatCount="indefinite"/>
                                </path>
                            </svg>
                        {:else if loginStatus === 'success'}
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <path d="M20 6L9 17l-5-5" stroke="green" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        {:else if loginStatus === 'error'}
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="red" stroke-width="2" fill="none"/>
                                <line x1="12" y1="8" x2="12" y2="13" stroke="red" stroke-width="2" stroke-linecap="round"/>
                                <circle cx="12" cy="17" r="1" fill="red"/>
                            </svg>
                        {:else}
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 4C9.24 4 7 6.24 7 9c0 2.76 2.24 5 5 5s5-2.24 5-5c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 10c-3.33 0-7 1.67-7 5v1h14v-1c0-3.33-3.67-5-7-5zm0 2c2.67 0 5 1.33 5 3H7c0-1.67 2.33-3 5-3z" fill="currentColor"/>
                            </svg>
                        {/if}
                        Se connecter
                    </button>
                </div>
            </form>
         {:else}
            <form onsubmit={handleSignupSubmit}>
                <div class="form-group">
                    <label for="su-username">Nom d'utilisateur</label>
                    <input type="text" id="su-username" bind:value={suUsername} placeholder="Choisissez un nom d'utilisateur" />
                </div>
                <div class="form-group">
                    <label for="su-password">Mot de passe</label>
                    <input type="password" id="su-password" bind:value={suPassword} placeholder="Mot de passe" />
                </div>
                <div class="form-group">
                    <label for="su-confirm-password">Confirmer le mot de passe</label>
                    <input type="password" id="su-confirm-password" bind:value={suConfirmPassword} placeholder="Confirmer le mot de passe" />
                </div>
                <div class="form-group">
                    <label for="captcha">Quelle est la signification de PDR ?</label>
                    <input type="text" id="captcha" bind:value={captchaAnswer} placeholder="Entrez votre réponse" />
                </div>
                <Turnstile onVerify={(token: string) => suTurnstileToken = token} />
                {#if signupError}
                    <div class="error">{signupError}</div>
                {/if}
                <div class="button-bar">
                    <button type="submit" class="icon-button {signupStatus === 'success' ? 'success-border' : signupStatus === 'error' ? 'error-border' : ''}">
                        {#if signupStatus === 'loading'}
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"></circle>
                                <path d="M12 2a10 10 0 0 1 0 20" stroke="currentColor" stroke-width="2" fill="none">
                                    <animateTransform attributeName="transform" type="rotate" values="0 12 12;360 12 12" dur="1s" repeatCount="indefinite"></animateTransform>
                                </path>
                            </svg>
                        {:else if signupStatus === 'success'}
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <path d="M20 6L9 17l-5-5" stroke="green" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
                            </svg>
                        {:else if signupStatus === 'error'}
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="red" stroke-width="2" fill="none"></circle>
                                <line x1="12" y1="8" x2="12" y2="13" stroke="red" stroke-width="2" stroke-linecap="round"></line>
                                <circle cx="12" cy="17" r="1" fill="red"></circle>
                            </svg>
                        {:else}
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"></path>
                            </svg>
                        {/if}
                        S'inscrire
                    </button>
                </div>
            </form>
         {/if}
    </div>
</div>

<style>
    .login-window {
        width: 300px;
        background: #ECE9D8;
        /* Changed to fixed positioning for correct dragging */
        position: fixed;
    }

    @media (max-width: 768px) {
        .login-window {
            width: 100% !important;
            height: 100% !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            margin: 0 !important;
            border-radius: 0 !important;
            transform: none !important;
        }

        .window-content {
            height: calc(100% - 80px); /* Account for title bar and tabs */
            overflow-y: auto;
        }

        form {
            max-width: 400px;
            margin: 0 auto;
            padding: 1rem;
        }
    }

    .title-bar {
        background: linear-gradient(180deg, #0054E3 0%, #0047AB 100%);
        padding: 4px 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: white;
        font-weight: bold;
        user-select: none;
        position: relative;
    }
    .title-bar-text {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.875rem;
    }

    .tabs {
        padding: 0 3px;
        display: flex;
        border-bottom: 1px solid #0054E3;
    }
    .tabs button {
        flex: 1;
        padding: 8px;
        border: none;
        background: #ECE9D8;
        font-size: 1rem;
        cursor: pointer;
    }
    .tabs button.active {
        background: #fff;
        border-bottom: 2px solid #0054E3;
        font-weight: bold;
    }
    .window-content {
        padding: 16px;
    }
    .form-group {
        margin-bottom: 16px;
    }
    .form-group label {
        display: block;
        margin-bottom: 4px;
        font-size: 1rem;
    }
    .form-group input {
        width: 100%;
        padding: 4px;
        font-size: 1rem;
        font-family: Arial, Verdana, Tahoma, sans-serif;
    }
    .button-bar {
        display: flex;
        justify-content: center;
        margin-top: 20px;
    }
    .icon-button {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1rem;
        color: black;
    }
    .error {
        color: red;
        font-size: 1rem;
        margin-top: 8px;
    }
    .success-border {
        border: 2px solid green;
    }
    .error-border {
        border: 2px solid red;
    }
</style> 