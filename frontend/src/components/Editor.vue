<template>
  <section class="editor-shell">
    <div class="editor-frame" :style="{ borderTopColor: noteHue }">
      <textarea
        ref="areaRef"
        v-model="text"
        class="editor-area"
        placeholder="start typing — saved automatically"
        :style="{ caretColor: noteHue }"
        @keydown="onKeydown"
      ></textarea>

      <div class="editor-statusbar">
        <div class="editor-stats">
          <span><strong>{{ wordCount }}</strong>words</span>
          <span><strong>{{ charCount }}</strong>chars</span>
          <span><strong>{{ lineCount }}</strong>lines</span>
        </div>

        <div class="editor-actions">
          <span class="save-state" :data-state="saveState">
            <span class="save-state-dot"></span>
            <span class="save-state-text">{{ saveStateText }}</span>
          </span>

          <button
            class="btn btn-danger-ghost btn-sm"
            type="button"
            :data-confirm="confirmingDelete ? 'true' : ''"
            @click="onDeleteClick"
            @blur="resetConfirm"
          >
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18"/>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
            </svg>
            <span>{{ confirmingDelete ? 'click again to confirm' : 'delete forever' }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import debounce from 'debounce';
import store from '../store';
import { SecureStorage } from '../classes/SecureStorage';

const SAVE_DEBOUNCE_MS  = 800;
const CONFIRM_TIMEOUT_MS = 3000;

export default {
  name: 'Editor',
  props: {
    noteHue: { type: String, default: '#4a8f2c' },
  },
  setup() {
    const text = ref('');
    const areaRef = ref(null);
    // 'saved' | 'saving' | 'error'
    const saveState = ref('saved');
    const saveStateText = ref('encrypted · ready');
    const confirmingDelete = ref(false);
    let confirmTimer = null;

    const charCount = computed(() => text.value.length);
    const wordCount = computed(() => {
      const t = text.value.trim();
      return t ? t.split(/\s+/).length : 0;
    });
    const lineCount = computed(() => text.value ? text.value.split('\n').length : 0);

    async function loadNote() {
      const authKey = store.getters.getAuthKey();
      const encKey  = store.getters.getEncKey();
      if (!authKey || !encKey) return;
      try {
        const decrypted = await SecureStorage.read(authKey, encKey);
        text.value = decrypted || '';
        saveState.value = 'saved';
        saveStateText.value = decrypted ? 'encrypted · loaded' : 'encrypted · empty';
      } catch (err) {
        saveState.value = 'error';
        saveStateText.value = 'could not decrypt';
        console.error('load failed:', err && err.message ? err.message : err);
      }
    }

    async function writeNow() {
      const authKey = store.getters.getAuthKey();
      const encKey  = store.getters.getEncKey();
      if (!authKey || !encKey) return;
      if (!text.value) return;
      saveState.value = 'saving';
      saveStateText.value = 'encrypting · saving';
      try {
        await SecureStorage.write(authKey, encKey, text.value);
        saveState.value = 'saved';
        saveStateText.value = 'encrypted · saved just now';
      } catch (err) {
        saveState.value = 'error';
        saveStateText.value = 'save failed';
        console.error('save failed:', err && err.message ? err.message : err);
      }
    }
    const writeLater = debounce(writeNow, SAVE_DEBOUNCE_MS);

    function onKeydown(event) {
      // Defang Ctrl/Cmd+S — saving is automatic.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        writeNow();
        return;
      }
      writeLater();
    }

    function resetConfirm() {
      if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
      confirmingDelete.value = false;
    }

    async function onDeleteClick() {
      if (confirmingDelete.value) {
        // Second click — actually delete.
        resetConfirm();
        const authKey = store.getters.getAuthKey();
        if (!authKey) return;
        try {
          await SecureStorage.remove(authKey);
        } catch (err) {
          console.error('delete failed:', err && err.message ? err.message : err);
        }
        store.actions.reset();
        return;
      }
      // First click — arm.
      confirmingDelete.value = true;
      confirmTimer = setTimeout(resetConfirm, CONFIRM_TIMEOUT_MS);
    }

    onMounted(loadNote);
    onBeforeUnmount(() => {
      resetConfirm();
      writeLater.clear && writeLater.clear();
    });

    return {
      text, areaRef,
      saveState, saveStateText,
      confirmingDelete,
      charCount, wordCount, lineCount,
      onKeydown, onDeleteClick, resetConfirm,
    };
  },
};
</script>
