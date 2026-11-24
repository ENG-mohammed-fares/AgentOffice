'use strict';
// A downloaded update must never interrupt an authenticated workspace or an auth flow.
function mayAutoRestart({ready,configured,installing,authSafe,idleSeconds,readySeconds}) {
  return ready === true && configured === true && installing === false &&
    authSafe === true && Number.isFinite(idleSeconds) && idleSeconds >= 120 &&
    Number.isFinite(readySeconds) && readySeconds >= 15;
}
// All explicit update installs use the silent NSIS path. The updater's built-in
// normal-quit hook also installs silently, without relaunching after a user exit.
function installSilently(updater, relaunch = true) {
  updater.quitAndInstall(true, relaunch === true);
}
module.exports = { mayAutoRestart, installSilently };
