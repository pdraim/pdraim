<!-- AIM Login Component Updated for Svelte5 with Sign In/Sign Up Tabs -->
<script lang="ts">
    import { draggable } from '$lib/actions/draggable';
    import { createEventDispatcher } from 'svelte';
    
    const dispatch = createEventDispatcher();

    let activeTab = $state('signin');

    // Sign In state
    let siUsername = $state('');
    let siPassword = $state('');
    let savePassword = $state(true);
    let autoLogin = $state(false);
    let error = $state('');
  
    // Sign Up state
    let suUsername = $state('');
    let suPassword = $state('');
    let suConfirmPassword = $state('');
    let captchaAnswer = $state('');
    let signupError = $state('');

    function handleSigninSubmit() {
        error = '';
        if (!siUsername || !siPassword) {
            error = 'Please enter both username and password';
            return;
        }
        // TODO: Implement authentication for sign in
        console.log('Sign in', siUsername, siPassword, savePassword, autoLogin);
    }

    function handleSignupSubmit() {
        signupError = '';
        if (!suUsername || !suPassword || !suConfirmPassword || !captchaAnswer) {
            signupError = 'Please fill all fields';
            return;
        }
        if (suPassword !== suConfirmPassword) {
            signupError = 'Passwords do not match';
            return;
        }
        if (captchaAnswer.toLowerCase() !== 'personal digital repository') {
            signupError = 'Incorrect captcha answer';
            return;
        }
        // TODO: Implement registration for sign up
        console.log('Sign up', suUsername, suPassword);
    }

    function switchTab(tab: string) {
        activeTab = tab;
        error = '';
        signupError = '';
    }
    
    function handleClose() {
        dispatch('close');
    }

    // Added dragging state and handler similar to chat-room
    let windowX = $state(0);
    let windowY = $state(0);
    
    function handleDragMove(event: CustomEvent<{ x: number; y: number }>) {
        windowX = event.detail.x;
        windowY = event.detail.y;
    }
</script>

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
                    <button type="submit" class="icon-button">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 4C9.24 4 7 6.24 7 9c0 2.76 2.24 5 5 5s5-2.24 5-5c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 10c-3.33 0-7 1.67-7 5v1h14v-1c0-3.33-3.67-5-7-5zm0 2c2.67 0 5 1.33 5 3H7c0-1.67 2.33-3 5-3z" fill="currentColor"/>
                        </svg>
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
                    <button type="submit" class="icon-button">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
                        </svg>
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
    .form-group input,
    .form-group select {
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
</style> 