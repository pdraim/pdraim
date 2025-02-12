<!-- AIM Login Component Updated for Svelte5 with Sign In/Sign Up Tabs -->
<script lang="ts">
    import { draggable } from '$lib/actions/draggable';
    import type { RegisterResponse, RegisterResponseError } from '$lib/types/payloads';
    import type { User } from '$lib/types/chat';
    import { invalidate } from '$app/navigation';
    import { createEventDispatcher } from 'svelte';
    
    let { onLoginSuccess }: { onLoginSuccess?: (user: User) => void } = $props();
    const dispatch = createEventDispatcher();
    
    let activeTab = $state('signin');

    // Sign In state
    let siUsername = $state('');
    let siPassword = $state('');
    let savePassword = $state(true);
    let autoLogin = $state(false);
    let error = $state('');
    let loginStatus = $state('idle');
  
    // Sign Up state
    let suUsername = $state('');
    let suPassword = $state('');
    let suConfirmPassword = $state('');
    let captchaAnswer = $state('');
    let signupError = $state('');
    let signupStatus = $state('idle');

    async function handleSigninSubmit() {
        error = '';
        loginStatus = 'loading';
        if (!siUsername || !siPassword) {
            error = 'Please enter both username and password';
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
                    password: siPassword 
                })
            });

            const data = await res.json();
            if (!res.ok) {
                error = data.error || "Login failed.";
                console.debug("Login failed:", data.error);
                loginStatus = 'error';
                return;
            }

            console.debug("Login succeeded:", data);
            loginStatus = 'success';
            
            // Invalidate all session-related dependencies
            await Promise.all([
                invalidate('app:session'),
                invalidate('app:chat'),
                invalidate('custom:chat:session'),
                invalidate('chat:session')
            ]);
            
            // Call the callback prop if provided
            onLoginSuccess?.(data.user);
            // Auto close login window after 3 seconds on successful login
            setTimeout(() => {
                console.debug("Auto closing AIM Login component after successful login");
                handleClose();
            }, 3000);

            return;
        } catch (err) {
            console.debug("Login error:", err);
            error = "Login error. Please try again.";
            loginStatus = 'error';
        }
    }

    async function handleSignupSubmit() {
        signupError = '';
        signupStatus = 'loading';
        if (!suUsername || !suPassword || !suConfirmPassword || !captchaAnswer) {
            signupError = 'Please fill all fields';
            signupStatus = 'error';
            return;
        }
        if (suPassword !== suConfirmPassword) {
            signupError = 'Passwords do not match';
            signupStatus = 'error';
            return;
        }

        console.debug("Attempting registration for", suUsername);
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suUsername, suPassword, suConfirmPassword, captchaAnswer })
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

            // Auto login after registration
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
            await Promise.all([
                invalidate('app:session'),
                invalidate('app:chat'),
                invalidate('custom:chat:session'),
                invalidate('chat:session')
            ]);
            onLoginSuccess?.(data.user);
            setTimeout(() => {
                console.debug("Auto closing AIM Login component after auto login on registration");
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
    
    function handleClose() {
        console.debug("Closing AIM Login component.");
        dispatch('close');
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
            {activeTab === 'signin' ? 'Sign In' : 'Sign Up'}
        </div>
        <div class="title-bar-controls">
            <button aria-label="Close" onclick={handleClose}>×</button>
        </div>
    </div>

    <div class="tabs">
        <button class:active={activeTab === 'signin'} onclick={() => switchTab('signin')}>Sign In</button>
        <button class:active={activeTab === 'signup'} onclick={() => switchTab('signup')}>Sign Up</button>
    </div>

    <div class="window-content">
         {#if activeTab === 'signin'}
            <form onsubmit={handleSigninSubmit}>
                <div class="form-group">
                    <label for="si-username">Username</label>
                    <input type="text" id="si-username" bind:value={siUsername} placeholder="Username" />
                </div>
                <div class="form-group">
                    <label for="si-password">Password</label>
                    <input type="password" id="si-password" bind:value={siPassword} placeholder="Password" />
                </div>
                <div class="checkboxes">
                    <label>
                        <input type="checkbox" bind:checked={savePassword} />
                        Save password
                    </label>
                    <label>
                        <input type="checkbox" bind:checked={autoLogin} />
                        Auto-login
                    </label>
                </div>
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
                        Sign In
                    </button>
                </div>
            </form>
         {:else}
            <form onsubmit={handleSignupSubmit}>
                <div class="form-group">
                    <label for="su-username">Username</label>
                    <input type="text" id="su-username" bind:value={suUsername} placeholder="Choose a username" />
                </div>
                <div class="form-group">
                    <label for="su-password">Password</label>
                    <input type="password" id="su-password" bind:value={suPassword} placeholder="Password" />
                </div>
                <div class="form-group">
                    <label for="su-confirm-password">Confirm Password</label>
                    <input type="password" id="su-confirm-password" bind:value={suConfirmPassword} placeholder="Confirm Password" />
                </div>
                <div class="form-group">
                    <label for="captcha">What's the meaning of PDR?</label>
                    <input type="text" id="captcha" bind:value={captchaAnswer} placeholder="Enter your answer" />
                </div>
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
                        Sign Up
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
    }
    .checkboxes {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
        font-size: 1rem;
    }
    .checkboxes label {
        display: flex;
        align-items: center;
        gap: 4px;
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