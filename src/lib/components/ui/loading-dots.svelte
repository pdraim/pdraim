<!-- A reusable loading dots component with animated dots -->
<script lang="ts">
    let { text = 'Chargement', color = 'inherit' } = $props();
</script>

<div class="loading-text" style="color: {color}">
    {text}<span class="dots"><span>.</span><span>.</span><span>.</span></span>
</div>

<style>
    .loading-text {
        display: inline-flex;
        align-items: center;
        font-size: inherit;
    }

    .dots {
        display: inline-flex;
        margin-left: 2px;
    }

    .dots span {
        animation: dots 1.5s infinite;
        opacity: 0;
    }

    .dots span:nth-child(1) {
        animation-delay: 0s;
    }

    .dots span:nth-child(2) {
        animation-delay: 0.5s;
    }

    .dots span:nth-child(3) {
        animation-delay: 1s;
    }

    @keyframes dots {
        0% {
            opacity: 0;
        }
        50% {
            opacity: 1;
        }
        100% {
            opacity: 0;
        }
    }
</style> 