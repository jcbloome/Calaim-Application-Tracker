const { notarize } = require("@electron/notarize");

/**
 * electron-builder afterSign hook for macOS notarization.
 * Runs only when required env vars are present.
 */
exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== "darwin") return;

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(
      "[notarize] Skipping macOS notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not fully configured."
    );
    return;
  }

  console.log(`[notarize] Notarizing ${appPath}...`);
  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log("[notarize] Notarization complete.");
};
