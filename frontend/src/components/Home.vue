<template>
  <section class="login">
    <div class="login-card">
      <div class="login-label">passphrase</div>

      <div class="login-input-wrap" :data-state="isBusy ? 'loading' : ''">
        <input
          ref="inputRef"
          v-model="passphrase"
          :type="reveal ? 'text' : 'password'"
          class="login-input"
          placeholder="correct horse battery staple"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          :disabled="isBusy"
          @keydown.enter="onUnlock"
        />
        <button
          type="button"
          class="login-reveal"
          :aria-label="reveal ? 'Hide passphrase' : 'Show passphrase'"
          :aria-pressed="reveal"
          tabindex="-1"
          @click="reveal = !reveal"
        >
          <svg v-if="!reveal" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        </button>
        <div class="scrypt-progress" aria-hidden="true"></div>
      </div>

      <div class="login-meter">
        <span><strong>{{ chars }}</strong>chars</span>
        <span><strong>{{ words }}</strong>words</span>
        <span><strong>{{ bits }}</strong>bits</span>
        <div class="meter-bar">
          <div
            class="meter-bar-fill"
            :data-strength="strength"
            :style="{ width: meterPct + '%' }"
          ></div>
        </div>
      </div>

      <div
        class="login-warn"
        :class="{ 'is-visible': warnText !== '' }"
        :data-strength="strength"
      >{{ warnText }}</div>

      <div v-if="state.error" class="login-error">{{ state.error }}</div>

      <div class="login-actions">
        <span class="login-meta"><strong>argon2id</strong> · client-side derivation</span>
        <button class="btn" type="button" :data-state="isBusy ? 'loading' : ''" :disabled="isBusy" @click="onUnlock">
          <template v-if="!isBusy">unlock</template>
          <template v-else>
            <span>computing</span>
            <span class="btn-loader" aria-hidden="true">
              <span></span><span></span><span></span>
            </span>
          </template>
        </button>
      </div>

      <div class="login-hint">
        Your passphrase is your only login. Lose it and the notes are unrecoverable:
        no account, no email, no reset. Make it at least 4 words and don't reuse
        anything you've typed elsewhere. The key is derived in your browser via
        <code>argon2id</code>; the encryption key never leaves this tab.
      </div>
    </div>
  </section>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import store from '../store';

export default {
  name: 'Home',
  setup() {
    const passphrase = ref('');
    const inputRef = ref(null);
    const reveal = ref(false);
    const state = store.state;
    const isBusy = computed(() => state.isBusy);

    const chars = computed(() => passphrase.value.length);
    const words = computed(() => {
      const t = passphrase.value.trim();
      return t ? t.split(/\s+/).length : 0;
    });
    // English-dictionary entropy estimate: log2(30000) ≈ 14.9 bits per word.
    // Less defensible than zxcvbn but cheap, deterministic, and good enough
    // to drive the visual meter.
    const bits = computed(() => Math.round(words.value * 14.9));

    const meterPct = computed(() => Math.min(100, bits.value));
    const strength = computed(() => {
      if (bits.value < 40) return 'weak';
      if (bits.value < 60) return 'medium';
      return 'strong';
    });
    const warnText = computed(() => {
      if (bits.value === 0) return '';
      if (bits.value < 40) return 'weak — 4+ words recommended';
      if (bits.value < 60) return 'okay — longer is safer';
      return '';
    });

    onMounted(() => inputRef.value && inputRef.value.focus());

    async function onUnlock() {
      if (isBusy.value) return;
      if (passphrase.value.length === 0) return;
      try {
        await store.mutations.login(passphrase.value);
      } catch {
        // store sets state.error; nothing else to do here.
      }
    }

    return {
      passphrase, inputRef, reveal, state, isBusy,
      chars, words, bits, meterPct, strength, warnText,
      onUnlock,
    };
  },
};
</script>
