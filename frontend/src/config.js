// Deployment-level salt for Argon2id.
//
// Notes encrypted on this instance use this string as the Argon2id salt. Two
// deployments that share the same APP_KEY can in principle read each other's
// notes — useful for mirror/backup, dangerous if you want isolation.
//
// For a private deployment: set this to a random 32+ character string and keep
// it stable. Changing it invalidates every existing note on the server.
//
// For the publicly shared image: the upstream-compatibility value "notepad.mx"
// is intentionally NOT preserved here, since upstream's crypto envelope is also
// not compatible (see CHANGELOG.md, breaking change).
export const APP_KEY = 'notepad-secure/v2';

// Header banner — kept as empty string until Phase 4 redesign replaces App.vue.
// (Upstream rendered marketing copy here via v-html, an XSS surface.)
export const HEADER_TEXT = '';
