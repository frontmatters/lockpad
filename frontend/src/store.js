// store.js — auth + key state.
//
// Security model:
//   - Master key, authKey, and encKey live in a *module-local closure*, never in
//     reactive state, sessionStorage, or any persisted location. XSS that reads
//     reactive state cannot reach them.
//   - On reset() we best-effort zeroize the Uint8Arrays so post-logout heap dumps
//     are less informative.
//   - urlKey (base62 of authKey) is exposed as state for routing/display only.
//     It is half the authentication material, sensitive but not catastrophic on
//     its own (server holds the other half indirectly via Argon2 cost).

import { reactive, readonly } from "vue";
import { Security } from "./classes/Security";
import { APP_KEY } from "./config";

// Closure-private — these references are never exported.
let _master  = null;
let _authKey = null;
let _encKey  = null;

const _state = reactive({
  isBusy: false,
  error: '',
  isAuthenticated: false,
  urlKey: '',
});

const enc = new TextEncoder();

const mutations = {

  async login(passphrase) {
    _state.isBusy = true;
    _state.error = '';
    try {
      // Deployment-level salt. The APP_KEY value is shared across instances that
      // want cross-deployment note compatibility (default is a fixed string).
      // For a private deployment, override APP_KEY to a random-per-host value to
      // prevent any cross-deployment dictionary work.
      const saltBytes = enc.encode(APP_KEY);

      _master = await Security.deriveMaster(passphrase, saltBytes);
      const { authKey, encKey } = await Security.splitKeys(_master);
      _authKey = authKey;
      _encKey  = encKey;

      _state.isAuthenticated = true;
      _state.urlKey = Security.base62(authKey);
    } catch (err) {
      _state.error = err.message || String(err);
      throw err;
    } finally {
      _state.isBusy = false;
    }
  },
};

const actions = {
  reset() {
    Security.zeroize(_master);
    Security.zeroize(_authKey);
    Security.zeroize(_encKey);
    _master = null;
    _authKey = null;
    _encKey = null;
    _state.isAuthenticated = false;
    _state.urlKey = '';
    _state.error = '';
  },
};

const getters = {
  // Direct refs for SecureStorage. Callers must not persist or expose these.
  getAuthKey: () => _authKey,
  getEncKey:  () => _encKey,
};

export default {
  state: readonly(_state),
  getters,
  mutations,
  actions,
};
