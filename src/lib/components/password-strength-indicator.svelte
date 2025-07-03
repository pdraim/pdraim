<script lang="ts">
  import { validatePasswordStrength, type PasswordConstraints, DEFAULT_PASSWORD_CONSTRAINTS } from '../validation/password';

  interface $$Props {
    password: string;
    constraints?: PasswordConstraints;
    showDetails?: boolean;
  }

  let { 
    password = '', 
    constraints = DEFAULT_PASSWORD_CONSTRAINTS,
    showDetails = true 
  } = $props();

  // Reactive validation result
  let validation = $derived(validatePasswordStrength(password, constraints));

  // Get strength color and label
  function getStrengthInfo(strength: number) {
    if (strength < 30) return { color: '#ff4444', label: 'Weak', class: 'weak' };
    if (strength < 60) return { color: '#ffaa00', label: 'Fair', class: 'fair' };
    if (strength < 80) return { color: '#44aa44', label: 'Good', class: 'good' };
    return { color: '#00aa00', label: 'Strong', class: 'strong' };
  }

  let strengthInfo = $derived(getStrengthInfo(validation.strength));
</script>

<div class="password-strength-indicator">
  {#if password.length > 0}
    <!-- Strength bar -->
    <div class="strength-bar">
      <div class="strength-bar-bg">
        <div 
          class="strength-bar-fill {strengthInfo.class}" 
          style="width: {validation.strength}%; background-color: {strengthInfo.color};"
        ></div>
      </div>
      <span class="strength-label {strengthInfo.class}">{strengthInfo.label}</span>
    </div>

    {#if showDetails}
      <!-- Requirements checklist -->
      <div class="requirements-list">
        {#each validation.requirements as requirement}
          <div class="requirement {requirement.met ? 'met' : 'unmet'}">
            <span class="requirement-icon">
              {requirement.met ? '✓' : '✗'}
            </span>
            <span class="requirement-text">{requirement.message}</span>
          </div>
        {/each}
      </div>

      <!-- Error messages -->
      {#if validation.errors.length > 0}
        <div class="error-messages">
          {#each validation.errors as error}
            <div class="error-message">{error}</div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .password-strength-indicator {
    margin-top: 8px;
    font-size: 0.875rem;
  }

  .strength-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .strength-bar-bg {
    flex: 1;
    height: 6px;
    background-color: #ddd;
    border-radius: 3px;
    overflow: hidden;
  }

  .strength-bar-fill {
    height: 100%;
    transition: width 0.3s ease, background-color 0.3s ease;
    border-radius: 3px;
  }

  .strength-label {
    min-width: 50px;
    font-weight: bold;
    font-size: 0.75rem;
  }

  .strength-label.weak { color: #ff4444; }
  .strength-label.fair { color: #ffaa00; }
  .strength-label.good { color: #44aa44; }
  .strength-label.strong { color: #00aa00; }

  .requirements-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .requirement {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
  }

  .requirement-icon {
    width: 12px;
    text-align: center;
    font-weight: bold;
  }

  .requirement.met {
    color: #00aa00;
  }

  .requirement.met .requirement-icon {
    color: #00aa00;
  }

  .requirement.unmet {
    color: #888;
  }

  .requirement.unmet .requirement-icon {
    color: #ff4444;
  }

  .error-messages {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .error-message {
    color: #ff4444;
    font-size: 0.75rem;
  }

  /* Compact mode styles */
  :global(.compact) .password-strength-indicator {
    font-size: 0.75rem;
  }

  :global(.compact) .requirements-list {
    display: none;
  }

  :global(.compact) .strength-bar {
    margin-bottom: 4px;
  }
</style>