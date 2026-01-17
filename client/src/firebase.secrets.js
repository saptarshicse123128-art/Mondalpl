// This file is a stub that allows webpack to resolve the module during build
// The empty object is safe to commit - it contains no credentials
// In CI/production builds, Firebase configuration comes from environment variables (REACT_APP_*)
//
// For local development, you can override this file with your actual Firebase config:
// WARNING: If you add real credentials, make sure to add this file back to .gitignore!
// Export empty object so webpack can resolve this file during build
// When this file is used locally, replace {} with your actual Firebase config object
// Example:
// export default {
//   apiKey: 'your-api-key',
//   authDomain: 'your-auth-domain',
//   projectId: 'your-project-id',
//   appId: 'your-app-id',
//   // ... other config
// };

const firebaseSecrets = {};

export default firebaseSecrets;
