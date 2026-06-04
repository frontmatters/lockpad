<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'"
    @click="toggle"
  >
    <!-- Sun icon: visible in light mode, fades out in dark. -->
    <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2"  x2="12" y2="4"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="2"  y1="12" x2="4"  y2="12"/>
      <line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.9"  y1="4.9"  x2="6.3"  y2="6.3"/>
      <line x1="17.7" y1="17.7" x2="19.1" y2="19.1"/>
      <line x1="4.9"  y1="19.1" x2="6.3"  y2="17.7"/>
      <line x1="17.7" y1="6.3"  x2="19.1" y2="4.9"/>
    </svg>
    <!-- Moon icon: visible in dark mode. Crescent path. -->
    <svg class="icon-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  </button>
</template>

<script>
import { ref, onMounted } from 'vue';

const STORAGE_KEY = 'notepad-secure/theme';

export default {
  name: 'ThemeToggle',
  setup() {
    const theme = ref('light');

    function apply(t) {
      document.documentElement.dataset.theme = t;
      theme.value = t;
    }

    onMounted(() => {
      // 1. Explicit user preference wins.
      let saved = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch {}
      if (saved === 'light' || saved === 'dark') {
        apply(saved);
        return;
      }
      // 2. Otherwise follow OS preference.
      const prefersDark = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      apply(prefersDark ? 'dark' : 'light');
    });

    function toggle(event) {
      const next = theme.value === 'light' ? 'dark' : 'light';

      // Capture click position for the View Transition circular reveal.
      // Fall back to the button's center if event coordinates are unavailable
      // (e.g. keyboard activation via Enter/Space).
      const target = event.currentTarget;
      const r = target.getBoundingClientRect();
      const x = (event.clientX || (r.left + r.width / 2));
      const y = (event.clientY || (r.top + r.height / 2));
      document.documentElement.style.setProperty('--theme-x', x + 'px');
      document.documentElement.style.setProperty('--theme-y', y + 'px');

      const swap = () => {
        apply(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      };

      const reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (document.startViewTransition && !reduceMotion) {
        document.startViewTransition(swap);
      } else {
        swap();
      }
    }

    return { theme, toggle };
  },
};
</script>
