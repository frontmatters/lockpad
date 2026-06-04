<template>
  <header class="header">
    <div class="header-left">
      <button class="brand" type="button" @click="goHome">notepad</button>
      <span v-if="state.isAuthenticated" class="note-meta">
        <span class="note-dot" :style="{ background: noteHue }"></span>
        <span class="note-id">{{ noteIdShort }}</span>
      </span>
    </div>
    <div class="header-right">
      <ThemeToggle />
    </div>
  </header>

  <Editor v-if="state.isAuthenticated" :note-hue="noteHue" />
  <Home v-else />
</template>

<script>
import { computed } from 'vue';
import store from '../store';
import Home from './Home.vue';
import Editor from './Editor.vue';
import ThemeToggle from './ThemeToggle.vue';

export default {
  name: 'App',
  components: { Home, Editor, ThemeToggle },
  setup() {
    const state = store.state;

    // Per-note accent color derived from the urlKey (already a public
    // identifier). Deterministic so a returning user sees the same hue;
    // leaks no key material since the urlKey itself is what's sent in
    // every API request.
    const noteHue = computed(() => {
      if (!state.urlKey) return '#4a8f2c';
      let h = 0;
      for (let i = 0; i < state.urlKey.length; i++) {
        h = ((h << 5) - h + state.urlKey.charCodeAt(i)) | 0;
      }
      const r = (h & 0xff);
      const g = (h >> 8) & 0xff;
      const b = (h >> 16) & 0xff;
      return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    });

    const noteIdShort = computed(() => (state.urlKey || '').slice(0, 8));

    function goHome() {
      store.actions.reset();
    }

    return { state, noteHue, noteIdShort, goHome };
  },
};
</script>
