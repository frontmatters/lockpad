// Deployment-level salt for Argon2id.
//
// Notes encrypted on this instance use this string as the Argon2id salt. Two
// deployments that share the same APP_KEY can in principle read each other's
// notes — useful for mirror/backup, dangerous if you want isolation.
//
// For a private deployment: set this to a random 32+ character string and keep
// it stable. Changing it invalidates every existing note on the server.
export const APP_KEY = 'lockpad/v2';
