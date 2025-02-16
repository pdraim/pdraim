<script lang="ts">
  import { onDestroy } from 'svelte';

  // Props with defaults:
  // - text: button label when not loading (default "Envoyer")
  // - loading: indicates if the button should show a spinner (default false)
  // - spinnerChar: the character to use for the spinner animation (default '.')
  let { onclick, disabled = $bindable(false), text = 'Envoyer', loading = $bindable(false), spinnerChar = $bindable('.') } = $props();

  // Using $state for internal reactive variables.
  let animatedDots = $state(''); // will hold the animated spinner text
  let count = $state(1);
  let isDecreasing = $state(true);
  let intervalID = $state<number | null>(null);

  // Effect that starts/stops the spinner based on loading state.
  $effect(() => {
    if (loading) {
      console.debug("LoadingButton: Spinner started");
      // Immediately update spinner text to show 3 dots and start decreasing
      animatedDots = spinnerChar.repeat(3);
      count = 3;
      isDecreasing = true;
      
      if (!intervalID) {
        intervalID = window.setInterval(() => {
          // Ping-pong logic: 3,2,1,2,3...
          count = count + (isDecreasing ? -1 : 1);
          if (count <= 1) {
            count = 1;
            isDecreasing = false;
          } else if (count >= 3) {
            count = 3;
            isDecreasing = true;
          }
          animatedDots = spinnerChar.repeat(count);
          console.debug("LoadingButton: Animated dots updated to", animatedDots);
        }, 500);
      }
    } else {
      console.debug("LoadingButton: Spinner stopped");
      if (intervalID) {
        clearInterval(intervalID);
        intervalID = null;
      }
      // When not loading, display the default text.
      animatedDots = text;
    }
  });

  onDestroy(() => {
    if (intervalID) {
      console.debug("LoadingButton: onDestroy clearing interval");
      clearInterval(intervalID);
    }
  });
</script>

<button onclick={onclick} disabled={disabled}>
  {#if loading}
    <span>{animatedDots}</span>
  {:else}
    <span>{text}</span>
  {/if}
</button>

<style>
  button {
    padding: 0.5rem 1rem;
    font-size: 1rem;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
</style> 