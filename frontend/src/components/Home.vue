<template>
  <section class="login">
    <div class="login-card">
      <div class="login-label">passphrase</div>

      <div class="login-input-wrap" :data-state="isBusy ? 'loading' : ''">
        <input
          ref="inputRef"
          v-model="passphrase"
          type="text"
          class="login-input"
          placeholder="correct horse battery staple"
          autocomplete="off"
          spellcheck="false"
          :disabled="isBusy"
          @keydown.enter="onUnlock"
        />
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
      passphrase, inputRef, state, isBusy,
      chars, words, bits, meterPct, strength, warnText,
      onUnlock,
    };
  },
};
</script>
